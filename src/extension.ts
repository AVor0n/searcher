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
    Selection,
} from 'vscode';

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
    webviewPanel: undefined as WebviewPanel | undefined,
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Sequential Searcher extension is now active');

    // Команда для открытия панели поиска
    const openSearchPanelCommand = commands.registerCommand('searcher.startSearch', () => {
        if (searchState.webviewPanel) {
            searchState.webviewPanel.reveal();
        } else {
            createSearchPanel(context);
        }
    });

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
        async (filePath: string, searchText: string) => {
            try {
                const fileUri = Uri.file(filePath);
                const document = await workspace.openTextDocument(fileUri);
                const editor = await window.showTextDocument(document);

                // Найти все вхождения текста поиска в документе
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
                    // Выделить первое вхождение
                    editor.selection = new Selection(ranges[0].start, ranges[0].end);
                    editor.revealRange(ranges[0]);

                    // Подсветить все вхождения
                    editor.setDecorations(
                        window.createTextEditorDecorationType({
                            backgroundColor: new ThemeColor('editor.findMatchHighlightBackground'),
                            overviewRulerColor: new ThemeColor(
                                'editor.findMatchHighlightBackground',
                            ),
                            overviewRulerLane: 4,
                        }),
                        ranges,
                    );
                }
            } catch (error) {
                console.error('Error opening file:', error);
                window.showErrorMessage(`Failed to open file: ${error}`);
            }
        },
    );

    context.subscriptions.push(openSearchPanelCommand, clearAllBuffersCommand, openFileCommand);
}

// Создание панели поиска
function createSearchPanel(context: ExtensionContext) {
    searchState.webviewPanel = window.createWebviewPanel(
        'sequentialSearcher',
        'Sequential Search',
        ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [Uri.joinPath(context.extensionUri, 'media')],
        },
    );

    // Обработка сообщений от webview
    searchState.webviewPanel.webview.onDidReceiveMessage(
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
                    );
                    break;
            }
        },
        undefined,
        context.subscriptions,
    );

    // Обработка закрытия панели
    searchState.webviewPanel.onDidDispose(
        () => {
            searchState.webviewPanel = undefined;
        },
        null,
        context.subscriptions,
    );

    updateWebviewContent();
}

