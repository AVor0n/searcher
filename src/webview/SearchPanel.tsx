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
    useRegex: boolean;
    setUseRegex: (value: boolean) => void;
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
    useRegex,
    setUseRegex,
}) => {
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isSearching) {
            onSearch();
        }
    };

    return (
        <div className="search-container">
            <div className="search-actions">
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search regex pattern..."
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isSearching}
                />
                <button className={`search-button`} onClick={onSearch} disabled={isSearching}>
                    {isSearching ? 'Searching...' : 'Search'}
                </button>
            </div>

            <div className="search-actions">
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

                    <div className="option-toggle">
                        <input
                            type="checkbox"
                            id="regexToggle"
                            checked={useRegex}
                            onChange={e => setUseRegex(e.target.checked)}
                        />
                        <label htmlFor="regexToggle">Regex</label>
                    </div>
                </div>
            </div>
        </div>
    );
};
