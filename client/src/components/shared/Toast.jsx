import { useState, useEffect, useCallback, createContext, useContext } from 'react'

/**
 * Lightweight Toast Notification System
 * Replaces all alert() calls with a clean, accessible toast UI.
 * 
 * Usage:
 *   const { toast } = useToast()
 *   toast.success('Students assigned successfully!')
 *   toast.error('Failed to load data')
 *   toast.info('Processing...')
 *   toast.warning('Are you sure?')
 */

const ToastContext = createContext(null)

export const useToast = () => {
    const context = useContext(ToastContext)
    if (!context) {
        // Fallback if used outside provider — still works with alert
        return {
            toast: {
                success: (msg) => console.log('[Toast]', msg),
                error: (msg) => console.error('[Toast]', msg),
                info: (msg) => console.info('[Toast]', msg),
                warning: (msg) => console.warn('[Toast]', msg)
            }
        }
    }
    return context
}

const TOAST_ICONS = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
}

const TOAST_COLORS = {
    success: { bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
    error: { bg: '#fef2f2', border: '#ef4444', text: '#dc2626' },
    info: { bg: '#eff6ff', border: '#3b82f6', text: '#2563eb' },
    warning: { bg: '#fffbeb', border: '#f59e0b', text: '#d97706' }
}

const TOAST_COLORS_DARK = {
    success: { bg: '#052e16', border: '#16a34a', text: '#4ade80' },
    error: { bg: '#450a0a', border: '#ef4444', text: '#fca5a5' },
    info: { bg: '#172554', border: '#3b82f6', text: '#93c5fd' },
    warning: { bg: '#451a03', border: '#f59e0b', text: '#fcd34d' }
}

function Toast({ id, type, message, onDismiss }) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const colors = isDark ? TOAST_COLORS_DARK[type] : TOAST_COLORS[type]

    useEffect(() => {
        const timer = setTimeout(() => onDismiss(id), 4000)
        return () => clearTimeout(timer)
    }, [id, onDismiss])

    return (
        <div
            role="alert"
            aria-live="assertive"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.text,
                fontSize: '14px',
                fontWeight: '500',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                animation: 'slideInRight 0.3s ease-out',
                maxWidth: '400px',
                wordBreak: 'break-word',
                cursor: 'pointer'
            }}
            onClick={() => onDismiss(id)}
        >
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{TOAST_ICONS[type]}</span>
            <span style={{ flex: 1 }}>{message}</span>
            <button
                onClick={(e) => { e.stopPropagation(); onDismiss(id) }}
                style={{
                    background: 'none',
                    border: 'none',
                    color: colors.text,
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '0 4px',
                    opacity: 0.7,
                    flexShrink: 0
                }}
                aria-label="Dismiss notification"
            >
                ×
            </button>
        </div>
    )
}

let toastCounter = 0

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([])

    const dismiss = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const addToast = useCallback((type, message) => {
        const id = ++toastCounter
        setToasts(prev => [...prev.slice(-4), { id, type, message }]) // Keep max 5
    }, [])

    const toast = {
        success: (msg) => addToast('success', msg),
        error: (msg) => addToast('error', msg),
        info: (msg) => addToast('info', msg),
        warning: (msg) => addToast('warning', msg)
    }

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Toast Container */}
            <div
                style={{
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    zIndex: 99999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    pointerEvents: 'none'
                }}
            >
                {toasts.map(t => (
                    <div key={t.id} style={{ pointerEvents: 'auto' }}>
                        <Toast id={t.id} type={t.type} message={t.message} onDismiss={dismiss} />
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </ToastContext.Provider>
    )
}

export default ToastContext
