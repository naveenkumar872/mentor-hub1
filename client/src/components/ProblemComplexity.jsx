import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../App';
import { TrendingUp, BarChart3, Clock, Target, AlertCircle } from 'lucide-react';
import '../styles/ProblemComplexity.css';

const ProblemComplexity = ({ problemId }) => {
    const { theme } = useContext(ThemeContext);
    const [complexityData, setComplexityData] = useState(null);
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const token = localStorage.getItem('authToken');

    useEffect(() => {
        if (problemId) {
            loadComplexityData();
        }
    }, [problemId]);

    const loadComplexityData = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/problems/${problemId}/complexity-analysis`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load complexity data');

            const data = await response.json();
            setComplexityData(data);
            generateRecommendations(data);
        } catch (err) {
            console.error('Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const generateRecommendations = (data) => {
        const recs = [];

        if (data.difficulty_score >= 8) {
            recs.push({
                type: 'warning',
                icon: '⚠️',
                text: 'Very difficult problem - Break down into smaller steps'
            });
        }

        if (data.pass_rate < 30) {
            recs.push({
                type: 'caution',
                icon: '⚡',
                text: 'Low pass rate - Study similar problems first'
            });
        }

        if (data.avg_time_minutes > 120) {
            recs.push({
                type: 'info',
                icon: '⏱️',
                text: 'Takes 2+ hours on average - Plan accordingly'
            });
        }

        if (data.difficulty_score >= 5 && data.difficulty_score < 8) {
            recs.push({
                type: 'success',
                icon: '👍',
                text: 'Good for skill building - Medium challenge level'
            });
        }

        setRecommendations(recs);
    };

    const getDifficultyLabel = (score) => {
        if (score < 3) return { label: 'Beginner', color: 'easy' };
        if (score < 5) return { label: 'Intermediate', color: 'medium' };
        if (score < 7) return { label: 'Advanced', color: 'hard' };
        if (score < 9) return { label: 'Expert', color: 'expert' };
        return { label: 'Master', color: 'master' };
    };

    if (loading) {
        return <div className={`complexity-container ${theme} loading`}>Loading complexity data...</div>;
    }

    if (error) {
        return (
            <div className={`complexity-container ${theme} error`}>
                <AlertCircle size={20} />
                <p>Error: {error}</p>
            </div>
        );
    }

    if (!complexityData) return null;

    const difficulty = getDifficultyLabel(complexityData.difficulty_score);

    return (
        <div className={`complexity-container ${theme}`}>
            {/* Header */}
            <div className="complexity-header">
                <h3>Problem Complexity Analysis</h3>
                <span className={`difficulty-badge ${difficulty.color}`}>
                    {difficulty.label}
                </span>
            </div>

            {/* Main Metrics Grid */}
            <div className="complexity-metrics">
                {/* Difficulty Score */}
                <div className="metric-card">
                    <div className="metric-label">Difficulty Score</div>
                    <div className="metric-value">
                        <div className="score-circle" style={{
                            backgroundColor: `hsl(${(complexityData.difficulty_score / 10) * 120}, 70%, 60%)`
                        }}>
                            {complexityData.difficulty_score.toFixed(1)}
                            <span className="score-max">/10</span>
                        </div>
                    </div>
                    <div className="metric-bar">
                        <div
                            className="bar-fill"
                            style={{ width: `${(complexityData.difficulty_score / 10) * 100}%` }}
                        />
                    </div>
                </div>

                {/* Success Rate */}
                <div className="metric-card">
                    <div className="metric-label">Success Rate</div>
                    <div className="metric-value">
                        <div className="percentage">
                            {complexityData.pass_rate.toFixed(1)}%
                        </div>
                    </div>
                    <div className="metric-bar">
                        <div
                            className="bar-fill success"
                            style={{ width: `${complexityData.pass_rate}%` }}
                        />
                    </div>
                    <div className="metric-detail">
                        {complexityData.successful_submissions} / {complexityData.total_submissions} passed
                    </div>
                </div>

                {/* Average Time */}
                <div className="metric-card">
                    <div className="metric-label">Avg. Time to Solve</div>
                    <div className="metric-value">
                        <Clock size={24} className="metric-icon" />
                        {complexityData.avg_time_minutes < 60
                            ? `${complexityData.avg_time_minutes.toFixed(0)}m`
                            : `${(complexityData.avg_time_minutes / 60).toFixed(1)}h`}
                    </div>
                    <div className="metric-detail">
                        Min: {complexityData.min_time_minutes.toFixed(0)}m | 
                        Max: {complexityData.max_time_minutes.toFixed(0)}m
                    </div>
                </div>

                {/* Attempts per Success */}
                <div className="metric-card">
                    <div className="metric-label">Avg. Attempts</div>
                    <div className="metric-value">
                        <div className="attempts">
                            {complexityData.avg_attempts.toFixed(1)}
                        </div>
                    </div>
                    <div className="metric-detail">
                        per successful submission
                    </div>
                </div>
            </div>

            {/* Complexity Factors */}
            <div className="complexity-factors">
                <h4>Complexity Factors</h4>
                <div className="factors-list">
                    <div className="factor">
                        <div className="factor-icon">📊</div>
                        <div className="factor-details">
                            <div className="factor-name">Problem Structure</div>
                            <div className="factor-bar">
                                <div className="factor-fill" style={{ width: `${complexityData.structure_complexity * 10}%` }} />
                            </div>
                        </div>
                    </div>
                    <div className="factor">
                        <div className="factor-icon">🧩</div>
                        <div className="factor-details">
                            <div className="factor-name">Algorithm Complexity</div>
                            <div className="factor-bar">
                                <div className="factor-fill" style={{ width: `${complexityData.algorithm_complexity * 10}%` }} />
                            </div>
                        </div>
                    </div>
                    <div className="factor">
                        <div className="factor-icon">🎯</div>
                        <div className="factor-details">
                            <div className="factor-name">Edge Cases</div>
                            <div className="factor-bar">
                                <div className="factor-fill" style={{ width: `${complexityData.edge_cases_complexity * 10}%` }} />
                            </div>
                        </div>
                    </div>
                    <div className="factor">
                        <div className="factor-icon">⚙️</div>
                        <div className="factor-details">
                            <div className="factor-name">Implementation Difficulty</div>
                            <div className="factor-bar">
                                <div className="factor-fill" style={{ width: `${complexityData.implementation_complexity * 10}%` }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
                <div className="complexity-recommendations">
                    <h4>
                        <Target size={18} />
                        Recommendations
                    </h4>
                    <div className="recommendations-list">
                        {recommendations.map((rec, idx) => (
                            <div key={idx} className={`recommendation ${rec.type}`}>
                                <span className="rec-icon">{rec.icon}</span>
                                <span className="rec-text">{rec.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Category Difficulty Comparison */}
            <div className="complexity-comparison">
                <h4>Category Difficulty Comparison</h4>
                <div className="comparison-charts">
                    {complexityData.similar_problems && (
                        <div className="comparison-bar">
                            <div className="bar-label">This Problem</div>
                            <div className="bar-container">
                                <div
                                    className="bar-value"
                                    style={{ width: '80px' }}
                                >
                                    {complexityData.difficulty_score.toFixed(1)} / 10
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="comparison-bar">
                        <div className="bar-label">Category Average</div>
                        <div className="bar-container">
                            <div
                                className="bar-value"
                                style={{ width: '80px' }}
                            >
                                {complexityData.category_avg_difficulty.toFixed(1)} / 10
                            </div>
                        </div>
                    </div>
                </div>
                {complexityData.difficulty_score > complexityData.category_avg_difficulty && (
                    <div className="comparison-note above">
                        ⬆️ This problem is harder than average in its category
                    </div>
                )}
                {complexityData.difficulty_score < complexityData.category_avg_difficulty && (
                    <div className="comparison-note below">
                        ⬇️ This problem is easier than average in its category
                    </div>
                )}
            </div>

            {/* Similar Problems */}
            {complexityData.similar_problems && complexityData.similar_problems.length > 0 && (
                <div className="similar-problems">
                    <h4>Similar Difficulty Problems</h4>
                    <div className="problems-list">
                        {complexityData.similar_problems.map(prob => (
                            <div key={prob.id} className="problem-item">
                                <div className="problem-info">
                                    <span className="problem-title">{prob.title}</span>
                                    <span className="problem-category">{prob.category}</span>
                                </div>
                                <div className="problem-score">
                                    <span className={`problem-difficulty ${getDifficultyLabel(prob.difficulty_score).color}`}>
                                        {prob.difficulty_score.toFixed(1)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer Note */}
            <div className="complexity-footer">
                <p className="footer-note">
                    💡 Complexity is calculated from {complexityData.total_submissions} submissions. 
                    Data updates hourly.
                </p>
            </div>
        </div>
    );
};

export default ProblemComplexity;
