import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Brain, CheckCircle, XCircle, Clock, Eye, ChevronDown, ChevronUp, FileText,
    Code, Database, MessageSquare, Shield, Target, AlertTriangle, BarChart2,
    ArrowLeft, Loader2, Award, TrendingUp, BookOpen, Activity, Map, Zap, Smartphone, Maximize, ArrowLeftRight, Camera
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function SkillSubmissions({ user, isAdmin = false }) {
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [filter, setFilter] = useState('all');
    const [submissionDetails, setSubmissionDetails] = useState({}); // Cache for detailed reports
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => { loadSubmissions(); }, []);

    const loadSubmissions = async () => {
        try {
            setLoading(true);
            const url = isAdmin
                ? `${API}/api/skill-tests/admin/all-submissions`
                : `${API}/api/skill-tests/student/submissions?studentId=${encodeURIComponent(user?.id || user?.userId || user?.email || '')}`;
            const { data } = await axios.get(url);
            setSubmissions(data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = async (id) => {
        if (expandedId === id) {
            setExpandedId(null);
            return;
        }

        setExpandedId(id);

        // Fetch details if not already cached
        if (!submissionDetails[id]) {
            try {
                setLoadingDetails(true);
                const { data } = await axios.get(`${API}/api/skill-tests/report/${id}`);
                setSubmissionDetails(prev => ({ ...prev, [id]: data }));
            } catch (err) {
                console.error("Failed to fetch report details", err);
            } finally {
                setLoadingDetails(false);
            }
        }
    };

    const filtered = filter === 'all' ? submissions
        : filter === 'passed' ? submissions.filter(s => s.overall_status === 'completed')
            : filter === 'failed' ? submissions.filter(s => s.overall_status === 'failed')
                : submissions.filter(s => s.overall_status === 'in_progress');

    const stats = {
        total: submissions.length,
        passed: submissions.filter(s => s.overall_status === 'completed').length,
        failed: submissions.filter(s => s.overall_status === 'failed').length,
        inProgress: submissions.filter(s => s.overall_status === 'in_progress').length
    };

    const stageColors = { passed: '#22c55e', failed: '#ef4444', in_progress: '#f59e0b', pending: '#64748b' };
    const diffColors = { easy: '#22c55e', medium: '#f59e0b', hard: '#ef4444', mixed: '#8b5cf6' };

    if (loading) return (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ marginTop: '12px', fontSize: '14px' }}>Loading submissions...</p>
        </div>
    );

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '12px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
                    }}>
                        <FileText size={22} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f1f5f9' }}>
                            {isAdmin ? 'All Skill Test Submissions' : 'My Skill Test Submissions'}
                        </h2>
                        <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>
                            {isAdmin ? 'View all student assessment results' : 'View your assessment results & reports'}
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px' }}>{error}</div>
            )}

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Total', value: stats.total, icon: <BarChart2 size={18} />, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
                    { label: 'Passed', value: stats.passed, icon: <CheckCircle size={18} />, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
                    { label: 'Failed', value: stats.failed, icon: <XCircle size={18} />, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                    { label: 'In Progress', value: stats.inProgress, icon: <Clock size={18} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
                ].map(s => (
                    <div key={s.label} style={{
                        background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
                        padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>{s.icon}</div>
                        <div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'all', label: `All (${stats.total})` },
                    { key: 'passed', label: `Passed (${stats.passed})` },
                    { key: 'failed', label: `Failed (${stats.failed})` },
                    { key: 'in_progress', label: `In Progress (${stats.inProgress})` }
                ].map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)} style={{
                        padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        fontWeight: 600, fontSize: '13px', transition: 'all 0.2s',
                        background: filter === f.key ? '#8b5cf6' : '#1e293b',
                        color: filter === f.key ? 'white' : '#94a3b8'
                    }}>{f.label}</button>
                ))}
            </div>

            {/* Submissions List */}
            {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', background: '#1e293b', borderRadius: '16px', border: '2px dashed #334155' }}>
                    <Brain size={40} color="#8b5cf6" style={{ marginBottom: '12px' }} />
                    <p style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px' }}>No submissions found</p>
                    <p style={{ fontSize: '13px', margin: 0 }}>
                        {filter !== 'all' ? 'Try a different filter' : isAdmin ? 'No students have taken any skill tests yet' : 'Take a skill test to see your submissions here'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filtered.map(sub => {
                        const isExpanded = expandedId === sub.id;
                        const report = sub.report;
                        // Calculate overall score (safely)
                        const s_mcq = Number(sub.mcq_score) || 0;
                        const s_coding = Number(sub.coding_score) || 0;
                        const s_sql = Number(sub.sql_score) || 0;
                        // Interview is typically 0-10, so multiply by 10 to normalize to percentage if included
                        const s_interview = (Number(sub.interview_score) || 0) * 10;

                        const overallScore = Math.round((s_mcq + s_coding + s_sql + s_interview) / 4);

                        return (
                            <div key={sub.id} style={{
                                background: '#1e293b', border: '1px solid #334155', borderRadius: '14px',
                                overflow: 'hidden', transition: 'all 0.2s',
                                borderLeft: `4px solid ${sub.overall_status === 'completed' ? '#22c55e' : sub.overall_status === 'failed' ? '#ef4444' : '#f59e0b'}`
                            }}>
                                {/* Card Header */}
                                <div onClick={() => toggleExpand(sub.id)}
                                    style={{ padding: '18px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>{sub.title}</h3>
                                            {isAdmin && <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>by {sub.student_name || sub.student_id}</span>}
                                            <span style={{
                                                padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                                background: sub.overall_status === 'completed' ? 'rgba(34,197,94,0.15)' : sub.overall_status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                color: sub.overall_status === 'completed' ? '#6ee7b7' : sub.overall_status === 'failed' ? '#fca5a5' : '#fcd34d'
                                            }}>
                                                {sub.overall_status === 'completed' ? 'PASSED' : sub.overall_status === 'failed' ? 'FAILED' : 'IN PROGRESS'}
                                            </span>
                                            {sub.difficulty_level && (
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 700,
                                                    background: `${diffColors[sub.difficulty_level]}15`,
                                                    color: diffColors[sub.difficulty_level]
                                                }}>{sub.difficulty_level.toUpperCase()}</span>
                                            )}
                                            <span style={{ fontSize: '11px', color: '#64748b' }}>Attempt #{sub.attempt_number}</span>
                                        </div>

                                        {/* Score pills */}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                            {[
                                                { label: 'MCQ', score: sub.mcq_score, status: sub.mcq_status, icon: <Brain size={11} />, isPercent: true },
                                                { label: 'Coding', score: sub.coding_score, status: sub.coding_status, icon: <Code size={11} />, isPercent: true },
                                                { label: 'SQL', score: sub.sql_score, status: sub.sql_status, icon: <Database size={11} />, isPercent: true },
                                                { label: 'Interview', score: sub.interview_score, status: sub.interview_status, icon: <MessageSquare size={11} />, isPercent: false }
                                            ].map(s => (
                                                <span key={s.label} style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                                                    background: '#0f172a', border: '1px solid #334155',
                                                    color: stageColors[s.status] || '#64748b'
                                                }}>
                                                    {s.icon} {s.label}: {s.status === 'pending' ? '—' : s.isPercent ? `${Math.round(s.score || 0)}%` : `${(s.score || 0).toFixed(1)}/10`}
                                                </span>
                                            ))}
                                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                                                <Clock size={11} style={{ verticalAlign: 'middle' }} /> {new Date(sub.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {/* Overall score circle */}
                                        {sub.overall_status !== 'in_progress' && (
                                            <div style={{
                                                width: '48px', height: '48px', borderRadius: '50%', display: 'flex',
                                                flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                background: `${sub.overall_status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                                                border: `2px solid ${sub.overall_status === 'completed' ? '#22c55e' : '#ef4444'}`
                                            }}>
                                                <span style={{ fontSize: '14px', fontWeight: 800, color: sub.overall_status === 'completed' ? '#22c55e' : '#ef4444' }}>{overallScore}%</span>
                                            </div>
                                        )}
                                        {isExpanded ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
                                    </div>
                                </div>

                                {/* Expanded Report */}
                                {isExpanded && (
                                    <div style={{ borderTop: '1px solid #334155', padding: '20px', background: '#0f172a' }}>

                                        {/* Proctoring Violations */}
                                        {submissionDetails[sub.id]?.violations?.length > 0 ? (
                                            <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px' }}>
                                                <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Shield size={16} /> Proctoring Violations Detected ({submissionDetails[sub.id].violations.length})
                                                </h4>
                                                <div style={{ maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
                                                    {submissionDetails[sub.id].violations.map((v, i) => (
                                                        <div key={i} style={{ display: 'flex', gap: '12px', fontSize: '12px', marginBottom: '6px', alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
                                                            <span style={{ color: '#cbd5e1', fontFamily: 'monospace', opacity: 0.7 }}>{new Date(v.created_at).toLocaleTimeString()}</span>
                                                            <span style={{ fontWeight: 700, color: v.severity === 'high' ? '#ef4444' : '#f59e0b', minWidth: '120px' }}>
                                                                {v.event_type.replace(/_/g, ' ').toUpperCase()}
                                                            </span>
                                                            <span style={{ color: '#cbd5e1' }}>{v.details}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : loadingDetails && !submissionDetails[sub.id] ? (
                                            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                                Loading details...
                                            </div>
                                        ) : null}

                                        {/* Placement Readiness & Detailed Analysis (New) */}
                                        {submissionDetails[sub.id]?.overall_rating && (
                                            <div style={{ marginBottom: '32px', animation: 'fadeIn 0.5s' }}>
                                                {/* Hero Summary */}
                                                <div style={{
                                                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                                                    padding: '24px', borderRadius: '16px',
                                                    border: '1px solid #334155', allowOverflow: 'hidden', position: 'relative'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                                        <div>
                                                            <div style={{ textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px', color: '#94a3b8', fontWeight: 700, marginBottom: '4px' }}>
                                                                Placement Readiness Assessment
                                                            </div>
                                                            <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, background: 'linear-gradient(90deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                                                {submissionDetails[sub.id].overall_rating} Candidate
                                                            </h3>
                                                        </div>
                                                        <div style={{
                                                            padding: '8px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
                                                            background: submissionDetails[sub.id].overall_rating === 'Excellent' ? 'rgba(34,197,94,0.2)' :
                                                                submissionDetails[sub.id].overall_rating === 'Good' ? 'rgba(59,130,246,0.2)' : 'rgba(234,179,8,0.2)',
                                                            color: submissionDetails[sub.id].overall_rating === 'Excellent' ? '#4ade80' :
                                                                submissionDetails[sub.id].overall_rating === 'Good' ? '#60a5fa' : '#facc15',
                                                            border: '1px solid currentColor',
                                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                                        }}>
                                                            {submissionDetails[sub.id].overall_rating}
                                                        </div>
                                                    </div>

                                                    <p style={{ color: '#cbd5e1', lineHeight: '1.7', fontSize: '14px', borderLeft: '3px solid #6366f1', paddingLeft: '16px', marginBottom: '24px' }}>
                                                        {submissionDetails[sub.id].summary}
                                                    </p>

                                                    {/* Concept Mastery Grid */}
                                                    {submissionDetails[sub.id].concept_mastery && (
                                                        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #334155' }}>
                                                            <h5 style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <Activity size={14} /> Concept Mastery
                                                            </h5>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px 24px' }}>
                                                                {Object.entries(submissionDetails[sub.id].concept_mastery).map(([concept, score]) => (
                                                                    <div key={concept}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', fontWeight: 500 }}>
                                                                            <span style={{ color: '#e2e8f0' }}>{concept}</span>
                                                                            <span style={{ color: score > 75 ? '#4ade80' : score > 50 ? '#facc15' : '#f87171' }}>{score}%</span>
                                                                        </div>
                                                                        <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                                                                            <div style={{
                                                                                width: `${score}%`, height: '100%',
                                                                                background: `linear-gradient(90deg, ${score > 75 ? '#22c55e' : score > 50 ? '#eab308' : '#ef4444'}, ${score > 75 ? '#4ade80' : score > 50 ? '#facc15' : '#f87171'})`,
                                                                                borderRadius: '3px',
                                                                                transition: 'width 1s ease-out'
                                                                            }} />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Strengths & Weaknesses */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                                                    <div style={{ background: 'rgba(34, 197, 94, 0.03)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(34, 197, 94, 0.15)' }}>
                                                        <h4 style={{ color: '#4ade80', fontSize: '15px', fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Zap size={18} fill="rgba(34, 197, 94, 0.2)" /> Key Strengths
                                                        </h4>
                                                        <ul style={{ margin: 0, paddingLeft: '20px', color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6' }}>
                                                            {submissionDetails[sub.id].strengths?.map((s, i) => <li key={i} style={{ marginBottom: '8px' }}>{s}</li>)}
                                                        </ul>
                                                    </div>
                                                    <div style={{ background: 'rgba(239, 68, 68, 0.03)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                                                        <h4 style={{ color: '#f87171', fontSize: '15px', fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Target size={18} /> Areas for Improvement
                                                        </h4>
                                                        <ul style={{ margin: 0, paddingLeft: '20px', color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6' }}>
                                                            {submissionDetails[sub.id].weaknesses?.map((w, i) => <li key={i} style={{ marginBottom: '8px' }}>{w}</li>)}
                                                        </ul>
                                                    </div>
                                                </div>

                                                {/* 4-Week Roadmap */}
                                                {submissionDetails[sub.id].roadmap && (
                                                    <div style={{ marginTop: '20px', background: '#0f172a', padding: '24px', borderRadius: '16px', border: '1px solid #1e293b' }}>
                                                        <h4 style={{ color: '#f8fafc', fontSize: '16px', fontWeight: 700, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <Map size={20} color="#818cf8" />
                                                            Personalized 4-Week Growth Plan
                                                        </h4>
                                                        <div style={{ display: 'grid', gap: '16px' }}>
                                                            {submissionDetails[sub.id].roadmap.map((step, idx) => (
                                                                <div key={idx} style={{ display: 'flex', gap: '16px', paddingBottom: idx !== submissionDetails[sub.id].roadmap.length - 1 ? '16px' : 0, borderBottom: idx !== submissionDetails[sub.id].roadmap.length - 1 ? '1px dashed #334155' : 'none' }}>
                                                                    <div style={{
                                                                        minWidth: '40px', height: '40px', borderRadius: '50%', background: '#312e81', color: '#a5b4fc',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0
                                                                    }}>W{step.week || idx + 1}</div>
                                                                    <div>
                                                                        <h5 style={{ margin: '0 0 6px', color: '#e2e8f0', fontSize: '14px' }}>{step.focus_area}</h5>
                                                                        <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
                                                                            {Array.isArray(step.action_items) ? (
                                                                                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                                                                                    {step.action_items.map((item, ii) => <li key={ii}>{item}</li>)}
                                                                                </ul>
                                                                            ) : step.action_items}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Section Breakdown */}
                                        <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <BarChart2 size={16} color="#8b5cf6" /> Section Breakdown
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
                                            {[
                                                { label: 'MCQ', score: sub.mcq_score, status: sub.mcq_status, color: '#8b5cf6', icon: <Brain size={16} />, isPercent: true },
                                                { label: 'Coding', score: sub.coding_score, status: sub.coding_status, color: '#3b82f6', icon: <Code size={16} />, isPercent: true },
                                                { label: 'SQL', score: sub.sql_score, status: sub.sql_status, color: '#10b981', icon: <Database size={16} />, isPercent: true },
                                                { label: 'Interview', score: sub.interview_score, status: sub.interview_status, color: '#f59e0b', icon: <MessageSquare size={16} />, isPercent: false }
                                            ].map(s => {
                                                const isPassed = s.status === 'passed';
                                                const isFailed = s.status === 'failed';
                                                const isPending = s.status === 'pending';
                                                return (
                                                    <div key={s.label} style={{
                                                        background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
                                                        padding: '14px', textAlign: 'center', opacity: isPending ? 0.5 : 1
                                                    }}>
                                                        <div style={{ color: s.color, marginBottom: '6px' }}>{s.icon}</div>
                                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>{s.label}</div>
                                                        {isPending ? (
                                                            <div style={{ fontSize: '13px', color: '#64748b' }}>Not attempted</div>
                                                        ) : (
                                                            <>
                                                                <div style={{ fontSize: '22px', fontWeight: 800, color: isPassed ? '#22c55e' : '#ef4444' }}>
                                                                    {s.isPercent ? `${Math.round(s.score || 0)}%` : `${(s.score || 0).toFixed(1)}/10`}
                                                                </div>
                                                                <div style={{
                                                                    marginTop: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '10px',
                                                                    fontWeight: 700, display: 'inline-block',
                                                                    background: isPassed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                                                    color: isPassed ? '#34d399' : '#f87171'
                                                                }}>{isPassed ? 'PASSED' : 'FAILED'}</div>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* AI Report */}
                                        {report && (
                                            <div style={{ marginBottom: '16px' }}>
                                                <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Brain size={16} color="#8b5cf6" /> AI Assessment Report
                                                </h4>

                                                {/* Overall Assessment */}
                                                {report.overall_assessment && (
                                                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#8b5cf6', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Award size={14} /> Overall Assessment
                                                        </div>
                                                        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.7, color: '#cbd5e1' }}>{report.overall_assessment}</p>
                                                    </div>
                                                )}

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                                    {/* Strengths */}
                                                    {report.strengths && report.strengths.length > 0 && (
                                                        <div style={{ background: '#1e293b', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '14px' }}>
                                                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <TrendingUp size={14} /> Strengths
                                                            </div>
                                                            <ul style={{ margin: 0, paddingLeft: '16px' }}>
                                                                {report.strengths.map((s, i) => (
                                                                    <li key={i} style={{ fontSize: '12px', lineHeight: 1.6, color: '#cbd5e1', marginBottom: '3px' }}>{s}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Weaknesses */}
                                                    {report.weaknesses && report.weaknesses.length > 0 && (
                                                        <div style={{ background: '#1e293b', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '14px' }}>
                                                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <AlertTriangle size={14} /> Areas for Improvement
                                                            </div>
                                                            <ul style={{ margin: 0, paddingLeft: '16px' }}>
                                                                {report.weaknesses.map((w, i) => (
                                                                    <li key={i} style={{ fontSize: '12px', lineHeight: 1.6, color: '#cbd5e1', marginBottom: '3px' }}>{w}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Recommendations */}
                                                {report.recommendations && report.recommendations.length > 0 && (
                                                    <div style={{ background: '#1e293b', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <BookOpen size={14} /> Recommendations
                                                        </div>
                                                        <ul style={{ margin: 0, paddingLeft: '16px' }}>
                                                            {report.recommendations.map((r, i) => (
                                                                <li key={i} style={{ fontSize: '12px', lineHeight: 1.6, color: '#cbd5e1', marginBottom: '3px' }}>{r}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Skill Ratings */}
                                                {report.skill_ratings && Object.keys(report.skill_ratings).length > 0 && (
                                                    <div style={{ background: '#1e293b', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '10px', padding: '14px' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#8b5cf6', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Target size={14} /> Skill Ratings
                                                        </div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                            {Object.entries(report.skill_ratings).map(([skill, rating]) => (
                                                                <div key={skill} style={{
                                                                    padding: '6px 14px', background: '#0f172a', borderRadius: '8px',
                                                                    border: '1px solid #334155', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'
                                                                }}>
                                                                    <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{skill}</span>
                                                                    <span style={{
                                                                        fontWeight: 800,
                                                                        color: rating >= 8 ? '#22c55e' : rating >= 6 ? '#f59e0b' : '#ef4444'
                                                                    }}>{rating}/10</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {!report && sub.overall_status !== 'in_progress' && (
                                            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px' }}>
                                                <AlertTriangle size={20} style={{ marginBottom: '6px' }} />
                                                <p style={{ margin: 0 }}>Report is being generated. Please refresh in a moment.</p>
                                            </div>
                                        )}

                                        {/* Skills Tested */}
                                        {sub.skills && sub.skills.length > 0 && (
                                            <div style={{ marginTop: '12px' }}>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>Skills Tested:</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {sub.skills.map(s => (
                                                        <span key={s} style={{
                                                            padding: '3px 10px', background: 'rgba(139,92,246,0.1)', color: '#a78bfa',
                                                            borderRadius: '16px', fontSize: '11px', fontWeight: 500, border: '1px solid rgba(139,92,246,0.2)'
                                                        }}>{s}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
