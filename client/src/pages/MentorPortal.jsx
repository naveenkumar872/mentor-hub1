import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { LayoutDashboard, Upload, FileCode, Trophy, List, Users, Medal, Activity, CheckCircle, TrendingUp, Clock, Plus, X, ChevronRight, Code, Trash2, Eye, AlertTriangle, FileText, BarChart2, Zap, Award, Sparkles, Brain, Target, XCircle, Search } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import DashboardLayout from '../components/DashboardLayout'
import { AIChatbot, AIFloatingButton } from '../components/AIChatbot'
import AptitudeReportModal from '../components/AptitudeReportModal'
import { useAuth } from '../App'
import axios from 'axios'
import './Portal.css'

const API_BASE = 'https://mentor-hub-backend-tkil.onrender.com/api'
const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']

function MentorPortal() {
    const { user } = useAuth()
    const location = useLocation()
    const [title, setTitle] = useState('Dashboard')
    const [subtitle, setSubtitle] = useState('Welcome back!')

    useEffect(() => {
        const path = location.pathname.split('/').pop()
        switch (path) {
            case 'upload-tasks':
                setTitle('Upload ML Tasks')
                setSubtitle('Create machine learning tasks for students')
                break
            case 'upload-problems':
                setTitle('Upload Problems')
                setSubtitle('Create coding/SQL problems')
                break
            case 'leaderboard':
                setTitle('Leaderboard')
                setSubtitle('Student rankings')
                break
            case 'all-submissions':
                setTitle('All Submissions')
                setSubtitle('Review student work with AI evaluation')
                break
            default:
                setTitle('Dashboard')
                setSubtitle(`Welcome back, ${user?.name}!`)
        }
    }, [location, user])

    const navItems = [
        { path: '/mentor', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { path: '/mentor/upload-tasks', label: 'Upload ML Tasks', icon: <Upload size={20} /> },
        { path: '/mentor/upload-problems', label: 'Upload Problems', icon: <FileCode size={20} /> },
        { path: '/mentor/leaderboard', label: 'Leaderboard', icon: <Trophy size={20} /> },
        { path: '/mentor/all-submissions', label: 'All Submissions', icon: <List size={20} /> }
    ]

    return (
        <DashboardLayout navItems={navItems} title={title} subtitle={subtitle}>
            <Routes>
                <Route path="/" element={<Dashboard user={user} />} />
                <Route path="/upload-tasks" element={<UploadTasks user={user} />} />
                <Route path="/upload-problems" element={<UploadProblems user={user} />} />
                <Route path="/leaderboard" element={<Leaderboard user={user} />} />
                <Route path="/all-submissions" element={<AllSubmissions user={user} />} />
            </Routes>
        </DashboardLayout>
    )
}

function Dashboard({ user }) {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${API_BASE}/analytics/mentor/${user.id}`)
            .then(res => {
                setStats(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [user.id])

    if (loading) return <div className="loading-spinner"></div>
    if (!stats) return <div>Error loading stats</div>

    return (
        <div className="animate-fadeIn dashboard-container">
            {/* Main Stats Banner */}
            <div className="stats-grid">
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                        <Users size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Your Students</span>
                        <span className="stat-value">{stats.totalStudents}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                        <Activity size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Submissions</span>
                        <span className="stat-value">{stats.totalSubmissions}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Group Score</span>
                        <span className="stat-value">{stats.avgScore}%</span>
                    </div>
                    <div className="stat-progress">
                        <div className="progress-fill" style={{ width: `${stats.avgScore}%` }}></div>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                        <TrendingUp size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Content</span>
                        <span className="stat-value">{stats.totalTasks + stats.totalProblems}</span>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="charts-container">
                <div className="chart-wrapper glass large">
                    <div className="chart-header">
                        <h3>Group Submission Trends</h3>
                        <p>Last 7 days mentee activity</p>
                    </div>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer>
                            <AreaChart data={stats.submissionTrends}>
                                <defs>
                                    <linearGradient id="colorCountMentor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
                                <YAxis stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                                    itemStyle={{ color: '#8b5cf6' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorCountMentor)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-wrapper glass small">
                    <div className="chart-header">
                        <h3>Language Usage</h3>
                        <p>Mentee preference</p>
                    </div>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={stats.languageStats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {stats.languageStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Footer Grid */}
            <div className="dashboard-footer-grid">
                <div className="activity-card glass">
                    <div className="card-header">
                        <h3>Recent Mentee Activity</h3>
                        <Activity size={18} style={{ opacity: 0.5 }} />
                    </div>
                    <div className="activity-list">
                        {stats.recentActivity.map(sub => (
                            <div key={sub.id} className="activity-item">
                                <div className={`status-icon ${sub.status}`}></div>
                                <div className="activity-details">
                                    <p><strong>{sub.studentName}</strong> submitted work</p>
                                    <span className="time"><Clock size={12} /> {new Date(sub.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="activity-score" style={{ color: sub.status === 'accepted' ? '#10b981' : '#ef4444' }}>
                                    {sub.score}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="performer-card glass">
                    <div className="card-header">
                        <h3>Group Top Performers</h3>
                        <Trophy size={18} style={{ opacity: 0.5, color: '#f59e0b' }} />
                    </div>
                    <div className="performer-list">
                        {stats.menteePerformance.map((student, i) => (
                            <div key={student.name} className="performer-item">
                                <div className="rank">#{i + 1}</div>
                                <div className="performer-name">
                                    <p>{student.name}</p>
                                    <span>{student.count} submissions</span>
                                </div>
                                <div className="performer-score">{student.score}%</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ==================== UPLOAD ML TASKS ====================
function UploadTasks({ user }) {
    const [tasks, setTasks] = useState([])
    const [students, setStudents] = useState([])
    const [loading, setLoading] = useState(true)
    const [showAIChat, setShowAIChat] = useState(false)
    const [task, setTask] = useState({
        title: '',
        type: 'machine_learning',
        difficulty: 'medium',
        description: '',
        requirements: '',
        deadline: ''
    })

    // AI Chatbot handler - auto-fills the task form
    const handleAIGenerate = (generated) => {
        setTask({
            title: generated.title || '',
            type: generated.type || 'machine_learning',
            difficulty: generated.difficulty || 'medium',
            description: generated.description || '',
            requirements: generated.requirements || '',
            deadline: task.deadline
        })
        setShowAIChat(false)
    }

    const fetchData = async () => {
        try {
            const [tasksRes, studentsRes] = await Promise.all([
                axios.get(`${API_BASE}/tasks?mentorId=${user.id}`),
                axios.get(`${API_BASE}/mentors/${user.id}/students`)
            ])
            setTasks(tasksRes.data)
            setStudents(studentsRes.data)
            setLoading(false)
        } catch (err) {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [user.id])

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            await axios.post(`${API_BASE}/tasks`, { ...task, mentorId: user.id })
            setTask({ title: '', type: 'machine_learning', difficulty: 'medium', description: '', requirements: '', deadline: '' })
            fetchData()
        } catch (error) {
            alert('Error creating task')
        }
    }

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this task?')) {
            try {
                await axios.delete(`${API_BASE}/tasks/${id}`)
                fetchData()
            } catch (error) {
                alert('Error deleting task')
            }
        }
    }

    const canDelete = (task) => {
        return task.completedBy?.length >= students.length && students.length > 0
    }

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="animate-fadeIn">
            {/* Upload Form */}
            <div className="card glass" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <Upload size={20} className="text-primary" /> Create New ML Task
                    </h3>
                    <button
                        type="button"
                        onClick={() => setShowAIChat(true)}
                        style={{
                            padding: '0.6rem 1.2rem',
                            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <Sparkles size={16} /> AI Generate
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                            <label>Task Title</label>
                            <input
                                type="text"
                                placeholder="e.g., Sentiment Analysis Project"
                                value={task.title}
                                onChange={(e) => setTask({ ...task, title: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-grid">
                        <div className="form-group">
                            <label>Task Type</label>
                            <select value={task.type} onChange={(e) => setTask({ ...task, type: e.target.value })}>
                                <option value="machine_learning">Machine Learning</option>
                                <option value="deep_learning">Deep Learning</option>
                                <option value="data_science">Data Science</option>
                                <option value="nlp">NLP</option>
                                <option value="computer_vision">Computer Vision</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Difficulty</label>
                            <select value={task.difficulty} onChange={(e) => setTask({ ...task, difficulty: e.target.value })}>
                                <option value="easy">Easy</option>
                                <option value="medium">Medium</option>
                                <option value="hard">Hard</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Deadline (Optional)</label>
                            <input type="date" value={task.deadline} onChange={(e) => setTask({ ...task, deadline: e.target.value })} />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Task Description</label>
                        <textarea
                            rows="4"
                            placeholder="Describe the task in detail..."
                            value={task.description}
                            onChange={(e) => setTask({ ...task, description: e.target.value })}
                            required
                        ></textarea>
                    </div>

                    <div className="form-group">
                        <label>Requirements (one per line)</label>
                        <textarea
                            rows="3"
                            placeholder="1. Data preprocessing&#10;2. Model training&#10;3. Evaluation"
                            value={task.requirements}
                            onChange={(e) => setTask({ ...task, requirements: e.target.value })}
                        ></textarea>
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-reset" onClick={() => setTask({ title: '', type: 'machine_learning', difficulty: 'medium', description: '', requirements: '', deadline: '' })}>
                            Reset
                        </button>
                        <button type="submit" className="btn-create-new">
                            <Plus size={16} /> Create Task
                        </button>
                    </div>
                </form>
            </div>

            {/* Task Leaderboard */}
            <div className="card glass">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <Trophy size={20} style={{ color: '#f59e0b' }} /> Task Leaderboard
                </h3>
                <div className="table-container" style={{ border: 'none' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Task Title</th>
                                <th>Type</th>
                                <th>Difficulty</th>
                                <th>Created</th>
                                <th>Completion</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(t => (
                                <tr key={t.id}>
                                    <td style={{ fontWeight: 600 }}>{t.title}</td>
                                    <td>
                                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                                            {t.type?.replace('_', ' ').toUpperCase() || 'ML'}
                                        </span>
                                    </td>
                                    <td><span className={`difficulty-badge ${t.difficulty?.toLowerCase()}`}>{t.difficulty}</span></td>
                                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{ width: '80px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${students.length > 0 ? ((t.completedBy?.length || 0) / students.length) * 100 : 0}%`,
                                                    height: '100%',
                                                    background: 'linear-gradient(90deg, #10b981, #06b6d4)'
                                                }}></div>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {t.completedBy?.length || 0}/{students.length}
                                            </span>
                                        </div>
                                    </td>
                                    <td><span className={`status-badge ${t.status}`}>{t.status}</span></td>
                                    <td>
                                        <button
                                            onClick={() => handleDelete(t.id)}
                                            disabled={!canDelete(t)}
                                            style={{
                                                background: canDelete(t) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                                                border: 'none',
                                                color: canDelete(t) ? '#ef4444' : '#64748b',
                                                padding: '0.4rem 0.75rem',
                                                borderRadius: '6px',
                                                cursor: canDelete(t) ? 'pointer' : 'not-allowed',
                                                fontSize: '0.8rem'
                                            }}
                                            title={canDelete(t) ? 'Delete task' : 'Can only delete when all students complete'}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* AI Chatbot for Task Generation */}
            <AIChatbot
                context="task"
                isOpen={showAIChat}
                onClose={() => setShowAIChat(false)}
                onGenerate={handleAIGenerate}
            />
        </div>
    )
}

