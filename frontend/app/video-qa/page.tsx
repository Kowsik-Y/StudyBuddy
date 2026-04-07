'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
    Video, ArrowLeft, Youtube, Upload, Send,
    FileVideo, RotateCcw, Mic, MicOff, X, FileText, ExternalLink,
    Loader2, VolumeX,
} from 'lucide-react';
import ChatHistory from '../../components/ChatHistory';
import ControlCard from '../../components/Control-card';
import { Message, LatencyInfo } from '../../components/types';
import { useVoiceWS } from '../../hooks/useVoiceWS';

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'youtube' | 'upload';
type Phase = 'idle' | 'loading' | 'ready';

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getYouTubeId(url: string): string | null {
    try {
        const u = new URL(url.startsWith('http') ? url : 'https://' + url);
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
        return u.searchParams.get('v');
    } catch {
        return null;
    }
}

function isValidYoutubeUrl(url: string) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/.test(url);
}

// ── Web Speech API types ───────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySR = any;

// ── Component ─────────────────────────────────────────────────────────────────

export default function VideoQAPage() {
    const [tab, setTab] = useState<Tab>('youtube');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const [error, setError] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [title, setTitle] = useState('');
    const [transcript, setTranscript] = useState('');
    const [showTranscriptModal, setShowTranscriptModal] = useState(false);
    const [question, setQuestion] = useState('');
    // Local message list — kept separate from the WS hook so startLive() never wipes it
    const [messages, setMessages] = useState<Message[]>([]);
    const addMessage = (m: Message) => setMessages(prev => [...prev, m]);
    const clearMessages = () => setMessages([]);
    const [asking, setAsking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);

    // Voice input (browser Speech Recognition for textarea)
    const [isRecording, setIsRecording] = useState(false);
    const [voiceInterim, setVoiceInterim] = useState('');
    const [voiceError, setVoiceError] = useState('');
    const recognitionRef = useRef<AnySR>(null);
    // Audio playback refs — allow mid-speech interruption
    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioSrcRef = useRef<AudioBufferSourceNode | null>(null);

    // WebSocket voice session (ControlCard only — its own internal messages are not displayed here)
    const [latency, setLatency] = useState<LatencyInfo | null>(null);
    const [wsSessionId, setWsSessionId] = useState('');
    // Include video session_id so the WS LLM is grounded in the transcript
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'}/ws/study?mode=explain&language=en${sessionId ? `&video_session_id=${sessionId}` : ''}`;
    const { status, isLive, startLive, stopLive, isThinking,
    } = useVoiceWS({
        wsUrl,
        onLatency: setLatency,
        onSessionId: setWsSessionId,
        onMessage: addMessage,
    });
    const isActive = status === 'listening' || status === 'speech_detected';

    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Close modal on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowTranscriptModal(false); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // ── Audio playback (interruptible) ────────────────────────────────────────

    const stopSpeaking = useCallback(() => {
        try { audioSrcRef.current?.stop(); } catch { /* already stopped */ }
        try { audioCtxRef.current?.close(); } catch { /* already closed */ }
        audioSrcRef.current = null;
        audioCtxRef.current = null;
        setIsSpeaking(false);
    }, []);

    const playAudio = useCallback(async (b64: string) => {
        // Decode MP3 bytes
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)() as AudioContext;
        audioCtxRef.current = ctx;
        const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const src = ctx.createBufferSource();
        audioSrcRef.current = src;
        src.buffer = buf;
        src.connect(ctx.destination);
        await new Promise<void>(resolve => {
            src.onended = () => { ctx.close(); resolve(); };
            src.start();
        });
    }, []);

    // ── Transcription ──────────────────────────────────────────────────────────

    const handleTranscribe = useCallback(async () => {
        setError('');
        setPhase('loading');
        clearMessages();
        setTranscript('');
        setYoutubeVideoId(null);

        try {
            let data: { session_id: string; title: string; transcript: string };

            if (tab === 'youtube') {
                if (!isValidYoutubeUrl(youtubeUrl)) {
                    setError('Please enter a valid YouTube URL.');
                    setPhase('idle');
                    return;
                }
                const res = await fetch(`${BACKEND}/video/transcript`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: youtubeUrl }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
                    throw new Error(err.detail ?? 'Failed to transcribe YouTube video');
                }
                data = await res.json();
                setYoutubeVideoId(getYouTubeId(youtubeUrl));
            } else {
                if (!videoFile) {
                    setError('Please select a video or audio file.');
                    setPhase('idle');
                    return;
                }
                const form = new FormData();
                form.append('file', videoFile);
                const res = await fetch(`${BACKEND}/video/upload`, {
                    method: 'POST',
                    body: form,
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
                    throw new Error(err.detail ?? 'Failed to transcribe uploaded file');
                }
                data = await res.json();
            }

            setSessionId(data.session_id);
            setTitle(data.title);
            setTranscript(data.transcript);
            setPhase('ready');
            clearMessages();
            addMessage({
                role: 'assistant',
                text: `I've transcribed "${data.title}". Ask me anything about the video!`,
                time: nowStr(),
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
            setPhase('idle');
        }
    }, [tab, youtubeUrl, videoFile]);

    // ── Ask question ───────────────────────────────────────────────────────────

    const handleAsk = useCallback(async (overrideQ?: string) => {
        const q = (overrideQ ?? question).trim();
        if (!q || !sessionId || asking) return;

        setQuestion('');
        setVoiceInterim('');
        setAsking(true);
        stopSpeaking(); // stop AI audio before sending new question
        addMessage({ role: 'user', text: q, time: nowStr() });

        try {
            const res = await fetch(`${BACKEND}/video/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, question: q }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Error' }));
                throw new Error(err.detail ?? 'Failed to get answer');
            }
            const data: { answer: string; audio?: string } = await res.json();
            addMessage({ role: 'assistant', text: data.answer, time: nowStr() });
            setAsking(false);

            // Play TTS audio if the backend returned it
            if (data.audio) {
                setIsSpeaking(true);
                try {
                    await playAudio(data.audio);
                } finally {
                    setIsSpeaking(false);
                    audioSrcRef.current = null;
                    audioCtxRef.current = null;
                }
            }
        } catch (e: unknown) {
            addMessage({ role: 'assistant', text: `Error: ${e instanceof Error ? e.message : String(e)}`, time: nowStr() });
        } finally {
            setAsking(false);
            setIsSpeaking(false);
        }
    }, [question, sessionId, asking, isSpeaking, playAudio]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAsk();
        }
    };

    // ── Voice input ────────────────────────────────────────────────────────────

    const startRecording = useCallback(() => {
        // Interrupt AI speech so the user can ask immediately
        stopSpeaking();
        setVoiceError('');
        const SR =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
        if (!SR) {
            setVoiceError('Speech recognition not supported in this browser. Try Chrome.');
            return;
        }
        const rec = new SR();
        rec.lang = 'en-US';
        rec.continuous = false;
        rec.interimResults = true;
        rec.onstart = () => setIsRecording(true);
        rec.onresult = (e: AnySR) => {
            let interim = ''; let final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) final += t; else interim += t;
            }
            if (final) { setQuestion(prev => (prev + ' ' + final).trim()); setVoiceInterim(''); }
            else setVoiceInterim(interim);
        };
        rec.onerror = (e: AnySR) => {
            setVoiceError(`Mic error: ${e.error}`);
            setIsRecording(false); setVoiceInterim('');
        };
        rec.onend = () => { setIsRecording(false); setVoiceInterim(''); };
        recognitionRef.current = rec;
        rec.start();
    }, [stopSpeaking]);

    const stopRecording = useCallback(() => {
        recognitionRef.current?.stop();
        setIsRecording(false); setVoiceInterim('');
    }, []);

    const toggleRecording = () => isRecording ? stopRecording() : startRecording();

    // ── Reset ──────────────────────────────────────────────────────────────────

    const handleReset = () => {
        stopSpeaking();
        stopRecording();
        if (isLive) stopLive();
        setPhase('idle');
        setSessionId('');
        setTitle('');
        setTranscript('');
        clearMessages();
        setYoutubeUrl('');
        setVideoFile(null);
        setError('');
        setShowTranscriptModal(false);
        setYoutubeVideoId(null);
        setQuestion('');
        setVoiceInterim('');
        setVoiceError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-2xl mx-auto flex flex-col gap-6">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link href="/" className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                        <ArrowLeft size={18} className="text-gray-500" />
                    </Link>
                    <div className="w-10 h-10 rounded-2xl bg-rose-600 flex items-center justify-center shadow">
                        <Video size={18} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-lg font-semibold text-gray-800">Video Q&amp;A</h1>
                        <p className="text-xs text-gray-400">
                            Drop a YouTube link or upload a video — AI transcribes it and answers your questions
                        </p>
                    </div>
                    {phase === 'ready' && (
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-gray-500 border border-gray-200 hover:bg-gray-100 transition-colors"
                        >
                            <RotateCcw size={13} />
                            Reset
                        </button>
                    )}
                </div>

                {/* Input section — hidden once ready */}
                {phase !== 'ready' && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
                        {/* Tabs */}
                        <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                            <button
                                onClick={() => setTab('youtube')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'youtube'
                                    ? 'bg-white shadow text-rose-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Youtube size={15} />
                                YouTube URL
                            </button>
                            <button
                                onClick={() => setTab('upload')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'upload'
                                    ? 'bg-white shadow text-rose-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Upload size={15} />
                                Upload Video
                            </button>
                        </div>

                        {/* YouTube input */}
                        {tab === 'youtube' && (
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-gray-600">YouTube Video URL</label>
                                <input
                                    type="url"
                                    value={youtubeUrl}
                                    onChange={e => setYoutubeUrl(e.target.value)}
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all"
                                    onKeyDown={e => e.key === 'Enter' && handleTranscribe()}
                                    disabled={phase === 'loading'}
                                />
                                <p className="text-[11px] text-gray-400">
                                    Supports standard YouTube links (youtube.com/watch or youtu.be)
                                </p>
                            </div>
                        )}

                        {/* File upload */}
                        {tab === 'upload' && (
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-gray-600">Video or Audio File</label>
                                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-6 cursor-pointer hover:border-rose-300 hover:bg-rose-50 transition-all">
                                    <FileVideo size={28} className="text-gray-300" />
                                    <span className="text-sm text-gray-500">
                                        {videoFile ? videoFile.name : 'Click to choose a file'}
                                    </span>
                                    <span className="text-[11px] text-gray-400">MP4, MKV, MOV, MP3, WAV, WEBM…</span>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="video/*,audio/*"
                                        className="hidden"
                                        onChange={e => setVideoFile(e.target.files?.[0] ?? null)}
                                        disabled={phase === 'loading'}
                                    />
                                </label>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                                {error}
                            </div>
                        )}

                        {/* Transcribe button */}
                        <button
                            onClick={handleTranscribe}
                            disabled={phase === 'loading'}
                            className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-sm"
                        >
                            {phase === 'loading' ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Transcribing… this may take a moment
                                </>
                            ) : (
                                <>
                                    <Video size={18} />
                                    Transcribe &amp; Start Q&amp;A
                                </>
                            )}
                        </button>

                        {phase === 'loading' && (
                            <p className="text-center text-xs text-gray-400">
                                Downloading and transcribing the video. Please wait…
                            </p>
                        )}
                    </div>
                )}

                {/* ── Ready: YouTube iframe + info bar ── */}
                {phase === 'ready' && (
                    <div className="flex flex-col gap-3">
                        {youtubeVideoId && (
                            <div className="bg-black rounded-2xl overflow-hidden shadow-sm aspect-video w-full">
                                <iframe
                                    src={`https://www.youtube.com/embed/${youtubeVideoId}`}
                                    title={title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="w-full h-full"
                                />
                            </div>
                        )}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3">
                            <Video size={15} className="text-rose-500 shrink-0" />
                            <span className="flex-1 text-sm font-medium text-gray-700 truncate">{title}</span>
                            <span className="text-[10px] text-gray-400 shrink-0">{transcript.split(' ').length.toLocaleString()} words</span>
                            <button
                                onClick={() => setShowTranscriptModal(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors shrink-0"
                            >
                                <FileText size={13} />
                                View Transcript
                            </button>
                        </div>
                    </div>
                )}



                {/* ── Chat ── */}
                {phase === 'ready' && (
                    <ChatHistory
                        messages={messages}
                        title="Ask questions about the video"
                        subtitle="Speak or type below — AI answers from the transcript"
                        headerRight={
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                <Mic size={11} />voice or type
                            </span>
                        }
                        thinking={asking || isThinking}
                        interimText={isRecording ? voiceInterim : status === 'speech_detected' ? 'Listening…' : undefined}
                        warningBar={voiceError ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                                {voiceError}
                            </div>
                        ) : undefined}
                        inputSlot={
                            <div className="flex gap-2 items-end">
                                <button
                                    onClick={toggleRecording}
                                    disabled={asking}
                                    title={isRecording ? 'Stop recording' : 'Speak your question'}
                                    className={`p-3 rounded-xl transition-all shrink-0 shadow-sm border ${isRecording
                                        ? 'bg-rose-600 border-rose-600 text-white animate-pulse'
                                        : 'bg-white border-gray-200 text-gray-500 hover:border-rose-300 hover:text-rose-500'
                                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                                >
                                    {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                                </button>
                                <textarea
                                    ref={textareaRef}
                                    value={question}
                                    onChange={e => setQuestion(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={isRecording ? '🎤 Listening…' : 'Type or speak your question… (Enter to send)'}
                                    rows={2}
                                    className="flex-1 resize-none text-sm px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all"
                                    disabled={asking}
                                />
                                <button
                                    onClick={() => handleAsk()}
                                    disabled={!question.trim() || asking}
                                    className="p-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shadow-sm shrink-0"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                        }
                        statusBar={isSpeaking ? (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping inline-block" />
                                <span className="text-xs text-indigo-600 font-medium">AI is speaking…</span>
                                <button
                                    onClick={stopSpeaking}
                                    title="Stop speaking"
                                    className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                >
                                    <VolumeX size={12} /> Stop
                                </button>
                                <button
                                    onClick={() => { stopSpeaking(); startRecording(); }}
                                    title="Interrupt and speak"
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-colors"
                                >
                                    <Mic size={12} /> Interrupt
                                </button>
                            </div>
                        ) : isRecording ? (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                                <span className="text-xs text-rose-500 font-medium">Recording… speak your question</span>
                                <button onClick={stopRecording} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                        ) : undefined}
                    />
                )}

                {/* Suggested questions — shown when ready and no user messages yet */}
                {phase === 'ready' && messages.length <= 1 && (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest px-1">
                            Suggested questions
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                'What is the main topic of this video?',
                                'Summarize the key points.',
                                'What concepts are explained?',
                                'Are there any examples given?',
                            ].map(q => (
                                <button
                                    key={q}
                                    onClick={() => setQuestion(q)}
                                    className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full text-gray-600 hover:border-rose-300 hover:text-rose-600 transition-colors shadow-sm"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {/* ── Voice ControlCard ── */}
                {phase === 'ready' && (
                    <ControlCard
                        status={status}
                        isActive={isActive}
                        latency={latency}
                        sessionId={wsSessionId}
                        isLive={isLive}
                        stopLive={stopLive}
                        startLive={startLive}
                    />
                )}
            </div>

            {/* ── Transcript Modal ── */}
            {showTranscriptModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={e => { if (e.target === e.currentTarget) setShowTranscriptModal(false); }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
                            <FileText size={18} className="text-rose-500" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{title}</p>
                                <p className="text-[11px] text-gray-400">{transcript.split(' ').length.toLocaleString()} words · Full transcript</p>
                            </div>
                            {youtubeVideoId && (
                                <a href={youtubeUrl} target="_blank" rel="noopener noreferrer"
                                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" title="Open on YouTube">
                                    <ExternalLink size={15} />
                                </a>
                            )}
                            <button onClick={() => setShowTranscriptModal(false)}
                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-5">
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{transcript}</p>
                        </div>
                        <div className="px-6 py-3 border-t border-gray-100 flex justify-end shrink-0">
                            <button onClick={() => setShowTranscriptModal(false)}
                                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 font-medium transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
