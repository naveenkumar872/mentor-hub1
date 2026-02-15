import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Brain, Clock, Target, CheckCircle, XCircle, Play, Eye, ArrowRight, AlertTriangle, RotateCcw, Camera, Maximize, Shield, Monitor, EyeOff, Smartphone, ArrowLeftRight } from 'lucide-react';
import SkillMCQTest from './SkillMCQTest';
import SkillCodingTest from './SkillCodingTest';
import SkillSQLTest from './SkillSQLTest';
import SkillAIInterview from './SkillAIInterview';
import SkillTestReport from './SkillTestReport';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function SkillTestPortal({ user }) {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeAttempt, setActiveAttempt] = useState(null);
    const [attemptData, setAttemptData] = useState(null);
    const [currentView, setCurrentView] = useState('list'); // list, mcq, coding, sql, interview, report
    const [error, setError] = useState('');

    // Proctoring state
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [cameraError, setCameraError] = useState('');
    const [showProctoringSetup, setShowProctoringSetup] = useState(false);
    const [pendingTestId, setPendingTestId] = useState(null);
    const [pendingResumeId, setPendingResumeId] = useState(null);
    const containerRef = useRef(null);
    const videoRef = useRef(null);

    // Proctoring stats
    const [proctoringStats, setProctoringStats] = useState({
        violationCount: 0,
        tabSwitchCount: 0,
        cameraBlocks: 0,
        phoneDetections: 0,
        fullscreenExits: 0,
        cameraActive: false
    });

    // Violation warning overlay
    const [violationWarning, setViolationWarning] = useState(null);
    const warningTimerRef = useRef(null);
    const canvasRef = useRef(null);
    const monitorIntervalRef = useRef(null);
    const logProctoringRef = useRef(null);

    const [model, setModel] = useState(null);

    useEffect(() => {
        loadTests();
        loadProctoringModel();
    }, []);

    const loadProctoringModel = async () => {
        try {
            if (window.cocoSsd) {
                const m = await window.cocoSsd.load();
                setModel(m);
            } else {
                // Dynamically load scripts
                const script1 = document.createElement('script');
                script1.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs";
                document.body.appendChild(script1);
                script1.onload = () => {
                    const script2 = document.createElement('script');
                    script2.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
                    document.body.appendChild(script2);
                    script2.onload = async () => {
                        const m = await window.cocoSsd.load();
                        setModel(m);
                    };
                };
            }
        } catch (e) { console.error("Model load error", e); }
    };


    // Cleanup camera on unmount
    useEffect(() => {
        return () => {
            if (cameraStream) {
                cameraStream.getTracks().forEach(t => t.stop());
            }
        };
    }, [cameraStream]);

    // Fullscreen change listener
    useEffect(() => {
        const handleFSChange = () => {
            const isFull = !!document.fullscreenElement;
            setIsFullscreen(isFull);
            if (!isFull && activeAttempt && currentView !== 'list' && currentView !== 'report') {
                // Log fullscreen exit as proctoring event
                logProctoringRef.current?.('fullscreen_exit', 'Student exited fullscreen mode', 'high');
            }
        };
        document.addEventListener('fullscreenchange', handleFSChange);
        return () => document.removeEventListener('fullscreenchange', handleFSChange);
    }, [activeAttempt, currentView]);

    const showViolationWarning = useCallback((title, message, severity) => {
        setViolationWarning({ title, message, severity });
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningTimerRef.current = setTimeout(() => setViolationWarning(null), 4000);
    }, []);

    const logProctoring = useCallback(async (eventType, details, severity = 'medium') => {
        if (!activeAttempt || attemptData?.proctoring_enabled === false) return;
        try {
            await axios.post(`${API}/api/skill-tests/proctoring/log`, {
                attemptId: activeAttempt,
                testStage: currentView,
                eventType, details, severity
            });
            // Track stats locally
            setProctoringStats(prev => ({
                ...prev,
                violationCount: prev.violationCount + 1,
                tabSwitchCount: eventType === 'tab_switch' ? prev.tabSwitchCount + 1 : prev.tabSwitchCount,
                fullscreenExits: eventType === 'fullscreen_exit' ? prev.fullscreenExits + 1 : prev.fullscreenExits,
                phoneDetections: eventType === 'phone_detected' ? prev.phoneDetections + 1 : prev.phoneDetections,
                cameraBlocks: eventType === 'camera_blocked' ? prev.cameraBlocks + 1 : prev.cameraBlocks,
            }));
            // Show warning overlay
            const warningMessages = {
                'tab_switch': { title: '⚠️ Tab Switch Detected!', msg: 'Switching tabs is monitored. Return to your test immediately.' },
                'fullscreen_exit': { title: '⚠️ Fullscreen Exited!', msg: 'You must stay in fullscreen mode. Please re-enter fullscreen.' },
                'camera_blocked': { title: '📷 Camera Blocked!', msg: 'Your camera appears to be covered or blocked. Please uncover it.' },
                'phone_detected': { title: '📱 Phone/Object Detected!', msg: 'Suspicious activity detected near camera. Keep your area clear.' },
            };
            const wm = warningMessages[eventType] || { title: '⚠️ Violation!', msg: details };
            showViolationWarning(wm.title, wm.msg, severity);
        } catch { }
    }, [activeAttempt, currentView, attemptData, showViolationWarning]);

    // Keep ref updated for use in intervals/listeners
    useEffect(() => {
        logProctoringRef.current = logProctoring;
    }, [logProctoring]);

    // Block Copy/Paste/Right-click
    useEffect(() => {
        if (!activeAttempt || currentView === 'list' || currentView === 'report' || attemptData?.proctoring_enabled === false) return;

        const preventEvent = (e) => {
            e.preventDefault();
            // Optional: Log this attempt if strict
            // logProctoringRef.current?.('paste_attempt', 'Clipboard/Context menu usage blocked', 'low');
        };

        window.addEventListener('copy', preventEvent);
        window.addEventListener('paste', preventEvent);
        window.addEventListener('cut', preventEvent);
        window.addEventListener('contextmenu', preventEvent);

        return () => {
            window.removeEventListener('copy', preventEvent);
            window.removeEventListener('paste', preventEvent);
            window.removeEventListener('cut', preventEvent);
            window.removeEventListener('contextmenu', preventEvent);
        };
    }, [activeAttempt, currentView, attemptData]);

    // Tab switch / visibility change detection
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden && activeAttempt && currentView !== 'list' && currentView !== 'report') {
                logProctoringRef.current?.('tab_switch', 'Student switched tabs or minimized window', 'high');
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [activeAttempt, currentView]);

    // Update camera active status
    useEffect(() => {
        setProctoringStats(prev => ({ ...prev, cameraActive: !!cameraStream }));
    }, [cameraStream]);

    // Camera monitoring - detect camera blocked, phones, or multiple people
    useEffect(() => {
        if (!cameraStream || !activeAttempt || currentView === 'list' || currentView === 'report') {
            if (monitorIntervalRef.current) {
                clearInterval(monitorIntervalRef.current);
                monitorIntervalRef.current = null;
            }
            return;
        }

        // Create hidden canvas for frame analysis
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        canvasRef.current = canvas;

        // Create a video element specifically for frame analysis
        const monitorVideo = document.createElement('video');
        monitorVideo.srcObject = cameraStream;
        monitorVideo.muted = true;
        monitorVideo.playsInline = true;
        monitorVideo.play().catch(() => { });

        let lastAvgBrightness = -1;
        let darkFrameCount = 0;
        let brightChangeCount = 0;
        const DARK_THRESHOLD = 20;
        const DARK_FRAMES_TRIGGER = 3;
        const BRIGHTNESS_CHANGE = 80;
        const CHANGE_FRAMES_TRIGGER = 2;

        monitorIntervalRef.current = setInterval(async () => {
            try {
                if (monitorVideo.readyState < 2) return;

                // 1. Basic Brightness / Blocked Check
                ctx.drawImage(monitorVideo, 0, 0, 64, 48);
                const imageData = ctx.getImageData(0, 0, 64, 48);
                const data = imageData.data;
                let totalBrightness = 0;
                for (let i = 0; i < data.length; i += 4) {
                    totalBrightness += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
                }
                const avgBrightness = totalBrightness / (data.length / 4);

                if (avgBrightness < DARK_THRESHOLD) {
                    darkFrameCount++;
                    if (darkFrameCount === DARK_FRAMES_TRIGGER) {
                        logProctoringRef.current?.('camera_blocked', 'Camera appears to be covered', 'high');
                        darkFrameCount = 0;
                    }
                } else {
                    darkFrameCount = 0;
                }

                // 2. AI Model Detection (Phone / Person)
                if (model && monitorVideo.readyState === 4) {
                    const predictions = await model.detect(monitorVideo);

                    /* Debugging AI predictions */
                    // if (predictions.length) console.log('AI Sees:', predictions);

                    const phone = predictions.find(p => p.class === 'cell phone' && p.score > 0.6);
                    if (phone) {
                        console.warn('VIOLATION DETECTED: Phone', phone);
                        logProctoringRef.current?.('phone_detected', 'Cell phone detected in frame', 'high');
                    }

                    const persons = predictions.filter(p => p.class === 'person' && p.score > 0.5);
                    if (persons.length > 1) {
                        logProctoringRef.current?.('phone_detected', 'Multiple people detected in frame', 'high');
                    }
                }

            } catch (e) { console.error(e); }
        }, 2000);

        return () => {
            if (monitorIntervalRef.current) {
                clearInterval(monitorIntervalRef.current);
                monitorIntervalRef.current = null;
            }
            monitorVideo.pause();
            monitorVideo.srcObject = null;
        };
    }, [cameraStream, activeAttempt, currentView, model]);

    // Cleanup warning timer on unmount
    useEffect(() => {
        return () => {
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
            if (monitorIntervalRef.current) clearInterval(monitorIntervalRef.current);
        };
    }, []);

    const loadTests = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get(`${API}/api/skill-tests/student/available`, {
                params: { studentId: user?.id || user?.email || 'student' }
            });
            setTests(data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    // Start proctoring setup before test
    const initiateTest = (testId) => {
        const test = tests.find(t => t.id === testId);
        if (test && test.proctoring_enabled === false) {
            startTest(testId);
            return;
        }
        setPendingTestId(testId);
        setPendingResumeId(null);
        setShowProctoringSetup(true);
        setCameraError('');
    };

    const initiateResume = (attemptId) => {
        // Find if proctoring needed
        let proctoringEnabled = true;
        for (const t of tests) {
            const att = t.my_attempts?.find(a => a.id === attemptId);
            if (att) {
                if (t.proctoring_enabled === false) proctoringEnabled = false;
                break;
            }
        }

        if (!proctoringEnabled) {
            resumeTest(attemptId);
            return;
        }

        setPendingResumeId(attemptId);
        setPendingTestId(null);
        setShowProctoringSetup(true);
        setCameraError('');
    };

    // Enable camera
    const enableCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
            setCameraStream(stream);
            setCameraError('');
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            return true;
        } catch (err) {
            setCameraError('Camera access denied. Please allow camera access and try again.');
            return false;
        }
    };

    // Enter fullscreen
    const enterFullscreen = async () => {
        try {
            if (containerRef.current && !document.fullscreenElement) {
                await containerRef.current.requestFullscreen();
            }
            setIsFullscreen(true);
            return true;
        } catch (err) {
            return false;
        }
    };

    // Start test after proctoring setup
    const proceedAfterSetup = async () => {
        // Enter fullscreen
        await enterFullscreen();

        setShowProctoringSetup(false);

        if (pendingTestId) {
            await startTest(pendingTestId);
        } else if (pendingResumeId) {
            await resumeTest(pendingResumeId);
        }
        setPendingTestId(null);
        setPendingResumeId(null);
    };

    const startTest = async (testId) => {
        try {
            setError('');
            const { data } = await axios.post(`${API}/api/skill-tests/${testId}/start`, {
                studentId: user?.id || user?.email || 'student',
                studentName: user?.name || user?.username || 'Student'
            });
            setActiveAttempt(data.attemptId);
            await loadAttemptData(data.attemptId);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        }
    };

    const resumeTest = async (attemptId) => {
        try {
            setError('');
            setActiveAttempt(attemptId);
            await loadAttemptData(attemptId);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        }
    };

    const loadAttemptData = async (attemptId) => {
        try {
            const { data } = await axios.get(`${API}/api/skill-tests/attempt/${attemptId}`);
            setAttemptData(data);
            if (data.overall_status === 'completed' || data.overall_status === 'failed') {
                setCurrentView('report');
            } else {
                setCurrentView(data.current_stage || 'mcq');
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const viewReport = async (attemptId) => {
        setActiveAttempt(attemptId);
        await loadAttemptData(attemptId);
        setCurrentView('report');
    };

    const onStageComplete = async (stage, result) => {
        await loadAttemptData(activeAttempt);
        // Force re-enter fullscreen as this is a user-initiated action
        setTimeout(() => enterFullscreen(), 100);
    };

    const goBack = () => {
        // Exit fullscreen
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
        // Stop camera
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            setCameraStream(null);
        }
        setActiveAttempt(null);
        setAttemptData(null);
        setCurrentView('list');
        loadTests();
    };

    // Proctoring Setup Screen
    if (showProctoringSetup) {
        return (
            <div ref={containerRef} style={{
                minHeight: '100vh', background: '#0f172a', color: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px'
            }}>
                <div style={{
                    maxWidth: '500px', width: '100%', background: '#1e293b', borderRadius: '20px',
                    padding: '40px', border: '1px solid #334155', textAlign: 'center'
                }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: '16px', margin: '0 auto 20px',
                        background: 'rgba(139,92,246,0.15)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Shield size={32} color="#8b5cf6" />
                    </div>
                    <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 8px', color: '#f1f5f9' }}>
                        Proctoring Setup
                    </h2>
                    <p style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 28px' }}>
                        This test requires camera access and fullscreen mode for proctoring.
                    </p>

                    {/* Camera Preview */}
                    <div style={{
                        width: '240px', height: '180px', margin: '0 auto 20px', borderRadius: '12px',
                        overflow: 'hidden', border: '2px solid ' + (cameraStream ? '#22c55e' : '#475569'),
                        background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {cameraStream ? (
                            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                        ) : (
                            <Camera size={40} color="#475569" />
                        )}
                    </div>

                    {cameraError && (
                        <div style={{ fontSize: '12px', color: '#fca5a5', margin: '0 0 16px', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>
                            {cameraError}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                        {/* Enable Camera Button */}
                        <button onClick={enableCamera} style={{
                            padding: '12px 24px', border: 'none', borderRadius: '10px', cursor: 'pointer',
                            fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '8px', width: '100%',
                            background: cameraStream ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                            color: cameraStream ? '#34d399' : '#60a5fa',
                            border: '1px solid ' + (cameraStream ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)')
                        }}>
                            {cameraStream ? <><CheckCircle size={16} /> Camera Enabled</> : <><Camera size={16} /> Enable Camera</>}
                        </button>

                        {/* Checklist */}
                        <div style={{ textAlign: 'left', fontSize: '13px', padding: '12px 16px', background: '#0f172a', borderRadius: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: cameraStream ? '#34d399' : '#94a3b8' }}>
                                {cameraStream ? <CheckCircle size={14} /> : <XCircle size={14} />} Camera access
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8' }}>
                                <Maximize size={14} /> Fullscreen will activate on start
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                                <Monitor size={14} /> Tab switches are monitored
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => { setShowProctoringSetup(false); setPendingTestId(null); setPendingResumeId(null); }} style={{
                            flex: 1, padding: '12px', background: '#334155', color: '#94a3b8', border: 'none',
                            borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px'
                        }}>Cancel</button>
                        <button onClick={proceedAfterSetup} disabled={!cameraStream} style={{
                            flex: 2, padding: '12px',
                            background: cameraStream ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : '#334155',
                            color: cameraStream ? 'white' : '#64748b',
                            border: 'none', borderRadius: '10px',
                            cursor: cameraStream ? 'pointer' : 'not-allowed',
                            fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '8px',
                            boxShadow: cameraStream ? '0 2px 10px rgba(139,92,246,0.3)' : 'none'
                        }}>
                            <Play size={16} /> Start Assessment
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Active test view (fullscreen with camera pip)
    if (activeAttempt && attemptData) {
        const stageOrder = ['mcq', 'coding', 'sql', 'interview'];
        const currentStageIdx = stageOrder.indexOf(attemptData.current_stage);

        if (currentView === 'report') {
            return <SkillTestReport attemptId={activeAttempt} onBack={goBack} />;
        }

        return (
            <div ref={containerRef} style={{
                minHeight: '100vh', background: '#0f172a', color: '#f1f5f9',
                position: 'relative', overflow: 'auto'
            }}>
                {/* Camera PIP */}
                {cameraStream && (
                    <div style={{
                        position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000,
                        width: '160px', height: '120px', borderRadius: '12px', overflow: 'hidden',
                        border: '2px solid #8b5cf6', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                    }}>
                        <video ref={el => { if (el && cameraStream) el.srcObject = cameraStream; }}
                            autoPlay muted playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                        <div style={{
                            position: 'absolute', top: '4px', left: '4px', background: 'rgba(239,68,68,0.9)',
                            borderRadius: '4px', padding: '1px 6px', fontSize: '9px', color: 'white',
                            fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px'
                        }}>
                            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'white', animation: 'blink 1s infinite' }} />
                            REC
                        </div>
                        <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
                    </div>
                )}

                <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                    {/* Progress Header */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f1f5f9' }}>{attemptData.title}</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {!isFullscreen && (
                                    <button onClick={enterFullscreen} style={{
                                        padding: '6px 12px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                                        borderRadius: '8px', cursor: 'pointer', fontSize: '11px', color: '#fbbf24',
                                        fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                                    }}><Maximize size={13} /> Re-enter Fullscreen</button>
                                )}
                                <button onClick={goBack} style={{
                                    padding: '8px 16px', background: '#334155', border: '1px solid #475569',
                                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8'
                                }}>← Exit Test</button>
                            </div>
                        </div>

                        {/* Stage Progress Bar */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                            {stageOrder.map((stage, idx) => {
                                const stageStatus = attemptData[`${stage}_status`] ||
                                    (stage === 'interview' ? attemptData.interview_status : 'pending');
                                let bg = '#334155';
                                if (stageStatus === 'passed') bg = '#22c55e';
                                else if (stageStatus === 'failed') bg = '#ef4444';
                                else if (stageStatus === 'in_progress') bg = '#f59e0b';
                                else if (idx === currentStageIdx) bg = '#3b82f6';

                                return (
                                    <div key={stage} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                        <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: bg }} />
                                        <span style={{
                                            fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                                            color: idx === currentStageIdx ? '#60a5fa' : '#64748b'
                                        }}>
                                            {stage === 'mcq' ? 'MCQ' : stage.charAt(0).toUpperCase() + stage.slice(1)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Proctoring Stats Bar */}
                        <div style={{
                            display: 'flex', gap: '12px', padding: '10px 16px', background: '#1e293b',
                            borderRadius: '10px', border: '1px solid #334155', flexWrap: 'wrap', alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600 }}>
                                <Shield size={14} color="#8b5cf6" />
                                <span style={{ color: '#94a3b8' }}>Proctoring:</span>
                            </div>

                            {/* AI Status */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px',
                                borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                background: model ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                color: model ? '#34d399' : '#f87171',
                                border: `1px solid ${model ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                            }}>
                                <Eye size={12} />
                                {model ? 'AI Active' : 'Loading AI...'}
                            </div>

                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px',
                                borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                background: proctoringStats.cameraActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                color: proctoringStats.cameraActive ? '#34d399' : '#f87171',
                                border: `1px solid ${proctoringStats.cameraActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                            }}>
                                <Camera size={12} />
                                {proctoringStats.cameraActive ? 'Camera ON' : 'Camera OFF'}
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px',
                                borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                background: proctoringStats.violationCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                color: proctoringStats.violationCount > 0 ? '#f87171' : '#34d399',
                                border: `1px solid ${proctoringStats.violationCount > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`
                            }}>
                                <AlertTriangle size={12} />
                                Violations: {proctoringStats.violationCount}
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px',
                                borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                background: proctoringStats.tabSwitchCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                                color: proctoringStats.tabSwitchCount > 0 ? '#fbbf24' : '#94a3b8',
                                border: `1px solid ${proctoringStats.tabSwitchCount > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(100,116,139,0.3)'}`
                            }}>
                                <ArrowLeftRight size={12} />
                                Tab Switches: {proctoringStats.tabSwitchCount}
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px',
                                borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                background: proctoringStats.phoneDetections > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)',
                                color: proctoringStats.phoneDetections > 0 ? '#f87171' : '#94a3b8',
                                border: `1px solid ${proctoringStats.phoneDetections > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(100,116,139,0.3)'}`
                            }}>
                                <Smartphone size={12} />
                                Phone: {proctoringStats.phoneDetections}
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px',
                                borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                background: proctoringStats.fullscreenExits > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                                color: proctoringStats.fullscreenExits > 0 ? '#fbbf24' : '#94a3b8',
                                border: `1px solid ${proctoringStats.fullscreenExits > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(100,116,139,0.3)'}`
                            }}>
                                <Maximize size={12} />
                                FS Exits: {proctoringStats.fullscreenExits}
                            </div>
                        </div>
                    </div>

                    {/* Stage Components */}
                    {currentView === 'mcq' && (
                        <SkillMCQTest
                            attemptId={activeAttempt}
                            attemptData={attemptData}
                            onComplete={(result) => onStageComplete('mcq', result)}
                            onFailed={() => { loadAttemptData(activeAttempt); setCurrentView('report'); }}
                        />
                    )}
                    {currentView === 'coding' && (
                        <SkillCodingTest
                            attemptId={activeAttempt}
                            attemptData={attemptData}
                            onComplete={(result) => onStageComplete('coding', result)}
                            onFailed={() => { loadAttemptData(activeAttempt); setCurrentView('report'); }}
                        />
                    )}
                    {currentView === 'sql' && (
                        <SkillSQLTest
                            attemptId={activeAttempt}
                            attemptData={attemptData}
                            onComplete={(result) => onStageComplete('sql', result)}
                            onFailed={() => { loadAttemptData(activeAttempt); setCurrentView('report'); }}
                        />
                    )}
                    {currentView === 'interview' && (
                        <SkillAIInterview
                            attemptId={activeAttempt}
                            attemptData={attemptData}
                            onComplete={(result) => onStageComplete('interview', result)}
                            onFailed={() => { loadAttemptData(activeAttempt); setCurrentView('report'); }}
                        />
                    )}
                </div>
            </div>
        );
    }

    // Test List View
    return (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{
                    width: '42px', height: '42px', borderRadius: '12px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
                }}>
                    <Brain size={22} color="white" />
                </div>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>Skill Assessments</h2>
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px' }}>
                    <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                    {error}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading available tests...</div>
            ) : tests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <Brain size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p style={{ fontSize: '16px', color: '#e2e8f0' }}>No skill tests available yet</p>
                    <p style={{ fontSize: '13px' }}>Tests will appear here when your admin creates them</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {tests.map(test => {
                        const latestAttempt = test.my_attempts?.[0];
                        const hasCompleted = test.my_attempts?.some(a => a.overall_status === 'completed');
                        const hasInProgress = test.my_attempts?.some(a => a.overall_status === 'in_progress');
                        const inProgressAttempt = test.my_attempts?.find(a => a.overall_status === 'in_progress');

                        return (
                            <div key={test.id} style={{
                                background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
                                padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                transition: 'box-shadow 0.2s',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: '#f1f5f9' }}>{test.title}</h3>
                                        {test.description && <p style={{ margin: '0 0 10px', color: '#94a3b8', fontSize: '13px' }}>{test.description}</p>}

                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                                            {test.skills.map(s => (
                                                <span key={s} style={{ padding: '2px 8px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', borderRadius: '12px', fontSize: '11px', border: '1px solid rgba(139,92,246,0.25)' }}>{s}</span>
                                            ))}
                                        </div>

                                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94a3b8', flexWrap: 'wrap' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Target size={13} /> MCQ: {test.mcq_count} | Coding: {test.coding_count} | SQL: {test.sql_count} | Interview: {test.interview_count}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={13} /> {test.mcq_duration_minutes}min MCQ
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <RotateCcw size={13} /> {test.attempts_used || 0}/{test.attempt_limit} attempts
                                            </span>
                                        </div>

                                        {/* Previous Attempts */}
                                        {test.my_attempts && test.my_attempts.length > 0 && (
                                            <div style={{ marginTop: '10px', padding: '8px 12px', background: '#0f172a', borderRadius: '8px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>Previous Attempts:</span>
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                    {test.my_attempts.map(a => (
                                                        <button key={a.id} onClick={() => {
                                                            if (a.overall_status === 'in_progress') initiateResume(a.id);
                                                            else viewReport(a.id);
                                                        }} style={{
                                                            padding: '4px 10px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer',
                                                            border: 'none', fontWeight: 600,
                                                            background: a.overall_status === 'completed' ? 'rgba(16,185,129,0.15)' : a.overall_status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                            color: a.overall_status === 'completed' ? '#34d399' : a.overall_status === 'failed' ? '#fca5a5' : '#fbbf24'
                                                        }}>
                                                            #{a.attempt_number}: {a.overall_status === 'in_progress' ? `In Progress (${a.current_stage})` : a.overall_status}
                                                            {a.overall_status !== 'in_progress' && ` - MCQ: ${Math.round(a.mcq_score)}%`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '16px' }}>
                                        {hasInProgress && (
                                            <button onClick={() => initiateResume(inProgressAttempt.id)} style={{
                                                padding: '10px 20px', background: '#f59e0b', color: 'white',
                                                border: 'none', borderRadius: '8px', cursor: 'pointer',
                                                fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                <Play size={16} /> Resume
                                            </button>
                                        )}
                                        {test.can_attempt && (
                                            <button onClick={() => initiateTest(test.id)} style={{
                                                padding: '10px 20px', background: '#8b5cf6', color: 'white',
                                                border: 'none', borderRadius: '8px', cursor: 'pointer',
                                                fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                <ArrowRight size={16} /> {test.attempts_used > 0 ? 'Retry' : 'Start Test'}
                                            </button>
                                        )}
                                        {!test.can_attempt && !hasInProgress && (
                                            <span style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
                                                {hasCompleted ? '✓ Completed' : 'No attempts left'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
