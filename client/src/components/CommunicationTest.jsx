/**
 * CommunicationTest.jsx
 * 4-module English communication assessment
 *   A: Read & Speak      – WER pronunciation scoring
 *   B: Listen & Repeat   – browser TTS + WER
 *   C: Topic Speaking    – Cerebras AI evaluation
 *   D: Grammar Quiz      – fill-in-the-blank
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import BrowserSpeechRecognition, { useSpeechRecognition as useBrowserSpeechRecognition } from 'react-speech-recognition'
import {
    Mic, MicOff, Volume2, CheckCircle, XCircle, BarChart2, Trophy,
    RefreshCw, ChevronRight, Clock, Target, Brain, BookOpen,
    Play, Square, ArrowRight, Star, Layers, Zap, Award, X
} from 'lucide-react'
import ModuleGDRound from './ModuleGDRound'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'
const TRANSCRIPT_SOURCE = {
    JS_LIBRARY: 'browser',
    WHISPER: 'whisper',
    NATIVE: 'native'
}

function getNativeSpeechRecognition() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthHeaders() {
    const token = localStorage.getItem('authToken')
    return token ? { Authorization: `Bearer ${token}` } : {}
}

function ScoreBadge({ score, size = 'md' }) {
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#a855f7' : score >= 40 ? '#f59e0b' : '#ef4444'
    const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Work'
    const sz = size === 'lg' ? { ring: 100, font: '2rem', sub: '0.85rem' } : { ring: 64, font: '1.3rem', sub: '0.65rem' }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: sz.ring, height: sz.ring, position: 'relative' }}>
                <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#374151" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
                        strokeDasharray={`${score}, 100`} strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 1s ease' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <span style={{ fontSize: sz.font, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
                </div>
            </div>
            <span style={{ fontSize: sz.sub, fontWeight: 700, color, textTransform: 'uppercase' }}>{label}</span>
        </div>
    )
}

// ─── Speech Hook (MediaRecorder → Groq Whisper backend) ──────────────────────
// Replaces webkitSpeechRecognition which fails on networks that block Google.

// Try Web Speech API as a last-resort fallback if Groq transcription fails
function tryBrowserSpeechFallback(onResult, onError) {
    const SR = getNativeSpeechRecognition()
    if (!SR) { onError('Transcription unavailable. Please try again.'); return }
    const rec = new SR()
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = e => onResult(e.results[0][0].transcript)
    rec.onerror = () => onError('Both transcription methods failed. Check your internet connection.')
    rec.onend = () => {}
    try { rec.start() } catch { onError('Fallback speech recognition failed.') }
    // Auto-stop after 8 seconds to avoid hanging
    setTimeout(() => { try { rec.stop() } catch {} }, 8000)
}

function transcribeWithNativeSpeechRecognition() {
    return new Promise((resolve, reject) => {
        const SR = getNativeSpeechRecognition()
        if (!SR) {
            reject(new Error('Native speech recognition is unavailable.'))
            return
        }

        const rec = new SR()
        let settled = false

        rec.lang = 'en-US'
        rec.interimResults = false
        rec.maxAlternatives = 1

        rec.onresult = e => {
            settled = true
            const text = e?.results?.[0]?.[0]?.transcript?.trim() || ''
            if (text) resolve(text)
            else reject(new Error('Native speech recognition returned empty text.'))
        }

        rec.onerror = e => {
            settled = true
            reject(new Error(e?.error || 'Native speech recognition failed.'))
        }

        rec.onend = () => {
            if (!settled) {
                reject(new Error('Native speech recognition ended without a transcript.'))
            }
        }

        try {
            rec.start()
        } catch (e) {
            reject(e)
            return
        }

        setTimeout(() => {
            try { rec.stop() } catch {}
        }, 8000)
    })
}

function useSpeechRecognition() {
    const [isListening, setIsListening] = useState(false)   // mic is actively recording
    const [isProcessing, setIsProcessing] = useState(false) // recorder stopped, waiting for transcript
    const [transcript, setTranscript] = useState('')
    const [error, setError] = useState(null)
    const [durationSec, setDurationSec] = useState(0)
    const mediaRecorderRef = useRef(null)
    const chunksRef = useRef([])
    const startTimeRef = useRef(null)

    const supported = !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia)

    const start = useCallback(async () => {
        setTranscript(''); setError(null); setDurationSec(0); setIsProcessing(false)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : ''
            const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
            chunksRef.current = []
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop())
                // Immediately flip to "processing" state — Stop button disappears right away
                setIsListening(false)
                setDurationSec(Math.round((Date.now() - startTimeRef.current) / 1000))
                if (chunksRef.current.length === 0) { return }
                setIsProcessing(true)
                try {
                    // PRIMARY: Groq Whisper via backend
                    const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
                    const fd = new FormData()
                    fd.append('audio', blob, 'speech.webm')
                    const res = await axios.post(`${API_BASE}/comm-test/transcribe`, fd, {
                        headers: getAuthHeaders(),
                        timeout: 15000
                    })
                    if (res.data.success && res.data.transcript) {
                        setTranscript(res.data.transcript)
                        setIsProcessing(false)
                    } else {
                        // FALLBACK: browser Web Speech API
                        tryBrowserSpeechFallback(
                            t => { setTranscript(t); setIsProcessing(false) },
                            msg => { setError(msg); setIsProcessing(false) }
                        )
                    }
                } catch (e) {
                    console.warn('Groq transcription failed, trying browser fallback:', e.message)
                    tryBrowserSpeechFallback(
                        t => { setTranscript(t); setIsProcessing(false) },
                        msg => { setError(msg); setIsProcessing(false) }
                    )
                }
            }
            mr.start()
            mediaRecorderRef.current = mr
            startTimeRef.current = Date.now()
            setIsListening(true)
        } catch (e) {
            setError(
                e.name === 'NotAllowedError'
                    ? 'Microphone access denied. Please allow microphone access in your browser settings.'
                    : 'Could not access microphone. Please try again.'
            )
        }
    }, [])

    const stop = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop()
        }
    }, [])

    const reset = useCallback(() => { setTranscript(''); setError(null); setDurationSec(0); setIsProcessing(false) }, [])

    return { isListening, isProcessing, transcript, error, durationSec, supported, start, stop, reset }
}

function usePrimaryBrowserSpeechRecognition() {
    const [isListening, setIsListening] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [transcript, setTranscript] = useState('')
    const [error, setError] = useState(null)
    const [durationSec, setDurationSec] = useState(0)
    const [transcriptSource, setTranscriptSource] = useState(null)
    const mediaRecorderRef = useRef(null)
    const chunksRef = useRef([])
    const startTimeRef = useRef(null)
    const browserTranscriptRef = useRef('')
    const browserErrorRef = useRef(null)

    const {
        transcript: browserTranscript,
        resetTranscript,
        browserSupportsSpeechRecognition
    } = useBrowserSpeechRecognition()

    useEffect(() => {
        browserTranscriptRef.current = browserTranscript || ''
    }, [browserTranscript])

    const canRecordAudio = !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia)
    const nativeSpeechRecognitionSupported = !!getNativeSpeechRecognition()
    const supported = browserSupportsSpeechRecognition || canRecordAudio || nativeSpeechRecognitionSupported

    const transcribeWithWhisper = useCallback(async (mimeType) => {
        if (chunksRef.current.length === 0) {
            throw new Error('No audio captured for transcription.')
        }

        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        const fd = new FormData()
        fd.append('audio', blob, 'speech.webm')

        const res = await axios.post(`${API_BASE}/comm-test/transcribe`, fd, {
            headers: getAuthHeaders(),
            timeout: 15000
        })

        if (!res.data.success || !res.data.transcript) {
            throw new Error(res.data.error || 'Whisper transcription did not return any text.')
        }

        return res.data.transcript
    }, [])

    const start = useCallback(async () => {
        setTranscript('')
        setError(null)
        setDurationSec(0)
        setIsProcessing(false)
        setTranscriptSource(null)
        browserErrorRef.current = null
        browserTranscriptRef.current = ''
        resetTranscript()

        if (!supported) {
            setError('Speech recognition is not available in this browser. Please use Chrome, Edge, or Firefox.')
            return
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : ''
            const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
            chunksRef.current = []
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop())
                setIsListening(false)
                setDurationSec(Math.round((Date.now() - startTimeRef.current) / 1000))
                if (chunksRef.current.length === 0) return

                setIsProcessing(true)
                try {
                    await new Promise(resolve => setTimeout(resolve, 500))
                    const browserText = (browserTranscriptRef.current || '').trim()

                    if (browserSupportsSpeechRecognition && !browserErrorRef.current && browserText) {
                        setTranscript(browserText)
                        setTranscriptSource(TRANSCRIPT_SOURCE.JS_LIBRARY)
                    } else {
                        try {
                            const whisperText = await transcribeWithWhisper(mimeType)
                            setTranscript(whisperText)
                            setTranscriptSource(TRANSCRIPT_SOURCE.WHISPER)
                        } catch (whisperError) {
                            const nativeText = await transcribeWithNativeSpeechRecognition()
                            setTranscript(nativeText)
                            setTranscriptSource(TRANSCRIPT_SOURCE.NATIVE)
                            console.warn('Whisper fallback failed, native speech recognition succeeded:', whisperError.message)
                        }
                    }
                } catch (e) {
                    console.warn('Speech transcription failed:', e.message)
                    setError('Speech recognition failed in the JS library, Whisper fallback, and native browser fallback. Please try again.')
                } finally {
                    setIsProcessing(false)
                }
            }

            mr.start()
            mediaRecorderRef.current = mr
            startTimeRef.current = Date.now()

            if (browserSupportsSpeechRecognition) {
                try {
                    await BrowserSpeechRecognition.startListening({ continuous: true, language: 'en-US' })
                } catch (speechError) {
                    browserErrorRef.current = speechError?.message || 'Browser speech recognition failed to start.'
                }
            }

            setIsListening(true)
        } catch (e) {
            setError(
                e.name === 'NotAllowedError'
                    ? 'Microphone access denied. Please allow microphone access in your browser settings.'
                    : 'Could not access microphone. Please try again.'
            )
        }
    }, [browserSupportsSpeechRecognition, resetTranscript, supported, transcribeWithWhisper])

    const stop = useCallback(() => {
        try { BrowserSpeechRecognition.stopListening() } catch {}

        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop()
            return
        }

        if (browserSupportsSpeechRecognition) {
            const browserText = (browserTranscriptRef.current || '').trim()
            setIsListening(false)
            if (browserText) {
                setTranscript(browserText)
                setTranscriptSource(TRANSCRIPT_SOURCE.JS_LIBRARY)
            } else {
                setError('No speech detected. Please try again.')
            }
        }
    }, [browserSupportsSpeechRecognition])

    const reset = useCallback(() => {
        try { BrowserSpeechRecognition.abortListening() } catch {}
        setTranscript('')
        setError(null)
        setDurationSec(0)
        setIsProcessing(false)
        setTranscriptSource(null)
        browserErrorRef.current = null
        browserTranscriptRef.current = ''
        resetTranscript()
    }, [resetTranscript])

    return { isListening, isProcessing, transcript, transcriptSource, error, durationSec, supported, start, stop, reset }
}

// ─── Module A: Read & Speak ───────────────────────────────────────────────────

function ModuleReadSpeak({ sessionId, testId, onComplete }) {
    const [sentence, setSentence] = useState(null)
    const [questionId, setQuestionId] = useState(null)
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [completed, setCompleted] = useState([])
    const [totalQ, setTotalQ] = useState(0)
    const [allDone, setAllDone] = useState(false)
    const { isListening, isProcessing, transcript, transcriptSource, error, durationSec, supported, start, stop, reset } = usePrimaryBrowserSpeechRecognition()

    const fetchSentence = async (completedIds) => {
        setLoading(true); setSentence(null); setQuestionId(null); reset()
        try {
            const { data } = await axios.get(`${API_BASE}/comm-test/tests/${testId}/questions`, {
                params: { module_type: 'read-speak', excluded: completedIds.join(',') },
                headers: getAuthHeaders()
            })
            setSentence(data.question?.content)
            setQuestionId(data.question?.id)
            if (data.total) setTotalQ(data.total)
        } catch (e) {
            if (e.response?.status === 404) setAllDone(true)
        }
        setLoading(false)
    }

    useEffect(() => { fetchSentence([]) }, [testId]) // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async () => {
        if (!transcript) return
        setSubmitting(true)
        try {
            await axios.post(`${API_BASE}/comm-test/submit/read-speak`, {
                sessionId, questionId, transcribedText: transcript, durationSec
            }, { headers: getAuthHeaders() })
            const newCompleted = [...completed, questionId]
            setCompleted(newCompleted)
            await fetchSentence(newCompleted)
        } catch (e) { console.error(e) }
        setSubmitting(false)
    }

    const currentQ = completed.length + 1

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <BookOpen size={20} color="#a855f7" />
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#a855f7', textTransform: 'uppercase' }}>Read & Speak</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748b' }}>
                        {allDone ? `✅ All ${completed.length} done` : `Question ${currentQ}${totalQ ? ` / ${totalQ}` : ''}`}
                    </span>
                </div>
                {totalQ > 0 && !allDone && (
                    <div style={{ height: 4, background: '#0f172a', borderRadius: 4, marginBottom: 20, border: '1px solid #1e293b' }}>
                        <div style={{ height: '100%', width: `${(completed.length / totalQ) * 100}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                    </div>
                )}
                {allDone ? (
                    <div style={{ textAlign: 'center', padding: 32 }}>
                        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
                        <div style={{ color: '#10b981', fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>All {completed.length} questions completed!</div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 24 }}>Your scores have been saved.</div>
                        <button onClick={onComplete} style={{ padding: '12px 32px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
                            Next Module <ArrowRight size={16} style={{ marginLeft: 6 }} />
                        </button>
                    </div>
                ) : loading ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>Loading sentence…</div>
                ) : (
                    <>
                        <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.6, background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
                            "{sentence}"
                        </p>
                        <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 16 }}>
                            Read this sentence aloud clearly. Press <strong style={{ color: '#a855f7' }}>Start Recording</strong>, speak, then press <strong style={{ color: '#a855f7' }}>Stop</strong>.
                        </p>
                        {!supported && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 12 }}>⚠️ Your browser does not support audio recording. Please use Chrome, Firefox, or Edge.</div>}
                        {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 12 }}>⚠️ {error}</div>}

                        {/* Recording controls */}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                            {isListening ? (
                                <button onClick={stop} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                                    background: 'linear-gradient(135deg, #ef4444, #f87171)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', animation: 'pulse 1s infinite'
                                }}>
                                    <Square size={16} /> Stop Recording
                                </button>
                            ) : isProcessing ? (
                                <button disabled style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                                    background: '#1e293b', border: '1px solid #7c3aed', borderRadius: 10, color: '#a855f7', fontWeight: 700, cursor: 'default', fontSize: '0.9rem'
                                }}>
                                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Transcribing…
                                </button>
                            ) : (
                                <button onClick={start} disabled={!supported} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                                    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                    border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: !supported ? 'not-allowed' : 'pointer', fontSize: '0.9rem'
                                }}>
                                    <Mic size={16} /> Start Recording
                                </button>
                            )}
                        </div>

                        {isListening && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontSize: '0.85rem', marginBottom: 12 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />🔴 Recording… speak clearly</div>}
                        {isProcessing && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a855f7', fontSize: '0.85rem', marginBottom: 12 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a855f7', animation: 'pulse 1s infinite' }} />⏳ Transcribing your speech…</div>}

                        {transcript && (
                            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase' }}>Your Speech</div>
                                <div style={{ color: '#f1f5f9', fontStyle: 'italic' }}>"{transcript}"</div>
                                <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#94a3b8' }}>
                                    Source: {transcriptSource === TRANSCRIPT_SOURCE.JS_LIBRARY ? 'JS library speech recognition' : transcriptSource === TRANSCRIPT_SOURCE.WHISPER ? 'Whisper fallback' : transcriptSource === TRANSCRIPT_SOURCE.NATIVE ? 'Native browser speech recognition fallback' : 'Unknown'}
                                </div>
                            </div>
                        )}

                        <button onClick={submit} disabled={!transcript || submitting} style={{
                            width: '100%', padding: '12px', background: transcript && !submitting ? 'linear-gradient(135deg, #5b21b6, #7c3aed)' : '#374151',
                            border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: transcript && !submitting ? 'pointer' : 'not-allowed', fontSize: '0.9rem'
                        }}>
                            {submitting ? 'Scoring & Loading Next…' : 'Submit & Next Question →'}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

