import { NavLink } from 'react-router-dom'
import { useAuth, useTheme } from '../App'
import { Sun, Moon, LogOut, Menu, X, Brain, User } from 'lucide-react'
import { useState } from 'react'
import './DashboardLayout.css'

function DashboardLayout({ children, navItems, title, subtitle, mentorInfo }) {
    const { user, logout } = useAuth()
    const { theme, toggleTheme } = useTheme()
    const [sidebarOpen, setSidebarOpen] = useState(false)

    return (
        <div className="dashboard-layout">
            {/* Sidebar Overlay */}
            {sidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="logo">
                        <div className="logo-icon"><Brain size={18} /></div>
                        <span className="logo-text">AI Mentor Hub</span>
                    </div>
                    <button className="close-sidebar" onClick={() => setSidebarOpen(false)}>
                        <X size={24} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button className="theme-btn" onClick={toggleTheme}>
                        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                        <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                    </button>

                    <div className="user-info">
                        <div className="user-avatar"><User size={18} /></div>
                        <div className="user-details">
                            <span className="user-name">{user?.name}</span>
                            <span className="user-role">{user?.role}</span>
                        </div>
                        <button className="logout-btn" onClick={logout} title="Logout">
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <header className="content-header">
                    <div className="header-left">
                        <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
                            <Menu size={24} />
                        </button>
                        <div className="page-title">
                            <h1>{title}</h1>
                            <p>{subtitle}</p>
                        </div>
                    </div>
                    <div className="header-right">
                        {mentorInfo && (
                            <div className="mentor-badge-nav">
                                <div className="mentor-avatar-nav">
                                    {mentorInfo.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="mentor-details-nav">
                                    <span className="mentor-label-nav">My Mentor</span>
                                    <span className="mentor-name-nav">{mentorInfo.name}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                <div className="content-body">
                    {children}
                </div>
            </main>
        </div>
    )
}

export default DashboardLayout
