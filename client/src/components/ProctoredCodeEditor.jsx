import { useState, useEffect, useRef, useCallback } from 'react'
import { AlertTriangle, Video, VideoOff, Mic, MicOff, Eye, Clock, X, CheckCircle, XCircle, Play, Send, Lightbulb, Code, Smartphone } from 'lucide-react'
import Editor from '@monaco-editor/react'
import axios from 'axios'
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'

const API_BASE = 'https://mentor-hub-backend-tkil.onrender.com/api'

// Language configurations
const LANGUAGE_CONFIG = {
    'Python': { monacoLang: 'python', ext: '.py', defaultCode: `# Write your Python code here\n\ndef solution():\n    pass\n\n# Call your solution\nsolution()` },
    'JavaScript': { monacoLang: 'javascript', ext: '.js', defaultCode: `// Write your JavaScript code here\n\nfunction solution() {\n    \n}\n\n// Call your solution\nsolution();` },
    'Java': { monacoLang: 'java', ext: '.java', defaultCode: `// Write your Java code here\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}` },
    'C': { monacoLang: 'c', ext: '.c', defaultCode: `// Write your C code here\n#include <stdio.h>\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'C++': { monacoLang: 'cpp', ext: '.cpp', defaultCode: `// Write your C++ code here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'SQL': { monacoLang: 'sql', ext: '.sql', defaultCode: `-- Write your SQL query here\nSELECT * FROM table_name;` }
}

function ProctoredCodeEditor({ problem, user, onClose, onSubmitSuccess }) {
    const [code, setCode] = useState(LANGUAGE_CONFIG[problem.language]?.defaultCode || '')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isRunning, setIsRunning] = useState(false)
    const [output, setOutput] = useState('')
    const [hint, setHint] = useState('')
    const [loadingHint, setLoadingHint] = useState(false)
    
    // Proctoring state
    const [tabSwitches, setTabSwitches] = useState(0)
    const [copyPasteAttempts, setCopyPasteAttempts] = useState(0)
    const [showWarning, setShowWarning] = useState(false)
    const [warningMessage, setWarningMessage] = useState('')
    const [isDisqualified, setIsDisqualified] = useState(false)
    const [startTime] = useState(Date.now())
    
    // Video/Audio state
    const [videoEnabled, setVideoEnabled] = useState(false)
    const [audioEnabled, setAudioEnabled] = useState(false)
    const [mediaStream, setMediaStream] = useState(null)
    const [cameraBlocked, setCameraBlocked] = useState(false)
    const [cameraBlockedCount, setCameraBlockedCount] = useState(0)
    const [phoneDetected, setPhoneDetected] = useState(false)
    const [phoneDetectionCount, setPhoneDetectionCount] = useState(0)
    const [modelLoaded, setModelLoaded] = useState(false)
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const cameraCheckIntervalRef = useRef(null)
    const cameraBlockedRef = useRef(false)
    const phoneDetectedRef = useRef(false)
    const objectDetectorRef = useRef(null)
    const phoneCheckIntervalRef = useRef(null)

    const proctoring = problem.proctoring || {}
    const maxTabSwitches = proctoring.maxTabSwitches || 3

    // Initialize video/audio if enabled
    useEffect(() => {
        if (proctoring.enabled && proctoring.videoAudio) {
            initializeMedia()
        }
        return () => {
            stopCameraCheck()
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop())
            }
        }
    }, [])

    const initializeMedia = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480, facingMode: 'user' }, 
                audio: true 
            })
            setMediaStream(stream)
            setVideoEnabled(true)
            setAudioEnabled(true)
            if (videoRef.current) {
                videoRef.current.srcObject = stream
            }
            // Start camera obstruction detection
            startCameraCheck()
            // Load AI model for phone detection
            loadObjectDetectionModel()
        } catch (err) {
            console.error('Failed to access camera/microphone:', err)
            setWarningMessage('⚠️ Camera/Microphone access required for proctoring')
            setShowWarning(true)
        }
    }

    const stopAllMedia = () => {
        // Stop camera obstruction detection
        stopCameraCheck()
        // Stop phone detection
        stopPhoneDetection()
        // Stop all media tracks (camera + microphone)
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => {
                track.stop()
                console.log(`🛑 Stopped ${track.kind} track`)
            })
            setMediaStream(null)
        }
        // Clear video element
        if (videoRef.current) {
            videoRef.current.srcObject = null
        }
        setVideoEnabled(false)
        setAudioEnabled(false)
    }

    const handleClose = () => {
        stopAllMedia()
        onClose()
    }

    // Camera obstruction detection - checks if camera is blocked/covered
    const startCameraCheck = () => {
        // Create a hidden canvas for frame analysis
        const canvas = document.createElement('canvas')
        canvas.width = 64  // Small size for performance
        canvas.height = 48
        canvasRef.current = canvas

        // Check every 3 seconds
        cameraCheckIntervalRef.current = setInterval(() => {
            checkCameraObstruction()
        }, 3000)
    }

    const stopCameraCheck = () => {
        if (cameraCheckIntervalRef.current) {
            clearInterval(cameraCheckIntervalRef.current)
            cameraCheckIntervalRef.current = null
        }
    }

    const checkCameraObstruction = () => {
        if (!videoRef.current || !canvasRef.current) return

        const video = videoRef.current
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')

        // Draw current video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        
        // Get pixel data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const pixels = imageData.data
        
        // Analyze brightness and variance
        let totalBrightness = 0
        let darkPixels = 0
        let colorSum = { r: 0, g: 0, b: 0 }
        const totalPixels = pixels.length / 4

        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i]
            const g = pixels[i + 1]
            const b = pixels[i + 2]
            const brightness = (r + g + b) / 3
            totalBrightness += brightness
            colorSum.r += r
            colorSum.g += g
            colorSum.b += b
            
            // Count very dark pixels (brightness < 30)
            if (brightness < 30) {
                darkPixels++
            }
        }

        const avgBrightness = totalBrightness / totalPixels
        const darkRatio = darkPixels / totalPixels
        const avgColor = {
            r: colorSum.r / totalPixels,
            g: colorSum.g / totalPixels,
            b: colorSum.b / totalPixels
        }

        // Calculate color variance (how different pixels are from average)
        let variance = 0
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i]
            const g = pixels[i + 1]
            const b = pixels[i + 2]
            variance += Math.abs(r - avgColor.r) + Math.abs(g - avgColor.g) + Math.abs(b - avgColor.b)
        }
        variance = variance / totalPixels / 3

        // Camera is blocked if:
        // 1. More than 90% of pixels are very dark (covered with dark material), OR
        // 2. Average brightness is very low (< 15), OR
        // 3. Very low variance (< 8) means uniform color = shutter/cover/tape
        const isBlocked = darkRatio > 0.90 || avgBrightness < 15 || variance < 8

        console.log(`Camera check - Brightness: ${avgBrightness.toFixed(1)}, Variance: ${variance.toFixed(1)}, Dark%: ${(darkRatio*100).toFixed(1)}%, Blocked: ${isBlocked}`)

        if (isBlocked && !cameraBlockedRef.current) {
            cameraBlockedRef.current = true
            setCameraBlocked(true)
            setCameraBlockedCount(prev => {
                const newCount = prev + 1
                setWarningMessage(`🚫 Camera obstruction detected! (${newCount} times) Please uncover your camera.`)
                setShowWarning(true)
                return newCount
            })
        } else if (!isBlocked && cameraBlockedRef.current) {
            cameraBlockedRef.current = false
            setCameraBlocked(false)
            setShowWarning(false)
        }
    }

    // Phone/Object detection using TensorFlow.js COCO-SSD
    const loadObjectDetectionModel = async () => {
        try {
            console.log('📱 Loading object detection model...')
            await tf.ready()
            const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
            objectDetectorRef.current = model
            setModelLoaded(true)
            console.log('✅ Object detection model loaded')
            // Start phone detection after model loads
            startPhoneDetection()
        } catch (err) {
            console.error('Failed to load object detection model:', err)
        }
    }

    const startPhoneDetection = () => {
        // Check every 2 seconds for phones
        phoneCheckIntervalRef.current = setInterval(() => {
            detectPhone()
        }, 2000)
    }

    const stopPhoneDetection = () => {
        if (phoneCheckIntervalRef.current) {
            clearInterval(phoneCheckIntervalRef.current)
            phoneCheckIntervalRef.current = null
        }
    }

    const detectPhone = async () => {
        if (!videoRef.current || !objectDetectorRef.current) {
            console.log('⏳ Phone detection skipped - video or model not ready')
            return
        }
        
        // Check if video is actually playing
        if (videoRef.current.readyState < 2) {
            console.log('⏳ Video not ready yet, readyState:', videoRef.current.readyState)
            return
        }
        
        try {
            const predictions = await objectDetectorRef.current.detect(videoRef.current)
            
            console.log('🔍 Detection ran, found:', predictions.length, 'objects:', predictions.map(p => `${p.class}(${(p.score*100).toFixed(0)}%)`).join(', '))
            
            // Check for cell phone, laptop, book, or remote (potential cheating devices)
            const suspiciousObjects = predictions.filter(p => 
                ['cell phone', 'laptop', 'book', 'remote'].includes(p.class) && 
                p.score > 0.4  // Lower threshold to 40% for better detection
            )
            
            const phoneFound = suspiciousObjects.some(p => p.class === 'cell phone' && p.score > 0.4)
            
            if (suspiciousObjects.length > 0) {
                console.log('🚨 Suspicious objects detected:', suspiciousObjects.map(p => `${p.class} (${(p.score*100).toFixed(0)}%)`))
            }

            if (phoneFound && !phoneDetectedRef.current) {
                phoneDetectedRef.current = true
                setPhoneDetected(true)
                setPhoneDetectionCount(prev => {
                    const newCount = prev + 1
                    setWarningMessage(`📱 Mobile phone detected! (${newCount} times) Remove all electronic devices from view.`)
                    setShowWarning(true)
                    return newCount
                })
            } else if (!phoneFound && phoneDetectedRef.current) {
                phoneDetectedRef.current = false
                setPhoneDetected(false)
                // Don't hide warning immediately, let it fade
                setTimeout(() => {
                    if (!phoneDetectedRef.current && !cameraBlockedRef.current) {
                        setShowWarning(false)
                    }
                }, 3000)
            }
        } catch (err) {
            console.error('Phone detection error:', err)
        }
    }

    // Tab switch detection
    useEffect(() => {
        if (!proctoring.enabled || !proctoring.trackTabSwitches) return

        const handleVisibilityChange = () => {
            if (document.hidden && !isDisqualified) {
                setTabSwitches(prev => {
                    const newCount = prev + 1
                    
                    if (newCount >= maxTabSwitches) {
                        setWarningMessage(`🚫 Maximum tab switches reached (${newCount}/${maxTabSwitches}). This will be reported.`)
                        setShowWarning(true)
                        setIsDisqualified(true)
                    } else {
                        setWarningMessage(`⚠️ Tab switch detected! (${newCount}/${maxTabSwitches}) ${maxTabSwitches - newCount} more will be flagged!`)
                        setShowWarning(true)
                        setTimeout(() => setShowWarning(false), 4000)
                    }
                    
                    return newCount
                })
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [proctoring, isDisqualified, maxTabSwitches])

    // Disable copy/paste
    useEffect(() => {
        if (!proctoring.enabled || !proctoring.disableCopyPaste) return

        const handleCopyPaste = (e) => {
            if (e.type === 'paste' || (e.ctrlKey && (e.key === 'v' || e.key === 'c'))) {
                e.preventDefault()
                setCopyPasteAttempts(prev => prev + 1)
                setWarningMessage('🚫 Copy/Paste is disabled for this problem!')
                setShowWarning(true)
                setTimeout(() => setShowWarning(false), 3000)
            }
        }

        const handleContextMenu = (e) => {
            e.preventDefault()
        }

        document.addEventListener('paste', handleCopyPaste)
        document.addEventListener('keydown', handleCopyPaste)
        document.addEventListener('contextmenu', handleContextMenu)
        
        return () => {
            document.removeEventListener('paste', handleCopyPaste)
            document.removeEventListener('keydown', handleCopyPaste)
            document.removeEventListener('contextmenu', handleContextMenu)
        }
    }, [proctoring])

    const handleRun = async () => {
        setIsRunning(true)
        setOutput('')
        try {
            const res = await axios.post(`${API_BASE}/run`, { 
                code, 
                language: problem.language, 
                problemId: problem.id 
            })
            setOutput(res.data.output || res.data.error || 'No output')
        } catch (err) {
            setOutput('Error running code: ' + (err.response?.data?.error || err.message))
        } finally {
            setIsRunning(false)
        }
    }

    const handleGetHint = async () => {
        setLoadingHint(true)
        try {
            const res = await axios.post(`${API_BASE}/hints`, {
                problemDescription: problem.description,
                currentCode: code,
                language: problem.language
            })
            setHint(res.data.hint)
        } catch (err) {
            setHint('Unable to generate hint at this time.')
        } finally {
            setLoadingHint(false)
        }
    }

    const handleSubmit = async () => {
        if (!code.trim()) {
            alert('Please write some code before submitting')
            return
        }
        
        setIsSubmitting(true)
        const timeSpent = Math.round((Date.now() - startTime) / 1000)
        
        try {
            const response = await axios.post(`${API_BASE}/submissions/proctored`, {
                studentId: user.id,
                problemId: problem.id,
                code,
                language: problem.language,
                submissionType: 'editor',
                tabSwitches,
                copyPasteAttempts,
                cameraBlockedCount,
                phoneDetectionCount,
                timeSpent,
                proctored: proctoring.enabled
            })
            
            // Stop all media (camera, microphone, recording)
            stopAllMedia()
            
            if (onSubmitSuccess) {
                onSubmitSuccess(response.data)
            }
            onClose()
        } catch (err) {
            alert('Submission failed: ' + (err.response?.data?.error || err.message))
        } finally {
            setIsSubmitting(false)
        }
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
                padding: '0.75rem 1.5rem',
                background: 'rgba(15, 23, 42, 0.9)',
                borderBottom: '1px solid rgba(139, 92, 246, 0.2)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Code size={24} color="#8b5cf6" />
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>
                            {problem.title}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
                                {problem.language}
                            </span>
                            <span className={`difficulty-badge ${problem.difficulty?.toLowerCase()}`} style={{ fontSize: '0.7rem' }}>
                                {problem.difficulty}
                            </span>
                            {proctoring.enabled && (
                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Eye size={12} /> Proctored
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Proctoring Status */}
                {proctoring.enabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {proctoring.trackTabSwitches && (
                            <div style={{
                                padding: '0.4rem 0.75rem',
                                borderRadius: '8px',
                                background: tabSwitches > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                border: `1px solid ${tabSwitches > 0 ? '#f59e0b' : '#10b981'}`,
                                fontSize: '0.8rem',
                                color: tabSwitches > 0 ? '#f59e0b' : '#10b981',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                <AlertTriangle size={14} />
                                Tab: {tabSwitches}/{maxTabSwitches}
                            </div>
                        )}
                        
                        {proctoring.disableCopyPaste && copyPasteAttempts > 0 && (
                            <div style={{
                                padding: '0.4rem 0.75rem',
                                borderRadius: '8px',
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: '1px solid #ef4444',
                                fontSize: '0.8rem',
                                color: '#ef4444'
                            }}>
                                Copy/Paste: {copyPasteAttempts}
                            </div>
                        )}

                        {/* Camera blocked indicator */}
                        {proctoring.videoAudio && cameraBlockedCount > 0 && (
                            <div style={{
                                padding: '0.4rem 0.75rem',
                                borderRadius: '8px',
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: '1px solid #ef4444',
                                fontSize: '0.8rem',
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                animation: cameraBlocked ? 'pulse 1s infinite' : 'none'
                            }}>
                                <VideoOff size={14} />
                                Cam Blocked: {cameraBlockedCount}
                            </div>
                        )}

                        {/* Phone detection indicator */}
                        {proctoring.videoAudio && phoneDetectionCount > 0 && (
                            <div style={{
                                padding: '0.4rem 0.75rem',
                                borderRadius: '8px',
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: '1px solid #ef4444',
                                fontSize: '0.8rem',
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                animation: phoneDetected ? 'pulse 1s infinite' : 'none'
                            }}>
                                <Smartphone size={14} />
                                Phone: {phoneDetectionCount}
                            </div>
                        )}

                        {proctoring.videoAudio && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{
                                    padding: '0.4rem',
                                    borderRadius: '6px',
                                    background: cameraBlocked ? 'rgba(239, 68, 68, 0.2)' : (videoEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                                    border: `1px solid ${cameraBlocked ? '#ef4444' : (videoEnabled ? '#10b981' : '#ef4444')}`
                                }}>
                                    {cameraBlocked ? <VideoOff size={16} color="#ef4444" /> : (videoEnabled ? <Video size={16} color="#10b981" /> : <VideoOff size={16} color="#ef4444" />)}
                                </div>
                                <div style={{
                                    padding: '0.4rem',
                                    borderRadius: '6px',
                                    background: audioEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                    border: `1px solid ${audioEnabled ? '#10b981' : '#ef4444'}`
                                }}>
                                    {audioEnabled ? <Mic size={16} color="#10b981" /> : <MicOff size={16} color="#ef4444" />}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={handleClose}
                    style={{
                        background: 'rgba(71, 85, 105, 0.5)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <X size={20} />
                </button>
            </div>

            {/* Warning Banner */}
            {showWarning && (
                <div style={{
                    background: isDisqualified ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    padding: '0.75rem 2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    animation: 'pulse 1s infinite'
                }}>
                    <AlertTriangle size={20} color="white" />
                    <span style={{ color: 'white', fontWeight: 600 }}>{warningMessage}</span>
                </div>
            )}

            {/* Main Content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left - Problem Description */}
                <div style={{
                    width: '35%',
                    borderRight: '1px solid rgba(139, 92, 246, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
                        <h3 style={{ margin: '0 0 1rem', color: 'white' }}>Problem Description</h3>
                        <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {problem.description}
                        </p>
                        
                        {problem.sampleInput && (
                            <div style={{ marginTop: '1.5rem' }}>
                                <strong style={{ color: '#8b5cf6' }}>Sample Input:</strong>
                                <pre style={{ 
                                    background: 'rgba(0,0,0,0.3)', 
                                    padding: '0.75rem', 
                                    borderRadius: '8px', 
                                    marginTop: '0.5rem',
                                    color: '#10b981',
                                    fontSize: '0.85rem'
                                }}>
                                    {problem.sampleInput}
                                </pre>
                            </div>
                        )}
                        
                        {problem.expectedOutput && (
                            <div style={{ marginTop: '1rem' }}>
                                <strong style={{ color: '#8b5cf6' }}>Expected Output:</strong>
                                <pre style={{ 
                                    background: 'rgba(0,0,0,0.3)', 
                                    padding: '0.75rem', 
                                    borderRadius: '8px', 
                                    marginTop: '0.5rem',
                                    color: '#3b82f6',
                                    fontSize: '0.85rem'
                                }}>
                                    {problem.expectedOutput}
                                </pre>
                            </div>
                        )}

                        {/* Hint Section */}
                        <div style={{ marginTop: '1.5rem' }}>
                            <button
                                onClick={handleGetHint}
                                disabled={loadingHint}
                                style={{
                                    background: 'rgba(245, 158, 11, 0.1)',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    color: '#f59e0b',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    cursor: loadingHint ? 'not-allowed' : 'pointer',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <Lightbulb size={16} />
                                {loadingHint ? 'Getting hint...' : 'Get AI Hint'}
                            </button>
                            {hint && (
                                <div style={{
                                    marginTop: '0.75rem',
                                    padding: '0.75rem',
                                    background: 'rgba(245, 158, 11, 0.1)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(245, 158, 11, 0.2)',
                                    fontSize: '0.85rem',
                                    color: 'rgba(255,255,255,0.8)'
                                }}>
                                    💡 {hint}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Video Preview (if enabled) */}
                    {proctoring.enabled && proctoring.videoAudio && (
                        <div style={{ 
                            padding: '0.75rem', 
                            borderTop: '1px solid rgba(139, 92, 246, 0.2)',
                            background: 'rgba(0,0,0,0.3)',
                            position: 'relative',
                            flex: 1,
                            minHeight: '200px',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{
                                    width: '100%',
                                    flex: 1,
                                    objectFit: 'contain',
                                    borderRadius: '8px',
                                    background: '#000',
                                    border: cameraBlocked ? '3px solid #ef4444' : '2px solid #10b981',
                                    opacity: cameraBlocked ? 0.5 : 1
                                }}
                            />
                            {/* Camera blocked overlay */}
                            {cameraBlocked && (
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    background: 'rgba(239, 68, 68, 0.9)',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    color: 'white',
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <VideoOff size={14} /> CAMERA BLOCKED
                                </div>
                            )}
                            <p style={{ 
                                margin: '0.5rem 0 0', 
                                fontSize: '0.7rem', 
                                color: cameraBlocked ? '#ef4444' : '#10b981', 
                                textAlign: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem'
                            }}>
                                {!cameraBlocked && (
                                    <span style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: '#10b981',
                                        animation: 'pulse 1s infinite'
                                    }}></span>
                                )}
                                {cameraBlocked ? '⚠️ Uncover your camera!' : (modelLoaded ? '🤖 AI Monitoring Active' : '⏳ Loading AI...')}
                            </p>
                        </div>
                    )}
                </div>

                {/* Right - Code Editor & Output */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Code Editor */}
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <Editor
                            height="100%"
                            language={LANGUAGE_CONFIG[problem.language]?.monacoLang || 'python'}
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            theme="vs-dark"
                            options={{
                                fontSize: 14,
                                minimap: { enabled: false },
                                lineNumbers: 'on',
                                automaticLayout: true,
                                tabSize: 4,
                                wordWrap: 'on',
                                scrollBeyondLastLine: false
                            }}
                        />
                    </div>

                    {/* Output Panel */}
                    <div style={{
                        height: '150px',
                        borderTop: '1px solid rgba(139, 92, 246, 0.2)',
                        background: 'rgba(0,0,0,0.3)',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ 
                            padding: '0.5rem 1rem', 
                            borderBottom: '1px solid rgba(139, 92, 246, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Output</span>
                        </div>
                        <pre style={{ 
                            flex: 1, 
                            margin: 0, 
                            padding: '0.75rem', 
                            overflowY: 'auto',
                            fontSize: '0.85rem',
                            color: output.includes('Error') ? '#ef4444' : '#10b981'
                        }}>
                            {isRunning ? 'Running...' : (output || 'Run your code to see output')}
                        </pre>
                    </div>

                    {/* Action Buttons */}
                    <div style={{
                        padding: '0.75rem 1rem',
                        borderTop: '1px solid rgba(139, 92, 246, 0.2)',
                        background: 'rgba(15, 23, 42, 0.5)',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.75rem'
                    }}>
                        <button
                            onClick={handleRun}
                            disabled={isRunning}
                            style={{
                                padding: '0.6rem 1.25rem',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: '8px',
                                color: '#10b981',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                cursor: isRunning ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Play size={16} />
                            {isRunning ? 'Running...' : 'Run Code'}
                        </button>
                        
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            style={{
                                padding: '0.6rem 1.5rem',
                                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                opacity: isSubmitting ? 0.7 : 1
                            }}
                        >
                            <Send size={16} />
                            {isSubmitting ? 'Submitting...' : 'Submit Solution'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ProctoredCodeEditor
