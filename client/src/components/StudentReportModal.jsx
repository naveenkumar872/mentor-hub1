import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import axios from 'axios'
import {
    X, FileText, Code, Brain, CheckCircle, XCircle,
    AlertTriangle, TrendingUp, Award, Target, Clock, Download,
    BarChart3, PieChart, Zap, Star, ChevronRight, Eye,
    Trophy, Activity
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

// Inline styles for the modal
const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        padding: 0
    },
    modal: {
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0f172a',
        borderRadius: '0',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'none',
        border: 'none',
        overflow: 'hidden',
        boxSizing: 'border-box'
    },
    header: {
        padding: '15px 25px',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.1))',
        borderBottom: '1px solid rgba(139, 92, 246, 0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        padding: '20px 25px',
        minHeight: 0
    },
    footer: {
        padding: '15px 25px',
        borderTop: '1px solid rgba(71, 85, 105, 0.3)',
        background: 'rgba(30, 41, 59, 0.5)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '13px',
        color: '#94a3b8',
        flexShrink: 0
    },
    tabs: {
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        padding: '8px',
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: '12px',
        flexWrap: 'wrap'
    },
    tab: {
        flex: 1,
        minWidth: '120px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '12px 16px',
        border: 'none',
        borderRadius: '8px',
        fontWeight: 600,
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    tabActive: {
        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
        color: 'white'
    },
    tabInactive: {
        background: 'transparent',
        color: '#94a3b8'
    },
    card: {
        padding: '20px',
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: '14px',
        border: '1px solid rgba(71, 85, 105, 0.3)',
        marginBottom: '15px'
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px',
        marginBottom: '20px'
    },
    statBox: {
        padding: '20px',
        borderRadius: '14px',
        textAlign: 'center'
    }
}

