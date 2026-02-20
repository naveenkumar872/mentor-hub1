/**
 * Predictive Analytics Components
 * - Dashboard with risk scores
 * - At-risk students list
 * - Learning curve charts
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, Target, BookOpen, Award, Activity } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api';

/**
 * Student Risk Score Card
 */
export function RiskScoreCard({ studentId }) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAnalytics();
    }, [studentId]);

    const fetchAnalytics = async () => {
        try {
            const response = await axios.get(`${API_BASE}/analytics/student/${studentId}`);
            setAnalytics(response.data);
        } catch (error) {
            console.error('Error fetching analytics:', error);
            // Set default analytics when none exist
            setAnalytics({
                risk_score: 0,
                at_risk: false,
                problem_completion_rate: 0,
                average_test_score: 0,
                prediction_confidence: 0,
                total_problems: 0,
                total_tests: 0
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading risk data...</div>;
    if (!analytics) return <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No analytics data</div>;

    const getRiskColor = (score) => {
        if (score > 75) return '#ef4444'; // Red
        if (score > 50) return '#f59e0b'; // Orange
        if (score > 25) return '#eab308'; // Yellow
        return '#10b981'; // Green
    };

    const getRiskLevel = (score) => {
        if (score > 75) return 'CRITICAL';
        if (score > 50) return 'HIGH';
        if (score > 25) return 'MEDIUM';
        return 'LOW';
    };

    const riskScore = Number(analytics?.risk_score) || 0;

    return (
        <div style={{
            position: 'relative',
            background: `linear-gradient(135deg, ${getRiskColor(riskScore)}22, ${getRiskColor(riskScore)}11)`,
            border: `2px solid ${getRiskColor(riskScore)}`,
            borderRadius: '12px',
            padding: '1.5rem',
            overflow: 'hidden'
        }}>
            <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '100px',
                height: '100px',
                background: `${getRiskColor(riskScore)}11`,
                borderRadius: '50%',
                transform: 'translate(30%, -30%)'
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem'
                }}>
                    {riskScore > 50 ? (
                        <AlertTriangle size={20} color={getRiskColor(riskScore)} />
                    ) : (
                        <Award size={20} color={getRiskColor(riskScore)} />
                    )}
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                        Risk Assessment
                    </h3>
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.5rem',
                    marginBottom: '1rem'
                }}>
                    <span style={{
                        fontSize: '2.5rem',
                        fontWeight: 900,
                        color: getRiskColor(riskScore)
                    }}>
                        {riskScore.toFixed(1)}
                    </span>
                    <span style={{
                        fontSize: '1rem',
                        color: 'var(--text-muted)'
                    }}>
                        / 100
                    </span>
                </div>

                <div style={{
                    display: 'flex',
                    gap: '1rem',
                    marginBottom: '1rem'
                }}>
                    <span style={{
                        background: getRiskColor(riskScore),
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.85rem',
                        fontWeight: 700
                    }}>
                        {getRiskLevel(riskScore)}
                    </span>
                    {analytics.at_risk && (
                        <span style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: 700
                        }}>
                            ⚠️ At Risk
                        </span>
                    )}
                </div>

                <div style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    lineHeight: '1.6'
                }}>
                    <p>
                        <strong>Completion Rate:</strong> {(Number(analytics?.problem_completion_rate) || 0).toFixed(1)}%
                    </p>
                    <p>
                        <strong>Test Score:</strong> {(Number(analytics?.average_test_score) || 0).toFixed(1)}%
                    </p>
                    <p>
                        <strong>Confidence:</strong> {((Number(analytics?.prediction_confidence) || 0) * 100).toFixed(0)}%
                    </p>
                </div>
            </div>
        </div>
    );
}



/**
 * Learning Curve Chart
 */
