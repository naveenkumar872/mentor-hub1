import { useState, useEffect, useRef, useCallback } from 'react'
import { AlertTriangle, Video, VideoOff, Mic, MicOff, Eye, Clock, X, CheckCircle, XCircle, Play, Send, Lightbulb, Code, Smartphone, Database, Layers, Shield, Users } from 'lucide-react'
import Editor from '@monaco-editor/react'
import axios from 'axios'
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as blazeface from '@tensorflow-models/blazeface'
import socketService from '../services/socketService'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'

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
    const [selectedLanguage, setSelectedLanguage] = useState(problem.language)
    const [code, setCode] = useState(LANGUAGE_CONFIG[problem.language]?.defaultCode || '')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isRunning, setIsRunning] = useState(false)
    const [output, setOutput] = useState('')
    const [hint, setHint] = useState('')
    const [loadingHint, setLoadingHint] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [customInput, setCustomInput] = useState('')
    const [activeOutputTab, setActiveOutputTab] = useState('output')
    const [testCases, setTestCases] = useState([])
    const [testResults, setTestResults] = useState([])
    const [runningTests, setRunningTests] = useState(false)
    const containerRef = useRef(null)

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

    // Face Detection state (NEW - BlazeFace)
    const [faceDetected, setFaceDetected] = useState(true)
    const [multipleFaces, setMultipleFaces] = useState(false)
    const [faceLookawayCount, setFaceLookawayCount] = useState(0)
    const [faceNotDetectedCount, setFaceNotDetectedCount] = useState(0)
    const [multipleFacesDetectionCount, setMultipleFacesDetectionCount] = useState(0)

    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const cameraCheckIntervalRef = useRef(null)
    const cameraBlockedRef = useRef(false)
    const phoneDetectedRef = useRef(false)
    const objectDetectorRef = useRef(null)
    const phoneCheckIntervalRef = useRef(null)

    // Face Detection refs (NEW - BlazeFace)
    const faceDetectorRef = useRef(null)
    const faceCheckIntervalRef = useRef(null)
    const faceDetectedRef = useRef(true)

    const proctoring = problem.proctoring || {}
    const maxTabSwitches = proctoring.maxTabSwitches || 3

    // Request fullscreen on mount
    useEffect(() => {
        const requestFullscreen = () => {
            if (containerRef.current && !document.fullscreenElement) {
                containerRef.current.requestFullscreen().then(() => {
                    setIsFullscreen(true)
                }).catch(err => {
                    console.log('Fullscreen request failed:', err.message)
                })
            }
        }

        // Request fullscreen after a short delay to ensure DOM is ready
        setTimeout(requestFullscreen, 100)

        // Handle fullscreen changes
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement)
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)

        // Load test cases
        if (problem.testCases) {
            const cases = typeof problem.testCases === 'string' ? JSON.parse(problem.testCases) : problem.testCases
            setTestCases(Array.isArray(cases) ? cases : [])
        }

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            // Exit fullscreen when closing
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => { })
            }
        }
    }, [])

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
            // Load AI model for face detection (NEW - BlazeFace) - only if face detection is enabled
            if (proctoring.enableFaceDetection || proctoring.detectMultipleFaces || proctoring.trackFaceLookaway) {
                loadFaceDetectionModel()
            }
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
        // Stop face detection (NEW - BlazeFace)
        stopFaceDetection()
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

        console.log(`Camera check - Brightness: ${avgBrightness.toFixed(1)}, Variance: ${variance.toFixed(1)}, Dark%: ${(darkRatio * 100).toFixed(1)}%, Blocked: ${isBlocked}`)

        if (isBlocked && !cameraBlockedRef.current) {
            cameraBlockedRef.current = true
            setCameraBlocked(true)
            setCameraBlockedCount(prev => {
                const newCount = prev + 1

                // 📊 EMIT: Camera blocked violation
                socketService.emitProctoringViolation(
                    user.id,
                    user.name || user.email,
                    'camera_blocked',
                    'critical',
                    problem.mentorId
                )

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

            console.log('🔍 Detection ran, found:', predictions.length, 'objects:', predictions.map(p => `${p.class}(${(p.score * 100).toFixed(0)}%)`).join(', '))

            // Check for cell phone, laptop, book, or remote (potential cheating devices)
            const suspiciousObjects = predictions.filter(p =>
                ['cell phone', 'laptop', 'book', 'remote'].includes(p.class) &&
                p.score > 0.4  // Lower threshold to 40% for better detection
            )

            const phoneFound = suspiciousObjects.some(p => p.class === 'cell phone' && p.score > 0.4)

            if (suspiciousObjects.length > 0) {
                console.log('🚨 Suspicious objects detected:', suspiciousObjects.map(p => `${p.class} (${(p.score * 100).toFixed(0)}%)`))
            }

            if (phoneFound && !phoneDetectedRef.current) {
                phoneDetectedRef.current = true
                setPhoneDetected(true)
                setPhoneDetectionCount(prev => {
                    const newCount = prev + 1

                    // 📊 EMIT: Phone detected violation
                    socketService.emitProctoringViolation(
                        user.id,
                        user.name || user.email,
                        'phone_detected',
                        newCount > 2 ? 'critical' : 'warning',
                        problem.mentorId
                    )

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

    // ============ FACE DETECTION (BlazeFace) ============

    // Load BlazeFace model for face detection
    const loadFaceDetectionModel = async () => {
        try {
            console.log('👁️ Loading BlazeFace model...')
            const detector = await blazeface.load()
            faceDetectorRef.current = detector
            console.log('✅ BlazeFace model loaded successfully')
            startFaceDetection()
        } catch (error) {
            console.error('❌ Failed to load BlazeFace model:', error)
        }
    }

    // Detect if student is looking away from screen (using face coordinates)
    const isLookingAway = (prediction) => {
        if (!prediction || !prediction.start || !prediction.end) return false

        // Get face position
        const [faceX1, faceY1] = prediction.start
        const [faceX2, faceY2] = prediction.end
        const faceCenterX = (faceX1 + faceX2) / 2
        const faceCenterY = (faceY1 + faceY2) / 2

        // Video center
        const videoCenterX = videoRef.current.videoWidth / 2
        const videoCenterY = videoRef.current.videoHeight / 2

        // Calculate deviation from center
        const horizontalDeviation = Math.abs(faceCenterX - videoCenterX)
        const verticalDeviation = Math.abs(faceCenterY - videoCenterY)

        // If face is off-center, student is looking away
        const DEVIATION_THRESHOLD = 150
        const isAway = horizontalDeviation > DEVIATION_THRESHOLD || verticalDeviation > DEVIATION_THRESHOLD

        return isAway
    }

    // Detect face in video stream
    const detectFace = async () => {
        if (!videoRef.current || !faceDetectorRef.current) return

        try {
            const predictions = await faceDetectorRef.current.estimateFaces(
                videoRef.current,
                false  // returnTensors = false
            )

            console.log(`👁️ Face detection result: ${predictions.length} face(s)`)

            // Check face detection status
            if (predictions.length === 0) {
                // Face not detected
                if (proctoring.enableFaceDetection) {
                    setFaceDetected(false)
                    setFaceNotDetectedCount(prev => {
                        // 📊 EMIT: Face not detected violation
                        socketService.emitProctoringViolation(
                            user.id,
                            user.name || user.email,
                            'face_not_detected',
                            'warning',
                            problem.mentorId
                        )
                        return prev + 1
                    })
                    console.log('⚠️ Face not detected')
                }
            } else if (predictions.length === 1) {
                // Single face detected - GOOD
                setFaceDetected(true)
                setMultipleFaces(false)
                console.log('✅ Single face detected')

                // Check if student is looking away (only if trackFaceLookaway is enabled)
                if (proctoring.trackFaceLookaway && isLookingAway(predictions[0])) {
                    setFaceLookawayCount(prev => {
                        // 📊 EMIT: Face lookaway violation
                        socketService.emitProctoringViolation(
                            user.id,
                            user.name || user.email,
                            'face_lookaway',
                            'warning',
                            problem.mentorId
                        )
                        return prev + 1
                    })
                    console.log('⚠️ Face is off-center (looking away)')
                }
            } else if (predictions.length >= 2) {
                // Multiple faces detected - CHEATING (only if detectMultipleFaces is enabled)
                if (proctoring.detectMultipleFaces) {
                    setFaceDetected(true)
                    setMultipleFaces(true)
                    setMultipleFacesDetectionCount(prev => {
                        // 📊 EMIT: Multiple faces detected (critical violation)
                        socketService.emitProctoringViolation(
                            user.id,
                            user.name || user.email,
                            'multiple_faces',
                            'critical',
                            problem.mentorId
                        )
                        return prev + 1
                    })
                    setWarningMessage(`👥 Multiple people detected! (${predictions.length} faces) - Automatic violation!`)
                    setShowWarning(true)
                    console.log('🚨 Multiple faces detected - CHEATING')
                }
            }
        } catch (error) {
            console.error('❌ Face detection inference failed:', error)
            setFaceDetected(false)
        }
    }

    // Start periodic face detection
    const startFaceDetection = () => {
        if (!faceDetectorRef.current) {
            console.error('❌ Face detector not loaded yet')
            return
        }

        // Run face detection every 1 second
        faceCheckIntervalRef.current = setInterval(() => {
            detectFace()
        }, 1000)

        console.log('👁️ Face detection started (1s intervals)')
    }

    // Stop face detection
    const stopFaceDetection = () => {
        if (faceCheckIntervalRef.current) {
            clearInterval(faceCheckIntervalRef.current)
            faceCheckIntervalRef.current = null
            console.log('👁️ Face detection stopped')
        }
    }

    // Tab switch detection and fullscreen re-request
    useEffect(() => {
        if (!proctoring.enabled || !proctoring.trackTabSwitches) return

        const handleVisibilityChange = () => {
            if (document.hidden && !isDisqualified) {
                setTabSwitches(prev => {
                    const newCount = prev + 1

                    // 📊 EMIT: Window/Tab switch violation
                    socketService.emitProctoringViolation(
                        user.id,
                        user.name || user.email,
                        'window_switch',
                        newCount >= maxTabSwitches ? 'critical' : 'warning',
                        problem.mentorId
                    )

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
            } else if (!document.hidden) {
                // When returning to tab, re-request fullscreen
                if (containerRef.current && !document.fullscreenElement) {
                    setTimeout(() => {
                        containerRef.current?.requestFullscreen().catch(() => { })
                    }, 100)
                }
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
                setCopyPasteAttempts(prev => {
                    // 📊 EMIT: Copy/Paste attempt violation
                    socketService.emitProctoringViolation(
                        user.id,
                        user.name || user.email,
                        'copy_attempt',
                        'warning',
                        problem.mentorId
                    )
                    return prev + 1
                })
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
                problemId: problem.id,
                sqlSchema: problem.sqlSchema,  // Pass SQL schema for execution
                stdin: customInput  // Pass custom input as stdin
            })
            setOutput(res.data.output || res.data.error || 'No output')
            setActiveOutputTab('output')  // Switch to output tab to show results

            // Emit test execution event to socket
            if (res.data.error || res.data.output?.includes('FAILED') || res.data.output?.includes('Error')) {
                // Test failed
                socketService.emitTestFailed(
                    user.id,
                    user.name || user.email,
                    problem.id,
                    `Run Test - ${problem.title}`,
                    problem.mentorId
                )
            }
        } catch (err) {
            const errorMsg = 'Error running code: ' + (err.response?.data?.error || err.message)
            setOutput(errorMsg)
            setActiveOutputTab('output')  // Switch to output tab to show error

            // Emit test failed event
            socketService.emitTestFailed(
                user.id,
                user.name || user.email,
                problem.id,
                `Run Error - ${problem.title}`,
                problem.mentorId
            )
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
                language: selectedLanguage
            })
            setHint(res.data.hint)
        } catch (err) {
            setHint('Unable to generate hint at this time.')
        } finally {
            setLoadingHint(false)
        }
    }

    const handleRunAllTests = async () => {
        if (!testCases || testCases.length === 0) {
            alert('No test cases available for this problem')
            return
        }

        setRunningTests(true)
        setTestResults([])

        try {
            const results = []

            for (let i = 0; i < testCases.length; i++) {
                const testCase = testCases[i]
                try {
                    const res = await axios.post(`${API_BASE}/run`, {
                        code,
                        language: problem.language,
                        problemId: problem.id,
                        sqlSchema: problem.sqlSchema,
                        stdin: testCase.input || testCase.stdin || ''
                    })

                    const expectedOutput = (testCase.expectedOutput || testCase.expected_output || '').trim()
                    const actualOutput = (res.data.output || '').trim()
                    const passed = actualOutput === expectedOutput && !res.data.error

                    results.push({
                        testNumber: i + 1,
                        input: testCase.input || testCase.stdin || 'N/A',
                        expected: expectedOutput,
                        actual: actualOutput,
                        passed,
                        error: res.data.error || null
                    })
                } catch (err) {
                    results.push({
                        testNumber: i + 1,
                        input: testCase.input || testCase.stdin || 'N/A',
                        expected: testCase.expectedOutput || testCase.expected_output || 'N/A',
                        actual: 'ERROR',
                        passed: false,
                        error: err.response?.data?.error || err.message
                    })
                }
            }

            setTestResults(results)
            setActiveOutputTab('tests')

            // Check if all passed
            const allPassed = results.every(r => r.passed)
            if (allPassed) {
                socketService.emitTestSuccess(
                    user.id,
                    user.name || user.email,
                    problem.id,
                    `All ${results.length} tests passed - ${problem.title}`,
                    problem.mentorId
                )
            }
        } catch (err) {
            alert('Error running tests: ' + err.message)
        } finally {
            setRunningTests(false)
        }
    }

    const handleSubmit = async () => {
        if (!code.trim()) {
            alert('Please write some code before submitting')
            return
        }

        setIsSubmitting(true)
        const timeSpent = Math.round((Date.now() - startTime) / 1000)

        // 📊 EMIT: Submission started event
        socketService.emitSubmissionStarted(
            user.id,
            user.name || user.email,
            problem.id,
            problem.title,
            problem.mentorId,
            proctoring.enabled || false
        )

        try {
            const response = await axios.post(`${API_BASE}/submissions/proctored`, {
                studentId: user.id,
                problemId: problem.id,
                code,
                language: selectedLanguage,
                submissionType: 'editor',
                tabSwitches,
                copyPasteAttempts,
                cameraBlockedCount,
                phoneDetectionCount,
                // Face Detection Metrics (NEW - BlazeFace)
                faceNotDetectedCount,
                multipleFacesDetectionCount,
                faceLookawayCount,
                timeSpent,
                proctored: proctoring.enabled
            })

            // 📊 EMIT: Submission completed event
            socketService.emitSubmissionCompleted(
                user.id,
                user.name || user.email,
                problem.id,
                problem.title,
                problem.mentorId,
                response.data?.status || 'success',
                response.data?.score || 100
            )

            // Stop all media (camera, microphone, recording)
            stopAllMedia()

            if (onSubmitSuccess) {
                onSubmitSuccess(response.data)
            }
            onClose()
        } catch (err) {
            // 📊 EMIT: Submission failed event
            socketService.emitSubmissionCompleted(
                user.id,
                user.name || user.email,
                problem.id,
                problem.title,
                problem.mentorId,
                'error',
                0
            )

            console.error('Submission error:', {
                status: err.response?.status,
                data: err.response?.data,
                message: err.message
            })

            const errorDetails = err.response?.data?.details || err.response?.data?.error || err.message
            const errorMsg = `Submission failed: ${errorDetails}. Please check your code and try again.`
            alert(errorMsg)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div ref={containerRef} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0f172a', zIndex: 10000, display: 'flex', flexDirection: 'column' }}>
            {/* Warning Toast */}
            {showWarning && (
                <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', background: isDisqualified ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', padding: '1rem 2rem', borderRadius: '0.75rem', zIndex: 10001, boxShadow: '0 10px 40px rgba(239, 68, 68, 0.5)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <AlertTriangle size={24} />
                    <span style={{ fontWeight: 600 }}>{warningMessage}</span>
                </div>
            )}

            {/* Header */}
            <div style={{ borderBottom: '1px solid #334155', background: '#1e293b', padding: '1rem 2rem', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ color: '#f8fafc', fontSize: '1.25rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {problem.title}
                            <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', borderRadius: '2rem', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 2s infinite' }}></div>
                                🔒 PROCTORED MODE
                            </span>
                        </h2>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>{problem.type || 'Coding'}</span>
                            <span className={`difficulty-badge ${problem.difficulty?.toLowerCase()}`}>{problem.difficulty?.toUpperCase()}</span>
                            {tabSwitches > 0 && <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600 }}>⚠️ {tabSwitches} violations</span>}
                            {copyPasteAttempts > 0 && <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600 }}>📋 {copyPasteAttempts} copy attempts</span>}
                            {cameraBlockedCount > 0 && <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600 }}>📹 {cameraBlockedCount} cam blocks</span>}
                            {phoneDetectionCount > 0 && <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600 }}>📱 {phoneDetectionCount} phone detected</span>}
                            {faceNotDetectedCount > 0 && <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600 }}>👤 {faceNotDetectedCount} face missing</span>}
                            {multipleFacesDetectionCount > 0 && <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600 }}>👥 {multipleFacesDetectionCount} multi-face</span>}
                            {faceLookawayCount > 0 && <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600 }}>👀 {faceLookawayCount} lookaway</span>}
                        </div>
                    </div>
                </div>

                {/* Camera/Mic Status Indicators */}
                {proctoring.videoAudio && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginRight: '1rem' }}>
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

                <button onClick={handleClose} style={{ background: '#334155', border: 'none', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}>Exit Session</button>
            </div>

            {/* Body */}
            <div style={{ padding: 0, display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden', background: '#0f172a' }}>
                {/* Left Side: Problem Description & Hints */}
                <div style={{ width: '400px', borderRight: '1px solid #334155', padding: '2rem', overflowY: 'auto', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#f8fafc' }}>Problem Description</h3>
                    <div style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.7' }}>
                        {problem.description}

                        {/* Show SQL-specific fields or regular input/output */}
                        {(problem.type === 'SQL' || problem.language === 'SQL') ? (
                            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #334155', marginTop: '1.5rem' }}>
                                {problem.sqlSchema && (
                                    <>
                                        <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ color: '#06b6d4' }}>🗄️</span>
                                            <strong style={{ color: '#e2e8f0' }}>Database Schema:</strong>
                                        </div>
                                        <pre style={{
                                            color: '#93c5fd',
                                            background: '#0f172a',
                                            padding: '1rem',
                                            borderRadius: '6px',
                                            marginBottom: '1rem',
                                            fontSize: '0.8rem',
                                            overflowX: 'auto',
                                            whiteSpace: 'pre-wrap',
                                            border: '1px solid #334155'
                                        }}>{problem.sqlSchema}</pre>
                                    </>
                                )}
                                {problem.expectedQueryResult && (
                                    <>
                                        <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ color: '#10b981' }}>📊</span>
                                            <strong style={{ color: '#e2e8f0' }}>Expected Query Result:</strong>
                                        </div>
                                        <pre style={{
                                            color: '#4ade80',
                                            background: '#0f172a',
                                            padding: '1rem',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem',
                                            overflowX: 'auto',
                                            whiteSpace: 'pre-wrap',
                                            border: '1px solid #334155'
                                        }}>{problem.expectedQueryResult}</pre>
                                    </>
                                )}
                                {!problem.sqlSchema && !problem.expectedQueryResult && (
                                    <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
                                        Write a SQL query to solve this problem. Your query will be executed against the database.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #334155', marginTop: '1.5rem' }}>
                                <div style={{ marginBottom: '0.5rem' }}><strong style={{ color: '#e2e8f0' }}>Sample Input:</strong></div>
                                <code style={{ color: '#93c5fd', background: '#0f172a', padding: '0.4rem 0.8rem', borderRadius: '4px', display: 'block', marginBottom: '1rem' }}>{problem.sampleInput || "N/A"}</code>
                                <div style={{ marginBottom: '0.5rem' }}><strong style={{ color: '#e2e8f0' }}>Expected Output:</strong></div>
                                <code style={{ color: '#4ade80', background: '#0f172a', padding: '0.4rem 0.8rem', borderRadius: '4px', display: 'block' }}>{problem.expectedOutput || "N/A"}</code>
                            </div>
                        )}
                    </div>

                    {/* AI Hints Section */}
                    <div style={{ marginTop: '2rem', background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05))', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '0.75rem', padding: '1.25rem' }}>
                        <h4 style={{ margin: '0 0 0.75rem', color: '#fbbf24', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Lightbulb size={16} /> Need Help?
                        </h4>
                        <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 1rem', lineHeight: 1.6 }}>
                            Stuck on this problem? Get AI-powered hints to guide you without revealing the full solution.
                        </p>
                        <button
                            onClick={handleGetHint}
                            disabled={loadingHint}
                            style={{
                                background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                                border: 'none',
                                color: '#1e293b',
                                padding: '0.6rem 1.2rem',
                                borderRadius: '6px',
                                cursor: loadingHint ? 'not-allowed' : 'pointer',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                width: '100%',
                                justifyContent: 'center'
                            }}
                        >
                            <Lightbulb size={16} /> {loadingHint ? 'Getting Hints...' : 'Get AI Hints'}
                        </button>
                        {hint && (
                            <div style={{
                                marginTop: '0.75rem',
                                padding: '0.75rem',
                                background: 'rgba(34, 197, 94, 0.1)',
                                borderRadius: '8px',
                                border: '1px solid rgba(34, 197, 94, 0.2)',
                                fontSize: '0.85rem',
                                color: '#4ade80'
                            }}>
                                💡 {hint}
                            </div>
                        )}
                    </div>

                    {/* Proctoring Rules */}
                    <div style={{ marginTop: '2rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.75rem', padding: '1.25rem' }}>
                        <h4 style={{ margin: '0 0 0.75rem', color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={16} /> Proctoring Rules</h4>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.8 }}>
                            <li>Do not switch tabs or windows</li>
                            <li>Do not exit fullscreen mode</li>
                            <li>All violations are recorded</li>
                            <li>3+ violations may result in disqualification</li>
                        </ul>
                    </div>

                    {/* Video Preview (if enabled) */}
                    {proctoring.videoAudio && (
                        <div style={{
                            marginTop: '2rem',
                            padding: '0.75rem',
                            background: 'rgba(0,0,0,0.3)',
                            borderRadius: '0.75rem',
                            border: '1px solid #334155',
                            position: 'relative'
                        }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{
                                    width: '100%',
                                    height: '150px',
                                    objectFit: 'cover',
                                    borderRadius: '8px',
                                    background: '#000',
                                    border: cameraBlocked ? '3px solid #ef4444' : '2px solid #10b981',
                                    opacity: cameraBlocked ? 0.5 : 1
                                }}
                            />
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

                {/* Right Side: Code Editor */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1e293b', minHeight: 0 }}>
                    {/* Toolbar */}
                    <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', background: '#1e293b' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <label style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Language:</label>
                            <select
                                value={selectedLanguage}
                                onChange={(e) => {
                                    const newLang = e.target.value
                                    setSelectedLanguage(newLang)
                                    setCode(LANGUAGE_CONFIG[newLang]?.defaultCode || '')
                                }}
                                disabled={problem.type === 'SQL' || problem.language === 'SQL'}
                                style={{
                                    background: '#0f172a',
                                    color: '#f8fafc',
                                    border: '1px solid #334155',
                                    borderRadius: '6px',
                                    padding: '0.4rem 0.75rem',
                                    fontSize: '0.85rem',
                                    cursor: (problem.type === 'SQL' || problem.language === 'SQL') ? 'not-allowed' : 'pointer',
                                    opacity: (problem.type === 'SQL' || problem.language === 'SQL') ? 0.7 : 1
                                }}
                            >
                                {Object.keys(LANGUAGE_CONFIG).map(lang => <option key={lang} value={lang}>{lang}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button onClick={handleRun} disabled={isRunning || isSubmitting} style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                <Play size={16} /> {isRunning ? 'Running...' : 'Run Code'}
                            </button>
                            <button onClick={handleSubmit} disabled={isRunning || isSubmitting} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                <Send size={16} /> {isSubmitting ? 'Submitting...' : 'Submit'}
                            </button>
                        </div>
                    </div>

                    {/* Editor */}
                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                        <Editor
                            height="100%"
                            language={LANGUAGE_CONFIG[selectedLanguage]?.monacoLang || 'python'}
                            theme="vs-dark"
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 20 }
                            }}
                        />
                    </div>

                    {/* Output Section with Tabs */}
                    <div style={{ flex: '0 0 280px', background: '#020617', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        {/* Tab Headers */}
                        <div style={{ display: 'flex', borderBottom: '1px solid #334155', background: '#0f172a' }}>
                            {['input', 'output', 'tests'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveOutputTab(tab)}
                                    style={{
                                        padding: '0.75rem 1.25rem',
                                        background: activeOutputTab === tab ? '#1e293b' : 'transparent',
                                        border: 'none',
                                        borderBottom: activeOutputTab === tab ? `2px solid ${tab === 'input' ? '#f59e0b' : tab === 'output' ? '#3b82f6' : '#06b6d4'}` : '2px solid transparent',
                                        color: activeOutputTab === tab ? (tab === 'input' ? '#fbbf24' : tab === 'output' ? '#60a5fa' : '#06b6d4') : '#64748b',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}
                                >
                                    {tab === 'input' && <>📝 Custom Input</>}
                                    {tab === 'output' && <>⚙️ Output {output && <span style={{ width: 6, height: 6, borderRadius: '50%', background: output.includes('Error') ? '#ef4444' : '#10b981' }}></span>}</>}
                                    {tab === 'tests' && <>🧪 Test Cases</>}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        {activeOutputTab === 'input' && (
                            <div style={{ padding: '0.75rem', flex: 1 }}>
                                <textarea
                                    value={customInput}
                                    onChange={(e) => setCustomInput(e.target.value)}
                                    placeholder={`Enter your input here (stdin)...\nExample:\n5\n1 2 3 4 5`}
                                    style={{
                                        width: '100%',
                                        height: 'calc(100% - 30px)',
                                        background: '#0f172a',
                                        color: '#e2e8f0',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                        padding: '0.75rem',
                                        fontFamily: 'monospace',
                                        fontSize: '0.85rem',
                                        resize: 'none',
                                        outline: 'none'
                                    }}
                                />
                                <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#64748b' }}>
                                    💡 This input will be passed as stdin when you click "Run Code"
                                </div>
                            </div>
                        )}

                        {activeOutputTab === 'output' && (
                            <div style={{ padding: '0.75rem', flex: 1, overflowY: 'auto' }}>
                                <div style={{ fontFamily: 'monospace', color: output.includes('Error') ? '#ef4444' : '#e2e8f0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                                    {output || '👉 Run your code to see output here'}
                                </div>
                            </div>
                        )}

                        {activeOutputTab === 'tests' && (
                            <div style={{ padding: '0.75rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                {testResults.length === 0 ? (
                                    <>
                                        <button
                                            onClick={handleRunAllTests}
                                            disabled={runningTests || isRunning}
                                            style={{
                                                background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                                                border: 'none',
                                                color: 'white',
                                                padding: '0.6rem 1.2rem',
                                                borderRadius: '6px',
                                                marginBottom: '1rem',
                                                cursor: runningTests ? 'not-allowed' : 'pointer',
                                                fontWeight: 600,
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            {runningTests ? '⏳ Running All Tests...' : '🧪 Run All Tests'}
                                        </button>
                                        <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                                            {(problem.type === 'SQL' || problem.language === 'SQL') ? (
                                                <div>
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <strong style={{ color: '#06b6d4' }}>📊 Database Schema:</strong>
                                                        <pre style={{
                                                            color: '#93c5fd',
                                                            background: '#0f172a',
                                                            padding: '0.75rem',
                                                            borderRadius: '6px',
                                                            marginTop: '0.5rem',
                                                            fontSize: '0.75rem',
                                                            overflowX: 'auto',
                                                            whiteSpace: 'pre-wrap',
                                                            border: '1px solid #334155'
                                                        }}>{problem.sqlSchema || 'Schema not provided'}</pre>
                                                    </div>
                                                    <div>
                                                        <strong style={{ color: '#10b981' }}>📈 Expected Result:</strong>
                                                        <pre style={{
                                                            color: '#4ade80',
                                                            background: '#0f172a',
                                                            padding: '0.75rem',
                                                            borderRadius: '6px',
                                                            marginTop: '0.5rem',
                                                            fontSize: '0.75rem',
                                                            overflowX: 'auto',
                                                            whiteSpace: 'pre-wrap',
                                                            border: '1px solid #334155'
                                                        }}>{problem.expectedQueryResult || 'Expected result not provided'}</pre>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <strong style={{ color: '#f59e0b' }}>📥 Sample Input:</strong>
                                                        <pre style={{
                                                            color: '#93c5fd',
                                                            background: '#0f172a',
                                                            padding: '0.75rem',
                                                            borderRadius: '6px',
                                                            marginTop: '0.5rem',
                                                            fontSize: '0.75rem',
                                                            overflowX: 'auto',
                                                            whiteSpace: 'pre-wrap',
                                                            border: '1px solid #334155'
                                                        }}>{problem.sampleInput || 'N/A'}</pre>
                                                    </div>
                                                    <div>
                                                        <strong style={{ color: '#10b981' }}>📤 Expected Output:</strong>
                                                        <pre style={{
                                                            color: '#4ade80',
                                                            background: '#0f172a',
                                                            padding: '0.75rem',
                                                            borderRadius: '6px',
                                                            marginTop: '0.5rem',
                                                            fontSize: '0.75rem',
                                                            overflowX: 'auto',
                                                            whiteSpace: 'pre-wrap',
                                                            border: '1px solid #334155'
                                                        }}>{problem.expectedOutput || 'N/A'}</pre>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                                        <button
                                            onClick={handleRunAllTests}
                                            disabled={runningTests || isRunning}
                                            style={{
                                                background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                                                border: 'none',
                                                color: 'white',
                                                padding: '0.5rem 1rem',
                                                borderRadius: '6px',
                                                marginBottom: '1rem',
                                                cursor: runningTests ? 'not-allowed' : 'pointer',
                                                fontWeight: 600,
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            {runningTests ? '⏳ Running...' : '🔄 Run Tests Again'}
                                        </button>

                                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#1e293b', borderRadius: '6px' }}>
                                            <strong style={{ color: '#06b6d4' }}>Test Results: </strong>
                                            <span style={{ color: testResults.every(r => r.passed) ? '#10b981' : '#ef4444' }}>
                                                {testResults.filter(r => r.passed).length}/{testResults.length} passed
                                            </span>
                                        </div>

                                        {testResults.map((result, idx) => (
                                            <div key={idx} style={{ marginBottom: '1rem', padding: '0.75rem', background: result.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${result.passed ? '#10b981' : '#ef4444'}`, borderRadius: '6px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                    <span style={{ fontSize: '1.2rem' }}>{result.passed ? '✅' : '❌'}</span>
                                                    <strong style={{ color: result.passed ? '#10b981' : '#ef4444' }}>Test {result.testNumber}</strong>
                                                </div>

                                                <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                                                    <strong style={{ color: '#94a3b8' }}>Input:</strong>
                                                    <code style={{ color: '#cbd5e1', display: 'block', background: '#0f172a', padding: '0.5rem', borderRadius: '4px', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                                                        {result.input}
                                                    </code>
                                                </div>

                                                <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                                                    <strong style={{ color: '#10b981' }}>Expected:</strong>
                                                    <code style={{ color: '#4ade80', display: 'block', background: '#0f172a', padding: '0.5rem', borderRadius: '4px', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                                                        {result.expected}
                                                    </code>
                                                </div>

                                                <div style={{ fontSize: '0.75rem' }}>
                                                    <strong style={{ color: result.passed ? '#10b981' : '#ef4444' }}>Actual:</strong>
                                                    <code style={{ color: result.passed ? '#4ade80' : '#ef4444', display: 'block', background: '#0f172a', padding: '0.5rem', borderRadius: '4px', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                                                        {result.error ? `ERROR: ${result.error}` : result.actual}
                                                    </code>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.2); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    )
}

export default ProctoredCodeEditor
