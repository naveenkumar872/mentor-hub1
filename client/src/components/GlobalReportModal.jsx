import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
    Globe, Target, CheckCircle, XCircle, X, AlertTriangle,
    Clock, Award, Brain, Code, Database, ChevronDown, ChevronUp,
    Shield, BarChart2, Zap, TrendingUp
} from 'lucide-react'

const API_BASE = 'http://localhost:3000/api'

function GlobalReportModal({ submissionId, onClose, isStudentView = false }) {
    const [loading, setLoading] = useState(true)
    const [report, setReport] = useState(null)
    const [error, setError] = useState(null)
    const [expandedSections, setExpandedSections] = useState({
        aptitude: true,
        verbal: false,
        logical: false,
        coding: false,
        sql: false
    })

    useEffect(() => {
        if (submissionId) {
            setLoading(true)
            axios.get(`${API_BASE}/global-test-submissions/${submissionId}/report`)
                .then(res => {
                    setReport(res.data)
                    setLoading(false)
                })
                .catch(err => {
                    console.error('Failed to load global test report:', err)
                    setError('Failed to load report details')
                    setLoading(false)
                })
        }
    }, [submissionId])

    if (!submissionId) return null

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }))
    }

    const getScoreColor = (percentage) => {
        if (percentage >= 80) return '#10b981'
        if (percentage >= 60) return '#f59e0b'
        return '#ef4444'
    }

    const getSectionIcon = (section) => {
        switch (section) {
            case 'aptitude': return <Brain size={20} />
            case 'verbal': return <Zap size={20} />
            case 'logical': return <TrendingUp size={20} />
            case 'coding': return <Code size={20} />
            case 'sql': return <Database size={20} />
            default: return <Target size={20} />
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            backdropFilter: 'blur(8px)'
        }}>
            <div
                className="modal-content"
                onClick={e => e.stopPropagation()}
                style={{
                    width: '95%',
                    maxWidth: '1100px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    background: '#0f172a',
                    borderRadius: '24px',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
            >
                {/* Header */}
                <div className="modal-header" style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(6, 182, 212, 0.05))'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 8px 16px rgba(139, 92, 246, 0.2)'
                        }}>
                            <Globe size={26} color="white" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
                                Global Assessment Report
                            </h2>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                                {loading ? 'Loading...' : report?.testInfo.title}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '0.6rem',
                        cursor: 'pointer',
                        color: '#94a3b8',
                        transition: 'all 0.2s'
                    }}
                        onMouseOver={e => e.currentTarget.style.color = 'white'}
                        onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '5rem' }}>
                            <div style={{
                                width: '50px',
                                height: '50px',
                                border: '3px solid rgba(139, 92, 246, 0.2)',
                                borderTopColor: '#8b5cf6',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                margin: '0 auto'
                            }}></div>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            <p style={{ color: '#94a3b8', marginTop: '1.5rem', fontWeight: 500 }}>Analyzing performance data...</p>
                        </div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', padding: '5rem' }}>
                            <AlertTriangle size={64} color="#ef4444" style={{ marginBottom: '1.5rem', opacity: 0.8 }} />
                            <h3 style={{ color: 'white' }}>Oops! Something went wrong</h3>
                            <p style={{ color: '#94a3b8' }}>{error}</p>
                            <button onClick={onClose} style={{
                                marginTop: '1.5rem',
                                padding: '0.75rem 1.5rem',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}>Close Modal</button>
                        </div>
                    ) : (
                        <>
                            {/* Student & Test Overview */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '1.5rem',
                                marginBottom: '2rem'
                            }}>
                                <div style={{
                                    padding: '1.5rem',
                                    background: 'rgba(30, 41, 59, 0.5)',
                                    borderRadius: '16px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1.25rem'
                                }}>
                                    <div style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1.75rem',
                                        fontWeight: 800,
                                        color: 'white'
                                    }}>
                                        {report.studentInfo.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, color: 'white', fontSize: '1.25rem' }}>{report.studentInfo.name}</h3>
                                        <p style={{ margin: '0.25rem 0 0', color: '#94a3b8' }}>{report.studentInfo.email}</p>
                                    </div>
                                </div>

                                <div style={{
                                    padding: '1.5rem',
                                    background: report.overallPerformance.status === 'passed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: '16px',
                                    border: `1px solid ${report.overallPerformance.status === 'passed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{
                                            fontSize: '2.5rem',
                                            fontWeight: 900,
                                            color: getScoreColor(report.overallPerformance.percentage),
                                            lineHeight: 1
                                        }}>
                                            {report.overallPerformance.percentage}%
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Overall Score</div>
                                    </div>
                                    <div style={{
                                        padding: '0.75rem 1.5rem',
                                        borderRadius: '12px',
                                        background: report.overallPerformance.status === 'passed' ? '#10b981' : '#ef4444',
                                        color: 'white',
                                        fontWeight: 800,
                                        fontSize: '1.1rem',
                                        boxShadow: `0 8px 20px ${report.overallPerformance.status === 'passed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                    }}>
                                        {report.overallPerformance.status.toUpperCase()}
                                    </div>
                                </div>
                            </div>

                            {/* Section breakdown cards */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(5, 1fr)',
                                gap: '1rem',
                                marginBottom: '2.5rem'
                            }}>
                                {Object.entries(report.sectionWisePerformance).map(([sec, data]) => (
                                    <div key={sec} style={{
                                        padding: '1.25rem',
                                        background: 'rgba(30, 41, 59, 0.5)',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        textAlign: 'center',
                                        transition: 'transform 0.2s',
                                        cursor: 'pointer'
                                    }}
                                        onClick={() => toggleSection(sec)}
                                        onMouseOver={e => e.currentTarget.style.transform = 'translateY(-5px)'}
                                        onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '10px',
                                            background: 'rgba(255,255,255,0.05)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            margin: '0 auto 1rem',
                                            color: getScoreColor(data.percentage)
                                        }}>
                                            {getSectionIcon(sec)}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>{sec}</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>{data.percentage}%</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>{data.correctCount}/{data.totalQuestions} Correct</div>
                                    </div>
                                ))}
                            </div>

                            {/* Recommendations & insights */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
                                <div style={{ padding: '1.5rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                    <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                                        <Award size={20} /> Strengths
                                    </h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {report.strengths.length > 0 ? report.strengths.map((s, i) => (
                                            <span key={i} style={{ padding: '0.4rem 0.8rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', fontSize: '0.85rem', color: '#10b981', fontWeight: 600 }}>{s}</span>
                                        )) : <span style={{ color: '#64748b', fontSize: '0.9rem' }}>No specific strengths identified yet.</span>}
                                    </div>
                                </div>
                                <div style={{ padding: '1.5rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                    <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171' }}>
                                        <TrendingUp size={20} /> Areas for Improvement
                                    </h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {report.weaknesses.length > 0 ? report.weaknesses.map((w, i) => (
                                            <span key={i} style={{ padding: '0.4rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', fontSize: '0.85rem', color: '#f87171', fontWeight: 600 }}>{w}</span>
                                        )) : <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Excellent performance across all areas!</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Section Results */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <h3 style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                    <BarChart2 size={24} color="#8b5cf6" />
                                    Detailed Question Analysis
                                </h3>

                                {Object.entries(report.questionResultsBySection).map(([section, questions]) => (
                                    <div key={section} style={{
                                        background: 'rgba(30, 41, 59, 0.3)',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        overflow: 'hidden'
                                    }}>
                                        <button
                                            onClick={() => toggleSection(section)}
                                            style={{
                                                width: '100%',
                                                padding: '1.25rem 1.5rem',
                                                background: 'transparent',
                                                border: 'none',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                color: 'white'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ color: getScoreColor(report.sectionWisePerformance[section]?.percentage) }}>
                                                    {getSectionIcon(section)}
                                                </div>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 700, textTransform: 'capitalize' }}>{section} Section</span>
                                                <span style={{
                                                    fontSize: '0.85rem',
                                                    padding: '0.2rem 0.6rem',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    borderRadius: '6px',
                                                    color: '#94a3b8'
                                                }}>
                                                    {report.sectionWisePerformance[section]?.percentage}% • {questions.length} Questions
                                                </span>
                                            </div>
                                            {expandedSections[section] ? <ChevronUp size={20} color="#64748b" /> : <ChevronDown size={20} color="#64748b" />}
                                        </button>

                                        {expandedSections[section] && (
                                            <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {questions.length > 0 ? questions.map((q, idx) => (
                                                    <div key={idx} style={{
                                                        padding: '1.25rem',
                                                        background: q.is_correct ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)',
                                                        border: `1px solid ${q.is_correct ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
                                                        borderRadius: '12px'
                                                    }}>
                                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                                            <div style={{
                                                                width: '32px', height: '32px', borderRadius: '50%',
                                                                background: q.is_correct ? '#10b981' : '#ef4444',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: 'white', fontWeight: 800, flexShrink: 0
                                                            }}>
                                                                {q.is_correct ? '✓' : '✗'}
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <p style={{ margin: '0 0 1rem', color: '#e2e8f0', fontWeight: 500, lineHeight: 1.5 }}>{q.question}</p>

                                                                {(section === 'coding' || section === 'sql') ? (
                                                                    <div style={{ background: '#020617', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>
                                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Your Code Submission</div>
                                                                        <pre style={{ margin: 0, color: '#e2e8f0', fontSize: '0.85rem' }}>{q.user_answer}</pre>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: q.is_correct ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                                                                            <span style={{ fontSize: '0.85rem', color: '#94a3b8', minWidth: '100px' }}>Your Answer:</span>
                                                                            <span style={{ fontWeight: 600, color: q.is_correct ? '#10b981' : '#f87171' }}>{q.user_answer || '(No answer)'}</span>
                                                                        </div>
                                                                        {!q.is_correct && (
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px' }}>
                                                                                <span style={{ fontSize: '0.85rem', color: '#94a3b8', minWidth: '100px' }}>Correct Answer:</span>
                                                                                <span style={{ fontWeight: 600, color: '#10b981' }}>{q.correct_answer}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {q.explanation && (
                                                                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                                            <Shield size={14} color="#8b5cf6" />
                                                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase' }}>Explanation</span>
                                                                        </div>
                                                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>{q.explanation}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No questions found in this section.</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default GlobalReportModal
