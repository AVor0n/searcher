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

export interface SearchState {
    currentFiles: string[];
    buffers: SearchBuffer[];
    activeBufferId: number;
}

const App: React.FC = () => {
    // Состояние
    const [searchText, setSearchText] = useState('');
    const [isExclude, setIsExclude] = useState(false);
    const [searchInFileNames, setSearchInFileNames] = useState(false);
    const [searchState, setSearchState] = useState<SearchState>({
        currentFiles: [],
        buffers: [],
        activeBufferId: -1,
    });

    // Обработчик сообщений от расширения
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            if (message.type === 'updateState') {
                setSearchState(message.state);
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
        if (searchText.trim() === '') return;

        vscode.postMessage({
            command: 'search',
            searchText,
            isExclude,
            searchInFileNames,
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

    const handleOpenFile = (filePath: string) => {
        vscode.postMessage({
            command: 'openFile',
            filePath,
            searchText,
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
                onSearch={handleSearch}
            />

            <BufferPanel
                buffers={searchState.buffers}
                activeBufferId={searchState.activeBufferId}
                hasResults={searchState.currentFiles.length > 0}
                onActivateBuffer={handleActivateBuffer}
                onSaveBuffer={handleSaveBuffer}
                onClearAllBuffers={handleClearAllBuffers}
            />

            <div className="results-info">Found {searchState.currentFiles.length} files</div>

            <ResultsList files={searchState.currentFiles} onOpenFile={handleOpenFile} />
        </div>
    );
};

export default App;