export function LearningCurveChart({ analyticsData }) {
    if (!analyticsData?.learning_curve?.timeSeries) {
        return (
            <div style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-muted)'
            }}>
                No learning curve data available
            </div>
        );
    }

    const data = analyticsData.learning_curve.timeSeries;

    return (
        <div>
            <h4 style={{ marginBottom: '1rem', fontWeight: 700 }}>Learning Progress</h4>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis
                        dataKey="date"
                        stroke="var(--text-muted)"
                        style={{ fontSize: '0.85rem' }}
                    />
                    <YAxis
                        stroke="var(--text-muted)"
                        style={{ fontSize: '0.85rem' }}
                        domain={[0, 100]}
                    />
                    <Tooltip
                        contentStyle={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-main)'
                        }}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="successRate"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ fill: 'var(--primary)', r: 4 }}
                        activeDot={{ r: 6 }}
                        name="Success Rate %"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

/**
 * Concept Mastery Visualization
 */
export function ConceptMastery({ analyticsData }) {
    if (!analyticsData?.weak_concepts || analyticsData.weak_concepts.length === 0) {
        return (
            <div style={{
                padding: '1.5rem',
                textAlign: 'center',
                color: 'var(--text-muted)'
            }}>
                No weakness areas identified
            </div>
        );
    }

    const data = analyticsData.weak_concepts.slice(0, 8);

    return (
        <div>
            <h4 style={{ marginBottom: '1rem', fontWeight: 700 }}>Areas for Improvement</h4>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis
                        dataKey="concept"
                        stroke="var(--text-muted)"
                        style={{ fontSize: '0.75rem' }}
                        angle={-45}
                        textAnchor="end"
                        height={100}
                    />
                    <YAxis
                        stroke="var(--text-muted)"
                        style={{ fontSize: '0.85rem' }}
                        domain={[0, 100]}
                    />
                    <Tooltip
                        contentStyle={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-main)'
                        }}
                    />
                    <Bar
                        dataKey="masteryLevel"
                        fill="var(--primary)"
                        radius={[8, 8, 0, 0]}
                        name="Mastery %"
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

/**
 * Recommendations Panel
 */
export function RecommendationsPanel({ studentId }) {
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRecommendations();
    }, [studentId]);

    const fetchRecommendations = async () => {
        try {
            const response = await axios.get(`${API_BASE}/analytics/recommendations/${studentId}`);
            setRecommendations(response.data.recommendations || []);
        } catch (error) {
            console.error('Error fetching recommendations:', error);
            setRecommendations([]);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading recommendations...</div>;

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'high': return '#ef4444';
            case 'medium': return '#f59e0b';
            default: return '#10b981';
        }
    };

    return (
        <div>
            <h4 style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
                fontWeight: 700
            }}>
                <Target size={18} />
                Personalized Recommendations
            </h4>

            {recommendations.length === 0 ? (
                <div style={{
                    padding: '1.5rem',
                    textAlign: 'center',
                    background: 'var(--bg-card)',
                    borderRadius: '8px',
                    color: 'var(--text-muted)'
                }}>
                    Keep up the great work!
                </div>
            ) : (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                }}>
                    {recommendations.map((rec, idx) => (
                        <div
                            key={idx}
                            style={{
                                padding: '1rem',
                                background: 'var(--bg-card)',
                                border: `2px solid ${getPriorityColor(rec.priority)}`,
                                borderRadius: '8px',
                                display: 'flex',
                                gap: '1rem'
                            }}
                        >
                            <div style={{
                                width: '4px',
                                background: getPriorityColor(rec.priority),
                                borderRadius: '2px',
                                flexShrink: 0
                            }} />
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontWeight: 700,
                                    marginBottom: '0.3rem'
                                }}>
                                    {rec.title}
                                </div>
                                <div style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--text-muted)',
                                    lineHeight: '1.5'
                                }}>
                                    {rec.description}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default {
    RiskScoreCard,

    LearningCurveChart,
    ConceptMastery,
    RecommendationsPanel
};
