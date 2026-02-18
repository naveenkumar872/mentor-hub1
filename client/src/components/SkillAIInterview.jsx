import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Mic, MicOff, Send, CheckCircle, XCircle, MessageSquare, Volume2, VolumeX, Loader2 } from 'lucide-react';
import AvatarInterviewer from './AvatarInterviewer';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function SkillAIInterview({ attemptId, attemptData, onComplete, onFailed }) {
    const [question, setQuestion] = useState('');
    const [category, setCategory] = useState('');
    const [difficulty, setDifficulty] = useState('medium');
    const [questionNumber, setQuestionNumber] = useState(1);
    const [totalQuestions, setTotalQuestions] = useState(5);
    const [answer, setAnswer] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [avatarState, setAvatarState] = useState('idle');
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState('');
    const [timeLeft, setTimeLeft] = useState(null);
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const recognitionRef = useRef(null);
    const synthRef = useRef(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (timeLeft === null) return;
        if (timeLeft <= 0) {
            handleTimeUp();
            return;
        }
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleTimeUp();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [timeLeft]);

    const handleTimeUp = () => {
        alert('Time is up! Submitting your test automatically.');
        onFailed(); // Force fail if time runs out
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    useEffect(() => {
        synthRef.current = window.speechSynthesis;
        startInterview();
        return () => {
            stopListening();
            if (synthRef.current) synthRef.current.cancel();
        };
    }, []);

    const startInterview = async () => {
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/interview/start/${attemptId}`);
            setQuestion(data.question);
            setCategory(data.category || '');
            setDifficulty(data.difficulty || 'medium');
            setQuestionNumber(data.question_number);
            setTotalQuestions(data.total_questions);
            if (data.duration_minutes) setTimeLeft(data.duration_minutes * 60);
            setLoading(false);
            // Speak the question
            if (ttsEnabled) speakText(data.question);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setLoading(false);
        }
    };

    const speakText = (text) => {
        if (!synthRef.current || !ttsEnabled) return;
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 0.8;
        utterance.onstart = () => { setIsSpeaking(true); setAvatarState('speaking'); };
        utterance.onend = () => { setIsSpeaking(false); setAvatarState('idle'); };
        utterance.onerror = () => { setIsSpeaking(false); setAvatarState('idle'); };
        synthRef.current.speak(utterance);
    };

    const startListening = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setError('Speech recognition not supported in this browser. Please type your answer.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let finalTranscript = answer;

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            setAnswer(finalTranscript + interim);
        };

        recognition.onend = () => {
            setIsListening(false);
            setAvatarState('idle');
        };

        recognition.onerror = (event) => {
            if (event.error !== 'no-speech') {
                console.error('Speech error:', event.error);
            }
            setIsListening(false);
            setAvatarState('idle');
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
        setAvatarState('listening');

        // Stop any TTS
        if (synthRef.current) synthRef.current.cancel();
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
        setAvatarState('idle');
    };

    const submitAnswer = async () => {
        if (!answer.trim()) return setError('Please provide an answer');
        setSubmitting(true);
        setError('');
        setFeedback(null);
        setAvatarState('thinking');
        stopListening();

        try {
            const { data } = await axios.post(`${API}/api/skill-tests/interview/answer`, { attemptId, answer: answer.trim() });

            // Save to history
            setHistory(prev => [...prev, {
                question, answer: answer.trim(),
                score: data.score, feedback: data.feedback
            }]);

            setFeedback({ score: data.score, feedback: data.feedback });

            if (data.is_complete) {
                setResult({
                    passed: data.passed,
                    overall_score: data.overall_score,
                    status: data.status
                });
                setAvatarState('idle');
                if (data.passed) {
                    setTimeout(() => onComplete(data), 3000);
                } else {
                    setTimeout(() => onFailed(), 3000);
                }
            } else {
                // Move to next question after showing feedback
                setTimeout(() => {
                    setQuestion(data.next_question);
                    setCategory(data.next_category || '');
                    setDifficulty(data.next_difficulty || 'medium');
                    setQuestionNumber(data.question_number);
                    setAnswer('');
                    setFeedback(null);
                    setAvatarState('idle');
                    if (ttsEnabled) speakText(data.next_question);
                }, 3000);
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setAvatarState('idle');
        } finally {
            setSubmitting(false);
            scrollToBottom();
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    useEffect(() => {
        scrollToBottom();
    }, [history, question, feedback]);

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Starting AI Interview...</div>;

    if (result) {
        return (
            <div style={{ textAlign: 'center', padding: '60px' }}>
                <AvatarInterviewer state="idle" size={160} />
                <div style={{ marginTop: '20px' }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 20px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: result.passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'
                    }}>
                        {result.passed ? <CheckCircle size={40} color="#22c55e" /> : <XCircle size={40} color="#ef4444" />}
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px', color: '#f1f5f9' }}>
                        {result.passed ? 'Interview Passed!' : 'Interview Not Passed'}
                    </h2>
                    <p style={{ fontSize: '18px', color: '#94a3b8' }}>
                        Average Score: {(result.overall_score || 0).toFixed(1)}/10
                    </p>
                    <p style={{ fontSize: '14px', color: result.passed ? '#22c55e' : '#ef4444', marginTop: '12px' }}>
                        {result.passed ? 'Assessment complete! Generating report...' : 'Assessment ended. Generating report...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: '700px', background: '#0f172a', borderRadius: '24px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            {/* Left Sidebar: Interviewer Status & Stats */}
            <div style={{ background: '#1e293b', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', padding: '24px', position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                    <div style={{ position: 'relative' }}>
                        <AvatarInterviewer state={avatarState} size={180} />
                        <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '12px', height: '12px', borderRadius: '50%', background: avatarState === 'speaking' ? '#10b981' : avatarState === 'thinking' ? '#8b5cf6' : '#94a3b8', border: '2px solid #1e293b' }}></div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', marginBottom: '4px' }}>AI Interviewer</div>
                        <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{avatarState === 'speaking' ? 'Speaking...' : avatarState === 'thinking' ? 'Processing...' : 'Ready'}</div>
                    </div>

                    <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.05)', margin: '10px 0' }}></div>

                    {timeLeft !== null && (
                        <div style={{ width: '100%' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, marginBottom: '8px', textTransform: 'uppercase' }}>Time Efficiency</div>
                            <div style={{
                                padding: '12px', borderRadius: '16px', fontSize: '20px', fontWeight: 900,
                                background: timeLeft < 300 ? 'rgba(239,68,68,0.1)' : 'rgba(16, 185, 129, 0.1)',
                                color: timeLeft < 300 ? '#fca5a5' : '#10b981',
                                border: '1px solid ' + (timeLeft < 300 ? 'rgba(239,68,68,0.2)' : 'rgba(16, 185, 129, 0.2)'),
                                textAlign: 'center', fontFamily: '"JetBrains Mono", monospace'
                            }}>
                                {formatTime(timeLeft)}
                            </div>
                        </div>
                    )}

                    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>PROGRESS</div>
                            <div style={{ fontSize: '18px', fontWeight: 900, color: '#8b5cf6' }}>{questionNumber}/{totalQuestions}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>DIFFICULTY</div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: difficulty === 'hard' ? '#ef4444' : '#f59e0b', textTransform: 'uppercase' }}>{difficulty}</div>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: 'auto' }}>
                    <button onClick={() => setTtsEnabled(!ttsEnabled)} style={{
                        width: '100%', padding: '12px', background: ttsEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid ' + (ttsEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)'),
                        borderRadius: '12px', color: ttsEnabled ? '#10b981' : '#64748b', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s', fontWeight: 700, fontSize: '13px'
                    }}>
                        {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        {ttsEnabled ? 'VOICE ENABLED' : 'MUTE MODE'}
                    </button>
                </div>
            </div>

            {/* Right Main Interface: Chat Area */}
            <div style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', position: 'relative' }}>
                {/* Chat History Container */}
                <div
                    ref={chatContainerRef}
                    style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', scrollBehavior: 'smooth' }}
                >
                    {/* Welcome / Header */}
                    <div style={{ paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '10px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>Technical Assessment</h2>
                        <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>Conducting focus session on {category || 'General Software Engineering'}</p>
                    </div>

                    {/* History Messages */}
                    {history.map((h, i) => (
                        <React.Fragment key={i}>
                            {/* Bot Question */}
                            <div style={{ display: 'flex', gap: '12px', maxWidth: '85%' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <MessageSquare size={16} color="white" />
                                </div>
                                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '4px 20px 20px 20px', border: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: '15px', lineHeight: 1.6 }}>
                                    {h.question}
                                </div>
                            </div>

                            {/* User Answer */}
                            <div style={{ display: 'flex', gap: '12px', maxWidth: '85%', alignSelf: 'flex-end', flexDirection: 'row-reverse' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 900, color: 'white' }}>Y</div>
                                </div>
                                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '16px', borderRadius: '20px 4px 20px 20px', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#f1f5f9', fontSize: '15px', lineHeight: 1.6 }}>
                                    {h.answer}
                                </div>
                            </div>

                            {/* Bot Feedback */}
                            <div style={{ display: 'flex', gap: '12px', maxWidth: '75%', alignSelf: 'center' }}>
                                <div style={{
                                    background: h.score >= 7 ? 'rgba(34,197,94,0.05)' : 'rgba(245,158,11,0.05)',
                                    padding: '12px 20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)',
                                    display: 'flex', alignItems: 'center', gap: '12px'
                                }}>
                                    <div style={{ fontSize: '12px', fontWeight: 900, color: h.score >= 7 ? '#10b981' : '#f59e0b', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '8px' }}>
                                        SCORE: {h.score}/10
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>{h.feedback}</div>
                                </div>
                            </div>
                        </React.Fragment>
                    ))}

                    {/* Current Active Question */}
                    {!feedback && !result && (
                        <div style={{ display: 'flex', gap: '12px', maxWidth: '85%' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <MessageSquare size={16} color="white" />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '4px 20px 20px 20px', border: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: '15px', lineHeight: 1.6, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                                    {question}
                                    {!isSpeaking && ttsEnabled && (
                                        <button onClick={() => speakText(question)} style={{
                                            marginTop: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer',
                                            color: '#8b5cf6', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px'
                                        }}>
                                            <Volume2 size={12} /> REPLAY AUDIO
                                        </button>
                                    )}
                                </div>
                                <div style={{ fontSize: '11px', color: '#475569', paddingLeft: '4px', fontWeight: 600 }}>WAITING FOR YOUR ANSWER</div>
                            </div>
                        </div>
                    )}

                    {/* Error Overlay */}
                    {error && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '12px 20px', color: '#fca5a5', fontSize: '13px', alignSelf: 'center' }}>
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    {/* Feedback animation placeholder */}
                    {feedback && !result && (
                        <div style={{ display: 'flex', gap: '12px', maxWidth: '85%', opacity: 0.6 }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Loader2 size={16} className="animate-spin" color="white" />
                            </div>
                            <div style={{ background: '#0f172a', padding: '16px', color: '#475569', fontStyle: 'italic', fontSize: '14px' }}>
                                Moving to next question...
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area: Floating style like Gemini */}
                <div style={{ padding: '0 32px 32px' }}>
                    {!feedback && !result && (
                        <div style={{
                            background: '#1e293b', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.4)', padding: '12px', transition: 'all 0.3s'
                        }}>
                            <textarea
                                value={answer}
                                onChange={e => setAnswer(e.target.value)}
                                placeholder="Type your response here..."
                                rows={2}
                                style={{
                                    width: '100%', background: 'transparent', border: 'none', color: '#f8fafc',
                                    fontSize: '15px', lineHeight: 1.6, padding: '12px', resize: 'none', outline: 'none',
                                    fontFamily: 'inherit'
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (answer.trim() && !submitting) submitAnswer();
                                    }
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px 12px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={isListening ? stopListening : startListening} style={{
                                        width: '40px', height: '40px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                                        background: isListening ? '#ef4444' : 'rgba(16, 185, 129, 0.1)',
                                        color: isListening ? 'white' : '#10b981',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                        border: isListening ? 'none' : '1px solid rgba(16, 185, 129, 0.2)'
                                    }}>
                                        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                                    </button>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }}></div>
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{answer.split(/\s+/).filter(Boolean).length} WORDS</span>
                                    </div>
                                </div>

                                <button
                                    onClick={submitAnswer}
                                    disabled={submitting || !answer.trim()}
                                    style={{
                                        padding: '10px 24px', background: '#8b5cf6', color: 'white', border: 'none',
                                        borderRadius: '16px', cursor: 'pointer', fontWeight: 800, fontSize: '13px',
                                        display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s',
                                        opacity: (submitting || !answer.trim()) ? 0.3 : 1,
                                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                                    }}
                                >
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                    SUBMIT
                                </button>
                            </div>
                        </div>
                    )}
                    {(feedback || result) && (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#475569', fontSize: '14px', fontWeight: 600, letterSpacing: '0.05em' }}>
                            {result ? 'INTERVIEW COMPLETED' : 'EVALUATING RESPONSE...'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
