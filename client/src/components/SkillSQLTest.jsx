import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { Play, Send, CheckCircle, XCircle, Database, Table, Loader2 } from 'lucide-react';

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
    const [showSchema, setShowSchema] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { startSQL(); }, []);

    const startSQL = async () => {
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/start/${attemptId}`);
            setProblems(data.problems || []);
            setSubmissions(data.existing_submissions || {});
            const initQueries = {};
            (data.problems || []).forEach(p => { initQueries[p.id] = ''; });
            setQueries(initQueries);
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
                query: queries[p.id] || ''
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
            if (data.passed) {
                setSubmissions(prev => ({ ...prev, [String(p.id)]: { passed: true } }));
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setEvaluating(false);
        }
    };

    const finishSQL = async () => {
        if (!window.confirm('Submit your SQL solutions? This will move to the Interview section.')) return;
        setFinishing(true);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/finish/${attemptId}`);
            setResult(data);
            if (data.passed) {
                setTimeout(() => onComplete(data), 2000);
            } else {
                setTimeout(() => onFailed(), 3000);
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setFinishing(false);
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
                <p style={{ fontSize: '14px', color: result.passed ? '#22c55e' : '#ef4444', marginTop: '12px' }}>
                    {result.passed ? 'Proceeding to AI Interview...' : 'Assessment ended. Generating report...'}
                </p>
            </div>
        );
    }

    const p = problems[currentIdx];
    const solvedCount = Object.values(submissions).filter(s => s.passed).length;

    const SCHEMA_INFO = `
📊 Available Tables:
━━━━━━━━━━━━━━━━━━━━━━━
employees (id, name, department, salary, hire_date, manager_id)
departments (id, name, budget, location)
projects (id, name, department_id, start_date, end_date, status)
orders (id, customer_name, product, quantity, price, order_date)
    `.trim();

    return (
        <div>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', background: '#1e293b', borderRadius: '10px', marginBottom: '16px',
                border: '1px solid #334155'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Database size={20} color="#8b5cf6" />
                    <span style={{ fontWeight: 700, fontSize: '15px', color: '#f1f5f9' }}>SQL Test</span>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>{solvedCount}/{problems.length} solved</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setShowSchema(!showSchema)} style={{
                        padding: '8px 14px', background: showSchema ? 'rgba(139,92,246,0.15)' : '#334155',
                        border: '1px solid ' + (showSchema ? '#8b5cf6' : '#475569'),
                        borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '4px', color: '#f1f5f9'
                    }}>
                        <Table size={14} /> Schema
                    </button>
                    <button onClick={finishSQL} disabled={finishing} style={{
                        padding: '8px 20px', background: '#8b5cf6', color: 'white', border: 'none',
                        borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                        opacity: finishing ? 0.6 : 1
                    }}>
                        {finishing ? 'Submitting...' : 'Finish SQL →'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', marginBottom: '12px', color: '#fca5a5', fontSize: '13px' }}>{error}</div>
            )}

            {/* Schema Panel */}
            {showSchema && (
                <div style={{
                    background: '#1e1e1e', color: '#d4d4d4', padding: '16px', borderRadius: '8px',
                    marginBottom: '16px', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'pre-line'
                }}>
                    {SCHEMA_INFO}
                </div>
            )}

            {/* Problem Navigator */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {problems.map((pr, idx) => {
                    const isSolved = submissions[String(pr.id)]?.passed;
                    return (
                        <button key={idx} onClick={() => { setCurrentIdx(idx); setRunResult(null); setEvalResult(null); }} style={{
                            padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontWeight: 600, fontSize: '12px',
                            background: idx === currentIdx ? '#8b5cf6' : isSolved ? '#22c55e' : '#334155',
                            color: (idx === currentIdx || isSolved) ? 'white' : '#94a3b8'
                        }}>
                            Q{idx + 1} {isSolved ? '✓' : ''}
                        </button>
                    );
                })}
            </div>

            {p && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {/* Problem Description */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '16px' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>{p.title}</h3>
                        {p.difficulty && (
                            <span style={{
                                padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block', marginBottom: '12px',
                                background: p.difficulty === 'hard' ? 'rgba(239,68,68,0.15)' : p.difficulty === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
                                color: p.difficulty === 'hard' ? '#f87171' : p.difficulty === 'medium' ? '#fbbf24' : '#34d399'
                            }}>{p.difficulty}</span>
                        )}
                        <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#cbd5e1' }}>{p.description}</p>

                        {p.expected_output_description && (
                            <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(34,197,94,0.1)', borderRadius: '6px', fontSize: '13px', color: '#34d399' }}>
                                <strong>Expected:</strong> {p.expected_output_description}
                            </div>
                        )}

                        {p.hints && (
                            <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', fontSize: '13px', color: '#fbbf24' }}>
                                <strong>Hint:</strong> {p.hints}
                            </div>
                        )}

                        {/* Evaluation Result */}
                        {evalResult && (
                            <div style={{
                                marginTop: '16px', padding: '12px', borderRadius: '8px',
                                background: evalResult.passed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                border: '1px solid ' + (evalResult.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)')
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: evalResult.passed ? '#34d399' : '#f87171' }}>
                                    {evalResult.passed ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
                                    {evalResult.passed ? 'Query Correct!' : 'Results do not match expected output'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Editor + Results */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={runQuery} disabled={running} style={{
                                padding: '6px 14px', background: '#10b981', color: 'white', border: 'none',
                                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: '4px', opacity: running ? 0.6 : 1
                            }}>
                                {running ? <Loader2 size={14} /> : <Play size={14} />} Run
                            </button>
                            <button onClick={evaluateQuery} disabled={evaluating} style={{
                                padding: '6px 14px', background: '#8b5cf6', color: 'white', border: 'none',
                                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: '4px', opacity: evaluating ? 0.6 : 1
                            }}>
                                {evaluating ? <Loader2 size={14} /> : <Send size={14} />} Submit
                            </button>
                        </div>

                        <div style={{ border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', minHeight: '220px' }}>
                            <Editor
                                height="220px"
                                language="sql"
                                value={queries[p.id] || ''}
                                onChange={val => setQueries(prev => ({ ...prev, [p.id]: val || '' }))}
                                theme="vs-dark"
                                options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, padding: { top: 10 } }}
                            />
                        </div>

                        {/* Query Results */}
                        <div style={{
                            background: '#1e1e1e', color: '#d4d4d4', padding: '12px', borderRadius: '8px',
                            fontSize: '12px', fontFamily: 'monospace', minHeight: '160px', maxHeight: '300px', overflowY: 'auto'
                        }}>
                            {!runResult ? (
                                <span style={{ color: '#6b7280' }}>Run your query to see results...</span>
                            ) : !runResult.success ? (
                                <span style={{ color: '#ef4444' }}>Error: {runResult.error}</span>
                            ) : runResult.rows && runResult.rows.length > 0 ? (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                        <thead>
                                            <tr>
                                                {runResult.columns.map(col => (
                                                    <th key={col} style={{ padding: '4px 8px', borderBottom: '1px solid #444', textAlign: 'left', color: '#93c5fd' }}>{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {runResult.rows.slice(0, 50).map((row, i) => (
                                                <tr key={i}>
                                                    {runResult.columns.map(col => (
                                                        <td key={col} style={{ padding: '4px 8px', borderBottom: '1px solid #333' }}>{row[col] ?? 'NULL'}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div style={{ marginTop: '8px', color: '#6b7280' }}>
                                        {runResult.rows.length} row(s) returned
                                        {runResult.rows.length > 50 && ' (showing first 50)'}
                                    </div>
                                </div>
                            ) : (
                                <span style={{ color: '#22c55e' }}>{runResult.message || 'Query executed (no results)'}</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
