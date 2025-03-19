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
        matches: SearchMatch[];
    }[];
    buffers: SearchBuffer[];
    activeBufferId: number;
}

const App: React.FC = () => {
    // Загружаем сохраненное состояние из vscode.getState()
    const initialState = vscode.getState() || {
        searchText: '',
        isExclude: false,
        searchInFileNames: false,
        caseSensitive: false,
        searchState: {
            results: [],
            buffers: [],
            activeBufferId: -1,
        },
    };

    const [searchText, setSearchText] = useState(initialState.searchText);
    const [isExclude, setIsExclude] = useState(initialState.isExclude);
    const [searchInFileNames, setSearchInFileNames] = useState(initialState.searchInFileNames);
    const [caseSensitive, setCaseSensitive] = useState(initialState.caseSensitive || false);
    const [searchState, setSearchState] = useState<SearchState>({
        // Убедимся, что все поля определены
        results: Array.isArray(initialState.searchState?.results)
            ? initialState.searchState.results
            : [],
        buffers: Array.isArray(initialState.searchState?.buffers)
            ? initialState.searchState.buffers
            : [],
        activeBufferId:
            typeof initialState.searchState?.activeBufferId === 'number'
                ? initialState.searchState.activeBufferId
                : -1,
    });
    const [isSearching, setIsSearching] = useState(false);

    // Сохраняем состояние при его изменении
    useEffect(() => {
        vscode.setState({
            searchText,
            isExclude,
            searchInFileNames,
            caseSensitive,
            searchState,
        });
    }, [searchText, isExclude, searchInFileNames, caseSensitive, searchState]);

    // Обработчик сообщений от расширения
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            console.log('Received message:', message);

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
