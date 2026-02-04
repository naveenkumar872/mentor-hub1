import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Clock, CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight, Send, Eye, Brain, Target, Award, Sparkles } from 'lucide-react'
import axios from 'axios'

const API_BASE = 'https://mentor-hub-backend-tkil.onrender.com/api'

// ==================== APTITUDE TEST INTERFACE (PROCTORED) ====================
function AptitudeTestInterface({ test, user, onClose, onComplete }) {
    const [currentQuestion, setCurrentQuestion] = useState(0)
    const [answers, setAnswers] = useState({})
    const [timeLeft, setTimeLeft] = useState(test.duration * 60)
    const [tabSwitches, setTabSwitches] = useState(0)
    const [showWarning, setShowWarning] = useState(false)
    const [warningMessage, setWarningMessage] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [forceExit, setForceExit] = useState(false)
    const [result, setResult] = useState(null)
    const [showResult, setShowResult] = useState(false)

    const questions = test.questions || []
    const timerRef = useRef(null)

    // Enter fullscreen on mount
    useEffect(() => {
        const enterFullscreen = async () => {
            try {
                await document.documentElement.requestFullscreen()
            } catch (err) {
                console.log('Fullscreen request failed:', err)
            }
        }
        enterFullscreen()

        return () => {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => { })
            }
        }
    }, [])

    // Timer countdown
    useEffect(() => {
        if (result || forceExit) return

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    handleAutoSubmit()
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(timerRef.current)
    }, [result, forceExit])

    // Get max tab switches from test config (default to 3)
    const maxAllowedTabSwitches = test.maxTabSwitches || 3

    // Tab switch detection
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && !result && !forceExit) {
                setTabSwitches(prev => {
                    const newCount = prev + 1

                    if (newCount >= maxAllowedTabSwitches) {
                        // Max violations reached - Force exit
                        setWarningMessage(`🚫 DISQUALIFIED! You have exceeded the maximum allowed tab switches (${newCount}/${maxAllowedTabSwitches}). Test terminated.`)
                        setShowWarning(true)
                        setForceExit(true)

                        // Auto-submit with penalty
                        setTimeout(() => {
                            handleAutoSubmit(true)
                        }, 3000)
                    } else {
                        setWarningMessage(`⚠️ Tab switch detected! (${newCount}/${maxAllowedTabSwitches} violations) ${maxAllowedTabSwitches - newCount} more will disqualify you!`)
                        setShowWarning(true)
                        setTimeout(() => setShowWarning(false), 4000)
                    }

                    return newCount
                })
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [result, forceExit])

    // Prevent right-click and key shortcuts
    useEffect(() => {
        const preventContextMenu = (e) => e.preventDefault()
        const preventShortcuts = (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey) {
                if (['c', 'v', 'u', 'p', 's', 'a'].includes(e.key.toLowerCase())) {
                    e.preventDefault()
                }
            }
            if (e.key === 'F12' || e.key === 'Escape') {
                e.preventDefault()
            }
        }

        document.addEventListener('contextmenu', preventContextMenu)
        document.addEventListener('keydown', preventShortcuts)

        return () => {
            document.removeEventListener('contextmenu', preventContextMenu)
            document.removeEventListener('keydown', preventShortcuts)
        }
    }, [])

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const handleAnswerSelect = (questionId, answer) => {
        setAnswers(prev => ({
            ...prev,
            [questionId]: answer
        }))
    }

    const handleAutoSubmit = async (disqualified = false) => {
        setIsSubmitting(true)
        try {
            const response = await axios.post(`${API_BASE}/aptitude/${test.id}/submit`, {
                studentId: user.id,
                answers: disqualified ? {} : answers,
                timeSpent: (test.duration * 60) - timeLeft,
                tabSwitches
            })

            setResult(response.data.submission)
            setShowResult(true)
        } catch (error) {
            console.error('Submit failed:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleSubmit = async () => {
        if (Object.keys(answers).length < questions.length) {
            const unanswered = questions.length - Object.keys(answers).length
            if (!window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) {
                return
            }
        }
        await handleAutoSubmit()
    }

    const answeredCount = Object.keys(answers).length

    if (showResult && result) {
        return (
            <div style={{
                position: 'fixed',
                inset: 0,
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem'
            }}>
                <div style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '24px',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    padding: '3rem',
                    maxWidth: '600px',
                    width: '100%',
                    textAlign: 'center'
                }}>
                    <div style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        background: result.status === 'passed'
                            ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                            : 'linear-gradient(135deg, #ef4444, #f97316)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem'
                    }}>
                        {result.status === 'passed' ? (
                            <Award size={48} color="white" />
                        ) : (
                            <Target size={48} color="white" />
                        )}
                    </div>

                    <h2 style={{
                        fontSize: '2rem',
                        fontWeight: 800,
                        color: result.status === 'passed' ? '#10b981' : '#ef4444',
                        marginBottom: '0.5rem'
                    }}>
                        {result.status === 'passed' ? 'Congratulations!' : 'Keep Practicing!'}
                    </h2>

                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                        {result.status === 'passed'
                            ? 'You passed the aptitude test successfully!'
                            : 'Don\'t worry, you can try again and improve!'}
                    </p>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '1rem',
                        marginBottom: '2rem'
                    }}>
                        <div style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            borderRadius: '12px',
                            padding: '1rem'
                        }}>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6' }}>
                                {result.score}%
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Score</div>
                        </div>
                        <div style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            borderRadius: '12px',
                            padding: '1rem'
                        }}>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>
                                {result.correctCount}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Correct</div>
                        </div>
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            borderRadius: '12px',
                            padding: '1rem'
                        }}>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444' }}>
                                {result.totalQuestions - result.correctCount}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Wrong</div>
                        </div>
                    </div>

                    {/* Question Review */}
                    <div style={{
                        background: 'rgba(15, 23, 42, 0.5)',
                        borderRadius: '12px',
                        padding: '1rem',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        marginBottom: '2rem',
                        textAlign: 'left'
                    }}>
                        {result.questionResults?.map((qr, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.5rem 0',
                                borderBottom: idx < result.questionResults.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'
                            }}>
                                {qr.isCorrect ? (
                                    <CheckCircle size={18} color="#10b981" />
                                ) : (
                                    <XCircle size={18} color="#ef4444" />
                                )}
                                <span style={{
                                    fontSize: '0.85rem',
                                    color: qr.isCorrect ? '#10b981' : '#ef4444',
                                    flex: 1
                                }}>
                                    Q{idx + 1}: {qr.category}
                                </span>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={() => {
                            if (document.fullscreenElement) {
                                document.exitFullscreen()
                            }
                            onClose()
                            if (onComplete) onComplete(result)
                        }}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            border: 'none',
                            borderRadius: '12px',
                            color: 'white',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Close & Return
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 2rem',
                background: 'rgba(15, 23, 42, 0.8)',
                borderBottom: '1px solid rgba(139, 92, 246, 0.2)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Brain size={28} color="#8b5cf6" />
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>
                            Aptitude Test – {test.title}
                        </h1>
                    </div>
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: timeLeft < 60 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${timeLeft < 60 ? '#ef4444' : '#10b981'}`
                }}>
                    <Clock size={20} color={timeLeft < 60 ? '#ef4444' : '#10b981'} />
                    <span style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: timeLeft < 60 ? '#ef4444' : '#10b981'
                    }}>
                        {formatTime(timeLeft)}
                    </span>
                </div>
            </div>

            {/* Warning Banner */}
            {showWarning && (
                <div style={{
                    background: tabSwitches >= 3 ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    padding: '1rem 2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1rem',
                    animation: 'pulse 1s infinite'
                }}>
                    <AlertTriangle size={24} color="white" />
                    <span style={{ color: 'white', fontWeight: 600 }}>{warningMessage}</span>
                </div>
            )}

            {/* Main Content */}
            <div style={{
                display: 'flex',
                flex: 1,
                overflow: 'hidden'
            }}>
                {/* Left Sidebar - Question Palette */}
                <div style={{
                    width: '200px',
                    background: 'rgba(30, 41, 59, 0.5)',
                    borderRight: '1px solid rgba(139, 92, 246, 0.2)',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <h3 style={{
                            margin: 0,
                            fontSize: '0.9rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <Target size={16} /> Question Palette
                        </h3>
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                            {answeredCount}/{questions.length} Answered
                        </p>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '0.5rem',
                        marginBottom: '1.5rem'
                    }}>
                        {questions.map((q, idx) => (
                            <button
                                key={q.id}
                                onClick={() => setCurrentQuestion(idx)}
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '8px',
                                    border: currentQuestion === idx ? '2px solid #3b82f6' : 'none',
                                    background: answers[q.id]
                                        ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                                        : currentQuestion === idx
                                            ? 'rgba(59, 130, 246, 0.3)'
                                            : 'rgba(71, 85, 105, 0.5)',
                                    color: 'white',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {idx + 1}
                            </button>
                        ))}
                    </div>

                    <div style={{ marginTop: 'auto' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.5rem'
                        }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '4px',
                                background: 'linear-gradient(135deg, #10b981, #06b6d4)'
                            }}></div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Answered</span>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '4px',
                                background: 'rgba(71, 85, 105, 0.5)'
                            }}></div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unanswered</span>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        style={{
                            marginTop: '1.5rem',
                            width: '100%',
                            padding: '1rem',
                            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                            border: 'none',
                            borderRadius: '12px',
                            color: 'white',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            opacity: isSubmitting ? 0.7 : 1
                        }}
                    >
                        <Send size={18} />
                        {isSubmitting ? 'Submitting...' : 'Submit Test'}
                    </button>
                </div>

                {/* Right - Question Display */}
                <div style={{
                    flex: 1,
                    padding: '2rem 4rem',
                    overflowY: 'auto'
                }}>
                    {questions[currentQuestion] && (
                        <>
                            <div style={{ marginBottom: '2rem' }}>
                                <span style={{
                                    color: '#8b5cf6',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    Question {currentQuestion + 1} of {questions.length}
                                </span>
                                <h2 style={{
                                    margin: '1rem 0',
                                    fontSize: '1.5rem',
                                    fontWeight: 600,
                                    color: 'white',
                                    lineHeight: 1.5
                                }}>
                                    {questions[currentQuestion].question}
                                </h2>
                                {questions[currentQuestion].category && (
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '0.25rem 0.75rem',
                                        background: 'rgba(139, 92, 246, 0.2)',
                                        borderRadius: '20px',
                                        fontSize: '0.8rem',
                                        color: '#a78bfa'
                                    }}>
                                        {questions[currentQuestion].category}
                                    </span>
                                )}
                            </div>

                            {/* Options */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {questions[currentQuestion].options.map((option, idx) => {
                                    const optionLetter = ['A', 'B', 'C', 'D'][idx]
                                    const isSelected = answers[questions[currentQuestion].id] === option

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => handleAnswerSelect(questions[currentQuestion].id, option)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '1rem',
                                                padding: '1.25rem 1.5rem',
                                                background: isSelected
                                                    ? 'rgba(59, 130, 246, 0.15)'
                                                    : 'rgba(30, 41, 59, 0.8)',
                                                border: isSelected
                                                    ? '2px solid #3b82f6'
                                                    : '1px solid rgba(71, 85, 105, 0.5)',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '50%',
                                                background: isSelected
                                                    ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                                                    : 'rgba(71, 85, 105, 0.5)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                fontWeight: 700,
                                                fontSize: '0.9rem'
                                            }}>
                                                {optionLetter}
                                            </div>
                                            <span style={{
                                                color: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.9)',
                                                fontSize: '1.05rem',
                                                fontWeight: isSelected ? 600 : 400
                                            }}>
                                                {option}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Navigation */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginTop: '3rem'
                            }}>
                                <button
                                    onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
                                    disabled={currentQuestion === 0}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.75rem 1.5rem',
                                        background: 'rgba(71, 85, 105, 0.5)',
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: currentQuestion === 0 ? 'rgba(255,255,255,0.3)' : 'white',
                                        cursor: currentQuestion === 0 ? 'not-allowed' : 'pointer',
                                        fontSize: '0.95rem',
                                        fontWeight: 500
                                    }}
                                >
                                    <ChevronLeft size={20} /> Previous
                                </button>

                                <button
                                    onClick={() => setCurrentQuestion(prev => Math.min(questions.length - 1, prev + 1))}
                                    disabled={currentQuestion === questions.length - 1}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.75rem 1.5rem',
                                        background: currentQuestion === questions.length - 1
                                            ? 'rgba(71, 85, 105, 0.5)'
                                            : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: currentQuestion === questions.length - 1 ? 'rgba(255,255,255,0.3)' : 'white',
                                        cursor: currentQuestion === questions.length - 1 ? 'not-allowed' : 'pointer',
                                        fontSize: '0.95rem',
                                        fontWeight: 500
                                    }}
                                >
                                    Next <ChevronRight size={20} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AptitudeTestInterface
