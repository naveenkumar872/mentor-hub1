import React, { useState, useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Code, Send, Trophy, Clock, CheckCircle, XCircle, ChevronRight, Play, Upload, FileText, Trash2, Eye, AlertTriangle, Download, Lightbulb, HelpCircle, Sparkles, Target, Zap, BookOpen, Brain, Award, X, Video, Shield, Search, BarChart3, Flame, Layers, Database, RefreshCw } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import AptitudeTestInterface from '../components/AptitudeTestInterface'
import GlobalTestInterface from '../components/GlobalTestInterface'
import AptitudeReportModal from '../components/AptitudeReportModal'
import ProctoredCodeEditor from '../components/ProctoredCodeEditor'
import CodeOutputPreview from '../components/CodeOutputPreview'
import SQLValidator from '../components/SQLValidator'
import SQLVisualizer from '../components/SQLVisualizer'
import SQLDebugger from '../components/SQLDebugger'
import { useAuth } from '../App'
import axios from 'axios'
import GlobalReportModal from '../components/GlobalReportModal'
import Editor from '@monaco-editor/react'
import './Portal.css'

const API_BASE = 'http://localhost:3000/api'

// Language configurations for code editor
const LANGUAGE_CONFIG = {
    'Python': { monacoLang: 'python', ext: '.py', defaultCode: `# Write your Python code here\n\ndef solution():\n    pass\n\n# Call your solution\nsolution()` },
    'JavaScript': { monacoLang: 'javascript', ext: '.js', defaultCode: `// Write your JavaScript code here\n\nfunction solution() {\n    \n}\n\n// Call your solution\nsolution();` },
    'Java': { monacoLang: 'java', ext: '.java', defaultCode: `// Write your Java code here\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}` },
    'C': { monacoLang: 'c', ext: '.c', defaultCode: `// Write your C code here\n#include <stdio.h>\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'C++': { monacoLang: 'cpp', ext: '.cpp', defaultCode: `// Write your C++ code here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'SQL': { monacoLang: 'sql', ext: '.sql', defaultCode: `-- Write your SQL query here\nSELECT * FROM table_name;` }
}

function StudentPortal() {
    const { user } = useAuth()
    const location = useLocation()
    const [title, setTitle] = useState('Dashboard')
    const [subtitle, setSubtitle] = useState('Welcome back!')
    const [mentorInfo, setMentorInfo] = useState(null)

    // Fetch mentor info once
    useEffect(() => {
        if (user?.id) {
            axios.get(`${API_BASE}/analytics/student/${user.id}`)
                .then(res => {
                    if (res.data.mentorInfo) {
                        setMentorInfo(res.data.mentorInfo)
                    }
                })
                .catch(err => console.error('Error fetching mentor info:', err))
        }
    }, [user?.id])

    useEffect(() => {
        const path = location.pathname.split('/').pop()
        switch (path) {
            case 'tasks':
                setTitle('ML Tasks')
                setSubtitle('Machine Learning tasks to complete')
                break
            case 'assignments':
                setTitle('Coding Problems')
                setSubtitle('Solve coding and SQL problems')
                break
            case 'aptitude':
                setTitle('Aptitude Tests')
                setSubtitle('Test your reasoning and analytical skills')
                break
            case 'global-tests':
                setTitle('Global Complete Tests')
                setSubtitle('Aptitude, Verbal, Logical, Coding, SQL')
                break
            case 'submissions':
                setTitle('My Submissions')
                setSubtitle('View your submission history and reports')
                break
            default:
                setTitle('Dashboard')
                setSubtitle(`Welcome back, ${user?.name}!`)
        }
    }, [location, user])

    const navItems = [
        { path: '/student', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { path: '/student/tasks', label: 'ML Tasks', icon: <ClipboardList size={20} /> },
        { path: '/student/assignments', label: 'Coding Problems', icon: <Code size={20} /> },
        { path: '/student/aptitude', label: 'Aptitude Tests', icon: <Brain size={20} /> },
        { path: '/student/global-tests', label: 'Global Complete Tests', icon: <Layers size={20} /> },
        { path: '/student/submissions', label: 'My Submissions', icon: <Send size={20} /> }
    ]

    return (
        <DashboardLayout navItems={navItems} title={title} subtitle={subtitle} mentorInfo={mentorInfo}>
            <Routes>
                <Route path="/" element={<Dashboard user={user} />} />
                <Route path="/tasks" element={<Tasks user={user} />} />
                <Route path="/assignments" element={<Assignments user={user} />} />
                <Route path="/aptitude" element={<AptitudeTests user={user} />} />
                <Route path="/global-tests" element={<GlobalTests user={user} />} />
                <Route path="/submissions" element={<Submissions user={user} />} />
            </Routes>
        </DashboardLayout>
    )
}

function Dashboard({ user }) {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${API_BASE}/analytics/student/${user.id}`)
            .then(res => {
                setStats(res.data)
                setLoading(false)
            })
            .catch(err => {
                console.error(err)
                setLoading(false)
            })
    }, [user.id])

    // Format time ago
    const formatTimeAgo = (dateString) => {
        const date = new Date(dateString)
        const now = new Date()
        const diffMs = now - date
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMs / 3600000)
        const diffDays = Math.floor(diffMs / 86400000)

        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins} min ago`
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
        return date.toLocaleDateString()
    }

    if (loading) return <div className="loading-spinner"></div>
    if (!stats) return <div>Error loading stats</div>

    return (
        <div className="dashboard-container animate-fadeIn">
            {/* Top Stats Row - 5 Cards */}
            <div className="dashboard-stats-grid">
                {/* Tasks Completed */}
                <div className="dashboard-stat-card stat-card-blue">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)' }}>
                            <ClipboardList size={24} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.completedTasks}</div>
                            <div className="stat-label-text">Tasks Completed</div>
                        </div>
                    </div>
                </div>

                {/* Problems Solved */}
                <div className="dashboard-stat-card stat-card-green">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}>
                            <Code size={24} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.completedProblems}</div>
                            <div className="stat-label-text">Problems Solved</div>
                        </div>
                    </div>
                </div>

                {/* Avg Task Score */}
                <div className="dashboard-stat-card stat-card-pink">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #be185d, #ec4899)' }}>
                            <Award size={24} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.avgTaskScore}%</div>
                            <div className="stat-label-text">Avg Task Score</div>
                        </div>
                    </div>
                </div>

                {/* Avg Problem Score */}
                <div className="dashboard-stat-card stat-card-emerald">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #059669, #34d399)' }}>
                            <Target size={24} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.avgProblemScore}%</div>
                            <div className="stat-label-text">Avg Problem Score</div>
                        </div>
                    </div>
                </div>

                {/* Aptitude Taken */}
                <div className="dashboard-stat-card stat-card-purple">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)' }}>
                            <Brain size={24} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.completedAptitude}</div>
                            <div className="stat-label-text">Aptitude Taken</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Three Column Layout */}
            <div className="dashboard-main-grid">
                {/* My Skill Profile */}
                <div className="dashboard-panel">
                    <h3 className="panel-title">
                        <BarChart3 size={18} color="#8b5cf6" /> My Skill Profile
                    </h3>

                    <div className="skill-progress-container">
                        {/* Task Skills */}
                        <div className="skill-item">
                            <div className="skill-header">
                                <span className="skill-name">ML Tasks</span>
                                <span className="skill-count" style={{ color: '#3b82f6' }}>{stats.completedTasks}/{stats.totalTasks}</span>
                            </div>
                            <div className="skill-bar" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
                                <div className="skill-fill" style={{
                                    width: `${stats.totalTasks > 0 ? (stats.completedTasks / stats.totalTasks) * 100 : 0}%`,
                                    background: 'linear-gradient(90deg, #2563eb, #3b82f6)'
                                }} />
                            </div>
                        </div>

                        {/* Coding Skills */}
                        <div className="skill-item">
                            <div className="skill-header">
                                <span className="skill-name">Coding Problems</span>
                                <span className="skill-count" style={{ color: '#10b981' }}>{stats.completedProblems}/{stats.totalProblems}</span>
                            </div>
                            <div className="skill-bar" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                                <div className="skill-fill" style={{
                                    width: `${stats.totalProblems > 0 ? (stats.completedProblems / stats.totalProblems) * 100 : 0}%`,
                                    background: 'linear-gradient(90deg, #059669, #10b981)'
                                }} />
                            </div>
                        </div>

                        {/* Aptitude Skills */}
                        <div className="skill-item">
                            <div className="skill-header">
                                <span className="skill-name">Aptitude Tests</span>
                                <span className="skill-count" style={{ color: '#8b5cf6' }}>{stats.completedAptitude}/{stats.totalAptitude}</span>
                            </div>
                            <div className="skill-bar" style={{ background: 'rgba(139, 92, 246, 0.15)' }}>
                                <div className="skill-fill" style={{
                                    width: `${stats.totalAptitude > 0 ? (stats.completedAptitude / stats.totalAptitude) * 100 : 0}%`,
                                    background: 'linear-gradient(90deg, #7c3aed, #8b5cf6)'
                                }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Submissions */}
                <div className="dashboard-panel">
                    <div className="panel-header">
                        <h3 className="panel-title" style={{ margin: 0 }}>
                            <Clock size={18} color="#3b82f6" /> Recent Submissions
                        </h3>
                        <button
                            onClick={() => window.location.href = '/student/submissions'}
                            className="view-all-btn"
                        >
                            View All →
                        </button>
                    </div>

                    <div className="submissions-list">
                        {stats.recentSubmissions && stats.recentSubmissions.length > 0 ? (
                            stats.recentSubmissions.map((sub, idx) => (
                                <div key={idx} className="submission-item">
                                    <div className="submission-icon">
                                        <Code size={20} color="#3b82f6" />
                                    </div>
                                    <div className="submission-info">
                                        <div className="submission-title">{sub.title}</div>
                                        <div className="submission-meta">
                                            {formatTimeAgo(sub.time)} • Score: {sub.score}/100
                                        </div>
                                    </div>
                                    <span className={`submission-status ${sub.status}`}>
                                        {sub.status}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state-small">
                                <Code size={32} color="var(--text-muted)" />
                                No submissions yet
                            </div>
                        )}
                    </div>
                </div>

                {/* Leaderboard */}
                <div className="dashboard-panel">
                    <h3 className="panel-title">
                        <Trophy size={18} color="#fbbf24" /> Leaderboard
                    </h3>

                    <div className="leaderboard-list">
                        {stats.leaderboard && stats.leaderboard.length > 0 ? (
                            stats.leaderboard.slice(0, 5).map((student, idx) => (
                                <div key={idx} className={`leaderboard-item ${student.studentId === user.id ? 'current-user' : ''}`}>
                                    <div className={`rank-badge rank-${idx + 1}`}>
                                        {student.rank}
                                    </div>
                                    <div className="leaderboard-info">
                                        <div className="leaderboard-name">{student.name}</div>
                                        <div className="leaderboard-stats">
                                            {student.taskCount} tasks • {student.codeCount} code • {student.aptitudeCount} aptitude
                                        </div>
                                    </div>
                                    <div className={`leaderboard-score rank-${idx + 1}-score`}>
                                        {student.avgScore}%
                                        <span className="score-label">Avg Score</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state-small">
                                <Trophy size={32} color="var(--text-muted)" />
                                No leaderboard data
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ==================== ML TASKS WITH FILE UPLOAD ====================
function Tasks({ user }) {
    const [tasks, setTasks] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTask, setActiveTask] = useState(null)

    useEffect(() => {
        axios.get(`${API_BASE}/students/${user.id}/tasks`)
            .then(res => {
                setTasks(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [user.id])

    if (loading) return <div className="loading-spinner"></div>

    return (
        <>
            <div className="cards-grid animate-slideUp">
                {tasks.length === 0 ? (
                    <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                        <div className="empty-state-icon"><ClipboardList size={40} /></div>
                        <h3>No ML Tasks Assigned</h3>
                        <p>Your mentor hasn't assigned any tasks yet.</p>
                    </div>
                ) : (
                    tasks.map(task => (
                        <div key={task.id} className="item-card glass">
                            <div className="item-card-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ padding: '10px', background: 'var(--primary-alpha)', borderRadius: '10px' }}>
                                        <ClipboardList size={20} color="var(--primary)" />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--secondary)', fontWeight: 700, textTransform: 'uppercase' }}>ML TASK</span>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{task.title}</h3>
                                    </div>
                                </div>
                                <span className={`difficulty-badge ${task.difficulty?.toLowerCase()}`}>{task.difficulty}</span>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '1rem' }}>{task.description}</p>
                            {task.requirements && (
                                <div style={{ background: 'var(--bg-dark)', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    <strong style={{ color: 'var(--primary)' }}>Requirements:</strong><br />
                                    {task.requirements.split('\n').slice(0, 2).join('\n')}...
                                </div>
                            )}
                            <div className="item-card-footer" style={{ paddingTop: '1rem', marginTop: 'auto' }}>
                                <span className={`status-badge ${task.status || 'live'}`}>{task.status || 'Active'}</span>
                                <button
                                    onClick={() => setActiveTask(task)}
                                    className="btn-create-new"
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                >
                                    <Upload size={16} /> Submit Task
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {activeTask && <TaskSubmitModal task={activeTask} user={user} onClose={() => setActiveTask(null)} />}
        </>
    )
}

// ==================== TASK SUBMIT MODAL ====================
function TaskSubmitModal({ task, user, onClose }) {
    const [file, setFile] = useState(null)
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState(null)

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0]
        if (selectedFile) {
            setFile(selectedFile)
        }
    }

    const handleSubmit = async () => {
        if (!file) return
        setSubmitting(true)

        const reader = new FileReader()
        reader.onload = async (e) => {
            try {
                const response = await axios.post(`${API_BASE}/submissions`, {
                    studentId: user.id,
                    taskId: task.id,
                    language: 'Python',
                    code: e.target.result,
                    submissionType: 'file',
                    fileName: file.name
                })
                setResult(response.data)
            } catch (error) {
                console.error(error)
                setResult({ status: 'rejected', score: 0, feedback: 'Submission failed.' })
            } finally {
                setSubmitting(false)
            }
        }
        reader.readAsText(file)
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <div className="modal-title-with-icon">
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--secondary), var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Upload size={20} color="white" />
                        </div>
                        <h2>Submit: {task.title}</h2>
                    </div>
                    <button onClick={onClose} className="modal-close"><XCircle size={20} /></button>
                </div>
                <div className="modal-body">
                    {!result ? (
                        <>
                            <div className="form-group">
                                <label className="form-label">Upload Your Solution File</label>
                                <div style={{
                                    border: '2px dashed var(--border-color)',
                                    borderRadius: '1rem',
                                    padding: '2rem',
                                    textAlign: 'center',
                                    background: 'var(--bg-dark)',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s'
                                }}
                                    onClick={() => document.getElementById('file-input').click()}
                                >
                                    <input type="file" id="file-input" onChange={handleFileChange} accept=".py,.ipynb,.csv,.pkl,.h5,.zip" style={{ display: 'none' }} />
                                    <Upload size={40} style={{ color: 'var(--secondary)', marginBottom: '1rem' }} />
                                    {file ? (
                                        <div>
                                            <p style={{ fontWeight: 600, color: 'var(--success)' }}>{file.name}</p>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{(file.size / 1024).toFixed(2)} KB</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <p style={{ fontWeight: 600 }}>Click to upload or drag and drop</p>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Supports: .py, .ipynb, .csv, .pkl, .h5, .zip</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn-reset" onClick={onClose}>Cancel</button>
                                <button type="button" className="btn-create-new" onClick={handleSubmit} disabled={!file || submitting}>
                                    {submitting ? 'Submitting...' : <><Send size={16} /> Submit for Evaluation</>}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <div style={{
                                width: '80px', height: '80px', borderRadius: '50%',
                                background: result.status === 'accepted' ? 'var(--success-alpha)' : 'var(--danger-alpha)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem'
                            }}>
                                {result.status === 'accepted' ? <CheckCircle size={40} color="var(--success)" /> : <XCircle size={40} color="var(--danger)" />}
                            </div>
                            <h3 style={{ marginBottom: '0.5rem', color: result.status === 'accepted' ? 'var(--success)' : 'var(--danger)' }}>
                                {result.status === 'accepted' ? 'Submission Accepted!' : 'Submission Rejected'}
                            </h3>
                            <p style={{ fontSize: '2rem', fontWeight: 800, margin: '1rem 0' }}>Score: {result.score}/100</p>
                            <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>{result.feedback}</p>
                            <button className="btn-create-new" onClick={onClose} style={{ marginTop: '2rem' }}>Close</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ==================== CODING PROBLEMS ====================
function Assignments({ user }) {
    const [problems, setProblems] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeProblem, setActiveProblem] = useState(null)
    const [useProctoredEditor, setUseProctoredEditor] = useState(false)
    const [activeTab, setActiveTab] = useState('coding') // 'coding' or 'sql'

    useEffect(() => {
        axios.get(`${API_BASE}/students/${user.id}/problems`)
            .then(res => {
                setProblems(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [user.id])

    const handleSolve = (problem) => {
        setActiveProblem(problem)
        // Check if this problem has proctoring enabled
        setUseProctoredEditor(problem.proctoring?.enabled === true)
    }

    const handleClose = () => {
        setActiveProblem(null)
        setUseProctoredEditor(false)
    }

    // Separate problems into Coding and SQL
    const codingProblems = problems.filter(p => p.language !== 'SQL' && p.type !== 'SQL')
    const sqlProblems = problems.filter(p => p.language === 'SQL' || p.type === 'SQL')

    if (loading) return <div className="loading-spinner"></div>

    // Helper function to render problem cards
    const renderProblemCard = (problem) => (
        <div key={problem.id} className="item-card glass">
            <div className="item-card-header">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', background: 'var(--primary-alpha)', color: 'var(--primary)', fontWeight: 700 }}>{problem.type?.toUpperCase()}</span>
                    <span className={`status-badge ${problem.status || 'live'}`} style={{ fontSize: '0.65rem' }}>{problem.status || 'Active'}</span>
                    {problem.proctoring?.enabled && (
                        <span style={{
                            fontSize: '0.6rem',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#ef4444',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <Shield size={10} /> PROCTORED
                        </span>
                    )}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-dark)', padding: '2px 8px', borderRadius: '4px' }}>{problem.language}</span>
            </div>
            <h3 style={{ margin: '0.75rem 0', fontSize: '1.2rem' }}>{problem.title}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '1rem' }}>{problem.description}</p>

            {/* Proctoring Info */}
            {problem.proctoring?.enabled && (
                <div style={{
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(239, 68, 68, 0.08)',
                    borderRadius: '8px',
                    marginBottom: '0.75rem',
                    border: '1px solid rgba(239, 68, 68, 0.15)'
                }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Eye size={12} /> Proctoring Enabled:
                        {problem.proctoring.videoAudio && <span style={{ marginLeft: '4px' }}>📹 Video</span>}
                        {problem.proctoring.disableCopyPaste && <span style={{ marginLeft: '4px' }}>📋 No Copy</span>}
                        {problem.proctoring.trackTabSwitches && <span style={{ marginLeft: '4px' }}>🔒 Tab Track</span>}
                    </p>
                </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <span className={`difficulty-badge ${problem.difficulty?.toLowerCase()}`}>{problem.difficulty}</span>
                <button onClick={() => handleSolve(problem)} className="btn-create-new" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}><Play size={16} /> Solve</button>
            </div>
        </div>
    )

    return (
        <>
            {/* Tab Buttons */}
            <div style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '1.5rem',
                padding: '0.5rem',
                background: 'var(--bg-card)',
                borderRadius: '12px',
                width: 'fit-content'
            }}>
                <button
                    onClick={() => setActiveTab('coding')}
                    style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s ease',
                        background: activeTab === 'coding' ? 'var(--primary)' : 'transparent',
                        color: activeTab === 'coding' ? 'white' : 'var(--text-muted)'
                    }}
                >
                    <Code size={18} />
                    Coding Problems
                    <span style={{
                        background: activeTab === 'coding' ? 'rgba(255,255,255,0.2)' : 'var(--bg-dark)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem'
                    }}>{codingProblems.length}</span>
                </button>
                <button
                    onClick={() => setActiveTab('sql')}
                    style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s ease',
                        background: activeTab === 'sql' ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'transparent',
                        color: activeTab === 'sql' ? 'white' : 'var(--text-muted)'
                    }}
                >
                    <FileText size={18} />
                    SQL Problems
                    <span style={{
                        background: activeTab === 'sql' ? 'rgba(255,255,255,0.2)' : 'var(--bg-dark)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem'
                    }}>{sqlProblems.length}</span>
                </button>
            </div>

            {/* Coding Problems Tab */}
            {activeTab === 'coding' && (
                <div className="cards-grid animate-slideUp">
                    {codingProblems.length === 0 ? (
                        <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                            <div className="empty-state-icon"><Code size={40} /></div>
                            <h3>No Coding Problems</h3>
                            <p>Your mentor hasn't assigned any coding problems yet.</p>
                        </div>
                    ) : (
                        codingProblems.map(problem => renderProblemCard(problem))
                    )}
                </div>
            )}

            {/* SQL Problems Tab */}
            {activeTab === 'sql' && (
                <div className="cards-grid animate-slideUp">
                    {sqlProblems.length === 0 ? (
                        <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                            <div className="empty-state-icon"><FileText size={40} /></div>
                            <h3>No SQL Problems</h3>
                            <p>Your mentor hasn't assigned any SQL problems yet.</p>
                        </div>
                    ) : (
                        sqlProblems.map(problem => renderProblemCard(problem))
                    )}
                </div>
            )}

            {/* Use Proctored Editor if proctoring is enabled, otherwise use regular modal */}
            {activeProblem && useProctoredEditor && (
                <ProctoredCodeEditor
                    problem={activeProblem}
                    user={user}
                    onClose={handleClose}
                    onSubmitSuccess={() => {
                        // Refresh problems after successful submission
                        axios.get(`${API_BASE}/students/${user.id}/problems`)
                            .then(res => setProblems(res.data))
                    }}
                />
            )}

            {activeProblem && !useProctoredEditor && (
                <CodeEditorModal problem={activeProblem} user={user} onClose={handleClose} />
            )}
        </>
    )
}

// ==================== CODE EDITOR MODAL WITH FULL PROCTORED MODE ====================
function CodeEditorModal({ problem, user, onClose }) {
    const langConfig = LANGUAGE_CONFIG[problem.language] || LANGUAGE_CONFIG['Python']
    const [code, setCode] = useState(langConfig.defaultCode)
    const [selectedLang, setSelectedLang] = useState(problem.language || 'Python')
    const [sqlTool, setSqlTool] = useState('validator') // 'validator', 'visualizer', 'debugger'
    const [output, setOutput] = useState('')
    const [status, setStatus] = useState('idle')
    const [result, setResult] = useState(null)
    const [tabSwitches, setTabSwitches] = useState(0)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showWarning, setShowWarning] = useState(false)
    const [warningMessage, setWarningMessage] = useState('')
    const [showTestResults, setShowTestResults] = useState(false)
    const [testResults, setTestResults] = useState(null)
    const [customInput, setCustomInput] = useState(problem.sampleInput || problem.testInput || '')
    const [activeOutputTab, setActiveOutputTab] = useState('input')
    const containerRef = useRef(null)

    // Enter fullscreen on mount
    useEffect(() => {
        const enterFullscreen = async () => {
            try {
                if (containerRef.current && document.fullscreenEnabled) {
                    await containerRef.current.requestFullscreen()
                    setIsFullscreen(true)
                }
            } catch (err) {
                console.warn('Could not enter fullscreen:', err)
            }
        }
        const timer = setTimeout(enterFullscreen, 100)
        return () => clearTimeout(timer)
    }, [])

    // Handle fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isNowFullscreen = !!document.fullscreenElement
            setIsFullscreen(isNowFullscreen)
            if (!isNowFullscreen && !result) {
                setWarningMessage('⚠️ You exited fullscreen mode! This action has been recorded.')
                setShowWarning(true)
                setTabSwitches(prev => prev + 1)
                setTimeout(async () => {
                    if (containerRef.current && document.fullscreenEnabled) {
                        try { await containerRef.current.requestFullscreen() } catch (e) { }
                    }
                }, 500)
            }
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }, [result])

    // Track tab visibility changes - AUTO EXIT AFTER 3 VIOLATIONS
    const [forceExit, setForceExit] = useState(false)

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && !result && !forceExit) {
                setTabSwitches(prev => {
                    const newCount = prev + 1

                    if (newCount >= 3) {
                        // 3rd violation - Force exit
                        setWarningMessage(`🚫 DISQUALIFIED! You have exceeded the maximum allowed tab switches (${newCount}/3). Session terminated.`)
                        setShowWarning(true)
                        setForceExit(true)

                        // Auto-submit with rejection after a delay
                        setTimeout(async () => {
                            try {
                                await axios.post(`${API_BASE}/submissions`, {
                                    studentId: user.id,
                                    problemId: problem.id,
                                    language: selectedLang,
                                    code: code,
                                    submissionType: 'editor',
                                    tabSwitches: newCount
                                })
                            } catch (e) {
                                console.error('Auto-submit failed:', e)
                            }

                            // Exit fullscreen and close
                            if (document.fullscreenElement) {
                                document.exitFullscreen()
                            }
                            onClose()
                        }, 3000)
                    } else {
                        setWarningMessage(`⚠️ Tab switch detected! (${newCount}/3 violations) ${3 - newCount} more will disqualify you!`)
                        setShowWarning(true)
                    }

                    return newCount
                })
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [result, forceExit, user.id, problem.id, selectedLang, code, onClose])

    // Auto-hide warning
    useEffect(() => {
        if (showWarning) {
            const timer = setTimeout(() => setShowWarning(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [showWarning])

    const handleLanguageChange = (newLang) => {
        setSelectedLang(newLang)
        setCode(LANGUAGE_CONFIG[newLang]?.defaultCode || '')
    }

    const handleRun = async () => {
        setStatus('running')
        setOutput('Running code...\n')
        setActiveOutputTab('output')
        try {
            // First run the code normally
            const res = await axios.post(`${API_BASE}/run`, {
                code,
                language: selectedLang,
                problemId: problem.id,
                sqlSchema: problem.sqlSchema,
                stdin: customInput || ''
            })
            setOutput(res.data.output)
            setStatus(res.data.status === 'error' ? 'error' : 'success')

            // Also run test cases in background
            try {
                const testRes = await axios.post(`${API_BASE}/run-with-tests`, {
                    problemId: problem.id,
                    code,
                    language: selectedLang
                })
                if (testRes.data?.testResults) {
                    setTestResults({
                        passed: testRes.data.testResults.filter(r => r.passed).length,
                        total: testRes.data.testResults.length,
                        results: testRes.data.testResults
                    })
                }
            } catch (testErr) {
                console.log('No test cases or test run failed:', testErr)
            }
        } catch (error) {
            setOutput(`Error: ${error.response?.data?.details || 'Failed to execute code.'}`)
            setStatus('error')
        }
    }

    // ==================== AI HINTS FEATURE ====================
    const [hints, setHints] = useState(null)
    const [hintsLoading, setHintsLoading] = useState(false)
    const [showHints, setShowHints] = useState(false)

    const handleGetHints = async () => {
        setHintsLoading(true)
        setShowHints(true)
        try {
            const res = await axios.post(`${API_BASE}/hints`, {
                code,
                language: selectedLang,
                problemId: problem.id
            })
            setHints(res.data)
        } catch (error) {
            setHints({
                hints: ['Think about the problem step by step.', 'Consider what data structure would be most efficient.'],
                encouragement: "Don't give up! Every expert was once a beginner.",
                error: true
            })
        } finally {
            setHintsLoading(false)
        }
    }


    const handleSubmit = async () => {
        setStatus('submitting')
        try {
            const response = await axios.post(`${API_BASE}/submissions`, {
                studentId: user.id,
                problemId: problem.id,
                language: selectedLang,
                code: code,
                submissionType: 'editor',
                tabSwitches: tabSwitches
            })
            setResult(response.data)
            setStatus('done')
            if (document.fullscreenElement) document.exitFullscreen()
        } catch (error) {
            setResult({ status: 'rejected', score: 0, feedback: 'Submission failed.' })
            setStatus('error')
        }
    }

    const handleExit = () => {
        if (!result && !window.confirm('Exiting early will be recorded. Are you sure?')) return
        if (document.fullscreenElement) document.exitFullscreen()
        onClose()
    }

    return (
        <div ref={containerRef} className="proctored-container" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0f172a', zIndex: 10000, display: 'flex', flexDirection: 'column' }}>
            {/* Warning Toast */}
            {showWarning && (
                <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', padding: '1rem 2rem', borderRadius: '0.75rem', zIndex: 10001, boxShadow: '0 10px 40px rgba(239, 68, 68, 0.5)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <AlertTriangle size={24} />
                    <span style={{ fontWeight: 600 }}>{warningMessage}</span>
                </div>
            )}

            {/* Header */}
            <div style={{ borderBottom: '1px solid #334155', background: '#1e293b', padding: '1rem 2rem', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ color: '#f8fafc', fontSize: '1.25rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {problem.title}
                            <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', borderRadius: '2rem', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 2s infinite' }}></div>
                                🔒 PROCTORED MODE
                            </span>
                        </h2>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>{problem.type || 'coding'}</span>
                            <span className={`difficulty-badge ${problem.difficulty?.toLowerCase()}`}>{problem.difficulty?.toUpperCase()}</span>
                            {tabSwitches > 0 && <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600 }}>⚠️ {tabSwitches} violations</span>}
                        </div>
                    </div>
                </div>
                <button onClick={handleExit} style={{ background: '#334155', border: 'none', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}>Exit Session</button>
            </div>

            {/* Body */}
            <div style={{ padding: 0, display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden', background: '#0f172a' }}>
                {/* Left Side: Problem Description & Hints */}
                <div style={{ width: '400px', borderRight: '1px solid #334155', padding: '2rem', overflowY: 'auto', background: '#0f172a' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#f8fafc' }}>Problem Description</h3>
                    <div style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.7' }}>
                        {problem.description}

                        {/* Show SQL-specific fields or regular input/output */}
                        {(problem.type === 'SQL' || problem.language === 'SQL') ? (
                            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #334155', marginTop: '1.5rem' }}>
                                {problem.sqlSchema && (
                                    <>
                                        <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ color: '#06b6d4' }}>🗄️</span>
                                            <strong style={{ color: '#e2e8f0' }}>Database Schema:</strong>
                                        </div>
                                        <pre style={{
                                            color: '#93c5fd',
                                            background: '#0f172a',
                                            padding: '1rem',
                                            borderRadius: '6px',
                                            marginBottom: '1rem',
                                            fontSize: '0.8rem',
                                            overflowX: 'auto',
                                            whiteSpace: 'pre-wrap',
                                            border: '1px solid #334155'
                                        }}>{problem.sqlSchema}</pre>
                                    </>
                                )}
                                {problem.expectedQueryResult && (
                                    <>
                                        <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ color: '#10b981' }}>📊</span>
                                            <strong style={{ color: '#e2e8f0' }}>Expected Query Result:</strong>
                                        </div>
                                        <pre style={{
                                            color: '#4ade80',
                                            background: '#0f172a',
                                            padding: '1rem',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem',
                                            overflowX: 'auto',
                                            whiteSpace: 'pre-wrap',
                                            border: '1px solid #334155'
                                        }}>{problem.expectedQueryResult}</pre>
                                    </>
                                )}
                                {!problem.sqlSchema && !problem.expectedQueryResult && (
                                    <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
                                        Write a SQL query to solve this problem. Your query will be executed against the database.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #334155', marginTop: '1.5rem' }}>
                                <div style={{ marginBottom: '0.5rem' }}><strong style={{ color: '#e2e8f0' }}>Sample Input:</strong></div>
                                <code style={{ color: '#93c5fd', background: '#0f172a', padding: '0.4rem 0.8rem', borderRadius: '4px', display: 'block', marginBottom: '1rem' }}>{problem.sampleInput || problem.testInput || "N/A"}</code>
                                <div style={{ marginBottom: '0.5rem' }}><strong style={{ color: '#e2e8f0' }}>Expected Output:</strong></div>
                                <code style={{ color: '#4ade80', background: '#0f172a', padding: '0.4rem 0.8rem', borderRadius: '4px', display: 'block' }}>{problem.expectedOutput || "N/A"}</code>
                            </div>
                        )}
                    </div>

                    {/* AI Hints Section */}
                    <div style={{ marginTop: '2rem', background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05))', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '0.75rem', padding: '1.25rem' }}>
                        <h4 style={{ margin: '0 0 0.75rem', color: '#fbbf24', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Lightbulb size={16} /> Need Help?
                        </h4>
                        {!showHints ? (
                            <div>
                                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 1rem', lineHeight: 1.6 }}>
                                    Stuck on this problem? Get AI-powered hints to guide you without revealing the full solution.
                                </p>
                                <button
                                    onClick={handleGetHints}
                                    disabled={hintsLoading}
                                    style={{
                                        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                                        border: 'none',
                                        color: '#1e293b',
                                        padding: '0.6rem 1.2rem',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        width: '100%',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Sparkles size={16} /> {hintsLoading ? 'Getting Hints...' : 'Get AI Hints'}
                                </button>
                            </div>
                        ) : (
                            <div>
                                {hintsLoading ? (
                                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                                        <div style={{ color: '#fbbf24', marginBottom: '0.5rem' }}>🤔</div>
                                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Analyzing your code...</p>
                                    </div>
                                ) : hints && (
                                    <div>
                                        {/* Encouragement */}
                                        {hints.encouragement && (
                                            <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                                                <p style={{ color: '#4ade80', fontSize: '0.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Sparkles size={14} /> {hints.encouragement}
                                                </p>
                                            </div>
                                        )}

                                        {/* Hints List */}
                                        <div style={{ marginBottom: '1rem' }}>
                                            <p style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.5rem' }}>💡 Hints:</p>
                                            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', fontSize: '0.8rem', lineHeight: 1.8 }}>
                                                {hints.hints?.map((hint, i) => (
                                                    <li key={i} style={{ marginBottom: '0.5rem' }}>{hint}</li>
                                                ))}
                                            </ul>
                                        </div>

                                        {/* Concepts to Review */}
                                        {hints.conceptsToReview && hints.conceptsToReview.length > 0 && (
                                            <div style={{ marginBottom: '1rem' }}>
                                                <p style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <BookOpen size={14} /> Concepts to Review:
                                                </p>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    {hints.conceptsToReview.map((concept, i) => (
                                                        <span key={i} style={{
                                                            background: 'rgba(59, 130, 246, 0.2)',
                                                            color: '#60a5fa',
                                                            padding: '0.25rem 0.75rem',
                                                            borderRadius: '2rem',
                                                            fontSize: '0.7rem',
                                                            border: '1px solid rgba(59, 130, 246, 0.3)'
                                                        }}>
                                                            {concept}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Common Mistakes */}
                                        {hints.commonMistakes && (
                                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                                <p style={{ color: '#f87171', fontSize: '0.8rem', margin: 0 }}>
                                                    <strong>⚠️ Common Mistake:</strong> {hints.commonMistakes}
                                                </p>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => { setShowHints(false); setHints(null); }}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid #334155',
                                                color: '#94a3b8',
                                                padding: '0.5rem 1rem',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                marginTop: '1rem',
                                                width: '100%'
                                            }}
                                        >
                                            Hide Hints
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Proctoring Rules */}
                    <div style={{ marginTop: '2rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.75rem', padding: '1.25rem' }}>
                        <h4 style={{ margin: '0 0 0.75rem', color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={16} /> Proctoring Rules</h4>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.8 }}>
                            <li>Do not switch tabs or windows</li>
                            <li>Do not exit fullscreen mode</li>
                            <li>All violations are recorded</li>
                            <li>3+ violations may result in disqualification</li>
                        </ul>
                    </div>
                </div>

                {/* Right Side: Code Editor */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
                    {/* Toolbar */}
                    <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', background: '#1e293b' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <label style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Language:</label>
                            <select
                                value={selectedLang}
                                onChange={(e) => handleLanguageChange(e.target.value)}
                                disabled={problem.type === 'SQL' || problem.language === 'SQL'}
                                style={{
                                    background: '#0f172a',
                                    color: '#f8fafc',
                                    border: '1px solid #334155',
                                    borderRadius: '6px',
                                    padding: '0.4rem 0.75rem',
                                    fontSize: '0.85rem',
                                    opacity: (problem.type === 'SQL' || problem.language === 'SQL') ? 0.7 : 1,
                                    cursor: (problem.type === 'SQL' || problem.language === 'SQL') ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {Object.keys(LANGUAGE_CONFIG).map(lang => <option key={lang} value={lang}>{lang}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            {/* Hide Run Code for SQL - SQLValidator handles execution */}
                            {selectedLang !== 'SQL' && (
                                <button onClick={handleRun} disabled={status === 'running' || status === 'submitting'} style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                    <Play size={16} /> {status === 'running' ? 'Running...' : 'Run Code'}
                                </button>
                            )}
                            <button onClick={handleSubmit} disabled={status === 'running' || status === 'submitting' || result} style={{ background: result ? '#334155' : 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '6px', cursor: result ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                <Send size={16} /> {status === 'submitting' ? 'Submitting...' : 'Submit'}
                            </button>
                        </div>
                    </div>

                    {/* Editor */}
                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                        <Editor height="100%" language={LANGUAGE_CONFIG[selectedLang]?.monacoLang || 'python'} theme="vs-dark" value={code} onChange={(value) => setCode(value)} options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 20 } }} />
                    </div>

                    {/* Result Panel */}
                    {result && (
                        <div style={{ padding: '1.5rem', background: result.status === 'accepted' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderTop: `2px solid ${result.status === 'accepted' ? '#10b981' : '#ef4444'}`, display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            {result.status === 'accepted' ? <CheckCircle size={40} color="#10b981" /> : <XCircle size={40} color="#ef4444" />}
                            <div>
                                <h4 style={{ margin: 0, color: result.status === 'accepted' ? '#10b981' : '#ef4444' }}>{result.status === 'accepted' ? 'Accepted!' : 'Rejected'}</h4>
                                <p style={{ margin: '0.25rem 0 0', color: '#e2e8f0' }}>Score: <strong>{result.score}/100</strong> • {result.feedback}{tabSwitches > 0 && <span style={{ color: '#f59e0b' }}> • Tab violations: {tabSwitches}</span>}</p>
                            </div>
                            <button onClick={handleExit} style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>Close Session</button>
                        </div>
                    )}

                    {/* Console: Input / Output / Test Cases - Hide for SQL */}
                    {!result && selectedLang !== 'SQL' && (
                        <div style={{ maxHeight: '350px', background: '#020617', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                            {/* Tab Switcher */}
                            <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', background: '#0f172a' }}>
                                {['input', 'output', 'tests'].map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveOutputTab(tab)}
                                        style={{
                                            padding: '0.75rem 1.25rem',
                                            background: activeOutputTab === tab ? '#1e293b' : 'transparent',
                                            border: 'none',
                                            borderBottom: activeOutputTab === tab ? `2px solid ${tab === 'input' ? '#f59e0b' : tab === 'output' ? '#3b82f6' : '#10b981'}` : '2px solid transparent',
                                            color: activeOutputTab === tab ? (tab === 'input' ? '#fbbf24' : tab === 'output' ? '#60a5fa' : '#4ade80') : '#64748b',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 500,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        {tab === 'input' && <><FileText size={14} /> Custom Input</>}
                                        {tab === 'output' && <><Code size={14} /> Output {output && <span style={{ width: 6, height: 6, borderRadius: '50%', background: status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : '#3b82f6' }}></span>}</>}
                                        {tab === 'tests' && <><CheckCircle size={14} /> Test Cases
                                            {testResults && (
                                                <span style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '10px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    background: testResults.passed === testResults.total ? 'rgba(16, 185, 129, 0.2)' : 'rgba(249, 115, 22, 0.2)',
                                                    color: testResults.passed === testResults.total ? '#10b981' : '#f97316'
                                                }}>
                                                    {testResults.passed}/{testResults.total}
                                                </span>
                                            )}
                                        </>}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Input Tab */}
                            {activeOutputTab === 'input' && (
                                <div style={{ padding: '0.75rem', flex: 1 }}>
                                    <textarea
                                        value={customInput}
                                        onChange={(e) => setCustomInput(e.target.value)}
                                        placeholder={`Enter your input here (stdin)...\nExample:\n5\n1 2 3 4 5`}
                                        style={{
                                            width: '100%',
                                            minHeight: '120px',
                                            background: '#0f172a',
                                            color: '#e2e8f0',
                                            border: '1px solid #334155',
                                            borderRadius: '8px',
                                            padding: '0.75rem',
                                            fontFamily: 'monospace',
                                            fontSize: '0.85rem',
                                            resize: 'vertical',
                                            outline: 'none'
                                        }}
                                    />
                                    <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#64748b' }}>
                                        💡 This input will be passed as stdin when you click "Run Code"
                                    </div>
                                </div>
                            )}

                            {/* Console Output Tab */}
                            {activeOutputTab === 'output' && (
                                <div style={{ padding: '1rem', fontFamily: 'monospace', color: '#e2e8f0', fontSize: '0.9rem', whiteSpace: 'pre-wrap', flex: 1, overflowY: 'auto' }}>
                                    {output || 'No output yet. Run your code to see results.'}
                                </div>
                            )}

                            {/* Test Cases Tab */}
                            {activeOutputTab === 'tests' && (
                                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                                    <CodeOutputPreview
                                        problemId={problem.id}
                                        code={code}
                                        language={selectedLang}
                                        showRunButton={true}
                                        onRunComplete={(results) => {
                                            if (results?.testResults) {
                                                setTestResults({
                                                    passed: results.testResults.filter(r => r.passed).length,
                                                    total: results.testResults.length
                                                })
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* SQL Tools Suite for SQL problems */}
                    {(problem.type === 'SQL' || problem.language === 'SQL') && !result && (
                        <div style={{ borderTop: '1px solid #334155', padding: '1.25rem', background: '#0f172a' }}>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', padding: '4px', background: '#020617', borderRadius: '10px', width: 'fit-content' }}>
                                <button
                                    onClick={() => setSqlTool('validator')}
                                    style={{
                                        padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                        background: sqlTool === 'validator' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                        color: sqlTool === 'validator' ? '#60a5fa' : '#64748b',
                                        fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}
                                >
                                    <Shield size={16} /> Validator
                                </button>
                                <button
                                    onClick={() => setSqlTool('visualizer')}
                                    style={{
                                        padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                        background: sqlTool === 'visualizer' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                                        color: sqlTool === 'visualizer' ? '#a78bfa' : '#64748b',
                                        fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}
                                >
                                    <Database size={16} /> ER Diagram
                                </button>
                                <button
                                    onClick={() => setSqlTool('debugger')}
                                    style={{
                                        padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                        background: sqlTool === 'debugger' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                                        color: sqlTool === 'debugger' ? '#4ade80' : '#64748b',
                                        fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}
                                >
                                    <Layers size={16} /> Debugger
                                </button>
                            </div>

                            <div className="sql-tool-container animate-fadeIn">
                                {sqlTool === 'validator' && (
                                    <SQLValidator
                                        query={code}
                                        onQueryChange={setCode}
                                        schemaContext={problem.sqlSchema}
                                    />
                                )}
                                {sqlTool === 'visualizer' && (
                                    <SQLVisualizer schema={problem.sqlSchema} />
                                )}
                                {sqlTool === 'debugger' && (
                                    <SQLDebugger query={code} schema={problem.sqlSchema} />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.2); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    )
}

// ==================== SUBMISSIONS WITH REPORT & DELETE ====================
function Submissions({ user }) {
    const [submissions, setSubmissions] = useState([])
    const [aptitudeSubmissions, setAptitudeSubmissions] = useState([])
    const [globalSubmissions, setGlobalSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [viewReport, setViewReport] = useState(null)
    const [activeTab, setActiveTab] = useState('all')
    const [viewAptitudeResult, setViewAptitudeResult] = useState(null)
    const [viewGlobalReport, setViewGlobalReport] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    const fetchSubmissions = () => {
        setLoading(true)
        Promise.all([
            axios.get(`${API_BASE}/submissions?studentId=${user.id}`),
            axios.get(`${API_BASE}/aptitude-submissions?studentId=${user.id}`),
            axios.get(`${API_BASE}/global-test-submissions?studentId=${user.id}`)
        ]).then(([codeRes, aptRes, globalRes]) => {
            setSubmissions((codeRes.data || []).map(s => ({ ...s, subType: 'code' })))
            setAptitudeSubmissions((aptRes.data || []).map(s => ({ ...s, subType: 'aptitude', itemTitle: s.testTitle })))
            setGlobalSubmissions((globalRes.data || []).map(s => ({
                ...s,
                subType: 'global',
                itemTitle: s.testTitle,
                score: s.overallPercentage // Use overallPercentage as score
            })))
            setLoading(false)
        }).catch(err => {
            console.error('Fetch submissions error:', err)
            setLoading(false)
        })
    }

    useEffect(() => {
        fetchSubmissions()
    }, [user.id])

    const handleDelete = async (sub) => {
        if (window.confirm('Are you sure you want to delete this submission?')) {
            try {
                const endpoint = sub.subType === 'global'
                    ? `${API_BASE}/global-test-submissions/${sub.id}`
                    : `${API_BASE}/submissions/${sub.id}`;
                await axios.delete(endpoint)
                fetchSubmissions()
            } catch (error) {
                alert('Error deleting submission')
            }
        }
    }

    const allSubmissions = [...submissions, ...aptitudeSubmissions, ...globalSubmissions]
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))

    const getFilteredSubmissions = () => {
        let filtered = activeTab === 'all'
            ? allSubmissions
            : activeTab === 'code'
                ? submissions
                : activeTab === 'aptitude'
                    ? aptitudeSubmissions
                    : globalSubmissions

        return filtered.filter(s =>
            (s.itemTitle || s.testTitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.status.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }

    const filteredSubmissions = getFilteredSubmissions()

    if (loading) return <div className="loading-spinner"></div>

    return (
        <>
            {/* Header with Search */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => setActiveTab('all')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            background: activeTab === 'all' ? 'var(--primary)' : 'rgba(59, 130, 246, 0.1)',
                            border: activeTab === 'all' ? 'none' : '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: activeTab === 'all' ? 'white' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >All ({allSubmissions.length})</button>
                    <button
                        onClick={() => setActiveTab('code')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            background: activeTab === 'code' ? 'var(--primary)' : 'rgba(59, 130, 246, 0.1)',
                            border: activeTab === 'code' ? 'none' : '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: activeTab === 'code' ? 'white' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >💻 Code ({submissions.length})</button>
                    <button
                        onClick={() => setActiveTab('aptitude')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            background: activeTab === 'aptitude' ? '#8b5cf6' : 'rgba(139, 92, 246, 0.1)',
                            border: activeTab === 'aptitude' ? 'none' : '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: activeTab === 'aptitude' ? 'white' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >📝 Aptitude ({aptitudeSubmissions.length})</button>
                    <button
                        onClick={() => setActiveTab('global')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            background: activeTab === 'global' ? '#3b82f6' : 'rgba(59, 130, 246, 0.1)',
                            border: activeTab === 'global' ? 'none' : '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: activeTab === 'global' ? 'white' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >🌐 Global ({globalSubmissions.length})</button>
                </div>
                <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search problem or status..."
                        style={{ padding: '0.6rem 1rem 0.6rem 2.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'white', width: '250px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="table-container animate-slideUp card glass">
                <table>
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Problem / Test</th>
                            <th>Language</th>
                            <th>Score</th>
                            <th>Status</th>
                            <th>Submitted At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSubmissions.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>No submissions found</td></tr>
                        ) : (
                            filteredSubmissions.map(sub => (
                                <tr key={sub.id}>
                                    <td>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            background: sub.subType === 'aptitude' ? 'rgba(139, 92, 246, 0.1)' : 'var(--primary-alpha)',
                                            color: sub.subType === 'aptitude' ? '#8b5cf6' : 'var(--primary)'
                                        }}>
                                            {sub.subType === 'aptitude' ? '📝 Aptitude' : sub.subType === 'global' ? '🌐 Global' : '💻 Code'}
                                        </span>
                                    </td>
                                    <td><div style={{ color: 'var(--primary)', fontWeight: 500 }}>{sub.itemTitle || sub.testTitle}</div></td>
                                    <td>
                                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>
                                            {sub.subType === 'aptitude' ? 'N/A' : sub.subType === 'global' ? 'Mixed' : (sub.language?.toUpperCase() || 'N/A')}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 700, fontSize: '1.1rem' }}>{sub.score}%</td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                                            <span className={`status-badge ${sub.status}`}>{sub.status}</span>
                                            {sub.plagiarism?.detected && (
                                                <span className="status-badge plagiarized" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <AlertTriangle size={11} /> Plag
                                                </span>
                                            )}
                                            {(sub.integrity?.integrityViolation || sub.tabSwitches > 0) && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                    color: '#f59e0b',
                                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}>
                                                    <AlertTriangle size={10} /> {sub.integrity?.tabSwitches || sub.tabSwitches || 0} Tab
                                                </span>
                                            )}
                                            {sub.cameraBlockedCount > 0 && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                    color: '#ef4444',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}>
                                                    📷 {sub.cameraBlockedCount} Cam
                                                </span>
                                            )}
                                            {sub.phoneDetectionCount > 0 && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                    color: '#ef4444',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}>
                                                    📱 {sub.phoneDetectionCount} Phone
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(sub.submittedAt).toLocaleString()}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {sub.subType === 'aptitude' ? (
                                                <button onClick={() => setViewAptitudeResult(sub)} style={{ background: 'rgba(139, 92, 246, 0.1)', border: 'none', color: '#8b5cf6', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Eye size={14} /> Results</button>
                                            ) : sub.subType === 'global' ? (
                                                <>
                                                    <button onClick={() => setViewGlobalReport(sub.id)} style={{ background: 'var(--primary-alpha)', border: 'none', color: 'var(--primary)', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Eye size={14} /> Full Report</button>
                                                    <button onClick={() => handleDelete(sub)} style={{ background: 'var(--danger-alpha)', border: 'none', color: 'var(--danger)', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}><Trash2 size={14} /></button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => setViewReport(sub)} style={{ background: 'var(--primary-alpha)', border: 'none', color: 'var(--primary)', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Eye size={14} /> Report</button>
                                                    <button onClick={() => handleDelete(sub)} style={{ background: 'var(--danger-alpha)', border: 'none', color: 'var(--danger)', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}><Trash2 size={14} /></button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            {viewReport && <SubmissionReportModal submission={viewReport} user={user} onClose={() => setViewReport(null)} />}

            {/* Aptitude Results Modal */}
            {viewAptitudeResult && (
                <AptitudeReportModal
                    submission={viewAptitudeResult}
                    onClose={() => setViewAptitudeResult(null)}
                    isStudentView={true}
                />
            )}

            {viewGlobalReport && (
                <GlobalReportModal
                    submissionId={viewGlobalReport}
                    onClose={() => setViewGlobalReport(null)}
                    isStudentView={true}
                />
            )}
        </>
    )
}

// ==================== SUBMISSION REPORT MODAL WITH DETAILED SCORING ====================
function SubmissionReportModal({ submission, user, onClose }) {
    // Parse analysis scores for visual display
    const parseScore = (str) => {
        if (!str) return { score: 0, max: 0, comment: '' };
        const match = str.match(/(\d+)\/(\d+)/);
        if (match) {
            return {
                score: parseInt(match[1]),
                max: parseInt(match[2]),
                comment: str.replace(/\d+\/\d+\s*[-–]?\s*/, '').trim()
            };
        }
        return { score: 0, max: 0, comment: str };
    };

    const analysis = submission.analysis || {};
    const scores = {
        correctness: parseScore(analysis.correctness),
        efficiency: parseScore(analysis.efficiency),
        codeStyle: parseScore(analysis.codeStyle),
        bestPractices: parseScore(analysis.bestPractices)
    };

    // Score bar component
    const ScoreBar = ({ label, icon, score, max, comment, color }) => (
        <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {icon}
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</span>
                </div>
                <span style={{ fontWeight: 700, color: color }}>{score}/{max}</span>
            </div>
            <div style={{ background: 'var(--bg-dark)', borderRadius: '0.5rem', height: '8px', overflow: 'hidden' }}>
                <div style={{
                    width: max > 0 ? `${(score / max) * 100}%` : '0%',
                    height: '100%',
                    background: `linear-gradient(90deg, ${color}, ${color}88)`,
                    borderRadius: '0.5rem',
                    transition: 'width 0.5s ease'
                }} />
            </div>
            {comment && <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{comment}</p>}
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
                <div className="modal-header">
                    <div className="modal-title-with-icon">
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: submission.status === 'accepted' ? 'linear-gradient(135deg, var(--success), #06b6d4)' : 'linear-gradient(135deg, var(--danger), var(--warning))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FileText size={20} color="white" />
                        </div>
                        <h2>Submission Report</h2>
                    </div>
                    <button onClick={onClose} className="modal-close"><XCircle size={20} /></button>
                </div>
                <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                    {/* Info Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg-dark)', borderRadius: '1rem', border: '1px solid var(--border-color)' }}>
                        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Student</span><p style={{ margin: '0.25rem 0 0', fontWeight: 600, fontSize: '1.1rem' }}>{user?.name}</p></div>
                        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Submitted At</span><p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{new Date(submission.submittedAt).toLocaleString()}</p></div>
                        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Language</span><p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{submission.language}</p></div>
                    </div>

                    {/* Score & Status */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '3rem', marginBottom: '2rem', padding: '2rem', background: submission.status === 'accepted' ? 'var(--success-alpha)' : 'var(--danger-alpha)', borderRadius: '1rem', border: `1px solid ${submission.status === 'accepted' ? 'var(--success)' : 'var(--danger)'}` }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', fontWeight: 800, color: submission.status === 'accepted' ? 'var(--success)' : 'var(--danger)' }}>{submission.score}</div>
                            <div style={{ color: 'var(--text-muted)' }}>AI Evaluation Score</div>
                        </div>
                        <div style={{ padding: '1rem 2rem', borderRadius: '1rem', background: submission.status === 'accepted' ? 'var(--success-alpha)' : 'var(--danger-alpha)', color: submission.status === 'accepted' ? 'var(--success)' : 'var(--danger)', fontWeight: 700, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {submission.status === 'accepted' ? <CheckCircle size={24} /> : <XCircle size={24} />}
                            {submission.status?.toUpperCase()}
                        </div>
                    </div>

                    {/* Detailed Scoring Breakdown */}
                    {(analysis.correctness || analysis.efficiency || analysis.codeStyle || analysis.bestPractices) && (
                        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg-dark)', borderRadius: '1rem', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Target size={18} color="var(--primary)" /> Detailed Score Breakdown
                            </h4>

                            <ScoreBar
                                label="Correctness"
                                icon={<CheckCircle size={16} color="#10b981" />}
                                score={scores.correctness.score}
                                max={scores.correctness.max || 40}
                                comment={scores.correctness.comment}
                                color="#10b981"
                            />

                            <ScoreBar
                                label="Efficiency"
                                icon={<Zap size={16} color="#3b82f6" />}
                                score={scores.efficiency.score}
                                max={scores.efficiency.max || 25}
                                comment={scores.efficiency.comment}
                                color="#3b82f6"
                            />

                            <ScoreBar
                                label="Code Style"
                                icon={<Eye size={16} color="#8b5cf6" />}
                                score={scores.codeStyle.score}
                                max={scores.codeStyle.max || 20}
                                comment={scores.codeStyle.comment}
                                color="#8b5cf6"
                            />

                            <ScoreBar
                                label="Best Practices"
                                icon={<Trophy size={16} color="#f59e0b" />}
                                score={scores.bestPractices.score}
                                max={scores.bestPractices.max || 15}
                                comment={scores.bestPractices.comment}
                                color="#f59e0b"
                            />
                        </div>
                    )}

                    {/* Plagiarism Warning */}
                    {submission.plagiarism?.detected && (
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--danger-alpha)', borderRadius: '0.75rem', border: '1px solid var(--danger)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <AlertTriangle size={24} color="var(--danger)" />
                            <div>
                                <strong style={{ color: 'var(--danger)' }}>Plagiarism Detected</strong>
                                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)' }}>This code matches a submission from {submission.plagiarism.copiedFromName}</p>
                            </div>
                        </div>
                    )}

                    {/* Integrity Violation */}
                    {submission.integrity?.integrityViolation && (
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '0.75rem', border: '1px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <AlertTriangle size={24} color="#f59e0b" />
                            <div>
                                <strong style={{ color: '#f59e0b' }}>Integrity Violation</strong>
                                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)' }}>Tab switches detected: {submission.integrity.tabSwitches}. Score was capped due to academic integrity concerns.</p>
                            </div>
                        </div>
                    )}

                    {/* Proctoring Violations Section */}
                    {(submission.tabSwitches > 0 || submission.copyPasteAttempts > 0 || submission.cameraBlockedCount > 0 || submission.phoneDetectionCount > 0) && (
                        <div style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'var(--bg-dark)', borderRadius: '1rem', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                                <AlertTriangle size={18} /> Proctoring Violations
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                {submission.tabSwitches > 0 && (
                                    <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Eye size={18} color="#f59e0b" />
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#f59e0b' }}>{submission.tabSwitches} Tab Switches</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Penalty: -{Math.min(submission.tabSwitches * 5, 25)} pts</div>
                                        </div>
                                    </div>
                                )}
                                {submission.copyPasteAttempts > 0 && (
                                    <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '1.1rem' }}>📋</span>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#f59e0b' }}>{submission.copyPasteAttempts} Copy/Paste</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Penalty: -{Math.min(submission.copyPasteAttempts * 3, 15)} pts</div>
                                        </div>
                                    </div>
                                )}
                                {submission.cameraBlockedCount > 0 && (
                                    <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '1.1rem' }}>📷</span>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#ef4444' }}>{submission.cameraBlockedCount} Camera Blocked</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Penalty: -{Math.min(submission.cameraBlockedCount * 10, 30)} pts</div>
                                        </div>
                                    </div>
                                )}
                                {submission.phoneDetectionCount > 0 && (
                                    <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '1.1rem' }}>📱</span>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#ef4444' }}>{submission.phoneDetectionCount} Phone Detected</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Penalty: -{Math.min(submission.phoneDetectionCount * 15, 45)} pts</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Feedback */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Sparkles size={18} color="var(--primary)" /> AI Feedback</h4>
                        <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', background: 'var(--bg-dark)', padding: '1rem', borderRadius: '0.5rem' }}>{submission.feedback || 'No feedback provided.'}</p>
                    </div>

                    {/* AI Explanation */}
                    {submission.aiExplanation && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Eye size={18} color="var(--secondary)" /> Why this score?</h4>
                            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', background: 'var(--secondary-alpha)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--secondary)' }}>{submission.aiExplanation}</p>
                        </div>
                    )}

                    {/* Suggestions */}
                    {submission.suggestions && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Lightbulb size={18} color="#fbbf24" /> Improvement Suggestion</h4>
                            <div style={{ background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05))', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                                <p style={{ color: '#fbbf24', margin: 0, fontSize: '0.95rem' }}>{submission.suggestions}</p>
                            </div>
                        </div>
                    )}

                    {/* Code Preview */}
                    <div>
                        <h4 style={{ margin: '0 0 0.75rem' }}>Submitted Code</h4>
                        <pre style={{ background: 'var(--code-bg)', padding: '1.5rem', borderRadius: '0.5rem', overflow: 'auto', maxHeight: '300px', fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--code-text)', border: '1px solid var(--border-color)' }}>{submission.code}</pre>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ==================== GLOBAL COMPLETE TESTS COMPONENT ====================
function GlobalTests({ user }) {
    const [tests, setTests] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedTest, setSelectedTest] = useState(null)
    const [showTestInterface, setShowTestInterface] = useState(false)
    const [submissions, setSubmissions] = useState([])

    useEffect(() => {
        const fetchTests = async () => {
            try {
                const res = await axios.get(`${API_BASE}/global-tests?status=live`)
                setTests(Array.isArray(res.data) ? res.data : [])
            } catch (e) {
                if (e.response?.status === 503) setTests([])
                else console.error(e)
            } finally {
                setLoading(false)
            }
        }
        const fetchSubs = async () => {
            try {
                const res = await axios.get(`${API_BASE}/global-test-submissions?studentId=${user.id}`)
                setSubmissions(Array.isArray(res.data) ? res.data : [])
            } catch (_) { setSubmissions([]) }
        }
        fetchTests()
        fetchSubs()
    }, [user.id])

    const getAttemptCount = (testId) => submissions.filter(s => s.testId === testId).length
    const getTestSubmission = (testId) => submissions.find(s => s.testId === testId)
    const isTestCompleted = (testId, testData) => {
        const hasPassed = submissions.some(s => s.testId === testId && s.status === 'passed')
        const attemptCount = getAttemptCount(testId)
        const maxAttempts = testData?.maxAttempts ?? 1
        return hasPassed || (maxAttempts !== -1 && attemptCount >= maxAttempts)
    }

    const startTest = async (test) => {
        if (test.startTime && new Date(test.startTime) > new Date()) {
            alert('This test is not yet available.')
            return
        }
        if (test.deadline && new Date(test.deadline) < new Date()) {
            alert('This test has expired.')
            return
        }
        const attemptCount = submissions.filter(s => s.testId === test.id).length
        const maxAttempts = test.maxAttempts ?? 1
        if (maxAttempts !== -1 && attemptCount >= maxAttempts) {
            alert(`Max attempts (${maxAttempts}) reached for this test.`)
            return
        }
        try {
            const res = await axios.get(`${API_BASE}/global-tests/${test.id}`)
            setSelectedTest(res.data)
            setShowTestInterface(true)
        } catch (e) {
            alert(e.response?.data?.error || 'Failed to load test')
        }
    }

    const handleComplete = () => {
        setShowTestInterface(false)
        setSelectedTest(null)
        axios.get(`${API_BASE}/global-test-submissions?studentId=${user.id}`).then(r => setSubmissions(Array.isArray(r.data) ? r.data : [])).catch(() => { })
    }

    if (loading) return <div className="loading-spinner"></div>

    if (showTestInterface && selectedTest) {
        return (
            <GlobalTestInterface
                test={selectedTest}
                user={user}
                onClose={() => { setShowTestInterface(false); setSelectedTest(null) }}
                onComplete={handleComplete}
            />
        )
    }

    const completedCount = submissions.filter(s => s.status === 'passed').length
    return (
        <div className="animate-fadeIn">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Layers size={28} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Global Complete Tests</h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Aptitude, Verbal, Logical, Coding, SQL – all in one test</p>
                    </div>
                </div>
            </div>
            {tests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border-color)' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No global tests available. Check back later.</p>
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        <div className="stat-card glass">
                            <div className="stat-icon" style={{ background: 'rgba(6, 182, 212, 0.1)', color: '#06b6d4' }}><Layers size={24} /></div>
                            <div className="stat-info">
                                <span className="stat-label">Available</span>
                                <span className="stat-value">{tests.length}</span>
                            </div>
                        </div>
                        <div className="stat-card glass">
                            <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><CheckCircle size={24} /></div>
                            <div className="stat-info">
                                <span className="stat-label">Submitted</span>
                                <span className="stat-value">{submissions.length}</span>
                            </div>
                        </div>
                        <div className="stat-card glass">
                            <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}><Award size={24} /></div>
                            <div className="stat-info">
                                <span className="stat-label">Passed</span>
                                <span className="stat-value">{submissions.filter(s => s.status === 'passed').length}</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                        {tests.map(t => {
                            const completed = isTestCompleted(t.id, t)
                            const submission = getTestSubmission(t.id)
                            const attemptCount = getAttemptCount(t.id)
                            const hasPassed = submission?.status === 'passed'
                            const hasAttemptsLeft = t.maxAttempts === -1 || attemptCount < (t.maxAttempts || 1)
                            const canRetry = !hasPassed && hasAttemptsLeft && attemptCount > 0

                            return (
                                <div key={t.id} className="card glass" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                                    {/* Status Badge */}
                                    {attemptCount > 0 && (
                                        <div style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.25rem 0.75rem', borderRadius: '20px', background: hasPassed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: hasPassed ? '#10b981' : '#ef4444', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            {hasPassed ? <><CheckCircle size={14} /> Passed</> : <><XCircle size={14} /> Failed</>}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Layers size={24} color="white" />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{t.title}</h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                                                <span className={`difficulty-badge ${t.difficulty?.toLowerCase()}`}>{t.difficulty}</span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}><Clock size={14} /> {t.duration} min</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Target size={16} color="#06b6d4" /><span>{t.totalQuestions} Questions</span></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Award size={16} color="#f59e0b" /><span>Pass: {t.passingScore}%</span></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={16} color="#ef4444" /><span>Tab Limit: {t.maxTabSwitches || 3}</span></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Zap size={16} color="#3b82f6" /><span>Attempts: {attemptCount}/{t.maxAttempts === -1 ? '∞' : (t.maxAttempts || 1)}</span></div>
                                        {t.deadline && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: t.startTime && new Date(t.startTime) > new Date() ? '#f59e42' : t.deadline && new Date(t.deadline) < new Date() ? '#ef4444' : 'var(--text-muted)' }}>
                                                <Clock size={16} color={t.startTime && new Date(t.startTime) > new Date() ? '#f59e42' : t.deadline && new Date(t.deadline) < new Date() ? '#ef4444' : '#10b981'} />
                                                <span>{t.startTime && new Date(t.startTime) > new Date() ? `Not Yet Started` : t.deadline && new Date(t.deadline) < new Date() ? 'Expired' : t.deadline ? `Due: ${new Date(t.deadline).toLocaleDateString()}` : ''}</span>
                                            </div>
                                        )}
                                    </div>

                                    {attemptCount > 0 && submission && (
                                        <div style={{ background: 'var(--bg-tertiary)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem', border: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your Score</span>
                                                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: hasPassed ? '#10b981' : '#ef4444' }}>{submission.overallPercentage}%</span>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        {completed ? (
                                            <button disabled style={{ flex: 1, padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '10px', color: '#10b981', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'not-allowed' }}><CheckCircle size={18} /> Completed</button>
                                        ) : canRetry ? (
                                            <button onClick={() => startTest(t)} className="btn-create-new" style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>Retry Test <RefreshCw size={18} /></button>
                                        ) : t.startTime && new Date(t.startTime) > new Date() ? (
                                            <div style={{ flex: 1, padding: '0.75rem', background: 'rgba(245, 158, 66, 0.15)', borderRadius: '10px', color: '#f59e42', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}><XCircle size={18} /> Not Yet Started</div>
                                        ) : t.deadline && new Date(t.deadline) < new Date() ? (
                                            <div style={{ flex: 1, padding: '0.75rem', background: 'rgba(107, 114, 128, 0.2)', borderRadius: '10px', color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}><XCircle size={18} /> Test Expired</div>
                                        ) : (
                                            <button onClick={() => startTest(t)} className="btn-create-new" style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>Start Test <ChevronRight size={18} /></button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}

// ==================== APTITUDE TESTS COMPONENT ====================
function AptitudeTests({ user }) {
    const [tests, setTests] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedTest, setSelectedTest] = useState(null)
    const [showTestInterface, setShowTestInterface] = useState(false)
    const [submissions, setSubmissions] = useState([])
    const [showResults, setShowResults] = useState(null)

    useEffect(() => {
        fetchTests()
        fetchSubmissions()
    }, [user.id])

    const fetchTests = async () => {
        try {
            const response = await axios.get(`${API_BASE}/aptitude?status=live`)
            setTests(response.data)
            setLoading(false)
        } catch (error) {
            console.error('Error fetching tests:', error)
            setLoading(false)
        }
    }

    const fetchSubmissions = async () => {
        try {
            const response = await axios.get(`${API_BASE}/aptitude-submissions?studentId=${user.id}`)
            setSubmissions(response.data)
        } catch (error) {
            console.error('Error fetching submissions:', error)
        }
    }

    // Helper function to check if test has started
    const hasTestStarted = (test) => {
        if (!test.startTime) return true // No start time = always available

        const startTime = new Date(test.startTime)
        const now = new Date()

        // Ensure both dates are compared in the same timezone
        // The backend stores dates in UTC, so we need to compare in UTC
        const startTimeUTC = Date.UTC(
            startTime.getUTCFullYear(),
            startTime.getUTCMonth(),
            startTime.getUTCDate(),
            startTime.getUTCHours(),
            startTime.getUTCMinutes()
        )

        const nowUTC = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes()
        )

        return nowUTC >= startTimeUTC
    }

    // Helper function to check if test has expired
    const hasTestExpired = (test) => {
        if (!test.deadline) return false // No deadline = never expires

        const deadline = new Date(test.deadline)
        const now = new Date()

        const deadlineUTC = Date.UTC(
            deadline.getUTCFullYear(),
            deadline.getUTCMonth(),
            deadline.getUTCDate(),
            deadline.getUTCHours(),
            deadline.getUTCMinutes()
        )

        const nowUTC = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes()
        )

        return nowUTC > deadlineUTC
    }


    const startTest = async (test) => {
        // Check if test has not started yet (using helper with timezone tolerance)
        if (!hasTestStarted(test)) {
            alert('This test is not yet available. Please check the start time.')
            return
        }
        // Check if deadline has passed
        if (hasTestExpired(test)) {
            alert('This test has expired. The deadline has passed.')
            return
        }

        // Check if max attempts reached (skip if unlimited: -1)
        if (!canRetryTest(test) && getAttemptCount(test.id) > 0) {
            alert(`You have reached the maximum number of attempts (${test.maxAttempts}) for this test.`)
            return
        }

        // Fetch full test with questions
        try {
            const response = await axios.get(`${API_BASE}/aptitude/${test.id}`)
            setSelectedTest(response.data)
            setShowTestInterface(true)
        } catch (error) {
            alert('Error loading test')
        }
    }

    const handleTestComplete = (result) => {
        fetchSubmissions()
        setShowTestInterface(false)
        setSelectedTest(null)
    }

    const isTestCompleted = (testId) => {
        return submissions.some(s => s.testId === testId)
    }

    const getTestSubmission = (testId) => {
        // Get the latest submission for this test (submissions are ordered by date DESC from backend)
        const testSubmissions = submissions.filter(s => s.testId === testId)
        return testSubmissions.length > 0 ? testSubmissions[0] : null
    }

    // Count how many attempts a student has made for a test
    const getAttemptCount = (testId) => {
        return submissions.filter(s => s.testId === testId).length
    }

    // Check if student can retry the test
    const canRetryTest = (test) => {
        const attemptCount = getAttemptCount(test.id)
        const maxAttempts = test.maxAttempts
        // -1 means unlimited attempts
        if (maxAttempts === -1) return true
        // Default to 1 attempt if not set
        return attemptCount < (maxAttempts || 1)
    }

    // Get remaining attempts
    const getRemainingAttempts = (test) => {
        const attemptCount = getAttemptCount(test.id)
        const maxAttempts = test.maxAttempts
        // -1 means unlimited attempts
        if (maxAttempts === -1) return '∞'
        return Math.max(0, (maxAttempts || 1) - attemptCount)
    }

    // Get unique tests with their latest submissions for stats
    const getLatestSubmissions = () => {
        const latestByTest = {}
        submissions.forEach(s => {
            if (!latestByTest[s.testId]) {
                latestByTest[s.testId] = s
            }
        })
        return Object.values(latestByTest)
    }

    const latestSubmissions = getLatestSubmissions()

    if (loading) return <div className="loading-spinner"></div>

    if (showTestInterface && selectedTest) {
        return (
            <AptitudeTestInterface
                test={selectedTest}
                user={user}
                onClose={() => {
                    setShowTestInterface(false)
                    setSelectedTest(null)
                }}
                onComplete={handleTestComplete}
            />
        )
    }

    return (
        <div className="animate-fadeIn">
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Brain size={28} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                            Aptitude Tests
                        </h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                            Test your reasoning, analytical, and problem-solving skills
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats Overview */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                        <Brain size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Available Tests</span>
                        <span className="stat-value">{tests.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Completed</span>
                        <span className="stat-value">{latestSubmissions.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                        <Target size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Avg Score</span>
                        <span className="stat-value">
                            {latestSubmissions.length > 0
                                ? Math.round(latestSubmissions.reduce((a, b) => a + b.score, 0) / latestSubmissions.length)
                                : 0}%
                        </span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                        <Award size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Passed</span>
                        <span className="stat-value">
                            {latestSubmissions.filter(s => s.status === 'passed').length}
                        </span>
                    </div>
                </div>
            </div>

            {/* Tests Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                gap: '1.5rem'
            }}>
                {tests.map(test => {
                    const completed = isTestCompleted(test.id)
                    const submission = getTestSubmission(test.id)

                    return (
                        <div
                            key={test.id}
                            className="card glass"
                            style={{
                                padding: '1.5rem',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            {/* Status Badge */}
                            {completed && (
                                <div style={{
                                    position: 'absolute',
                                    top: '1rem',
                                    right: '1rem',
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '20px',
                                    background: submission?.status === 'passed'
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : 'rgba(239, 68, 68, 0.2)',
                                    color: submission?.status === 'passed' ? '#10b981' : '#ef4444',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                }}>
                                    {submission?.status === 'passed' ? (
                                        <><CheckCircle size={14} /> Passed</>
                                    ) : (
                                        <><XCircle size={14} /> Failed</>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <Brain size={24} color="white" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                                        {test.title}
                                    </h3>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        marginTop: '0.5rem'
                                    }}>
                                        <span className={`difficulty-badge ${test.difficulty?.toLowerCase()}`}>
                                            {test.difficulty}
                                        </span>
                                        <span style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            fontSize: '0.8rem',
                                            color: 'var(--text-muted)'
                                        }}>
                                            <Clock size={14} /> {test.duration} min
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '1rem',
                                marginBottom: '1.5rem',
                                fontSize: '0.85rem',
                                color: 'var(--text-muted)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Target size={16} color="#8b5cf6" />
                                    <span>{test.questionCount || test.totalQuestions} Questions</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Award size={16} color="#f59e0b" />
                                    <span>Pass: {test.passingScore}%</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <AlertTriangle size={16} color="#ef4444" />
                                    <span>Tab Limit: {test.maxTabSwitches || 3}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Zap size={16} color="#06b6d4" />
                                    <span>Attempts: {getAttemptCount(test.id)}/{test.maxAttempts === -1 ? '∞' : (test.maxAttempts || 1)}</span>
                                </div>
                                {test.startTime && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        color: !hasTestStarted(test) ? '#f59e42' : '#10b981'
                                    }}>
                                        <Clock size={16} color={!hasTestStarted(test) ? '#f59e42' : '#10b981'} />
                                        <span>
                                            {!hasTestStarted(test)
                                                ? `Starts: ${new Date(test.startTime).toLocaleString()}`
                                                : `Started: ${new Date(test.startTime).toLocaleDateString()}`
                                            }
                                        </span>
                                    </div>
                                )}
                                {test.deadline && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        color: hasTestExpired(test) ? '#ef4444' : 'var(--text-muted)'
                                    }}>
                                        <Clock size={16} color={hasTestExpired(test) ? '#ef4444' : '#10b981'} />
                                        <span>
                                            {hasTestExpired(test)
                                                ? 'Expired'
                                                : `Due: ${new Date(test.deadline).toLocaleString()}`
                                            }
                                        </span>
                                    </div>
                                )}
                            </div>

                            {completed && submission && (
                                <div style={{
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                    marginBottom: '1rem',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your Score</span>
                                        <span style={{
                                            fontSize: '1.5rem',
                                            fontWeight: 700,
                                            color: submission.status === 'passed' ? '#10b981' : '#ef4444'
                                        }}>
                                            {submission.score}%
                                        </span>
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        gap: '0.5rem',
                                        marginTop: '0.5rem',
                                        fontSize: '0.8rem',
                                        color: 'var(--text-muted)'
                                    }}>
                                        <span>{submission.correctCount}/{submission.totalQuestions} Correct</span>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                {!completed ? (
                                    !hasTestStarted(test) ? (
                                        <div
                                            style={{
                                                flex: 1,
                                                padding: '0.75rem',
                                                background: 'rgba(245, 158, 66, 0.15)',
                                                border: 'none',
                                                borderRadius: '10px',
                                                color: '#f59e42',
                                                fontSize: '0.9rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.5rem'
                                            }}
                                        >
                                            <XCircle size={18} /> Not Yet Started
                                        </div>
                                    ) : hasTestExpired(test) ? (
                                        <div
                                            style={{
                                                flex: 1,
                                                padding: '0.75rem',
                                                background: 'rgba(107, 114, 128, 0.2)',
                                                border: 'none',
                                                borderRadius: '10px',
                                                color: '#6b7280',
                                                fontSize: '0.9rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.5rem'
                                            }}
                                        >
                                            <XCircle size={18} /> Test Expired
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => startTest(test)}
                                            style={{
                                                flex: 1,
                                                padding: '0.75rem',
                                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                                border: 'none',
                                                borderRadius: '10px',
                                                color: 'white',
                                                fontSize: '0.9rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.5rem'
                                            }}
                                        >
                                            <Play size={18} /> Start Test
                                        </button>
                                    )
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setShowResults(submission)}
                                            style={{
                                                flex: 1,
                                                padding: '0.75rem',
                                                background: 'rgba(59, 130, 246, 0.1)',
                                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                                borderRadius: '10px',
                                                color: '#3b82f6',
                                                fontSize: '0.9rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.5rem'
                                            }}
                                        >
                                            <Eye size={18} /> View Results
                                        </button>
                                        {canRetryTest(test) ? (
                                            <button
                                                onClick={() => startTest(test)}
                                                style={{
                                                    padding: '0.75rem 1rem',
                                                    background: 'rgba(139, 92, 246, 0.1)',
                                                    border: '1px solid rgba(139, 92, 246, 0.3)',
                                                    borderRadius: '10px',
                                                    color: '#8b5cf6',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <Zap size={18} /> Retry ({getRemainingAttempts(test)} left)
                                            </button>
                                        ) : (
                                            <div style={{
                                                padding: '0.75rem 1rem',
                                                background: 'rgba(107, 114, 128, 0.1)',
                                                border: '1px solid rgba(107, 114, 128, 0.3)',
                                                borderRadius: '10px',
                                                color: '#6b7280',
                                                fontSize: '0.9rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}
                                            >
                                                <XCircle size={18} /> No retries left
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {tests.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '4rem',
                    color: 'var(--text-muted)'
                }}>
                    <Brain size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <p>No aptitude tests available at the moment.</p>
                </div>
            )}

            {/* Results Modal */}
            {showResults && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowResults(null)}
                >
                    <div
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: '600px' }}
                    >
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '10px',
                                    background: showResults.status === 'passed'
                                        ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                                        : 'linear-gradient(135deg, #ef4444, #f97316)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {showResults.status === 'passed' ? (
                                        <Award size={20} color="white" />
                                    ) : (
                                        <Target size={20} color="white" />
                                    )}
                                </div>
                                <h2>{showResults.testTitle}</h2>
                            </div>
                            <button onClick={() => setShowResults(null)} className="modal-close">
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            {/* Score Summary */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '1rem',
                                marginBottom: '2rem'
                            }}>
                                <div style={{
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#3b82f6' }}>
                                        {showResults.score}%
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Score</div>
                                </div>
                                <div style={{
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>
                                        {showResults.correctCount}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Correct</div>
                                </div>
                                <div style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>
                                        {showResults.totalQuestions - showResults.correctCount}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Wrong</div>
                                </div>
                            </div>

                            {/* Question Results */}
                            <h4 style={{ marginBottom: '1rem' }}>Question Breakdown</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {showResults.questionResults?.map((qr, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            background: qr.isCorrect
                                                ? 'rgba(16, 185, 129, 0.1)'
                                                : 'rgba(239, 68, 68, 0.1)',
                                            border: `1px solid ${qr.isCorrect ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                            borderRadius: '12px',
                                            padding: '1rem'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '0.75rem'
                                        }}>
                                            {qr.isCorrect ? (
                                                <CheckCircle size={20} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
                                            ) : (
                                                <XCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                                            )}
                                            <div style={{ flex: 1 }}>
                                                <p style={{
                                                    margin: '0 0 0.5rem',
                                                    fontWeight: 500,
                                                    fontSize: '0.9rem'
                                                }}>
                                                    Q{idx + 1}: {qr.question}
                                                </p>
                                                <div style={{
                                                    display: 'flex',
                                                    gap: '1rem',
                                                    fontSize: '0.8rem'
                                                }}>
                                                    <span>
                                                        Your: <strong style={{ color: qr.isCorrect ? '#10b981' : '#ef4444' }}>
                                                            {qr.userAnswer}
                                                        </strong>
                                                    </span>
                                                    {!qr.isCorrect && (
                                                        <span>
                                                            Correct: <strong style={{ color: '#10b981' }}>
                                                                {qr.correctAnswer}
                                                            </strong>
                                                        </span>
                                                    )}
                                                </div>
                                                {qr.explanation && (
                                                    <p style={{
                                                        margin: '0.5rem 0 0',
                                                        fontSize: '0.8rem',
                                                        color: 'var(--text-muted)',
                                                        fontStyle: 'italic'
                                                    }}>
                                                        💡 {qr.explanation}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default StudentPortal

