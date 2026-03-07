'use client';
import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { GraduationCap, Mic, Square, ArrowLeft, Trophy, VolumeX, Send, Loader2 } from 'lucide-react';
import { useVoiceWS } from '../../hooks/useVoiceWS';
import { Language, ScoreBreakdown, LatencyInfo } from '../../components/types';
import StatusBadge from '../../components/StatusBadge';
import SoundBar from '../../components/SoundBar';
import ChatHistory from '../../components/ChatHistory';
import ScoreCard from '../../components/ScoreCard';
import LatencyBadge from '../../components/LatencyBadge';
import Timer from '../../components/Timer';
import LanguageSelector from '../../components/LanguageSelector';
import ControlCard from '@/components/Control-card';

const BACKEND = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';
const BACKEND_HTTP = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const VIVA_SEC = 30;

function nowStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function VivaPage() {
    const [language, setLanguage] = useState<Language>('en');
    const [scores, setScores] = useState<ScoreBreakdown[]>([]);
    const [latency, setLatency] = useState<LatencyInfo | null>(null);
    const [sessionId, setSessionId] = useState('');
    const [timerSec, setTimerSec] = useState(VIVA_SEC);
    const [timerRun, setTimerRun] = useState(false);
    const [turnCount, setTurnCount] = useState(0);
    const timerRunRef = useRef(false);

    // Text answer state
    const [textAnswer, setTextAnswer] = useState('');
    const [isTextAsking, setIsTextAsking] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const wsUrl = `${BACKEND}/ws/study?mode=viva&language=${language}`;

    const handleScore = useCallback((s: ScoreBreakdown) => {
        setScores(prev => [...prev, s]);
        setTurnCount(s.turn);
        // Stop timer when score arrives (student answered)
        setTimerRun(false);
        timerRunRef.current = false;
    }, []);
    const handleLatency = useCallback((l: LatencyInfo) => setLatency(l), []);
    const handleSessId = useCallback((id: string) => setSessionId(id), []);
    const handleQuestion = useCallback((_text: string, _audio: string) => {
        // New question arrived → restart timer
        setTimerSec(VIVA_SEC);
        setTimerRun(true);
        timerRunRef.current = true;
    }, []);

    const { status, messages, isLive, startLive, stopLive, isThinking, isSpeaking, stopSpeaking, addMessage } = useVoiceWS({
        wsUrl, onScore: handleScore, onLatency: handleLatency,
        onSessionId: handleSessId, onQuestion: handleQuestion,
    });

    const isActive = status === 'listening' || status === 'speech_detected';
    const lastScore = scores[scores.length - 1] ?? null;
    const avgScore = scores.length
        ? (scores.reduce((a, b) => a + b.total_score, 0) / scores.length).toFixed(1)
        : null;

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
                body: JSON.stringify({ text: answer, mode: 'viva', language }),
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
            <div className="max-w-xl mx-auto flex flex-col gap-6">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link href="/" className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                        <ArrowLeft size={18} className="text-gray-500" />
                    </Link>
                    <div className="w-10 h-10 rounded-2xl bg-violet-600 flex items-center justify-center shadow">
                        <GraduationCap size={18} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-lg font-semibold text-gray-800">Viva Simulation</h1>
                        <p className="text-xs text-gray-400">Answer technical questions under time pressure</p>
                    </div>
                    <LanguageSelector value={language} onChange={l => { setLanguage(l); if (isLive) stopLive(); }} />
                </div>

                {/* Stats row */}
                {turnCount > 0 && (
                    <div className="flex gap-3">
                        <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-4 text-center">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Questions</p>
                            <p className="text-2xl font-bold text-violet-600">{turnCount}</p>
                        </div>
                        <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-4 text-center">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Avg Score</p>
                            <p className="text-2xl font-bold text-violet-600">{avgScore ?? '—'}</p>
                        </div>
                        {lastScore && (
                            <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-4 text-center">
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Last WER</p>
                                <p className="text-2xl font-bold text-violet-600">{(lastScore.wer * 100).toFixed(0)}%</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Summary when ended */}
                {!isLive && scores.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <Trophy size={16} className="text-amber-500" />
                            Session Summary
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: 'Questions', val: turnCount },
                                { label: 'Average Score', val: `${avgScore}/10` },
                                { label: 'Avg Accuracy', val: `${(scores.reduce((a, b) => a + b.accuracy, 0) / scores.length).toFixed(1)}/10` },
                                { label: 'Avg WER', val: `${(scores.reduce((a, b) => a + b.wer, 0) / scores.length * 100).toFixed(0)}%` },
                            ].map(item => (
                                <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-[10px] text-gray-400">{item.label}</p>
                                    <p className="text-lg font-bold text-gray-800">{item.val}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Latest score */}
                {lastScore && <ScoreCard score={lastScore} />}

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
                                className="flex-1 resize-none text-sm px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all disabled:opacity-50"
                            />
                            <button
                                onClick={handleTextSend}
                                disabled={!textAnswer.trim() || isTextAsking}
                                className="p-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shadow-sm shrink-0"
                            >
                                {isTextAsking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                        </div>
                    }
                    statusBar={isSpeaking ? (
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-violet-500 animate-ping inline-block" />
                            <span className="text-xs text-violet-600 font-medium">AI is speaking…</span>
                            <button onClick={stopSpeaking} className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 transition-colors">
                                <VolumeX size={12} /> Stop
                            </button>
                            <button onClick={stopSpeaking} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 transition-colors">
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
