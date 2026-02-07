import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Trophy, Award, List, Search, Send, Activity, CheckCircle, TrendingUp, Clock, Globe, FileCode, Plus, X, Code, ChevronRight, Upload, AlertTriangle, Zap, Target, Sparkles, Bot, Wand2, Eye, FileText, BarChart2, RefreshCw, Calendar, HelpCircle, Trash2, Save, Brain, XCircle, Shield, Download, ClipboardList, Settings } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts'
import DashboardLayout from '../components/DashboardLayout'
import { AIChatbot, AIFloatingButton } from '../components/AIChatbot'
import AptitudeReportModal from '../components/AptitudeReportModal'
import StudentReportModal from '../components/StudentReportModal'
import TestCasesManager from '../components/TestCasesManager'
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
    const [selectedPeriod, setSelectedPeriod] = useState('7d')

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

    // Calculate additional metrics
    const avgSubmissionsPerStudent = stats.totalStudents > 0
        ? Math.round(stats.totalSubmissions / stats.totalStudents * 10) / 10
        : 0
    const totalMentors = stats.mentorCount || Math.ceil(stats.totalStudents / 15)
    const activeToday = stats.recentSubmissions?.length || 0

    return (
        <div className="animate-fadeIn">
            {/* Welcome Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 50%, rgba(6, 182, 212, 0.05) 100%)',
                borderRadius: '20px',
                padding: '2rem 2.5rem',
                marginBottom: '2rem',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{
                    position: 'absolute',
                    top: '-50%',
                    right: '-10%',
                    width: '400px',
                    height: '400px',
                    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
                    pointerEvents: 'none'
                }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)'
                        }}>
                            <Shield size={24} color="white" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                Admin Control Center
                            </h1>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Monitor performance, manage content, and track platform health
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Stats Grid - 6 Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                {/* Total Students */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(59, 130, 246, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                        }}>
                            <Users size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{stats.totalStudents}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Students</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.35rem 0.75rem',
                        background: 'rgba(16, 185, 129, 0.1)',
                        borderRadius: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#10b981'
                    }}>
                        <TrendingUp size={12} /> +12% this month
                    </div>
                </div>

                {/* Total Mentors */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(139, 92, 246, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                        }}>
                            <Award size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{totalMentors}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Mentors</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)'
                    }}>
                        ~{Math.round(stats.totalStudents / totalMentors)} students/mentor
                    </div>
                </div>

                {/* Submissions */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(6, 182, 212, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #0891b2, #06b6d4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)'
                        }}>
                            <Send size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{stats.totalSubmissions}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Submissions</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)'
                    }}>
                        {avgSubmissionsPerStudent} avg per student
                    </div>
                </div>

                {/* Success Rate */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(16, 185, 129, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #047857, #10b981)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                        }}>
                            <CheckCircle size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{stats.successRate}%</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Success Rate</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        height: '6px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        borderRadius: '3px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${stats.successRate}%`,
                            background: 'linear-gradient(90deg, #10b981, #06b6d4)',
                            borderRadius: '3px',
                            transition: 'width 1s ease'
                        }} />
                    </div>
                </div>

                {/* Total Content */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(245, 158, 11, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                        }}>
                            <FileCode size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{stats.totalContent}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Content</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)'
                    }}>
                        Tasks, Problems & Tests
                    </div>
                </div>

                {/* Active Today */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(236, 72, 153, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #be185d, #ec4899)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)'
                        }}>
                            <Zap size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{activeToday}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Today</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.35rem 0.75rem',
                        background: 'rgba(236, 72, 153, 0.1)',
                        borderRadius: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#ec4899'
                    }}>
                        <Activity size={12} /> Live
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '1.5rem',
                marginBottom: '2rem'
            }}>
                {/* Submission Trends Chart */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    padding: '1.5rem',
                    position: 'relative'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Submission Trends</h3>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Platform activity over time</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {['7d', '30d', '90d'].map(period => (
                                <button
                                    key={period}
                                    onClick={() => setSelectedPeriod(period)}
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        background: selectedPeriod === period ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'var(--bg-tertiary)',
                                        color: selectedPeriod === period ? 'white' : 'var(--text-muted)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {period}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ width: '100%', height: '280px' }}>
                        <ResponsiveContainer>
                            <AreaChart data={stats.submissionTrends}>
                                <defs>
                                    <linearGradient id="colorCountAdmin" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} axisLine={false} tickLine={false} />
                                <YAxis stroke="var(--text-muted)" fontSize={11} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
                                    }}
                                    labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
                                    itemStyle={{ color: '#3b82f6' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCountAdmin)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Language Distribution */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    padding: '1.5rem'
                }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Language Distribution</h3>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Code submissions by language</p>
                    </div>
                    <div style={{ width: '100%', height: '200px' }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={stats.languageStats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={80}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {stats.languageStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px'
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.75rem',
                        marginTop: '1rem'
                    }}>
                        {stats.languageStats.map((entry, index) => (
                            <div key={entry.name} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.8rem'
                            }}>
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '3px',
                                    background: COLORS[index % COLORS.length]
                                }} />
                                <span style={{ color: 'var(--text-muted)' }}>{entry.name}</span>
                                <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{entry.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Section - Activity & Leaderboard */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr',
                gap: '1.5rem'
            }}>
                {/* Recent Activity */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    padding: '1.5rem',
                    maxHeight: '420px',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Activity size={18} color="white" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Recent Activity</h3>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Live platform submissions</p>
                            </div>
                        </div>
                        <button style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}>
                            <RefreshCw size={12} /> Refresh
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {stats.recentSubmissions.map((sub, index) => (
                            <div key={sub.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '1rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                                transition: 'all 0.2s ease'
                            }}>
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: sub.status === 'accepted' ? '#10b981' : '#ef4444',
                                    boxShadow: `0 0 12px ${sub.status === 'accepted' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`
                                }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{sub.studentName}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                        <Clock size={11} />
                                        {new Date(sub.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        <span style={{ opacity: 0.5 }}>•</span>
                                        <span>submitted a solution</span>
                                    </div>
                                </div>
                                <div style={{
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    background: sub.status === 'accepted' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: sub.status === 'accepted' ? '#10b981' : '#ef4444'
                                }}>
                                    {sub.score}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Performers */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    padding: '1.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Trophy size={18} color="white" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Top Performers</h3>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leading students</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {stats.studentPerformance.slice(0, 5).map((student, i) => (
                            <div key={student.name} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '1rem',
                                background: i === 0 ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05))' : 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                border: `1px solid ${i === 0 ? 'rgba(251, 191, 36, 0.3)' : 'var(--border-color)'}`
                            }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: i === 0 ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : i === 1 ? 'linear-gradient(135deg, #94a3b8, #64748b)' : i === 2 ? 'linear-gradient(135deg, #d97706, #b45309)' : 'var(--bg-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    color: i < 3 ? 'white' : 'var(--text-muted)'
                                }}>
                                    {i < 3 ? <Trophy size={14} /> : `#${i + 1}`}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{student.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{student.count} submissions</div>
                                </div>
                                <div style={{
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    color: student.score >= 80 ? '#10b981' : student.score >= 60 ? '#f59e0b' : '#ef4444'
                                }}>
                                    {student.score}%
                                </div>
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
                                <div className="table-container" style={{ marginTop: '1.5rem', background: 'var(--bg-tertiary)', borderRadius: '0.75rem' }}>
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
    const [reportStudent, setReportStudent] = useState(null)

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
                                <th>Violations</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaders.map((student, i) => {
                                const totalViolations = getTotalViolations(student)
                                const hasIssues = totalViolations > 0 || student.violations?.plagiarism > 0

                                return (
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
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                {student.violations?.tabSwitches > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(245, 158, 11, 0.15)',
                                                        color: '#f59e0b',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Tab Switches">
                                                        <Eye size={10} /> {student.violations.tabSwitches}
                                                    </span>
                                                )}
                                                {student.violations?.cameraBlocked > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                        color: '#ef4444',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Camera Blocked">
                                                        📷 {student.violations.cameraBlocked}
                                                    </span>
                                                )}
                                                {student.violations?.phoneDetection > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                        color: '#ef4444',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Phone Detected">
                                                        📱 {student.violations.phoneDetection}
                                                    </span>
                                                )}
                                                {student.violations?.copyPaste > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(245, 158, 11, 0.15)',
                                                        color: '#f59e0b',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Copy/Paste Attempts">
                                                        📋 {student.violations.copyPaste}
                                                    </span>
                                                )}
                                                {student.violations?.plagiarism > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                        color: '#ef4444',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Plagiarism">
                                                        <AlertTriangle size={10} /> {student.violations.plagiarism}
                                                    </span>
                                                )}
                                                {!hasIssues && (
                                                    <span style={{ fontSize: '0.75rem', color: '#10b981' }}>
                                                        <CheckCircle size={14} />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ width: '100px', height: '8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px', overflow: 'hidden' }}>
                                                <div style={{ width: `${student.avgScore}%`, height: '100%', background: hasIssues ? 'var(--warning)' : 'var(--primary)' }}></div>
                                            </div>
                                        </td>
                                        <td>
                                            <button
                                                onClick={() => setReportStudent({ id: student.studentId, name: student.name })}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem',
                                                    padding: '0.5rem 0.85rem',
                                                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    color: 'white',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
                                                }}
                                                title="Generate comprehensive report"
                                            >
                                                <FileText size={14} />
                                                Report
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Student Report Modal */}
            {reportStudent && (
                <StudentReportModal
                    studentId={reportStudent.id}
                    studentName={reportStudent.name}
                    onClose={() => setReportStudent(null)}
                    requestedBy="Administrator"
                    requestedByRole="admin"
                />
            )}
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
    const [resetting, setResetting] = useState(false)

    const fetchSubmissions = () => {
        setLoading(true)
        Promise.all([
            axios.get(`${API_BASE}/submissions`),
            axios.get(`${API_BASE}/aptitude-submissions`)
        ]).then(([codeRes, aptRes]) => {
            const codeSubs = (codeRes.data || []).map(s => ({ ...s, subType: 'code' }))
            const aptSubs = (aptRes.data || []).map(s => ({
                ...s,
                subType: 'aptitude',
                itemTitle: s.testTitle,
                language: 'Aptitude'
            }))
            setSubmissions(codeSubs)
            setAptitudeSubmissions(aptSubs)
            setLoading(false)
        }).catch(err => setLoading(false))
    }

    useEffect(() => {
        fetchSubmissions()
    }, [])

    // Download CSV functionality
    const downloadCSV = () => {
        const dataToExport = getFilteredSubmissions()

        if (dataToExport.length === 0) {
            alert('No submissions to download')
            return
        }

        // CSV headers
        const headers = [
            'Student Name',
            'Student Email',
            'Type',
            'Problem/Test Title',
            'Language',
            'Score',
            'Status',
            'Tab Switches',
            'Camera Blocked',
            'Phone Detected',
            'Plagiarism Detected',
            'Submitted At'
        ]

        // Convert data to CSV rows
        const rows = dataToExport.map(sub => [
            sub.studentName || '',
            sub.studentEmail || '',
            sub.subType === 'aptitude' ? 'Aptitude' : 'Code',
            sub.itemTitle || sub.testTitle || '',
            sub.subType === 'aptitude' ? 'N/A' : (sub.language || 'N/A'),
            sub.score || 0,
            sub.status || '',
            sub.integrity?.tabSwitches || sub.tabSwitches || 0,
            sub.cameraBlockedCount || 0,
            sub.phoneDetectionCount || 0,
            sub.plagiarism?.detected ? 'Yes' : 'No',
            sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : ''
        ])

        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => {
                // Escape quotes and wrap in quotes if contains comma or quotes
                const cellStr = String(cell)
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`
                }
                return cellStr
            }).join(','))
        ].join('\n')

        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `submissions_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleResetAllSubmissions = async () => {
        const confirmReset = window.confirm(
            '⚠️ WARNING: This will permanently delete ALL submissions from ALL students!\n\n' +
            'This includes:\n' +
            '• All code submissions\n' +
            '• All aptitude test submissions\n' +
            '• All problem completions\n' +
            '• All task completions\n\n' +
            'This action CANNOT be undone. Are you sure?'
        )

        if (!confirmReset) return

        // Double confirmation for safety
        const doubleConfirm = window.confirm(
            '🚨 FINAL CONFIRMATION 🚨\n\n' +
            'You are about to delete ALL submissions permanently.\n\n' +
            'Type OK to proceed.'
        )

        if (!doubleConfirm) return

        setResetting(true)
        try {
            const response = await axios.delete(`${API_BASE}/submissions`)
            alert(`✅ Reset Complete!\n\n` +
                `• Code submissions deleted: ${response.data.deletedCodeSubmissions}\n` +
                `• Aptitude submissions deleted: ${response.data.deletedAptitudeSubmissions}`)
            fetchSubmissions() // Refresh the list
        } catch (err) {
            alert('❌ Failed to reset submissions: ' + (err.response?.data?.error || err.message))
        } finally {
            setResetting(false)
        }
    }

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
                        >💻 Code ({submissions.length})</button>
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
                        >📝 Aptitude ({aptitudeSubmissions.length})</button>
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
                    <button
                        onClick={downloadCSV}
                        disabled={filteredSubmissions.length === 0}
                        style={{
                            padding: '0.6rem 1rem',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '8px',
                            color: '#10b981',
                            cursor: filteredSubmissions.length === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            opacity: filteredSubmissions.length === 0 ? 0.5 : 1,
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            if (filteredSubmissions.length > 0) {
                                e.target.style.background = 'rgba(16, 185, 129, 0.2)'
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'rgba(16, 185, 129, 0.1)'
                        }}
                    >
                        <Download size={16} />
                        Download CSV
                    </button>
                    <button
                        onClick={handleResetAllSubmissions}
                        disabled={resetting || allSubmissions.length === 0}
                        style={{
                            padding: '0.6rem 1rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            color: '#ef4444',
                            cursor: resetting || allSubmissions.length === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            opacity: resetting || allSubmissions.length === 0 ? 0.5 : 1,
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            if (!resetting && allSubmissions.length > 0) {
                                e.target.style.background = 'rgba(239, 68, 68, 0.2)'
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'rgba(239, 68, 68, 0.1)'
                        }}
                    >
                        <Trash2 size={16} />
                        {resetting ? 'Resetting...' : 'Reset All'}
                    </button>
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
                                <td>
                                    <div style={{ fontWeight: 600 }}>{sub.studentName}</div>
                                </td>
                                <td>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: sub.subType === 'aptitude' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                        color: sub.subType === 'aptitude' ? '#8b5cf6' : 'var(--primary)'
                                    }}>
                                        {sub.subType === 'aptitude' ? '📝 Aptitude' : '💻 Code'}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ color: 'var(--primary)', fontWeight: 500 }}>{sub.itemTitle || sub.testTitle}</div>
                                </td>
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
                <AdminSubmissionReportModal submission={viewReport} onClose={() => setViewReport(null)} />
            )}

            {/* Aptitude Results Modal */}
            {viewAptitudeResult && (
                <AptitudeReportModal submission={viewAptitudeResult} onClose={() => setViewAptitudeResult(null)} />
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
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)'
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
    const [activeTab, setActiveTab] = useState('coding') // 'coding' or 'sql'
    const [selectedProblemForTestCases, setSelectedProblemForTestCases] = useState(null)
    const [problem, setProblem] = useState({
        title: '',
        type: 'Coding',
        language: 'Python',
        difficulty: 'Medium',
        description: '',
        sampleInput: '',
        expectedOutput: '',
        deadline: '',
        status: 'live',
        // SQL specific fields
        sqlSchema: '',
        expectedQueryResult: '',
        enableProctoring: false,
        enableVideoAudio: false,
        disableCopyPaste: false,
        trackTabSwitches: false,
        maxTabSwitches: 3
    })

    // Check if SQL is selected
    const isSQLProblem = problem.type === 'SQL' || problem.language === 'SQL'

    // AI Chatbot handler - auto-fills the form
    const handleAIGenerate = (generated) => {
        const isSQL = generated.type === 'SQL' || generated.language === 'SQL'
        setProblem({
            title: generated.title || '',
            type: generated.type || 'Coding',
            language: generated.language || 'Python',
            difficulty: generated.difficulty || 'Medium',
            description: generated.description || '',
            sampleInput: isSQL ? '' : (generated.sampleInput || ''),
            expectedOutput: isSQL ? '' : (generated.expectedOutput || ''),
            sqlSchema: isSQL ? (generated.sqlSchema || generated.schema || '') : '',
            expectedQueryResult: isSQL ? (generated.expectedQueryResult || generated.expectedResult || '') : '',
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
                description: '', sampleInput: '', expectedOutput: '', deadline: '', status: 'live',
                sqlSchema: '', expectedQueryResult: '',
                enableProctoring: false, enableVideoAudio: false, disableCopyPaste: false, trackTabSwitches: false, maxTabSwitches: 3
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

    // Separate problems into Coding and SQL
    const codingProblems = problems.filter(p => p.language !== 'SQL' && p.type !== 'SQL')
    const sqlProblems = problems.filter(p => p.language === 'SQL' || p.type === 'SQL')
    const displayedProblems = activeTab === 'coding' ? codingProblems : sqlProblems

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

            {/* Problems Grid */}
            <div className="problem-list-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
                {displayedProblems.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                        <Code size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <h3>No {activeTab === 'sql' ? 'SQL' : 'Coding'} Problems Yet</h3>
                        <p>Create your first {activeTab === 'sql' ? 'SQL' : 'coding'} problem!</p>
                    </div>
                ) : (
                    displayedProblems.map(p => (
                        <div key={p.id} className="problem-card card glass" style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                                    {p.proctoring?.enabled && (
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
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => setSelectedProblemForTestCases(p)}
                                        disabled={p.language === 'SQL' || p.type === 'SQL'}
                                        style={{
                                            background: (p.language === 'SQL' || p.type === 'SQL') ? 'rgba(100, 116, 139, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                            border: 'none',
                                            color: (p.language === 'SQL' || p.type === 'SQL') ? '#64748b' : '#10b981',
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '0.5rem',
                                            cursor: (p.language === 'SQL' || p.type === 'SQL') ? 'not-allowed' : 'pointer',
                                            fontSize: '0.8rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            opacity: (p.language === 'SQL' || p.type === 'SQL') ? 0.5 : 1
                                        }}
                                        title={(p.language === 'SQL' || p.type === 'SQL') ? 'Test cases not available for SQL problems' : 'Manage Test Cases'}
                                    >
                                        <ClipboardList size={14} /> Tests
                                    </button>
                                    <button
                                        onClick={() => handleDelete(p.id)}
                                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                        Delete
                                    </button>
                                </div>
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
                                            onChange={(e) => {
                                                const newType = e.target.value
                                                setProblem({
                                                    ...problem,
                                                    type: newType,
                                                    language: newType === 'SQL' ? 'SQL' : problem.language === 'SQL' ? 'Python' : problem.language
                                                })
                                            }}
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
                                            onChange={(e) => {
                                                const newLang = e.target.value
                                                setProblem({
                                                    ...problem,
                                                    language: newLang,
                                                    type: newLang === 'SQL' ? 'SQL' : problem.type === 'SQL' ? 'Coding' : problem.type
                                                })
                                            }}
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

                                {/* SQL-specific fields */}
                                {isSQLProblem ? (
                                    <>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Code size={14} color="#06b6d4" /> Database Schema (CREATE TABLE statements)
                                            </label>
                                            <textarea
                                                rows="6"
                                                placeholder="CREATE TABLE employees (&#10;  id INT PRIMARY KEY,&#10;  name VARCHAR(100),&#10;  department VARCHAR(50),&#10;  salary DECIMAL(10,2)&#10;);&#10;&#10;INSERT INTO employees VALUES (1, 'John', 'IT', 50000);"
                                                value={problem.sqlSchema}
                                                onChange={(e) => setProblem({ ...problem, sqlSchema: e.target.value })}
                                                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                            />
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                Include CREATE TABLE and INSERT statements to set up the test database
                                            </small>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <CheckCircle size={14} color="#10b981" /> Expected Query Result
                                            </label>
                                            <textarea
                                                rows="4"
                                                placeholder="id | name | salary&#10;1  | John | 50000&#10;2  | Jane | 60000"
                                                value={problem.expectedQueryResult}
                                                onChange={(e) => setProblem({ ...problem, expectedQueryResult: e.target.value })}
                                                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                            />
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                The expected output when the correct SQL query is executed
                                            </small>
                                        </div>
                                    </>
                                ) : (
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
                                )}

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label">Deadline (Optional)</label>
                                    <input
                                        type="date"
                                        value={problem.deadline}
                                        onChange={(e) => setProblem({ ...problem, deadline: e.target.value })}
                                    />
                                </div>

                                {/* Proctoring Settings Section */}
                                <div style={{
                                    marginBottom: '1.5rem',
                                    padding: '1.25rem',
                                    background: 'rgba(239, 68, 68, 0.05)',
                                    borderRadius: '1rem',
                                    border: '1px solid rgba(239, 68, 68, 0.15)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                        <Eye size={20} color="#ef4444" />
                                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#ef4444' }}>
                                            Proctoring Settings
                                        </h4>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: 'pointer',
                                            padding: '0.75rem',
                                            background: problem.enableProctoring ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.enableProctoring}
                                                onChange={(e) => setProblem({ ...problem, enableProctoring: e.target.checked })}
                                                style={{ width: '18px', height: '18px', accentColor: '#ef4444' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>Enable Proctoring</span>
                                        </label>

                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: problem.enableProctoring ? 'pointer' : 'not-allowed',
                                            opacity: problem.enableProctoring ? 1 : 0.5,
                                            padding: '0.75rem',
                                            background: problem.enableVideoAudio ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.enableVideoAudio}
                                                onChange={(e) => setProblem({ ...problem, enableVideoAudio: e.target.checked })}
                                                disabled={!problem.enableProctoring}
                                                style={{ width: '18px', height: '18px', accentColor: '#8b5cf6' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>📹 Video/Audio Monitoring</span>
                                        </label>

                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: problem.enableProctoring ? 'pointer' : 'not-allowed',
                                            opacity: problem.enableProctoring ? 1 : 0.5,
                                            padding: '0.75rem',
                                            background: problem.disableCopyPaste ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.disableCopyPaste}
                                                onChange={(e) => setProblem({ ...problem, disableCopyPaste: e.target.checked })}
                                                disabled={!problem.enableProctoring}
                                                style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>📋 Disable Copy/Paste</span>
                                        </label>

                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: problem.enableProctoring ? 'pointer' : 'not-allowed',
                                            opacity: problem.enableProctoring ? 1 : 0.5,
                                            padding: '0.75rem',
                                            background: problem.trackTabSwitches ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.trackTabSwitches}
                                                onChange={(e) => setProblem({ ...problem, trackTabSwitches: e.target.checked })}
                                                disabled={!problem.enableProctoring}
                                                style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>🔒 Track Tab Switches</span>
                                        </label>
                                    </div>

                                    {problem.enableProctoring && problem.trackTabSwitches && (
                                        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Max Tab Switches:</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={problem.maxTabSwitches}
                                                onChange={(e) => setProblem({ ...problem, maxTabSwitches: parseInt(e.target.value) || 3 })}
                                                style={{ width: '80px', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', color: 'var(--text-main)' }}
                                            />
                                        </div>
                                    )}
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

            {/* Test Cases Manager Modal */}
            {selectedProblemForTestCases && (
                <TestCasesManager
                    problemId={selectedProblemForTestCases.id}
                    problemTitle={selectedProblemForTestCases.title}
                    onClose={() => setSelectedProblemForTestCases(null)}
                />
            )}
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
        startTime: '',
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
            // Convert dates to ISO strings without timezone conversion
            // because datetime-local input is already in local time
            const testPayload = { ...newTest, createdBy: ADMIN_ID }
            if (testPayload.startTime) {
                // Add timezone offset to convert local time to UTC
                const date = new Date(testPayload.startTime)
                testPayload.startTime = date.toISOString()
            }
            if (testPayload.deadline) {
                const date = new Date(testPayload.deadline)
                testPayload.deadline = date.toISOString()
            }

            await axios.post(`${API_BASE}/aptitude`, testPayload)
            setShowModal(false)
            setNewTest({
                title: '',
                difficulty: 'Medium',
                duration: 30,
                passingScore: 60,
                maxTabSwitches: 3,
                maxAttempts: 1,
                startTime: '',
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

    const handleToggleStatus = async (test) => {
        const newStatus = test.status === 'live' ? 'ended' : 'live';
        const action = newStatus === 'live' ? 'make this test visible to students' : 'hide this test from students';
        
        if (window.confirm(`Are you sure you want to ${action}?`)) {
            try {
                await axios.patch(`${API_BASE}/aptitude/${test.id}/status`, { status: newStatus })
                fetchTests()
            } catch (error) {
                alert('Error updating test status')
            }
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
                                                : test.status === 'ended'
                                                ? 'rgba(239, 68, 68, 0.15)'
                                                : 'rgba(107, 114, 128, 0.15)',
                                            color: test.status === 'live'
                                                ? '#10b981'
                                                : test.status === 'ended'
                                                ? '#ef4444'
                                                : '#6b7280',
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
                                                onClick={() => handleToggleStatus(test)}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: test.status === 'live'
                                                        ? 'rgba(245, 158, 11, 0.1)'
                                                        : 'rgba(16, 185, 129, 0.1)',
                                                    border: test.status === 'live'
                                                        ? '1px solid rgba(245, 158, 11, 0.3)'
                                                        : '1px solid rgba(16, 185, 129, 0.3)',
                                                    borderRadius: '6px',
                                                    color: test.status === 'live' ? '#f59e0b' : '#10b981',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem'
                                                }}
                                                title={test.status === 'live' ? 'End test (hide from students)' : 'Make test live (show to students)'}
                                            >
                                                {test.status === 'live' ? 'End' : 'Activate'}
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
                                        min="0"
                                        max="20"
                                        value={newTest.maxTabSwitches}
                                        onChange={e => setNewTest({ ...newTest, maxTabSwitches: parseInt(e.target.value) })}
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Test auto-submits if exceeded</small>
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><Calendar size={14} style={{ marginRight: '0.5rem' }} /> Start Time</label>
                                    <input
                                        type="datetime-local"
                                        value={newTest.startTime}
                                        onChange={e => setNewTest({ ...newTest, startTime: e.target.value })}
                                    />
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
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
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
                                <div className="form-group">
                                    <label className="form-label"><Settings size={14} style={{ marginRight: '0.5rem' }} /> Test Status</label>
                                    <select
                                        value={newTest.status}
                                        onChange={e => setNewTest({ ...newTest, status: e.target.value })}
                                    >
                                        <option value="live">Live - Visible to students</option>
                                        <option value="ended">Ended - Hidden from students</option>
                                    </select>
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
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '12px',
                                            padding: '1.25rem',
                                            border: '1px solid var(--border-color)'
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

