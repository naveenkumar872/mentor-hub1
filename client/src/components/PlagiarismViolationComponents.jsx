/**
 * Plagiarism Detection & Violation Scoring Components
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Shield, Check, X, FileText, Eye, Clock } from 'lucide-react';
import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api';

/**
 * Plagiarism Detection Report
 */
export function PlagiarismReport({ submissionId, onAnalyze }) {
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleAnalyze = async () => {
        try {
            setLoading(true);
            const response = await axios.post(`${API_BASE}/plagiarism/analyze`, {
                submissionId
            });
            setAnalysis(response.data.analysis);
            setError(null);
            onAnalyze?.(response.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to analyze submission');
            console.error('Error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1.5rem'
        }}>
            <h4 style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                margin: '0 0 1rem 0',
                fontWeight: 700
            }}>
                <Shield size={20} />
                Plagiarism Analysis
            </h4>

            {!analysis ? (
                <div style={{ textAlign: 'center' }}>
                    <button
                        onClick={handleAnalyze}
                        disabled={loading}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            opacity: loading ? 0.7 : 1
                        }}
                    >
                        {loading ? 'Analyzing...' : 'Analyze for Plagiarism'}
                    </button>
                </div>
            ) : (
                <div>
                    {/* Similarity Scores */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '1rem',
                        marginBottom: '1.5rem'
                    }}>
                        <div style={{
                            background: 'var(--bg-secondary)',
                            padding: '1rem',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Lexical Similarity
                            </div>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 700,
                                color: analysis.lexicalSimilarity > 70 ? '#ef4444' : '#10b981'
                            }}>
                                {analysis.lexicalSimilarity}%
                            </div>
                        </div>
                        <div style={{
                            background: 'var(--bg-secondary)',
                            padding: '1rem',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Structural Similarity
                            </div>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 700,
                                color: analysis.structuralSimilarity > 70 ? '#ef4444' : '#10b981'
                            }}>
                                {analysis.structuralSimilarity}%
                            </div>
                        </div>
                        <div style={{
                            background: 'var(--bg-secondary)',
                            padding: '1rem',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Overall Score
                            </div>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 700,
                                color: analysis.overallScore > 75 ? '#ef4444' : analysis.overallScore > 50 ? '#f59e0b' : '#10b981'
                            }}>
                                {analysis.overallScore}%
                            </div>
                        </div>
                    </div>

                    {/* Severity Badge */}
                    {analysis.flagged && (
                        <div style={{
                            padding: '1rem',
                            background: analysis.severity === 'critical' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            border: `1px solid ${analysis.severity === 'critical' ? '#ef4444' : '#f59e0b'}`,
                            borderRadius: '8px',
                            marginBottom: '1.5rem'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                <AlertTriangle size={18} color={analysis.severity === 'critical' ? '#ef4444' : '#f59e0b'} />
                                <span style={{
                                    fontWeight: 700,
                                    color: analysis.severity === 'critical' ? '#ef4444' : '#f59e0b'
                                }}>
                                    Plagiarism {analysis.severity.toUpperCase()} - Flagged for review
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Matches */}
                    {analysis.matches && analysis.matches.length > 0 && (
                        <div>
                            <h5 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                                Similar Submissions ({analysis.matches.length})
                            </h5>
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                            }}>
                                {analysis.matches.slice(0, 3).map((match, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            padding: '0.75rem',
                                            background: 'var(--bg-secondary)',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem'
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>
                                            {match.studentName || 'Unknown Student'} - {new Date(match.submittedAt).toLocaleDateString()}
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            gap: '1rem',
                                            color: 'var(--text-muted)',
                                            fontSize: '0.8rem'
                                        }}>
                                            <span>Lexical: {match.lexicalSimilarity}%</span>
                                            <span>Structural: {match.structuralSimilarity}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div style={{
                    padding: '1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '6px',
                    color: '#ef4444',
                    fontSize: '0.9rem'
                }}>
                    {error}
                </div>
            )}
        </div>
    );
}

/**
 * Violation Scoring Dashboard
 */
