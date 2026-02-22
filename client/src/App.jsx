import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import axios from 'axios'
import Login from './pages/Login'
import ErrorBoundary from './components/shared/ErrorBoundary'

// ── Global axios interceptor ──────────────────────────────────────────────────
// Automatically attach the JWT token to every outgoing axios request.
axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('authToken')
    if (token) {
        config.headers = config.headers || {}
        config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
})
// ─────────────────────────────────────────────────────────────────────────────

// Lazy load heavy portal pages for code splitting
const StudentPortal = lazy(() => import('./pages/StudentPortal'))
const MentorPortal = lazy(() => import('./pages/MentorPortal'))
const AdminPortal = lazy(() => import('./pages/AdminPortal'))
const ConnectAlumni = lazy(() => import('./components/ConnectAlumni'))

// Create Auth Context
export const AuthContext = createContext(null)
export const ThemeContext = createContext(null)

export const useAuth = () => useContext(AuthContext)
export const useTheme = () => useContext(ThemeContext)

// Loading fallback for lazy-loaded routes
function PortalLoading() {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            background: 'var(--bg-secondary)',
            gap: '16px'
        }}>
            <div className="loading-spinner"></div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading portal...</p>
        </div>
    )
}

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }) {
    const { user } = useAuth()

    if (!user) {
        return <Navigate to="/login" replace />
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to={`/${user.role}`} replace />
    }

    return children
}

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'

function App() {
    const [user, setUser] = useState(null)
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('theme')
        if (saved) return saved
        // Auto-detect system preference
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    })
    const [ideTheme, setIDETheme] = useState('vs-dark')
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    // Sync theme to database
    const syncThemeToDatabase = async (newTheme) => {
        if (!user || !localStorage.getItem('authToken')) return

        try {
            await fetch(`${API_BASE}/users/${user.id}/preferences`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ themePreference: newTheme })
            })
        } catch (error) {
            console.warn('Failed to sync theme to database:', error)
        }
    }

    // Sync IDE theme to database
    const syncIDEThemeToDatabase = async (newIDETheme) => {
        if (!user || !localStorage.getItem('authToken')) return

        try {
            await fetch(`${API_BASE}/users/${user.id}/preferences`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ ideTheme: newIDETheme })
            })
        } catch (error) {
            console.warn('Failed to sync IDE theme to database:', error)
        }
    }

    useEffect(() => {
        // Check for saved user session
        try {
            const savedUser = localStorage.getItem('currentUser')
            const savedToken = localStorage.getItem('authToken')
            if (savedUser && savedUser !== 'undefined' && savedToken) {
                const parsedUser = JSON.parse(savedUser)
                setUser(parsedUser)
                
                // Load user's saved preferences from login response
                if (parsedUser.themePreference) {
                    setTheme(parsedUser.themePreference)
                }
                if (parsedUser.ideTheme) {
                    setIDETheme(parsedUser.ideTheme)
                }
            } else {
                // Clear partial auth state
                localStorage.removeItem('currentUser')
                localStorage.removeItem('authToken')
            }
        } catch (error) {
            console.error('Failed to parse saved user:', error)
            localStorage.removeItem('currentUser')
            localStorage.removeItem('authToken')
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])

    const login = async (email, password) => {
        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Login failed')
            }

            setUser(data.user)
            localStorage.setItem('currentUser', JSON.stringify(data.user))
            
            // Store JWT token for authenticated API requests
            if (data.token) {
                localStorage.setItem('authToken', data.token)
            }

            // Apply user's theme preferences from login response
            if (data.user.themePreference) {
                setTheme(data.user.themePreference)
            }
            if (data.user.ideTheme) {
                setIDETheme(data.user.ideTheme)
            }

            // Navigate to appropriate portal based on role
            // Alumni users go to /alumni, everyone else to their portal
            const dest = data.user.role === 'alumni' ? '/alumni' : `/${data.user.role}`
            navigate(dest)

            return { success: true }
        } catch (error) {
            return { success: false, error: error.message }
        }
    }

    const logout = () => {
        setUser(null)
        localStorage.removeItem('currentUser')
        localStorage.removeItem('authToken')
        navigate('/login')
    }

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light'
        setTheme(newTheme)
        syncThemeToDatabase(newTheme)
    }

    const updateIDETheme = (newIDETheme) => {
        setIDETheme(newIDETheme)
        syncIDEThemeToDatabase(newIDETheme)
    }

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                background: 'var(--bg-secondary)'
            }}>
                <div className="loading-spinner"></div>
            </div>
        )
    }

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            <ThemeContext.Provider value={{ theme, toggleTheme, ideTheme, updateIDETheme }}>
                <ErrorBoundary fullPage title="Mentor Hub encountered an error" message="Something went wrong. Please try refreshing the page or contact support if the issue persists.">
                    <Suspense fallback={<PortalLoading />}>
                        <Routes>
                            <Route path="/login" element={
                                user ? <Navigate to={`/${user.role}`} replace /> : <Login />
                            } />

                            {/* Full-page Connect Alumni portal — for all roles */}
                            <Route path="/connect-alumni" element={
                                <ProtectedRoute allowedRoles={['student', 'alumni', 'mentor', 'admin']}>
                                    <ErrorBoundary title="Alumni Portal Error">
                                        <ConnectAlumni />
                                    </ErrorBoundary>
                                </ProtectedRoute>
                            } />

                            {/* Alumni users redirect to Connect Alumni portal */}
                            <Route path="/alumni" element={
                                <ProtectedRoute allowedRoles={['alumni']}>
                                    <Navigate to="/connect-alumni" replace />
                                </ProtectedRoute>
                            } />

                            <Route path="/student/*" element={
                                <ProtectedRoute allowedRoles={['student']}>
                                    <ErrorBoundary title="Student Portal Error">
                                        <StudentPortal />
                                    </ErrorBoundary>
                                </ProtectedRoute>
                            } />

                            <Route path="/mentor/*" element={
                                <ProtectedRoute allowedRoles={['mentor']}>
                                    <ErrorBoundary title="Mentor Portal Error">
                                        <MentorPortal />
                                    </ErrorBoundary>
                                </ProtectedRoute>
                            } />

                            <Route path="/admin/*" element={
                                <ProtectedRoute allowedRoles={['admin']}>
                                    <ErrorBoundary title="Admin Portal Error">
                                        <AdminPortal />
                                    </ErrorBoundary>
                                </ProtectedRoute>
                            } />

                            <Route path="/" element={
                                user ? <Navigate to={`/${user.role}`} replace /> : <Navigate to="/login" replace />
                            } />

                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Suspense>
                </ErrorBoundary>
            </ThemeContext.Provider>
        </AuthContext.Provider>
    )
}

export default App