// ─── Module B: Listen & Repeat ────────────────────────────────────────────────

function ModuleListenRepeat({ sessionId, testId, onComplete }) {
    const [sentence, setSentence] = useState(null)
    const [questionId, setQuestionId] = useState(null)
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [played, setPlayed] = useState(false)
    const [completed, setCompleted] = useState([])
    const [totalQ, setTotalQ] = useState(0)
    const [allDone, setAllDone] = useState(false)
    const { isListening, isProcessing, transcript, transcriptSource, error, supported, start, stop, reset } = usePrimaryBrowserSpeechRecognition()

    const fetchSentence = async (completedIds) => {
        setLoading(true); setSentence(null); setQuestionId(null); setPlayed(false); reset()
        try {
            const { data } = await axios.get(`${API_BASE}/comm-test/tests/${testId}/questions`, {
                params: { module_type: 'listen-repeat', excluded: completedIds.join(',') }, headers: getAuthHeaders()
            })
            setSentence(data.question?.content)
            setQuestionId(data.question?.id)
            if (data.total) setTotalQ(data.total)
        } catch (e) {
            if (e.response?.status === 404) setAllDone(true)
        }
        setLoading(false)
    }

    useEffect(() => { fetchSentence([]) }, [testId]) // eslint-disable-line react-hooks/exhaustive-deps

    const playSentence = () => {
        if (!sentence) return
        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance(sentence)
        utt.lang = 'en-US'; utt.rate = 0.9
        window.speechSynthesis.speak(utt)
        setPlayed(true)
    }

    const submit = async () => {
        if (!transcript) return
        setSubmitting(true)
        try {
            await axios.post(`${API_BASE}/comm-test/submit/listen-repeat`, {
                sessionId, questionId, transcribedText: transcript
            }, { headers: getAuthHeaders() })
            const newCompleted = [...completed, questionId]
            setCompleted(newCompleted)
            await fetchSentence(newCompleted)
        } catch (e) { console.error(e) }
        setSubmitting(false)
    }

    const currentQ = completed.length + 1

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <Volume2 size={20} color="#5b21b6" />
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#5b21b6', textTransform: 'uppercase' }}>Listen & Repeat</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748b' }}>
                        {allDone ? `✅ All ${completed.length} done` : `Question ${currentQ}${totalQ ? ` / ${totalQ}` : ''}`}
                    </span>
                </div>
                {totalQ > 0 && !allDone && (
                    <div style={{ height: 4, background: '#0f172a', borderRadius: 4, marginBottom: 20, border: '1px solid #1e293b' }}>
                        <div style={{ height: '100%', width: `${(completed.length / totalQ) * 100}%`, background: 'linear-gradient(90deg, #4c1d95, #5b21b6)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                    </div>
                )}
                {allDone ? (
                    <div style={{ textAlign: 'center', padding: 32 }}>
                        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
                        <div style={{ color: '#10b981', fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>All {completed.length} questions completed!</div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 24 }}>Your scores have been saved.</div>
                        <button onClick={onComplete} style={{ padding: '12px 32px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
                            Next Module <ArrowRight size={16} style={{ marginLeft: 6 }} />
                        </button>
                    </div>
                ) : loading ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>Loading…</div>
                ) : (
                    <>
                        {/* Step 1: Listen */}
                        <div style={{ background: '#0f172a', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #334155' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Step 1 — Listen</div>
                            <button onClick={playSentence} style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                                background: 'linear-gradient(135deg, #4c1d95, #5b21b6)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: 'pointer'
                            }}>
                                <Volume2 size={16} /> {played ? 'Play Again' : 'Play Sentence'}
                            </button>
                            {played && <p style={{ marginTop: 10, fontSize: '0.82rem', color: '#94a3b8' }}>Sentence played. Now listen carefully and repeat it aloud.</p>}
                        </div>

                        {/* Step 2: Repeat */}
                        {played && (
                            <div style={{ background: '#0f172a', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Step 2 — Repeat Aloud</div>
                                {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 10 }}>⚠️ {error}</div>}
                                <div style={{ display: 'flex', gap: 10 }}>
                                    {isListening ? (
                                        <button onClick={stop} style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                                            background: 'linear-gradient(135deg, #ef4444, #f87171)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: 'pointer'
                                        }}>
                                            <Square size={16} /> Stop
                                        </button>
                                    ) : isProcessing ? (
                                        <button disabled style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                                            background: '#1e293b', border: '1px solid #7c3aed', borderRadius: 10, color: '#a855f7', fontWeight: 700, cursor: 'default'
                                        }}>
                                            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Transcribing…
                                        </button>
                                    ) : (
                                        <button onClick={start} style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                                            background: 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: 'pointer'
                                        }}>
                                            <Mic size={16} /> Record
                                        </button>
                                    )}
                                </div>
                                {isListening && <div style={{ marginTop: 10, color: '#ef4444', fontSize: '0.82rem' }}>🔴 Recording… speak clearly</div>}
                                {isProcessing && <div style={{ marginTop: 10, color: '#a855f7', fontSize: '0.82rem' }}>⏳ Transcribing your speech…</div>}
                                {transcript && (
                                    <div style={{ marginTop: 12 }}>
                                        <div style={{ color: '#f1f5f9', fontStyle: 'italic', fontSize: '0.9rem' }}>"{transcript}"</div>
                                        <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8' }}>
                                            Source: {transcriptSource === TRANSCRIPT_SOURCE.JS_LIBRARY ? 'JS library speech recognition' : transcriptSource === TRANSCRIPT_SOURCE.WHISPER ? 'Whisper fallback' : transcriptSource === TRANSCRIPT_SOURCE.NATIVE ? 'Native browser speech recognition fallback' : 'Unknown'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {played && transcript && (
                            <button onClick={submit} disabled={submitting} style={{
                                width: '100%', padding: 12, background: submitting ? '#374151' : 'linear-gradient(135deg, #5b21b6, #7c3aed)',
                                border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer'
                            }}>
                                {submitting ? 'Scoring & Loading Next…' : 'Submit & Next Question →'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

// ─── Module C: Topic Speaking (Cerebras AI) ───────────────────────────────────

function ModuleTopicSpeak({ sessionId, testId, onComplete }) {
    const [topic, setTopic] = useState(null)
    const [questionId, setQuestionId] = useState(null)
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [completed, setCompleted] = useState([])
    const { isListening, isProcessing, transcript, transcriptSource, error, supported, start, stop, reset } = usePrimaryBrowserSpeechRecognition()
    const cancelBrowserSpeech = useCallback(() => {
        try { window.speechSynthesis?.cancel() } catch {}
    }, [])

    const fetchTopic = async () => {
        cancelBrowserSpeech()
        setLoading(true); setResult(null); reset()
        try {
            const { data } = await axios.get(`${API_BASE}/comm-test/tests/${testId}/questions`, {
                params: { module_type: 'topic-speak', excluded: completed.join(',') }, headers: getAuthHeaders()
            })
            setTopic(data.question?.content); setQuestionId(data.question?.id)
        } catch (e) { console.error(e) }
        setLoading(false)
    }

    useEffect(() => {
        fetchTopic()
        return () => {
            stop()
            cancelBrowserSpeech()
        }
    }, [cancelBrowserSpeech, stop])

    const submit = async () => {
        if (!transcript || transcript.trim().length < 5) return
        stop()
        cancelBrowserSpeech()
        setSubmitting(true)
        try {
            const { data } = await axios.post(`${API_BASE}/comm-test/submit/topic-speak`, {
                sessionId, questionId, transcribedText: transcript
            }, { headers: getAuthHeaders() })
            setResult(data)
            setCompleted(prev => [...prev, questionId])
        } catch (e) { console.error(e) }
        setSubmitting(false)
    }

    const aiCriteria = result ? [
        { label: 'Relevance', score: result.relevanceScore, max: 25 },
        { label: 'Grammar', score: result.grammarScore, max: 25 },
        { label: 'Vocabulary', score: result.vocabularyScore, max: 25 },
        { label: 'Coherence', score: result.coherenceScore, max: 25 },
    ] : []

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <Zap size={20} color="#a855f7" />
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#a855f7', textTransform: 'uppercase' }}>Topic Speaking</span>
                    <span style={{ marginLeft: 4, fontSize: '0.7rem', background: '#4c1d95', color: '#c084fc', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>AI Powered</span>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>Loading topic…</div>
                ) : (
                    <>
                        <div style={{ background: 'linear-gradient(135deg, #170032, #5b21b6)', borderRadius: 12, padding: '20px 24px', marginBottom: 20, textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: '#c4b5fd', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Your Topic</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', lineHeight: 1.4 }}>"{topic}"</div>
                        </div>

                        <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 16 }}>
                            Speak about this topic for 30–60 seconds. Your response will be evaluated by AI on relevance, grammar, vocabulary, and coherence.
                        </p>

                        {!supported && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 10 }}>⚠️ Your browser does not support audio recording. Please use Chrome, Firefox, or Edge.</div>}
                        {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 10 }}>⚠️ {error}</div>}

                        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                            {isListening ? (
                                <button onClick={stop} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                                    background: 'linear-gradient(135deg, #ef4444, #f87171)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: 'pointer'
                                }}>
                                    <Square size={16} /> Done Speaking
                                </button>
                            ) : isProcessing ? (
                                <button disabled style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                                    background: '#1e293b', border: '1px solid #7c3aed', borderRadius: 10, color: '#a855f7', fontWeight: 700, cursor: 'default'
                                }}>
                                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Transcribing…
                                </button>
                            ) : (
                                <button onClick={start} disabled={!supported || !!result} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                                    background: result ? '#374151' : 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: result ? 'not-allowed' : 'pointer'
                                }}>
                                    <Mic size={16} /> Start Speaking
                                </button>
                            )}
                        </div>

                        {isListening && <div style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: 10 }}>🔴 Recording… speak freely about the topic</div>}
                        {isProcessing && <div style={{ color: '#a855f7', fontSize: '0.82rem', marginBottom: 10 }}>⏳ Transcribing your speech, please wait…</div>}

                        {transcript && (
                            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 16, maxHeight: 120, overflowY: 'auto' }}>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase' }}>Transcribed</div>
                                <div style={{ color: '#f1f5f9', fontSize: '0.9rem', lineHeight: 1.5 }}>{transcript}</div>
                                <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#94a3b8' }}>
                                    Source: {transcriptSource === TRANSCRIPT_SOURCE.JS_LIBRARY ? 'JS library speech recognition' : transcriptSource === TRANSCRIPT_SOURCE.WHISPER ? 'Whisper fallback' : transcriptSource === TRANSCRIPT_SOURCE.NATIVE ? 'Native browser speech recognition fallback' : 'Unknown'}
                                </div>
                            </div>
                        )}

                        {result ? (
                            <div style={{ background: '#0f172a', borderRadius: 14, padding: 20, border: '1px solid rgba(16,185,129,0.3)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <CheckCircle size={22} color="#10b981" />
                                    </div>
                                    <div>
                                        <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.95rem' }}>AI Evaluation Complete!</div>
                                        <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 2 }}>Your score has been saved. Full breakdown shown in the final report.</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button onClick={fetchTopic} style={{ flex: 1, padding: 10, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, color: '#a855f7', fontWeight: 700, cursor: 'pointer' }}>Try Another Topic</button>
                                    <button onClick={() => { stop(); cancelBrowserSpeech(); onComplete() }} style={{ flex: 1, padding: 10, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                                        Next Module <ArrowRight size={14} style={{ marginLeft: 4 }} />
                                    </button>
                                </div>
                            </div>
                        ) : transcript && (
                            <button onClick={submit} disabled={submitting} style={{
                                width: '100%', padding: 12,
                                background: submitting ? '#374151' : 'linear-gradient(135deg, #5b21b6, #7c3aed)',
                                border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer'
                            }}>
                                {submitting ? 'AI is evaluating…' : 'Submit for AI Evaluation'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

function ModuleGrammarQuiz({ sessionId, testId, onComplete, moduleType = 'grammar-quiz' }) {
    const [questions, setQuestions] = useState([])
    const [currentIdx, setCurrentIdx] = useState(0)
    const [answers, setAnswers] = useState({})
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const MODULE_LABELS = { 'grammar-quiz': 'Grammar Quiz', 'vocabulary-test': 'Vocabulary Test', 'email-writing': 'Email Writing' }
    const MODULE_COLORS = { 'grammar-quiz': '#c084fc', 'vocabulary-test': '#34d399', 'email-writing': '#60a5fa' }
    const moduleLabel = MODULE_LABELS[moduleType] || 'Quiz'
    const moduleColor = MODULE_COLORS[moduleType] || '#c084fc'

    const fetchQuiz = async () => {
        setLoading(true); setAnswers({}); setCurrentIdx(0)
        try {
            const { data } = await axios.get(`${API_BASE}/comm-test/tests/${testId}/grammar-batch`, {
                params: { count: 5, module_type: moduleType }, headers: getAuthHeaders()
            })
            setQuestions(data.questions || [])
        } catch (e) { console.error(e) }
        setLoading(false)
    }

    useEffect(() => { fetchQuiz() }, [testId, moduleType]) // eslint-disable-line react-hooks/exhaustive-deps

    const currentQ = questions[currentIdx]
    const isLast = currentIdx === questions.length - 1
    const allAnswered = questions.length > 0 && Object.keys(answers).length >= questions.length

    const goNext = () => { if (currentIdx < questions.length - 1) setCurrentIdx(prev => prev + 1) }

    const submit = async () => {
        if (!allAnswered) return
        setSubmitting(true)
        try {
            const ans = questions.map(q => ({ id: q.id, answer: answers[q.id] || '' }))
            await axios.post(`${API_BASE}/comm-test/submit/grammar-quiz`, {
                sessionId, answers: ans, moduleType
            }, { headers: getAuthHeaders() })
            await onComplete()
        } catch (e) { console.error(e) }
        setSubmitting(false)
    }

    const categoryColors = { 'Past Simple': '#ef4444', 'Present Continuous': '#f59e0b', 'Past Continuous': '#f97316', 'Present Perfect': '#10b981', 'Past Perfect': '#06b6d4', 'Prepositions': '#a855f7', 'Articles': '#3b82f6', 'Adverbs': '#8b5cf6' }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <Brain size={20} color={moduleColor} />
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: moduleColor, textTransform: 'uppercase' }}>{moduleLabel}</span>
                    {questions.length > 0 && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748b' }}>Question {currentIdx + 1} / {questions.length}</span>
                    )}
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>Loading quiz…</div>
                ) : questions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>No questions found for this module.</div>
                ) : (
                    <>
                        {/* Progress bar */}
                        <div style={{ height: 4, background: '#0f172a', borderRadius: 4, marginBottom: 20, border: '1px solid #1e293b' }}>
                            <div style={{ height: '100%', width: `${((currentIdx + (answers[currentQ?.id] ? 1 : 0)) / questions.length) * 100}%`, background: `linear-gradient(90deg, ${moduleColor}88, ${moduleColor})`, borderRadius: 4, transition: 'width 0.3s ease' }} />
                        </div>
                        <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 20 }}>Fill in the blank. Type your answer in the input box — exact match required.</p>
                        {currentQ && (
                            <div style={{ background: '#0f172a', borderRadius: 12, padding: 16, border: '1px solid #334155', marginBottom: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, background: (categoryColors[currentQ.category] || moduleColor) + '22', color: categoryColors[currentQ.category] || moduleColor, padding: '2px 8px', borderRadius: 8 }}>
                                        {currentQ.category}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Q{currentIdx + 1}</span>
                                </div>
                                <div style={{ fontSize: '0.95rem', color: '#f1f5f9', marginBottom: 10, lineHeight: 1.5 }}>{currentQ.sentence}</div>
                                <input
                                    type="text"
                                    placeholder="Type your answer…"
                                    value={answers[currentQ.id] || ''}
                                    onChange={e => setAnswers(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter' && answers[currentQ.id] && !isLast) goNext() }}
                                    style={{
                                        width: '100%', padding: '8px 12px', background: '#1e293b', border: `1px solid ${answers[currentQ.id] ? moduleColor : '#334155'}`,
                                        borderRadius: 8, color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 10 }}>
                            {currentIdx > 0 && (
                                <button onClick={() => setCurrentIdx(prev => prev - 1)} style={{ padding: '10px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, color: '#94a3b8', fontWeight: 700, cursor: 'pointer' }}>
                                    ← Back
                                </button>
                            )}
                            {isLast ? (
                                <button onClick={submit} disabled={!allAnswered || submitting} style={{
                                    flex: 1, padding: 12,
                                    background: allAnswered && !submitting ? 'linear-gradient(135deg, #5b21b6, #7c3aed)' : '#374151',
                                    border: 'none', borderRadius: 10, color: 'white', fontWeight: 700,
                                    cursor: allAnswered ? 'pointer' : 'not-allowed'
                                }}>
                                    {submitting ? 'Checking…' : `Submit All ${questions.length} Answers`}
                                </button>
                            ) : (
                                <button onClick={goNext} disabled={!answers[currentQ?.id]} style={{
                                    flex: 1, padding: 12,
                                    background: answers[currentQ?.id] ? 'linear-gradient(135deg, #5b21b6, #7c3aed)' : '#374151',
                                    border: 'none', borderRadius: 10, color: 'white', fontWeight: 700,
                                    cursor: answers[currentQ?.id] ? 'pointer' : 'not-allowed'
                                }}>
                                    Next → ({currentIdx + 1}/{questions.length})
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// ─── Session Report ───────────────────────────────────────────────────────────

function SessionReport({ sessionId, onRestart }) {
    const [report, setReport] = useState(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('overview')
    const [selectedModule, setSelectedModule] = useState(null)
    useEffect(() => {
        if (!sessionId) return
        axios.get(`${API_BASE}/comm-test/session/report/${sessionId}`, { headers: getAuthHeaders() })
            .then(r => setReport(r.data))
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [sessionId])

    const MODULE_META_REPORT = {
        'read-speak':     { label: 'Read & Speak',    color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
        'listen-repeat':  { label: 'Listen & Repeat', color: '#5b21b6', bg: 'rgba(91,33,182,0.12)'  },
        'topic-speak':    { label: 'Topic Speaking',  color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
        'grammar-quiz':   { label: 'Grammar Quiz',    color: '#c084fc', bg: 'rgba(192,132,252,0.12)'},
        'vocabulary-test': { label: 'Vocabulary Test', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
        'email-writing':  { label: 'Professional Writing', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
        'gd-round':       { label: 'Group Discussion', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
    }

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Generating your report…</div>
    if (!report) return null

    const rawScore = Number.isFinite(Number(report?.overallScore)) ? Number(report.overallScore) : 0
    const score = Math.max(0, Math.min(100, Math.round(rawScore)))

    function renderModuleDetail(module, submissions) {
        if (module === 'gd-round') {
            const ai = submissions[0]?.ai_scores || {}
            const turns = ai.turns || []
            const stuTurns = turns.filter(t => t.speaker === 'student')
            return (
                <div>
                    {/* GD Scores */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 10, marginBottom: 14 }}>
                        {[['Language', ai.avgLang, '#a78bfa'], ['Pronunciation', ai.avgPron, '#34d399'], ['Confidence', ai.avgConf, '#fb923c'], ['Participation', ai.participation, '#60a5fa']].map(([l, v, c]) => (
                            <div key={l} style={{ textAlign: 'center', background: c + '15', borderRadius: 8, padding: '10px 4px' }}>
                                <div style={{ color: c, fontWeight: 800, fontSize: 18 }}>{Math.round(v || 0)}%</div>
                                <div style={{ color: '#94a3b8', fontSize: 10 }}>{l}</div>
                            </div>
                        ))}
                    </div>
                    {/* Turn count */}
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                        You spoke <b style={{ color: '#10b981' }}>{stuTurns.length}</b> time{stuTurns.length !== 1 ? 's' : ''} out of <b style={{ color: '#a855f7' }}>{turns.length || submissions.length}</b> total turns
                    </div>
                    {/* Transcript */}
                    {turns.length > 0 ? turns.map((t, i) => (
                        <div key={i} style={{ marginTop: 8, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${t.speaker === 'student' ? '#10b981' : '#6366f1'}` }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: t.speaker === 'student' ? '#10b981' : '#818cf8', marginBottom: 3 }}>{t.speaker_label || t.speaker}</div>
                            <div style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.5 }}>{t.transcript}</div>
                            {t.speaker === 'student' && t.language_score != null && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 5, fontSize: 10 }}>
                                    {[['Lang', t.language_score, '#a78bfa'], ['Pron', t.pronunciation_score, '#34d399'], ['Conf', t.confidence_score, '#fb923c']].map(([lb, vl, cl]) => (
                                        <span key={lb} style={{ background: cl + '22', color: cl, padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>{lb} {vl}%</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )) : submissions.map((sub, i) => (
                        <div key={i} style={{ marginTop: 8, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ color: '#64748b', fontSize: 11 }}>Turn {i+1}</span>
                                <span style={{ color: '#a855f7', fontWeight: 700 }}>{Math.round(sub.score || 0)}/100</span>
                            </div>
                            {sub.transcribed_text && <div style={{ color: '#94a3b8', fontSize: 12 }}>{sub.transcribed_text}</div>}
                            {sub.feedback && <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>{sub.feedback}</p>}
                        </div>
                    ))}
                </div>
            )
        }
        if (module === 'topic-speak') {
            return submissions.map((sub, i) => {
                const ai = sub.ai_scores || {}
                const axes = [
                    { label: 'Relevance',  value: ai.relevanceScore  || 0 },
                    { label: 'Grammar',    value: ai.grammarScore    || 0 },
                    { label: 'Vocabulary', value: ai.vocabularyScore || 0 },
                    { label: 'Coherence',  value: ai.coherenceScore  || 0 }
                ]
                return (
                    <div key={i} style={{ marginTop: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ marginBottom: 8, color: '#94a3b8', fontSize: 12 }}>Topic: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{sub.expected_text}</span></div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
                            {axes.map(ax => (
                                <div key={ax.label} style={{ textAlign: 'center', background: 'rgba(124,58,237,0.15)', borderRadius: 8, padding: '8px 4px' }}>
                                    <div style={{ color: '#a855f7', fontWeight: 800, fontSize: 18 }}>{ax.value}<span style={{ color: '#64748b', fontSize: 10 }}>/25</span></div>
                                    <div style={{ color: '#94a3b8', fontSize: 10 }}>{ax.label}</div>
                                </div>
                            ))}
                        </div>
                        {sub.feedback && <p style={{ margin: 0, color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>"{sub.feedback}"</p>}
                        {(ai.strengths?.length > 0 || ai.improvements?.length > 0) && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                                {ai.strengths?.length > 0 && (
                                    <div>
                                        <div style={{ color: '#10b981', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>STRENGTHS</div>
                                        {ai.strengths.map((s, j) => <div key={j} style={{ color: '#94a3b8', fontSize: 11 }}>• {s}</div>)}
                                    </div>
                                )}
                                {ai.improvements?.length > 0 && (
                                    <div>
                                        <div style={{ color: '#f59e0b', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>IMPROVE</div>
                                        {ai.improvements.map((s, j) => <div key={j} style={{ color: '#94a3b8', fontSize: 11 }}>• {s}</div>)}
                                    </div>
                                )}
                            </div>
                        )}
                        {sub.transcribed_text && <div style={{ marginTop: 8, color: '#64748b', fontSize: 11 }}>Your speech: <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{sub.transcribed_text}</span></div>}
                    </div>
                )
            })
        }

        if (module === 'grammar-quiz' || module === 'vocabulary-test') {
            const reviews = submissions.flatMap(sub => {
                try { return sub.ai_scores?.review || [] } catch { return [] }
            })
            if (reviews.length === 0) {
                // Fallback: show raw quiz attempt scores
                return submissions.map((sub, i) => (
                    <div key={i} style={{ marginTop: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ color: '#64748b', fontSize: 11 }}>Quiz Attempt {i + 1}</span>
                            <span style={{ color: '#a855f7', fontWeight: 700 }}>{Math.round(sub.score || 0)}/100</span>
                        </div>
                        {sub.feedback && <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>{sub.feedback}</p>}
                    </div>
                ))
            }
            return (
                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                {['Sentence', 'Category', 'Your Answer', 'Correct'].map(h => (
                                    <th key={h} style={{ padding: '6px 8px', color: '#64748b', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {reviews.map((r, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '6px 8px', color: '#cbd5e1', fontSize: 12, maxWidth: 200 }}>{r.sentence}</td>
                                    <td style={{ padding: '6px 8px' }}><span style={{ background: module === 'vocabulary-test' ? 'rgba(52,211,153,0.15)' : 'rgba(168,85,247,0.15)', color: module === 'vocabulary-test' ? '#34d399' : '#c084fc', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>{r.category}</span></td>
                                    <td style={{ padding: '6px 8px', color: r.isCorrect ? '#10b981' : '#f87171', fontWeight: 600 }}>{r.userAnswer}</td>
                                    <td style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ color: '#10b981', fontWeight: 700 }}>{r.correctAnswer}</span>
                                        {r.isCorrect ? <CheckCircle size={13} color="#10b981" /> : <XCircle size={13} color="#f87171" />}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
        }

        // read-speak / listen-repeat
        return submissions.map((sub, i) => {
            const ai = sub.ai_scores || {}
            return (
                <div key={i} style={{ marginTop: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#64748b', fontSize: 11 }}>Attempt {i + 1}</span>
                        <span style={{ color: '#a855f7', fontWeight: 700 }}>{sub.score}/100</span>
                    </div>
                    <div style={{ marginBottom: 4, fontSize: 12 }}><span style={{ color: '#64748b' }}>Expected: </span><span style={{ color: '#e2e8f0' }}>{sub.expected_text}</span></div>
                    <div style={{ marginBottom: 6, fontSize: 12 }}><span style={{ color: '#64748b' }}>You said: </span><span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{sub.transcribed_text || '(no transcription)'}</span></div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        {ai.pronunciationScore != null && <span style={{ color: '#64748b', fontSize: 11 }}>Pronunciation <b style={{ color: '#a855f7' }}>{ai.pronunciationScore}</b></span>}
                        {ai.fluencyScore != null && <span style={{ color: '#64748b', fontSize: 11 }}>Fluency <b style={{ color: '#a855f7' }}>{ai.fluencyScore}</b></span>}
                        {ai.wps != null && <span style={{ color: '#64748b', fontSize: 11 }}>{ai.wps} w/s</span>}
                    </div>
                    {sub.feedback && <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>{sub.feedback}</p>}
                </div>
            )
        })
    }

    const modules = report.modules || []
    const totalAttempts = modules.reduce((s, m) => s + (Number(m.attempts) || 0), 0)
    const passing = score >= 60
    const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B+' : score >= 60 ? 'B' : 'C'
    const moduleTrunc = modules.map(m => (MODULE_META_REPORT[m.module]?.label || m.module)).join(', ')
    const truncLabel = moduleTrunc.length > 30 ? moduleTrunc.slice(0, 30) + '…' : moduleTrunc

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── HERO ── */}
            <div style={{ background: 'linear-gradient(135deg, #170032 0%, #5b21b6 50%, #7c3aed 100%)', borderRadius: 18, padding: '28px 24px 24px', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Communication Test</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: 4, fontWeight: 500 }}>Session Complete — Full Report</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)', borderRadius: 20, padding: '6px 16px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', border: '1px solid rgba(255,255,255,0.25)' }}>
                        {passing ? '✅ Passed' : '❌ Failed'}
                    </div>
                </div>

                {/* Score circle */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ width: 140, height: 140, position: 'relative' }}>
                        <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3"
                                strokeDasharray={`${score}, 100`} strokeLinecap="round"
                                style={{ transition: 'stroke-dasharray 1.5s ease' }} />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                            <div style={{ fontSize: '2.4rem', fontWeight: 900, lineHeight: 1 }}>{score}</div>
                            <div style={{ width: 28, height: 2, background: 'rgba(255,255,255,0.4)', margin: '4px 0' }} />
                            <div style={{ fontSize: '1rem', fontWeight: 700, opacity: 0.8 }}>100</div>
                        </div>
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.8, marginTop: 8 }}>Overall Score — Grade: {grade}</div>
                </div>

                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    {[
                        { icon: '📊', label: 'Modules',  value: modules.length,   sub: truncLabel },
                        { icon: '📝', label: 'Attempts', value: totalAttempts,    sub: 'total submissions' },
                        { icon: passing ? '🏆' : '💡', label: 'Status', value: passing ? 'PASS' : 'FAIL', sub: `Score: ${score}%` },
                    ].map(c => (
                        <div key={c.label} style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', borderRadius: 14, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.12)' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.85, marginBottom: 6 }}>{c.icon} {c.label}</div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 900, lineHeight: 1 }}>{c.value}</div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 500, opacity: 0.72, marginTop: 4 }}>{c.sub}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── TABS ── */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ background: '#1e293b', border: '1px solid #374151', borderRadius: 30, display: 'flex', padding: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
                    {[{ id: 'overview', label: 'Overview', icon: <BarChart2 size={14} /> }, { id: 'section', label: 'Section Analysis', icon: <Layers size={14} /> }, { id: 'time', label: 'Time Analysis', icon: <Clock size={14} /> }].map(t => (
                        <button key={t.id} onClick={() => { setActiveTab(t.id); setSelectedModule(null) }}
                            style={{
                                padding: '10px 20px', border: 'none', cursor: 'pointer', borderRadius: 30,
                                background: activeTab === t.id ? 'linear-gradient(135deg, #5b21b6, #a855f7)' : 'transparent',
                                color: activeTab === t.id ? 'white' : '#9ca3af',
                                fontSize: '0.82rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', gap: 7,
                                boxShadow: activeTab === t.id ? '0 4px 12px rgba(124,58,237,0.3)' : 'none',
                                transition: 'all 0.2s', textTransform: 'uppercase'
                            }}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'start' }}>
                    {/* Left: Overall performance */}
                    <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #374151', padding: 22 }}>
                        <h3 style={{ margin: '0 0 18px', fontSize: '0.95rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <BarChart2 size={16} color="#a855f7" /> Overall Performance
                        </h3>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
                            <div style={{ background: 'linear-gradient(135deg, #374151, #1f2937)', borderRadius: 14, padding: '20px 16px', flex: 1, border: '1px solid #4b5563' }}>
                                <div style={{ fontSize: '3rem', fontWeight: 900, color: '#a855f7', lineHeight: 1 }}>{score}%</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#a855f7', marginTop: 8 }}>Grade: {grade}</div>
                                <div style={{ fontSize: '0.8rem', color: '#d1d5db', fontWeight: 600, marginTop: 4 }}>{totalAttempts} total attempt{totalAttempts !== 1 ? 's' : ''}</div>
                            </div>
                            <div style={{ width: 110, height: 110, position: 'relative', flexShrink: 0 }}>
                                <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#374151" strokeWidth="3.5" />
                                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#7c3aed" strokeWidth="3.5"
                                        strokeDasharray={`${score}, 100`} strokeLinecap="round"
                                        style={{ transition: 'stroke-dasharray 1.2s ease' }} />
                                </svg>
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#7c3aed' }}>{score}</div>
                                    <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Score</div>
                                </div>
                            </div>
                        </div>
                        <h4 style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 800, color: '#a855f7' }}>Performance Breakdown</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[
                                { label: 'Strong (≥80%)',     color: '#10b981', count: modules.filter(m => m.avgScore >= 80).length },
                                { label: 'Good (60–79%)',     color: '#a855f7', count: modules.filter(m => m.avgScore >= 60 && m.avgScore < 80).length },
                                { label: 'Needs Work (<60%)', color: '#ef4444', count: modules.filter(m => m.avgScore < 60).length },
                            ].map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 10, background: '#374151' }}>
                                    <div style={{ background: item.color, borderRadius: '50%', width: 10, height: 10, flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontWeight: 700, fontSize: '0.82rem', color: '#e5e7eb' }}>{item.label}</span>
                                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: item.color }}>{item.count}/{modules.length}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Module scores (progress bars) */}
                    <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #374151', padding: 22 }}>
                        <h3 style={{ margin: '0 0 18px', fontSize: '0.95rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Layers size={16} color="#a855f7" /> Section Scores
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {modules.map(m => {
                                const meta = MODULE_META_REPORT[m.module] || { label: m.module, color: '#a855f7' }
                                const barColor = m.avgScore >= 80 ? '#10b981' : m.avgScore >= 60 ? '#a855f7' : '#ef4444'
                                return (
                                    <div key={m.module}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '1rem' }}>
                                                    {m.module === 'read-speak' ? '📖' : m.module === 'listen-repeat' ? '🔊' : m.module === 'topic-speak' ? '⚡' : '🧠'}
                                                </span>
                                                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e5e7eb' }}>{meta.label}</span>
                                            </div>
                                            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: barColor, minWidth: 38, textAlign: 'right' }}>{m.avgScore}%</span>
                                        </div>
                                        <div style={{ height: 10, background: '#374151', borderRadius: 5, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${m.avgScore}%`, background: `linear-gradient(90deg, ${barColor}99, ${barColor})`, borderRadius: 5, transition: 'width 1s ease-out' }} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
                                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{m.attempts} attempt{m.attempts !== 1 ? 's' : ''}</span>
                                            {m.allocatedMinutes && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0891b2', background: 'rgba(8,145,178,0.12)', borderRadius: 4, padding: '1px 6px' }}>⏱ {m.allocatedMinutes} min</span>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                </div>
            )}

            {/* ── TIME ANALYSIS TAB ── */}
            {activeTab === 'time' && (() => {
                const hasTimes = modules.some(m => m.allocatedMinutes)
                const totalAllocMins = modules.reduce((s, m) => s + (m.allocatedMinutes || 0), 0)
                const sessionData = report.session || report
                const sessionDurationMs = sessionData.completed_at && sessionData.started_at
                    ? new Date(sessionData.completed_at) - new Date(sessionData.started_at) : null
                const sessionDurationMins = sessionDurationMs ? Math.round(sessionDurationMs / 60000) : null
                const utilization = hasTimes && sessionDurationMins && totalAllocMins
                    ? Math.min(100, Math.round((sessionDurationMins / totalAllocMins) * 100)) : null
                const fmtMins = m => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Summary stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                            {[
                                { label: 'TIME SPENT', value: sessionDurationMins != null ? fmtMins(sessionDurationMins) : 'N/A', color: '#a855f7' },
                                { label: 'ALLOCATED',  value: hasTimes ? fmtMins(totalAllocMins) : 'Not Set', color: '#0891b2' },
                                { label: 'UTILIZATION', value: utilization != null ? `${utilization}%` : 'N/A', color: utilization >= 80 ? '#10b981' : utilization >= 50 ? '#f59e0b' : '#94a3b8' },
                            ].map((st, i) => (
                                <div key={i} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 14, padding: 20, textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: st.color }}>{st.value}</div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', marginTop: 6, letterSpacing: 1 }}>{st.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Per-section cards */}
                        <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #334155', padding: 22 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0891b2', textTransform: 'uppercase', letterSpacing: 1 }}>
                                    ⏱ Section Breakdown
                                </h3>
                                {sessionDurationMins != null && hasTimes && (
                                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic' }}>
                                        Est. time based on proportional allocation
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                                {modules.map(m => {
                                    const meta = MODULE_META_REPORT[m.module] || { label: m.module, color: '#a855f7' }
                                    const icon = m.module === 'read-speak' ? '📖' : m.module === 'listen-repeat' ? '🔊' : m.module === 'topic-speak' ? '⚡' : '🧠'
                                    const scoreColor = m.avgScore >= 80 ? '#10b981' : m.avgScore >= 60 ? '#f59e0b' : '#ef4444'
                                    const proportion = hasTimes && totalAllocMins > 0
                                        ? (m.allocatedMinutes || 0) / totalAllocMins
                                        : 1 / modules.length
                                    const estMins = sessionDurationMins != null ? Math.round(sessionDurationMins * proportion) : null
                                    const passed = m.avgScore >= 60
                                    return (
                                        <div key={m.module} style={{
                                            background: '#0f172a', borderRadius: 14,
                                            border: `1px solid ${meta.color}33`,
                                            borderLeft: `4px solid ${meta.color}`,
                                            padding: 18, display: 'flex', flexDirection: 'column', gap: 14
                                        }}>
                                            {/* Header */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{ fontSize: '1.3rem' }}>{icon}</span>
                                                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e5e7eb' }}>{meta.label}</span>
                                                </div>
                                                <span style={{
                                                    fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                                                    background: passed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                                    color: passed ? '#10b981' : '#ef4444',
                                                    border: `1px solid ${passed ? '#10b98133' : '#ef444433'}`
                                                }}>{passed ? '✓ PASS' : '✗ FAIL'}</span>
                                            </div>
                                            {/* Time stats */}
                                            <div style={{ display: 'flex', gap: 10 }}>
                                                <div style={{ flex: 1, background: '#1e293b', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0891b2' }}>
                                                        {m.allocatedMinutes ? `${m.allocatedMinutes}m` : '—'}
                                                    </div>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', marginTop: 3, letterSpacing: 0.8 }}>ALLOCATED</div>
                                                </div>
                                                <div style={{ flex: 1, background: '#1e293b', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#a855f7' }}>
                                                        {estMins != null ? `~${estMins}m` : '—'}
                                                    </div>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', marginTop: 3, letterSpacing: 0.8 }}>EST. SPENT</div>
                                                </div>
                                            </div>
                                            {/* Score bar */}
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Score</span>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: scoreColor }}>{m.avgScore}%</span>
                                                </div>
                                                <div style={{ height: 10, background: '#374151', borderRadius: 6, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${m.avgScore}%`, background: `linear-gradient(90deg, ${scoreColor}88, ${scoreColor})`, borderRadius: 6, transition: 'width 1s ease-out' }} />
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.6rem', color: '#64748b' }}>
                                                    <span>0%</span><span>100%</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {!hasTimes && (
                                <div style={{ marginTop: 14, padding: '8px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b33', borderRadius: 8, fontSize: '0.75rem', color: '#f59e0b' }}>
                                    ⚠ No per-section time limits configured for this test
                                </div>
                            )}
                        </div>
                    </div>
                )
            })()}

            {/* ── SECTION ANALYSIS TAB ── */}
            {activeTab === 'section' && (
                <div>
                    {/* Module selector buttons */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                        {modules.map(m => {
                            const meta = MODULE_META_REPORT[m.module] || { label: m.module, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' }
                            const isActive = selectedModule === m.module
                            return (
                                <button key={m.module} onClick={() => setSelectedModule(isActive ? null : m.module)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                                        background: isActive ? meta.bg : '#1e293b',
                                        border: `2px solid ${isActive ? meta.color : '#334155'}`,
                                        borderRadius: 12, cursor: 'pointer', flex: '1 1 140px',
                                        boxShadow: isActive ? `0 4px 12px ${meta.color}33` : 'none',
                                        transition: 'all 0.2s'
                                    }}>
                                    <span style={{ fontSize: '1.4rem' }}>
                                        {m.module === 'read-speak' ? '📖' : m.module === 'listen-repeat' ? '🔊' : m.module === 'topic-speak' ? '⚡' : '🧠'}
                                    </span>
                                    <div style={{ flex: 1, textAlign: 'left' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: isActive ? meta.color : '#e5e7eb' }}>{meta.label}</div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', marginTop: 3 }}>
                                            {m.attempts} attempt{m.attempts !== 1 ? 's' : ''} · {m.avgScore}%{m.allocatedMinutes ? ` · ${m.allocatedMinutes}m` : ''}
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {selectedModule && (() => {
                        const m = modules.find(x => x.module === selectedModule)
                        const meta = MODULE_META_REPORT[selectedModule] || { label: selectedModule, color: '#a855f7' }
                        if (!m) return null
                        return (
                            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 14, overflow: 'hidden' }}>
                                <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 800, fontSize: '1rem', color: meta.color }}>{meta.label} — Detailed Review</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {m.allocatedMinutes && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0891b2', background: 'rgba(8,145,178,0.12)', borderRadius: 6, padding: '3px 8px' }}>⏱ {m.allocatedMinutes} min</span>}
                                        <ScoreBadge score={m.avgScore} />
                                        <button onClick={() => setSelectedModule(null)} style={{ background: 'none', border: '1px solid #334155', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 11, color: '#64748b' }}>Clear</button>
                                    </div>
                                </div>
                                <div style={{ padding: '16px 18px' }}>
                                    {renderModuleDetail(m.module, m.submissions)}
                                </div>
                            </div>
                        )
                    })()}

                    {!selectedModule && (
                        <div style={{ textAlign: 'center', padding: 40, color: '#64748b', background: '#1e293b', border: '1px solid #334155', borderRadius: 14 }}>
                            ⬆️ Select a module above to see your detailed answer breakdown
                        </div>
                    )}
                </div>
            )}

            <button onClick={onRestart} style={{
                width: '100%', padding: 14, background: 'linear-gradient(135deg, #5b21b6, #7c3aed)',
                border: 'none', borderRadius: 12, color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '1rem'
            }}>
                ← Back to Tests
            </button>
        </div>
    )
}


// ─── Main Component ───────────────────────────────────────────────────────────

const MODULES = [
    { id: 'read-speak',            label: 'Read & Speak',          icon: <BookOpen size={18} />, color: '#a855f7', desc: 'Read sentences aloud & get pronunciation score' },
    { id: 'listen-repeat',         label: 'Listen & Repeat',        icon: <Volume2 size={18} />,  color: '#5b21b6', desc: 'Listen to audio, then repeat it back' },
    { id: 'topic-speak',           label: 'Topic Speaking',         icon: <Zap size={18} />,     color: '#7c3aed', desc: 'Speak freestyle — AI evaluates your response' },
    { id: 'grammar-quiz',          label: 'Grammar Quiz',           icon: <Brain size={18} />,   color: '#c084fc', desc: 'Fill-in-the-blank grammar challenges' },
    { id: 'vocabulary-test',       label: 'Vocabulary Test',        icon: <Layers size={18} />,  color: '#7c2d92', desc: 'Test your word knowledge and usage' },
    { id: 'situational-response',  label: 'Situational Response',   icon: <Star size={18} />,    color: '#0f766e', desc: 'Respond to workplace scenarios' },
    { id: 'email-writing',         label: 'Professional Writing',   icon: <Award size={18} />,   color: '#b45309', desc: 'Write professional emails and messages' },
    { id: 'interview-qa',          label: 'Interview Q&A',          icon: <Target size={18} />,  color: '#be123c', desc: 'Answer common interview questions' },
    { id: 'gd-round',              label: 'Group Discussion',        icon: <Mic size={18} />,     color: '#6366f1', desc: 'Debate a topic with AI participants' },
]

export default function CommunicationTest({ user }) {
    const [phase, setPhase] = useState('testSelect')  // testSelect | intro | module | report
    const [sessionId, setSessionId] = useState(null)
    const [moduleIndex, setModuleIndex] = useState(0)
    const [history, setHistory] = useState([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [assignedTests, setAssignedTests] = useState([])
    const [testsLoading, setTestsLoading] = useState(true)
    const [selectedTest, setSelectedTest] = useState(null)
    const [exitSectionModal, setExitSectionModal] = useState(false)
    const [fsWarning, setFsWarning] = useState(false)
    const [sectionTimeLeft, setSectionTimeLeft] = useState(null)  // seconds remaining for current section
    const [gdForceSubmitToken, setGdForceSubmitToken] = useState(0)
    const sectionTimerRef = useRef(null)

    useEffect(() => {
        loadAssignedTests()
        loadHistory()
    }, [])

    // Force fullscreen while test is active; re-enter if user presses Escape
    useEffect(() => {
        if (phase !== 'module') {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
            setFsWarning(false)
            return
        }
        document.documentElement.requestFullscreen().catch(() => {})
        const onFsChange = () => {
            if (!document.fullscreenElement) {
                setFsWarning(true)
                setTimeout(() => document.documentElement.requestFullscreen().catch(() => {}), 300)
            } else {
                setFsWarning(false)
            }
        }
        document.addEventListener('fullscreenchange', onFsChange)
        return () => document.removeEventListener('fullscreenchange', onFsChange)
    }, [phase])

    // Per-section countdown timer — auto-advances when time is up
    useEffect(() => {
        clearInterval(sectionTimerRef.current)
        if (phase !== 'module' || !selectedTest) { setSectionTimeLeft(null); return }
        const sectionTimes = selectedTest.section_times
            ? (typeof selectedTest.section_times === 'string' ? JSON.parse(selectedTest.section_times) : selectedTest.section_times)
            : null
        const currentKey = activeModules[moduleIndex]?.id
        const mins = sectionTimes && currentKey && sectionTimes[currentKey]
        if (!mins) { setSectionTimeLeft(null); return }
        let secs = mins * 60
        setSectionTimeLeft(secs)
        sectionTimerRef.current = setInterval(() => {
            secs--
            setSectionTimeLeft(secs)
            if (secs <= 0) {
                clearInterval(sectionTimerRef.current)
                if (currentKey === 'gd-round') {
                    setGdForceSubmitToken(t => t + 1)
                } else {
                    nextModule()
                }
            }
        }, 1000)
        return () => clearInterval(sectionTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, moduleIndex, selectedTest?.id])

    const loadAssignedTests = async () => {
        setTestsLoading(true)
        try {
            const { data } = await axios.get(`${API_BASE}/comm-test/my-tests`, { headers: getAuthHeaders() })
            setAssignedTests(data.tests || [])
        } catch (e) { console.error(e) }
        setTestsLoading(false)
    }

    const loadHistory = async () => {
        setHistoryLoading(true)
        try {
            const { data } = await axios.get(`${API_BASE}/comm-test/history`, { headers: getAuthHeaders() })
            setHistory(data.sessions || [])
        } catch (e) { console.error(e) }
        setHistoryLoading(false)
    }

    const startSession = async (testId) => {
        try {
            const { data } = await axios.post(`${API_BASE}/comm-test/session/start`, { testId }, { headers: getAuthHeaders() })
            setSessionId(data.sessionId)
            setModuleIndex(0)
            setPhase('module')
        } catch (e) { alert(e.response?.data?.error || 'Failed to start session'); console.error(e) }
    }

    const getActiveModules = () => {
        const mods = Array.isArray(selectedTest?.modules) ? selectedTest.modules : []
        if (mods.length === 0) return MODULES
        const filtered = MODULES.filter(m => mods.includes(m.id))
        return filtered.length > 0 ? filtered : MODULES
    }

    const nextModule = async () => {
        const mods = getActiveModules()
        if (moduleIndex < mods.length - 1) {
            setModuleIndex(i => i + 1)
        } else {
            // Last module done — complete session before showing the report
            try {
                await axios.post(`${API_BASE}/comm-test/session/complete`, { sessionId }, { headers: getAuthHeaders() })
            } catch (e) {
                console.error(e)
            }
            setPhase('report')
        }
    }

    const restart = () => {
        setPhase('testSelect')
        setSessionId(null)
        setModuleIndex(0)
        setSelectedTest(null)
        setGdForceSubmitToken(0)
        loadAssignedTests()
        loadHistory()
    }

    const activeModules = getActiveModules()
    const currentModule = activeModules[moduleIndex] || activeModules[0] || MODULES[0]

    return (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 0 40px' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #170032, #5b21b6)', borderRadius: 20, padding: '28px 32px', marginBottom: 24, color: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10 }}>
                        <Mic size={24} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Communication Test</h1>
                        <p style={{ margin: 0, opacity: 0.8, fontSize: '0.88rem' }}>AI-powered English speaking & grammar assessment</p>
                    </div>
                </div>
                {/* progress shown inside fullscreen overlay during test */}
            </div>

            {/* Test Select */}
            {phase === 'testSelect' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '1.1rem', marginBottom: 4 }}>Your Assigned Tests</div>
                    {testsLoading ? (
                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Loading tests...</div>
                    ) : assignedTests.length === 0 ? (
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 14, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                            <Mic size={36} style={{ opacity: 0.3, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
                            No tests assigned to you yet. Ask your admin to assign a Communication Test.
                        </div>
                    ) : (
                        assignedTests.map(test => {
                            const mods = Array.isArray(test.modules) ? test.modules : []
                            const activeMods = MODULES.filter(m => mods.length === 0 || mods.includes(m.id))
                            let totalQ = (test.questions_per_module || 5) * (activeMods.length || 4)
                            try {
                                const sq = typeof test.section_questions === 'string' ? JSON.parse(test.section_questions) : test.section_questions
                                const mods2 = Array.isArray(test.modules) ? test.modules : JSON.parse(test.modules || '[]')
                                if (sq && typeof sq === 'object') totalQ = mods2.reduce((a, k) => a + Number(sq[k] || 0), 0)
                            } catch {}
                            const attemptsUsed = test.sessions_count || 0
                            const attemptsLimit = test.attempt_limit
                            const limitReached = attemptsLimit != null && attemptsUsed >= attemptsLimit
                            return (
                                <div key={test.id} style={{ background: '#1e293b', border: `1px solid ${limitReached ? '#7f1d1d' : '#334155'}`, borderRadius: 14, padding: 20, opacity: limitReached ? 0.75 : 1 }}>
                                    {/* Title + status */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                                        <div>
                                            <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '1rem' }}>{test.title}</div>
                                            {test.description && <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>{test.description}</div>}
                                        </div>
                                        {test.completed_at
                                            ? <span style={{ fontSize: '0.72rem', background: '#064e3b', color: '#34d399', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>Attempted {test.overall_score != null ? Math.round(test.overall_score) + '%' : '✓'}</span>
                                            : <span style={{ fontSize: '0.72rem', background: '#1e3a8a', color: '#60a5fa', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>● Live</span>
                                        }
                                    </div>
                                    {/* Module tags */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                        {activeMods.map(m => (
                                            <span key={m.id} style={{ fontSize: '0.72rem', background: '#0f172a', border: `1px solid ${m.color}44`, color: m.color, borderRadius: 6, padding: '2px 8px' }}>
                                                {m.label}
                                            </span>
                                        ))}
                                    </div>
                                    {/* Stats row */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, fontSize: '0.78rem', color: '#94a3b8' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {test.duration_minutes || 60} min</span>
                                        <span>📋 {totalQ} questions</span>
                                        <span>✅ Pass {test.passing_score || 60}%</span>
                                        {attemptsLimit != null
                                            ? <span style={{ color: attemptsUsed >= attemptsLimit ? '#ef4444' : '#94a3b8' }}>🔁 {attemptsUsed}/{attemptsLimit} Attempts</span>
                                            : <span>∞ Unlimited</span>
                                        }
                                    </div>
                                    {/* Action */}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {test.session_id && (
                                            <button
                                                onClick={() => { setSessionId(test.session_id); setPhase('report') }}
                                                style={{ flex: 1, padding: '10px 0', background: '#1e293b', border: '1px solid #7c3aed', borderRadius: 10, color: '#a78bfa', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}
                                            >
                                                📊 View Report
                                            </button>
                                        )}
                                        {limitReached
                                            ? <div style={{ flex: 1, padding: '10px 0', background: '#1f2937', border: '1px solid #374151', borderRadius: 10, color: '#6b7280', fontWeight: 700, textAlign: 'center', fontSize: '0.9rem' }}>Attempt Limit Reached</div>
                                            : <button onClick={() => { setSelectedTest(test); setPhase('intro') }} style={{ flex: 1, padding: '10px 0', background: 'linear-gradient(135deg, #5b21b6, #7c3aed)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                                                {test.completed_at ? 'Retry →' : 'Start →'}
                                            </button>
                                        }
                                    </div>
                                </div>
                            )
                        })
                    )}

                    {/* Past sessions */}
                    {history.length > 0 && (
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 20, marginTop: 8 }}>
                            <div style={{ fontWeight: 800, color: '#a855f7', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Clock size={16} /> Past Sessions
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {history.slice(0, 10).map(s => (
                                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0f172a', borderRadius: 10, padding: '10px 14px' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.82rem', color: '#d1d5db', fontWeight: 600 }}>{new Date(s.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{s.submission_count} submissions · {s.test_title || 'Communication Test'}</div>
                                        </div>
                                        {s.overall_score != null && <div style={{ fontWeight: 900, fontSize: '1.1rem', color: s.overall_score >= 80 ? '#10b981' : s.overall_score >= 60 ? '#a855f7' : '#ef4444' }}>{Math.round(s.overall_score)}%</div>}
                                        {s.completed_at ? <CheckCircle size={16} color="#10b981" /> : <Clock size={16} color="#f59e0b" />}
                                        <button
                                            onClick={() => { setSessionId(s.id); setPhase('report') }}
                                            style={{ flexShrink: 0, padding: '5px 12px', background: 'linear-gradient(135deg, #5b21b6, #7c3aed)', border: 'none', borderRadius: 7, color: 'white', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}
                                        >View Report</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Intro — show modules in selected test */}
            {phase === 'intro' && selectedTest && (() => {
                const introMods = getActiveModules()
                let sectionQs = {}
                let sectionTs = {}
                try { sectionQs = typeof selectedTest.section_questions === 'string' ? JSON.parse(selectedTest.section_questions) : (selectedTest.section_questions || {}) } catch {}
                try { sectionTs = typeof selectedTest.section_times === 'string' ? JSON.parse(selectedTest.section_times) : (selectedTest.section_times || {}) } catch {}
                const introTotalQ = introMods.reduce((sum, m) => sum + (Number(sectionQs[m.id]) || selectedTest.questions_per_module || 5), 0)
                const attemptsUsed = selectedTest.sessions_count || 0
                const attemptsLimit = selectedTest.attempt_limit
                return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <button onClick={() => setPhase('testSelect')} style={{ alignSelf: 'flex-start', background: 'none', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem' }}>← Back to Tests</button>
                    {/* Test header */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 14, padding: 20 }}>
                        <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '1.1rem', marginBottom: 4 }}>{selectedTest.title}</div>
                        {selectedTest.description && <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 12 }}>{selectedTest.description}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: '0.82rem', marginTop: 10 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8' }}><Clock size={13} /> {selectedTest.duration_minutes || 60} min total</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8' }}>📋 {introTotalQ} questions</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#10b981' }}>✅ Pass {selectedTest.passing_score || 60}%</span>
                            {attemptsLimit != null
                                ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: attemptsUsed >= attemptsLimit ? '#ef4444' : '#f59e0b' }}>🔁 {attemptsUsed}/{attemptsLimit} Attempts used</span>
                                : <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8' }}>∞ Unlimited attempts</span>
                            }
                        </div>
                    </div>
                    {/* Section breakdown — like CRT */}
                    <div style={{ fontWeight: 700, color: '#a855f7', fontSize: '0.88rem' }}>Sections ({introMods.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: -8 }}>
                        {introMods.map((m, idx) => {
                            const qCount = Number(sectionQs[m.id]) || selectedTest.questions_per_module || 5
                            const tMins = sectionTs[m.id]
                            return (
                                <div key={m.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: 8, background: `${m.color}22`, border: `1px solid ${m.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: m.color, fontWeight: 800, fontSize: '0.85rem' }}>{idx + 1}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem' }}>{m.label}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{m.desc}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                                        <span style={{ fontSize: '0.75rem', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 6, padding: '3px 10px' }}>{qCount} Q</span>
                                        {tMins && <span style={{ fontSize: '0.75rem', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 6, padding: '3px 10px' }}>{tMins}m</span>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <button onClick={() => startSession(selectedTest.id)} style={{
                        width: '100%', padding: 16, background: 'linear-gradient(135deg, #5b21b6, #7c3aed)',
                        border: 'none', borderRadius: 14, color: 'white', fontWeight: 900, cursor: 'pointer', fontSize: '1.05rem', letterSpacing: 0.5
                    }}>
                        Start Assessment <ChevronRight size={18} style={{ marginLeft: 4 }} />
                    </button>

                    {/* History */}
                    {history.length > 0 && (
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 20 }}>
                            <div style={{ fontWeight: 800, color: '#a855f7', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Clock size={16} /> Past Sessions
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {history.filter(s => s.test_id === selectedTest?.id).slice(0, 5).map(s => (
                                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0f172a', borderRadius: 10, padding: '10px 14px' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.82rem', color: '#d1d5db', fontWeight: 600 }}>
                                                {new Date(s.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{s.submission_count} submissions</div>
                                        </div>
                                        {s.overall_score != null && (
                                            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: s.overall_score >= 80 ? '#10b981' : s.overall_score >= 60 ? '#a855f7' : '#ef4444' }}>
                                                {Math.round(s.overall_score)}%
                                            </div>
                                        )}
                                        {s.completed_at ? <CheckCircle size={16} color="#10b981" /> : <Clock size={16} color="#f59e0b" />}
                                        <button
                                            onClick={() => { setSessionId(s.id); setPhase('report') }}
                                            style={{ flexShrink: 0, padding: '5px 12px', background: 'linear-gradient(135deg, #5b21b6, #7c3aed)', border: 'none', borderRadius: 7, color: 'white', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}
                                        >View Report</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                )
            })()}

            {/* Active Module — fullscreen overlay */}
            {phase === 'module' && (
                <div style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 9999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Fullscreen lost warning */}
                    {fsWarning && (
                        <div style={{ background: '#7f1d1d', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
                            <span style={{ color: '#fca5a5', fontSize: '0.82rem', fontWeight: 600 }}>⚠️ Fullscreen is required — returning you to fullscreen mode automatically</span>
                            <button onClick={() => { document.documentElement.requestFullscreen().catch(() => {}); setFsWarning(false) }}
                                style={{ background: '#dc2626', border: 'none', borderRadius: 6, color: 'white', padding: '4px 14px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                                Fullscreen Now
                            </button>
                        </div>
                    )}

                    {/* Top header bar */}
                    <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                        <div style={{ background: `${currentModule.color}22`, borderRadius: 8, padding: '5px 8px', display: 'flex' }}>
                            <span style={{ color: currentModule.color }}>{currentModule.icon}</span>
                        </div>
                        <span style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '0.9rem' }}>
                            Section {moduleIndex + 1} / {activeModules.length} &mdash; {currentModule.label}
                        </span>
                        {/* Section progress bar */}
                        <div style={{ flex: 1, display: 'flex', gap: 5, marginLeft: 8 }}>
                            {activeModules.map((m, i) => (
                                <div key={m.id} title={m.label} style={{ flex: 1, height: 5, borderRadius: 3, background: i < moduleIndex ? m.color : i === moduleIndex ? `${m.color}88` : '#334155', transition: 'background 0.3s' }} />
                            ))}
                        </div>
                        {/* Section countdown timer */}
                        {sectionTimeLeft !== null && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8,
                                background: sectionTimeLeft <= 60 ? '#7f1d1d' : sectionTimeLeft <= 180 ? '#78350f' : '#1e293b',
                                border: `1px solid ${sectionTimeLeft <= 60 ? '#dc2626' : sectionTimeLeft <= 180 ? '#d97706' : '#334155'}`,
                                flexShrink: 0 }}>
                                <Clock size={12} color={sectionTimeLeft <= 60 ? '#f87171' : sectionTimeLeft <= 180 ? '#fbbf24' : '#94a3b8'}/>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                    color: sectionTimeLeft <= 60 ? '#f87171' : sectionTimeLeft <= 180 ? '#fbbf24' : '#f1f5f9' }}>
                                    {Math.floor(sectionTimeLeft / 60)}:{String(sectionTimeLeft % 60).padStart(2, '0')}
                                </span>
                            </div>
                        )}
                        {/* Exit Section */}
                        <button onClick={() => setExitSectionModal(true)}
                            style={{ marginLeft: 8, background: 'none', border: '1px solid #475569', borderRadius: 8, color: '#94a3b8', padding: '5px 13px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            <ArrowRight size={12} /> Exit Section
                        </button>
                    </div>

                    {/* Scrollable content area */}
                    {currentModule.id === 'gd-round' ? (
                        /* GD gets its own full-height container — no scroll, no padding */
                        <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
                            <ModuleGDRound sessionId={sessionId} testId={selectedTest?.id} test={selectedTest} onComplete={nextModule} forceSubmitToken={gdForceSubmitToken} />
                        </div>
                    ) : (
                        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px' }}>
                            <div style={{ maxWidth: 820, margin: '0 auto' }}>
                                {currentModule.id === 'read-speak'                                           && <ModuleReadSpeak    sessionId={sessionId} testId={selectedTest?.id} onComplete={nextModule} />}
                                {currentModule.id === 'listen-repeat'                                        && <ModuleListenRepeat sessionId={sessionId} testId={selectedTest?.id} onComplete={nextModule} />}
                                {['topic-speak','situational-response','interview-qa'].includes(currentModule.id) && <ModuleTopicSpeak   sessionId={sessionId} testId={selectedTest?.id} onComplete={nextModule} />}
                                {['grammar-quiz','vocabulary-test','email-writing'].includes(currentModule.id)   && <ModuleGrammarQuiz  moduleType={currentModule.id} sessionId={sessionId} testId={selectedTest?.id} onComplete={nextModule} />}
                            </div>
                        </div>
                    )}

                    {/* Exit Section confirmation modal */}
                    {exitSectionModal && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                            <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 16, padding: 30, maxWidth: 420, width: '90%' }}>
                                <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '1.05rem', marginBottom: 8 }}>
                                    Exit &ldquo;{currentModule.label}&rdquo;?
                                </div>
                                <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginBottom: 22, lineHeight: 1.55, margin: '0 0 22px' }}>
                                    Your answers in this section will be saved.{' '}
                                    {moduleIndex < activeModules.length - 1
                                        ? `You'll move on to the next section: "${activeModules[moduleIndex + 1]?.label}".`
                                        : 'This is the last section — exiting will complete your test and show your results.'}
                                </p>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button onClick={() => setExitSectionModal(false)}
                                        style={{ flex: 1, padding: '11px 0', background: 'none', border: '1px solid #475569', borderRadius: 10, color: '#94a3b8', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                                        Stay Here
                                    </button>
                                    <button onClick={() => { setExitSectionModal(false); nextModule() }}
                                        style={{ flex: 1, padding: '11px 0', background: 'linear-gradient(135deg,#5b21b6,#7c3aed)', border: 'none', borderRadius: 10, color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                                        {moduleIndex < activeModules.length - 1 ? '→ Next Section' : '✓ Finish Test'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Report */}
            {phase === 'report' && <SessionReport sessionId={sessionId} onRestart={restart} />}
        </div>
    )
}
