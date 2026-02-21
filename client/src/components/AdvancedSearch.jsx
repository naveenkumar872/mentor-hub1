import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../App';
import { Search, Filter, Download } from 'lucide-react';
import '../styles/AdvancedSearch.css';

const AdvancedSearch = ({ onResultsChange }) => {
    const { theme } = useContext(ThemeContext);
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({
        difficulty: 'all',
        category: 'all',
        status: 'all',
        timeRange: 'all'
    });
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const token = localStorage.getItem('authToken');

    const handleSearch = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                q: searchQuery,
                difficulty: filters.difficulty,
                category: filters.category,
                status: filters.status,
                timeRange: filters.timeRange
            });

            const response = await fetch(`/api/search?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setResults(data.results || []);
                onResultsChange?.(data.results);
            }
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportResults = () => {
        const csv = results.map(r => 
            `${r.title},${r.category},${r.difficulty},${r.status}`
        ).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'search-results.csv';
        a.click();
    };

    return (
        <div className={`advanced-search ${theme}`}>
            <div className="search-header">
                <h2>
                    <Search size={24} />
                    Advanced Search
                </h2>
            </div>

            <div className="search-container">
                <div className="search-input-group">
                    <input
                        type="text"
                        placeholder="Search problems, categories, or users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        className="search-input"
                    />
                    <button className="search-btn" onClick={handleSearch}>
                        <Search size={20} />
                    </button>
                </div>

                <div className="filters">
                    <div className="filter-group">
                        <label>Difficulty</label>
                        <select 
                            value={filters.difficulty}
                            onChange={(e) => setFilters({...filters, difficulty: e.target.value})}
                        >
                            <option value="all">All Levels</option>
                            <option value="easy">Beginner</option>
                            <option value="medium">Intermediate</option>
                            <option value="hard">Advanced</option>
                            <option value="expert">Expert</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Category</label>
                        <select 
                            value={filters.category}
                            onChange={(e) => setFilters({...filters, category: e.target.value})}
                        >
                            <option value="all">All Categories</option>
                            <option value="arrays">Arrays</option>
                            <option value="strings">Strings</option>
                            <option value="trees">Trees</option>
                            <option value="graphs">Graphs</option>
                            <option value="dp">Dynamic Programming</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Status</label>
                        <select 
                            value={filters.status}
                            onChange={(e) => setFilters({...filters, status: e.target.value})}
                        >
                            <option value="all">All</option>
                            <option value="solved">Solved</option>
                            <option value="attempted">Attempted</option>
                            <option value="unsolved">Not Solved</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Results */}
            <div className="search-results">
                <div className="results-header">
                    <span>{results.length} results found</span>
                    {results.length > 0 && (
                        <button className="export-btn" onClick={exportResults}>
                            <Download size={16} />
                            Export
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="loading">Searching...</div>
                ) : results.length > 0 ? (
                    <div className="results-list">
                        {results.map((result, idx) => (
                            <div key={idx} className="search-result">
                                <div className="result-title">{result.title}</div>
                                <div className="result-meta">
                                    <span className="badge">{result.category}</span>
                                    <span className="badge difficulty">{result.difficulty}</span>
                                    <span className="badge status">{result.status}</span>
                                </div>
                                <div className="result-description">{result.description}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="no-results">No results found</div>
                )}
            </div>
        </div>
    );
};

export default AdvancedSearch;
