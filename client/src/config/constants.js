/**
 * Shared Constants
 * Single source of truth for values duplicated across components.
 */

// API base URL — used in all portals and components
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'

// Chart colors used across dashboards
export const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']

// Language configurations for code editors
export const LANGUAGE_CONFIG = {
    'Python': { monacoLang: 'python', ext: '.py', defaultCode: `# Write your Python code here\n\ndef solution():\n    pass\n\n# Call your solution\nsolution()` },
    'JavaScript': { monacoLang: 'javascript', ext: '.js', defaultCode: `// Write your JavaScript code here\n\nfunction solution() {\n    \n}\n\n// Call your solution\nsolution();` },
    'Java': { monacoLang: 'java', ext: '.java', defaultCode: `// Write your Java code here\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}` },
    'C': { monacoLang: 'c', ext: '.c', defaultCode: `// Write your C code here\n#include <stdio.h>\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'C++': { monacoLang: 'cpp', ext: '.cpp', defaultCode: `// Write your C++ code here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'SQL': { monacoLang: 'sql', ext: '.sql', defaultCode: `-- Write your SQL query here\nSELECT * FROM table_name;` }
}

// Format time ago utility
export function formatTimeAgo(dateString) {
    if (!dateString) return 'N/A'
    const now = new Date()
    const date = new Date(dateString)
    const seconds = Math.floor((now - date) / 1000)

    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    const weeks = Math.floor(days / 7)
    if (weeks < 4) return `${weeks}w ago`
    return date.toLocaleDateString()
}

// Difficulty color mapping
export function getDifficultyColor(difficulty) {
    switch (difficulty?.toLowerCase()) {
        case 'easy': return '#10b981'
        case 'medium': return '#f59e0b'
        case 'hard': return '#ef4444'
        default: return '#6b7280'
    }
}

// Status color mapping
export function getStatusColor(status) {
    switch (status?.toLowerCase()) {
        case 'accepted': case 'completed': case 'active': return '#10b981'
        case 'rejected': case 'failed': case 'inactive': return '#ef4444'
        case 'partial': case 'pending': return '#f59e0b'
        default: return '#6b7280'
    }
}

// Helper to add auth token to fetch/axios requests
export function getAuthHeaders() {
    const token = localStorage.getItem('authToken')
    return token ? { Authorization: `Bearer ${token}` } : {}
}

// Authenticated fetch helper
export async function authFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...options.headers
    }
    
    const response = await fetch(url, { ...options, headers })
    
    if (response.status === 401) {
        // Token expired or invalid — redirect to login
        localStorage.removeItem('authToken')
        localStorage.removeItem('currentUser')
        window.location.href = '/login'
        throw new Error('Session expired')
    }
    
    return response
}
