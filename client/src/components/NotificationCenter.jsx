import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../App';
import { Bell, X, Archive, Check } from 'lucide-react';
import '../styles/NotificationCenter.css';

const NotificationCenter = ({ socket }) => {
    const { theme } = useContext(ThemeContext);
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [filter, setFilter] = useState('all'); // all, unread, submission, message, test, achievement
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [totalPages, setTotalPages] = useState(1);
    const [preferences, setPreferences] = useState(null);
    const [showPreferences, setShowPreferences] = useState(false);

    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('token');

    // Fetch notifications
    const fetchNotifications = async () => {
        setLoading(true);
        try {
            let url = `/api/notifications?page=${page}&limit=20`;
            
            if (filter === 'unread') {
                url += '&unread_only=true';
            } else if (filter !== 'all') {
                url += `&type=${filter}`;
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch notifications');

            const data = await response.json();
            setNotifications(data.notifications);
            setTotalPages(data.pagination.pages);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch unread count
    const fetchUnreadCount = async () => {
        try {
            const response = await fetch('/api/notifications/unread/count', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch unread count');

            const data = await response.json();
            setUnreadCount(data.unreadCount);
        } catch (error) {
            console.error('Error fetching unread count:', error);
        }
    };

    // Fetch preferences
    const fetchPreferences = async () => {
        try {
            const response = await fetch('/api/notification-preferences', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch preferences');

            const data = await response.json();
            setPreferences(data);
        } catch (error) {
            console.error('Error fetching preferences:', error);
        }
    };

    // Mark notification as read
    const markAsRead = async (notificationId) => {
        try {
            const response = await fetch(`/api/notifications/${notificationId}/read`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                setNotifications(prev =>
                    prev.map(n => n.id === notificationId ? { ...n, read_at: new Date() } : n)
                );
                fetchUnreadCount();

                if (socket) {
                    socket.emit('notification:mark_read', { notificationId, userId });
                }
            }
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    };

    // Archive notification
    const archiveNotification = async (notificationId) => {
        try {
            const response = await fetch(`/api/notifications/${notificationId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                setNotifications(prev => prev.filter(n => n.id !== notificationId));
                fetchUnreadCount();

                if (socket) {
                    socket.emit('notification:archive', { notificationId, userId });
                }
            }
        } catch (error) {
            console.error('Error archiving notification:', error);
        }
    };

    // Update preferences
    const updatePreferences = async (updatedPrefs) => {
        try {
            const response = await fetch('/api/notification-preferences', {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedPrefs)
            });

            if (response.ok) {
                setPreferences(prev => ({ ...prev, ...updatedPrefs }));
            }
        } catch (error) {
            console.error('Error updating preferences:', error);
        }
    };

    // Initialize
    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
            fetchUnreadCount();
            fetchPreferences();
        }
    }, [isOpen, filter, page]);

    // Socket.io listener for real-time notifications
    useEffect(() => {
        if (!socket) return;

        socket.on('notification:new', (notification) => {
            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);
        });

        socket.on('notification:read', ({ notificationId }) => {
            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, read_at: new Date() } : n)
            );
        });

        socket.emit('subscribe_notifications', { userId });

        return () => {
            socket.off('notification:new');
            socket.off('notification:read');
        };
    }, [socket, userId]);

    const getNotificationIcon = (type) => {
        const icons = {
            submission: '📝',
            message: '💬',
            test_allocated: '📋',
            achievement: '🏆',
            mentor_assignment: '👨‍🏫',
            deadline: '⏰',
            system: '⚙️',
            alert: '⚠️'
        };
        return icons[type] || '📬';
    };

    const getPriorityColor = (priority) => {
        const colors = {
            low: '#6c757d',
            normal: '#0066cc',
            high: '#ff8800',
            critical: '#dd0000'
        };
        return colors[priority] || '#0066cc';
    };

    const filteredNotifications = filter === 'all'
        ? notifications
        : filter === 'unread'
        ? notifications.filter(n => !n.read_at)
        : notifications.filter(n => n.type === filter);

    return (
        <div className={`notification-center ${theme}`}>
            {/* Bell Icon Button */}
            <button
                className="notification-bell"
                onClick={() => setIsOpen(!isOpen)}
                title="Notifications"
            >
                <Bell size={24} />
                {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
            </button>

            {/* Notification Panel */}
            {isOpen && (
                <div className="notification-panel">
                    {/* Header */}
                    <div className="notification-header">
                        <h2>Notifications</h2>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                className="icon-btn"
                                onClick={() => setShowPreferences(!showPreferences)}
                                title="Preferences"
                            >
                                ⚙️
                            </button>
                            <button className="close-btn" onClick={() => setIsOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Preferences Section */}
                    {showPreferences && preferences && (
                        <div className="notification-preferences">
                            <h3>Notification Preferences</h3>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={preferences.submission_notifications}
                                    onChange={(e) =>
                                        updatePreferences({ submission_notifications: e.target.checked })
                                    }
                                />
                                Submission Notifications
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={preferences.message_notifications}
                                    onChange={(e) =>
                                        updatePreferences({ message_notifications: e.target.checked })
                                    }
                                />
                                Message Notifications
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={preferences.test_allocated_notifications}
                                    onChange={(e) =>
                                        updatePreferences({ test_allocated_notifications: e.target.checked })
                                    }
                                />
                                Test Notifications
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={preferences.achievement_notifications}
                                    onChange={(e) =>
                                        updatePreferences({ achievement_notifications: e.target.checked })
                                    }
                                />
                                Achievement Notifications
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={preferences.email_digest_enabled}
                                    onChange={(e) =>
                                        updatePreferences({ email_digest_enabled: e.target.checked })
                                    }
                                />
                                Email Digest
                            </label>
                            {preferences.email_digest_enabled && (
                                <select
                                    value={preferences.email_digest_frequency}
                                    onChange={(e) =>
                                        updatePreferences({ email_digest_frequency: e.target.value })
                                    }
                                >
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="never">Never</option>
                                </select>
                            )}
                        </div>
                    )}

                    {/* Filter Buttons */}
                    <div className="notification-filters">
                        {['all', 'unread', 'submission', 'message', 'test', 'achievement'].map(f => (
                            <button
                                key={f}
                                className={`filter-btn ${filter === f ? 'active' : ''}`}
                                onClick={() => {
                                    setFilter(f);
                                    setPage(1);
                                }}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
                            </button>
                        ))}
                    </div>

                    {/* Notifications List */}
                    <div className="notification-list">
                        {loading ? (
                            <div className="loading">Loading...</div>
                        ) : filteredNotifications.length === 0 ? (
                            <div className="empty-state">
                                <p>No notifications</p>
                            </div>
                        ) : (
                            filteredNotifications.map(notification => (
                                <div
                                    key={notification.id}
                                    className={`notification-item ${notification.read_at ? 'read' : 'unread'}`}
                                    style={{ borderLeftColor: getPriorityColor(notification.priority) }}
                                >
                                    <div className="notification-icon">
                                        {getNotificationIcon(notification.type)}
                                    </div>
                                    <div className="notification-content">
                                        <div className="notification-title">{notification.title}</div>
                                        <div className="notification-message">{notification.message}</div>
                                        <div className="notification-time">
                                            {new Date(notification.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="notification-actions">
                                        {!notification.read_at && (
                                            <button
                                                className="action-btn"
                                                onClick={() => markAsRead(notification.id)}
                                                title="Mark as read"
                                            >
                                                <Check size={18} />
                                            </button>
                                        )}
                                        <button
                                            className="action-btn"
                                            onClick={() => archiveNotification(notification.id)}
                                            title="Archive"
                                        >
                                            <Archive size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="notification-pagination">
                            <button
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                            >
                                Previous
                            </button>
                            <span>Page {page} of {totalPages}</span>
                            <button
                                disabled={page === totalPages}
                                onClick={() => setPage(page + 1)}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;
