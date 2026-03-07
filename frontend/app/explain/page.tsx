'use client';
import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { BookOpen, ArrowLeft, Send, Loader2, VolumeX, Mic, Sparkles, X } from 'lucide-react';
import { useVoiceWS } from '../../hooks/useVoiceWS';
import { Language, ScoreBreakdown, LatencyInfo } from '../../components/types';
import ChatHistory from '../../components/ChatHistory';
import LanguageSelector from '../../components/LanguageSelector';
import ControlCard from '@/components/Control-card';

const BACKEND_HTTP = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const BACKEND_WS = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';

function nowStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ExplainPage() {
    const [language, setLanguage] = useState<Language>('en');
    const [scores, setScores] = useState<ScoreBreakdown[]>([]);
    const [latency, setLatency] = useState<LatencyInfo | null>(null);
    const [sessionId, setSessionId] = useState('');

    // Text input state
    const [textTopic, setTextTopic] = useState('');
    const [isTextAsking, setIsTextAsking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Topic input at top
    const [topicInput, setTopicInput] = useState('');
    const [activeTopic, setActiveTopic] = useState('');

    // Audio refs for interruptible playback
    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioSrcRef = useRef<AudioBufferSourceNode | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const wsUrl = `${BACKEND_WS}/ws/study?mode=explain&language=${language}`;

    const handleScore = useCallback((s: ScoreBreakdown) => setScores(prev => [...prev, s]), []);
    const handleLatency = useCallback((l: LatencyInfo) => setLatency(l), []);
    const handleSessId = useCallback((id: string) => setSessionId(id), []);

    const { status, messages, isLive, startLive, stopLive, isThinking, addMessage,
        isSpeaking: wsIsSpeaking, stopSpeaking: wsStopSpeaking } = useVoiceWS({
            wsUrl, onScore: handleScore, onLatency: handleLatency, onSessionId: handleSessId,
        });

    const isActive = status === 'listening' || status === 'speech_detected';

    // ── Stop TTS playback ───────────────────────────────────────────────────
    const stopSpeaking = useCallback(() => {
        try { audioSrcRef.current?.stop(); } catch { /* already stopped */ }
        try { audioCtxRef.current?.close(); } catch { /* already closed */ }
        audioSrcRef.current = null;
        audioCtxRef.current = null;
        setIsSpeaking(false);
    }, []);

    // ── Text topic → HTTP → LLM + TTS ──────────────────────────────────────
    const handleTopicSet = useCallback(async () => {
        const t = topicInput.trim();
        if (!t || isTextAsking) return;
        setActiveTopic(t);
        stopSpeaking();
        setIsTextAsking(true);
        setTopicInput('');
        addMessage({ role: 'user', text: t, time: nowStr() });
        try {
            const res = await fetch(`${BACKEND_HTTP}/study/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: `[TOPIC: ${t}]`, mode: 'explain', language }),
            });
            const data: { answer: string; audio?: string } = await res.json();
            addMessage({ role: 'assistant', text: data.answer, time: nowStr() });
            if (data.audio) {
                setIsSpeaking(true);
                try {
                    const binary = atob(data.audio);
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
                    await new Promise<void>(resolve => { src.onended = () => { ctx.close(); resolve(); }; src.start(); });
                } finally {
                    setIsSpeaking(false);
                    audioSrcRef.current = null;
                    audioCtxRef.current = null;
                }
            }
        } catch (e) {
            addMessage({ role: 'assistant', text: `Error: ${e instanceof Error ? e.message : String(e)}`, time: nowStr() });
        } finally {
            setIsTextAsking(false);
            setIsSpeaking(false);
        }
    }, [topicInput, isTextAsking, language, addMessage, stopSpeaking]);

    const handleTextSend = useCallback(async () => {
        const topic = textTopic.trim();
        if (!topic || isTextAsking) return;

        stopSpeaking(); // stop any current AI audio before sending new message
        setTextTopic('');
        setIsTextAsking(true);
        addMessage({ role: 'user', text: topic, time: nowStr() });

        // Prefix with [TOPIC:] so the LLM always knows the subject context
        const contextualText = activeTopic
            ? `[TOPIC: ${activeTopic}] ${topic}`
            : topic;

        try {
            const res = await fetch(`${BACKEND_HTTP}/study/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: contextualText, mode: 'explain', language }),
            });
            const data: { answer: string; audio?: string } = await res.json();
            addMessage({ role: 'assistant', text: data.answer, time: nowStr() });
            setIsTextAsking(false);

            if (data.audio) {
                setIsSpeaking(true);
                try {
                    const binary = atob(data.audio);
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
                    await new Promise<void>(resolve => { src.onended = () => { ctx.close(); resolve(); }; src.start(); });
                } finally {
                    setIsSpeaking(false);
                    audioSrcRef.current = null;
                    audioCtxRef.current = null;
                }
            }
        } catch (e) {
            addMessage({ role: 'assistant', text: `Error: ${e instanceof Error ? e.message : String(e)}`, time: nowStr() });
        } finally {
            setIsTextAsking(false);
            setIsSpeaking(false);
        }
    }, [textTopic, isTextAsking, isSpeaking, language, activeTopic, addMessage, stopSpeaking]);

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-xl mx-auto flex flex-col gap-6">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link href="/" className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                        <ArrowLeft size={18} className="text-gray-500" />
                    </Link>
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow">
                        <BookOpen size={18} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-lg font-semibold text-gray-800">Topic Explanation</h1>
                        <p className="text-xs text-gray-400">Speak a topic or type it below — AI explains and probes</p>
                    </div>
                    <LanguageSelector value={language} onChange={l => { setLanguage(l); if (isLive) stopLive(); }} />
                </div>

                {/* Chat */}
                <ChatHistory
                    messages={messages}
                    thinking={isThinking || isTextAsking}
                    topSlot={
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Topic to Explain</label>
                            {activeTopic ? (
                                // ── Active topic: show locked badge, ask doubts below ──
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
                                        <span className="text-lg">📖</span>
                                        <span className="flex-1 text-sm font-semibold text-indigo-700 truncate">{activeTopic}</span>
                                    </div>
                                    <button
                                        onClick={() => { setActiveTopic(''); setTopicInput(''); }}
                                        title="Change topic"
                                        className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium bg-white border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors shrink-0"
                                    >
                                        <X size={13} /> Change
                                    </button>
                                </div>
                            ) : (
                                // ── No topic yet: show input ──
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        value={topicInput}
                                        onChange={e => setTopicInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleTopicSet(); }}
                                        placeholder="e.g. Photosynthesis, Recursion, Black holes…"
                                        autoFocus
                                        className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white transition-all"
                                    />
                                    <button
                                        onClick={handleTopicSet}
                                        disabled={!topicInput.trim() || isTextAsking}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-xl transition-colors shadow-sm shrink-0"
                                    >
                                        <Sparkles size={13} />
                                        Explain
                                    </button>
                                </div>
                            )}
                        </div>
                    }
                    interimText={status === 'speech_detected' ? 'Listening to you…' : undefined}
                    inputSlot={
                        <div className="flex gap-2 items-end">
                            <textarea
                                ref={textareaRef}
                                value={textTopic}
                                onChange={e => setTextTopic(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend(); } }}
                                placeholder={isSpeaking ? '🔊 AI is speaking… (you can still type)' : activeTopic ? `Ask a doubt about "${activeTopic}"…` : 'Type a question or doubt… (Enter to send)'}
                                rows={2}
                                disabled={isTextAsking}
                                className="flex-1 resize-none text-sm px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all disabled:opacity-50"
                            />
                            <button
                                onClick={handleTextSend}
                                disabled={!textTopic.trim() || isTextAsking}
                                className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shadow-sm shrink-0"
                            >
                                {isTextAsking
                                    ? <Loader2 size={16} className="animate-spin" />
                                    : <Send size={16} />}
                            </button>
                        </div>
                    }
                    statusBar={
                        isSpeaking ? (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping inline-block" />
                                <span className="text-xs text-indigo-600 font-medium">AI is speaking…</span>
                                <button onClick={stopSpeaking} className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors">
                                    <VolumeX size={12} /> Stop
                                </button>
                                <button onClick={() => { stopSpeaking(); textareaRef.current?.focus(); }} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors">
                                    <Mic size={12} /> Interrupt
                                </button>
                            </div>
                        ) : wsIsSpeaking ? (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping inline-block" />
                                <span className="text-xs text-indigo-600 font-medium">AI is speaking…</span>
                                <button onClick={wsStopSpeaking} className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors">
                                    <VolumeX size={12} /> Stop
                                </button>
                                <button onClick={wsStopSpeaking} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors">
                                    <Mic size={12} /> Interrupt
                                </button>
                            </div>
                        ) : undefined
                    }
                />

                {/* Control card — voice interaction */}
                <ControlCard status={status} isActive={isActive} latency={latency} sessionId={sessionId} isLive={isLive} stopLive={stopLive} startLive={startLive} />
            </div>
        </div>
    );
}
