import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { Award, Trophy, Lock, Unlock } from 'lucide-react';
import '../styles/SkillBadges.css';

const SkillBadges = () => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [unlockedBadges, setUnlockedBadges] = useState([]);
    const [lockedBadges, setLockedBadges] = useState([]);
    const [totalSolved, setTotalSolved] = useState(0);
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
                setLockedBadges(data.locked || []);
                setTotalSolved(data.totalSolved || 0);
            }
        } catch (error) {
            console.error('Error loading badges:', error);
        } finally {
            setLoading(false);
        }
    };

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
                                unlockedBadges.map(badge => (
                                    <div key={badge.id} className="badge-card unlocked">
                                        <div className="badge-icon">{badge.icon}</div>
                                        <div className="badge-name">{badge.name}</div>
                                        <div className="badge-description">{badge.requirement}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="no-badges">No badges unlocked yet. Complete challenges to earn them! (Problems solved: {totalSolved})</div>
                            )}
                        </div>
                    </div>

                    {/* Locked Badges */}
                    <div className="badges-section">
                        <h3>
                            <Lock size={20} />
                            Locked Badges ({lockedBadges.length})
                        </h3>
                        <div className="badges-grid">
                            {lockedBadges.map(badge => (
                                <div key={badge.id} className="badge-card locked">
                                    <div className="badge-icon locked-icon">{badge.icon}</div>
                                    <div className="badge-name">{badge.name}</div>
                                    <div className="badge-description">{badge.requirement}</div>
                                    <div className="badge-requirement">Need: {badge.threshold} solved</div>
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
