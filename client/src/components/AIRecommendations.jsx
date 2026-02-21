import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { Zap, BookOpen, ArrowRight } from 'lucide-react';
import '../styles/AIRecommendations.css';

const AIRecommendations = () => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [recommendations, setRecommendations] = useState([]);
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

            {loading ? (
                <div className="loading">Analyzing your performance...</div>
            ) : (
                <div className="recommendations-grid">
                    {recommendations.length > 0 ? (
                        recommendations.map((rec, idx) => (
                            <div key={idx} className={`rec-card priority-${rec.priority}`}>
                                <div className="rec-icon">
                                    {rec.type === 'skill-gap' ? '📚' : '⚡'}
                                </div>
                                <div className="rec-title">{rec.title}</div>
                                <div className="rec-reason">{rec.reason}</div>
                                <div className="rec-problems">
                                    {rec.suggestedProblems?.map((prob, pidx) => (
                                        <div key={pidx} className="problem-chip">
                                            {prob}
                                        </div>
                                    ))}
                                </div>
                                <button className="rec-action">
                                    Start Learning
                                    <ArrowRight size={14} />
                                </button>
                            </div>
                        ))
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
