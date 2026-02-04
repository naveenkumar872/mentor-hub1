import { useState, useEffect, createContext, useContext } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import StudentPortal from './pages/StudentPortal'
import MentorPortal from './pages/MentorPortal'
import AdminPortal from './pages/AdminPortal'

// Create Auth Context
export const AuthContext = createContext(null)
export const ThemeContext = createContext(null)

export const useAuth = () => useContext(AuthContext)
export const useTheme = () => useContext(ThemeContext)

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

function App() {
    const [user, setUser] = useState(null)
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    useEffect(() => {
        // Check for saved user session
        const savedUser = localStorage.getItem('currentUser')
        if (savedUser) {
            setUser(JSON.parse(savedUser))
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])

    const login = async (email, password) => {
        try {
            const response = await fetch('http://127.0.0.1:3000/api/auth/login', {
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

            // Navigate to appropriate portal based on role
            navigate(`/${data.user.role}`)

            return { success: true }
        } catch (error) {
            return { success: false, error: error.message }
        }
    }

    const logout = () => {
        setUser(null)
        localStorage.removeItem('currentUser')
        navigate('/login')
    }

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light')
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
            <ThemeContext.Provider value={{ theme, toggleTheme }}>
                <Routes>
                    <Route path="/login" element={
                        user ? <Navigate to={`/${user.role}`} replace /> : <Login />
                    } />

                    <Route path="/student/*" element={
                        <ProtectedRoute allowedRoles={['student']}>
                            <StudentPortal />
                        </ProtectedRoute>
                    } />

                    <Route path="/mentor/*" element={
                        <ProtectedRoute allowedRoles={['mentor']}>
                            <MentorPortal />
                        </ProtectedRoute>
                    } />

                    <Route path="/admin/*" element={
                        <ProtectedRoute allowedRoles={['admin']}>
                            <AdminPortal />
                        </ProtectedRoute>
                    } />

                    <Route path="/" element={
                        user ? <Navigate to={`/${user.role}`} replace /> : <Navigate to="/login" replace />
                    } />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </ThemeContext.Provider>
        </AuthContext.Provider>
    )
}

export default App
