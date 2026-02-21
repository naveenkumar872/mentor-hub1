import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { Award, Trophy, Lock, Unlock } from 'lucide-react';
import '../styles/SkillBadges.css';

const SkillBadges = () => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [badges, setBadges] = useState([]);
    const [unlockedBadges, setUnlockedBadges] = useState([]);
    const [loading, setLoading] = useState(true);
    const token = localStorage.getItem('authToken');

    useEffect(() => {
        loadBadges();
    }, []);

    const loadBadges = async () => {
        try {
            const response = await fetch(`/api/users/${user?.id}/badges`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUnlockedBadges(data.unlocked || []);
                setBadges(data.allBadges || []);
            }
        } catch (error) {
            console.error('Error loading badges:', error);
        } finally {
            setLoading(false);
        }
    };

    const allBadgeDefinitions = [
        { id: 1, name: 'First Step', icon: '🚀', description: 'Solve your first problem', requirement: 'problems_solved >= 1' },
        { id: 2, name: 'Starter', icon: '⭐', description: 'Solve 10 problems', requirement: 'problems_solved >= 10' },
        { id: 3, name: 'Achiever', icon: '🏆', description: 'Solve 50 problems', requirement: 'problems_solved >= 50' },
        { id: 4, name: 'Master', icon: '👑', description: 'Solve 100 problems', requirement: 'problems_solved >= 100' },
        { id: 5, name: 'Speed Demon', icon: '⚡', description: 'Solve 5 problems in <30min each', requirement: 'fast_solves >= 5' },
        { id: 6, name: 'Consistent', icon: '🔥', description: 'Maintain 7-day streak', requirement: 'best_streak >= 7' },
        { id: 7, name: 'Perfect Score', icon: '💯', description: 'Get 100% success rate in a category', requirement: 'category_perfection >= 1' },
        { id: 8, name: 'Team Player', icon: '👥', description: 'Help 5 peers in code review', requirement: 'helpful_reviews >= 5' },
        { id: 9, name: 'Problem Solver', icon: '🧩', description: 'Solve problems from 5 different categories', requirement: 'categories_mastered >= 5' },
        { id: 10, name: 'Legendary', icon: '✨', description: 'Reach rank #1 on leaderboard', requirement: 'rank === 1' }
    ];

    return (
        <div className={`skill-badges-container ${theme}`}>
            <div className="badges-header">
                <h2>
                    <Award size={28} />
                    Skill Badges
                </h2>
                <p>Unlock achievements by completing challenges</p>
            </div>

            {loading ? (
                <div className="loading">Loading badges...</div>
            ) : (
                <>
                    {/* Unlocked Badges */}
                    <div className="badges-section">
                        <h3>
                            <Unlock size={20} />
                            Unlocked Badges ({unlockedBadges.length})
                        </h3>
                        <div className="badges-grid">
                            {unlockedBadges.length > 0 ? (
                                unlockedBadges.map(badge => {
                                    const badgeDef = allBadgeDefinitions.find(b => b.id === badge.badge_id);
                                    return (
                                        <div key={badge.id} className="badge-card unlocked">
                                            <div className="badge-icon">{badgeDef?.icon}</div>
                                            <div className="badge-name">{badgeDef?.name}</div>
                                            <div className="badge-description">{badgeDef?.description}</div>
                                            <div className="unlock-date">
                                                Unlocked {new Date(badge.unlocked_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="no-badges">No badges unlocked yet. Complete challenges to earn them!</div>
                            )}
                        </div>
                    </div>

                    {/* Locked Badges */}
                    <div className="badges-section">
                        <h3>
                            <Lock size={20} />
                            Locked Badges
                        </h3>
                        <div className="badges-grid">
                            {allBadgeDefinitions
                                .filter(b => !unlockedBadges.find(ub => ub.badge_id === b.id))
                                .map(badge => (
                                    <div key={badge.id} className="badge-card locked">
                                        <div className="badge-icon locked-icon">{badge.icon}</div>
                                        <div className="badge-name">{badge.name}</div>
                                        <div className="badge-description">{badge.description}</div>
                                        <div className="badge-requirement">{badge.requirement}</div>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Badge Tutorial */}
                    <div className="badge-info">
                        <h4>How to Earn Badges?</h4>
                        <ul>
                            <li>🚀 <strong>First Step:</strong> Solve your first problem</li>
                            <li>⭐ <strong>Starter:</strong> Reach 10 solved problems</li>
                            <li>🏆 <strong>Achiever:</strong> Solve 50+ problems</li>
                            <li>🔥 <strong>Consistent:</strong> Maintain a 7-day solving streak</li>
                            <li>⚡ <strong>Speed Demon:</strong> Solve 5 problems quickly</li>
                            <li>👑 <strong>Master:</strong> Solve 100+ problems</li>
                        </ul>
                    </div>
                </>
            )}
        </div>
    );
};

export default SkillBadges;
