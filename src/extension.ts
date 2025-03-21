import {
    commands,
    ExtensionContext,
    window,
    workspace,
    Uri,
    Position,
    Range,
    ThemeColor,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    CancellationToken,
    Disposable,
    Selection,
} from 'vscode';
import * as path from 'path';
import ignore from 'ignore';
import { minimatch } from 'minimatch';

// Тип для хранения результатов поиска
interface SearchBuffer {
    id: number;
    files: Uri[];
    searchPattern: string;
}

// Глобальное состояние поиска
let searchState = {
    currentFiles: [] as Uri[],
    buffers: [] as SearchBuffer[],
    activeBufferId: -1,
    webviewView: undefined as WebviewView | undefined,
};

// Добавляем переменную для хранения результатов поиска
let searchResults: Array<{
    filePath: string;
    matches: Array<{
        lineNumber: number;
        previewText: string;
        matchStartColumn: number;
        matchEndColumn: number;
    }>;
    displayPath: string;
}> = [];

// В начале файла, где определены другие глобальные переменные
let searchText = ''; // Добавляем переменную для хранения текущего поискового запроса

// Кэш для содержимого файлов
const fileContentCache = new Map<
    string,
    {
        content: string;
        timestamp: number;
    }
>();

// Максимальное время жизни кэша (5 минут)
const CACHE_TTL = 5 * 60 * 1000;

let currentSearchAbortController: AbortController | null = null;

async function getFileContent(fileUri: Uri): Promise<string> {
    const filePath = fileUri.fsPath;
    const now = Date.now();
    const cached = fileContentCache.get(filePath);

    if (cached && now - cached.timestamp < CACHE_TTL) {
        return cached.content;
    }

    const document = await workspace.openTextDocument(fileUri);
    const content = document.getText();

    fileContentCache.set(filePath, {
        content,
        timestamp: now,
    });

    return content;
}

