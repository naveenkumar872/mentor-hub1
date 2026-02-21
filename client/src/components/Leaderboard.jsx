import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { Trophy, TrendingUp, Award, Target, Clock } from 'lucide-react';
import '../styles/Leaderboard.css';

const Leaderboard = () => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTab, setSelectedTab] = useState('global');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [categories, setCategories] = useState([]);
    const [userRank, setUserRank] = useState(null);
    const [timeRange, setTimeRange] = useState('alltime');
    const token = localStorage.getItem('authToken');

    const tabs = [
        { id: 'global', label: '🌍 Global', icon: Trophy },
        { id: 'category', label: '📂 By Category', icon: Target },
        { id: 'weekly', label: '📅 This Week', icon: TrendingUp },
        { id: 'monthly', label: '📊 This Month', icon: Award }
    ];

    useEffect(() => {
        loadLeaderboard();
        loadCategories();
    }, [selectedTab, selectedCategory, timeRange]);

    const loadCategories = async () => {
        try {
            const response = await fetch('/api/problem-categories', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setCategories(data);
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    const loadLeaderboard = async () => {
        try {
            setLoading(true);
            let url = '/api/leaderboard';
            const params = new URLSearchParams();

            if (selectedTab === 'category' && selectedCategory !== 'all') {
                params.append('category', selectedCategory);
            } else if (selectedTab === 'weekly') {
                params.append('timeRange', 'week');
            } else if (selectedTab === 'monthly') {
                params.append('timeRange', 'month');
            }

            if (params.toString()) {
                url += '?' + params.toString();
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load leaderboard');

            const data = await response.json();
            setLeaderboardData(data.rankings || []);
            setUserRank(data.userRank || null);
        } catch (error) {
            console.error('Error:', error);
            setLeaderboardData([]);
        } finally {
            setLoading(false);
        }
    };

    const getMedalEmoji = (rank) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    const renderLeaderboard = () => {
        if (loading) {
            return <div className="loading-state">Loading leaderboard...</div>;
        }

        if (leaderboardData.length === 0) {
            return <div className="empty-state">No data available</div>;
        }

        return (
            <>
                {/* User's Current Rank */}
                {userRank && (
                    <div className={`user-rank-card ${theme}`}>
                        <div className="rank-info">
                            <span className="rank-position">Your Position</span>
                            <div className="rank-number">{getMedalEmoji(userRank.rank)}</div>
                        </div>
                        <div className="rank-stats">
                            <div className="stat">
                                <span className="stat-label">Solved</span>
                                <span className="stat-value">{userRank.problems_solved}</span>
                            </div>
                            <div className="stat">
                                <span className="stat-label">Points</span>
                                <span className="stat-value">{userRank.total_points}</span>
                            </div>
                            <div className="stat">
                                <span className="stat-label">Streak</span>
                                <span className="stat-value">{userRank.current_streak}🔥</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Leaderboard Table */}
                <div className={`leaderboard-table ${theme}`}>
                    <div className="table-header">
                        <div className="col-rank">Rank</div>
                        <div className="col-user">User</div>
                        <div className="col-solved">Solved</div>
                        <div className="col-points">Points</div>
                        <div className="col-streak">Streak</div>
                        <div className="col-accuracy">Success Rate</div>
                    </div>

                    {leaderboardData.map((entry, idx) => (
                        <div
                            key={idx}
                            className={`table-row ${entry.user_id === user?.id ? 'current-user' : ''} ${idx < 3 ? 'top-three' : ''}`}
                        >
                            <div className="col-rank">
                                <span className="medal">{getMedalEmoji(entry.rank)}</span>
                            </div>
                            <div className="col-user">
                                <div className="user-info">
                                    <img
                                        src={entry.avatar || '/default-avatar.jpg'}
                                        alt={entry.username}
                                        className="user-avatar"
                                    />
                                    <div className="user-details">
                                        <div className="username">{entry.username}</div>
                                        <div className="user-tier">{entry.tier || 'Free'}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="col-solved">
                                <div className="solved-count">{entry.problems_solved}</div>
                            </div>
                            <div className="col-points">
                                <div className="points">
                                    <TrendingUp size={14} />
                                    {entry.total_points}
                                </div>
                            </div>
                            <div className="col-streak">
                                <div className="streak">{entry.current_streak}🔥</div>
                            </div>
                            <div className="col-accuracy">
                                <div className="accuracy-bar">
                                    <div
                                        className="accuracy-fill"
                                        style={{ width: `${entry.success_rate}%` }}
                                    />
                                </div>
                                <span className="accuracy-text">{entry.success_rate.toFixed(1)}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </>
        );
    };

    const renderCategoryFilters = () => {
        if (selectedTab !== 'category') return null;

        return (
            <div className="category-filters">
                <button
                    className={`filter-btn ${selectedCategory === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedCategory('all')}
                >
                    All Categories
                </button>
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        className={`filter-btn ${selectedCategory === cat.name ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(cat.name)}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className={`leaderboard-container ${theme}`}>
            {/* Header */}
            <div className="leaderboard-header">
                <h2>
                    <Trophy size={28} />
                    Leaderboard
                </h2>
                <p>Compete with peers and climb the rankings</p>
            </div>

            {/* Tabs */}
            <div className="leaderboard-tabs">
                {tabs.map(tab => {
                    const IconComponent = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            className={`tab-btn ${selectedTab === tab.id ? 'active' : ''}`}
                            onClick={() => setSelectedTab(tab.id)}
                        >
                            <IconComponent size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Category Filters */}
            {renderCategoryFilters()}

            {/* Leaderboard Content */}
            <div className="leaderboard-content">
                {renderLeaderboard()}
            </div>

            {/* Stats Cards */}
            <div className="leaderboard-stats">
                <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-details">
                        <div className="stat-label">Total Participants</div>
                        <div className="stat-value">{leaderboardData.length}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">🎯</div>
                    <div className="stat-details">
                        <div className="stat-label">Avg. Score</div>
                        <div className="stat-value">
                            {leaderboardData.length > 0
                                ? (leaderboardData.reduce((sum, u) => sum + u.total_points, 0) /
                                    leaderboardData.length).toFixed(0)
                                : 0}
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">🔥</div>
                    <div className="stat-details">
                        <div className="stat-label">Top Streak</div>
                        <div className="stat-value">
                            {Math.max(0, ...leaderboardData.map(u => u.current_streak || 0))} days
                        </div>
                    </div>
                </div>
            </div>

            {/* Achievements Section */}
            <div className="leaderboard-achievements">
                <h3>Recent Achievements</h3>
                <div className="achievements-list">
                    {leaderboardData.slice(0, 3).map((entry, idx) => (
                        <div key={idx} className="achievement-item">
                            <span className="achievement-badge">
                                {idx === 0 ? '🏆' : idx === 1 ? '⭐' : '💎'}
                            </span>
                            <span className="achievement-text">
                                {entry.username} solved {entry.problems_solved} problems
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;
