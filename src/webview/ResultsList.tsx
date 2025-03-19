import React from 'react';

interface ResultsListProps {
    files: string[];
    onOpenFile: (filePath: string) => void;
}

export const ResultsList: React.FC<ResultsListProps> = ({ files, onOpenFile }) => {
    return (
        <div className="results-container">
            {files.map((filePath, index) => (
                <div key={index} className="file-item" onClick={() => onOpenFile(filePath)}>
                    <span className="file-icon">📄</span>
                    <span className="file-path">{filePath}</span>
                </div>
            ))}
        </div>
    );
};
