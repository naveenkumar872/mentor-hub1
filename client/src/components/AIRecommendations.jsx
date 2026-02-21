import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeContext, useAuth } from '../App';
import { Zap, ArrowRight, AlertTriangle, CheckCircle } from 'lucide-react';
import '../styles/AIRecommendations.css';

const difficultyColors = {
    easy: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    medium: { bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
    hard: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
};

const AIRecommendations = () => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const navigate = useNavigate();
    const [recommendations, setRecommendations] = useState([]);
    const [weakAreas, setWeakAreas] = useState([]);
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const token = localStorage.getItem('authToken');

    useEffect(() => {
        loadRecommendations();
    }, []);

    const loadRecommendations = async () => {
        try {
            const response = await fetch(`/api/recommendations/ai?userId=${user?.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setRecommendations(data.recommendations || []);
                setWeakAreas(data.weakAreas || []);
                setInsights(data.insights || []);
            }
        } catch (error) {
            console.error('Error loading recommendations:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`ai-recommendations ${theme}`}>
            <div className="rec-header">
                <h2>
                    <Zap size={24} />
                    AI-Powered Recommendations
                </h2>
                <p>Personalized problem suggestions based on your learning patterns</p>
            </div>

            {insights.length > 0 && (
                <div className="rec-insights">
                    {insights.map((insight, i) => (
                        <div key={i} className="insight-chip">
                            {weakAreas.length > 0 && i === 0 ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                            {insight}
                        </div>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="loading">Analyzing your performance...</div>
            ) : (
                <div className="recommendations-grid">
                    {recommendations.length > 0 ? (
                        recommendations.map((rec, idx) => {
                            const dc = difficultyColors[rec.difficulty] || difficultyColors.medium;
                            return (
                                <div key={idx} className={`rec-card priority-${rec.priority}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <div className="rec-icon">
                                            {rec.type === 'skill-gap' ? '📚' : '⚡'}
                                        </div>
                                        <span style={{
                                            fontSize: '0.65rem', fontWeight: 700,
                                            padding: '2px 8px', borderRadius: '4px',
                                            background: dc.bg, color: dc.color, textTransform: 'uppercase'
                                        }}>
                                            {rec.difficulty}
                                        </span>
                                        {rec.language && (
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: 600,
                                                padding: '2px 8px', borderRadius: '4px',
                                                background: 'var(--primary-alpha)', color: 'var(--primary)'
                                            }}>
                                                {rec.language}
                                            </span>
                                        )}
                                    </div>
                                    <div className="rec-title">{rec.title}</div>
                                    {rec.reason && <div className="rec-reason">{rec.reason}</div>}
                                    <button
                                        className="rec-action"
                                        onClick={() => navigate('/student/assignments')}
                                    >
                                        Start Learning
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                            );
                        })
                    ) : (
                        <div className="no-recs">
                            Keep solving problems to get personalized recommendations!
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AIRecommendations;