// Обновление содержимого webview
function updateWebviewContent() {
    if (!searchState.webviewPanel) {
        return;
    }

    const bufferButtons = searchState.buffers
        .map((buffer, index) => {
            const isActive = buffer.id === searchState.activeBufferId;
            return `
			<button class="buffer-button ${isActive ? 'active' : ''}"
					onclick="activateBuffer(${buffer.id})"
					title="Buffer ${buffer.id + 1}: ${buffer.files.length} files, search: '${buffer.searchPattern}'">
				${buffer.id + 1}
			</button>
		`;
        })
        .join('');

    const addBufferButton = `
		<button class="buffer-button add-buffer"
				onclick="saveBuffer()"
				${searchState.currentFiles.length === 0 ? 'disabled' : ''}
				title="Save current results to a new buffer">
			+
		</button>
	`;

    const filesList = searchState.currentFiles
        .map(file => {
            const relativePath = workspace.asRelativePath(file);
            return `
			<div class="file-item" onclick="openFile('${file.fsPath.replace(/\\/g, '\\\\')}')">
				<span class="file-icon">📄</span>
				<span class="file-path">${relativePath}</span>
			</div>
		`;
        })
        .join('');

    const activeBufferInfo =
        searchState.activeBufferId >= 0
            ? `<div class="active-buffer-info">Using buffer ${searchState.activeBufferId + 1} (${
                  searchState.buffers.find(b => b.id === searchState.activeBufferId)?.files
                      .length || 0
              } files)</div>`
            : '';

    searchState.webviewPanel.webview.html = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Sequential Search</title>
			<style>
				body {
					font-family: var(--vscode-font-family);
					padding: 10px;
					color: var(--vscode-foreground);
				}
				.search-container {
					display: flex;
					margin-bottom: 10px;
				}
				.search-input {
					flex: 1;
					padding: 6px;
					border: 1px solid var(--vscode-input-border);
					background-color: var(--vscode-input-background);
					color: var(--vscode-input-foreground);
				}
				.search-button {
					margin-left: 5px;
					padding: 6px 12px;
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					cursor: pointer;
				}
				.search-button:hover {
					background-color: var(--vscode-button-hoverBackground);
				}
				.search-options {
					display: flex;
					align-items: center;
					margin-left: 10px;
					gap: 10px;
				}
				.option-toggle {
					display: flex;
					align-items: center;
					gap: 5px;
				}
				.buffer-container {
					display: flex;
					margin: 10px 0;
					align-items: center;
				}
				.buffer-buttons {
					display: flex;
					flex-wrap: wrap;
					gap: 5px;
				}
				.buffer-button {
					padding: 5px 10px;
					background-color: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
					border: 1px solid var(--vscode-button-border);
					cursor: pointer;
					min-width: 30px;
					text-align: center;
				}
				.buffer-button.active {
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
				}
				.buffer-button:hover {
					background-color: var(--vscode-button-hoverBackground);
				}
				.buffer-button:disabled {
					opacity: 0.5;
					cursor: not-allowed;
				}
				.clear-button {
					margin-left: auto;
					padding: 5px 10px;
					background-color: var(--vscode-errorForeground);
					color: white;
					border: none;
					cursor: pointer;
				}
				.results-container {
					margin-top: 10px;
					border: 1px solid var(--vscode-panel-border);
					height: calc(100vh - 150px);
					overflow: auto;
				}
				.file-item {
					padding: 5px 10px;
					cursor: pointer;
					display: flex;
					align-items: center;
				}
				.file-item:hover {
					background-color: var(--vscode-list-hoverBackground);
				}
				.file-icon {
					margin-right: 5px;
				}
				.results-info {
					margin: 10px 0;
					font-style: italic;
				}
				.active-buffer-info {
					margin-left: 10px;
					color: var(--vscode-descriptionForeground);
				}
			</style>
		</head>
		<body>
			<div class="search-container">
				<input type="text" id="searchInput" class="search-input" placeholder="Search regex pattern...">
				<div class="search-options">
					<div class="option-toggle">
						<input type="checkbox" id="excludeToggle">
						<label for="excludeToggle">Exclude</label>
					</div>
					<div class="option-toggle">
						<input type="checkbox" id="fileNameToggle">
						<label for="fileNameToggle">File Names</label>
					</div>
				</div>
				<button class="search-button" onclick="search()">Search</button>
			</div>

			<div class="buffer-container">
				<div class="buffer-buttons">
					${bufferButtons}
					${addBufferButton}
				</div>
				${activeBufferInfo}
				<button class="clear-button" onclick="clearAllBuffers()">Clear All</button>
			</div>

			<div class="results-info">
				Found ${searchState.currentFiles.length} files
			</div>

			<div class="results-container">
				${filesList}
			</div>

			<script>
				const vscode = acquireVsCodeApi();

				function search() {
					const searchText = document.getElementById('searchInput').value;
					const isExclude = document.getElementById('excludeToggle').checked;
					const searchInFileNames = document.getElementById('fileNameToggle').checked;

					if (searchText.trim() === '') {
						return;
					}

					vscode.postMessage({
						command: 'search',
						searchText,
						isExclude,
						searchInFileNames
					});
				}

				function saveBuffer() {
					vscode.postMessage({
						command: 'saveBuffer'
					});
				}

				function activateBuffer(bufferId) {
					vscode.postMessage({
						command: 'activateBuffer',
						bufferId
					});
				}

				function clearAllBuffers() {
					vscode.postMessage({
						command: 'clearAllBuffers'
					});
				}

				function openFile(filePath) {
					const searchText = document.getElementById('searchInput').value;
					vscode.postMessage({
						command: 'openFile',
						filePath,
						searchText
					});
				}

				// Обработка нажатия Enter в поле поиска
				document.getElementById('searchInput').addEventListener('keypress', (e) => {
					if (e.key === 'Enter') {
						search();
					}
				});
			</script>
		</body>
		</html>
	`;
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
                location: { viewId: 'explorer' },
                title: `${isExclude ? 'Excluding' : 'Searching for'} "${searchText}" in ${
                    searchInFileNames ? 'file names' : 'file contents'
                }`,
            },
            async () => {
                // Массив для хранения результатов
                const matchedFiles: Uri[] = [];

                // Создать регулярное выражение для поиска
                let searchRegex;
                try {
                    searchRegex = new RegExp(searchText, 'i');
                } catch (regexError) {
                    // Если регулярное выражение некорректно, используем его как обычный текст
                    searchRegex = new RegExp(escapeRegExp(searchText), 'i');
                    window.showWarningMessage(`Invalid regex pattern. Searching as plain text.`);
                }

                // Обрабатываем каждый файл
                for (const fileUri of filesToSearch) {
                    try {
                        let hasMatch = false;

                        if (searchInFileNames) {
                            // Поиск по имени файла (включая путь)
                            const relativePath = workspace.asRelativePath(fileUri);
                            hasMatch = searchRegex.test(relativePath);
                        } else {
                            // Поиск по содержимому файла
                            const document = await workspace.openTextDocument(fileUri);
                            const content = document.getText();
                            hasMatch = searchRegex.test(content);
                        }

                        // Добавляем файл в результаты в зависимости от типа поиска
                        if ((hasMatch && !isExclude) || (!hasMatch && isExclude)) {
                            matchedFiles.push(fileUri);
                        }
                    } catch (err) {
                        console.error(`Error processing file ${fileUri.fsPath}:`, err);
                    }
                }

                // Обновляем состояние поиска
                searchState.currentFiles = matchedFiles;

                // Сохраняем информацию о поиске в буфер, если он активен
                if (searchState.activeBufferId >= 0) {
                    const activeBuffer = searchState.buffers.find(
                        b => b.id === searchState.activeBufferId,
                    );
                    if (activeBuffer) {
                        activeBuffer.searchPattern = `${isExclude ? 'NOT ' : ''}${searchText} ${
                            searchInFileNames ? '(in file names)' : '(in contents)'
                        }`;
                    }
                }

                // Обновляем UI
                updateWebviewContent();

                window.showInformationMessage(
                    `Found ${matchedFiles.length} files ${
                        isExclude ? 'excluding' : 'containing'
                    } "${searchText}" ${searchInFileNames ? 'in file names' : 'in contents'}`,
                );
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

    if (searchState.webviewPanel) {
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

    window.showInformationMessage(
        `Saved ${newBuffer.files.length} files to buffer ${newBuffer.id + 1}`,
    );
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

// This method is called when your extension is deactivated
export function deactivate() {}
