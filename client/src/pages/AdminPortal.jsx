import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Trophy, Award, List, Search, Send, Activity, CheckCircle, TrendingUp, Clock, Globe, FileCode, Plus, X, Code, ChevronRight, Upload, AlertTriangle, Zap, Target, Sparkles, Bot, Wand2, Eye, FileText, BarChart2, RefreshCw, Calendar, HelpCircle, Trash2, Save } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts'
import DashboardLayout from '../components/DashboardLayout'
import { AIChatbot, AIFloatingButton } from '../components/AIChatbot'
import { useAuth } from '../App'
import axios from 'axios'
import './Portal.css'

const API_BASE = 'https://mentor-hub-backend-tkil.onrender.com/api'

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']
const ADMIN_ID = 'admin-001'

function AdminPortal() {
    const { user } = useAuth()
    const location = useLocation()
    const [title, setTitle] = useState('Dashboard')
    const [subtitle, setSubtitle] = useState('System Overview')

    useEffect(() => {
        const path = location.pathname.split('/').pop()
        switch (path) {
            case 'allocations':
                setTitle('Allocations')
                setSubtitle('Mentor-Student assignments')
                break
            case 'student-leaderboard':
                setTitle('Student Leaderboard')
                setSubtitle('Top performers')
                break
            case 'mentor-leaderboard':
                setTitle('Mentor Leaderboard')
                setSubtitle('Mentor activity')
                break
            case 'all-submissions':
                setTitle('All Submissions')
                setSubtitle('Platform-wide submissions')
                break
            case 'global-tasks':
                setTitle('Global Tasks')
                setSubtitle('Tasks visible to all users')
                break
            case 'global-problems':
                setTitle('Global Problems')
                setSubtitle('Coding challenges for everyone')
                break
            case 'aptitude-tests':
                setTitle('Aptitude Tests')
                setSubtitle('Manage aptitude tests for all students')
                break
            default:
                setTitle('Dashboard')
                setSubtitle('System Administration')
        }
    }, [location])

    const navItems = [
        { path: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { path: '/admin/global-tasks', label: 'Global Tasks', icon: <Globe size={20} /> },
        { path: '/admin/global-problems', label: 'Global Problems', icon: <FileCode size={20} /> },
        { path: '/admin/aptitude-tests', label: 'Aptitude Tests', icon: <Target size={20} /> },
        { path: '/admin/allocations', label: 'Allocations', icon: <Users size={20} /> },
        { path: '/admin/student-leaderboard', label: 'Student Ranks', icon: <Trophy size={20} /> },
        { path: '/admin/mentor-leaderboard', label: 'Mentor Ranks', icon: <Award size={20} /> },
        { path: '/admin/all-submissions', label: 'All Submissions', icon: <List size={20} /> }
    ]

    return (
        <DashboardLayout navItems={navItems} title={title} subtitle={subtitle}>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/global-tasks" element={<GlobalTasks />} />
                <Route path="/global-problems" element={<GlobalProblems />} />
                <Route path="/aptitude-tests" element={<AptitudeTestsAdmin />} />
                <Route path="/allocations" element={<Allocations />} />
                <Route path="/student-leaderboard" element={<StudentLeaderboard />} />
                <Route path="/mentor-leaderboard" element={<MentorLeaderboard />} />
                <Route path="/all-submissions" element={<AllSubmissions />} />
            </Routes>
        </DashboardLayout>
    )
}

function Dashboard() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${API_BASE}/analytics/admin`)
            .then(res => {
                setStats(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [])

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
                        <span className="stat-label">Total Students</span>
                        <span className="stat-value">{stats.totalStudents}</span>
                    </div>
                    <div className="stat-badge positive">+12%</div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                        <Activity size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Submissions</span>
                        <span className="stat-value">{stats.totalSubmissions}</span>
                    </div>
                    <div className="stat-badge neutral">Stable</div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Success Rate</span>
                        <span className="stat-value">{stats.successRate}%</span>
                    </div>
                    <div className="stat-progress">
                        <div className="progress-fill" style={{ width: `${stats.successRate}%` }}></div>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                        <TrendingUp size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Content</span>
                        <span className="stat-value">{stats.totalContent}</span>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="charts-container">
                <div className="chart-wrapper glass large">
                    <div className="chart-header">
                        <h3>Submission Trends</h3>
                        <p>Last 7 days activity</p>
                    </div>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer>
                            <AreaChart data={stats.submissionTrends}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
                                <YAxis stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                                    itemStyle={{ color: '#3b82f6' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-wrapper glass small">
                    <div className="chart-header">
                        <h3>Language Split</h3>
                        <p>Usage distribution</p>
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
                    <div className="pie-legend">
                        {stats.languageStats.map((entry, index) => (
                            <div key={entry.name} className="legend-item">
                                <span className="dot" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                <span>{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Platform Activity & Leaderboard */}
            <div className="dashboard-footer-grid">
                <div className="activity-card glass">
                    <div className="card-header">
                        <h3>Recent Platform Activity</h3>
                        <Activity size={18} style={{ opacity: 0.5 }} />
                    </div>
                    <div className="activity-list">
                        {stats.recentSubmissions.map(sub => (
                            <div key={sub.id} className="activity-item">
                                <div className={`status-icon ${sub.status}`}></div>
                                <div className="activity-details">
                                    <p><strong>{sub.studentName}</strong> submitted a solution</p>
                                    <span className="time"><Clock size={12} /> {new Date(sub.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="activity-score" style={{ color: sub.status === 'accepted' ? '#10b981' : '#ef4444' }}>
                                    {sub.score}%
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="view-all-btn">View All History</button>
                </div>

                <div className="performer-card glass">
                    <div className="card-header">
                        <h3>Top Performers</h3>
                        <Trophy size={18} style={{ opacity: 0.5, color: '#f59e0b' }} />
                    </div>
                    <div className="performer-list">
                        {stats.studentPerformance.map((student, i) => (
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


function Allocations() {
    const [allocations, setAllocations] = useState([])
    const [loading, setLoading] = useState(true)
    const [expandedMentor, setExpandedMentor] = useState(null)

    useEffect(() => {
        axios.get(`${API_BASE}/allocations`)
            .then(res => {
                setAllocations(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [])

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="animate-fadeIn">
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Mentor Allocations</h2>
                <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Manage and view student-mentor assignments</p>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {allocations.map((alloc) => (
                    <div key={alloc.mentorId} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div
                            style={{
                                padding: '1.5rem 2rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                background: expandedMentor === alloc.mentorId ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                            }}
                            onClick={() => setExpandedMentor(expandedMentor === alloc.mentorId ? null : alloc.mentorId)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                <div className="avatar-circle" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                                    {alloc.mentorName.charAt(0)}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{alloc.mentorName}</h3>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{alloc.mentorEmail}</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{alloc.students.length}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Students</span>
                                </div>
                                <div style={{ transform: expandedMentor === alloc.mentorId ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>
                                    <Send size={18} style={{ transform: 'rotate(90deg)', color: 'var(--text-muted)' }} />
                                </div>
                            </div>
                        </div>

                        {expandedMentor === alloc.mentorId && (
                            <div style={{ padding: '0 2rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
                                <div className="table-container" style={{ marginTop: '1.5rem', background: 'rgba(15, 23, 42, 0.3)', borderRadius: '0.75rem' }}>
                                    <table style={{ margin: 0 }}>
                                        <thead>
                                            <tr>
                                                <th>Student Name</th>
                                                <th>Email</th>
                                                <th>Batch</th>
                                                <th>ID</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {alloc.students.map(student => (
                                                <tr key={student.id}>
                                                    <td>{student.name}</td>
                                                    <td>{student.email}</td>
                                                    <td>{student.batch}</td>
                                                    <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{student.id}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function StudentLeaderboard() {
    const [leaders, setLeaders] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${API_BASE}/leaderboard`)
            .then(res => {
                setLeaders(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [])

    if (loading) return <div className="loading-spinner"></div>

    const getRankIcon = (rank) => {
        if (rank === 1) return <Trophy size={24} style={{ color: '#fbbf24' }} />
        if (rank === 2) return <Award size={24} style={{ color: '#94a3b8' }} />
        if (rank === 3) return <Award size={24} style={{ color: '#b45309' }} />
        return <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>#{rank}</span>
    }

    return (
        <div className="card animate-fadeIn" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                    <Trophy size={32} className="text-primary" />
                    <div>
                        <h2 style={{ margin: 0 }}>Global Performance Ranking</h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Real-time ranking of students across all mentors</p>
                    </div>
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Student Name</th>
                                <th>Submissions</th>
                                <th>Avg. Score</th>
                                <th>Completion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaders.map((student, i) => (
                                <tr key={student.studentId}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {getRankIcon(i + 1)}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div className="avatar-circle">{student.name.charAt(0)}</div>
                                            <span>{student.name}</span>
                                        </div>
                                    </td>
                                    <td>{student.totalSubmissions}</td>
                                    <td>
                                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{student.avgScore}%</span>
                                    </td>
                                    <td>
                                        <div style={{ width: '100px', height: '8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px', overflow: 'hidden' }}>
                                            <div style={{ width: `${student.avgScore}%`, height: '100%', background: 'var(--primary)' }}></div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function MentorLeaderboard() {
    const [leaders, setLeaders] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${API_BASE}/mentor-leaderboard`)
            .then(res => {
                setLeaders(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [])

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="card animate-fadeIn" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                    <Award size={32} style={{ color: '#8b5cf6' }} />
                    <div>
                        <h2 style={{ margin: 0 }}>Global Mentor Leaderboard</h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Ranking mentors by student success and platform engagement</p>
                    </div>
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Mentor</th>
                                <th>Students</th>
                                <th>Content Created</th>
                                <th>Total Submissions</th>
                                <th>Avg. Student Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaders.map((mentor) => (
                                <tr key={mentor.mentorId}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div className="avatar-circle" style={{ background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)' }}>
                                                {mentor.name.charAt(0)}
                                            </div>
                                            <span>{mentor.name}</span>
                                        </div>
                                    </td>
                                    <td>{mentor.studentCount}</td>
                                    <td>{mentor.totalContent} items</td>
                                    <td>{mentor.totalSubmissions}</td>
                                    <td>
                                        <span style={{ fontWeight: 700, color: '#8b5cf6' }}>{mentor.avgStudentScore}%</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function AllSubmissions() {
    const [submissions, setSubmissions] = useState([])
    const [aptitudeSubmissions, setAptitudeSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [activeTab, setActiveTab] = useState('all')
    const [viewReport, setViewReport] = useState(null)
    const [viewAptitudeResult, setViewAptitudeResult] = useState(null)

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE}/submissions`),
            axios.get(`${API_BASE}/aptitude-submissions`)
        ]).then(([codeRes, aptRes]) => {
            const codeSubs = (codeRes.data || []).map(s => ({ ...s, submissionType: 'code' }))
            const aptSubs = (aptRes.data || []).map(s => ({
                ...s,
                submissionType: 'aptitude',
                itemTitle: s.testTitle,
                language: 'Aptitude'
            }))
            setSubmissions(codeSubs)
            setAptitudeSubmissions(aptSubs)
            setLoading(false)
        }).catch(err => setLoading(false))
    }, [])

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
        <div className="animate-fadeIn">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Submission Archives</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Global audit trail of all submissions</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        <button
                            onClick={() => setActiveTab('all')}
                            style={{
                                padding: '0.5rem 1rem',
                                background: activeTab === 'all' ? 'var(--primary)' : 'transparent',
                                border: 'none',
                                color: activeTab === 'all' ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >All ({allSubmissions.length})</button>
                        <button
                            onClick={() => setActiveTab('code')}
                            style={{
                                padding: '0.5rem 1rem',
                                background: activeTab === 'code' ? 'var(--primary)' : 'transparent',
                                border: 'none',
                                color: activeTab === 'code' ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >Code ({submissions.length})</button>
                        <button
                            onClick={() => setActiveTab('aptitude')}
                            style={{
                                padding: '0.5rem 1rem',
                                background: activeTab === 'aptitude' ? '#8b5cf6' : 'transparent',
                                border: 'none',
                                color: activeTab === 'aptitude' ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >Aptitude ({aptitudeSubmissions.length})</button>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search student, problem or status..."
                            style={{ padding: '0.6rem 1rem 0.6rem 2.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'white', width: '300px' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="table-container card">
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
                        {filteredSubmissions.map(sub => (
                            <tr key={sub.id}>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 600 }}>{sub.studentName}</span>
                                    </div>
                                </td>
                                <td>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: sub.submissionType === 'aptitude' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                        color: sub.submissionType === 'aptitude' ? '#8b5cf6' : 'var(--primary)'
                                    }}>
                                        {sub.submissionType === 'aptitude' ? '📝 Aptitude' : '💻 Code'}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ color: 'var(--primary)', fontWeight: 500 }}>{sub.itemTitle || sub.testTitle}</span>
                                    </div>
                                </td>
                                <td><span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>{sub.language?.toUpperCase()}</span></td>
                                <td style={{ fontWeight: 700 }}>{sub.score}%</td>
                                <td><span className={`status-badge ${sub.status}`}>{sub.status}</span></td>
                                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(sub.submittedAt).toLocaleString()}</td>
                                <td>
                                    {sub.submissionType === 'aptitude' ? (
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
                <AdminSubmissionReportModal submission={viewReport} onClose={() => setViewReport(null)} />
            )}

            {/* Aptitude Results Modal */}
            {viewAptitudeResult && (
                <div className="modal-overlay" onClick={() => setViewAptitudeResult(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div className="modal-header">
                            <h2>Aptitude Test Results - {viewAptitudeResult.studentName}</h2>
                            <button onClick={() => setViewAptitudeResult(null)} className="modal-close"><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                <h3 style={{ margin: 0, color: 'var(--primary)' }}>{viewAptitudeResult.testTitle}</h3>
                                <p style={{ color: 'var(--text-muted)' }}>Submitted: {new Date(viewAptitudeResult.submittedAt).toLocaleString()}</p>
                                <div style={{
                                    display: 'inline-block',
                                    padding: '1.5rem 3rem',
                                    borderRadius: '16px',
                                    background: viewAptitudeResult.status === 'passed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    marginTop: '1rem'
                                }}>
                                    <div style={{ fontSize: '3rem', fontWeight: 800, color: viewAptitudeResult.status === 'passed' ? '#10b981' : '#ef4444' }}>
                                        {viewAptitudeResult.score}%
                                    </div>
                                    <div style={{ color: viewAptitudeResult.status === 'passed' ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                        {viewAptitudeResult.status === 'passed' ? '✓ PASSED' : '✗ FAILED'}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                        {viewAptitudeResult.correctCount} / {viewAptitudeResult.totalQuestions} correct
                                    </div>
                                </div>
                            </div>
                            <h4 style={{ marginBottom: '1rem' }}>Question Breakdown</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {viewAptitudeResult.questionResults?.map((q, idx) => (
                                    <div key={idx} style={{
                                        padding: '1rem',
                                        background: q.isCorrect ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                                        border: `1px solid ${q.isCorrect ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                        borderRadius: '12px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                            <span style={{
                                                minWidth: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                background: q.isCorrect ? '#10b981' : '#ef4444',
                                                color: 'white',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.75rem',
                                                fontWeight: 600
                                            }}>{q.isCorrect ? '✓' : '✗'}</span>
                                            <span style={{ fontWeight: 500 }}>{q.question}</span>
                                        </div>
                                        <div style={{ marginLeft: '2rem', fontSize: '0.85rem' }}>
                                            <div><strong>Student answer:</strong> <span style={{ color: q.isCorrect ? '#10b981' : '#ef4444' }}>{q.userAnswer}</span></div>
                                            {!q.isCorrect && <div><strong>Correct answer:</strong> <span style={{ color: '#10b981' }}>{q.correctAnswer}</span></div>}
                                            <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>{q.explanation}</div>
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

// ==================== ADMIN SUBMISSION REPORT MODAL ====================
function AdminSubmissionReportModal({ submission, onClose }) {
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

                    {/* AI Feedback */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle size={18} color="#3b82f6" /> AI Feedback
                        </h4>
                        <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', background: 'rgba(30, 41, 59, 0.5)', padding: '1rem', borderRadius: '0.5rem' }}>
                            {submission.feedback || 'No feedback provided.'}
                        </p>
                    </div>

                    {/* AI Explanation */}
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

                    {/* Detailed Analysis */}
                    {submission.analysis && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <BarChart2 size={18} color="var(--primary)" /> Detailed Analysis
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {submission.analysis.correctness !== undefined && (
                                    <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
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
                                    <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
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
                                    <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
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
                                    <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
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

// ==================== GLOBAL TASKS COMPONENT ====================
function GlobalTasks() {
    const [tasks, setTasks] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
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
        setShowModal(true)
    }

    const fetchTasks = () => {
        axios.get(`${API_BASE}/tasks?mentorId=${ADMIN_ID}`)
            .then(res => {
                setTasks(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }

    useEffect(() => {
        fetchTasks()
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            await axios.post(`${API_BASE}/tasks`, { ...task, mentorId: ADMIN_ID })
            setShowModal(false)
            setTask({
                title: '', type: 'machine_learning', difficulty: 'medium',
                description: '', requirements: '', deadline: ''
            })
            fetchTasks()
        } catch (error) {
            alert('Error creating global task')
        }
    }

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this task?')) {
            try {
                await axios.delete(`${API_BASE}/tasks/${id}`)
                fetchTasks()
            } catch (error) {
                alert('Error deleting task')
            }
        }
    }

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="animate-fadeIn">
            {/* Hero Section */}
            <div className="admin-hero-card glass" style={{
                background: 'var(--bg-card)',
                borderRadius: '1.5rem',
                padding: '2rem',
                marginBottom: '2rem',
                border: '1px solid var(--border-color)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', background: 'radial-gradient(circle, var(--primary-alpha) 0%, transparent 70%)', borderRadius: '50%' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                            <div style={{
                                width: '50px', height: '50px', borderRadius: '1rem',
                                background: 'var(--primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 8px 32px var(--primary-alpha)'
                            }}>
                                <Globe size={24} color="white" />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                    Global Tasks Management
                                </h2>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                                    Create ML/AI tasks visible to all mentors and their students
                                </p>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={() => setShowAIChat(true)}
                            className="btn-create-new premium-btn"
                            style={{
                                padding: '1rem 1.5rem',
                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                borderRadius: '1rem',
                                fontSize: '1rem',
                                fontWeight: 600,
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Sparkles size={20} /> AI Generate
                        </button>
                        <button
                            onClick={() => setShowModal(true)}
                            className="btn-create-new premium-btn"
                            style={{
                                padding: '1rem 2rem',
                                background: 'var(--primary)',
                                borderRadius: '1rem',
                                fontSize: '1rem',
                                fontWeight: 600,
                                transition: 'all 0.3s ease'
                            }}
                        >
                            <Plus size={20} /> Create Manually
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--primary-alpha)', color: 'var(--primary)' }}>
                        <Target size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Tasks</span>
                        <span className="stat-value">{tasks.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--success-alpha)', color: 'var(--success)' }}>
                        <Zap size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Live Tasks</span>
                        <span className="stat-value">{tasks.filter(t => t.status === 'live').length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--secondary-alpha)', color: 'var(--secondary)' }}>
                        <Users size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Completions</span>
                        <span className="stat-value">{tasks.reduce((acc, t) => acc + (t.completedBy?.length || 0), 0)}</span>
                    </div>
                </div>
            </div>

            {/* Tasks Grid */}
            <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
                {tasks.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                        <Globe size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <h3>No Global Tasks Yet</h3>
                        <p>Create your first global task to make it visible to all students!</p>
                    </div>
                ) : (
                    tasks.map(t => (
                        <div key={t.id} className="item-card glass" style={{
                            minHeight: '280px',
                            background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.8))',
                            border: '1px solid rgba(59, 130, 246, 0.1)'
                        }}>
                            <div className="item-card-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                        padding: '10px',
                                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))',
                                        borderRadius: '10px'
                                    }}>
                                        <Globe size={20} color="#3b82f6" />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.65rem', color: '#8b5cf6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>GLOBAL TASK</span>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t.title}</h3>
                                    </div>
                                </div>
                                <span className={`status-badge ${t.status}`}>{t.status}</span>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '1rem' }}>{t.description}</p>

                            {t.requirements && (
                                <div style={{
                                    background: 'rgba(59, 130, 246, 0.05)',
                                    padding: '0.75rem',
                                    borderRadius: '0.5rem',
                                    marginBottom: '1rem',
                                    fontSize: '0.8rem',
                                    color: 'var(--text-muted)'
                                }}>
                                    <strong style={{ color: '#60a5fa' }}>Requirements:</strong><br />
                                    {t.requirements.split('\n').slice(0, 2).join('\n')}...
                                </div>
                            )}

                            <div className="item-card-footer" style={{ paddingTop: '1rem', marginTop: 'auto' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span className={`difficulty-badge ${t.difficulty?.toLowerCase()}`}>{t.difficulty}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {t.completedBy?.length || 0} completed
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleDelete(t.id)}
                                    style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Globe size={20} color="white" />
                                </div>
                                <h2>Create Global Task</h2>
                            </div>
                            <button onClick={() => setShowModal(false)} className="modal-close"><X size={20} /></button>
                        </div>
                        <div className="modal-body premium-form">
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label className="form-label">Task Title</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., Sentiment Analysis Challenge"
                                        value={task.title}
                                        onChange={(e) => setTask({ ...task, title: e.target.value })}
                                        required
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Task Type</label>
                                        <select
                                            value={task.type}
                                            onChange={(e) => setTask({ ...task, type: e.target.value })}
                                        >
                                            <option value="machine_learning">Machine Learning</option>
                                            <option value="deep_learning">Deep Learning</option>
                                            <option value="data_science">Data Science</option>
                                            <option value="nlp">NLP</option>
                                            <option value="computer_vision">Computer Vision</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Difficulty</label>
                                        <select
                                            value={task.difficulty}
                                            onChange={(e) => setTask({ ...task, difficulty: e.target.value })}
                                        >
                                            <option value="easy">Easy</option>
                                            <option value="medium">Medium</option>
                                            <option value="hard">Hard</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea
                                        rows="4"
                                        placeholder="Describe the task in detail..."
                                        value={task.description}
                                        onChange={(e) => setTask({ ...task, description: e.target.value })}
                                        required
                                    ></textarea>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Requirements (one per line)</label>
                                    <textarea
                                        rows="4"
                                        placeholder="1. Data Preprocessing&#10;2. Model Training&#10;3. Evaluation Metrics"
                                        value={task.requirements}
                                        onChange={(e) => setTask({ ...task, requirements: e.target.value })}
                                    ></textarea>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Deadline (Optional)</label>
                                    <input
                                        type="date"
                                        value={task.deadline}
                                        onChange={(e) => setTask({ ...task, deadline: e.target.value })}
                                    />
                                </div>

                                <div className="form-actions">
                                    <button type="button" className="btn-reset" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn-create-new" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
                                        <Globe size={18} /> Create Global Task
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

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

// ==================== GLOBAL PROBLEMS COMPONENT ====================
function GlobalProblems() {
    const [problems, setProblems] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showAIChat, setShowAIChat] = useState(false)
    const [problem, setProblem] = useState({
        title: '',
        type: 'Coding',
        language: 'Python',
        difficulty: 'Medium',
        description: '',
        sampleInput: '',
        expectedOutput: '',
        deadline: '',
        status: 'live'
    })

    // AI Chatbot handler - auto-fills the form
    const handleAIGenerate = (generated) => {
        setProblem({
            title: generated.title || '',
            type: generated.type || 'Coding',
            language: generated.language || 'Python',
            difficulty: generated.difficulty || 'Medium',
            description: generated.description || '',
            sampleInput: generated.sampleInput || '',
            expectedOutput: generated.expectedOutput || '',
            deadline: problem.deadline,
            status: generated.status || 'live'
        })
        setShowAIChat(false)
        setShowModal(true)
    }

    const fetchProblems = () => {
        axios.get(`${API_BASE}/problems?mentorId=${ADMIN_ID}`)
            .then(res => {
                setProblems(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }

    useEffect(() => {
        fetchProblems()
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            await axios.post(`${API_BASE}/problems`, { ...problem, mentorId: ADMIN_ID })
            setShowModal(false)
            setProblem({
                title: '', type: 'Coding', language: 'Python', difficulty: 'Medium',
                description: '', sampleInput: '', expectedOutput: '', deadline: '', status: 'live'
            })
            fetchProblems()
        } catch (error) {
            alert('Error creating global problem')
        }
    }

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this problem?')) {
            try {
                await axios.delete(`${API_BASE}/problems/${id}`)
                fetchProblems()
            } catch (error) {
                alert('Error deleting problem')
            }
        }
    }

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="animate-fadeIn">
            {/* Hero Section */}
            <div className="admin-hero-card glass" style={{
                background: 'var(--bg-card)',
                borderRadius: '1.5rem',
                padding: '2rem',
                marginBottom: '2rem',
                border: '1px solid var(--border-color)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', background: 'radial-gradient(circle, var(--primary-alpha) 0%, transparent 70%)', borderRadius: '50%' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                            <div style={{
                                width: '50px', height: '50px', borderRadius: '1rem',
                                background: 'var(--primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 8px 32px var(--primary-alpha)'
                            }}>
                                <Code size={24} color="white" />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                    Global Problems Management
                                </h2>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                                    Create coding challenges visible to all students platform-wide
                                </p>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={() => setShowAIChat(true)}
                            className="btn-create-new premium-btn"
                            style={{
                                padding: '1rem 1.5rem',
                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                borderRadius: '1rem',
                                fontSize: '1rem',
                                fontWeight: 600,
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Sparkles size={20} /> AI Generate
                        </button>
                        <button
                            onClick={() => setShowModal(true)}
                            className="btn-create-new premium-btn"
                            style={{
                                padding: '1rem 2rem',
                                background: 'var(--primary)',
                                borderRadius: '1rem',
                                fontSize: '1rem',
                                fontWeight: 600,
                                transition: 'all 0.3s ease'
                            }}
                        >
                            <Plus size={20} /> Create Manually
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--primary-alpha)', color: 'var(--primary)' }}>
                        <FileCode size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Problems</span>
                        <span className="stat-value">{problems.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--success-alpha)', color: 'var(--success)' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Active Problems</span>
                        <span className="stat-value">{problems.filter(p => p.status === 'live').length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--warning-alpha)', color: 'var(--warning)' }}>
                        <Trophy size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Solutions</span>
                        <span className="stat-value">{problems.reduce((acc, p) => acc + (p.completedBy?.length || 0), 0)}</span>
                    </div>
                </div>
            </div>

            {/* Problems Grid */}
            <div className="problem-list-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
                {problems.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                        <Code size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <h3>No Global Problems Yet</h3>
                        <p>Create your first global coding problem!</p>
                    </div>
                ) : (
                    problems.map(p => (
                        <div key={p.id} className="problem-card card glass" style={{
                            background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.8))',
                            border: '1px solid rgba(16, 185, 129, 0.1)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2))',
                                        color: '#10b981',
                                        fontWeight: 700
                                    }}>GLOBAL</span>
                                    <span className="problem-badge">{p.type?.toUpperCase()}</span>
                                    <span className={`status-badge ${p.status || 'live'}`} style={{ fontSize: '0.65rem' }}>{p.status || 'Active'}</span>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>{p.language}</span>
                            </div>
                            <h3 style={{ margin: '0.75rem 0', fontSize: '1.2rem' }}>{p.title}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '1rem' }}>
                                {p.description}
                            </p>

                            {p.deadline && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#f87171', marginBottom: '1rem', background: 'rgba(248, 113, 113, 0.05)', padding: '4px 8px', borderRadius: '4px', width: 'fit-content' }}>
                                    <Clock size={12} /> Deadline: {new Date(p.deadline).toLocaleDateString()}
                                </div>
                            )}

                            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        color: p.difficulty === 'Easy' ? '#10b981' : p.difficulty === 'Medium' ? '#f59e0b' : '#ef4444',
                                        fontWeight: 700
                                    }}>
                                        {p.difficulty}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        • {p.completedBy?.length || 0} solved
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleDelete(p.id)}
                                    style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Code size={20} color="white" />
                                </div>
                                <h2>Create Global Coding Problem</h2>
                            </div>
                            <button onClick={() => setShowModal(false)} className="modal-close"><X size={20} /></button>
                        </div>
                        <div className="modal-body premium-form">
                            <form onSubmit={handleSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Problem Title</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Two Sum Problem"
                                            value={problem.title}
                                            onChange={(e) => setProblem({ ...problem, title: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Problem Type</label>
                                        <select
                                            value={problem.type}
                                            onChange={(e) => setProblem({ ...problem, type: e.target.value })}
                                        >
                                            <option value="Coding">Coding</option>
                                            <option value="SQL">SQL</option>
                                            <option value="Algorithm">Algorithm</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Language</label>
                                        <select
                                            value={problem.language}
                                            onChange={(e) => setProblem({ ...problem, language: e.target.value })}
                                        >
                                            <option value="Python">Python</option>
                                            <option value="JavaScript">JavaScript</option>
                                            <option value="Java">Java</option>
                                            <option value="C++">C++</option>
                                            <option value="SQL">SQL</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Difficulty</label>
                                        <select
                                            value={problem.difficulty}
                                            onChange={(e) => setProblem({ ...problem, difficulty: e.target.value })}
                                        >
                                            <option value="Easy">Easy</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Hard">Hard</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select
                                            value={problem.status}
                                            onChange={(e) => setProblem({ ...problem, status: e.target.value })}
                                        >
                                            <option value="live">Live</option>
                                            <option value="draft">Draft</option>
                                            <option value="closed">Closed</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label">Problem Description</label>
                                    <textarea
                                        rows="5"
                                        placeholder="Describe the problem in detail..."
                                        value={problem.description}
                                        onChange={(e) => setProblem({ ...problem, description: e.target.value })}
                                        required
                                    ></textarea>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Sample Input</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., [2, 7, 11, 15], target = 9"
                                            value={problem.sampleInput}
                                            onChange={(e) => setProblem({ ...problem, sampleInput: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Expected Output</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., [0, 1]"
                                            value={problem.expectedOutput}
                                            onChange={(e) => setProblem({ ...problem, expectedOutput: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label">Deadline (Optional)</label>
                                    <input
                                        type="date"
                                        value={problem.deadline}
                                        onChange={(e) => setProblem({ ...problem, deadline: e.target.value })}
                                    />
                                </div>

                                <div className="form-actions">
                                    <button type="button" className="btn-reset" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn-create-new" style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>
                                        <Plus size={18} /> Create Global Problem
                                    </button>
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

// ==================== APTITUDE TESTS ADMIN ====================
function AptitudeTestsAdmin() {
    const [tests, setTests] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showQuestionsModal, setShowQuestionsModal] = useState(false)
    const [selectedTest, setSelectedTest] = useState(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [generatedQuestions, setGeneratedQuestions] = useState([])
    const [aiPrompt, setAiPrompt] = useState({ topic: '', difficulty: 'Medium', count: 5 })
    const [submissions, setSubmissions] = useState([])

    const [newTest, setNewTest] = useState({
        title: '',
        difficulty: 'Medium',
        duration: 30,
        passingScore: 60,
        maxTabSwitches: 3,
        maxAttempts: 1,
        deadline: '',
        description: '',
        status: 'live',
        questions: []
    })
    const [manualQuestion, setManualQuestion] = useState({
        question: '',
        options: ['', '', '', ''],
        correctAnswer: 0,
        category: 'general',
        explanation: ''
    })

    useEffect(() => {
        fetchTests()
        fetchSubmissions()
    }, [])

    const fetchTests = async () => {
        try {
            const response = await axios.get(`${API_BASE}/aptitude`)
            setTests(response.data)
            setLoading(false)
        } catch (error) {
            console.error('Error fetching tests:', error)
            setLoading(false)
        }
    }

    const fetchSubmissions = async () => {
        try {
            const response = await axios.get(`${API_BASE}/aptitude-submissions`)
            setSubmissions(response.data)
        } catch (error) {
            console.error('Error fetching submissions:', error)
        }
    }

    const handleGenerateQuestions = async () => {
        setIsGenerating(true)
        try {
            const response = await axios.post(`${API_BASE}/ai/generate-aptitude`, aiPrompt)
            if (response.data.questions) {
                setGeneratedQuestions(response.data.questions)
            }
        } catch (error) {
            alert('Error generating questions')
        } finally {
            setIsGenerating(false)
        }
    }

    const addGeneratedQuestions = () => {
        setNewTest(prev => ({
            ...prev,
            questions: [...prev.questions, ...generatedQuestions]
        }))
        setGeneratedQuestions([])
    }

    const handleCreateTest = async (e) => {
        e.preventDefault()
        if (newTest.questions.length === 0) {
            alert('Please add at least one question')
            return
        }
        // Validate all questions have content
        const invalidQuestions = newTest.questions.filter(q => 
            !q.question.trim() || q.options.some(opt => !opt.trim())
        )
        if (invalidQuestions.length > 0) {
            alert('Please fill in all questions and options')
            return
        }
        try {
            await axios.post(`${API_BASE}/aptitude`, {
                ...newTest,
                createdBy: ADMIN_ID
            })
            setShowModal(false)
            setNewTest({
                title: '',
                difficulty: 'Medium',
                duration: 30,
                passingScore: 60,
                maxTabSwitches: 3,
                maxAttempts: 1,
                deadline: '',
                description: '',
                status: 'live',
                questions: []
            })
            fetchTests()
        } catch (error) {
            alert('Error creating test')
        }
    }

    const handleDeleteTest = async (id) => {
        if (window.confirm('Delete this aptitude test?')) {
            try {
                await axios.delete(`${API_BASE}/aptitude/${id}`)
                fetchTests()
            } catch (error) {
                alert('Error deleting test')
            }
        }
    }

    const removeQuestion = (index) => {
        setNewTest(prev => ({
            ...prev,
            questions: prev.questions.filter((_, i) => i !== index)
        }))
    }

    if (loading) return <div className="loading-spinner"></div>

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
                        <Target size={28} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                            Aptitude Tests
                        </h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                            Create and manage aptitude tests for students
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="btn-create-new premium-btn"
                    style={{
                        padding: '1rem 2rem',
                        background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                        borderRadius: '1rem',
                        fontSize: '1rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <Plus size={20} /> Create New Test
                </button>
            </div>

            {/* Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                        <Target size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Tests</span>
                        <span className="stat-value">{tests.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Live Tests</span>
                        <span className="stat-value">{tests.filter(t => t.status === 'live').length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                        <Send size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Submissions</span>
                        <span className="stat-value">{submissions.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                        <Trophy size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Pass Rate</span>
                        <span className="stat-value">
                            {submissions.length > 0
                                ? Math.round((submissions.filter(s => s.status === 'passed').length / submissions.length) * 100)
                                : 0}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Tests Table */}
            <div className="card glass">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <Target size={20} style={{ color: '#8b5cf6' }} /> All Aptitude Tests
                </h3>
                <div className="table-container" style={{ border: 'none' }}>
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th>Test Title</th>
                                <th>Difficulty</th>
                                <th>Questions</th>
                                <th>Duration</th>
                                <th>Pass %</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tests.map(test => (
                                <tr key={test.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '8px',
                                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <Target size={16} color="white" />
                                            </div>
                                            <span style={{ fontWeight: 500 }}>{test.title}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`difficulty-badge ${test.difficulty?.toLowerCase()}`}>
                                            {test.difficulty}
                                        </span>
                                    </td>
                                    <td>{test.questionCount || test.totalQuestions}</td>
                                    <td>{test.duration} min</td>
                                    <td>{test.passingScore}%</td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '20px',
                                            background: test.status === 'live'
                                                ? 'rgba(16, 185, 129, 0.15)'
                                                : 'rgba(107, 114, 128, 0.15)',
                                            color: test.status === 'live' ? '#10b981' : '#6b7280',
                                            fontSize: '0.8rem',
                                            fontWeight: 500
                                        }}>
                                            {test.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => {
                                                    setSelectedTest(test)
                                                    setShowQuestionsModal(true)
                                                }}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                                    borderRadius: '6px',
                                                    color: '#3b82f6',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                View
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTest(test.id)}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    borderRadius: '6px',
                                                    color: '#ef4444',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Test Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}
                    >
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Target size={20} color="white" />
                                </div>
                                <h2>Create Aptitude Test</h2>
                            </div>
                            <button onClick={() => setShowModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateTest} className="modal-body">
                            {/* Test Details */}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label"><span style={{ marginRight: '0.5rem' }}>H</span> Test Title</label>
                                    <input
                                        type="text"
                                        placeholder="Enter test title..."
                                        value={newTest.title}
                                        onChange={e => setNewTest({ ...newTest, title: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><Clock size={14} style={{ marginRight: '0.5rem' }} /> Duration (mins)</label>
                                    <input
                                        type="number"
                                        min="5"
                                        max="180"
                                        value={newTest.duration}
                                        onChange={e => setNewTest({ ...newTest, duration: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><RefreshCw size={14} style={{ marginRight: '0.5rem' }} /> Attempts</label>
                                    <select
                                        value={newTest.maxAttempts}
                                        onChange={e => setNewTest({ ...newTest, maxAttempts: parseInt(e.target.value) })}
                                    >
                                        <option value={1}>1 Attempt</option>
                                        <option value={2}>2 Attempts</option>
                                        <option value={3}>3 Attempts</option>
                                        <option value={5}>5 Attempts</option>
                                        <option value={-1}>Unlimited</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label"><AlertTriangle size={14} style={{ marginRight: '0.5rem' }} /> Max Tab Switches (Violations)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={newTest.maxTabSwitches}
                                        onChange={e => setNewTest({ ...newTest, maxTabSwitches: parseInt(e.target.value) })}
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Test auto-submits if exceeded</small>
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><Calendar size={14} style={{ marginRight: '0.5rem' }} /> End Time (Deadline)</label>
                                    <input
                                        type="datetime-local"
                                        value={newTest.deadline}
                                        onChange={e => setNewTest({ ...newTest, deadline: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Difficulty</label>
                                    <select
                                        value={newTest.difficulty}
                                        onChange={e => setNewTest({ ...newTest, difficulty: e.target.value })}
                                    >
                                        <option value="Easy">Easy</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Hard">Hard</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Passing Score (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={newTest.passingScore}
                                        onChange={e => setNewTest({ ...newTest, passingScore: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label className="form-label"><FileText size={14} style={{ marginRight: '0.5rem' }} /> Description (Optional)</label>
                                <textarea
                                    placeholder="Brief description of the test..."
                                    value={newTest.description}
                                    onChange={e => setNewTest({ ...newTest, description: e.target.value })}
                                    rows={3}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>

                            {/* AI Question Generation */}
                            <div style={{
                                background: 'var(--secondary-alpha)',
                                border: '1px solid var(--secondary)',
                                borderRadius: '12px',
                                padding: '1.5rem',
                                marginBottom: '1.5rem'
                            }}>
                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem', color: 'var(--text-primary)' }}>
                                    <Sparkles size={18} color="var(--secondary)" /> AI Question Generator
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">TOPIC</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Number Series, Logical Reasoning..."
                                            value={aiPrompt.topic}
                                            onChange={e => setAiPrompt({ ...aiPrompt, topic: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">DIFFICULTY</label>
                                        <select
                                            value={aiPrompt.difficulty}
                                            onChange={e => setAiPrompt({ ...aiPrompt, difficulty: e.target.value })}
                                        >
                                            <option value="Easy">Easy</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Hard">Hard</option>
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">COUNT</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={aiPrompt.count}
                                            onChange={e => setAiPrompt({ ...aiPrompt, count: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleGenerateQuestions}
                                        disabled={isGenerating}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            background: 'var(--primary)',
                                            border: 'none',
                                            borderRadius: '8px',
                                            color: 'white',
                                            fontWeight: 600,
                                            cursor: isGenerating ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        <Sparkles size={16} />
                                        {isGenerating ? 'Generating...' : 'Generate'}
                                    </button>
                                </div>

                                {/* Generated Questions Preview */}
                                {generatedQuestions.length > 0 && (
                                    <div style={{ marginTop: '1rem' }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '0.5rem'
                                        }}>
                                            <span style={{ fontSize: '0.9rem', color: 'var(--secondary)', fontWeight: 600 }}>
                                                ✨ Generated {generatedQuestions.length} questions
                                            </span>
                                            <button
                                                type="button"
                                                onClick={addGeneratedQuestions}
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    background: 'var(--success-alpha)',
                                                    border: '1px solid var(--success)',
                                                    borderRadius: '6px',
                                                    color: 'var(--success)',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Add All to Test
                                            </button>
                                        </div>
                                        <div style={{
                                            maxHeight: '150px',
                                            overflowY: 'auto',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '8px',
                                            padding: '0.75rem'
                                        }}>
                                            {generatedQuestions.map((q, idx) => (
                                                <div key={idx} style={{
                                                    padding: '0.5rem',
                                                    borderBottom: idx < generatedQuestions.length - 1 ? '1px solid var(--border-color)' : 'none',
                                                    fontSize: '0.85rem',
                                                    color: 'var(--text-primary)'
                                                }}>
                                                    Q{idx + 1}: {q.question.substring(0, 80)}...
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Questions Section */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    marginBottom: '1.25rem',
                                    paddingBottom: '0.75rem',
                                    borderBottom: '1px solid var(--border-color)'
                                }}>
                                    <h4 style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.5rem', 
                                        margin: 0, 
                                        color: 'var(--text-primary)',
                                        fontSize: '1rem',
                                        fontWeight: 600
                                    }}>
                                        <HelpCircle size={18} style={{ color: 'var(--primary)' }} /> Questions
                                    </h4>
                                    <span style={{ 
                                        fontSize: '0.8rem', 
                                        color: 'var(--primary)',
                                        background: 'var(--primary-alpha)',
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '20px',
                                        fontWeight: 500
                                    }}>
                                        {newTest.questions.length} question{newTest.questions.length !== 1 ? 's' : ''}
                                    </span>
                                </div>

                                {/* Questions List - Each as editable card */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {newTest.questions.map((q, idx) => (
                                        <div key={idx} style={{
                                            background: 'var(--bg-card)',
                                            borderRadius: '16px',
                                            padding: '1.5rem',
                                            border: '1px solid var(--border-color)',
                                            boxShadow: 'var(--card-shadow)',
                                            transition: 'all 0.2s ease'
                                        }}>
                                            {/* Question Header */}
                                            <div style={{ 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                alignItems: 'center', 
                                                marginBottom: '1.25rem'
                                            }}>
                                                <div style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '0.75rem' 
                                                }}>
                                                    <span style={{
                                                        background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                                                        color: 'white',
                                                        padding: '0.4rem 0.8rem',
                                                        borderRadius: '8px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        letterSpacing: '0.5px',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        Q{idx + 1}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeQuestion(idx)}
                                                    style={{
                                                        background: 'var(--danger-alpha)',
                                                        border: '1px solid var(--danger)',
                                                        borderRadius: '8px',
                                                        padding: '0.5rem',
                                                        cursor: 'pointer',
                                                        color: 'var(--danger)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseOver={e => {
                                                        e.currentTarget.style.background = 'var(--danger)';
                                                        e.currentTarget.style.color = 'white';
                                                    }}
                                                    onMouseOut={e => {
                                                        e.currentTarget.style.background = 'var(--danger-alpha)';
                                                        e.currentTarget.style.color = 'var(--danger)';
                                                    }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>

                                            {/* Question Input */}
                                            <div style={{ marginBottom: '1.25rem' }}>
                                                <label style={{ 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: 600, 
                                                    color: 'var(--text-muted)', 
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    marginBottom: '0.5rem',
                                                    display: 'block'
                                                }}>
                                                    Question Text
                                                </label>
                                                <input
                                                    type="text"
                                                    value={q.question}
                                                    onChange={e => {
                                                        const updated = [...newTest.questions];
                                                        updated[idx] = { ...updated[idx], question: e.target.value };
                                                        setNewTest({ ...newTest, questions: updated });
                                                    }}
                                                    placeholder="Enter your question here..."
                                                    style={{ 
                                                        width: '100%',
                                                        padding: '0.875rem 1rem',
                                                        fontSize: '0.95rem',
                                                        borderRadius: '10px',
                                                        border: '2px solid var(--border-color)',
                                                        background: 'var(--bg-primary)',
                                                        color: 'var(--text-primary)',
                                                        transition: 'border-color 0.2s'
                                                    }}
                                                />
                                            </div>

                                            {/* Options Grid */}
                                            <div style={{ marginBottom: '1.25rem' }}>
                                                <label style={{ 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: 600, 
                                                    color: 'var(--text-muted)', 
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    marginBottom: '0.75rem',
                                                    display: 'block'
                                                }}>
                                                    Answer Options
                                                </label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                                                    {['A', 'B', 'C', 'D'].map((letter, optIdx) => (
                                                        <div 
                                                            key={optIdx} 
                                                            style={{ 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: '0.75rem',
                                                                background: q.correctAnswer === optIdx ? 'var(--success-alpha)' : 'var(--bg-primary)',
                                                                padding: '0.5rem',
                                                                borderRadius: '10px',
                                                                border: q.correctAnswer === optIdx ? '2px solid var(--success)' : '2px solid var(--border-color)',
                                                                transition: 'all 0.2s'
                                                            }}
                                                        >
                                                            <span 
                                                                onClick={() => {
                                                                    const updated = [...newTest.questions];
                                                                    updated[idx] = { ...updated[idx], correctAnswer: optIdx };
                                                                    setNewTest({ ...newTest, questions: updated });
                                                                }}
                                                                style={{
                                                                    width: '32px',
                                                                    height: '32px',
                                                                    borderRadius: '8px',
                                                                    background: q.correctAnswer === optIdx 
                                                                        ? 'var(--success)' 
                                                                        : 'var(--bg-tertiary)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontWeight: 700,
                                                                    fontSize: '0.85rem',
                                                                    color: q.correctAnswer === optIdx ? 'white' : 'var(--text-muted)',
                                                                    flexShrink: 0,
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                    border: q.correctAnswer === optIdx ? 'none' : '1px solid var(--border-color)'
                                                                }}
                                                                title="Click to set as correct answer"
                                                            >{letter}</span>
                                                            <input
                                                                type="text"
                                                                value={q.options[optIdx] || ''}
                                                                onChange={e => {
                                                                    const updated = [...newTest.questions];
                                                                    const newOptions = [...updated[idx].options];
                                                                    newOptions[optIdx] = e.target.value;
                                                                    updated[idx] = { ...updated[idx], options: newOptions };
                                                                    setNewTest({ ...newTest, questions: updated });
                                                                }}
                                                                placeholder={`Option ${letter}`}
                                                                style={{ 
                                                                    flex: 1,
                                                                    padding: '0.625rem 0.875rem',
                                                                    borderRadius: '8px',
                                                                    border: 'none',
                                                                    background: 'transparent',
                                                                    color: 'var(--text-primary)',
                                                                    fontSize: '0.9rem'
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Correct Answer Indicator */}
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '0.75rem',
                                                padding: '0.875rem 1rem',
                                                background: 'var(--success-alpha)',
                                                borderRadius: '10px',
                                                border: '1px solid var(--success)'
                                            }}>
                                                <CheckCircle size={18} color="var(--success)" />
                                                <span style={{ 
                                                    fontSize: '0.875rem', 
                                                    fontWeight: 500, 
                                                    color: 'var(--text-primary)' 
                                                }}>
                                                    Correct Answer:
                                                </span>
                                                <span style={{
                                                    background: 'var(--success)',
                                                    color: 'white',
                                                    padding: '0.375rem 0.875rem',
                                                    borderRadius: '6px',
                                                    fontWeight: 600,
                                                    fontSize: '0.85rem'
                                                }}>
                                                    Option {['A', 'B', 'C', 'D'][q.correctAnswer]}
                                                </span>
                                                <span style={{ 
                                                    marginLeft: 'auto', 
                                                    fontSize: '0.75rem', 
                                                    color: 'var(--text-muted)' 
                                                }}>
                                                    Click any option badge to change
                                                </span>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Add New Question Button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewTest(prev => ({
                                                ...prev,
                                                questions: [...prev.questions, {
                                                    question: '',
                                                    options: ['', '', '', ''],
                                                    correctAnswer: 0,
                                                    category: 'general',
                                                    explanation: ''
                                                }]
                                            }));
                                        }}
                                        style={{
                                            padding: '1.25rem',
                                            background: 'var(--bg-card)',
                                            border: '2px dashed var(--border-color)',
                                            borderRadius: '16px',
                                            color: 'var(--text-muted)',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.75rem',
                                            transition: 'all 0.2s',
                                            fontSize: '0.95rem'
                                        }}
                                        onMouseOver={e => {
                                            e.currentTarget.style.borderColor = 'var(--primary)';
                                            e.currentTarget.style.color = 'var(--primary)';
                                            e.currentTarget.style.background = 'var(--primary-alpha)';
                                        }}
                                        onMouseOut={e => {
                                            e.currentTarget.style.borderColor = 'var(--border-color)';
                                            e.currentTarget.style.color = 'var(--text-muted)';
                                            e.currentTarget.style.background = 'var(--bg-card)';
                                        }}
                                    >
                                        <Plus size={20} /> Add New Question
                                    </button>
                                </div>
                            </div>

                            <div className="form-actions" style={{ 
                                borderTop: '1px solid var(--border-color)', 
                                paddingTop: '1.5rem',
                                marginTop: '0.5rem'
                            }}>
                                <button type="button" className="btn-reset" onClick={() => setShowModal(false)}>
                                    <X size={16} /> Cancel
                                </button>
                                <button type="submit" className="btn-create-new" disabled={newTest.questions.length === 0}>
                                    <Save size={16} /> Create Test
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Questions Modal */}
            {showQuestionsModal && selectedTest && (
                <div className="modal-overlay" onClick={() => setShowQuestionsModal(false)}>
                    <div
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto' }}
                    >
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Target size={20} color="white" />
                                </div>
                                <h2>{selectedTest.title}</h2>
                            </div>
                            <button onClick={() => setShowQuestionsModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                                {selectedTest.questionCount || selectedTest.totalQuestions} Questions • {selectedTest.duration} minutes • Pass: {selectedTest.passingScore}%
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {selectedTest.questions?.map((q, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            background: 'rgba(15, 23, 42, 0.5)',
                                            borderRadius: '12px',
                                            padding: '1.25rem'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '0.75rem',
                                            marginBottom: '0.75rem'
                                        }}>
                                            <span style={{
                                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                                color: 'white',
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600
                                            }}>
                                                Q{idx + 1}
                                            </span>
                                            <span style={{ fontWeight: 500 }}>{q.question}</span>
                                        </div>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 1fr',
                                            gap: '0.5rem',
                                            marginLeft: '2.5rem'
                                        }}>
                                            {q.options?.map((opt, optIdx) => (
                                                <div
                                                    key={optIdx}
                                                    style={{
                                                        padding: '0.5rem 0.75rem',
                                                        background: opt === q.correctAnswer
                                                            ? 'rgba(16, 185, 129, 0.2)'
                                                            : 'rgba(71, 85, 105, 0.3)',
                                                        borderRadius: '8px',
                                                        fontSize: '0.85rem',
                                                        border: opt === q.correctAnswer
                                                            ? '1px solid #10b981'
                                                            : '1px solid transparent'
                                                    }}
                                                >
                                                    {['A', 'B', 'C', 'D'][optIdx]}. {opt}
                                                </div>
                                            ))}
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

export default AdminPortal

