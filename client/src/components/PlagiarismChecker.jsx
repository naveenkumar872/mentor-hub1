import React, { useContext, useState, useEffect } from 'react';
import { ThemeContext } from '../App';
import { AlertTriangle, CheckCircle, Loader, FileCode, ChevronRight } from 'lucide-react';
import axios from 'axios';
import '../styles/PlagiarismChecker.css';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api';

const PlagiarismChecker = ({ user }) => {
    const { theme } = useContext(ThemeContext);
    const [submissions, setSubmissions] = useState([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(true);
    const [selected, setSelected] = useState(null);
    const [result, setResult] = useState(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(null);
    const token = localStorage.getItem('authToken');

    useEffect(() => {
        if (!user?.id) return;
        setLoadingSubmissions(true);
        axios.get(`${API_BASE}/submissions?studentId=${user.id}`)
            .then(res => {
                const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
                // Only code submissions have actual code to check
                setSubmissions(data.filter(s => !s.isMLTask));
            })
            .catch(() => setError('Failed to load submissions.'))
            .finally(() => setLoadingSubmissions(false));
    }, [user?.id]);

    const handleSelect = (sub) => {
        setSelected(sub);
        setResult(null);
        setError(null);
    };

    const checkPlagiarism = async () => {
        if (!selected) return;
        setChecking(true);
        setError(null);
        try {
            const response = await fetch('/api/plagiarism/check', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    submissionId: selected.id,
                    code: selected.code
                })
            });

            if (response.ok) {
                const data = await response.json();
                // Normalize backend response to component shape
                setResult({
                    isPlagiarized: data.verdict === 'PLAGIARISM_DETECTED' || data.isPlagiarized || false,
                    isSuspicious: data.verdict === 'SUSPICIOUS',
                    similarityScore: data.similarity ?? data.similarityScore ?? 0,
                    matches: (data.matches || []).map(m => ({
                        studentName: m.student_name || m.student_email || 'Unknown Student',
                        studentEmail: m.student_email || '',
                        percentage: m.similarity ?? m.percentage ?? data.similarity ?? 0
                    }))
                });
            } else {
                const errData = await response.json().catch(() => ({}));
                setError(errData.error || 'Plagiarism check failed. Please try again.');
            }
        } catch (err) {
            console.error('Error checking plagiarism:', err);
            setError('An error occurred while checking plagiarism.');
        } finally {
            setChecking(false);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className={`plagiarism-checker-container ${theme}`}>
            <div className="checker-header">
                <h2>
                    <AlertTriangle size={22} />
                    Plagiarism Check
                </h2>
                <p>Select one of your code submissions below to run a plagiarism analysis.</p>
            </div>

            <div className="plagiarism-layout">
                {/* Submission List */}
                <div className="submission-select-panel">
                    <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Your Submissions
                    </h4>
                    {loadingSubmissions ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', padding: '1rem 0' }}>
                            <Loader size={16} className="spinning" /> Loading...
                        </div>
                    ) : submissions.length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No code submissions found.</p>
                    ) : (
                        <ul className="submission-list">
                            {submissions.map(sub => (
                                <li
                                    key={sub.id}
                                    className={`submission-item ${selected?.id === sub.id ? 'active' : ''}`}
                                    onClick={() => handleSelect(sub)}
                                >
                                    <FileCode size={16} style={{ flexShrink: 0 }} />
                                    <div className="submission-item-info">
                                        <span className="submission-item-title">{sub.itemTitle || sub.problemTitle || `Submission #${sub.id}`}</span>
                                        <span className="submission-item-meta">{sub.language} &bull; {formatDate(sub.submittedAt)}</span>
                                    </div>
                                    <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.4 }} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Check Panel */}
                <div className="checker-panel">
                    {!selected ? (
                        <div className="no-selection-msg">
                            <AlertTriangle size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                            <p>Select a submission from the list to check for plagiarism.</p>
                        </div>
                    ) : (
                        <>
                            <div className="selected-submission-info">
                                <h4>{selected.itemTitle || selected.problemTitle || `Submission #${selected.id}`}</h4>
                                <span className="lang-badge">{selected.language}</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                                    Submitted {formatDate(selected.submittedAt)}
                                </span>
                            </div>

                            {/* Code preview */}
                            <pre className="code-preview">{selected.code?.slice(0, 600)}{selected.code?.length > 600 ? '\n...' : ''}</pre>

                            {error && (
                                <div className="plagiarism-error">{error}</div>
                            )}

                            {!result ? (
                                <button
                                    className="check-btn"
                                    onClick={checkPlagiarism}
                                    disabled={checking}
                                >
                                    {checking ? (
                                        <>
                                            <Loader size={16} className="spinning" />
                                            Checking...
                                        </>
                                    ) : (
                                        'Run Plagiarism Check'
                                    )}
                                </button>
                            ) : (
                                <div className={`plagiarism-result ${result.isPlagiarized ? 'warning' : result.isSuspicious ? 'suspicious' : 'safe'}`}>
                                    <div className="result-icon">
                                        {result.isPlagiarized ? (
                                            <AlertTriangle size={32} />
                                        ) : result.isSuspicious ? (
                                            <AlertTriangle size={32} />
                                        ) : (
                                            <CheckCircle size={32} />
                                        )}
                                    </div>
                                    <div className="result-content">
                                        <h4>{result.isPlagiarized ? 'Plagiarism Detected' : result.isSuspicious ? 'Suspicious Similarity' : 'No Plagiarism Detected'}</h4>
                                        <div className="similarity-score">
                                            Similarity Score: <strong>{result.similarityScore}%</strong>
                                        </div>
                                        {result.matches?.length > 0 && (
                                            <div className="matches-section">
                                                <div className="matches-title">Matching Sources:</div>
                                                {result.matches.map((match, idx) => (
                                                    <div key={idx} className="match-item">
                                                        <div className="match-header">
                                                            <span className="match-source">{match.studentName}</span>
                                                            <span className="match-percentage">{match.percentage}% match</span>
                                                        </div>
                                                        <div className="match-file">
                                                            {match.studentEmail ? `Student · ${match.studentEmail}` : 'Similar submission for the same problem'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button className="recheck-btn" onClick={() => setResult(null)}>
                                        Recheck
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlagiarismChecker;
