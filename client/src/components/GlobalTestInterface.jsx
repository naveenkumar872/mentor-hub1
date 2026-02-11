import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { X, Clock, ChevronLeft, ChevronRight, Send, AlertTriangle, Brain, FileText, Layers, Code, Database, CheckCircle, XCircle, Video, VideoOff, Mic, MicOff, Shield, Eye, Smartphone, Target, Play, Lightbulb, Zap, Award, Sparkles } from 'lucide-react'
import Editor from '@monaco-editor/react'
import axios from 'axios'
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import CodeOutputPreview from './CodeOutputPreview'
import SQLValidator from './SQLValidator'
import SQLVisualizer from './SQLVisualizer'
import SQLDebugger from './SQLDebugger'

const API_BASE = 'https://mentor-hub-backend-tkil.onrender.com/api'



const LANGUAGE_CONFIG = {
    'Python': { monacoLang: 'python', ext: '.py', defaultCode: `# Write your Python code here\n\ndef solution():\n    pass\n\n# Call your solution\nsolution()` },
    'JavaScript': { monacoLang: 'javascript', ext: '.js', defaultCode: `// Write your JavaScript code here\n\nfunction solution() {\n    \n}\n\n// Call your solution\nsolution();` },
    'Java': { monacoLang: 'java', ext: '.java', defaultCode: `// Write your Java code here\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}` },
    'C': { monacoLang: 'c', ext: '.c', defaultCode: `// Write your C code here\n#include <stdio.h>\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'C++': { monacoLang: 'cpp', ext: '.cpp', defaultCode: `// Write your C++ code here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'SQL': { monacoLang: 'sql', ext: '.sql', defaultCode: `-- Write your SQL query here\nSELECT * FROM table_name;` }
}

const SECTION_META = {
    aptitude: { label: 'Aptitude', icon: Brain },
    verbal: { label: 'Verbal', icon: FileText },
    logical: { label: 'Logical', icon: Layers },
    coding: { label: 'Coding', icon: Code },
    sql: { label: 'SQL', icon: Database }
}

function seededShuffle(arr, seed) {
    const a = [...arr]
    let i = a.length
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    while (i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

function generateSeed(studentId, testId) {
    let h = 0
    const s = `${studentId}-${testId}`
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0
    return Math.abs(h)
}

const cleanCode = (code) => {
    if (!code) return ''
    let cleaned = code
    // Check for markdown code blocks
    if (cleaned.includes('```')) {
        const lines = cleaned.split('\n')
        // Filter out lines that start with ```
        cleaned = lines.filter(l => !l.trim().startsWith('```')).join('\n')
    }
    return cleaned
}

export default function GlobalTestInterface({ test, user, onClose, onComplete }) {
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    const [answers, setAnswers] = useState({})
    const [timeLeft, setTimeLeft] = useState((test.duration || 180) * 60)
    const [tabSwitches, setTabSwitches] = useState(0)
    const [showWarning, setShowWarning] = useState(false)
    const [warningMessage, setWarningMessage] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [result, setResult] = useState(null)
    const [showResult, setShowResult] = useState(false)

    // Coding/Running State
    const [isRunning, setIsRunning] = useState(false)
    const [consoleOutput, setConsoleOutput] = useState({})
    const [hint, setHint] = useState('')
    const [loadingHint, setLoadingHint] = useState(false)

    const [activeTab, setActiveTab] = useState({}) // { [id]: 'input' | 'output' | 'tests' }
    const [customInputs, setCustomInputs] = useState({})
    const [testResults, setTestResults] = useState({})
    const [selectedLanguages, setSelectedLanguages] = useState({}) // { [id]: 'Python' }

    // SQL Tools State
    const [sqlTool, setSqlTool] = useState('validator') // 'validator', 'visualizer', 'debugger'

    const timerRef = useRef(null)
    const answersRef = useRef(answers)
    const tabSwitchesRef = useRef(tabSwitches)
    const timeLeftRef = useRef(timeLeft)

    // Enhanced Proctoring State
    const proctoring = test.proctoring || {}
    const [videoEnabled, setVideoEnabled] = useState(false)
    const [audioEnabled, setAudioEnabled] = useState(false)
    const [mediaStream, setMediaStream] = useState(null)
    const [cameraBlocked, setCameraBlocked] = useState(false)
    const [cameraBlockedCount, setCameraBlockedCount] = useState(0)
    const [phoneDetected, setPhoneDetected] = useState(false)
    const [phoneDetectionCount, setPhoneDetectionCount] = useState(0)
    const [copyPasteAttempts, setCopyPasteAttempts] = useState(0)
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const cameraCheckIntervalRef = useRef(null)
    const objectDetectorRef = useRef(null)
    const phoneCheckIntervalRef = useRef(null)
    const cameraBlockedCountRef = useRef(0)
    const phoneDetectionCountRef = useRef(0)
    const copyPasteAttemptsRef = useRef(0)

    const sectionsWithQuestions = useMemo(() => {
        const bySection = test.questionsBySection || {}
        return ['aptitude', 'verbal', 'logical', 'coding', 'sql'].filter(s => (bySection[s] && bySection[s].length) > 0)
    }, [test.questionsBySection])

    const allQuestions = useMemo(() => {
        const bySection = test.questionsBySection || {}
        const seed = generateSeed(user.id, test.id)
        const list = []
        sectionsWithQuestions.forEach(section => {
            const qs = (bySection[section] || []).map(q => ({ ...q, section }))
            list.push(...seededShuffle(qs, seed + section.length))
        })
        return list
    }, [test.questionsBySection, sectionsWithQuestions, user.id, test.id])

    const currentSection = sectionsWithQuestions[currentSectionIndex] || sectionsWithQuestions[0]
    const sectionQuestions = allQuestions.filter(q => q.section === currentSection)
    const currentQ = sectionQuestions[currentQuestionIndex]
    const totalQuestions = allQuestions.length

    useEffect(() => { answersRef.current = answers }, [answers])
    useEffect(() => { tabSwitchesRef.current = tabSwitches }, [tabSwitches])
    useEffect(() => { timeLeftRef.current = timeLeft }, [timeLeft])

    useEffect(() => {
        (async () => {
            try { await document.documentElement.requestFullscreen() } catch (_) { }
        })()
        return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }) }
    }, [])

    useEffect(() => {
        if (result || !totalQuestions) return
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    handleSubmit(true)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timerRef.current)
    }, [result, totalQuestions])

    const maxTabSwitches = test.maxTabSwitches ?? 3
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden && !result) {
                setTabSwitches(prev => {
                    const next = prev + 1
                    if (next >= maxTabSwitches) {
                        setWarningMessage(`Disqualified: max tab switches (${next}) exceeded.`)
                        setShowWarning(true)
                        setTimeout(() => handleSubmit(true), 2000)
                    } else {
                        setWarningMessage(`Tab switch detected (${next}/${maxTabSwitches}).`)
                        setShowWarning(true)
                        setTimeout(() => setShowWarning(false), 3000)
                    }
                    return next
                })
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [result, maxTabSwitches])

    // Enhanced Proctoring: Video/Audio Initialization
    useEffect(() => {
        if (proctoring.enabled && proctoring.enableVideoAudio) {
            const initMedia = async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user', width: 320, height: 240 },
                        audio: true
                    })
                    setMediaStream(stream)
                    setVideoEnabled(true)
                    setAudioEnabled(true)
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream
                        videoRef.current.play().catch(() => { })
                    }
                    if (proctoring.detectCameraBlocking) {
                        cameraCheckIntervalRef.current = setInterval(checkCameraObstruction, 2000)
                    }
                } catch (e) {
                    console.warn('Media access ignored:', e)
                }
            }
            initMedia()
        }
        return () => {
            if (cameraCheckIntervalRef.current) clearInterval(cameraCheckIntervalRef.current)
            if (phoneCheckIntervalRef.current) clearInterval(phoneCheckIntervalRef.current)
            if (mediaStream) mediaStream.getTracks().forEach(t => t.stop())
        }
    }, [proctoring.enabled, proctoring.enableVideoAudio])

    const checkCameraObstruction = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 240
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        let totalBrightness = 0
        let pixelCount = canvas.width * canvas.height
        for (let i = 0; i < data.length; i += 4) {
            totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3
        }
        const avgBrightness = totalBrightness / pixelCount
        const isBlocked = avgBrightness < 20
        if (isBlocked && !cameraBlocked) {
            setCameraBlocked(true)
            setCameraBlockedCount(prev => {
                const next = prev + 1
                cameraBlockedCountRef.current = next
                setWarningMessage(`⚠️ Camera blocked detected! (${next})`)
                setShowWarning(true)
                setTimeout(() => setShowWarning(false), 3000)
                return next
            })
        } else if (!isBlocked && cameraBlocked) {
            setCameraBlocked(false)
        }
    }, [cameraBlocked])

    useEffect(() => {
        if (!proctoring.enabled || !proctoring.disableCopyPaste) return
        const handleCopy = (e) => {
            e.preventDefault()
            setCopyPasteAttempts(prev => {
                const next = prev + 1
                copyPasteAttemptsRef.current = next
                setWarningMessage(`📋 Copy attempt blocked! (${next})`)
                setShowWarning(true)
                setTimeout(() => setShowWarning(false), 2000)
                return next
            })
        }
        const handlePaste = (e) => {
            e.preventDefault()
            setCopyPasteAttempts(prev => {
                const next = prev + 1
                copyPasteAttemptsRef.current = next
                setWarningMessage(`📋 Paste attempt blocked! (${next})`)
                setShowWarning(true)
                setTimeout(() => setShowWarning(false), 2000)
                return next
            })
        }
        const handleContextMenu = (e) => e.preventDefault()
        document.addEventListener('copy', handleCopy)
        document.addEventListener('paste', handlePaste)
        document.addEventListener('contextmenu', handleContextMenu)
        return () => {
            document.removeEventListener('copy', handleCopy)
            document.removeEventListener('paste', handlePaste)
            document.removeEventListener('contextmenu', handleContextMenu)
        }
    }, [proctoring.enabled, proctoring.disableCopyPaste])

    useEffect(() => { cameraBlockedCountRef.current = cameraBlockedCount }, [cameraBlockedCount])
    useEffect(() => { phoneDetectionCountRef.current = phoneDetectionCount }, [phoneDetectionCount])
    useEffect(() => { copyPasteAttemptsRef.current = copyPasteAttempts }, [copyPasteAttempts])

    const handleAnswerSelect = (questionId, answer) => {
        setAnswers(prev => ({ ...prev, [questionId]: answer }))
    }

    // Initialize code/SQL from starter or default
    useEffect(() => {
        if (!currentQ) return
        const isCodingOrSql = (currentQ.questionType === 'coding' || currentQ.questionType === 'sql' || currentQ.type === 'coding' || currentQ.type === 'SQL')

        if (isCodingOrSql) {
            // Determine initial language
            const defaultLang = currentQ.type === 'SQL' || currentQ.questionType === 'sql' ? 'SQL' : (currentQ.testCases?.language || 'Python')

            // Set selected language if not set
            if (!selectedLanguages[currentQ.id]) {
                // Normalize to Capitalized key if needed (e.g. 'python' -> 'Python')
                const key = Object.keys(LANGUAGE_CONFIG).find(k => k.toLowerCase() === defaultLang.toLowerCase()) || 'Python'
                setSelectedLanguages(prev => ({ ...prev, [currentQ.id]: key }))

                // Set initial answer if empty
                if (answers[currentQ.id] === undefined) {
                    // Always use default starter to prevent AI solution leakage
                    const starter = LANGUAGE_CONFIG[key].defaultCode
                    setAnswers(prev => ({ ...prev, [currentQ.id]: starter }))
                }
            }
        }
    }, [currentQ?.id, currentQ?.questionType, currentQ?.starterCode, currentQ?.testCases?.language])

    const handleLanguageChange = (questionId, newLang) => {
        // Removed confirm dialog to prevent exiting fullscreen
        if (answers[questionId] && answers[questionId] !== LANGUAGE_CONFIG[selectedLanguages[questionId]]?.defaultCode) {
            // Silently overwrite or maybe show a non-intrusive toast in future
        }
        setSelectedLanguages(prev => ({ ...prev, [questionId]: newLang }))
        setAnswers(prev => ({ ...prev, [questionId]: LANGUAGE_CONFIG[newLang].defaultCode }))
    }

    const handleRunCode = async (questionId, code, language, sqlSchema) => {
        setConsoleOutput(prev => ({ ...prev, [questionId]: 'Running...' }))
        setActiveTab(prev => ({ ...prev, [questionId]: 'output' }))

        try {
            const res = await axios.post(`${API_BASE}/run`, {
                code,
                language,
                problemId: questionId,
                sqlSchema,
                stdin: customInputs[questionId] || ''
            })
            setConsoleOutput(prev => ({ ...prev, [questionId]: res.data.output || res.data.error || 'No output' }))
        } catch (err) {
            setConsoleOutput(prev => ({ ...prev, [questionId]: 'Error: ' + (err.response?.data?.error || err.message) }))
        } finally {
            setIsRunning(false)
        }
    }

    const handleGetHint = async () => {
        if (!currentQ) return
        setLoadingHint(true)
        try {
            const res = await axios.post(`${API_BASE}/hints`, {
                problemDescription: currentQ.question,
                currentCode: answers[currentQ.id] || '',
                language: currentQ.testCases?.language || 'python'
            })
            setHint(res.data.hint)
        } catch (err) {
            setHint('Unable to generate hint at this time.')
        } finally {
            setLoadingHint(false)
        }
    }

    const handleSubmit = async (auto = false) => {
        if (isSubmitting) return
        if (!auto && totalQuestions > 0 && Object.keys(answers).length < totalQuestions) {
            if (!window.confirm(`You have ${totalQuestions - Object.keys(answers).length} unanswered. Submit anyway?`)) return
        }
        setIsSubmitting(true)
        if (mediaStream) {
            mediaStream.getTracks().forEach(t => t.stop())
        }
        if (cameraCheckIntervalRef.current) clearInterval(cameraCheckIntervalRef.current)
        if (phoneCheckIntervalRef.current) clearInterval(phoneCheckIntervalRef.current)

        try {
            const timeSpent = (test.duration || 120) * 60 - timeLeftRef.current
            console.log('[Submit] Sending submission...')
            const res = await axios.post(`${API_BASE}/global-tests/${test.id}/submit`, {
                studentId: user.id,
                answers: answersRef.current,
                timeSpent,
                tabSwitches: tabSwitchesRef.current,
                copyPasteAttempts: copyPasteAttemptsRef.current,
                cameraBlockedCount: cameraBlockedCountRef.current,
                phoneDetectionCount: phoneDetectionCountRef.current,
                proctoringEnabled: proctoring.enabled || false
            })
            console.log('[Submit] Response:', res.data)

            // Ensure we have valid result data
            const submissionResult = res.data.submission || res.data
            if (submissionResult) {
                setResult(submissionResult)
                setShowResult(true)
                setIsSubmitting(false)
            } else {
                console.error('[Submit] No submission data in response')
                setIsSubmitting(false)
                alert('Test submitted but no result data received. Please refresh the page.')
            }
        } catch (e) {
            console.error('[Submit] Error:', e)
            setIsSubmitting(false)
            alert(e.response?.data?.error || 'Submit failed. Please try again.')
        }
    }

    const formatTime = (s) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }

    const nextQuestion = () => {
        if (currentQuestionIndex < sectionQuestions.length - 1) setCurrentQuestionIndex(i => i + 1)
        else if (currentSectionIndex < sectionsWithQuestions.length - 1) {
            setCurrentSectionIndex(currentSectionIndex + 1)
            setCurrentQuestionIndex(0)
        }
    }

    const prevQuestion = () => {
        if (currentQuestionIndex > 0) setCurrentQuestionIndex(i => i - 1)
        else if (currentSectionIndex > 0) {
            const prevSec = sectionsWithQuestions[currentSectionIndex - 1]
            const prevLen = allQuestions.filter(q => q.section === prevSec).length
            setCurrentSectionIndex(currentSectionIndex - 1)
            setCurrentQuestionIndex(prevLen - 1)
        }
    }

    if (showResult && result) {
        // Auto-exit fullscreen when showing result
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { })
        }
        const sectionScores = result.sectionScores || {}
        const isPassed = result.status === 'passed'
        return (
            <div style={{
                position: 'fixed',
                inset: 0,
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                overflow: 'auto',
                animation: 'fadeIn 0.3s ease-out'
            }}>
                <style>{`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
                    @keyframes confetti { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(-100px) rotate(720deg); opacity: 0; } }
                `}</style>

                <div style={{
                    background: 'rgba(30,41,59,0.98)',
                    borderRadius: '24px',
                    border: `2px solid ${isPassed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                    maxWidth: 800,
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: `0 25px 50px -12px ${isPassed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                    animation: 'scaleIn 0.4s ease-out'
                }}>
                    {/* Header with success/fail indicator */}
                    <div style={{
                        padding: '2rem 2rem 1.5rem',
                        background: isPassed ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1))' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(251, 146, 60, 0.1))',
                        borderBottom: `1px solid ${isPassed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: isPassed ? 'linear-gradient(135deg, #10b981, #06b6d4)' : 'linear-gradient(135deg, #ef4444, #f97316)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1rem',
                            boxShadow: `0 8px 24px ${isPassed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                            animation: isPassed ? 'pulse 2s ease-in-out infinite' : 'none'
                        }}>
                            {isPassed ? <Award size={40} color="white" /> : <XCircle size={40} color="white" />}
                        </div>
                        <h2 style={{ margin: '0 0 0.5rem', color: 'white', fontSize: '1.75rem', fontWeight: 800 }}>
                            {isPassed ? '🎉 Congratulations!' : 'Test Completed'}
                        </h2>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '1rem' }}>
                            {isPassed ? 'You have successfully passed the assessment!' : 'Keep practicing to improve your score.'}
                        </p>
                    </div>

                    <div style={{ padding: '2rem', overflowY: 'auto' }}>
                        {/* Score Card */}
                        <div style={{
                            display: 'flex',
                            gap: '1.5rem',
                            marginBottom: '2rem',
                            flexWrap: 'wrap',
                            justifyContent: 'center'
                        }}>
                            <div style={{
                                padding: '1.5rem 2.5rem',
                                background: isPassed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                borderRadius: 16,
                                border: `2px solid ${isPassed ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
                                textAlign: 'center',
                                minWidth: '180px'
                            }}>
                                <div style={{
                                    fontSize: '3.5rem',
                                    fontWeight: 900,
                                    color: isPassed ? '#10b981' : '#ef4444',
                                    lineHeight: 1
                                }}>
                                    {result.score ?? result.overallPercentage}%
                                </div>
                                <div style={{
                                    fontSize: '0.9rem',
                                    color: 'rgba(255,255,255,0.6)',
                                    marginTop: '0.5rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '2px',
                                    fontWeight: 600
                                }}>
                                    Overall Score
                                </div>
                            </div>
                            <div style={{
                                padding: '1.5rem 2rem',
                                background: 'rgba(139, 92, 246, 0.1)',
                                borderRadius: 16,
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a78bfa' }}>
                                    {result.correctCount || 0}/{result.totalQuestions || 0}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.25rem' }}>
                                    Correct Answers
                                </div>
                            </div>
                        </div>

                        {/* Section Scores */}
                        <h3 style={{ margin: '0 0 1rem', color: 'white', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Layers size={18} color="#8b5cf6" /> Section-wise Performance
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                            {Object.entries(sectionScores).map(([sec, score]) => {
                                const scoreColor = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
                                return (
                                    <div key={sec} style={{
                                        padding: '1rem',
                                        background: 'rgba(30, 41, 59, 0.8)',
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: scoreColor }}>{score}%</div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize', marginTop: '0.25rem' }}>{sec}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '1.25rem 2rem',
                        borderTop: '1px solid rgba(139,92,246,0.2)',
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '1rem',
                        background: 'rgba(15, 23, 42, 0.5)'
                    }}>
                        <button
                            type="button"
                            onClick={() => {
                                if (document.fullscreenElement) document.exitFullscreen();
                                onClose();
                                onComplete && onComplete(result);
                            }}
                            style={{
                                padding: '0.85rem 2.5rem',
                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                border: 'none',
                                borderRadius: '12px',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: '1rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.target.style.transform = 'translateY(-2px)'}
                            onMouseOut={e => e.target.style.transform = 'translateY(0)'}
                        >
                            Close & View Results
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (allQuestions.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>No questions available.<button onClick={onClose} style={{ marginLeft: '1rem', padding: '0.5rem', cursor: 'pointer' }}>Close</button></div>

    const isSql = currentQ?.questionType === 'sql' || currentQ?.questionType === 'SQL' || currentQ?.language === 'SQL' || currentQ?.type === 'SQL'
    const isCoding = (currentQ?.questionType === 'coding' || currentQ?.type === 'coding' || !!currentQ?.language) && !isSql

    const currentLang = selectedLanguages[currentQ?.id] || (isSql ? 'SQL' : 'Python')
    const codeOrSql = (isCoding || isSql) ? (answers[currentQ?.id] ?? LANGUAGE_CONFIG[currentLang]?.defaultCode ?? '') : ''

    const samples = useMemo(() => {
        if (!currentQ) return { input: 'N/A', output: 'N/A' }

        // Try top-level properties first
        if (currentQ.sampleInput !== undefined && currentQ.expectedOutput !== undefined) {
            return { input: String(currentQ.sampleInput), output: String(currentQ.expectedOutput) }
        }

        // Fallback to test cases
        if (currentQ.testCases) {
            // For SQL questions: testCases is { expectedOutput: "..." }
            if (currentQ.questionType === 'sql' || currentQ.type === 'SQL') {
                const expectedOutput = currentQ.testCases.expectedOutput || 'N/A'
                return {
                    input: 'N/A',
                    output: String(expectedOutput)
                }
            }

            // For coding questions: testCases has cases array
            const cases = Array.isArray(currentQ.testCases) ? currentQ.testCases : (currentQ.testCases.cases || [])
            const sample = cases.find(c => !c.isHidden) || cases[0]
            if (sample) {
                const rawInput = sample.input ?? sample.sampleInput ?? '(empty)';
                const rawOutput = sample.expected_output ?? sample.expectedOutput ?? '(empty)';
                return {
                    input: String(rawInput),
                    output: String(rawOutput)
                }
            }
        }
        return { input: 'N/A', output: 'N/A' }
    }, [currentQ])

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 9999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {showWarning && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: '1rem 2rem', background: '#f59e0b', color: '#1f2937', textAlign: 'center', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={20} />
                    <span>{warningMessage}</span>
                </div>
            )}

            {/* Submitting Overlay */}
            {isSubmitting && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.95)',
                    zIndex: 100000,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1.5rem'
                }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        border: '4px solid rgba(139, 92, 246, 0.2)',
                        borderTopColor: '#8b5cf6',
                        animation: 'spin 1s linear infinite'
                    }}></div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <h2 style={{ margin: 0, color: 'white', fontSize: '1.5rem', fontWeight: 700 }}>Submitting Your Test...</h2>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem' }}>Please wait while we evaluate your answers</p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1.5s ease-in-out infinite' }}></div>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1.5s ease-in-out 0.2s infinite' }}></div>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1.5s ease-in-out 0.4s infinite' }}></div>
                    </div>
                    <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } }`}</style>
                </div>
            )}
            <header style={{ padding: '1rem 2rem', borderBottom: '1px solid rgba(139,92,246,0.2)', background: 'rgba(15,23,42,0.95)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {sectionsWithQuestions.map((sec, i) => (
                            <button key={sec} type="button" onClick={() => { setCurrentSectionIndex(i); setCurrentQuestionIndex(0) }} style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', background: currentSectionIndex === i ? 'rgba(139,92,246,0.2)' : 'transparent', color: document.body.classList.contains('light') ? (currentSectionIndex === i ? '#8b5cf6' : '#64748b') : 'white', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {SECTION_META[sec]?.icon && <span style={{ opacity: 0.7 }}><Layers size={14} /></span>}
                                {SECTION_META[sec]?.label || sec}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>{Object.keys(answers).length}/{totalQuestions} answered</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: timeLeft < 300 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', borderRadius: 8, border: `1px solid ${timeLeft < 300 ? '#ef4444' : '#10b981'}` }}>
                        <Clock size={18} color={timeLeft < 300 ? '#ef4444' : '#10b981'} />
                        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'white', fontWeight: 600 }}>{formatTime(timeLeft)}</span>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}>Exit</button>
                </div>
            </header>

            {/* MAIN CONTENT - Conditional Layouts */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: '250px', background: 'rgba(30,41,59,0.5)', borderRight: '1px solid rgba(139,92,246,0.2)', padding: '1.5rem', overflowY: 'auto' }}>
                    <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Target size={16} /> Question Palette</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                        {sectionQuestions.map((_, i) => (
                            <button key={i} onClick={() => setCurrentQuestionIndex(i)} style={{ width: 36, height: 36, borderRadius: 8, border: currentQuestionIndex === i ? '2px solid #3b82f6' : '1px solid rgba(139,92,246,0.3)', background: answers[sectionQuestions[i].id] ? 'linear-gradient(135deg, #10b981, #06b6d4)' : (currentQuestionIndex === i ? 'rgba(59,130,246,0.3)' : 'transparent'), color: 'white', cursor: 'pointer', fontSize: '0.85rem' }}>{i + 1}</button>
                        ))}
                    </div>
                </div>

                {(!isCoding && !isSql) ? (
                    // APTITUDE LAYOUT (Sidebar + Content)
                    <>
                        <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
                            <div style={{ marginBottom: '1rem', fontSize: '1rem', color: '#8b5cf6', fontWeight: 600 }}>Question {currentQuestionIndex + 1} OF {sectionQuestions.length}</div>
                            <h2 style={{ fontSize: '1.25rem', color: 'white', lineHeight: 1.6, marginBottom: '2rem' }}>{currentQ?.question}</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {(currentQ?.options || []).map((opt, i) => (
                                    <button key={i} onClick={() => handleAnswerSelect(currentQ.id, opt)} style={{ padding: '1.25rem', textAlign: 'left', borderRadius: 12, border: `1px solid ${answers[currentQ.id] === opt ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`, background: answers[currentQ.id] === opt ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.02)', color: 'white', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'all 0.2s' }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', background: answers[currentQ.id] === opt ? '#8b5cf6' : 'transparent' }}>{String.fromCharCode(65 + i)}</div>
                                        {opt}
                                    </button>
                                ))}
                            </div>
                            <div style={{ marginTop: 'auto', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
                                <button onClick={prevQuestion} disabled={currentSectionIndex === 0 && currentQuestionIndex === 0} style={{ padding: '0.75rem 1.5rem', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ChevronLeft size={20} /> Previous</button>
                                <button onClick={nextQuestion} style={{ padding: '0.75rem 1.5rem', borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Next <ChevronRight size={20} /></button>
                            </div>
                        </div>
                    </>
                ) : (
                    // CODING & SQL SPLIT LAYOUT
                    <>
                        <div style={{ width: '35%', minWidth: '350px', maxWidth: '450px', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
                            <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: 'rgba(139, 92, 246, 0.15)', padding: '0.6rem', borderRadius: '10px' }}>
                                            <FileText size={20} color="#8b5cf6" />
                                        </div>
                                        <h3 style={{ margin: 0, color: 'white', fontSize: '1.2rem', fontWeight: 700 }}>Problem Statement</h3>
                                    </div>
                                    <div style={{
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '20px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        background: currentQ.difficulty?.toLowerCase() === 'hard' ? 'rgba(239, 68, 68, 0.1)' : (currentQ.difficulty?.toLowerCase() === 'medium' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)'),
                                        color: currentQ.difficulty?.toLowerCase() === 'hard' ? '#ef4444' : (currentQ.difficulty?.toLowerCase() === 'medium' ? '#f59e0b' : '#10b981'),
                                        border: `1px solid ${currentQ.difficulty?.toLowerCase() === 'hard' ? 'rgba(239, 68, 68, 0.2)' : (currentQ.difficulty?.toLowerCase() === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)')}`
                                    }}>
                                        {currentQ.difficulty || 'Medium'}
                                    </div>
                                </div>
                                <div style={{ color: '#94a3b8', lineHeight: 1.8, fontSize: '1rem', letterSpacing: '-0.01em' }}>{currentQ.question}</div>

                                {isSql && (
                                    <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#60a5fa' }}>
                                                <Database size={18} />
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Database Schema</span>
                                            </div>
                                            <div style={{
                                                background: '#0f172a',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                                overflow: 'hidden',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                            }}>
                                                <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem 1rem', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>schema.sql</span>
                                                    <Database size={12} color="rgba(255,255,255,0.3)" />
                                                </div>
                                                <pre style={{
                                                    margin: 0,
                                                    padding: '1.25rem',
                                                    fontSize: '0.85rem',
                                                    color: '#93c5fd',
                                                    overflowX: 'auto',
                                                    whiteSpace: 'pre-wrap',
                                                    fontFamily: '"Fira Code", "Source Code Pro", monospace',
                                                    lineHeight: 1.6
                                                }}>{currentQ.sqlSchema || currentQ.starterCode || 'No schema provided'}</pre>
                                            </div>
                                        </div>

                                        {/* Expected Output for SQL */}
                                        {samples.output && samples.output !== 'N/A' && (
                                            <div style={{ marginTop: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#10b981' }}>
                                                    <Target size={16} />
                                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expected Output</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'rgba(16, 185, 129, 0.6)', marginLeft: 'auto' }}>Your query should produce this result</span>
                                                </div>
                                                <div style={{
                                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.05))',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                                    overflow: 'hidden',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                                }}>
                                                    {/* Parse and display as table if pipe-separated */}
                                                    {samples.output.includes('|') ? (
                                                        <div style={{ overflowX: 'auto' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: '"Fira Code", monospace', fontSize: '0.85rem' }}>
                                                                <tbody>
                                                                    {samples.output.split('\n').filter(Boolean).map((row, rowIdx) => {
                                                                        const cells = row.split('|').map(c => c.trim());
                                                                        const isHeader = rowIdx === 0 && cells.every(c => /^[a-zA-Z_\s]+$/.test(c));
                                                                        return (
                                                                            <tr key={rowIdx} style={{
                                                                                background: isHeader ? 'rgba(16, 185, 129, 0.15)' : rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                                                                            }}>
                                                                                {cells.map((cell, cellIdx) => (
                                                                                    isHeader ? (
                                                                                        <th key={cellIdx} style={{
                                                                                            padding: '0.75rem 1rem',
                                                                                            textAlign: 'left',
                                                                                            color: '#10b981',
                                                                                            fontWeight: 700,
                                                                                            borderBottom: '2px solid rgba(16, 185, 129, 0.3)',
                                                                                            whiteSpace: 'nowrap'
                                                                                        }}>{cell}</th>
                                                                                    ) : (
                                                                                        <td key={cellIdx} style={{
                                                                                            padding: '0.65rem 1rem',
                                                                                            color: '#4ade80',
                                                                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                                                            whiteSpace: 'nowrap'
                                                                                        }}>{cell}</td>
                                                                                    )
                                                                                ))}
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        /* Plain text display for non-table output */
                                                        <pre style={{
                                                            margin: 0,
                                                            padding: '1rem',
                                                            fontFamily: '"Fira Code", monospace',
                                                            fontSize: '0.85rem',
                                                            color: '#4ade80',
                                                            whiteSpace: 'pre-wrap',
                                                            lineHeight: 1.6
                                                        }}>{samples.output}</pre>
                                                    )}
                                                </div>
                                                <div style={{
                                                    marginTop: '0.5rem',
                                                    padding: '0.5rem 0.75rem',
                                                    background: 'rgba(245, 158, 11, 0.1)',
                                                    borderRadius: '8px',
                                                    border: '1px solid rgba(245, 158, 11, 0.2)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem'
                                                }}>
                                                    <Lightbulb size={14} color="#f59e0b" />
                                                    <span style={{ fontSize: '0.75rem', color: '#fbbf24' }}>
                                                        Tip: Your output should match both the data values and ordering. Column headers may vary.
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!isSql && (
                                    <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {/* Sample Input */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#94a3b8' }}>
                                                <FileText size={16} />
                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sample Input</span>
                                            </div>
                                            <div style={{
                                                background: '#1e293b',
                                                padding: '1rem',
                                                borderRadius: '10px',
                                                border: '1px solid #334155',
                                                fontFamily: '"Fira Code", monospace',
                                                fontSize: '0.9rem',
                                                color: '#e2e8f0',
                                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                                            }}>{samples.input}</div>
                                        </div>

                                        {/* Expected Output */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#10b981' }}>
                                                <CheckCircle size={16} />
                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expected Output</span>
                                            </div>
                                            <div style={{
                                                background: 'rgba(16, 185, 129, 0.05)',
                                                padding: '1rem',
                                                borderRadius: '10px',
                                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                                fontFamily: '"Fira Code", monospace',
                                                fontSize: '0.9rem',
                                                color: '#4ade80',
                                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                                            }}>{samples.output}</div>
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginTop: '2rem' }}>
                                    <button onClick={handleGetHint} disabled={loadingHint} style={{ width: '100%', padding: '0.75rem', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        <Lightbulb size={16} /> {loadingHint ? 'Loading...' : 'Get AI Hint'}
                                    </button>
                                    {hint && <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(16,185,129,0.1)', color: '#4ade80', borderRadius: 8, fontSize: '0.9rem' }}>💡 {hint}</div>}
                                </div>
                            </div>
                            <div style={{ padding: '1rem', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between' }}>
                                <button onClick={prevQuestion} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', borderRadius: 6, cursor: 'pointer' }}>Prev</button>
                                <button onClick={nextQuestion} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', borderRadius: 6, cursor: 'pointer' }}>Next</button>
                            </div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111827' }}>
                            <div style={{
                                padding: '0.75rem 1.25rem',
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: 'rgba(31, 41, 55, 0.4)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Zap size={14} color="#f59e0b" style={{ opacity: 0.8 }} />
                                        <div style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Language</div>
                                    </div>
                                    <select
                                        value={currentLang}
                                        onChange={(e) => handleLanguageChange(currentQ.id, e.target.value)}
                                        disabled={isSql}
                                        style={{
                                            background: '#1f2937',
                                            color: '#f3f4f6',
                                            border: '1px solid #374151',
                                            borderRadius: '8px',
                                            padding: '0.4rem 0.75rem',
                                            cursor: isSql ? 'default' : 'pointer',
                                            fontSize: '0.85rem',
                                            outline: 'none',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                        }}
                                    >
                                        {Object.keys(LANGUAGE_CONFIG).map(lang => (
                                            <option key={lang} value={lang} disabled={isSql && lang !== 'SQL'}>{lang}</option>
                                        ))}
                                    </select>
                                </div>

                                {!isSql && (
                                    <button
                                        onClick={() => handleRunCode(currentQ.id, codeOrSql, currentLang, currentQ.sqlSchema)}
                                        disabled={isRunning}
                                        style={{
                                            padding: '0.6rem 1.25rem',
                                            background: isRunning ? '#374151' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                            border: 'none',
                                            borderRadius: '8px',
                                            color: 'white',
                                            fontWeight: 600,
                                            cursor: isRunning ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.6rem',
                                            boxShadow: isRunning ? 'none' : '0 4px 10px rgba(37, 99, 235, 0.3)',
                                            transition: 'all 0.2s',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        {isRunning ? (
                                            <>
                                                <div className="animate-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }}></div>
                                                Running...
                                            </>
                                        ) : (
                                            <>
                                                <Play size={16} fill="white" /> Run Code
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Editor
                                    height="100%"
                                    defaultLanguage={isSql ? 'sql' : 'python'}
                                    language={LANGUAGE_CONFIG[currentLang]?.monacoLang || 'python'}
                                    theme="vs-dark"
                                    value={codeOrSql}
                                    onChange={v => setAnswers(prev => ({ ...prev, [currentQ.id]: v || '' }))}
                                    options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 16 } }}
                                />
                            </div>

                            {/* SQL TOOLS PANEL */}
                            {isSql && (
                                <div style={{ height: '350px', borderTop: '1px solid #334151', background: '#020617', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{
                                        padding: '0.75rem 1.25rem',
                                        background: '#0f172a',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div style={{ display: 'flex', gap: '1.25rem' }}>
                                            <button
                                                onClick={() => setSqlTool('validator')}
                                                style={{
                                                    padding: '0.5rem 0.75rem',
                                                    background: 'transparent',
                                                    color: sqlTool === 'validator' ? '#3b82f6' : '#94a3b8',
                                                    border: 'none',
                                                    borderBottom: `2px solid ${sqlTool === 'validator' ? '#3b82f6' : 'transparent'}`,
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.6rem',
                                                    transition: 'all 0.2s',
                                                    marginTop: '2px'
                                                }}
                                            >
                                                <Shield size={16} /> Validator
                                            </button>
                                            <button
                                                onClick={() => setSqlTool('visualizer')}
                                                style={{
                                                    padding: '0.5rem 0.75rem',
                                                    background: 'transparent',
                                                    color: sqlTool === 'visualizer' ? '#8b5cf6' : '#94a3b8',
                                                    border: 'none',
                                                    borderBottom: `2px solid ${sqlTool === 'visualizer' ? '#8b5cf6' : 'transparent'}`,
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.6rem',
                                                    transition: 'all 0.2s',
                                                    marginTop: '2px'
                                                }}
                                            >
                                                <Database size={16} /> ER Diagram
                                            </button>
                                            <button
                                                onClick={() => setSqlTool('debugger')}
                                                style={{
                                                    padding: '0.5rem 0.75rem',
                                                    background: 'transparent',
                                                    color: sqlTool === 'debugger' ? '#10b981' : '#94a3b8',
                                                    border: 'none',
                                                    borderBottom: `2px solid ${sqlTool === 'debugger' ? '#10b981' : 'transparent'}`,
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.6rem',
                                                    transition: 'all 0.2s',
                                                    marginTop: '2px'
                                                }}
                                            >
                                                <Layers size={16} /> Debugger
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontWeight: 500, textTransform: 'uppercase' }}>Advanced SQL Tools</div>
                                    </div>
                                    <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem', background: 'radial-gradient(circle at top left, rgba(30,41,59,0.3), transparent)' }}>
                                        {sqlTool === 'validator' && <SQLValidator query={codeOrSql} schemaContext={currentQ.sqlSchema || currentQ.starterCode} />}
                                        {sqlTool === 'visualizer' && <SQLVisualizer schema={currentQ.sqlSchema || currentQ.starterCode} />}
                                        {sqlTool === 'debugger' && <SQLDebugger query={codeOrSql} schema={currentQ.sqlSchema || currentQ.starterCode} />}
                                    </div>
                                </div>
                            )}


                            {/* STANDARD CONSOLE OUTPUT (FOR NON-SQL) */}
                            {!isSql && (
                                <div style={{ height: '350px', borderTop: '1px solid #334155', background: '#020617', display: 'flex', flexDirection: 'column' }}>
                                    {/* Tabs */}
                                    <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', background: '#0f172a' }}>
                                        {['input', 'output', 'tests'].map(tab => {
                                            const isActive = (activeTab[currentQ.id] || 'input') === tab
                                            return (
                                                <button
                                                    key={tab}
                                                    onClick={() => setActiveTab(prev => ({ ...prev, [currentQ.id]: tab }))}
                                                    style={{
                                                        padding: '0.75rem 1.25rem',
                                                        background: isActive ? '#1e293b' : 'transparent',
                                                        border: 'none',
                                                        borderBottom: isActive ? `2px solid ${tab === 'input' ? '#f59e0b' : tab === 'output' ? '#3b82f6' : '#10b981'}` : '2px solid transparent',
                                                        color: isActive ? (tab === 'input' ? '#fbbf24' : tab === 'output' ? '#60a5fa' : '#4ade80') : '#64748b',
                                                        cursor: 'pointer',
                                                        fontSize: '0.85rem',
                                                        fontWeight: 500,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem'
                                                    }}
                                                >
                                                    {tab === 'input' && <><FileText size={14} /> Custom Input</>}
                                                    {tab === 'output' && <><Code size={14} /> Output <span style={{ width: 6, height: 6, borderRadius: '50%', background: consoleOutput[currentQ.id] ? '#10b981' : 'transparent', marginLeft: 4 }}></span></>}
                                                    {tab === 'tests' && <><CheckCircle size={14} /> Test Cases
                                                        {testResults[currentQ.id] && (
                                                            <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 4, marginLeft: 4 }}>
                                                                {testResults[currentQ.id].passed}/{testResults[currentQ.id].total}
                                                            </span>
                                                        )}
                                                    </>}
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {/* Tab Content */}
                                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                        {(activeTab[currentQ.id] || 'input') === 'input' && (
                                            <div style={{ padding: '0.75rem', flex: 1 }}>
                                                <textarea
                                                    value={customInputs[currentQ.id] || ''}
                                                    onChange={(e) => setCustomInputs(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                                                    placeholder="Enter custom input here..."
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        background: '#0f172a',
                                                        color: '#e2e8f0',
                                                        border: '1px solid #334155',
                                                        borderRadius: '8px',
                                                        padding: '0.75rem',
                                                        fontFamily: 'monospace',
                                                        resize: 'none',
                                                        outline: 'none',
                                                        fontSize: '0.9rem'
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {(activeTab[currentQ.id] || 'input') === 'output' && (
                                            <div style={{ padding: '1rem', fontFamily: 'monospace', color: '#e2e8f0', fontSize: '0.9rem', whiteSpace: 'pre-wrap', flex: 1 }}>
                                                {consoleOutput[currentQ.id] || 'No output yet. Run your code to see results.'}
                                            </div>
                                        )}

                                        {(activeTab[currentQ.id] || 'input') === 'tests' && (
                                            <div style={{ padding: '1rem' }}>
                                                <CodeOutputPreview
                                                    problemId={currentQ.id}
                                                    code={codeOrSql}
                                                    language={currentQ.testCases?.language || 'python'}
                                                    isGlobalTest={true}
                                                    onRunComplete={(results) => {
                                                        if (results?.testResults) {
                                                            setTestResults(prev => ({
                                                                ...prev,
                                                                [currentQ.id]: {
                                                                    passed: results.testResults.filter(r => r.passed).length,
                                                                    total: results.testResults.length
                                                                }
                                                            }))
                                                        }
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                        </div>
                    </>
                )}
            </div>

            {/* GLOBAL SUBMIT FOOTER */}
            <div style={{ padding: '1rem 2rem', borderTop: '1px solid rgba(139,92,246,0.2)', background: 'rgba(15,23,42,0.95)', display: 'flex', justifyContent: 'center' }}>
                <button
                    onClick={() => handleSubmit(false)}
                    disabled={isSubmitting}
                    style={{ padding: '0.8rem 2rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)' }}
                >
                    <Send size={20} /> {isSubmitting ? 'Submitting Test...' : 'Submit Complete Test'}
                </button>
            </div>

            {/* Hidden Canvas for Proctoring */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    )
}
