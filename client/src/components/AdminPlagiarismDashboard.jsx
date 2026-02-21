/**
 * Admin Plagiarism Detection Dashboard
 * Uses /api/analytics/plagiarism - same source as Analytics page
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, TrendingUp, Flag, Users, BookOpen, Search, RefreshCw } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api';

const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

export default function AdminPlagiarismDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [error, setError] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(`${API_BASE}/analytics/plagiarism`, { headers: getHeaders() });
            setData(res.data);
        } catch (err) {
            setError('Failed to load plagiarism data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    if (loading) return (
        <div style={{ padding: 40, textAlign: 'center', opacity: 0.6 }}>
            <p>Loading plagiarism data...</p>
        </div>
    );

    if (error) return (
        <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
            <AlertTriangle size={32} style={{ marginBottom: 12 }} />
            <p style={{ margin: '0 0 12px' }}>{error}</p>
            <button onClick={fetchData} style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Retry</button>
        </div>
    );

    const stats = data?.stats || {};
    const flagged = data?.flaggedSubmissions || [];
    const offenders = data?.repeatOffenders || [];
    const byProblem = data?.byProblem || [];

    const total = stats.totalSubmissions || 0;
    const count = stats.plagiarismCount || 0;
    const rate = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';

    const filtered = flagged.filter(s => {
        const q = search.toLowerCase();
        return !q
            || (s.studentName || '').toLowerCase().includes(q)
            || (s.problemTitle || '').toLowerCase().includes(q)
            || (s.copiedFromName || '').toLowerCase().includes(q);
    });

    const statCards = [
        { label: 'Total Submissions', value: total,          color: '#6366f1', Icon: BookOpen },
        { label: 'Plagiarism Flags',  value: count,          color: '#ef4444', Icon: Flag },
        { label: 'Plagiarism Rate',   value: `${rate}%`,     color: '#f59e0b', Icon: TrendingUp },
        { label: 'Repeat Offenders',  value: offenders.length, color: '#8b5cf6', Icon: Users },
    ];

    return (
        <div style={{ maxWidth: 1400 }}>
            {/* Header */}
            <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}> Plagiarism Detection Dashboard</h2>
                    <p style={{ margin: 0, opacity: 0.55, fontSize: 13 }}>Monitor code similarity and academic integrity across all submissions</p>
                </div>
                <button
                    onClick={fetchData}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--primary, #4f46e5)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
                {statCards.map((s, i) => (
                    <div key={i} style={{ padding: 20, borderRadius: 14, background: 'var(--card-bg, #1e293b)', border: `1px solid ${s.color}30`, borderLeft: `4px solid ${s.color}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, opacity: 0.6 }}>
                            <s.Icon size={15} style={{ color: s.color }} />
                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{s.label}</span>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Repeat Offenders + Most Copied Problems */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
                <div style={{ background: 'var(--card-bg, #1e293b)', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border, #334155)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={15} color="#ef4444" />
                        <span style={{ fontWeight: 700, color: '#ef4444' }}>Repeat Offenders</span>
                    </div>
                    {offenders.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', opacity: 0.4 }}>No repeat offenders found</div>
                    ) : offenders.map((o, i) => (
                        <div key={i} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border, #33415530)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase' }}>{o.name}</div>
                                <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{o.copiedFromNames || 'Multiple sources'}</div>
                            </div>
                            <span style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                {o.plagiarismCount}x
                            </span>
                        </div>
                    ))}
                </div>

                <div style={{ background: 'var(--card-bg, #1e293b)', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border, #334155)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BookOpen size={15} color="#f59e0b" />
                        <span style={{ fontWeight: 700, color: '#f59e0b' }}>Most Copied Problems</span>
                    </div>
                    {byProblem.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', opacity: 0.4 }}>No data available</div>
                    ) : byProblem.map((p, i) => (
                        <div key={i} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border, #33415530)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.title}</div>
                                <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{p.difficulty || 'Unknown'}</div>
                            </div>
                            <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13 }}>{p.flaggedCount} flags</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* All Flagged Submissions */}
            <div style={{ background: 'var(--card-bg, #1e293b)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border, #334155)' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag size={15} color="#ef4444" />
                        <span style={{ fontWeight: 700 }}>All Flagged Submissions</span>
                        <span style={{ fontSize: 12, opacity: 0.4 }}>({filtered.length} of {flagged.length})</span>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search student or problem"
                            style={{ padding: '7px 12px 7px 32px', borderRadius: 8, border: '1px solid var(--border, #334155)', background: 'var(--bg, #0f172a)', color: 'inherit', fontSize: 13, outline: 'none', width: 220 }}
                        />
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div style={{ padding: '48px 0', textAlign: 'center', opacity: 0.4 }}>
                        <Flag size={36} style={{ marginBottom: 12 }} />
                        <p style={{ margin: 0 }}>No flagged submissions found</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                                    {['Student', 'Problem', 'Language', 'Score', 'Copied From', 'Date'].map(h => (
                                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.45 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((s, i) => (
                                    <tr key={i} style={{ borderTop: '1px solid var(--border, #33415530)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.05)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '11px 16px', fontWeight: 600 }}>{s.studentName}</td>
                                        <td style={{ padding: '11px 16px', opacity: 0.75 }}>{s.problemTitle || '—'}</td>
                                        <td style={{ padding: '11px 16px', opacity: 0.6 }}>{s.language || '—'}</td>
                                        <td style={{ padding: '11px 16px' }}>
                                            <span style={{ fontWeight: 700, color: s.score >= 70 ? '#22c55e' : '#ef4444' }}>{s.score ?? '—'}</span>
                                        </td>
                                        <td style={{ padding: '11px 16px' }}>
                                            <span style={{ color: '#ef4444', fontWeight: 600 }}>{s.copiedFromName || '—'}</span>
                                        </td>
                                        <td style={{ padding: '11px 16px', opacity: 0.5, whiteSpace: 'nowrap' }}>
                                            {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
