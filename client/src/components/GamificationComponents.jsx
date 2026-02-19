/**
 * Gamification Components
 * - Leaderboard
 * - Achievement Badges
 * - Student Profile with Stats
 */

import React, { useState, useEffect } from 'react';
import { Trophy, Award, Zap, Star, TrendingUp, Users } from 'lucide-react';
import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api';

/**
 * Leaderboard Component
 */
export function GamificationLeaderboard({ limit = 100 }) {
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchLeaderboard();
    }, [limit]);

    const fetchLeaderboard = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_BASE}/gamification/leaderboard?limit=${limit}`);
            setLeaderboard(response.data.leaderboard);
            setError(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to fetch leaderboard');
            console.error('Error fetching leaderboard:', err);
        } finally {
            setLoading(false);
        }
    };

    const getMedalIcon = (rank) => {
        switch (rank) {
            case 1:
                return '🥇';
            case 2:
                return '🥈';
            case 3:
                return '🥉';
            default:
                return rank;
        }
    };

    const getLevelColor = (level) => {
        if (level >= 10) return '#FFD700'; // Gold
        if (level >= 5) return '#C0C0C0'; // Silver
        return '#CD7F32'; // Bronze
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>Loading leaderboard...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                padding: '2rem',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                color: '#ef4444'
            }}>
                Error: {error}
            </div>
        );
    }

    if (!leaderboard || leaderboard.length === 0) {
        return (
            <div style={{ width: '100%' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '2rem'
                }}>
                    <Trophy size={24} style={{ color: '#f59e0b' }} />
                    <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Leaderboard</h3>
                </div>
                <div style={{
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    background: 'var(--bg-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)'
                }}>
                    <Trophy size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: 0 }}>No leaderboard entries yet</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Start solving problems and completing tests to earn points!</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ width: '100%' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '2rem'
            }}>
                <Trophy size={24} style={{ color: '#f59e0b' }} />
                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Leaderboard</h3>
            </div>

            <div style={{
                overflowX: 'auto',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
            }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    backgroundColor: 'var(--bg-card)'
                }}>
                    <thead>
                        <tr style={{
                            background: 'linear-gradient(135deg, var(--bg-dark), var(--bg-secondary))',
                            borderBottom: '2px solid var(--border-color)'
                        }}>
                            <th style={{
                                padding: '1rem',
                                textAlign: 'left',
                                fontWeight: 700,
                                color: 'var(--primary)'
                            }}>Rank</th>
                            <th style={{
                                padding: '1rem',
                                textAlign: 'left',
                                fontWeight: 700,
                                color: 'var(--primary)'
                            }}>Student</th>
                            <th style={{
                                padding: '1rem',
                                textAlign: 'center',
                                fontWeight: 700,
                                color: 'var(--primary)'
                            }}>Level</th>
                            <th style={{
                                padding: '1rem',
                                textAlign: 'center',
                                fontWeight: 700,
                                color: 'var(--primary)'
                            }}>Points</th>
                            <th style={{
                                padding: '1rem',
                                textAlign: 'center',
                                fontWeight: 700,
                                color: 'var(--primary)'
                            }}>Streak</th>
                            <th style={{
                                padding: '1rem',
                                textAlign: 'center',
                                fontWeight: 700,
                                color: 'var(--primary)'
                            }}>Badges</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaderboard.map((entry, index) => (
                            <tr
                                key={entry.student_id}
                                style={{
                                    borderBottom: '1px solid var(--border-color)',
                                    backgroundColor: entry.rank <= 3 ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <td style={{
                                    padding: '1rem',
                                    fontWeight: 700,
                                    fontSize: '1.2rem',
                                    color: getLevelColor(entry.level)
                                }}>
                                    {getMedalIcon(entry.rank)}
                                </td>
                                <td style={{
                                    padding: '1rem',
                                    fontWeight: 600
                                }}>
                                    {entry.name || entry.email}
                                </td>
                                <td style={{
                                    padding: '1rem',
                                    textAlign: 'center'
                                }}>
                                    <span style={{
                                        background: `linear-gradient(135deg, ${getLevelColor(entry.level)}, ${getLevelColor(entry.level)}aa)`,
                                        color: 'white',
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '20px',
                                        fontWeight: 700,
                                        fontSize: '0.9rem'
                                    }}>
                                        Lvl {entry.level}
                                    </span>
                                </td>
                                <td style={{
                                    padding: '1rem',
                                    textAlign: 'center',
                                    fontWeight: 700,
                                    color: 'var(--primary)'
                                }}>
                                    {entry.total_points.toLocaleString()}
                                </td>
                                <td style={{
                                    padding: '1rem',
                                    textAlign: 'center'
                                }}>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '20px',
                                        color: '#ef4444',
                                        fontWeight: 700
                                    }}>
                                        <Zap size={14} />
                                        {entry.current_streak || 0}
                                    </span>
                                </td>
                                <td style={{
                                    padding: '1rem',
                                    textAlign: 'center',
                                    fontWeight: 700
                                }}>
                                    {entry.badge_count || 0} 🏅
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/**
 * Achievement Badges Component
 */
export function AchievementBadges({ studentId }) {
    const [achievements, setAchievements] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAchievements();
    }, [studentId]);

    const fetchAchievements = async () => {
        try {
            const response = await axios.get(`${API_BASE}/gamification/achievements/${studentId}`);
            setAchievements(response.data.achievements || []);
        } catch (error) {
            console.error('Error fetching achievements:', error);
            setAchievements([]);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading achievements...</div>;

    if (!achievements || achievements.length === 0) {
        return (
            <div style={{ width: '100%' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                    <Award size={20} style={{ color: '#f59e0b' }} />
                    Recent Achievements
                </h3>
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No achievements yet. Keep learning!</p>
            </div>
        );
    }

    return (
        <div style={{ width: '100%' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                <Award size={20} style={{ color: '#f59e0b' }} />
                Recent Achievements
            </h3>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '1rem'
            }}>
                {achievements.slice(0, 8).map((achievement, idx) => (
                    <div
                        key={idx}
                        style={{
                            textAlign: 'center',
                            padding: '1rem',
                            background: 'var(--bg-card)',
                            borderRadius: '12px',
                            border: '2px solid var(--border-color)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                            {achievement.badge_icon || '🏅'}
                        </div>
                        <div style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: 'var(--text-main)',
                            marginBottom: '0.3rem'
                        }}>
                            {achievement.badge_name}
                        </div>
                        <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)'
                        }}>
                            {new Date(achievement.earned_at).toLocaleDateString()}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Gamification Profile Card
 */
export function GamificationProfile({ studentId }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProfile();
    }, [studentId]);

    const fetchProfile = async () => {
        try {
            const response = await axios.get(`${API_BASE}/gamification/student/${studentId}`);
            setProfile(response.data);
        } catch (error) {
            console.error('Error fetching profile:', error);
            // Set default profile when none exists
            setProfile({
                level: 1,
                total_points: 0,
                current_xp: 0,
                next_level_xp: 1000,
                current_streak: 0,
                longest_streak: 0,
                badges: []
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading profile...</div>;
    }

    if (!profile) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No profile data available</div>;
    }

    const xpProgress = profile.next_level_xp ? (profile.current_xp / profile.next_level_xp) * 100 : 0;

    return (
        <div style={{
            background: 'linear-gradient(135deg, var(--primary), #6366f1)',
            color: 'white',
            padding: '2rem',
            borderRadius: '12px',
            boxShadow: '0 8px 20px rgba(59, 130, 246, 0.3)'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '1.5rem'
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                        Level {profile.level}
                    </h3>
                    <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9 }}>
                        {profile.total_points.toLocaleString()} Points
                    </p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '2rem' }}>
                    ⭐
                </div>
            </div>

            {/* XP Progress Bar */}
            <div style={{ marginBottom: '1.5rem' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.3rem',
                    fontSize: '0.85rem'
                }}>
                    <span>Next Level Progress</span>
                    <span>{profile.current_xp} / {profile.next_level_xp} XP</span>
                </div>
                <div style={{
                    width: '100%',
                    height: '8px',
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${xpProgress}%`,
                        height: '100%',
                        background: 'rgba(255,255,255,0.8)',
                        transition: 'width 0.3s'
                    }} />
                </div>
            </div>

            {/* Stats Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                marginTop: '1.5rem'
            }}>
                <div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Current Streak</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                        {profile.current_streak || 0} 🔥
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Longest Streak</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                        {profile.longest_streak || 0} 🏆
                    </div>
                </div>
            </div>

            {profile.badges && profile.badges.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                        Badges ({profile.badges.length})
                    </div>
                    <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap'
                    }}>
                        {profile.badges.slice(0, 5).map((badge, idx) => (
                            <span
                                key={idx}
                                title={badge.description}
                                style={{
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    opacity: 0.9,
                                    transition: 'all 0.2s'
                                }}
                            >
                                {badge.icon_url || '🏅'}
                            </span>
                        ))}
                        {profile.badges.length > 5 && (
                            <span style={{
                                background: 'rgba(255,255,255,0.2)',
                                padding: '0.3rem 0.6rem',
                                borderRadius: '12px',
                                fontSize: '0.8rem'
                            }}>
                                +{profile.badges.length - 5}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Mini Leaderboard Widget
 */
export function MiniLeaderboard({ limit = 5 }) {
    const [leaderboard, setLeaderboard] = useState([]);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const response = await axios.get(`${API_BASE}/gamification/leaderboard?limit=${limit}`);
                setLeaderboard(response.data.leaderboard || []);
            } catch (error) {
                console.error('Error fetching leaderboard:', error);
                setLeaderboard([]);
            }
        };
        fetchLeaderboard();
    }, [limit]);

    return (
        <div style={{
            background: 'var(--bg-card)',
            padding: '1.5rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
        }}>
            <h4 style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                margin: '0 0 1rem 0',
                fontSize: '1rem',
                fontWeight: 700
            }}>
                <Trophy size={18} />
                Top Performers
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {leaderboard.slice(0, limit).map((entry, idx) => (
                    <div
                        key={entry.student_id}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.5rem',
                            backgroundColor: 'var(--bg-primary)',
                            borderRadius: '6px',
                            fontSize: '0.9rem'
                        }}
                    >
                        <span style={{ fontWeight: 700 }}>
                            #{entry.rank} {entry.name || entry.email}
                        </span>
                        <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                            {entry.total_points.toLocaleString()} pts
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default {
    GamificationLeaderboard,
    AchievementBadges,
    GamificationProfile,
    MiniLeaderboard
};