// ==================== UPLOAD CODING PROBLEMS ====================
function UploadProblems({ user }) {
    const [problems, setProblems] = useState([])
    const [students, setStudents] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showAIChat, setShowAIChat] = useState(false)
    const [problem, setProblem] = useState({
        title: '',
        type: 'Coding',
        language: 'Python',
        difficulty: 'Medium',
        description: '',
        testInput: '',
        expectedOutput: '',
        deadline: '',
        status: 'live',
        // Proctoring settings
        enableProctoring: false,
        enableVideoAudio: false,
        disableCopyPaste: false,
        trackTabSwitches: false,
        maxTabSwitches: 3
    })

    // AI Chatbot handler - auto-fills the problem form
    const handleAIGenerate = (generated) => {
        setProblem({
            title: generated.title || '',
            type: generated.type || 'Coding',
            language: generated.language || 'Python',
            difficulty: generated.difficulty || 'Medium',
            description: generated.description || '',
            testInput: generated.sampleInput || '',
            expectedOutput: generated.expectedOutput || '',
            deadline: problem.deadline,
            status: generated.status || 'live',
            enableProctoring: problem.enableProctoring,
            enableVideoAudio: problem.enableVideoAudio,
            disableCopyPaste: problem.disableCopyPaste,
            trackTabSwitches: problem.trackTabSwitches,
            maxTabSwitches: problem.maxTabSwitches
        })
        setShowAIChat(false)
        setShowModal(true)
    }

    const fetchData = async () => {
        try {
            const [problemsRes, studentsRes] = await Promise.all([
                axios.get(`${API_BASE}/problems?mentorId=${user.id}`),
                axios.get(`${API_BASE}/mentors/${user.id}/students`)
            ])
            setProblems(problemsRes.data)
            setStudents(studentsRes.data)
            setLoading(false)
        } catch (err) {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [user.id])

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            await axios.post(`${API_BASE}/problems`, { ...problem, mentorId: user.id })
            setShowModal(false)
            setProblem({
                title: '', type: 'Coding', language: 'Python', difficulty: 'Medium',
                description: '', testInput: '', expectedOutput: '', deadline: '', status: 'live',
                enableProctoring: false, enableVideoAudio: false, disableCopyPaste: false,
                trackTabSwitches: false, maxTabSwitches: 3
            })
            fetchData()
        } catch (error) {
            alert('Error creating problem')
        }
    }

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this problem?')) {
            try {
                await axios.delete(`${API_BASE}/problems/${id}`)
                fetchData()
            } catch (error) {
                alert('Error deleting problem')
            }
        }
    }

    const canDelete = (problem) => {
        return problem.completedBy?.length >= students.length && students.length > 0
    }

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="animate-fadeIn">
            {/* Header with Create Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Coding Problems</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Manage your problem library (C, C++, Python, Java, SQL)</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={() => setShowAIChat(true)}
                        style={{
                            padding: '0.75rem 1.25rem',
                            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <Sparkles size={18} /> AI Generate
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="btn-create-new"
                        style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Plus size={20} /> Create Manually
                    </button>
                </div>
            </div>

            {/* Problem Leaderboard Table */}
            <div className="card glass">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <Trophy size={20} style={{ color: '#f59e0b' }} /> Problem Leaderboard
                </h3>
                <div className="table-container" style={{ border: 'none' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Problem Title</th>
                                <th>Type</th>
                                <th>Language</th>
                                <th>Difficulty</th>
                                <th>Created</th>
                                <th>Completion</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {problems.map(p => (
                                <tr key={p.id}>
                                    <td style={{ fontWeight: 600 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {p.title}
                                            {p.proctoring?.enabled && (
                                                <span style={{ 
                                                    fontSize: '0.6rem', 
                                                    padding: '2px 6px', 
                                                    borderRadius: '4px', 
                                                    background: 'rgba(239, 68, 68, 0.15)', 
                                                    color: '#ef4444', 
                                                    fontWeight: 700,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}>
                                                    <Eye size={10} /> Proctored
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                                            {p.type?.toUpperCase()}
                                        </span>
                                    </td>
                                    <td><span style={{ fontWeight: 500 }}>{p.language}</span></td>
                                    <td><span className={`difficulty-badge ${p.difficulty?.toLowerCase()}`}>{p.difficulty}</span></td>
                                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{ width: '80px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${students.length > 0 ? ((p.completedBy?.length || 0) / students.length) * 100 : 0}%`,
                                                    height: '100%',
                                                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
                                                }}></div>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {p.completedBy?.length || 0}/{students.length}
                                            </span>
                                        </div>
                                    </td>
                                    <td><span className={`status-badge ${p.status}`}>{p.status}</span></td>
                                    <td>
                                        <button
                                            onClick={() => handleDelete(p.id)}
                                            disabled={!canDelete(p)}
                                            style={{
                                                background: canDelete(p) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                                                border: 'none',
                                                color: canDelete(p) ? '#ef4444' : '#64748b',
                                                padding: '0.4rem 0.75rem',
                                                borderRadius: '6px',
                                                cursor: canDelete(p) ? 'pointer' : 'not-allowed',
                                                fontSize: '0.8rem'
                                            }}
                                            title={canDelete(p) ? 'Delete problem' : 'Can only delete when all students complete'}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Problem Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FileCode size={20} color="white" />
                                </div>
                                <h2>Create New Problem</h2>
                            </div>
                            <button onClick={() => setShowModal(false)} className="modal-close"><X size={20} /></button>
                        </div>
                        <div className="modal-body premium-form">
                            <form onSubmit={handleSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Problem Title</label>
                                        <input type="text" placeholder="Enter problem title" value={problem.title} onChange={(e) => setProblem({ ...problem, title: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Problem Type</label>
                                        <select value={problem.type} onChange={(e) => setProblem({ ...problem, type: e.target.value })}>
                                            <option value="Coding">Coding</option>
                                            <option value="SQL">SQL</option>
                                            <option value="Algorithm">Algorithm</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Language</label>
                                        <select value={problem.language} onChange={(e) => setProblem({ ...problem, language: e.target.value })}>
                                            <option value="Python">Python</option>
                                            <option value="JavaScript">JavaScript</option>
                                            <option value="Java">Java</option>
                                            <option value="C">C</option>
                                            <option value="C++">C++</option>
                                            <option value="SQL">SQL</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Difficulty</label>
                                        <select value={problem.difficulty} onChange={(e) => setProblem({ ...problem, difficulty: e.target.value })}>
                                            <option value="Easy">Easy</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Hard">Hard</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select value={problem.status} onChange={(e) => setProblem({ ...problem, status: e.target.value })}>
                                            <option value="live">Live</option>
                                            <option value="draft">Draft</option>
                                            <option value="closed">Closed</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label">Problem Description</label>
                                    <textarea rows="5" placeholder="Describe the problem..." value={problem.description} onChange={(e) => setProblem({ ...problem, description: e.target.value })} required></textarea>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Sample Input</label>
                                        <input type="text" placeholder="e.g., [1, 2, 3]" value={problem.testInput} onChange={(e) => setProblem({ ...problem, testInput: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Expected Output</label>
                                        <input type="text" placeholder="e.g., 6" value={problem.expectedOutput} onChange={(e) => setProblem({ ...problem, expectedOutput: e.target.value })} />
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label">Deadline (Optional)</label>
                                    <input type="date" value={problem.deadline} onChange={(e) => setProblem({ ...problem, deadline: e.target.value })} />
                                </div>

                                {/* Proctoring Settings */}
                                <div style={{ 
                                    padding: '1.25rem', 
                                    background: 'rgba(139, 92, 246, 0.05)', 
                                    borderRadius: '12px', 
                                    border: '1px solid rgba(139, 92, 246, 0.2)',
                                    marginBottom: '1.5rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <Eye size={18} color="#8b5cf6" />
                                        <span style={{ fontWeight: 600, color: '#8b5cf6' }}>Proctoring Settings</span>
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                        <input 
                                            type="checkbox" 
                                            id="enableProctoring" 
                                            checked={problem.enableProctoring} 
                                            onChange={(e) => setProblem({ ...problem, enableProctoring: e.target.checked })}
                                            style={{ width: '18px', height: '18px', accentColor: '#8b5cf6' }}
                                        />
                                        <label htmlFor="enableProctoring" style={{ cursor: 'pointer', fontSize: '0.9rem' }}>Enable Proctoring Mode</label>
                                    </div>

                                    {problem.enableProctoring && (
                                        <div style={{ marginLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <input 
                                                    type="checkbox" 
                                                    id="enableVideoAudio" 
                                                    checked={problem.enableVideoAudio} 
                                                    onChange={(e) => setProblem({ ...problem, enableVideoAudio: e.target.checked })}
                                                    style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                                                />
                                                <label htmlFor="enableVideoAudio" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    📹 Enable Video & Audio Monitoring
                                                </label>
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <input 
                                                    type="checkbox" 
                                                    id="disableCopyPaste" 
                                                    checked={problem.disableCopyPaste} 
                                                    onChange={(e) => setProblem({ ...problem, disableCopyPaste: e.target.checked })}
                                                    style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                                                />
                                                <label htmlFor="disableCopyPaste" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    🚫 Disable Copy/Paste
                                                </label>
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <input 
                                                    type="checkbox" 
                                                    id="trackTabSwitches" 
                                                    checked={problem.trackTabSwitches} 
                                                    onChange={(e) => setProblem({ ...problem, trackTabSwitches: e.target.checked })}
                                                    style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                                                />
                                                <label htmlFor="trackTabSwitches" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    👁️ Track Tab Switches
                                                </label>
                                            </div>

                                            {problem.trackTabSwitches && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1.5rem' }}>
                                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Max Tab Switches:</label>
                                                    <input 
                                                        type="number" 
                                                        min="1" 
                                                        max="10" 
                                                        value={problem.maxTabSwitches} 
                                                        onChange={(e) => setProblem({ ...problem, maxTabSwitches: parseInt(e.target.value) || 3 })}
                                                        style={{ width: '60px', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'white', textAlign: 'center' }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="form-actions">
                                    <button type="button" className="btn-reset" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn-create-new"><Plus size={16} /> Create Problem</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Chatbot for Problem Generation */}
            <AIChatbot
                context="problem"
                isOpen={showAIChat}
                onClose={() => setShowAIChat(false)}
                onGenerate={handleAIGenerate}
            />
        </div>
    )
}

// ==================== STUDENT LEADERBOARD ====================
function Leaderboard({ user }) {
    const [leaders, setLeaders] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${API_BASE}/leaderboard?mentorId=${user.id}`)
            .then(res => {
                setLeaders(res.data)
                setLoading(false)
            })
            .catch(res => setLoading(false))
    }, [user.id])

    if (loading) return <div className="loading-spinner"></div>

    const getRankStyle = (rank) => {
        if (rank === 1) return { color: '#fbbf24', transform: 'scale(1.2)' }
        if (rank === 2) return { color: '#94a3b8', transform: 'scale(1.1)' }
        if (rank === 3) return { color: '#b45309', transform: 'scale(1.1)' }
        return { color: 'var(--text-muted)' }
    }

    const getRankIcon = (rank) => {
        if (rank === 1) return <Trophy size={24} fill="#fbbf24" color="#d97706" />
        if (rank === 2) return <Medal size={24} fill="#e2e8f0" color="#64748b" />
        if (rank === 3) return <Medal size={24} fill="#fbbf24" color="#b45309" />
        return <span style={{ fontWeight: 600, fontSize: '1.1rem', width: '24px', textAlign: 'center', display: 'inline-block' }}>#{rank}</span>
    }

    const getTotalViolations = (student) => {
        if (!student.violations) return 0
        return (student.violations.tabSwitches || 0) + 
               (student.violations.copyPaste || 0) +
               (student.violations.cameraBlocked || 0) +
               (student.violations.phoneDetection || 0) +
               (student.violations.integrityViolations || 0) + 
               (student.violations.plagiarism || 0)
    }

    return (
        <div className="card animate-slideUp glass" style={{ padding: '0 0 1rem 0', overflow: 'hidden' }}>
            <div style={{ padding: '2rem 2rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Trophy size={28} className="text-primary" />
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Student Leaderboard</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Rankings based on scores</p>
                </div>
            </div>

            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: '0 8px', padding: '0 1rem' }}>
                    <thead>
                        <tr>
                            <th style={{ paddingLeft: '2rem' }}>Rank</th>
                            <th>Student</th>
                            <th>Total Score</th>
                            <th>Submissions</th>
                            <th>Violations</th>
                            <th style={{ textAlign: 'center' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaders.map((student, i) => {
                            const totalViolations = getTotalViolations(student)
                            const hasIssues = totalViolations > 0 || student.violations?.plagiarism > 0
                            
                            return (
                                <tr key={student.studentId} className="leaderboard-row" style={{
                                    backgroundColor: i < 3 ? 'var(--bg-dark)' : 'transparent',
                                    transition: 'transform 0.2s',
                                }}>
                                    <td style={{ paddingLeft: '2rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', ...getRankStyle(i + 1) }}>
                                            {getRankIcon(i + 1)}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div className="avatar-circle">
                                                {student.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{student.name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary)' }}>
                                            {student.avgScore} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>pts</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="status-badge live" style={{ width: 'fit-content' }}>
                                            {student.acceptedSubmissions || student.totalSubmissions} Submitted
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {student.violations?.tabSwitches > 0 && (
                                                <span style={{ 
                                                    fontSize: '0.65rem', 
                                                    padding: '2px 6px', 
                                                    borderRadius: '4px', 
                                                    background: 'rgba(245, 158, 11, 0.15)', 
                                                    color: '#f59e0b',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Tab Switches">
                                                    <Eye size={10} /> {student.violations.tabSwitches}
                                                </span>
                                            )}
                                            {student.violations?.cameraBlocked > 0 && (
                                                <span style={{ 
                                                    fontSize: '0.65rem', 
                                                    padding: '2px 6px', 
                                                    borderRadius: '4px', 
                                                    background: 'rgba(239, 68, 68, 0.15)', 
                                                    color: '#ef4444',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Camera Blocked">
                                                    📷 {student.violations.cameraBlocked}
                                                </span>
                                            )}
                                            {student.violations?.phoneDetection > 0 && (
                                                <span style={{ 
                                                    fontSize: '0.65rem', 
                                                    padding: '2px 6px', 
                                                    borderRadius: '4px', 
                                                    background: 'rgba(239, 68, 68, 0.15)', 
                                                    color: '#ef4444',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Phone Detected">
                                                    📱 {student.violations.phoneDetection}
                                                </span>
                                            )}
                                            {student.violations?.copyPaste > 0 && (
                                                <span style={{ 
                                                    fontSize: '0.65rem', 
                                                    padding: '2px 6px', 
                                                    borderRadius: '4px', 
                                                    background: 'rgba(245, 158, 11, 0.15)', 
                                                    color: '#f59e0b',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Copy/Paste">
                                                    📋 {student.violations.copyPaste}
                                                </span>
                                            )}
                                            {student.violations?.plagiarism > 0 && (
                                                <span style={{ 
                                                    fontSize: '0.65rem', 
                                                    padding: '2px 6px', 
                                                    borderRadius: '4px', 
                                                    background: 'rgba(239, 68, 68, 0.15)', 
                                                    color: '#ef4444',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Plagiarism">
                                                    <AlertTriangle size={10} /> {student.violations.plagiarism}
                                                </span>
                                            )}
                                            {!hasIssues && (
                                                <span style={{ color: '#10b981' }}>
                                                    <CheckCircle size={14} />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ width: '100px', height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '10px', margin: '0 auto', overflow: 'hidden' }}>
                                            <div style={{ width: `${Math.min(student.avgScore, 100)}%`, height: '100%', backgroundColor: hasIssues ? '#f59e0b' : (i === 0 ? '#fbbf24' : 'var(--primary)') }}></div>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ==================== ALL SUBMISSIONS WITH AI EVALUATION ====================
function AllSubmissions({ user }) {
    const [submissions, setSubmissions] = useState([])
    const [aptitudeSubmissions, setAptitudeSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [viewReport, setViewReport] = useState(null)
    const [activeTab, setActiveTab] = useState('all')
    const [viewAptitudeResult, setViewAptitudeResult] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    const fetchSubmissions = () => {
        Promise.all([
            axios.get(`${API_BASE}/submissions?mentorId=${user.id}`),
            axios.get(`${API_BASE}/aptitude-submissions?mentorId=${user.id}`)
        ]).then(([codeRes, aptRes]) => {
            setSubmissions((codeRes.data || []).map(s => ({ ...s, subType: 'code' })))
            setAptitudeSubmissions((aptRes.data || []).map(s => ({ ...s, subType: 'aptitude', itemTitle: s.testTitle })))
            setLoading(false)
        }).catch(err => setLoading(false))
    }

    useEffect(() => {
        fetchSubmissions()
    }, [user.id])

    const allSubmissions = [...submissions, ...aptitudeSubmissions]
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))

    const getFilteredSubmissions = () => {
        let filtered = activeTab === 'all'
            ? allSubmissions
            : activeTab === 'code'
                ? submissions
                : aptitudeSubmissions

        return filtered.filter(s =>
            (s.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
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
                </div>
                <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search student, problem or status..."
                        style={{ padding: '0.6rem 1rem 0.6rem 2.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'white', width: '280px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="table-container card glass">
                <table>
                    <thead>
                        <tr>
                            <th>Student</th>
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
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>No submissions found</td></tr>
                        ) : filteredSubmissions.map(sub => (
                            <tr key={sub.id}>
                                <td><div style={{ fontWeight: 600 }}>{sub.studentName}</div></td>
                                <td>
                                    <span style={{
                                        fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px',
                                        background: sub.subType === 'aptitude' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                        color: sub.subType === 'aptitude' ? '#8b5cf6' : '#3b82f6'
                                    }}>
                                        {sub.subType === 'aptitude' ? '📝 Aptitude' : '💻 Code'}
                                    </span>
                                </td>
                                <td><div style={{ color: 'var(--primary)', fontWeight: 500 }}>{sub.itemTitle || sub.testTitle}</div></td>
                                <td>
                                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>
                                        {sub.subType === 'aptitude' ? 'N/A' : (sub.language?.toUpperCase() || 'N/A')}
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
                                    {sub.subType === 'aptitude' ? (
                                        <button
                                            onClick={() => setViewAptitudeResult(sub)}
                                            style={{
                                                background: 'rgba(139, 92, 246, 0.1)',
                                                border: 'none',
                                                color: '#8b5cf6',
                                                padding: '0.4rem 0.75rem',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Eye size={14} /> Results
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setViewReport(sub)}
                                            style={{
                                                background: 'rgba(59, 130, 246, 0.1)',
                                                border: 'none',
                                                color: '#3b82f6',
                                                padding: '0.4rem 0.75rem',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Eye size={14} /> Report
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Report Modal */}
            {viewReport && (
                <SubmissionReportModal submission={viewReport} onClose={() => setViewReport(null)} />
            )}

            {/* Aptitude Results Modal */}
            {viewAptitudeResult && (
                <AptitudeReportModal submission={viewAptitudeResult} onClose={() => setViewAptitudeResult(null)} />
            )}
        </>
    )
}

// ==================== SUBMISSION REPORT MODAL FOR MENTOR ====================
function SubmissionReportModal({ submission, onClose }) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
                <div className="modal-header">
                    <div className="modal-title-with-icon">
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: submission.status === 'accepted' ? 'linear-gradient(135deg, #10b981, #06b6d4)' : 'linear-gradient(135deg, #ef4444, #f59e0b)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <FileText size={20} color="white" />
                        </div>
                        <h2>Detailed Submission Report</h2>
                    </div>
                    <button onClick={onClose} className="modal-close"><X size={20} /></button>
                </div>
                <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    {/* Student & Submission Info */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '1rem',
                        marginBottom: '2rem',
                        padding: '1.5rem',
                        background: 'rgba(59, 130, 246, 0.05)',
                        borderRadius: '1rem',
                        border: '1px solid rgba(59, 130, 246, 0.1)'
                    }}>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Student Name</span>
                            <p style={{ margin: '0.25rem 0 0', fontWeight: 600, fontSize: '1.1rem' }}>{submission.studentName}</p>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Submitted At</span>
                            <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{new Date(submission.submittedAt).toLocaleString()}</p>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Language</span>
                            <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{submission.language}</p>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Submission Type</span>
                            <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{submission.submissionType === 'file' ? 'File Upload' : 'Code Editor'}</p>
                        </div>
                    </div>

                    {/* Score & Status */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '3rem',
                        marginBottom: '2rem',
                        padding: '2rem',
                        background: submission.status === 'accepted' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                        borderRadius: '1rem',
                        border: `1px solid ${submission.status === 'accepted' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', fontWeight: 800, color: submission.status === 'accepted' ? '#10b981' : '#ef4444' }}>
                                {submission.score}
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>AI Evaluation Score</div>
                        </div>
                        <div style={{
                            padding: '1rem 2rem',
                            borderRadius: '1rem',
                            background: submission.status === 'accepted' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: submission.status === 'accepted' ? '#10b981' : '#ef4444',
                            fontWeight: 700,
                            fontSize: '1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            {submission.status === 'accepted' ? <CheckCircle size={24} /> : <X size={24} />}
                            {submission.status?.toUpperCase()}
                        </div>
                    </div>

                    {/* Plagiarism Warning */}
                    {submission.plagiarism?.detected && (
                        <div className="plagiarism-banner" style={{ marginBottom: '1.5rem' }}>
                            <AlertTriangle size={24} color="#ef4444" />
                            <div>
                                <strong style={{ color: '#ef4444' }}>Plagiarism Detected</strong>
                                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)' }}>
                                    This code matches a submission from {submission.plagiarism.copiedFromName}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Proctoring Violations Section */}
                    {(submission.tabSwitches > 0 || submission.copyPasteAttempts > 0 || submission.cameraBlockedCount > 0 || submission.phoneDetectionCount > 0) && (
                        <div style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
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
                            {submission.proctoringVideo && (
                                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '1rem' }}>🎥</span>
                                    <span style={{ fontSize: '0.85rem', color: '#3b82f6' }}>Proctoring video recorded: {submission.proctoringVideo}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Feedback */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle size={18} color="#3b82f6" /> AI Feedback
                        </h4>
                        <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                            {submission.feedback || 'No feedback provided.'}
                        </p>
                    </div>

                    {/* AI Explanation - WHY THIS SCORE */}
                    {submission.aiExplanation && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={18} color="#8b5cf6" /> AI Explanation (Why this score?)
                            </h4>
                            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', background: 'rgba(139, 92, 246, 0.05)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(139, 92, 246, 0.1)' }}>
                                {submission.aiExplanation}
                            </p>
                        </div>
                    )}

                    {/* Detailed Analysis if available */}
                    {submission.analysis && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <BarChart2 size={18} color="var(--primary)" />
                                Detailed Analysis
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {submission.analysis.correctness !== undefined && (
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <CheckCircle size={22} color="#3b82f6" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Correctness</span>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#3b82f6' }}>{submission.analysis.correctness}</p>
                                        </div>
                                    </div>
                                )}
                                {submission.analysis.efficiency !== undefined && (
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Zap size={22} color="#10b981" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Efficiency</span>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#10b981' }}>{submission.analysis.efficiency}</p>
                                        </div>
                                    </div>
                                )}
                                {submission.analysis.codeStyle !== undefined && (
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Code size={22} color="#8b5cf6" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Code Style</span>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#8b5cf6' }}>{submission.analysis.codeStyle}</p>
                                        </div>
                                    </div>
                                )}
                                {submission.analysis.bestPractices !== undefined && (
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Award size={22} color="#f59e0b" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Best Practices</span>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#f59e0b' }}>{submission.analysis.bestPractices}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}


                    {/* Code Preview */}
                    <div>
                        <h4 style={{ margin: '0 0 0.75rem' }}>Submitted Code</h4>
                        <pre style={{
                            background: '#020617',
                            padding: '1.5rem',
                            borderRadius: '0.5rem',
                            overflow: 'auto',
                            maxHeight: '300px',
                            fontSize: '0.85rem',
                            fontFamily: 'monospace',
                            color: '#e2e8f0',
                            border: '1px solid #334155'
                        }}>
                            {submission.code}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default MentorPortal
