import React from 'react';

interface SearchPanelProps {
    searchText: string;
    setSearchText: (text: string) => void;
    isExclude: boolean;
    setIsExclude: (value: boolean) => void;
    searchInFileNames: boolean;
    setSearchInFileNames: (value: boolean) => void;
    caseSensitive: boolean;
    setCaseSensitive: (value: boolean) => void;
    onSearch: () => void;
    isSearching: boolean;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
    searchText,
    setSearchText,
    isExclude,
    setIsExclude,
    searchInFileNames,
    setSearchInFileNames,
    caseSensitive,
    setCaseSensitive,
    onSearch,
    isSearching,
}) => {
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isSearching) {
            onSearch();
        }
    };

    return (
        <div className="search-container">
            <input
                type="text"
                className="search-input"
                placeholder="Search regex pattern..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isSearching}
            />

            <div className="search-actions">
                <button
                    className={`search-button ${isSearching ? 'loading' : ''}`}
                    onClick={onSearch}
                    disabled={isSearching}
                >
                    {isSearching ? 'Searching...' : 'Search'}
                </button>

                <div className="search-options">
                    <div className="option-toggle">
                        <input
                            type="checkbox"
                            id="excludeToggle"
                            checked={isExclude}
                            onChange={e => setIsExclude(e.target.checked)}
                        />
                        <label htmlFor="excludeToggle">Exclude</label>
                    </div>

                    <div className="option-toggle">
                        <input
                            type="checkbox"
                            id="fileNameToggle"
                            checked={searchInFileNames}
                            onChange={e => setSearchInFileNames(e.target.checked)}
                        />
                        <label htmlFor="fileNameToggle">File Names</label>
                    </div>

                    <div className="option-toggle">
                        <input
                            type="checkbox"
                            id="caseSensitiveToggle"
                            checked={caseSensitive}
                            onChange={e => setCaseSensitive(e.target.checked)}
                        />
                        <label htmlFor="caseSensitiveToggle">Case Sensitive</label>
                    </div>
                </div>
            </div>
        </div>
    );
};
