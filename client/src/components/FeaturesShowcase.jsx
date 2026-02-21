import React, { useState } from 'react'
import {
    Search, Brain, Sparkles, FileText, Github, AlertTriangle, Users, Clock,
    Award, Download, MessageSquare, Trophy, Target, Settings, Code, Play,
    BookOpen, Zap, TrendingUp, PieChart, Mail, Eye
} from 'lucide-react'
import { Link } from 'react-router-dom'

export default function FeaturesShowcase() {
    const [selectedCategory, setSelectedCategory] = useState('all')

    const features = [
        {
            id: 1,
            category: 'learning',
            title: 'Advanced Search',
            description: 'Search problems by title, difficulty, and tags with advanced filtering',
            icon: Search,
            path: '/student/search',
            color: '#3b82f6'
        },
        {
            id: 2,
            category: 'learning',
            title: 'AI Recommendations',
            description: 'Get personalized problem recommendations based on your skills',
            icon: Sparkles,
            path: '/student/recommendations',
            color: '#8b5cf6'
        },
        {
            id: 3,
            category: 'learning',
            title: 'AI Test Case Generator',
            description: 'Auto-generate test cases for your coding problems',
            icon: FileText,
            path: '/student/test-generator',
            color: '#06b6d4'
        },
        {
            id: 4,
            category: 'review',
            title: 'Code Reviews',
            description: 'Detailed code reviews with line-by-line feedback and comments',
            icon: Github,
            path: '/student/code-reviews',
            color: '#10b981'
        },
        {
            id: 5,
            category: 'review',
            title: 'Plagiarism Detection',
            description: 'Check your submissions for plagiarism and code similarities',
            icon: AlertTriangle,
            path: '/student/plagiarism',
            color: '#f59e0b'
        },
        {
            id: 6,
            category: 'collaboration',
            title: 'Mentor Matching',
            description: 'Find and connect with the perfect mentor for your goals',
            icon: Users,
            path: '/student/mentor-matching',
            color: '#ec4899'
        },
        {
            id: 7,
            category: 'collaboration',
            title: 'Direct Messaging',
            description: 'Real-time direct messaging with mentors and students',
            icon: MessageSquare,
            path: '/student/messaging',
            color: '#14b8a6'
        },
        {
            id: 8,
            category: 'collaboration',
            title: 'Availability Calendar',
            description: 'Set your availability and schedule sessions with mentors',
            icon: Clock,
            path: '/student/availability',
            color: '#f97316'
        },
        {
            id: 9,
            category: 'analytics',
            title: 'Skill Badges',
            description: 'Earn and showcase skill badges for your achievements',
            icon: Award,
            path: '/student/badges',
            color: '#6366f1'
        },
        {
            id: 10,
            category: 'analytics',
            title: 'Performance Analytics',
            description: 'Detailed analytics dashboard tracking your progress',
            icon: TrendingUp,
            path: '/student/analytics',
            color: '#22c55e'
        },
        {
            id: 11,
            category: 'analytics',
            title: 'Leaderboards',
            description: 'Compete with peers and view global rankings',
            icon: Trophy,
            path: '/student/leaderboard',
            color: '#f1941f'
        },
        {
            id: 12,
            category: 'analytics',
            title: 'Export Reports',
            description: 'Download comprehensive reports in PDF format',
            icon: Download,
            path: '/student/reports',
            color: '#8b5cf6'
        },
        {
            id: 13,
            category: 'learning',
            title: 'Skill Tests',
            description: 'Test your specific skills with targeted assessments',
            icon: Target,
            path: '/student/skill-tests',
            color: '#3b82f6'
        },
        {
            id: 14,
            category: 'learning',
            title: 'Aptitude Tests',
            description: 'Comprehensive aptitude assessments for career readiness',
            icon: Brain,
            path: '/student/aptitude',
            color: '#06b6d4'
        },
        {
            id: 15,
            category: 'learning',
            title: 'Global Tests',
            description: 'Complete coding tests with proctoring and time limits',
            icon: BookOpen,
            path: '/student/global-tests',
            color: '#10b981'
        },
        {
            id: 16,
            category: 'analytics',
            title: 'Settings',
            description: 'Customize your profile, preferences, and notifications',
            icon: Settings,
            path: '/student/settings',
            color: '#94a3b8'
        }
    ]

    const categories = [
        { id: 'all', label: 'All Features' },
        { id: 'learning', label: 'Learning' },
        { id: 'review', label: 'Reviews' },
        { id: 'collaboration', label: 'Collaboration' },
        { id: 'analytics', label: 'Analytics' }
    ]

    const filteredFeatures = selectedCategory === 'all' 
        ? features 
        : features.filter(f => f.category === selectedCategory)

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>🚀 Mentor Hub - 16+ Features</h1>
                <p style={styles.subtitle}>Discover all available features on your personalized dashboard</p>
            </div>

            {/* Category Filter */}
            <div style={styles.filterContainer}>
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        style={{
                            ...styles.filterBtn,
                            ...(selectedCategory === cat.id ? styles.filterBtnActive : {})
                        }}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Features Grid */}
            <div style={styles.grid}>
                {filteredFeatures.map((feature, idx) => {
                    const IconComponent = feature.icon
                    return (
                        <Link
                            key={feature.id}
                            to={feature.path}
                            style={{ textDecoration: 'none' }}
                        >
                            <div
                                style={styles.card}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-8px)'
                                    e.currentTarget.style.boxShadow = `0 20px 40px rgba(0,0,0,0.15)`
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)'
                                    e.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,0.1)`
                                }}
                            >
                                <div style={{
                                    ...styles.iconContainer,
                                    backgroundColor: feature.color + '15',
                                    borderColor: feature.color + '40'
                                }}>
                                    <IconComponent
                                        size={32}
                                        style={{ color: feature.color }}
                                    />
                                </div>
                                <h3 style={styles.cardTitle}>{feature.title}</h3>
                                <p style={styles.cardDescription}>{feature.description}</p>
                                <div style={styles.cardFooter}>
                                    <span style={styles.badge}>{feature.category}</span>
                                    <span style={styles.arrow}>→</span>
                                </div>
                            </div>
                        </Link>
                    )
                })}
            </div>

            {/* Quick Access Section */}
            <div style={styles.quickAccessSection}>
                <h2 style={styles.quickAccessTitle}>📌 Quick Access</h2>
                <div style={styles.quickAccessGrid}>
                    <Link to="/student/dashboard" style={styles.quickLink}>
                        <span>📊 Dashboard</span>
                    </Link>
                    <Link to="/student/tasks" style={styles.quickLink}>
                        <span>📝 Tasks</span>
                    </Link>
                    <Link to="/student/assignments" style={styles.quickLink}>
                        <span>💻 Assignments</span>
                    </Link>
                    <Link to="/student/submissions" style={styles.quickLink}>
                        <span>✅ Submissions</span>
                    </Link>
                </div>
            </div>

            {/* Feature Stats */}
            <div style={styles.statsSection}>
                <div style={styles.stat}>
                    <div style={styles.statNumber}>16+</div>
                    <div style={styles.statLabel}>Features</div>
                </div>
                <div style={styles.stat}>
                    <div style={styles.statNumber}>100%</div>
                    <div style={styles.statLabel}>Functional</div>
                </div>
                <div style={styles.stat}>
                    <div style={styles.statNumber}>24/7</div>
                    <div style={styles.statLabel}>Available</div>
                </div>
                <div style={styles.stat}>
                    <div style={styles.statNumber}>∞</div>
                    <div style={styles.statLabel}>Possibilities</div>
                </div>
            </div>
        </div>
    )
}

const styles = {
    container: {
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '40px 20px',
        backgroundColor: '#f8fafc',
        minHeight: '100vh'
    },
    header: {
        textAlign: 'center',
        marginBottom: '50px'
    },
    title: {
        fontSize: '2.5rem',
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: '10px'
    },
    subtitle: {
        fontSize: '1.1rem',
        color: '#64748b',
        marginBottom: '20px'
    },
    filterContainer: {
        display: 'flex',
        gap: '10px',
        justifyContent: 'center',
        marginBottom: '40px',
        flexWrap: 'wrap'
    },
    filterBtn: {
        padding: '8px 16px',
        border: '2px solid #e2e8f0',
        borderRadius: '8px',
        backgroundColor: '#fff',
        cursor: 'pointer',
        fontWeight: '500',
        transition: 'all 0.3s ease',
        color: '#64748b'
    },
    filterBtnActive: {
        backgroundColor: '#3b82f6',
        color: '#fff',
        borderColor: '#3b82f6'
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '24px',
        marginBottom: '50px'
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column'
    },
    iconContainer: {
        width: '56px',
        height: '56px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '16px',
        border: '2px solid'
    },
    cardTitle: {
        fontSize: '1.2rem',
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: '8px'
    },
    cardDescription: {
        fontSize: '0.95rem',
        color: '#64748b',
        marginBottom: '16px',
        flex: 1
    },
    cardFooter: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: '12px',
        borderTop: '1px solid #e2e8f0'
    },
    badge: {
        fontSize: '0.75rem',
        padding: '4px 8px',
        backgroundColor: '#f1f5f9',
        borderRadius: '4px',
        color: '#64748b',
        textTransform: 'capitalize',
        fontWeight: 'bold'
    },
    arrow: {
        color: '#3b82f6',
        fontWeight: 'bold',
        fontSize: '1.2rem'
    },
    quickAccessSection: {
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '30px',
        marginBottom: '40px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
    },
    quickAccessTitle: {
        fontSize: '1.5rem',
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: '20px'
    },
    quickAccessGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px'
    },
    quickLink: {
        padding: '16px',
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: '#fff',
        textDecoration: 'none',
        borderRadius: '8px',
        textAlign: 'center',
        fontWeight: '500',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        '&:hover': {
            transform: 'translateY(-4px)'
        }
    },
    statsSection: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '20px',
        marginTop: '40px'
    },
    stat: {
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
    },
    statNumber: {
        fontSize: '2.5rem',
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: '8px'
    },
    statLabel: {
        fontSize: '1rem',
        color: '#64748b',
        fontWeight: '500'
    }
}
