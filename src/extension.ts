// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
    commands,
    ExtensionContext,
    window,
    workspace,
    Uri,
    ViewColumn,
    WebviewPanel,
    TextDocument,
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
        window.registerWebviewViewProvider(SequentialSearchViewProvider.viewType, provider),
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
        updateWebviewContent();
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
        // Преобразуем URI файлов в строки для передачи в React
        const serializedState = {
            currentFiles: searchState.currentFiles.map(uri => uri.fsPath),
            results: [], // Добавляем пустой массив результатов, если их нет
            buffers: searchState.buffers.map(buffer => ({
                id: buffer.id,
                files: buffer.files.map(uri => uri.fsPath),
                searchPattern: buffer.searchPattern,
            })),
            activeBufferId: searchState.activeBufferId,
        };

        console.log('Updating webview with state:', serializedState);

        // Создаем HTML для React приложения
        const scriptUri = searchState.webviewView.webview.asWebviewUri(
            Uri.joinPath(extensionUri, 'dist', 'webview.js'),
        );
        const styleUri = searchState.webviewView.webview.asWebviewUri(
            Uri.joinPath(extensionUri, 'dist', 'webview.css'),
        );

        console.log('Script URI:', scriptUri.toString());
        console.log('Style URI:', styleUri.toString());

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
                    // Вызываем API только один раз и сохраняем в глобальную переменную
                    const vscode = acquireVsCodeApi();

                    // Инициализируем состояние
                    vscode.setState(${JSON.stringify(serializedState)});

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
): Promise<void> {
    try {
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
            // Искать во всех файлах проекта
            filesToSearch = await workspace.findFiles('**/*', '**/node_modules/**');
        }

        // Показать индикатор прогресса
        await window.withProgress(
            {
                location: { viewId: 'sequentialSearcher.searchView' },
                title: `${isExclude ? 'Excluding' : 'Searching for'} "${searchText}"...`,
            },
            async () => {
                // Массив для хранения результатов
                const matchedFiles: Uri[] = [];
                const searchResults: any[] = [];

                // Создать регулярное выражение для поиска
                let searchRegex;
                try {
                    searchRegex = new RegExp(searchText, 'gi'); // Используем 'g' для поиска всех совпадений
                } catch (regexError) {
                    // Если регулярное выражение некорректно, используем его как обычный текст
                    searchRegex = new RegExp(escapeRegExp(searchText), 'gi');
                }

                // Обрабатываем каждый файл
                for (const fileUri of filesToSearch) {
                    try {
                        let hasMatch = false;
                        const fileMatches = [];

                        if (searchInFileNames) {
                            // Поиск по имени файла (включая путь)
                            const relativePath = workspace.asRelativePath(fileUri);
                            hasMatch = searchRegex.test(relativePath);

                            if (hasMatch && !isExclude) {
                                // Для поиска по имени файла добавляем одно совпадение
                                fileMatches.push({
                                    lineNumber: 1,
                                    previewText: relativePath,
                                    matchStartColumn: relativePath.indexOf(searchText),
                                    matchEndColumn:
                                        relativePath.indexOf(searchText) + searchText.length,
                                });
                            }
                        } else {
                            // Проверяем, является ли файл бинарным
                            if (isBinaryPath(fileUri.fsPath)) {
                                // Пропускаем бинарные файлы при поиске по содержимому
                                continue;
                            }

                            try {
                                // Поиск по содержимому файла
                                const document = await workspace.openTextDocument(fileUri);
                                const content = document.getText();

                                // Сбрасываем lastIndex для повторного использования регулярного выражения
                                searchRegex.lastIndex = 0;

                                let match;
                                while ((match = searchRegex.exec(content)) !== null) {
                                    hasMatch = true;

                                    if (!isExclude) {
                                        const matchPosition = document.positionAt(match.index);
                                        const lineNumber = matchPosition.line + 1;
                                        const line = document.lineAt(matchPosition.line).text;

                                        // Получаем позиции начала и конца совпадения в строке
                                        const startPos = document.positionAt(match.index);
                                        const endPos = document.positionAt(
                                            match.index + match[0].length,
                                        );

                                        fileMatches.push({
                                            lineNumber,
                                            previewText: line,
                                            matchStartColumn: startPos.character,
                                            matchEndColumn: endPos.character,
                                        });
                                    }
                                }
                            } catch (docError) {
                                // Если не удалось открыть файл как текстовый, считаем его бинарным и пропускаем
                                console.log(
                                    `Skipping binary or inaccessible file: ${fileUri.fsPath}`,
                                );
                                continue;
                            }
                        }

                        // Добавляем файл в результаты в зависимости от типа поиска
                        if ((hasMatch && !isExclude) || (!hasMatch && isExclude)) {
                            matchedFiles.push(fileUri);

                            if (!isExclude && fileMatches.length > 0) {
                                searchResults.push({
                                    filePath: fileUri.fsPath,
                                    matches: fileMatches,
                                });
                            } else if (isExclude) {
                                // Для исключающего поиска добавляем файл без совпадений
                                searchResults.push({
                                    filePath: fileUri.fsPath,
                                    matches: [
                                        {
                                            lineNumber: 1,
                                            previewText: 'File excluded from search',
                                            matchStartColumn: 0,
                                            matchEndColumn: 0,
                                        },
                                    ],
                                });
                            }
                        }
                    } catch (err) {
                        console.error(`Error processing file ${fileUri.fsPath}:`, err);
                    }
                }

                // Обновляем состояние поиска
                searchState.currentFiles = matchedFiles;

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

    // Получить текущий поисковый запрос из webview
    let searchPattern = '';

    if (searchState.webviewView) {
        // Мы не можем напрямую получить значения из webview, поэтому используем последний поисковый запрос
        searchPattern = 'Last search';
    }

    // Создать новый буфер
    const newBuffer: SearchBuffer = {
        id: maxId + 1,
        files: [...searchState.currentFiles],
        searchPattern,
    };

    searchState.buffers.push(newBuffer);
    searchState.activeBufferId = newBuffer.id;

    updateWebviewContent();
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

    updateWebviewContent();
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

// This method is called when your extension is deactivated
export function deactivate() {}
