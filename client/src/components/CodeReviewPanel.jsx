import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { MessageCircle, Send, Trash2, User, Clock, Hash } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api';

const CodeReviewPanel = ({ submissionId, submission }) => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [selectedLine, setSelectedLine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const token = localStorage.getItem('authToken');

    const canComment = user?.role === 'mentor' || user?.role === 'admin';
    const codeLines = (submission?.code || '').split('\n');

    useEffect(() => {
        if (!submissionId) return;
        loadComments();
    }, [submissionId]);

    const loadComments = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/submissions/${submissionId}/reviews`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setComments(data.reviews || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const submitComment = async () => {
        if (!newComment.trim() || posting) return;
        setPosting(true);
        try {
            const res = await fetch(`${API_BASE}/submissions/${submissionId}/reviews`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment: newComment, lineNumber: selectedLine })
            });
            if (res.ok) {
                const saved = await res.json();
                // Optimistically add the new comment immediately so the UI updates
                // without needing a round-trip refetch, then still reload for accuracy.
                const optimistic = {
                    id: saved.id,
                    submission_id: submissionId,
                    author_id: user?.id,
                    author_name: user?.name || 'You',
                    line_number: selectedLine,
                    comment: newComment,
                    created_at: new Date().toISOString()
                };
                setComments(prev => [...prev, optimistic]);
                setNewComment('');
                setSelectedLine(null);
                // Reload to get server-accurate data (author_name from JOIN, etc.)
                await loadComments();
            } else {
                const err = await res.json().catch(() => ({}));
                console.error('Failed to post review:', err);
                alert('Failed to post review: ' + (err.error || res.status));
            }
        } catch (e) {
            console.error(e);
            alert('Network error posting review.');
        } finally {
            setPosting(false);
        }
    };

    const deleteComment = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/reviews/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setComments(c => c.filter(x => x.id !== id));
        } catch (e) { console.error(e); }
    };

    const isDark = theme !== 'light';
    const bg        = isDark ? '#0f172a' : '#f8fafc';
    const cardBg    = isDark ? '#1e293b' : '#ffffff';
    const border    = isDark ? '#334155' : '#e2e8f0';
    const textMain  = isDark ? '#f1f5f9' : '#0f172a';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const codeBg    = isDark ? '#0d1117' : '#f6f8fa';
    const lineHL    = isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.1)';

    const commentsByLine = {};
    comments.forEach(c => {
        const key = c.line_number ?? 'general';
        if (!commentsByLine[key]) commentsByLine[key] = [];
        commentsByLine[key].push(c);
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', background: bg, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden', fontFamily: 'inherit' }}>

            {/* ── Header ── */}
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${border}`, background: cardBg, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <MessageCircle size={17} color="#6366f1" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: textMain }}>Code Review</span>
                {submission && (
                    <span style={{ fontSize: '0.82rem', color: textMuted, marginLeft: 2 }}>
                        — {submission.itemTitle || `Submission #${submissionId}`}
                    </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {submission?.language && (
                        <span style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 600 }}>
                            {submission.language.toUpperCase()}
                        </span>
                    )}
                    {submission?.status && (
                        <span style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 20, background: submission.status === 'accepted' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: submission.status === 'accepted' ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                            {submission.status.toUpperCase()}
                        </span>
                    )}
                    {submission?.score != null && (
                        <span style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 20, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontWeight: 600 }}>
                            Score: {submission.score}%
                        </span>
                    )}
                    {submission?.studentName && (
                        <span style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 20, background: 'rgba(249,115,22,0.12)', color: '#fb923c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <User size={10} /> {submission.studentName}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Body: Code | Comments ── */}
            <div style={{ display: 'flex', minHeight: 400 }}>

                {/* LEFT — Code with line numbers */}
                <div style={{ flex: '0 0 56%', borderRight: `1px solid ${border}`, overflowY: 'auto', maxHeight: 520 }}>
                    {!submission?.code ? (
                        <div style={{ padding: 32, textAlign: 'center', color: textMuted, fontSize: '0.85rem' }}>
                            Code not available.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Fira Mono','Consolas',monospace", fontSize: '0.78rem', lineHeight: 1.6 }}>
                            <tbody>
                                {codeLines.map((line, idx) => {
                                    const ln = idx + 1;
                                    const active = selectedLine === ln;
                                    const hasC   = !!commentsByLine[ln];
                                    return (
                                        <tr
                                            key={ln}
                                            onClick={() => canComment && setSelectedLine(active ? null : ln)}
                                            style={{ background: active ? lineHL : 'transparent', cursor: canComment ? 'pointer' : 'default', borderLeft: active ? '3px solid #6366f1' : hasC ? '3px solid #f59e0b' : '3px solid transparent' }}
                                            title={canComment ? `Click to comment on line ${ln}` : undefined}
                                        >
                                            <td style={{ padding: '0 8px', minWidth: 34, userSelect: 'none', color: hasC ? '#f59e0b' : textMuted, textAlign: 'right', background: isDark ? '#0d1117' : '#f0f4f8', borderRight: `1px solid ${border}`, fontSize: '0.72rem' }}>
                                                {ln}
                                            </td>
                                            <td style={{ padding: '0 12px', whiteSpace: 'pre', background: codeBg, color: textMain }}>{line || ' '}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* RIGHT — Comments list + input */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: canComment ? 330 : 520, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {loading ? (
                            <div style={{ color: textMuted, textAlign: 'center', padding: 24, fontSize: '0.82rem' }}>Loading…</div>
                        ) : comments.length === 0 ? (
                            <div style={{ color: textMuted, textAlign: 'center', padding: 24, fontSize: '0.82rem' }}>
                                {canComment
                                    ? '👆 Click any line in the code to comment on it, or write a general comment below.'
                                    : 'No review comments yet from your mentor.'}
                            </div>
                        ) : (
                            comments.map(c => (
                                <div key={c.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, padding: '9px 11px', position: 'relative' }}>
                                    {c.line_number && (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 4, padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700, marginBottom: 5 }}>
                                            <Hash size={9} /> Line {c.line_number}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                                            {(c.author_name || 'M')[0].toUpperCase()}
                                        </div>
                                        <strong style={{ fontSize: '0.8rem', color: textMain }}>{c.author_name || 'Mentor'}</strong>
                                        <span style={{ fontSize: '0.7rem', color: textMuted, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Clock size={10} /> {new Date(c.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.83rem', color: textMain, lineHeight: 1.5, paddingLeft: 26 }}>{c.comment}</div>
                                    {c.author_id === user?.id && (
                                        <button onClick={() => deleteComment(c.id)} style={{ position: 'absolute', top: 7, right: 7, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.6 }}>
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {canComment && (
                        <div style={{ borderTop: `1px solid ${border}`, padding: '10px 12px', background: cardBg, display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {selectedLine && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
                                    <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', padding: '2px 9px', borderRadius: 20, fontWeight: 600 }}>
                                        Line {selectedLine}
                                    </span>
                                    <button onClick={() => setSelectedLine(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, fontSize: '0.75rem' }}>✕ clear</button>
                                </div>
                            )}
                            <textarea
                                rows={3}
                                placeholder={selectedLine ? `Comment on line ${selectedLine}…` : 'Write a review comment, or click a line in the code… (Ctrl+Enter to post)'}
                                value={newComment}
                                onChange={e => setNewComment(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(); }}
                                style={{ width: '100%', resize: 'none', padding: '7px 9px', borderRadius: 7, border: `1px solid ${border}`, background: bg, color: textMain, fontSize: '0.82rem', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                            />
                            <button
                                onClick={submitComment}
                                disabled={!newComment.trim() || posting}
                                style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: newComment.trim() && !posting ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : (isDark ? '#334155' : '#cbd5e1'), color: '#fff', border: 'none', borderRadius: 7, cursor: newComment.trim() && !posting ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '0.82rem' }}
                            >
                                <Send size={13} />
                                {posting ? 'Posting…' : 'Post Review'}
                            </button>
                        </div>
                    )}

                    {!canComment && (
                        <div style={{ borderTop: `1px solid ${border}`, padding: '8px 12px', fontSize: '0.78rem', color: textMuted, textAlign: 'center', background: cardBg }}>
                            Mentor review comments appear above.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CodeReviewPanel;
