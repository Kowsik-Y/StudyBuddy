'use client';
import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { HelpCircle, Mic, Square, ArrowLeft, Star, VolumeX, Send, Loader2, RotateCcw } from 'lucide-react';
import { useVoiceWS } from '../../hooks/useVoiceWS';
import { Language, Message, ScoreBreakdown, LatencyInfo } from '../../components/types';
import StatusBadge from '../../components/StatusBadge';
import SoundBar from '../../components/SoundBar';
import ChatHistory from '../../components/ChatHistory';
import LatencyBadge from '../../components/LatencyBadge';
import LanguageSelector from '../../components/LanguageSelector';
import ControlCard from '@/components/Control-card';
import BuddyCharacter from '@/components/BuddyCharcter';

const BACKEND = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';
const BACKEND_HTTP = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function nowStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function QuizPage() {
    const [language, setLanguage] = useState<Language>('en');
    const [scores, setScores] = useState<ScoreBreakdown[]>([]);
    const [latency, setLatency] = useState<LatencyInfo | null>(null);
    const [sessionId, setSessionId] = useState('');
    const [correct, setCorrect] = useState(0);
    const [questionsAsked, setQuestionsAsked] = useState(0);
    const [lastQuestion, setLastQuestion] = useState('');
    const [isRepeating, setIsRepeating] = useState(false);

    // Text answer state
    const [textAnswer, setTextAnswer] = useState('');
    const [isTextAsking, setIsTextAsking] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const wsUrl = `${BACKEND}/ws/study?mode=quiz&language=${language}`;

    const handleScore = useCallback((s: ScoreBreakdown) => {
        setScores(prev => {
            // Deduplicate by turn — Strict Mode can fire callbacks twice
            if (prev.some(p => p.turn === s.turn)) return prev;
            if (s.is_correct) setCorrect(p => p + 1);
            // Each scored turn = one question answered; track the highest turn seen
            setQuestionsAsked(p => Math.max(p, s.turn));
            return [...prev, s];
        });
    }, []);
    const handleLatency = useCallback((l: LatencyInfo) => setLatency(l), []);
    const handleSessId = useCallback((id: string) => setSessionId(id), []);
    const handleMessage = useCallback((m: Message) => {
        if (m.role === 'assistant') setLastQuestion(m.text);
    }, []);

    const { status, messages, isLive, startLive, stopLive, isThinking, isSpeaking, stopSpeaking, addMessage } = useVoiceWS({
        wsUrl, onScore: handleScore, onLatency: handleLatency, onSessionId: handleSessId,
        onMessage: handleMessage,
    });

    const isActive = status === 'listening' || status === 'speech_detected';
    const total = scores.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repeatQuestion = useCallback(async () => {
        if (!lastQuestion || isRepeating) return;
        setIsRepeating(true);
        try {
            const res = await fetch(`${BACKEND_HTTP}/study/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: lastQuestion, language }),
            });
            const data: { audio?: string } = await res.json();
            if (data.audio) {
                const binary = atob(data.audio);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)() as AudioContext;
                const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.connect(ctx.destination);
                await new Promise<void>(resolve => { src.onended = () => { ctx.close(); resolve(); }; src.start(); });
            }
        } catch { /* ignore */ }
        finally { setIsRepeating(false); }
    }, [lastQuestion, language, isRepeating]);

    const handleTextSend = useCallback(async () => {
        const answer = textAnswer.trim();
        if (!answer || isTextAsking) return;
        stopSpeaking();
        setTextAnswer('');
        setIsTextAsking(true);
        addMessage({ role: 'user', text: answer, time: nowStr() });
        try {
            const res = await fetch(`${BACKEND_HTTP}/study/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: answer, mode: 'quiz', language }),
            });
            const data: { answer: string } = await res.json();
            addMessage({ role: 'assistant', text: data.answer, time: nowStr() });
        } catch (e) {
            addMessage({ role: 'assistant', text: `Error: ${e instanceof Error ? e.message : String(e)}`, time: nowStr() });
        } finally {
            setIsTextAsking(false);
        }
    }, [textAnswer, isTextAsking, language, addMessage, stopSpeaking]);

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-xl mx-auto flex flex-col gap-6 relative">
                <BuddyCharacter
                    isSpeaking={isSpeaking}
                    isThinking={isThinking || isTextAsking}
                    isListening={isActive} />
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link href="/" className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                        <ArrowLeft size={18} className="text-gray-500" />
                    </Link>
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center shadow">
                        <HelpCircle size={18} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-lg font-semibold text-gray-800">Interactive Quiz</h1>
                        <p className="text-xs text-gray-400">Voice MCQs on core CS topics</p>
                    </div>
                    <LanguageSelector value={language} onChange={l => { setLanguage(l); if (isLive) stopLive(); }} />
                </div>

                {/* Score dashboard */}
                <div className="flex gap-3">
                    <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-4 text-center">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest">Questions</p>
                        <p className="text-2xl font-bold text-emerald-600">{questionsAsked}</p>
                    </div>
                    <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-4 text-center">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest">Correct</p>
                        <p className="text-2xl font-bold text-emerald-600">{correct}</p>
                    </div>
                    <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-4 text-center">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest">Score %</p>
                        <p className="text-2xl font-bold text-emerald-600">{total ? `${pct}%` : '—'}</p>
                    </div>
                </div>

                {/* Final summary when done */}
                {!isLive && total > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col items-center gap-2">
                        <Star size={24} className="text-emerald-500" />
                        <p className="font-bold text-emerald-700 text-xl">{pct}% — {correct}/{total} correct</p>
                        <p className="text-xs text-emerald-600">
                            Avg WER: {total ? (scores.reduce((a, b) => a + b.wer, 0) / total * 100).toFixed(0) : 0}%
                        </p>
                    </div>
                )}

                {/* Current question banner with Repeat button */}
                {isLive && lastQuestion && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest mb-1">Current Question</p>
                            <p className="text-sm text-emerald-900 leading-snug">{lastQuestion}</p>
                        </div>
                        <button
                            onClick={repeatQuestion}
                            disabled={isRepeating}
                            title="Repeat question aloud"
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                        >
                            {isRepeating ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                            Repeat
                        </button>
                    </div>
                )}

                {/* Chat */}
                <ChatHistory
                    messages={messages}
                    thinking={isThinking || isTextAsking}
                    interimText={status === 'speech_detected' ? 'Listening to your answer…' : undefined}
                    inputSlot={
                        <div className="flex gap-2 items-end">
                            <textarea
                                ref={textareaRef}
                                value={textAnswer}
                                onChange={e => setTextAnswer(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend(); } }}
                                placeholder="Type your answer… (Enter to send)"
                                rows={2}
                                disabled={isTextAsking}
                                className="flex-1 resize-none text-sm px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-all disabled:opacity-50"
                            />
                            <button
                                onClick={handleTextSend}
                                disabled={!textAnswer.trim() || isTextAsking}
                                className="p-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shadow-sm shrink-0"
                            >
                                {isTextAsking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                        </div>
                    }
                    statusBar={isSpeaking ? (
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                            <span className="text-xs text-emerald-600 font-medium">AI is speaking…</span>
                            <button onClick={stopSpeaking} className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 transition-colors">
                                <VolumeX size={12} /> Stop
                            </button>
                            <button onClick={stopSpeaking} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 transition-colors">
                                <Mic size={12} /> Interrupt
                            </button>
                        </div>
                    ) : undefined}
                />
                {/* Control card */}
                <ControlCard status={status} isActive={isActive} latency={latency} sessionId={sessionId} isLive={isLive} stopLive={stopLive} startLive={startLive} />

            </div>
        </div>
    );
}
