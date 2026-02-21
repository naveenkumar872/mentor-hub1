import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../App';
import { Search, Download, AlertCircle, TrendingUp, Users, Clock } from 'lucide-react';
import '../styles/AuditLogDashboard.css';

const AuditLogDashboard = () => {
    const { theme } = useContext(ThemeContext);
    const [logs, setLogs] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [stats, setStats] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalPages, setTotalPages] = useState(1);
    const [activeTab, setActiveTab] = useState('logs'); // logs, alerts, analytics
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({
        userId: '',
        userRole: '',
        action: '',
        resourceType: '',
        startDate: '',
        endDate: ''
    });
    const [showFilters, setShowFilters] = useState(false);
    const [timespan, setTimespan] = useState('7'); // days for analytics

    const token = localStorage.getItem('authToken');

    // Fetch logs
    const fetchLogs = async () => {
        setLoading(true);
        try {
            const filterStr = JSON.stringify(filters);
            const url = `/api/admin/audit-logs/search?query=${searchQuery}&filters=${encodeURIComponent(filterStr)}&page=${page}&limit=${pageSize}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch logs');

            const data = await response.json();
            setLogs(data.logs);
            setTotalPages(data.pagination.pages);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch alerts
    const fetchAlerts = async () => {
        try {
            const response = await fetch('/api/admin/audit-logs/alerts', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch alerts');

            const data = await response.json();
            setAlerts(data.alerts);
        } catch (error) {
            console.error('Error fetching alerts:', error);
        }
    };

    // Fetch stats
    const fetchStats = async () => {
        try {
            const response = await fetch('/api/admin/audit-logs/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch stats');

            const data = await response.json();
            setStats(data);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    // Fetch analytics
    const fetchAnalytics = async () => {
        try {
            const response = await fetch(`/api/admin/audit-logs/analytics?period=${timespan}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch analytics');

            const data = await response.json();
            setAnalytics(data);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        }
    };

    // Fetch real-time summary
    const fetchSummary = async () => {
        try {
            const response = await fetch('/api/admin/audit-logs/real-time-summary', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch summary');

            const data = await response.json();
            setSummary(data);
        } catch (error) {
            console.error('Error fetching summary:', error);
        }
    };

    // Export logs
    const handleExport = async (format) => {
        try {
            const params = new URLSearchParams({
                format,
                startDate: filters.startDate,
                endDate: filters.endDate,
                action: filters.action,
                userId: filters.userId
            });

            const response = await fetch(`/api/admin/audit-logs/export?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit_logs.${format}`;
            a.click();
        } catch (error) {
            console.error('Export error:', error);
        }
    };

    // Initialize
    useEffect(() => {
        fetchLogs();
        fetchStats();
        fetchAlerts();
        fetchSummary();
    }, []);

    useEffect(() => {
        if (activeTab === 'logs') {
            fetchLogs();
        } else if (activeTab === 'alerts') {
            fetchAlerts();
        } else if (activeTab === 'analytics') {
            fetchAnalytics();
        }
    }, [page, activeTab, searchQuery, filters, timespan]);

    // Auto-refresh summary every 30 seconds
    useEffect(() => {
        const interval = setInterval(fetchSummary, 30000);
        return () => clearInterval(interval);
    }, []);

    const getActionColor = (action) => {
        if (action.includes('delete') || action.includes('ban')) return '#dd0000';
        if (action.includes('create') || action.includes('add')) return '#00aa00';
        if (action.includes('update') || action.includes('modify')) return '#0066cc';
        if (action.includes('access') || action.includes('view')) return '#666666';
        return '#888888';
    };

    const getSeverity = (action) => {
        if (action.includes('delete') || action.includes('ban')) return 'Critical';
        if (action.includes('update') || action.includes('permission')) return 'High';
        return 'Medium';
    };

    return (
        <div className={`audit-dashboard ${theme}`}>
            {/* Header */}
            <div className="audit-header">
                <h1>📊 Audit Log Dashboard</h1>
                <div className="header-actions">
                    <button className="btn-primary" onClick={() => setShowFilters(!showFilters)}>
                        🔍 Filters
                    </button>
                    <button className="btn-primary" onClick={() => handleExport('csv')}>
                        <Download size={16} /> CSV
                    </button>
                    <button className="btn-primary" onClick={() => handleExport('json')}>
                        <Download size={16} /> JSON
                    </button>
                </div>
            </div>

            {/* Real-time Summary Cards */}
            {summary && (
                <div className="summary-cards">
                    <div className="card">
                        <Clock size={24} className="card-icon" />
                        <div className="card-content">
                            <div className="card-label">Last Hour</div>
                            <div className="card-value">{summary.currentActivity.lastHourCount}</div>
                        </div>
                    </div>
                    <div className="card">
                        <TrendingUp size={24} className="card-icon" />
                        <div className="card-content">
                            <div className="card-label">Last 24 Hours</div>
                            <div className="card-value">{summary.currentActivity.last24hCount}</div>
                        </div>
                    </div>
                    <div className="card alert-card">
                        <AlertCircle size={24} className="card-icon" />
                        <div className="card-content">
                            <div className="card-label">Critical Alerts</div>
                            <div className="card-value">{summary.currentActivity.criticalAlerts}</div>
                        </div>
                    </div>
                    <div className="card">
                        <Users size={24} className="card-icon" />
                        <div className="card-content">
                            <div className="card-label">Active Users (24h)</div>
                            <div className="card-value">{summary.currentActivity.activeUsersLast24h}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            {showFilters && (
                <div className="filters-panel">
                    <div className="filter-row">
                        <input
                            type="text"
                            placeholder="User ID"
                            value={filters.userId}
                            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                            className="filter-input"
                        />
                        <select
                            value={filters.userRole}
                            onChange={(e) => setFilters({ ...filters, userRole: e.target.value })}
                            className="filter-input"
                        >
                            <option value="">All Roles</option>
                            <option value="student">Student</option>
                            <option value="mentor">Mentor</option>
                            <option value="admin">Admin</option>
                        </select>
                        <input
                            type="text"
                            placeholder="Action"
                            value={filters.action}
                            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                            className="filter-input"
                        />
                        <input
                            type="text"
                            placeholder="Resource Type"
                            value={filters.resourceType}
                            onChange={(e) => setFilters({ ...filters, resourceType: e.target.value })}
                            className="filter-input"
                        />
                    </div>
                    <div className="filter-row">
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            className="filter-input"
                        />
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            className="filter-input"
                        />
                        <button
                            className="btn-secondary"
                            onClick={() => setFilters({ userId: '', userRole: '', action: '', resourceType: '', startDate: '', endDate: '' })}
                        >
                            Clear Filters
                        </button>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
                    onClick={() => setActiveTab('logs')}
                >
                    📋 Logs
                </button>
                <button
                    className={`tab ${activeTab === 'alerts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('alerts')}
                >
                    ⚠️ Alerts ({alerts.length})
                </button>
                <button
                    className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('analytics')}
                >
                    📈 Analytics
                </button>
            </div>

            {/* Content */}
            <div className="tab-content">
                {/* LOGS TAB */}
                {activeTab === 'logs' && (
                    <div className="logs-section">
                        <div className="search-bar">
                            <Search size={20} />
                            <input
                                type="text"
                                placeholder="Search logs..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setPage(1);
                                }}
                                className="search-input"
                            />
                        </div>

                        {loading ? (
                            <div className="loading">Loading...</div>
                        ) : logs.length === 0 ? (
                            <div className="empty">No logs found</div>
                        ) : (
                            <>
                                <div className="logs-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Timestamp</th>
                                                <th>User</th>
                                                <th>Role</th>
                                                <th>Action</th>
                                                <th>Resource</th>
                                                <th>IP Address</th>
                                                <th>Details</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logs.map((log) => (
                                                <tr key={log.id} className="log-row">
                                                    <td className="timestamp">
                                                        {new Date(log.timestamp).toLocaleString()}
                                                    </td>
                                                    <td className="user-name">{log.user_name || 'System'}</td>
                                                    <td>
                                                        <span className="role-badge">{log.user_role}</span>
                                                    </td>
                                                    <td>
                                                        <span
                                                            className="action-badge"
                                                            style={{ color: getActionColor(log.action) }}
                                                        >
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td className="resource">
                                                        {log.resource_type}
                                                        {log.resource_id && ` (${log.resource_id.substring(0, 8)}...)`}
                                                    </td>
                                                    <td className="ip">{log.ip_address}</td>
                                                    <td className="details">
                                                        {log.details && typeof log.details === 'object'
                                                            ? JSON.stringify(log.details).substring(0, 50)
                                                            : log.details?.substring(0, 50) || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                <div className="pagination">
                                    <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                                        Previous
                                    </button>
                                    <span>
                                        Page {page} of {totalPages}
                                    </span>
                                    <button disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                                        Next
                                    </button>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setPage(1);
                                        }}
                                    >
                                        <option value={25}>25 per page</option>
                                        <option value={50}>50 per page</option>
                                        <option value={100}>100 per page</option>
                                        <option value={250}>250 per page</option>
                                    </select>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ALERTS TAB */}
                {activeTab === 'alerts' && (
                    <div className="alerts-section">
                        {alerts.length === 0 ? (
                            <div className="empty">No critical alerts in the last 24 hours</div>
                        ) : (
                            <div className="alerts-grid">
                                {alerts.map((alert) => (
                                    <div key={alert.id} className={`alert-card severity-${alert.severity?.toLowerCase()}`}>
                                        <div className="alert-header">
                                            <AlertCircle size={20} className="alert-icon" />
                                            <span className="alert-action">{alert.action}</span>
                                            <span className="alert-severity">{alert.severity}</span>
                                        </div>
                                        <div className="alert-body">
                                            <p><strong>User:</strong> {alert.user_name || 'System'}</p>
                                            <p><strong>Resource:</strong> {alert.resource_type} ({alert.resource_id?.substring(0, 8)}...)</p>
                                            <p><strong>Time:</strong> {new Date(alert.timestamp).toLocaleString()}</p>
                                            {alert.details && (
                                                <p><strong>Details:</strong> {JSON.stringify(alert.details).substring(0, 100)}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ANALYTICS TAB */}
                {activeTab === 'analytics' && (
                    <div className="analytics-section">
                        <div className="analytics-controls">
                            <select
                                value={timespan}
                                onChange={(e) => {
                                    setTimespan(e.target.value);
                                }}
                                className="filter-input"
                            >
                                <option value="1">Last 24 Hours</option>
                                <option value="7">Last 7 Days</option>
                                <option value="30">Last 30 Days</option>
                                <option value="90">Last 90 Days</option>
                            </select>
                        </div>

                        {analytics ? (
                            <div className="analytics-grid">
                                {/* Top Users */}
                                <div className="analytics-card">
                                    <h3>👥 Most Active Users</h3>
                                    <div className="user-list">
                                        {analytics.topUsers.map((user) => (
                                            <div key={user.user_id} className="user-item">
                                                <div className="user-info">
                                                    <strong>{user.user_name}</strong>
                                                    <small>{user.user_role}</small>
                                                </div>
                                                <div className="user-stats">
                                                    <span>{user.actionCount} actions</span>
                                                    <span>{user.activeDays} active days</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Action Breakdown */}
                                <div className="analytics-card">
                                    <h3>📊 Actions by Type</h3>
                                    <div className="action-list">
                                        {analytics.actionTrends
                                            ?.filter((item, idx, arr) => arr.findIndex(a => a.action === item.action) === idx)
                                            .slice(0, 10)
                                            .map((item) => (
                                                <div key={item.action} className="action-item">
                                                    <div className="action-name">{item.action}</div>
                                                    <div className="action-bar">
                                                        <div
                                                            className="bar"
                                                            style={{
                                                                width: `${(item.count / Math.max(...analytics.actionTrends.map(a => a.count))) * 100}%`,
                                                                backgroundColor: getActionColor(item.action)
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <div className="action-count">{item.count}</div>
                                                </div>
                                            ))}
                                    </div>
                                </div>

                                {/* Resource Distribution */}
                                <div className="analytics-card">
                                    <h3>📦 Resources Affected</h3>
                                    <div className="resource-list">
                                        {analytics.resourceDistribution?.map((res) => (
                                            <div key={res.resource_type} className="resource-item">
                                                <span>{res.resource_type}</span>
                                                <span className="count">{res.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Hourly Distribution */}
                                <div className="analytics-card">
                                    <h3>⏰ Activity by Hour</h3>
                                    <div className="hourly-chart">
                                        {analytics.hourlyDistribution?.map((item) => (
                                            <div key={item.hour} className="hour-column">
                                                <div
                                                    className="hour-bar"
                                                    style={{
                                                        height: `${(item.count / Math.max(...analytics.hourlyDistribution.map(h => h.count))) * 100}px`
                                                    }}
                                                ></div>
                                                <small>{item.hour}h</small>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="loading">Loading analytics...</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditLogDashboard;
