import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { Play, Send, CheckCircle, XCircle, Database, Table, Loader2, ArrowRight, Target } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function SkillSQLTest({ attemptId, attemptData, onComplete, onFailed }) {
    const [problems, setProblems] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [queries, setQueries] = useState({});
    const [runResult, setRunResult] = useState(null);
    const [evalResult, setEvalResult] = useState(null);
    const [submissions, setSubmissions] = useState({});
    const [running, setRunning] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(null); // 'schema', 'expected', null
    const [error, setError] = useState('');
    const [showContinue, setShowContinue] = useState(false);
    const [showFinishConfirm, setShowFinishConfirm] = useState(false);
    const [timeLeft, setTimeLeft] = useState(null);
    const [tableNames, setTableNames] = useState({ employees: 'employees', departments: 'departments', projects: 'projects', orders: 'orders' });
    const timerRef = useRef(null);

    useEffect(() => {
        if (timeLeft === null) return;
        if (timeLeft <= 0) {
            handleTimeUp();
            return;
        }
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleTimeUp();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [timeLeft]);

    const handleTimeUp = () => {
        alert('Time is up! Submitting your test automatically.');
        finishSQL(true);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    useEffect(() => { startSQL(); }, []);

    const startSQL = async () => {
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/start/${attemptId}`);
            setProblems(data.problems || []);
            setSubmissions(data.existing_submissions || {});
            if (data.tables) setTableNames(data.tables);
            const initQueries = {};
            (data.problems || []).forEach(p => {
                const submission = (data.existing_submissions || {})[String(p.id)];
                initQueries[p.id] = submission ? submission.query : '';
            });
            setQueries(initQueries);
            if (data.duration_minutes) setTimeLeft(data.duration_minutes * 60);
            setLoading(false);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setLoading(false);
        }
    };

    const runQuery = async () => {
        const p = problems[currentIdx];
        if (!p) return;
        setRunning(true);
        setRunResult(null);
        setEvalResult(null);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/run`, {
                query: queries[p.id] || '',
                attemptId
            });
            setRunResult(data);
        } catch (err) {
            setRunResult({ success: false, error: err.message });
        } finally {
            setRunning(false);
        }
    };

    const evaluateQuery = async () => {
        const p = problems[currentIdx];
        if (!p) return;
        setEvaluating(true);
        setEvalResult(null);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/evaluate`, {
                attemptId, problemId: p.id, query: queries[p.id] || ''
            });
            setEvalResult(data);
            setSubmissions(prev => ({
                ...prev,
                [String(p.id)]: {
                    passed: data.passed,
                    feedback: data.feedback,
                    expected: data.expected,
                    actual: data.actual
                }
            }));
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setEvaluating(false);
        }
    };

    const finishSQL = async () => {
        setShowFinishConfirm(false);
        setFinishing(true);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/finish/${attemptId}`);
            setResult(data);
            setShowContinue(true);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setFinishing(false);
        }
    };

    const handleContinue = () => {
        if (result?.passed) {
            onComplete(result);
        } else {
            onFailed();
        }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading SQL problems...</div>;

    if (result) {
        return (
            <div style={{ textAlign: 'center', padding: '60px' }}>
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: result.passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'
                }}>
                    {result.passed ? <CheckCircle size={40} color="#22c55e" /> : <XCircle size={40} color="#ef4444" />}
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px', color: '#f1f5f9' }}>
                    {result.passed ? 'SQL Passed!' : 'SQL Failed'}
                </h2>
                <p style={{ fontSize: '18px', color: '#94a3b8' }}>
                    Solved: {result.solved}/{result.total} ({Math.round(result.score)}%)
                </p>
                <div style={{ marginTop: '32px' }}>
                    <button onClick={handleContinue} style={{
                        padding: '12px 24px', background: '#8b5cf6', color: 'white', border: 'none',
                        borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '16px',
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        boxShadow: '0 4px 12px rgba(139,92,246,0.3)'
                    }}>
                        {result.passed ? 'Continue to Interview' : 'View Report'} <ArrowRight size={18} />
                    </button>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '12px' }}>
                        Click to proceed to the next stage
                    </p>
                </div>
            </div>
        );
    }

    const p = problems[currentIdx];
    const solvedCount = Object.values(submissions).filter(s => s.passed).length;

    const TABLES_SCHEMA = [
        { name: tableNames.employees, columns: ['id', 'name', 'department', 'salary', 'hire_date', 'manager_id'] },
        { name: tableNames.departments, columns: ['id', 'name', 'budget', 'location'] },
        { name: tableNames.projects, columns: ['id', 'name', 'department_id', 'start_date', 'end_date', 'status'] },
        { name: tableNames.orders, columns: ['id', 'customer_name', 'product', 'quantity', 'price', 'order_date'] }
    ];

    // Helper to render table
    const renderTable = (data, title, color) => {
        if (!data || !data.rows || data.rows.length === 0) return null;
        return (
            <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: color, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
                <div style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.4)', border: `1px solid ${color}40`, borderRadius: '12px' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: `${color}10` }}>
                                {data.columns.map(col => (
                                    <th key={col} style={{ padding: '8px 12px', borderBottom: `1px solid ${color}40`, textAlign: 'left', color: '#cbd5e1', fontWeight: 700 }}>{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.slice(0, 5).map((row, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    {data.columns.map(col => (
                                        <td key={col} style={{ padding: '8px 12px', color: '#94a3b8' }}>{row[col] ?? 'NULL'}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderComparisonTable = (title, data, mode) => {
        if (!data || (!data.columns && !data.error)) return null;
        const color = mode === 'success' ? '#10b981' : (mode === 'fail' ? '#ef4444' : '#60a5fa');
        const bgColor = mode === 'success' ? 'rgba(16, 185, 129, 0.05)' : (mode === 'fail' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(59, 130, 246, 0.05)');

        if (data.error) return (
            <div style={{ flex: 1, minWidth: '300px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
                <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', fontSize: '13px', fontFamily: '"JetBrains Mono", monospace' }}>
                    <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: '4px' }}>Query Error:</div>
                    {data.error}
                </div>
            </div>
        );

        return (
            <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                    fontSize: '11px', fontWeight: 800, color: color, marginBottom: '8px',
                    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <span>{title}</span>
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>{data.rows?.length || 0} rows</span>
                </div>
                <div style={{
                    overflow: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '12px',
                    border: `1px solid ${color}30`, maxHeight: '250px', position: 'relative'
                }}>
                    <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                {data.columns.map(col => (
                                    <th key={col} style={{
                                        padding: '10px 16px', background: color + '20',
                                        backdropFilter: 'blur(4px)', borderBottom: `2px solid ${color}40`,
                                        textAlign: 'left', color: '#f1f5f9', fontWeight: 700,
                                        whiteSpace: 'nowrap'
                                    }}>{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows && data.rows.map((row, i) => (
                                <tr key={i} style={{
                                    background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    transition: 'background 0.2s'
                                }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}>
                                    {data.columns.map(col => (
                                        <td key={col} style={{
                                            padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                                            color: '#cbd5e1', whiteSpace: 'nowrap'
                                        }}>{row[col] ?? <span style={{ color: '#475569', fontStyle: 'italic' }}>NULL</span>}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', color: '#f1f5f9' }}>
            {/* Modern Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 24px', background: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(12px)',
                borderRadius: '16px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 15px rgba(139, 92, 246, 0.4)'
                    }}>
                        <Database size={22} color="white" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.02em' }}>SQL Proficiency Test</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>
                            Validated: <span style={{ color: '#8b5cf6' }}>{solvedCount}</span> of {problems.length} challenges
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {timeLeft !== null && (
                        <div style={{
                            padding: '8px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 700,
                            background: timeLeft < 300 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                            color: timeLeft < 300 ? '#fca5a5' : '#60a5fa',
                            border: `1px solid ${timeLeft < 300 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.2)'}`,
                            display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                            <span style={{ fontSize: '16px' }}>⏱️</span> {formatTime(timeLeft)}
                        </div>
                    )}
                    <button onClick={() => setShowFinishConfirm(true)} disabled={finishing} style={{
                        padding: '10px 24px', background: 'linear-gradient(to right, #8b5cf6, #7c3aed)',
                        color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer',
                        fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                        transition: 'transform 0.2s, opacity 0.2s', opacity: finishing ? 0.6 : 1
                    }}>
                        {finishing ? 'Saving...' : 'Complete Test →'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', color: '#fca5a5',
                    fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                    <XCircle size={18} /> {error}
                </div>
            )}

            {/* Problem Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', padding: '0 4px' }}>
                {problems.map((pr, idx) => {
                    const submission = submissions[String(pr.id)];
                    const isPassed = submission?.passed;
                    const isFailed = submission && !submission.passed;

                    let bg = 'rgba(51, 65, 85, 0.5)';
                    let border = '1px solid rgba(255,255,255,0.05)';
                    let color = '#94a3b8';

                    if (idx === currentIdx) {
                        bg = 'rgba(139, 92, 246, 0.2)';
                        border = '1px solid rgba(139, 92, 246, 0.5)';
                        color = '#ddd6fe';
                    } else if (isPassed) {
                        bg = 'rgba(34, 197, 94, 0.1)';
                        border = '1px solid rgba(34, 197, 94, 0.4)';
                        color = '#86efac';
                    } else if (isFailed) {
                        bg = 'rgba(239, 68, 68, 0.1)';
                        border = '1px solid rgba(239, 68, 68, 0.4)';
                        color = '#fca5a5';
                    }

                    return (
                        <button key={idx} onClick={() => {
                            setCurrentIdx(idx);
                            setRunResult(null);
                            setEvalResult(submissions[String(pr.id)] || null);
                            setActiveTab(null);
                        }} style={{
                            padding: '10px 20px', borderRadius: '10px', border, cursor: 'pointer',
                            fontWeight: 700, fontSize: '13px', background: bg, color,
                            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                            Q{idx + 1}
                            {isPassed && <CheckCircle size={14} />}
                            {isFailed && <XCircle size={14} />}
                        </button>
                    );
                })}
            </div>

            {p && (
                <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '20px', alignItems: 'start' }}>

                    {/* Left Column: Problem Details */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{
                            background: '#1e293b', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
                            overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>{p.title}</h3>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px',
                                        background: p.difficulty === 'easy' ? 'rgba(34,197,94,0.1)' : p.difficulty === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                                        color: p.difficulty === 'easy' ? '#86efac' : p.difficulty === 'medium' ? '#fcd34d' : '#fca5a5',
                                        borderRadius: '20px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid currentColor'
                                    }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }}></div>
                                        {p.difficulty}
                                    </div>
                                    {p.expected_columns && p.expected_columns.length > 0 && (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px',
                                            background: 'rgba(59,130,246,0.1)', color: '#93c5fd', borderRadius: '20px',
                                            fontSize: '11px', fontWeight: 700, border: '1px solid rgba(59,130,246,0.3)'
                                        }}>
                                            <Database size={12} />
                                            {p.expected_columns.length} Columns Expected
                                        </div>
                                    )}
                                </div>
                                <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#f1f5f9', margin: '0 0 20px', fontWeight: 450 }}>{p.description}</p>
                            </div>

                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => setActiveTab(activeTab === 'schema' ? null : 'schema')} style={{
                                        flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                        background: activeTab === 'schema' ? '#334155' : 'rgba(51, 65, 85, 0.4)',
                                        border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                    }}>
                                        <Table size={16} color="#8b5cf6" /> Schema
                                    </button>
                                    <button onClick={() => setActiveTab(activeTab === 'expected' ? null : 'expected')} style={{
                                        flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                        background: activeTab === 'expected' ? '#334155' : 'rgba(51, 65, 85, 0.4)',
                                        border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                    }}>
                                        <Target size={16} color="#10b981" /> Expected
                                    </button>
                                </div>

                                {activeTab === 'schema' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {TABLES_SCHEMA.map(table => (
                                            <div key={table.name} style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 800, color: '#8b5cf6', marginBottom: '8px', letterSpacing: '0.05em' }}>{table.name.toUpperCase()}</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {table.columns.map(col => (
                                                        <span key={col} style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: '2px 8px', borderRadius: '4px' }}>{col}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {activeTab === 'expected' && (
                                    <div style={{ background: '#0f172a', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '13px' }}>
                                        {p.expected_columns && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>REQUIRED COLUMNS</div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    {p.expected_columns.map(c => <span key={c} style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(96,165,250,0.2)' }}>{c}</span>)}
                                                </div>
                                            </div>
                                        )}
                                        {p.expected_output_description && (
                                            <div>
                                                <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>EXPECTED RESULT</div>
                                                <div style={{ color: '#ec4899', fontStyle: 'italic' }}>{p.expected_output_description}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {p.hints && !activeTab && (
                                    <div style={{ background: 'rgba(245,158,11,0.05)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.2)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
                                            <span>💡</span> Pro Tip:
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#d97706', lineHeight: 1.5 }}>{p.hints}</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Evaluation Result Card - Status Only */}
                        {evalResult && (
                            <div style={{
                                background: evalResult.passed ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                                borderRadius: '16px', border: `1px solid ${evalResult.passed ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                padding: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '24px', height: '24px', borderRadius: '50%',
                                            background: evalResult.passed ? '#22c55e' : '#ef4444',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {evalResult.passed ? <CheckCircle size={14} color="white" /> : <XCircle size={14} color="white" />}
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '15px', color: evalResult.passed ? '#4ade80' : '#f87171', letterSpacing: '0.05em' }}>
                                            {evalResult.passed ? 'PASSED' : 'FAILED'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const consoleEl = document.getElementById('sql-console-tabs');
                                            if (consoleEl) consoleEl.scrollIntoView({ behavior: 'smooth' });
                                        }}
                                        style={{
                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#94a3b8', fontSize: '11px', fontWeight: 700, padding: '4px 10px',
                                            borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    >
                                        VIEW COMPARISON
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Editor & Terminal */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{
                            background: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
                            overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                        }}>
                            {/* Editor Toolbar */}
                            <div style={{
                                padding: '12px 20px', background: 'rgba(30, 41, 59, 0.5)', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }}></div>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }}></div>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }}></div>
                                    <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>query.sql</span>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={runQuery} disabled={running} style={{
                                        padding: '6px 16px', background: '#334155', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                        opacity: running ? 0.6 : 1
                                    }}>
                                        {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} color="#10b981" />} Run Query
                                    </button>
                                    <button onClick={evaluateQuery} disabled={evaluating} style={{
                                        padding: '6px 16px', background: '#8b5cf6', color: 'white', border: 'none',
                                        borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                        opacity: evaluating ? 0.6 : 1
                                    }}>
                                        {evaluating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit Final
                                    </button>
                                </div>
                            </div>

                            {/* Monaco Editor Container */}
                            <div style={{ height: '300px' }}>
                                <Editor
                                    height="300px"
                                    language="sql"
                                    value={queries[p.id] || ''}
                                    onChange={val => setQueries(prev => ({ ...prev, [p.id]: val || '' }))}
                                    theme="vs-dark"
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        scrollBeyondLastLine: false,
                                        padding: { top: 16, bottom: 16 },
                                        fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                                        lineNumbers: 'on',
                                        renderLineHighlight: 'all',
                                        contextmenu: false
                                    }}
                                />
                            </div>

                            {/* Terminal Console */}
                            <div style={{
                                background: '#020617', padding: '0', borderTop: '1px solid rgba(255,255,255,0.05)',
                                minHeight: '300px', maxHeight: '500px', display: 'flex', flexDirection: 'column'
                            }}>
                                <div id="sql-console-tabs" style={{
                                    padding: '0 16px', background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex' }}>
                                        <button
                                            onClick={() => setEvalResult(null)}
                                            style={{
                                                padding: '12px 16px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em',
                                                background: !evalResult ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                                                color: !evalResult ? '#38bdf8' : '#475569',
                                                border: 'none', borderBottom: !evalResult ? '2px solid #38bdf8' : '2px solid transparent',
                                                cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                        >
                                            EXECUTION RESULT
                                        </button>
                                        {evalResult && (
                                            <button
                                                style={{
                                                    padding: '12px 16px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em',
                                                    background: 'rgba(139, 92, 246, 0.1)',
                                                    color: '#a78bfa',
                                                    border: 'none', borderBottom: '2px solid #8b5cf6',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                SUBMISSION COMPARISON
                                            </button>
                                        )}
                                    </div>
                                    {runResult && <div style={{ fontSize: '10px', color: '#10b981', fontWeight: 800 }}>SUCCESS</div>}
                                </div>

                                <div style={{ padding: '16px', overflowY: 'auto', flex: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                                    {evalResult ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '12px' }}>
                                                {renderComparisonTable('Expected Outcome', evalResult.expected, 'success')}
                                                {renderComparisonTable('Your Submission Output', evalResult.actual, evalResult.passed ? 'success' : 'fail')}
                                            </div>

                                            <div style={{
                                                padding: '20px', background: evalResult.passed ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)',
                                                borderRadius: '16px', border: `1px solid ${evalResult.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}`,
                                                display: 'flex', gap: '20px', alignItems: 'center'
                                            }}>
                                                <div style={{
                                                    width: '48px', height: '48px', borderRadius: '16px',
                                                    background: evalResult.passed ? '#10b981' : '#ef4444',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: `0 8px 16px ${evalResult.passed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                                }}>
                                                    {evalResult.passed ? <CheckCircle size={24} color="white" /> : <XCircle size={24} color="white" />}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final Assessment</div>
                                                    <div style={{ fontSize: '18px', color: '#f1f5f9', fontWeight: 800, letterSpacing: '-0.02em' }}>
                                                        {evalResult.passed ? 'Challenge Successfully Solved' : 'Submission Mismatch Detected'}
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                                                        {evalResult.passed
                                                            ? 'Your logic perfectly matches the expected criteria.'
                                                            : 'Refine your query logic to match the expected results shown above.'}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>SCORE</div>
                                                    <div style={{ fontSize: '28px', color: evalResult.passed ? '#10b981' : '#ef4444', fontWeight: 900 }}>
                                                        {evalResult.passed ? '100' : Math.max(0, evalResult.score || 0)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : !runResult ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', color: '#334155' }}>
                                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(30,41,59,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                                                <Database size={24} style={{ opacity: 0.5 }} />
                                            </div>
                                            <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em' }}>Ready for execution</span>
                                        </div>
                                    ) : !runResult.success ? (
                                        <div style={{ color: '#ef4444', fontSize: '13px', background: 'rgba(239,68,68,0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)', fontFamily: '"JetBrains Mono", monospace' }}>
                                            <strong style={{ display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>Execution Error</strong>
                                            {runResult.error}
                                        </div>
                                    ) : runResult.rows && runResult.rows.length > 0 ? (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
                                                <thead>
                                                    <tr style={{ background: 'rgba(56, 189, 248, 0.08)' }}>
                                                        {runResult.columns.map(col => (
                                                            <th key={col} style={{ padding: '10px 14px', borderBottom: '2px solid #1e293b', textAlign: 'left', color: '#7dd3fc', fontWeight: 700 }}>{col}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {runResult.rows.slice(0, 50).map((row, i) => (
                                                        <tr key={i} style={{ borderBottom: '1px solid #0f172a', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                                                            {runResult.columns.map(col => (
                                                                <td key={col} style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row[col] ?? <span style={{ color: '#475569', fontStyle: 'italic' }}>NULL</span>}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            <div style={{ marginTop: '16px', fontSize: '11px', color: '#475569', borderTop: '1px solid #1e293b', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Showing {Math.min(runResult.rows.length, 50)} of {runResult.rows.length} records</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#10b981', background: 'rgba(16,185,129,0.08)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                            <div style={{ padding: '4px', borderRadius: '50%', background: '#10b98140' }}>
                                                <CheckCircle size={16} />
                                            </div>
                                            <span style={{ fontSize: '14px', fontWeight: 600 }}>{runResult.message || 'Execution successful. No rows returned.'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Premium Confirm Modal */}
            {showFinishConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: '#1e293b', borderRadius: '24px', padding: '40px', maxWidth: '440px',
                        width: '90%', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(139,92,246,0.1)',
                            margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Database size={32} color="#8b5cf6" />
                        </div>
                        <h3 style={{ margin: '0 0 12px', color: '#f8fafc', fontSize: '24px', fontWeight: 800 }}>Submit Solutions?</h3>
                        <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: 1.6, margin: '0 0 32px' }}>
                            You have submitted solutions for {solvedCount} out of {problems.length} challenges. Are you ready to finalize this section?
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setShowFinishConfirm(false)} style={{
                                flex: 1, padding: '12px', background: 'rgba(51, 65, 85, 0.5)', color: '#cbd5e1',
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '15px'
                            }}>Go Back</button>
                            <button onClick={finishSQL} style={{
                                flex: 2, padding: '12px', background: 'linear-gradient(to right, #8b5cf6, #7c3aed)', color: 'white',
                                border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '15px',
                                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                            }}>Submit & Continue</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
