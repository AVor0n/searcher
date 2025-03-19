import React from 'react';
import { SearchBuffer } from './App';

interface BufferPanelProps {
    buffers: SearchBuffer[];
    activeBufferId: number;
    hasResults: boolean;
    onActivateBuffer: (bufferId: number) => void;
    onSaveBuffer: () => void;
    onClearAllBuffers: () => void;
}

export const BufferPanel: React.FC<BufferPanelProps> = ({
    buffers,
    activeBufferId,
    hasResults,
    onActivateBuffer,
    onSaveBuffer,
    onClearAllBuffers,
}) => {
    return (
        <div className="buffer-container">
            <div className="buffer-buttons">
                {buffers.map(buffer => (
                    <button
                        key={buffer.id}
                        className={`buffer-button ${buffer.id === activeBufferId ? 'active' : ''}`}
                        onClick={() => onActivateBuffer(buffer.id)}
                        title={`Buffer ${buffer.id + 1}: ${buffer.files.length} files, search: '${
                            buffer.searchPattern
                        }'`}
                    >
                        {buffer.id + 1}
                    </button>
                ))}

                <button
                    className="buffer-button add-buffer"
                    onClick={onSaveBuffer}
                    disabled={!hasResults}
                    title="Save current results to a new buffer"
                >
                    +
                </button>
            </div>

            <button className="clear-button" onClick={onClearAllBuffers}>
                Clear All
            </button>
        </div>
    );
};
