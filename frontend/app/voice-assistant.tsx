'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { StatusKey, Message } from '../components/types';
import StatusBadge from '../components/StatusBadge';
import SoundBar from '../components/SoundBar';
import ChatHistory from '../components/ChatHistory';

const WS_URL = `${process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'}/ws/live`;
const SAMPLE_RATE = 16000;
const CHUNK_SIZE = 1024;

function float32ToInt16(f32: Float32Array): Int16Array {
    const i16 = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return i16;
}

function nowStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function VoiceAssistant() {
    const [status, setStatus] = useState<StatusKey>('idle');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLive, setIsLive] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const isMutedRef = useRef(false);

    // Space-bar shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.code === 'Space' && e.target === document.body) {
                e.preventDefault();
                isLive ? stopLive() : startLive();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLive]);

    // ── start ─────────────────────────────────────────────────────────────────
    const startLive = useCallback(async () => {
        setStatus('connecting');
        try {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onmessage = async (ev) => {
                let msg: Record<string, string>;
                try { msg = JSON.parse(ev.data as string); } catch { return; }

                if (msg.type === 'status') {
                    setStatus((msg.text as StatusKey) ?? 'listening');
                    if (msg.text === 'listening') isMutedRef.current = false;
                }
                if (msg.type === 'transcript' && msg.text) {
                    setMessages(prev => [...prev, { role: 'user', text: msg.text, time: nowStr() }]);
                }
                if (msg.type === 'response' && msg.text) {
                    setMessages(prev => [...prev, { role: 'assistant', text: msg.text, time: nowStr() }]);
                    if (msg.audio) {
                        isMutedRef.current = true;
                        await playBase64Audio(msg.audio);
                        isMutedRef.current = false;
                    }
                    if (msg.final === 'true') stopLive();
                }
            };

            ws.onclose = () => { setIsLive(false); setStatus('idle'); cleanup(); };
            ws.onerror = () => setStatus('error');

            await new Promise<void>((resolve, reject) => {
                ws.onopen = () => resolve();
                setTimeout(() => reject(new Error('WS timeout')), 8000);
            });

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: SAMPLE_RATE, channelCount: 1,
                    echoCancellation: true, noiseSuppression: true, autoGainControl: true
                },
            });
            streamRef.current = stream;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)({
                sampleRate: SAMPLE_RATE,
            }) as AudioContext;
            audioCtxRef.current = ctx;

            const source = ctx.createMediaStreamSource(stream);
            const processor = ctx.createScriptProcessor(CHUNK_SIZE, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e: AudioProcessingEvent) => {
                if (isMutedRef.current) return;
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
                wsRef.current.send(float32ToInt16(e.inputBuffer.getChannelData(0)).buffer);
            };

            source.connect(processor);
            processor.connect(ctx.destination);

            setIsLive(true);
            setStatus('listening');
        } catch (err) {
            console.error('startLive error:', err);
            setStatus('error');
            cleanup();
            setIsLive(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── stop ──────────────────────────────────────────────────────────────────
    const stopLive = useCallback(() => {
        wsRef.current?.close();
        cleanup();
        setIsLive(false);
        setStatus('idle');
    }, []);

    function cleanup() {
        processorRef.current?.disconnect();
        processorRef.current = null;
        audioCtxRef.current?.close();
        audioCtxRef.current = null;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }

    async function playBase64Audio(b64: string): Promise<void> {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)() as AudioContext;
        const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        await new Promise<void>(resolve => { src.onended = () => { ctx.close(); resolve(); }; src.start(); });
    }

    // ── render ────────────────────────────────────────────────────────────────
    const isActive = status === 'listening' || status === 'speech_detected';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">

            {/* Header */}
            <div className="flex flex-col items-center mb-2">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-md mb-4">
                    <Mic size={24} className="text-white" />
                </div>
                <h1 className="text-2xl font-semibold text-gray-800 tracking-tight">Voice Assistant</h1>
                <p className="text-gray-400 text-sm mt-1">Continuous live speech — just talk</p>
            </div>


            {/* Chat history */}
            <ChatHistory messages={messages} />

            <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col items-center gap-6">

                {/* Status badge */}
                <StatusBadge status={status} />

                {/* Sound bar */}
                {isActive && (
                    <div className="py-1">
                        <SoundBar />
                    </div>
                )}

                {/* Start / Stop button */}
                <button
                    onClick={isLive ? stopLive : startLive}
                    className={`flex items-center gap-2.5 px-7 py-3 rounded-xl font-medium text-sm transition-all duration-150 shadow-sm active:scale-95
                        ${isLive
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                >
                    {isLive
                        ? <><Square size={15} fill="currentColor" /> Stop</>
                        : <><Mic size={15} /> Start Live Mode</>}
                </button>

                <p className="text-gray-400 text-xs">
                    Press <kbd className="bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded text-[10px] font-mono">Space</kbd> to toggle
                </p>
            </div>
        </div>
    );
}