export function ViolationScoringDashboard() {
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPending();
    }, []);

    const fetchPending = async () => {
        try {
            const response = await axios.get(`${API_BASE}/violations/pending?limit=50`);
            setPending(response.data.pending || []);
        } catch (error) {
            console.error('Error fetching pending reviews:', error);
            setPending([]);
        } finally {
            setLoading(false);
        }
    };

    const handleReview = async (decisionId, decision) => {
        try {
            await axios.put(`${API_BASE}/violations/review/${decisionId}`, {
                reviewedBy: 'admin', // Should be current user
                decision,
                notes: `Reviewed and marked as ${decision}`
            });
            fetchPending(); // Refresh list
        } catch (error) {
            console.error('Error reviewing decision:', error);
        }
    };

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>;
    }

    return (
        <div>
            <h3 style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.5rem',
                fontWeight: 700
            }}>
                <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
                Pending Violation Reviews ({pending.length})
            </h3>

            {pending.length === 0 ? (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'var(--bg-card)',
                    borderRadius: '8px',
                    color: 'var(--text-muted)'
                }}>
                    No pending reviews
                </div>
            ) : (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    {pending.map((violation) => (
                        <div
                            key={violation.id}
                            style={{
                                background: 'var(--bg-card)',
                                border: '2px solid #f59e0b',
                                borderRadius: '12px',
                                padding: '1.5rem'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'start',
                                marginBottom: '1rem'
                            }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                                        {violation.student_name}
                                    </h4>
                                    <p style={{
                                        margin: '0.3rem 0 0 0',
                                        fontSize: '0.85rem',
                                        color: 'var(--text-muted)'
                                    }}>
                                        {violation.test_name || 'Test'}
                                    </p>
                                </div>
                                <span style={{
                                    background: '#f59e0b',
                                    color: 'white',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '20px',
                                    fontWeight: 700,
                                    fontSize: '0.9rem'
                                }}>
                                    {violation.total_violation_score} pts
                                </span>
                            </div>

                            <div style={{
                                background: 'var(--bg-secondary)',
                                padding: '1rem',
                                borderRadius: '8px',
                                marginBottom: '1rem',
                                fontSize: '0.85rem'
                            }}>
                                <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                                    Violation Details:
                                </div>
                                <div style={{ color: 'var(--text-muted)' }}>
                                    {violation.disqualification_reason}
                                </div>
                            </div>

                            <div style={{
                                display: 'flex',
                                gap: '0.5rem'
                            }}>
                                <button
                                    onClick={() => handleReview(violation.id, 'approved')}
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem',
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        border: '2px solid #10b981',
                                        color: '#10b981',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem'
                                    }}
                                >
                                    <Check size={16} />
                                    Approve
                                </button>
                                <button
                                    onClick={() => handleReview(violation.id, 'rejected')}
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '2px solid #ef4444',
                                        color: '#ef4444',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem'
                                    }}
                                >
                                    <X size={16} />
                                    Reject
                                </button>
                                <button
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-main)',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    Review Details
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Violation Summary for Attempt
 */