// Провайдер для WebviewView
class SequentialSearchViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'sequentialSearcher.searchView';
    private _view?: WebviewView;
    private _disposables: Disposable[] = [];

    constructor(private readonly _extensionContext: ExtensionContext) {}

    public resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        token: CancellationToken,
    ) {
        this._view = webviewView;
        searchState.webviewView = webviewView;

        // Устанавливаем retainContextWhenHidden для самого webviewView
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionContext.extensionUri],
        };

        webviewView.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'search':
                        await performSearch(
                            message.searchText,
                            message.isExclude,
                            message.searchInFileNames,
                            message.caseSensitive,
                            message.useRegex,
                        );
                        break;
                    case 'saveBuffer':
                        saveCurrentResultsToBuffer();
                        break;
                    case 'activateBuffer':
                        activateBuffer(message.bufferId);
                        break;
                    case 'clearAllBuffers':
                        await commands.executeCommand('searcher.clearAllBuffers');
                        break;
                    case 'openFile':
                        await commands.executeCommand(
                            'searcher.openFile',
                            message.filePath,
                            message.searchText,
                            message.lineNumber,
                        );
                        break;
                    case 'getState':
                        // Отправляем текущее состояние в webview
                        const serializedState = {
                            currentFiles: searchState.currentFiles.map(uri => uri.fsPath),
                            buffers: searchState.buffers.map(buffer => ({
                                id: buffer.id,
                                files: buffer.files.map(uri => uri.fsPath),
                                searchPattern: buffer.searchPattern,
                            })),
                            activeBufferId: searchState.activeBufferId,
                        };

                        searchState.webviewView?.webview.postMessage({
                            type: 'updateState',
                            state: serializedState,
                        });
                        break;
                    case 'error':
                        console.error('Webview error:', message.message);
                        if (message.error) {
                            console.error(message.error);
                        }
                        if (message.source) {
                            console.error('Source:', message.source);
                        }
                        break;
                }
            },
            undefined,
            this._disposables,
        );

        updateWebviewContent();
    }

    public dispose() {
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Sequential Searcher extension is now active');

    // Регистрация провайдера для WebviewView
    const provider = new SequentialSearchViewProvider(context);
    context.subscriptions.push(
        window.registerWebviewViewProvider(SequentialSearchViewProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
    );

    // Команда для фокусирования на панели поиска
    const focusSearchViewCommand = commands.registerCommand(
        'searcher.focusSearchView',
        async () => {
            // Показать панель поиска и сфокусироваться на ней
            await commands.executeCommand('sequential-searcher.focus');
        },
    );

    // Команда для очистки всех буферов
    const clearAllBuffersCommand = commands.registerCommand('searcher.clearAllBuffers', () => {
        searchState.buffers = [];
        searchState.activeBufferId = -1;
        searchState.currentFiles = [];
        searchResults = []; // Очищаем результаты поиска

        const serializedState = {
            results: [],
            buffers: [],
            activeBufferId: -1,
        };

        searchState.webviewView?.webview.postMessage({
            type: 'updateState',
            state: serializedState,
        });
    });

    // Команда для открытия файла из результатов поиска
    const openFileCommand = commands.registerCommand(
        'searcher.openFile',
        async (filePath: string, searchText: string, lineNumber?: number) => {
            try {
                const fileUri = Uri.file(filePath);
                const document = await workspace.openTextDocument(fileUri);
                const editor = await window.showTextDocument(document);

                if (lineNumber) {
                    // Если указан номер строки, переходим к ней
                    const position = new Position(lineNumber - 1, 0);
                    editor.selection = new Selection(position, position);
                    editor.revealRange(new Range(position, position));
                } else {
                    // Иначе ищем все совпадения в документе
                    const text = document.getText();
                    let searchRegex;
                    try {
                        searchRegex = new RegExp(searchText, 'gi');
                    } catch (regexError) {
                        searchRegex = new RegExp(escapeRegExp(searchText), 'gi');
                    }

                    let match;
                    const ranges: Range[] = [];

                    while ((match = searchRegex.exec(text)) !== null) {
                        const startPos = document.positionAt(match.index);
                        const endPos = document.positionAt(match.index + match[0].length);
                        ranges.push(new Range(startPos, endPos));
                    }

                    if (ranges.length > 0) {
                        // Подсветить все вхождения
                        editor.setDecorations(
                            window.createTextEditorDecorationType({
                                backgroundColor: new ThemeColor(
                                    'editor.findMatchHighlightBackground',
                                ),
                                overviewRulerColor: new ThemeColor(
                                    'editor.findMatchHighlightBackground',
                                ),
                                overviewRulerLane: 4,
                            }),
                            ranges,
                        );
                    }
                }
            } catch (error) {
                console.error('Error opening file:', error);
                window.showErrorMessage(`Failed to open file: ${error}`);
            }
        },
    );

    context.subscriptions.push(focusSearchViewCommand, clearAllBuffersCommand, openFileCommand);
}

// Обновление содержимого webview
function updateWebviewContent() {
    if (!searchState.webviewView) {
        console.error('updateWebviewContent: webviewView is undefined');
        return;
    }

    // Получаем путь к файлам React
    const extensionUri = searchState.webviewView.webview.options.localResourceRoots?.[0];
    if (!extensionUri) {
        console.error('updateWebviewContent: extensionUri is undefined');
        return;
    }

    try {
        // Создаем HTML для React приложения
        const scriptUri = searchState.webviewView.webview.asWebviewUri(
            Uri.joinPath(extensionUri, 'dist', 'webview.js'),
        );
        const styleUri = searchState.webviewView.webview.asWebviewUri(
            Uri.joinPath(extensionUri, 'dist', 'webview.css'),
        );

        searchState.webviewView.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sequential Search</title>
                <link rel="stylesheet" href="${styleUri}">
            </head>
            <body>
                <div id="root"></div>
                <script>
                    const vscode = acquireVsCodeApi();

                    // Восстанавливаем состояние из хранилища VS Code
                    const previousState = vscode.getState();
                    if (previousState) {
                        // Используем сохраненное состояние
                        vscode.setState(previousState);
                    } else {
                        // Инициализируем новое состояние
                        vscode.setState({
                            searchText: '',
                            isExclude: false,
                            searchInFileNames: false,
                            searchState: {
                                results: [],
                                buffers: [],
                                activeBufferId: -1,
                            }
                        });
                    }

                    // Добавляем обработчик ошибок
                    window.onerror = function(message, source, lineno, colno, error) {
                        vscode.postMessage({
                            command: 'error',
                            message: message,
                            source: source,
                            error: error ? error.stack : null
                        });
                        return true;
                    };

                    // Перехватываем ошибки в промисах
                    window.addEventListener('unhandledrejection', function(event) {
                        vscode.postMessage({
                            command: 'error',
                            message: 'Unhandled Promise Rejection',
                            error: event.reason ? (event.reason.stack || event.reason.toString()) : null
                        });
                    });
                </script>
                <script src="${scriptUri}"></script>
            </body>
            </html>
        `;
    } catch (error) {
        console.error('Error updating webview content:', error);
    }
}

// Выполнение поиска
async function performSearch(
    searchText: string,
    isExclude: boolean = false,
    searchInFileNames: boolean = false,
    caseSensitive: boolean = false,
    useRegex: boolean = false,
): Promise<void> {
    // Отменяем предыдущий поиск
    if (currentSearchAbortController) {
        currentSearchAbortController.abort();
    }

    currentSearchAbortController = new AbortController();
    const { signal } = currentSearchAbortController;

    try {
        // Сохраняем текущий поисковый запрос
        searchText = searchText;

        // Определить, где искать
        let filesToSearch: Uri[];

        if (searchState.activeBufferId >= 0) {
            // Искать в активном буфере
            const activeBuffer = searchState.buffers.find(b => b.id === searchState.activeBufferId);
            if (activeBuffer) {
                filesToSearch = activeBuffer.files;
            } else {
                throw new Error('Active buffer not found');
            }
        } else {
            // Получаем настройки исключений из VS Code
            const searchExclude = workspace.getConfiguration('search').get('exclude') as Record<
                string,
                boolean
            >;

            // Преобразуем объект исключений в массив паттернов
            const excludePatterns = Object.entries(searchExclude)
                .filter(([_, enabled]) => enabled)
                .map(([pattern]) => pattern);

            // Добавляем стандартные исключения
            const defaultExcludes = [
                '**/node_modules/**',
                '**/.venv/**',
                '**/.vscode/**',
                '**/.idea/**',
                '**/.settings/**',
                '**/package-lock.json',
                '**/yarn.lock',
                '**/pnpm-lock.yaml',
            ];

            excludePatterns.push(...defaultExcludes);

            // Создаем экземпляр ignore
            const ig = ignore();

            // Пытаемся прочитать .gitignore
            const workspaceFolders = workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const gitignorePath = path.join(workspaceFolders[0].uri.fsPath, '.gitignore');
                try {
                    await workspace.fs.stat(Uri.file(gitignorePath));
                    const gitignoreContent = await workspace.fs.readFile(Uri.file(gitignorePath));
                    const gitignoreRules = Buffer.from(gitignoreContent).toString('utf8');

                    // Добавляем правила из .gitignore
                    ig.add(gitignoreRules);

                    // Получаем все файлы
                    const allFiles = await workspace.findFiles('**/*');

                    // Фильтруем файлы согласно правилам .gitignore и search.exclude
                    filesToSearch = allFiles.filter(file => {
                        const relativePath = workspace.asRelativePath(file);

                        // Проверяем паттерны из search.exclude
                        const isExcludedBySearchConfig = excludePatterns.some(pattern =>
                            minimatch(relativePath, pattern, { dot: true }),
                        );

                        // Проверяем правила из .gitignore
                        const isExcludedByGitignore = ig.ignores(relativePath);

                        return !isExcludedBySearchConfig && !isExcludedByGitignore;
                    });
                } catch {
                    // Если .gitignore не найден, используем только search.exclude
                    console.log('No .gitignore file found or unable to read it');
                    filesToSearch = await workspace.findFiles(
                        '**/*',
                        `{${excludePatterns.join(',')}}`,
                    );
                }
            } else {
                filesToSearch = await workspace.findFiles('**/*', `{${excludePatterns.join(',')}}`);
            }
        }

        // Показать индикатор прогресса
        await window.withProgress(
            {
                location: { viewId: 'sequentialSearcher.searchView' },
                title: `${isExclude ? 'Excluding' : 'Searching for'} "${searchText}"...`,
            },
            async () => {
                // Сортируем файлы перед поиском для стабильного порядка
                const sortedFilesToSearch = filesToSearch;
                // const sortedFilesToSearch = [...filesToSearch].sort((a, b) =>
                //     a.fsPath.localeCompare(b.fsPath),
                // );

                // Компилируем регулярное выражение или подготавливаем текст для поиска
                let searchRegex;
                let searchLower;

                if (useRegex) {
                    try {
                        searchRegex = new RegExp(searchText, caseSensitive ? 'g' : 'gi');
                    } catch (regexError) {
                        window.showErrorMessage('Invalid regular expression');
                        return;
                    }
                } else if (!caseSensitive) {
                    searchLower = searchText.toLowerCase();
                }

                // Разбиваем файлы на чанки для параллельной обработки
                const chunkSize = 100;
                const chunks = [];
                for (let i = 0; i < sortedFilesToSearch.length; i += chunkSize) {
                    chunks.push(sortedFilesToSearch.slice(i, i + chunkSize));
                }

                const BATCH_SIZE = 20;
                let processedResults = 0;
                const results = [];

                for (const chunk of chunks) {
                    if (signal.aborted) {
                        throw new Error('Search cancelled');
                    }
                    const chunkResults = await processChunk(
                        chunk,
                        searchText,
                        searchRegex,
                        searchLower,
                        isExclude,
                        searchInFileNames,
                        caseSensitive,
                    );
                    results.push(chunkResults);

                    // Отправляем результаты батчами
                    processedResults += chunkResults.results.length;
                    if (processedResults >= BATCH_SIZE) {
                        // Собираем все результаты до текущего момента
                        const currentResults = results.flatMap(r => r.results);

                        searchState.webviewView?.webview.postMessage({
                            type: 'updateState',
                            state: {
                                results: currentResults,
                                buffers: searchState.buffers.map(buffer => ({
                                    id: buffer.id,
                                    files: buffer.files.map(uri => uri.fsPath),
                                    searchPattern: buffer.searchPattern,
                                })),
                                activeBufferId: searchState.activeBufferId,
                                isPartialResult: true,
                            },
                        });

                        // Сбрасываем счетчик
                        processedResults = 0;
                    }
                }

                // Объединяем результаты (используем уже объявленные переменные)
                searchResults = results.flatMap(r => r.results);
                searchState.currentFiles = results.flatMap(r => r.matchedFiles);

                // Сортируем результаты поиска
                searchResults.sort((a, b) => a.filePath.localeCompare(b.filePath));

                // Обновляем состояние поиска и сохраняем результаты
                searchState.currentFiles = searchResults.map(r => Uri.file(r.filePath));

                // Отправляем результаты в webview
                const serializedState = {
                    results: searchResults,
                    buffers: searchState.buffers.map(buffer => ({
                        id: buffer.id,
                        files: buffer.files.map(uri => uri.fsPath),
                        searchPattern: buffer.searchPattern,
                    })),
                    activeBufferId: searchState.activeBufferId,
                };

                searchState.webviewView?.webview.postMessage({
                    type: 'updateState',
                    state: serializedState,
                });
            },
        );
    } catch (error) {
        if (error instanceof Error && error.message === 'Search cancelled') {
            console.log('Search was cancelled');
            return;
        }
        console.error('Search error:', error);
        window.showErrorMessage(`Search failed: ${error}`);
    }
}

// Сохранение текущих результатов в новый буфер
function saveCurrentResultsToBuffer(): void {
    if (searchState.currentFiles.length === 0) {
        window.showWarningMessage('No search results to save');
        return;
    }

    // Найти максимальный ID буфера
    const maxId =
        searchState.buffers.length > 0 ? Math.max(...searchState.buffers.map(b => b.id)) : -1;

    // Создать новый буфер
    const newBuffer: SearchBuffer = {
        id: maxId + 1,
        files: [...searchState.currentFiles],
        searchPattern: searchText, // Сохраняем текущий поисковый запрос
    };

    searchState.buffers.push(newBuffer);
    searchState.activeBufferId = newBuffer.id;

    // Отправляем обновленное состояние через postMessage
    const serializedState = {
        results: searchResults, // Отправляем текущие результаты поиска
        buffers: searchState.buffers.map(buffer => ({
            id: buffer.id,
            files: buffer.files.map(uri => uri.fsPath),
            searchPattern: buffer.searchPattern,
        })),
        activeBufferId: searchState.activeBufferId,
    };

    searchState.webviewView?.webview.postMessage({
        type: 'updateState',
        state: serializedState,
    });
}

// Активация буфера
function activateBuffer(bufferId: number): void {
    const buffer = searchState.buffers.find(b => b.id === bufferId);

    if (!buffer) {
        window.showErrorMessage(`Buffer ${bufferId} not found`);
        return;
    }

    searchState.activeBufferId = bufferId;
    searchState.currentFiles = [...buffer.files];

    // Создаем результаты для отображения файлов из буфера
    const bufferResults = buffer.files.map(uri => ({
        filePath: uri.fsPath,
        displayPath: './' + workspace.asRelativePath(uri),
        matches: [
            {
                lineNumber: 1,
                previewText: './' + workspace.asRelativePath(uri),
                matchStartColumn: 0,
                matchEndColumn: workspace.asRelativePath(uri).length + 2,
            },
        ],
    }));

    // Отправляем обновленное состояние через postMessage
    const serializedState = {
        results: bufferResults, // Отправляем результаты вместо пустого массива
        buffers: searchState.buffers.map(buffer => ({
            id: buffer.id,
            files: buffer.files.map(uri => uri.fsPath),
            searchPattern: buffer.searchPattern,
        })),
        activeBufferId: searchState.activeBufferId,
    };

    searchState.webviewView?.webview.postMessage({
        type: 'updateState',
        state: serializedState,
    });
}

// Экранирование специальных символов в регулярных выражениях
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Функция для проверки, является ли файл бинарным на основе расширения
function isBinaryPath(filePath: string): boolean {
    // Список расширений бинарных файлов
    const binaryExtensions = [
        // Изображения
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.bmp',
        '.ico',
        '.webp',
        '.tiff',
        '.svg',
        // Аудио
        '.mp3',
        '.wav',
        '.ogg',
        '.flac',
        '.aac',
        // Видео
        '.mp4',
        '.avi',
        '.mov',
        '.wmv',
        '.flv',
        '.webm',
        // Архивы
        '.zip',
        '.rar',
        '.7z',
        '.tar',
        '.gz',
        '.bz2',
        // Документы
        '.pdf',
        '.doc',
        '.docx',
        '.xls',
        '.xlsx',
        '.ppt',
        '.pptx',
        // Исполняемые файлы
        '.exe',
        '.dll',
        '.so',
        '.dylib',
        // Другие бинарные форматы
        '.bin',
        '.dat',
        '.db',
        '.sqlite',
        '.vsix',
    ];

    const extension = path.extname(filePath).toLowerCase();
    return binaryExtensions.includes(extension);
}

// Добавляем перед функцией performSearch
async function processChunk(
    chunk: Uri[],
    searchText: string,
    searchRegex: RegExp | undefined,
    searchLower: string | undefined,
    isExclude: boolean,
    searchInFileNames: boolean,
    caseSensitive: boolean,
) {
    const chunkResults = [];
    const chunkMatchedFiles = [];

    for (const fileUri of chunk) {
        try {
            let hasMatch = false;
            const fileMatches = [];

            if (searchInFileNames) {
                const relativePath = workspace.asRelativePath(fileUri);
                if (searchRegex) {
                    hasMatch = searchRegex.test(relativePath);
                    searchRegex.lastIndex = 0;
                } else if (!caseSensitive) {
                    hasMatch = relativePath.toLowerCase().includes(searchLower!);
                } else {
                    hasMatch = relativePath.includes(searchText);
                }

                // Добавляем совпадение для файла, если он найден и это не исключающий поиск
                if ((hasMatch && !isExclude) || (!hasMatch && isExclude)) {
                    fileMatches.push({
                        lineNumber: 1,
                        previewText: relativePath,
                        matchStartColumn: 0,
                        matchEndColumn: relativePath.length,
                    });
                }
            } else {
                const content = await getFileContent(fileUri);
                if (!isBinaryPath(fileUri.fsPath)) {
                    if (searchRegex) {
                        searchRegex.lastIndex = 0;
                        let match;
                        while ((match = searchRegex.exec(content)) !== null) {
                            hasMatch = true;
                            if (!isExclude) {
                                const lines = content.slice(0, match.index).split('\n');
                                const lineNumber = lines.length;
                                const lineStart = content.lastIndexOf('\n', match.index) + 1;
                                const lineEnd = content.indexOf('\n', match.index);
                                const line = content.slice(
                                    lineStart,
                                    lineEnd === -1 ? undefined : lineEnd,
                                );

                                fileMatches.push({
                                    lineNumber,
                                    previewText: line,
                                    matchStartColumn: match.index - lineStart,
                                    matchEndColumn: match.index - lineStart + match[0].length,
                                });
                            }
                        }
                    } else {
                        const searchContent = caseSensitive ? content : content.toLowerCase();
                        const searchFor = caseSensitive ? searchText : searchText.toLowerCase();
                        hasMatch = searchContent.includes(searchFor);

                        // Добавляем совпадения только если это не исключающий поиск
                        if (hasMatch && !isExclude) {
                            let pos = 0;
                            while ((pos = searchContent.indexOf(searchFor, pos)) !== -1) {
                                const lines = content.slice(0, pos).split('\n');
                                const lineNumber = lines.length;
                                const lineStart = content.lastIndexOf('\n', pos) + 1;
                                const lineEnd = content.indexOf('\n', pos);
                                const line = content.slice(
                                    lineStart,
                                    lineEnd === -1 ? undefined : lineEnd,
                                );

                                fileMatches.push({
                                    lineNumber,
                                    previewText: line,
                                    matchStartColumn: pos - lineStart,
                                    matchEndColumn: pos - lineStart + searchText.length,
                                });
                                pos += searchFor.length;
                            }
                        }
                    }
                }
            }

            // Добавляем файл в результаты, если:
            // 1. Найдено совпадение и это не исключающий поиск, ИЛИ
            // 2. Не найдено совпадение и это исключающий поиск
            if ((hasMatch && !isExclude) || (!hasMatch && isExclude)) {
                chunkMatchedFiles.push(fileUri);
                if (!isExclude && fileMatches.length > 0) {
                    chunkResults.push({
                        filePath: fileUri.fsPath,
                        matches: fileMatches,
                        displayPath: './' + workspace.asRelativePath(fileUri),
                    });
                } else if (isExclude && !hasMatch) {
                    // Добавляем файл в результаты для исключающего поиска
                    chunkResults.push({
                        filePath: fileUri.fsPath,
                        matches: [
                            {
                                lineNumber: 1,
                                previewText: 'File does not contain search pattern',
                                matchStartColumn: 0,
                                matchEndColumn: 0,
                            },
                        ],
                        displayPath: './' + workspace.asRelativePath(fileUri),
                    });
                }
            }
        } catch (err) {
            console.error(`Error processing file ${fileUri.fsPath}:`, err);
        }
    }

    return { results: chunkResults, matchedFiles: chunkMatchedFiles };
}

// This method is called when your extension is deactivated
export function deactivate() {}
