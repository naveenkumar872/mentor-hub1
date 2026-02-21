import React from 'react'

/**
 * Error Boundary Component
 * Catches JavaScript errors in child component tree and displays a fallback UI
 * instead of crashing the entire application with a white screen.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo })
        console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null })
    }

    render() {
        if (this.state.hasError) {
            // Custom fallback UI
            if (this.props.fallback) {
                return this.props.fallback
            }

            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: this.props.fullPage ? '100vh' : '300px',
                    padding: '40px 20px',
                    background: 'var(--bg-secondary, #f9fafb)',
                    borderRadius: this.props.fullPage ? '0' : '12px',
                    margin: this.props.fullPage ? '0' : '20px'
                }}>
                    <div style={{
                        background: 'var(--bg-primary, white)',
                        borderRadius: '16px',
                        padding: '40px',
                        maxWidth: '500px',
                        width: '100%',
                        textAlign: 'center',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                        <h2 style={{
                            fontSize: '20px',
                            fontWeight: '600',
                            color: 'var(--text-primary, #1a1a2e)',
                            marginBottom: '8px'
                        }}>
                            {this.props.title || 'Something went wrong'}
                        </h2>
                        <p style={{
                            color: 'var(--text-secondary, #64748b)',
                            fontSize: '14px',
                            marginBottom: '24px',
                            lineHeight: '1.5'
                        }}>
                            {this.props.message || 'An unexpected error occurred. Please try again or refresh the page.'}
                        </p>
                        {this.state.error && (
                            <details style={{
                                textAlign: 'left',
                                marginBottom: '20px',
                                padding: '12px',
                                background: 'var(--bg-tertiary, #f1f5f9)',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: 'var(--text-secondary, #64748b)'
                            }}>
                                <summary style={{ cursor: 'pointer', fontWeight: '500' }}>
                                    Error Details
                                </summary>
                                <pre style={{
                                    marginTop: '8px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    fontFamily: 'monospace'
                                }}>
                                    {this.state.error.toString()}
                                </pre>
                            </details>
                        )}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                onClick={this.handleRetry}
                                style={{
                                    padding: '10px 24px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: 'var(--accent-primary, #3b82f6)',
                                    color: 'white',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                Try Again
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                style={{
                                    padding: '10px 24px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color, #e2e8f0)',
                                    background: 'transparent',
                                    color: 'var(--text-primary, #1a1a2e)',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                Refresh Page
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
