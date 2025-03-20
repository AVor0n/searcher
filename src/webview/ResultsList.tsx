import React, { useState } from 'react';
import { SearchMatch } from './App';

interface ResultsListProps {
    results: {
        filePath: string; // Абсолютный путь
        displayPath: string; // Относительный путь для отображения
        matches: SearchMatch[];
    }[];
    onOpenFile: (filePath: string, lineNumber?: number) => void;
}

export const ResultsList: React.FC<ResultsListProps> = ({ results, onOpenFile }) => {
    const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

    const toggleFileExpansion = (filePath: string) => {
        setExpandedFiles(prev => ({
            ...prev,
            [filePath]: !prev[filePath],
        }));
    };

    // Инициализация: по умолчанию все файлы развернуты
    React.useEffect(() => {
        const initialState: Record<string, boolean> = {};
        results.forEach(result => {
            initialState[result.filePath] = true;
        });
        setExpandedFiles(initialState);
    }, [results]);

    return (
        <div className="results-container">
            {results.map(result => (
                <div key={result.filePath} className="file-result">
                    <div
                        className="file-header"
                        onClick={() => toggleFileExpansion(result.filePath)}
                    >
                        <span className="expand-icon">
                            {expandedFiles[result.filePath] ? '▼' : '►'}
                        </span>
                        <span className="file-icon">📄</span>
                        <span
                            className="file-path"
                            onClick={e => {
                                e.stopPropagation();
                                onOpenFile(result.filePath);
                            }}
                        >
                            {result.displayPath}
                        </span>
                        <span className="match-count">
                            {result.matches.length}{' '}
                            {result.matches.length === 1 ? 'match' : 'matches'}
                        </span>
                    </div>

                    {expandedFiles[result.filePath] && (
                        <div className="matches-list">
                            {result.matches.map((match, index) => (
                                <div
                                    key={index}
                                    className="match-item"
                                    onClick={() => onOpenFile(result.filePath, match.lineNumber)}
                                >
                                    <span className="line-number">{match.lineNumber}:</span>
                                    <span className="match-preview">
                                        <span className="match-context">
                                            {match.previewText.substring(0, match.matchStartColumn)}
                                        </span>
                                        <span className="match-highlight">
                                            {match.previewText.substring(
                                                match.matchStartColumn,
                                                match.matchEndColumn,
                                            )}
                                        </span>
                                        <span className="match-context">
                                            {match.previewText.substring(match.matchEndColumn)}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
