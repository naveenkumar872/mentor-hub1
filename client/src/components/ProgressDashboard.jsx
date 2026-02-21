import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { TrendingUp, CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';
import '../styles/ProgressDashboard.css';

const ProgressDashboard = ({ socket }) => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submissionTimeline, setSubmissionTimeline] = useState([]);
    const [conceptMastery, setConceptMastery] = useState([]);
    const [streak, setStreak] = useState(0);
    const [timeFrame, setTimeFrame] = useState('30'); // days

    const token = localStorage.getItem('authToken');
    const studentId = user?.id;

    // Fetch analytics
    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const response = await fetch(
                `/api/analytics/student/${studentId}?period=${timeFrame}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (!response.ok) throw new Error('Failed to fetch analytics');

            const data = await response.json();
            setAnalytics(data);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch submission timeline
    const fetchTimeline = async () => {
        try {
            const response = await fetch(
                `/api/submissions?userId=${studentId}&limit=50`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (!response.ok) throw new Error('Failed to fetch timeline');

            const { submissions } = await response.json();
            setSubmissionTimeline(
                submissions
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .slice(0, 20)
            );
        } catch (error) {
            console.error('Error fetching timeline:', error);
        }
    };

    // Fetch concept mastery
    const fetchConceptMastery = async () => {
        try {
            const response = await fetch(
                `/api/learning/concept-mastery/${studentId}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (!response.ok) throw new Error('Failed to fetch mastery');

            const data = await response.json();
            setConceptMastery(data.concepts || []);
        } catch (error) {
            console.error('Error fetching mastery:', error);
        }
    };

    // Fetch streak
    const fetchStreak = async () => {
        try {
            const response = await fetch(
                `/api/gamification/streak/${studentId}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (!response.ok) throw new Error('Failed to fetch streak');

            const data = await response.json();
            setStreak(data.currentStreak || 0);
        } catch (error) {
            console.error('Error fetching streak:', error);
        }
    };

    // Initialize
    useEffect(() => {
        if (studentId) {
            fetchAnalytics();
            fetchTimeline();
            fetchConceptMastery();
            fetchStreak();
        }
    }, [studentId, timeFrame]);

    const getStatusColor = (status) => {
        if (status === 'success') return '#00aa00';
        if (status === 'failed') return '#dd0000';
        return '#ff8800';
    };

    const getStatusIcon = (status) => {
        if (status === 'success') return '✅';
        if (status === 'failed') return '❌';
        return '⏳';
    };

    if (loading || !analytics) {
        return <div className={`progress-dashboard ${theme} loading`}>Loading your progress...</div>;
    }

    return (
        <div className={`progress-dashboard ${theme}`}>
            {/* Header */}
            <div className="progress-header">
                <h1>📊 Your Progress</h1>
                <select
                    value={timeFrame}
                    onChange={(e) => setTimeFrame(e.target.value)}
                    className="timeframe-select"
                >
                    <option value="7">Last 7 Days</option>
                    <option value="30">Last 30 Days</option>
                    <option value="90">Last 90 Days</option>
                    <option value="365">Last Year</option>
                </select>
            </div>

            {/* KPI Cards */}
            <div className="kpi-cards">
                <div className="kpi-card">
                    <div className="kpi-icon">✅</div>
                    <div className="kpi-content">
                        <div className="kpi-label">Problems Solved</div>
                        <div className="kpi-value">{analytics.problemsSolved || 0}</div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon">📈</div>
                    <div className="kpi-content">
                        <div className="kpi-label">Success Rate</div>
                        <div className="kpi-value">{Math.round(analytics.successRate || 0)}%</div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon">🔥</div>
                    <div className="kpi-content">
                        <div className="kpi-label">Current Streak</div>
                        <div className="kpi-value">{streak} days</div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon">⏱️</div>
                    <div className="kpi-content">
                        <div className="kpi-label">Avg Time/Problem</div>
                        <div className="kpi-value">{Math.round(analytics.avgTimePerProblem || 0)}m</div>
                    </div>
                </div>
            </div>

            <div className="progress-grid">
                {/* Concept Mastery Radar */}
                <div className="section">
                    <h2>🎯 Concept Mastery</h2>
                    {conceptMastery.length > 0 ? (
                        <div className="mastery-list">
                            {conceptMastery.slice(0, 8).map((concept) => (
                                <div key={concept.id} className="mastery-item">
                                    <div className="mastery-name">{concept.name}</div>
                                    <div className="mastery-bar">
                                        <div
                                            className="mastery-fill"
                                            style={{
                                                width: `${concept.mastery_percentage || 0}%`,
                                                backgroundColor: concept.mastery_percentage >= 80
                                                    ? '#00aa00'
                                                    : concept.mastery_percentage >= 50
                                                    ? '#ff8800'
                                                    : '#dd0000'
                                            }}
                                        ></div>
                                    </div>
                                    <div className="mastery-value">{concept.mastery_percentage || 0}%</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty-state">Start solving problems to track mastery</p>
                    )}
                </div>

                {/* Submission Timeline */}
                <div className="section">
                    <h2>📝 Recent Submissions</h2>
                    {submissionTimeline.length > 0 ? (
                        <div className="timeline">
                            {submissionTimeline.map((submission) => (
                                <div key={submission.id} className="timeline-item">
                                    <div className="timeline-dot">
                                        <span style={{ color: getStatusColor(submission.status) }}>
                                            {getStatusIcon(submission.status)}
                                        </span>
                                    </div>
                                    <div className="timeline-content">
                                        <div className="timeline-title">{submission.problem_title || 'Problem'}</div>
                                        <div className="timeline-time">
                                            {new Date(submission.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div className="timeline-score">
                                        {submission.score && `${submission.score}%`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty-state">No submissions yet</p>
                    )}
                </div>

                {/* Problem Categories Performance */}
                <div className="section">
                    <h2>📂 Performance by Category</h2>
                    {analytics.categoryPerformance && analytics.categoryPerformance.length > 0 ? (
                        <div className="category-list">
                            {analytics.categoryPerformance.map((cat) => (
                                <div key={cat.category} className="category-item">
                                    <div className="cat-name">{cat.category}</div>
                                    <div className="cat-stats">
                                        <span className="solved">{cat.solved}/{ cat.total}</span>
                                        <div className="cat-bar">
                                            <div
                                                className="cat-fill"
                                                style={{
                                                    width: `${(cat.solved / cat.total) * 100}%`
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty-state">No data available</p>
                    )}
                </div>

                {/* Weekly Activity */}
                <div className="section">
                    <h2>📅 Weekly Activity</h2>
                    {analytics.weeklyActivity ? (
                        <div className="weekly-chart">
                            {Object.entries(analytics.weeklyActivity).map(([day, count]) => (
                                <div key={day} className="week-day">
                                    <div
                                        className="day-bar"
                                        style={{ height: `${Math.min(count * 10, 100)}px` }}
                                    ></div>
                                    <div className="day-label">{day.substring(0, 3)}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty-state">No activity data</p>
                    )}
                </div>

                {/* Difficulty Progress */}
                <div className="section">
                    <h2>⭐ Difficulty Progression</h2>
                    {analytics.difficultyProgression ? (
                        <div className="difficulty-list">
                            {['Easy', 'Medium', 'Hard', 'Expert'].map((diff) => (
                                <div key={diff} className="difficulty-item">
                                    <div className="diff-name">{diff}</div>
                                    <div className="diff-stats">
                                        <span className="count">
                                            {analytics.difficultyProgression[diff.toLowerCase()] || 0}
                                        </span>
                                        <div className="diff-bar">
                                            <div
                                                className="diff-fill"
                                                style={{
                                                    width: `${((analytics.difficultyProgression[diff.toLowerCase()] || 0) / (analytics.problemsSolved || 1)) * 100}%`,
                                                    backgroundColor: diff === 'Easy'
                                                        ? '#00aa00'
                                                        : diff === 'Medium'
                                                        ? '#ff8800'
                                                        : diff === 'Hard'
                                                        ? '#dd0000'
                                                        : '#8800ff'
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty-state">No difficulty data</p>
                    )}
                </div>

                {/* Achievements */}
                <div className="section">
                    <h2>🏆 Achievements</h2>
                    {analytics.achievements && analytics.achievements.length > 0 ? (
                        <div className="achievement-grid">
                            {analytics.achievements.map((ach) => (
                                <div key={ach.id} className="achievement">
                                    <div className="ach-icon">{ach.icon || '🏅'}</div>
                                    <div className="ach-name">{ach.name}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty-state">Solve more problems to earn badges!</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProgressDashboard;
