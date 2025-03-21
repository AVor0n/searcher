import React, { useState, useEffect } from 'react';
import { SearchPanel } from './SearchPanel';
import { BufferPanel } from './BufferPanel';
import { ResultsList } from './ResultsList';
import { VSCodeAPI } from './vscode-api';

// Получаем API VSCode - НЕ вызываем здесь
// Вместо этого будем использовать глобальную переменную vscode
declare const vscode: VSCodeAPI;

// Типы для данных
export interface SearchBuffer {
    id: number;
    files: string[];
    searchPattern: string;
}

export interface SearchMatch {
    lineNumber: number;
    previewText: string;
    matchStartColumn: number;
    matchEndColumn: number;
}

export interface SearchState {
    results: {
        filePath: string;
        displayPath: string;
        matches: SearchMatch[];
    }[];
    buffers: SearchBuffer[];
    activeBufferId: number;
}

const App: React.FC = () => {
    // Используем дефолтные значения вместо сохраненного состояния
    const [searchText, setSearchText] = useState('');
    const [isExclude, setIsExclude] = useState(false);
    const [searchInFileNames, setSearchInFileNames] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [searchState, setSearchState] = useState<SearchState>({
        results: [],
        buffers: [],
        activeBufferId: -1,
    });
    const [isSearching, setIsSearching] = useState(false);
    const [useRegex, setUseRegex] = useState(false);

    // Обработчик сообщений от расширения
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            console.log('Received message:', message);

            if (message.type === 'log') {
                console.log('Log:', message.state);
            }
            if (message.type === 'updateState') {
                console.log('Updating state with:', message.state);
                setSearchState(prevState => ({
                    ...prevState,
                    ...message.state,
                    // Сохраняем результаты, если они есть в новом состоянии
                    results: message.state.results || prevState.results,
                    // Сохраняем буферы, если они есть в новом состоянии
                    buffers: message.state.buffers || prevState.buffers,
                    // Сохраняем активный буфер, если он есть в новом состоянии
                    activeBufferId:
                        typeof message.state.activeBufferId === 'number'
                            ? message.state.activeBufferId
                            : prevState.activeBufferId,
                }));
                setIsSearching(false);
            }
        };

        window.addEventListener('message', handleMessage);

        // Запросить начальное состояние
        vscode.postMessage({ command: 'getState' });

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    // Обработчики событий
    const handleSearch = () => {
        if (searchText.trim() === '' || isSearching) return;

        setIsSearching(true);
        vscode.postMessage({
            command: 'search',
            searchText,
            isExclude,
            searchInFileNames,
            caseSensitive,
            useRegex,
        });
    };

    const handleSaveBuffer = () => {
        vscode.postMessage({ command: 'saveBuffer' });
    };

    const handleActivateBuffer = (bufferId: number) => {
        vscode.postMessage({
            command: 'activateBuffer',
            bufferId,
        });
    };

    const handleClearAllBuffers = () => {
        vscode.postMessage({ command: 'clearAllBuffers' });
    };

    const handleOpenFile = (filePath: string, lineNumber?: number) => {
        vscode.postMessage({
            command: 'openFile',
            filePath,
            searchText,
            lineNumber,
        });
    };

    // Рендер компонента
    return (
        <div className="app-container">
            <SearchPanel
                searchText={searchText}
                setSearchText={setSearchText}
                isExclude={isExclude}
                setIsExclude={setIsExclude}
                searchInFileNames={searchInFileNames}
                setSearchInFileNames={setSearchInFileNames}
                caseSensitive={caseSensitive}
                setCaseSensitive={setCaseSensitive}
                onSearch={handleSearch}
                isSearching={isSearching}
                useRegex={useRegex}
                setUseRegex={setUseRegex}
            />

            <BufferPanel
                buffers={searchState.buffers}
                activeBufferId={searchState.activeBufferId}
                hasResults={searchState.results.length > 0}
                onActivateBuffer={handleActivateBuffer}
                onSaveBuffer={handleSaveBuffer}
                onClearAllBuffers={handleClearAllBuffers}
            />

            <div className="results-info">
                Found {searchState.results.reduce((total, file) => total + file.matches.length, 0)}{' '}
                matches in {searchState.results.length} files
            </div>

            <ResultsList results={searchState.results} onOpenFile={handleOpenFile} />
        </div>
    );
};

export default App;