export function ViolationSummary({ attemptId }) {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSummary();
    }, [attemptId]);

    const fetchSummary = async () => {
        try {
            const response = await axios.get(`${API_BASE}/violations/summary/${attemptId}`);
            setSummary(response.data);
        } catch (error) {
            console.error('Error fetching violation summary:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '1rem' }}>Loading...</div>;
    }

    if (!summary || !summary.violations || summary.violations.length === 0) {
        return (
            <div style={{
                padding: '1.5rem',
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '8px',
                color: '#10b981',
                fontWeight: 600
            }}>
                ✓ No violations detected
            </div>
        );
    }

    const scoreColor = summary.cumulativeScore > 75 ? '#ef4444' : summary.cumulativeScore > 50 ? '#f59e0b' : '#10b981';

    return (
        <div style={{
            background: 'var(--bg-card)',
            border: `2px solid ${scoreColor}`,
            borderRadius: '12px',
            padding: '1.5rem'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '1rem'
            }}>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={18} color={scoreColor} />
                    Violation Summary
                </h4>
                <span style={{
                    background: scoreColor,
                    color: 'white',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '20px',
                    fontWeight: 700,
                    fontSize: '0.85rem'
                }}>
                    {summary.cumulativeScore} pts
                </span>
            </div>

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
            }}>
                {summary.violations.map((violation, idx) => (
                    <div
                        key={idx}
                        style={{
                            padding: '0.75rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.9rem'
                        }}
                    >
                        <span style={{ fontWeight: 600 }}>
                            {violation.type.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span style={{
                            display: 'flex',
                            gap: '0.5rem',
                            color: 'var(--text-muted)'
                        }}>
                            <span>{violation.count}x</span>
                            <span style={{ color: scoreColor, fontWeight: 700 }}>
                                {violation.total_score} pts
                            </span>
                        </span>
                    </div>
                ))}
            </div>

            {summary.decision && (
                <div style={{
                    marginTop: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    <div style={{
                        padding: '1rem',
                        background: summary.decision.auto_disqualified ? 'rgba(239, 68, 68, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                        borderRadius: '6px'
                    }}>
                        <div style={{
                            fontWeight: 700,
                            color: summary.decision.auto_disqualified ? '#ef4444' : '#f59e0b',
                            marginBottom: '0.3rem'
                        }}>
                            {summary.decision.auto_disqualified ? '⚠️ AUTO-DISQUALIFIED' : '⚠️ FLAGGED FOR REVIEW'}
                        </div>
                        <div style={{
                            fontSize: '0.85rem',
                            color: 'var(--text-muted)'
                        }}>
                            {summary.decision.disqualification_reason}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Plagiarism Detection Dashboard for Mentors
 */
export function PlagiarismDetectionDashboard({ testId }) {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedReport, setSelectedReport] = useState(null);

    useEffect(() => {
        const fetchReports = async () => {
            try {
                setLoading(true);
                const response = await axios.get(`${API_BASE}/plagiarism/reports`);
                setReports(response.data.reports || []);
            } catch (err) {
                console.error('Failed to fetch plagiarism reports:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchReports();
    }, []);

    return (
        <div style={{
            padding: '1.5rem',
            background: 'var(--bg-primary)',
            minHeight: '100vh'
        }}>
            <div style={{
                marginBottom: '2rem'
            }}>
                <h2 style={{
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    margin: '0 0 0.5rem 0'
                }}>
                    <Shield size={28} />
                    Plagiarism Detection Dashboard
                </h2>
                <p style={{
                    color: 'var(--text-secondary)',
                    margin: 0
                }}>
                    Monitor code similarity and plagiarism detection across student submissions
                </p>
            </div>

            {loading ? (
                <div style={{
                    background: 'var(--bg-card)',
                    padding: '2rem',
                    borderRadius: '12px',
                    textAlign: 'center',
                    color: 'var(--text-muted)'
                }}>
                    Loading plagiarism reports...
                </div>
            ) : reports.length === 0 ? (
                <div style={{
                    background: 'var(--bg-card)',
                    padding: '2rem',
                    borderRadius: '12px',
                    textAlign: 'center',
                    color: 'var(--text-muted)'
                }}>
                    No plagiarism reports available yet
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '1.5rem'
                }}>
                    {reports.map((report, idx) => (
                        <div key={idx} style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            padding: '1.5rem',
                            cursor: 'pointer',
                            transition: 'all 0.3s'
                        }} onClick={() => setSelectedReport(selectedReport === idx ? null : idx)}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '0.75rem'
                            }}>
                                <div style={{
                                    fontWeight: 700,
                                    fontSize: '1.1rem'
                                }}>
                                    {report.submission_id || `Report ${idx + 1}`}
                                </div>
                                <div style={{
                                    fontSize: '1.25rem',
                                    fontWeight: 800,
                                    color: report.similarity_percentage > 30 ? '#ef4444' : report.similarity_percentage > 15 ? '#f59e0b' : '#10b981'
                                }}>
                                    {report.similarity_percentage || '0'}% Similar
                                </div>
                            </div>
                            {selectedReport === idx && (
                                <div style={{
                                    marginTop: '1rem',
                                    paddingTop: '1rem',
                                    borderTop: '1px solid var(--border-color)',
                                    fontSize: '0.9rem',
                                    color: 'var(--text-secondary)'
                                }}>
                                    <PlagiarismReport submissionId={report.submission_id} onAnalyze={() => {}} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default {
    PlagiarismReport,
    ViolationScoringDashboard,
    ViolationSummary,
    PlagiarismDetectionDashboard
};
