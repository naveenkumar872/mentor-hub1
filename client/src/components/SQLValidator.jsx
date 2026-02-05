import React, { useState } from 'react'
import axios from 'axios'
import { Table, Copy, CheckCircle, XCircle } from 'lucide-react'

const API_BASE = 'http://localhost:3000/api'

function SQLValidator({ query, schemaContext }) {
    const [executing, setExecuting] = useState(false)
    const [executionResult, setExecutionResult] = useState(null)

    const executeAndVisualize = async () => {
        if (!query?.trim()) return
        setExecuting(true)
        setExecutionResult(null)
        
        try {
            const res = await axios.post(`${API_BASE}/sql/execute-visualize`, {
                query,
                schema: schemaContext || ''
            })
            setExecutionResult(res.data)
        } catch (error) {
            setExecutionResult({
                success: false,
                error: error.response?.data?.error || 'Execution failed'
            })
        } finally {
            setExecuting(false)
        }
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
    }

    // Parse output into rows for display
    const getTableData = () => {
        if (!executionResult?.parsedData) return { columns: [], rows: [] }
        
        const { columns, rows } = executionResult.parsedData
        return { columns: columns || [], rows: rows || [] }
    }

    const { columns, rows } = getTableData()

    return (
        <div style={{ marginTop: '1rem' }}>
            {/* Run & Visualize Button */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <button
                    onClick={executeAndVisualize}
                    disabled={executing || !query?.trim()}
                    style={{ 
                        fontSize: '0.85rem', 
                        padding: '0.6rem 1rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: executing || !query?.trim() ? 'not-allowed' : 'pointer',
                        opacity: executing || !query?.trim() ? 0.6 : 1,
                        fontWeight: 500
                    }}
                >
                    {executing ? (
                        <>
                            <span className="spinner-small"></span>
                            Running...
                        </>
                    ) : (
                        <>
                            <Table size={16} />
                            Run & Visualize
                        </>
                    )}
                </button>
            </div>

            {/* Results Display */}
            {executionResult && (
                <div style={{ 
                    background: 'var(--bg-dark)', 
                    borderRadius: '12px', 
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)'
                }}>
                    {/* Header */}
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-card)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {executionResult.success ? (
                                <>
                                    <CheckCircle size={16} color="#10b981" />
                                    <span style={{ fontWeight: 500, color: '#10b981' }}>Results</span>
                                </>
                            ) : (
                                <>
                                    <XCircle size={16} color="#ef4444" />
                                    <span style={{ fontWeight: 500, color: '#ef4444' }}>Error</span>
                                </>
                            )}
                        </div>
                        {executionResult.success && rows.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {rows.length} row(s) returned
                                </span>
                                <button
                                    onClick={() => copyToClipboard(executionResult.output || '')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        padding: '0.3rem 0.6rem',
                                        fontSize: '0.75rem',
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Copy size={12} /> Copy
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <div style={{ padding: '1rem' }}>
                        {executionResult.success ? (
                            <>
                                {columns.length > 0 && rows.length > 0 ? (
                                    <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
                                        <table style={{
                                            width: '100%',
                                            borderCollapse: 'collapse',
                                            fontSize: '0.85rem'
                                        }}>
                                            <thead>
                                                <tr style={{ 
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    position: 'sticky',
                                                    top: 0
                                                }}>
                                                    {columns.map((col, i) => (
                                                        <th key={i} style={{
                                                            padding: '0.75rem 1rem',
                                                            textAlign: 'left',
                                                            borderBottom: '2px solid var(--border-color)',
                                                            fontWeight: 600,
                                                            color: '#3b82f6',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {col}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map((row, i) => (
                                                    <tr key={i} style={{
                                                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                                                    }}>
                                                        {row.map((cell, j) => (
                                                            <td key={j} style={{
                                                                padding: '0.6rem 1rem',
                                                                borderBottom: '1px solid var(--border-color)',
                                                                color: cell === null || cell === '' ? 'var(--text-muted)' : 'var(--text-main)'
                                                            }}>
                                                                {cell === null ? 'NULL' : cell}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div style={{ 
                                        padding: '1rem', 
                                        textAlign: 'center', 
                                        color: 'var(--text-muted)',
                                        fontStyle: 'italic'
                                    }}>
                                        Query executed successfully. No rows returned.
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{
                                padding: '1rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                borderRadius: '8px',
                                border: '1px solid rgba(239, 68, 68, 0.2)'
                            }}>
                                <pre style={{
                                    margin: 0,
                                    fontSize: '0.85rem',
                                    color: '#f87171',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    fontFamily: 'monospace'
                                }}>
                                    {executionResult.error || executionResult.output || 'Unknown error'}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default SQLValidator
