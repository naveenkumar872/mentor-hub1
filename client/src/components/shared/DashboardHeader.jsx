import { useState, useEffect } from 'react'
import { Bell, LogOut, Settings, User, Menu, X } from 'lucide-react'
import { useAuth } from '../../App'

/**
 * Reusable Dashboard Header Component
 * Reduces duplication across StudentPortal, MentorPortal, AdminPortal
 */
export default function DashboardHeader({ 
    title = 'Dashboard', 
    subtitle = '', 
    user, 
    unreadCount = 0, 
    onLogout,
    onNotifications,
    onSettings 
}) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (
        <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 md:p-6 shadow-lg">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                {/* Left: Title + Logo */}
                <div className="flex items-center gap-4">
                    <button 
                        className="md:hidden p-2 hover:bg-slate-700 rounded"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
                        {subtitle && <p className="text-slate-400 text-sm">{subtitle}</p>}
                    </div>
                </div>

                {/* Right: User Controls */}
                <div className="hidden md:flex items-center gap-4">
                    {/* Notifications */}
                    <button 
                        onClick={onNotifications}
                        className="relative p-2 hover:bg-slate-700 rounded-lg transition"
                        title="Notifications"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Settings */}
                    <button 
                        onClick={onSettings}
                        className="p-2 hover:bg-slate-700 rounded-lg transition"
                        title="Settings"
                    >
                        <Settings size={20} />
                    </button>

                    {/* User Info */}
                    <div className="flex items-center gap-3 pl-3 border-l border-slate-600">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold">
                            {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="text-sm">
                            <div className="font-medium">{user?.name || 'User'}</div>
                            <div className="text-xs text-slate-400 capitalize">{user?.role || 'student'}</div>
                        </div>
                    </div>

                    {/* Logout */}
                    <button 
                        onClick={onLogout}
                        className="p-2 hover:bg-red-600/20 rounded-lg transition text-red-400 hover:text-red-300"
                        title="Logout"
                    >
                        <LogOut size={20} />
                    </button>
                </div>

                {/* Mobile: Compact view */}
                <div className="md:hidden flex items-center gap-2">
                    <button 
                        onClick={onNotifications}
                        className="relative p-2 hover:bg-slate-700 rounded-lg"
                    >
                        <Bell size={18} />
                        {unreadCount > 0 && (
                            <span className="absolute top-0 right-0 bg-red-500 text-xs rounded-full w-4 h-4 flex items-center justify-center">
                                {unreadCount}
                            </span>
                        )}
                    </button>
                    <button 
                        onClick={onLogout}
                        className="p-2 hover:bg-red-600/20 rounded-lg text-red-400"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="md:hidden mt-4 pb-4 border-t border-slate-700 pt-4 space-y-2">
                    <button 
                        onClick={() => { onSettings(); setMobileMenuOpen(false); }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-700 rounded"
                    >
                        Settings
                    </button>
                </div>
            )}
        </header>
    )
}