function StudentReportModal({ studentId, studentName, onClose, requestedBy, requestedByRole }) {
    const [loading, setLoading] = useState(true)
    const [report, setReport] = useState(null)
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('overview')

    useEffect(() => {
        if (studentId) {
            setLoading(true)
            axios.post(`${API_BASE}/reports/student/${studentId}`, {
                requestedBy,
                requestedByRole
            })
                .then(res => {
                    console.log('Report data:', res.data)
                    setReport(res.data)
                    setLoading(false)
                })
                .catch(err => {
                    console.error('Failed to generate report:', err)
                    setError('Failed to generate report')
                    setLoading(false)
                })
        }
    }, [studentId])

    const handleDownloadPDF = () => {
        if (!report) return

        const printWindow = window.open('', '_blank')
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Student Report - ${report.student.name}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
                    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #8b5cf6; }
                    .header h1 { color: #8b5cf6; font-size: 28px; }
                    .section { margin-bottom: 25px; page-break-inside: avoid; }
                    .section h2 { color: #8b5cf6; font-size: 18px; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
                    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
                    .stat-box { padding: 15px; background: #f8fafc; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0; }
                    .stat-value { font-size: 24px; font-weight: 700; color: #8b5cf6; }
                    .stat-label { font-size: 12px; color: #64748b; margin-top: 5px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                    th { background: #f1f5f9; font-size: 12px; color: #64748b; }
                    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; color: #64748b; font-size: 12px; }
                    .print-btn {
                        position: fixed; top: 20px; right: 20px;
                        background: #8b5cf6; color: white; border: none; padding: 10px 20px;
                        border-radius: 5px; cursor: pointer; font-weight: bold;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                        z-index: 1000;
                    }
                    .print-btn:hover { background: #7c3aed; }
                    @media print { .print-btn { display: none; } }
                </style>
            </head>
            <body>
                <button onclick="window.print()" class="print-btn">🖨️ Print Report</button>
                <div class="header">
                    <h1>📊 Student Performance Report</h1>
                    <p><strong>${report.student.name}</strong> | ${report.student.email}</p>
                    <p style="font-size: 12px; margin-top: 5px;">Generated: ${new Date(report.generatedAt).toLocaleString()}</p>
                </div>

                <div class="section">
                    <h2>📈 Performance Summary</h2>
                    <div class="grid">
                        <div class="stat-box"><div class="stat-value">${report.summary.overallAvgScore}%</div><div class="stat-label">Overall Score</div></div>
                        <div class="stat-box"><div class="stat-value">#${report.summary.leaderboardRank}</div><div class="stat-label">Rank</div></div>
                        <div class="stat-box"><div class="stat-value">${report.summary.totalSubmissions}</div><div class="stat-label">Submissions</div></div>
                        <div class="stat-box"><div class="stat-value">${report.summary.aptitudeTests}</div><div class="stat-label">Aptitude Tests</div></div>
                    </div>
                    <div class="grid">
                        <div class="stat-box"><div class="stat-value" style="color:#3b82f6">${report.summary.avgCodeScore}%</div><div class="stat-label">Code Score</div></div>
                        <div class="stat-box"><div class="stat-value" style="color:#10b981">${report.summary.avgTaskScore}%</div><div class="stat-label">Task Score</div></div>
                        <div class="stat-box"><div class="stat-value" style="color:#f59e0b">${report.summary.avgAptitudeScore}%</div><div class="stat-label">Aptitude Score</div></div>
                        <div class="stat-box"><div class="stat-value">${report.summary.completedProblems}</div><div class="stat-label">Problems Solved</div></div>
                    </div>
                </div>

                <div class="section">
                    <h2>💻 Programming Languages</h2>
                    ${report.languageBreakdown?.map(l => `<span style="display:inline-block;margin:5px;padding:8px 15px;background:#f1f5f9;border-radius:8px;"><strong>${l.language}</strong>: ${l.count} (${l.avgScore}%)</span>`).join('') || 'None'}
                </div>

                <div class="section">
                    <h2>📝 Recent Submissions</h2>
                    <table>
                        <thead><tr><th>Title</th><th>Type</th><th>Language</th><th>Score</th><th>Status</th></tr></thead>
                        <tbody>
                            ${report.recentSubmissions?.slice(0, 10).map(s => `<tr><td>${s.title}</td><td>${s.type}</td><td>${s.language}</td><td>${s.score}%</td><td>${s.status}</td></tr>`).join('') || '<tr><td colspan="5">No submissions</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div class="section">
                    <h2>🧠 Aptitude Tests</h2>
                    <table>
                        <thead><tr><th>Test</th><th>Difficulty</th><th>Score</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>
                            ${report.aptitudeResults?.map(t => `<tr><td>${t.testTitle}</td><td>${t.difficulty}</td><td>${t.score}%</td><td>${t.status}</td><td>${new Date(t.submittedAt).toLocaleDateString()}</td></tr>`).join('') || '<tr><td colspan="5">No tests taken</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div class="section">
                    <h2>👁️ Proctoring Summary</h2>
                    <div class="grid">
                        <div class="stat-box"><div class="stat-value">${report.integrity?.tabSwitches || 0}</div><div class="stat-label">Tab Switches</div></div>
                        <div class="stat-box"><div class="stat-value">${report.integrity?.copyPasteAttempts || 0}</div><div class="stat-label">Copy/Paste</div></div>
                        <div class="stat-box"><div class="stat-value">${report.integrity?.cameraBlocked || 0}</div><div class="stat-label">Camera Issues</div></div>
                        <div class="stat-box"><div class="stat-value">${report.integrity?.plagiarismCount || 0}</div><div class="stat-label">Plagiarism Flags</div></div>
                    </div>
                </div>

                ${report.aiInsights ? `
                <div class="section">
                    <h2>🤖 AI Insights</h2>
                    <p style="margin-bottom:15px">${report.aiInsights.overallAssessment || ''}</p>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                        <div style="background:#d1fae5;padding:15px;border-radius:8px">
                            <h4 style="color:#065f46;margin-bottom:10px">✅ Strengths</h4>
                            <ul style="padding-left:20px">${report.aiInsights.strengths?.map(s => `<li>${s}</li>`).join('') || ''}</ul>
                        </div>
                        <div style="background:#fef3c7;padding:15px;border-radius:8px">
                            <h4 style="color:#92400e;margin-bottom:10px">📈 Areas for Growth</h4>
                            <ul style="padding-left:20px">${report.aiInsights.areasForImprovement?.map(a => `<li>${a}</li>`).join('') || ''}</ul>
                        </div>
                    </div>
                </div>
                ` : ''}

                <div class="footer">
                    <p>Report generated by MentorHub | ${new Date().toLocaleString()}</p>
                </div>
            </body>
            </html>
        `)
        printWindow.document.close()
    }

    const getScoreColor = (score) => {
        if (score >= 80) return '#10b981'
        if (score >= 60) return '#f59e0b'
        return '#ef4444'
    }

    if (!studentId) return null

    const tabs = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'code', label: 'Code Analysis', icon: Code },
        { id: 'aptitude', label: 'Aptitude', icon: Brain },
        { id: 'proctoring', label: 'Proctoring', icon: Eye },
        { id: 'insights', label: 'AI Insights', icon: Zap }
    ]

    return ReactDOM.createPortal(
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                {/* HEADER */}
                <div style={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{
                            width: '48px', height: '48px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <FileText size={24} color="white" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'white' }}>
                                Student Performance Report
                            </h2>
                            <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
                                {studentName || 'Loading...'}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {report && (
                            <button onClick={handleDownloadPDF} style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 18px', background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                                border: 'none', borderRadius: '10px', color: 'white',
                                fontWeight: 600, fontSize: '14px', cursor: 'pointer'
                            }}>
                                <Download size={18} /> Download PDF
                            </button>
                        )}
                        <button onClick={onClose} style={{
                            width: '40px', height: '40px', borderRadius: '10px', border: 'none',
                            background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* CONTENT */}
                <div style={styles.content}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '60px' }}>
                            <div style={{
                                width: '50px', height: '50px', border: '4px solid rgba(139, 92, 246, 0.3)',
                                borderTop: '4px solid #8b5cf6', borderRadius: '50%',
                                animation: 'spin 1s linear infinite', margin: '0 auto'
                            }} />
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            <p style={{ color: '#94a3b8', marginTop: '20px' }}>Generating report...</p>
                        </div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', padding: '60px' }}>
                            <AlertTriangle size={50} color="#ef4444" />
                            <p style={{ color: '#ef4444', marginTop: '15px' }}>{error}</p>
                        </div>
                    ) : report ? (
                        <>
                            {/* TABS */}
                            <div style={styles.tabs}>
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        style={{
                                            ...styles.tab,
                                            ...(activeTab === tab.id ? styles.tabActive : styles.tabInactive)
                                        }}
                                    >
                                        <tab.icon size={16} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* OVERVIEW TAB */}
                            {activeTab === 'overview' && (
                                <div>
                                    {/* Student Card */}
                                    <div style={{
                                        ...styles.card,
                                        display: 'flex', alignItems: 'center', gap: '20px',
                                        background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)'
                                    }}>
                                        <div style={{
                                            width: '70px', height: '70px', borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '28px', fontWeight: 700, color: 'white'
                                        }}>
                                            {report.student.name?.charAt(0).toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <h3 style={{ margin: 0, fontSize: '22px', color: 'white' }}>{report.student.name}</h3>
                                            <p style={{ margin: '5px 0', color: '#94a3b8' }}>{report.student.email}</p>
                                            {report.mentor && <p style={{ margin: 0, color: '#8b5cf6' }}>Mentor: {report.mentor.name}</p>}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '42px', fontWeight: 800, color: getScoreColor(report.summary.overallAvgScore) }}>
                                                {report.summary.overallAvgScore}%
                                            </div>
                                            <div style={{ color: '#94a3b8' }}>Overall Score</div>
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div style={styles.statsGrid}>
                                        <StatBox icon={Trophy} value={`#${report.summary.leaderboardRank}`} label={`of ${report.summary.totalStudents}`} color="#f59e0b" />
                                        <StatBox icon={Code} value={report.summary.codeSubmissions} label="Code Submissions" color="#3b82f6" />
                                        <StatBox icon={Brain} value={report.summary.aptitudeTests} label="Aptitude Tests" color="#8b5cf6" />
                                        <StatBox icon={Activity} value={report.summary.totalSubmissions} label="Total Activities" color="#10b981" />
                                    </div>

                                    {/* Score Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
                                        <ScoreCard title="Code Performance" score={report.summary.avgCodeScore} details={[
                                            { label: 'Submissions', value: report.summary.codeSubmissions },
                                            { label: 'Problems Solved', value: report.summary.completedProblems }
                                        ]} />
                                        <ScoreCard title="Task Performance" score={report.summary.avgTaskScore} details={[
                                            { label: 'Submissions', value: report.summary.taskSubmissions },
                                            { label: 'Tasks Done', value: report.summary.completedTasks }
                                        ]} />
                                        <ScoreCard title="Aptitude Performance" score={report.summary.avgAptitudeScore} details={[
                                            { label: 'Tests Taken', value: report.summary.aptitudeTests },
                                            { label: 'Pass Rate', value: `${report.aptitudeResults?.length > 0 ? Math.round(report.aptitudeResults.filter(a => a.status === 'passed').length / report.aptitudeResults.length * 100) : 0}%` }
                                        ]} />
                                    </div>
                                </div>
                            )}

                            {/* CODE ANALYSIS TAB */}
                            {activeTab === 'code' && (
                                <div>
                                    <div style={styles.card}>
                                        <h3 style={{ margin: '0 0 15px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <PieChart size={20} color="#3b82f6" /> Language Proficiency
                                        </h3>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                            {report.languageBreakdown?.length > 0 ? report.languageBreakdown.map((lang, i) => (
                                                <div key={i} style={{
                                                    padding: '15px 20px', background: 'rgba(59, 130, 246, 0.1)',
                                                    borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)'
                                                }}>
                                                    <div style={{ fontWeight: 700, color: 'white' }}>{lang.language}</div>
                                                    <div style={{ fontSize: '14px', color: '#94a3b8' }}>{lang.count} submissions • {lang.avgScore}%</div>
                                                </div>
                                            )) : <p style={{ color: '#94a3b8' }}>No submissions yet</p>}
                                        </div>
                                    </div>

                                    <div style={styles.card}>
                                        <h3 style={{ margin: '0 0 15px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Clock size={20} color="#8b5cf6" /> Recent Submissions
                                        </h3>
                                        {report.recentSubmissions?.length > 0 ? report.recentSubmissions.slice(0, 5).map((sub, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: '15px', padding: '12px',
                                                background: 'rgba(15, 23, 42, 0.5)', borderRadius: '10px', marginBottom: '10px'
                                            }}>
                                                <div style={{
                                                    width: '40px', height: '40px', borderRadius: '10px',
                                                    background: sub.status === 'accepted' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    {sub.status === 'accepted' ? <CheckCircle size={20} color="#10b981" /> : <XCircle size={20} color="#ef4444" />}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, color: 'white' }}>{sub.title}</div>
                                                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>{sub.language} • {sub.type}</div>
                                                </div>
                                                <div style={{ fontSize: '18px', fontWeight: 700, color: getScoreColor(sub.score) }}>{sub.score}%</div>
                                            </div>
                                        )) : <p style={{ color: '#94a3b8' }}>No submissions yet</p>}
                                    </div>
                                </div>
                            )}

                            {/* APTITUDE TAB */}
                            {activeTab === 'aptitude' && (
                                <div>
                                    {report.categoryAnalysis?.length > 0 && (
                                        <div style={styles.card}>
                                            <h3 style={{ margin: '0 0 15px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <Target size={20} color="#8b5cf6" /> Category Performance
                                            </h3>
                                            {report.categoryAnalysis.map((cat, i) => (
                                                <div key={i} style={{ marginBottom: '15px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                        <span style={{ color: 'white' }}>{cat.category}</span>
                                                        <span style={{ color: getScoreColor(cat.accuracy) }}>{cat.correct}/{cat.total} ({cat.accuracy}%)</span>
                                                    </div>
                                                    <div style={{ height: '8px', background: 'rgba(30, 41, 59, 0.8)', borderRadius: '4px' }}>
                                                        <div style={{ width: `${cat.accuracy}%`, height: '100%', background: getScoreColor(cat.accuracy), borderRadius: '4px' }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div style={styles.card}>
                                        <h3 style={{ margin: '0 0 15px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Brain size={20} color="#8b5cf6" /> Test History
                                        </h3>
                                        {report.aptitudeResults?.length > 0 ? report.aptitudeResults.map((test, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: '15px', padding: '12px',
                                                background: 'rgba(15, 23, 42, 0.5)', borderRadius: '10px', marginBottom: '10px'
                                            }}>
                                                <div style={{
                                                    width: '45px', height: '45px', borderRadius: '10px',
                                                    background: test.status === 'passed' ? 'linear-gradient(135deg, #10b981, #06b6d4)' : 'linear-gradient(135deg, #ef4444, #f97316)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    {test.status === 'passed' ? <Award size={22} color="white" /> : <XCircle size={22} color="white" />}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, color: 'white' }}>{test.testTitle || 'Unknown Test'}</div>
                                                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>{test.difficulty} • {new Date(test.submittedAt).toLocaleDateString()}</div>
                                                </div>
                                                <div style={{
                                                    padding: '6px 14px', borderRadius: '8px', fontWeight: 700,
                                                    background: test.status === 'passed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                    color: test.status === 'passed' ? '#10b981' : '#ef4444'
                                                }}>{test.score}%</div>
                                            </div>
                                        )) : <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px' }}>No aptitude tests taken yet</p>}
                                    </div>
                                </div>
                            )}

                            {/* PROCTORING TAB */}
                            {activeTab === 'proctoring' && (
                                <div>
                                    <div style={{ ...styles.card, textAlign: 'center', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                        <Eye size={30} color="#3b82f6" style={{ marginBottom: '10px' }} />
                                        <h3 style={{ margin: 0, color: 'white' }}>Proctoring Summary</h3>
                                        <p style={{ margin: '5px 0 0', color: '#94a3b8' }}>Monitoring data from assessments</p>
                                    </div>

                                    <div style={styles.statsGrid}>
                                        <ProctoringBox label="Tab Switches" value={report.integrity?.tabSwitches || 0} severity={report.integrity?.tabSwitches > 5 ? 'high' : report.integrity?.tabSwitches > 2 ? 'medium' : 'low'} />
                                        <ProctoringBox label="Copy/Paste" value={report.integrity?.copyPasteAttempts || 0} severity={report.integrity?.copyPasteAttempts > 3 ? 'high' : report.integrity?.copyPasteAttempts > 1 ? 'medium' : 'low'} />
                                        <ProctoringBox label="Camera Issues" value={report.integrity?.cameraBlocked || 0} severity={report.integrity?.cameraBlocked > 2 ? 'high' : report.integrity?.cameraBlocked > 0 ? 'medium' : 'low'} />
                                        <ProctoringBox label="Plagiarism Flags" value={report.integrity?.plagiarismCount || 0} severity={report.integrity?.plagiarismCount > 0 ? 'high' : 'low'} />
                                    </div>
                                </div>
                            )}

                            {/* AI INSIGHTS TAB */}
                            {activeTab === 'insights' && (
                                <div>
                                    {report.aiInsights ? (
                                        <>
                                            <div style={{ ...styles.card, background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                                    <Zap size={24} color="#8b5cf6" />
                                                    <h3 style={{ margin: 0, color: 'white' }}>AI Analysis</h3>
                                                </div>
                                                <p style={{ margin: 0, color: '#e2e8f0', lineHeight: 1.7 }}>{report.aiInsights.overallAssessment}</p>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                                                <div style={{ ...styles.card, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                                    <h4 style={{ margin: '0 0 12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}><Star size={18} /> Strengths</h4>
                                                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#e2e8f0' }}>
                                                        {report.aiInsights.strengths?.map((s, i) => <li key={i} style={{ marginBottom: '8px' }}>{s}</li>)}
                                                    </ul>
                                                </div>
                                                <div style={{ ...styles.card, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                                    <h4 style={{ margin: '0 0 12px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={18} /> Areas for Growth</h4>
                                                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#e2e8f0' }}>
                                                        {report.aiInsights.areasForImprovement?.map((a, i) => <li key={i} style={{ marginBottom: '8px' }}>{a}</li>)}
                                                    </ul>
                                                </div>
                                            </div>

                                            <div style={styles.card}>
                                                <h4 style={{ margin: '0 0 12px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px' }}><ChevronRight size={18} /> Recommendations</h4>
                                                {report.aiInsights.recommendations?.map((r, i) => (
                                                    <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '10px', marginBottom: '10px' }}>
                                                        <span style={{
                                                            width: '24px', height: '24px', borderRadius: '50%',
                                                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0
                                                        }}>{i + 1}</span>
                                                        <span style={{ color: '#e2e8f0' }}>{r}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '60px' }}>
                                            <Zap size={50} style={{ opacity: 0.3, color: '#94a3b8' }} />
                                            <p style={{ color: '#94a3b8', marginTop: '15px' }}>AI insights not available</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : null}
                </div>

                {/* FOOTER */}
                {report && (
                    <div style={styles.footer}>
                        <span>Generated: {new Date(report.generatedAt).toLocaleString()}</span>
                        <span>Requested by: {report.requestedBy || 'System'}</span>
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}

// Helper Components
function StatBox({ icon: Icon, value, label, color }) {
    return (
        <div style={{ ...styles.statBox, background: `${color}15`, border: `1px solid ${color}30` }}>
            <Icon size={24} color={color} style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '26px', fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</div>
        </div>
    )
}

function ScoreCard({ title, score, details }) {
    const getColor = (s) => s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444'
    return (
        <div style={styles.card}>
            <div style={{ fontWeight: 600, color: 'white', marginBottom: '10px' }}>{title}</div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: getColor(score), marginBottom: '12px' }}>{score}%</div>
            {details.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
                    <span style={{ color: '#94a3b8' }}>{d.label}</span>
                    <span style={{ fontWeight: 600, color: 'white' }}>{d.value}</span>
                </div>
            ))}
        </div>
    )
}

function ProctoringBox({ label, value, severity }) {
    const colors = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' }
    const color = colors[severity]
    return (
        <div style={{ ...styles.statBox, background: `${color}10`, border: `1px solid ${color}30` }}>
            <div style={{ fontSize: '32px', fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '5px' }}>{label}</div>
        </div>
    )
}

export default StudentReportModal
