import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, CheckCircle, XCircle, AlertTriangle, ArrowLeft, Download, Brain, Code2, Database, MessageSquare, Shield, Camera, Smartphone, ArrowLeftRight, Maximize } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function SkillTestReport({ attemptId, onBack }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => { loadReport(); }, [attemptId]);

    const loadReport = async () => {
        try {
            const { data: resp } = await axios.get(`${API}/api/skill-tests/report/${attemptId}`);
            setData(resp);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading report...</div>;
    if (error) return <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>{error}</div>;
    if (!data) return null;

    const { attempt, violations } = data;
    const passed = attempt.overall_status === 'completed';

    const sections = [
        { key: 'mcq', label: 'MCQ Test', icon: <Brain size={18} />, score: attempt.mcq_score, status: attempt.mcq_status, color: '#8b5cf6' },
        { key: 'coding', label: 'Coding Test', icon: <Code2 size={18} />, score: attempt.coding_score, status: attempt.coding_status, color: '#3b82f6' },
        { key: 'sql', label: 'SQL Test', icon: <Database size={18} />, score: attempt.sql_score, status: attempt.sql_status, color: '#10b981' },
        { key: 'interview', label: 'AI Interview', icon: <MessageSquare size={18} />, score: attempt.interview_score, status: attempt.interview_status, isOutOf10: true, color: '#f59e0b' },
    ];

    const report = attempt.report || {};

    return (
        <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <button onClick={onBack} style={{
                    padding: '8px 16px', background: '#334155', border: '1px solid #475569',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8',
                    display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                    <ArrowLeft size={14} /> Back to Tests
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={20} color="#8b5cf6" />
                    <span style={{ fontWeight: 700, fontSize: '16px', color: '#f1f5f9' }}>Assessment Report</span>
                </div>
            </div>

            {/* Overall Result Card */}
            <div style={{
                background: passed ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05))' : 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.05))',
                border: '1px solid ' + (passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'),
                borderRadius: '16px', padding: '28px', marginBottom: '24px', textAlign: 'center'
            }}>
                <div style={{
                    width: '70px', height: '70px', borderRadius: '50%', margin: '0 auto 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#1e293b', boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                }}>
                    {passed ? <CheckCircle size={36} color="#22c55e" /> : <XCircle size={36} color="#ef4444" />}
                </div>
                <h2 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 800, color: passed ? '#16a34a' : '#dc2626' }}>
                    {passed ? 'Assessment Passed' : 'Assessment Not Passed'}
                </h2>
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
                    {attempt.title} — Attempt #{attempt.attempt_number}
                </p>
                {attempt.student_name && (
                    <p style={{ margin: '4px 0 0', fontWeight: 600, color: '#cbd5e1' }}>{attempt.student_name}</p>
                )}
            </div>

            {/* Section Scores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {sections.map(s => {
                    const isPassed = s.status === 'passed';
                    const isFailed = s.status === 'failed';
                    const isPending = s.status === 'pending';
                    return (
                        <div key={s.key} style={{
                            background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
                            padding: '16px', textAlign: 'center',
                            opacity: isPending ? 0.5 : 1
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px', color: s.color }}>
                                {s.icon}
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{s.label}</div>
                            {isPending ? (
                                <div style={{ fontSize: '14px', color: '#64748b' }}>Not attempted</div>
                            ) : (
                                <>
                                    <div style={{ fontSize: '24px', fontWeight: 800, color: isPassed ? '#22c55e' : '#ef4444' }}>
                                        {s.isOutOf10 ? `${(s.score || 0).toFixed(1)}/10` : `${Math.round(s.score || 0)}%`}
                                    </div>
                                    <div style={{
                                        marginTop: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '11px',
                                        fontWeight: 600, display: 'inline-block',
                                        background: isPassed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: isPassed ? '#34d399' : '#f87171'
                                    }}>
                                        {isPassed ? 'Passed' : 'Failed'}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* AI Report */}
            {report && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f5f9' }}>
                        <Brain size={18} color="#8b5cf6" /> AI Assessment Summary
                    </h3>

                    {report.overall_assessment && (
                        <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#cbd5e1', marginBottom: '16px' }}>{report.overall_assessment}</p>
                    )}

                    {report.strengths && report.strengths.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e', margin: '0 0 8px' }}>✅ Strengths</h4>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                {report.strengths.map((s, i) => (
                                    <li key={i} style={{ fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1', marginBottom: '4px' }}>{s}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {report.weaknesses && report.weaknesses.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#ef4444', margin: '0 0 8px' }}>Areas for Improvement</h4>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                {report.weaknesses.map((w, i) => (
                                    <li key={i} style={{ fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1', marginBottom: '4px' }}>{w}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {report.recommendations && report.recommendations.length > 0 && (
                        <div>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#3b82f6', margin: '0 0 8px' }}>Recommendations</h4>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                {report.recommendations.map((r, i) => (
                                    <li key={i} style={{ fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1', marginBottom: '4px' }}>{r}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {report.skill_ratings && (
                        <div style={{ marginTop: '16px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#8b5cf6', margin: '0 0 8px' }}>🎯 Skill Ratings</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {Object.entries(report.skill_ratings).map(([skill, rating]) => (
                                    <div key={skill} style={{
                                        padding: '6px 12px', background: '#0f172a', borderRadius: '8px',
                                        border: '1px solid #334155', fontSize: '12px', color: '#cbd5e1'
                                    }}>
                                        <span style={{ fontWeight: 600 }}>{skill}:</span>{' '}
                                        <span style={{
                                            color: rating >= 8 ? '#22c55e' : rating >= 6 ? '#f59e0b' : '#ef4444',
                                            fontWeight: 700
                                        }}>{rating}/10</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* MCQ Details */}
            {attempt.mcq_questions && attempt.mcq_answers && attempt.mcq_status !== 'pending' && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>MCQ Details</h3>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {(attempt.mcq_questions || []).map((q, i) => {
                            const studentAnswer = (attempt.mcq_answers || {})[String(q.id)];
                            const isCorrect = studentAnswer === q.correct_answer;
                            return (
                                <div key={i} style={{
                                    padding: '10px', borderRadius: '8px', marginBottom: '8px',
                                    background: isCorrect ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                    border: '1px solid ' + (isCorrect ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)')
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#f1f5f9' }}>
                                        {isCorrect ? <CheckCircle size={14} color="#22c55e" /> : <XCircle size={14} color="#ef4444" />}
                                        Q{i + 1}: {q.question?.slice(0, 100)}...
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                        Your: {studentAnswer || 'Not answered'} | Correct: {q.correct_answer}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Interview Details */}
            {attempt.interview_qa && attempt.interview_qa.length > 0 && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>Interview Q&A</h3>
                    {attempt.interview_qa.filter(qa => qa.answer).map((qa, i) => (
                        <div key={i} style={{ marginBottom: '16px', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#cbd5e1' }}>
                                Q{i + 1}: {qa.question}
                            </div>
                            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                                <strong>A:</strong> {qa.answer?.slice(0, 200)}{qa.answer?.length > 200 ? '...' : ''}
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                fontSize: '12px', fontWeight: 600,
                                color: (qa.score || 0) >= 7 ? '#22c55e' : (qa.score || 0) >= 5 ? '#d97706' : '#ef4444'
                            }}>
                                Score: {qa.score || 0}/10
                                {qa.evaluation?.feedback && <span style={{ color: '#64748b', fontWeight: 400 }}>— {qa.evaluation.feedback.slice(0, 100)}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Proctoring Violations */}
            {violations && violations.length > 0 && (() => {
                const tabSwitches = violations.filter(v => v.event_type === 'tab_switch').length;
                const fullscreenExits = violations.filter(v => v.event_type === 'fullscreen_exit').length;
                const phoneDetections = violations.filter(v => v.event_type === 'phone_detected').length;
                const cameraBlocks = violations.filter(v => v.event_type === 'camera_blocked').length;
                const otherViolations = violations.length - tabSwitches - fullscreenExits - phoneDetections - cameraBlocks;
                return (
                <div style={{ background: '#1e293b', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '20px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171' }}>
                        <Shield size={18} /> Proctoring Violations ({violations.length})
                    </h3>

                    {/* Stats Summary */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {tabSwitches > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(245,158,11,0.1)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)', fontSize: '12px', fontWeight: 600, color: '#fbbf24' }}>
                                <ArrowLeftRight size={14} /> Tab Switches: {tabSwitches}
                            </div>
                        )}
                        {fullscreenExits > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(245,158,11,0.1)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)', fontSize: '12px', fontWeight: 600, color: '#fbbf24' }}>
                                <Maximize size={14} /> Fullscreen Exits: {fullscreenExits}
                            </div>
                        )}
                        {phoneDetections > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', fontSize: '12px', fontWeight: 600, color: '#f87171' }}>
                                <Smartphone size={14} /> Phone Detected: {phoneDetections}
                            </div>
                        )}
                        {cameraBlocks > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', fontSize: '12px', fontWeight: 600, color: '#f87171' }}>
                                <Camera size={14} /> Camera Blocked: {cameraBlocks}
                            </div>
                        )}
                        {otherViolations > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(100,116,139,0.1)', borderRadius: '8px', border: '1px solid rgba(100,116,139,0.3)', fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                                <AlertTriangle size={14} /> Other: {otherViolations}
                            </div>
                        )}
                    </div>

                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {violations.map((v, i) => (
                            <div key={i} style={{
                                padding: '8px 12px', borderRadius: '6px', marginBottom: '4px',
                                background: v.severity === 'high' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: '#cbd5e1'
                            }}>
                                <span><strong>{v.event_type}</strong> during {v.test_stage}{v.details ? `: ${v.details}` : ''}</span>
                                <span style={{
                                    padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                                    background: v.severity === 'high' ? '#ef4444' : v.severity === 'medium' ? '#f59e0b' : '#6b7280',
                                    color: 'white'
                                }}>{v.severity}</span>
                            </div>
                        ))}
                    </div>
                </div>
                );
            })()}
        </div>
    );
}
