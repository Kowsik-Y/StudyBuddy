'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { StatusKey, Message, ScoreBreakdown, LatencyInfo } from '../components/types';

const SAMPLE_RATE = 16000;
const CHUNK_SIZE  = 1024;

// ── Client-side adaptive noise gate ──────────────────────────────────────────
// Default threshold (≈ 786 int16) — overwritten after per-session calibration.
const NOISE_GATE_RMS_DEFAULT = 0.024;
// Hold 14 chunks (~896 ms) after speech drops below threshold to avoid
// clipping word endings and inter-word pauses.
const NOISE_GATE_HOLD_CHUNKS = 14;
// Measure ambient noise for this many ms at session start before listening.
const CALIBRATION_MS         = 1000;

function rms(f32: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
    return Math.sqrt(sum / f32.length);
}

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

// ── Persistent playback context ───────────────────────────────────────────────
// One AudioContext, one serial drain loop — guarantees gapless scheduling and
// eliminates the race condition that caused only the first sentence to play.
class SentencePlayer {
    private ctx: AudioContext | null = null;
    private nextAt   = 0;          // wall-clock schedule cursor (AudioContext seconds)
    private pending  = 0;          // sources started but not yet ended
    private onDone: (() => void) | null = null;
    private q: string[] = [];      // base-64 MP3 strings waiting to be decoded
    private draining = false;      // is _drain() currently running?
    private stopped  = false;      // set during stop() to abort in-flight drain

    private getCtx(): AudioContext {
        if (!this.ctx || this.ctx.state === 'closed') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)() as AudioContext;
            this.nextAt = 0;
        }
        return this.ctx;
    }

    /** Push one MP3 (base-64) onto the queue — fire-and-forget, no race. */
    enqueue(b64: string): void {
        this.stopped = false;
        this.q.push(b64);
        if (!this.draining) this._drain();
    }

    /** Serial loop: decode → schedule → repeat until queue empty. */
    private async _drain(): Promise<void> {
        this.draining = true;
        while (this.q.length > 0 && !this.stopped) {
            const b64 = this.q.shift()!;
            await this._play(b64);
        }
        this.draining = false;
    }

    private async _play(b64: string): Promise<void> {
        if (this.stopped) return;
        const ctx = this.getCtx();
        if (ctx.state === 'suspended') await ctx.resume();

        // Decode — one at a time, so nextAt is always up-to-date before next call
        const binary = atob(b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        let buf: AudioBuffer;
        try {
            buf = await ctx.decodeAudioData(bytes.buffer);
        } catch (e) {
            console.error('[SentencePlayer] decodeAudioData failed:', e);
            return;
        }
        if (this.stopped) return;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);

        // Gapless: start exactly where previous sentence ended
        const startAt = Math.max(ctx.currentTime + 0.005, this.nextAt);
        src.start(startAt);
        this.nextAt = startAt + buf.duration;
        this.pending++;

        src.onended = () => {
            this.pending--;
            if (this.pending === 0 && this.onDone) {
                this.onDone();
                this.onDone = null;
            }
        };
    }

    /** Register a callback that fires once the last scheduled sentence finishes. */
    whenDone(cb: () => void): void {
        // Only fire immediately if nothing queued AND nothing playing
        if (this.pending === 0 && this.q.length === 0 && !this.draining) { cb(); return; }
        this.onDone = cb;
    }

    /** True while audio sentences are queued, decoding, or playing. */
    isActive(): boolean {
        return this.q.length > 0 || this.draining || this.pending > 0;
    }

    /** Abort playback and reset — safe to call at any time. */
    stop(): void {
        this.stopped = true;
        this.q = [];
        this.ctx?.close().catch(() => {});
        this.ctx     = null;
        this.nextAt  = 0;
        this.pending = 0;
        this.onDone  = null;
    }
}

interface UseVoiceWSOptions {
    wsUrl: string;
    onScore?:     (score: ScoreBreakdown) => void;
    onLatency?:   (lat: LatencyInfo)      => void;
    onQuestion?:  (text: string, audio: string, turn: number) => void;
    onSessionId?: (id: string) => void;
    /** Called whenever a complete new message (user or assistant) is ready. */
    onMessage?:   (m: Message) => void;
}

export function useVoiceWS({ wsUrl, onScore, onLatency, onQuestion, onSessionId, onMessage }: UseVoiceWSOptions) {
    const [status,     setStatus]     = useState<StatusKey>('idle');
    const [messages,   setMessages]   = useState<Message[]>([]);
    const [isLive,     setIsLive]     = useState(false);
    // Dedicated thinking flag: true from 'processing' until first text_token or
    // response arrives. Decoupled from status so React batching can't skip it.
    const [isThinking, setIsThinking] = useState(false);
    const [isSpeaking,  setIsSpeaking]  = useState(false);

    const wsRef        = useRef<WebSocket | null>(null);
    const audioCtxRef  = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef    = useRef<MediaStream | null>(null);
    const isMutedRef   = useRef(false);
    const playerRef    = useRef<SentencePlayer>(new SentencePlayer());
    const isStreamingRef  = useRef(false);
    const onMessageRef = useRef(onMessage);
    // Noise gate hold counter — keeps gate open for NOISE_GATE_HOLD_CHUNKS
    // chunks after speech drops below threshold (avoids clipping word endings)
    const noiseHoldRef     = useRef(0);
    // Per-session adaptive gate threshold (set after calibration)
    const adaptiveGateRef  = useRef(NOISE_GATE_RMS_DEFAULT);
    const calibratingRef   = useRef(false);
    const calibSamplesRef  = useRef<number[]>([]);
    useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

    // Space-bar shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.code === 'Space' && e.target === document.body) {
                e.preventDefault();
                if (isLive) stopLive(); else startLive();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLive]);

    const startLive = useCallback(async () => {
        setStatus('connecting');
        playerRef.current.stop();
        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            // ── Wait for the socket to open (or fail fast) ──────────────────
            // ALL four handlers are wired inside the same Promise so `reject`
            // is reachable from both onerror and onclose, preventing the 8 s
            // timeout from being the only error path.
            await new Promise<void>((resolve, reject) => {
                const clearHandlers = () => {
                    ws.onopen  = null;
                    ws.onerror = null;
                    ws.onclose = null;
                };
                ws.onopen = () => { clearHandlers(); resolve(); };
                ws.onerror = (e) => {
                    clearHandlers();
                    reject(new Error(`WebSocket error — is the backend running? (${(e as ErrorEvent).message ?? 'unknown'})`));
                };
                ws.onclose = (e) => {
                    clearHandlers();
                    reject(new Error(`WebSocket closed before opening (code ${e.code})`));
                };
                setTimeout(() => {
                    clearHandlers();
                    reject(new Error('WS connection timeout — backend did not respond within 8 s'));
                }, 8000);
            });

            // ── Permanent handlers (set after open succeeds) ────────────────
            ws.onclose = () => { setIsLive(false); setStatus('idle'); setIsThinking(false); cleanup(); };
            ws.onerror = () => { setStatus('error'); setIsThinking(false); };

            ws.onmessage = (ev) => {
                let msg: Record<string, string>;
                try { msg = JSON.parse(ev.data as string); } catch { return; }

                // Debug: log every server message to browser console
                console.log('[WS ←]', msg.type, msg.text ? msg.text.slice(0, 120) : '');

                if (msg.type === 'status') {
                    setStatus((msg.text as StatusKey) ?? 'listening');
                    // Turn on thinking indicator as soon as STT starts
                    if (msg.text === 'processing' || msg.text === 'thinking') {
                        setIsThinking(true);
                    }
                    // Clear thinking on any terminal status
                    if (msg.text === 'listening' || msg.text === 'speaking' ||
                        msg.text === 'no_speech'  || msg.text === 'error' ||
                        msg.text === 'idle'        || msg.text === 'goodbye') {
                        setIsThinking(false);
                    }
                    if (msg.text === 'listening') {
                        // New turn ready — reset streaming text state but
                        // DO NOT stop the player or unmute the mic here:
                        // audio from the previous response may still be playing.
                        // The whenDone callback (set in the 'response' handler)
                        // unmutes the mic once all audio finishes.
                        isStreamingRef.current = false;
                        // Only wipe dangling streaming bubbles that were never
                        // finalised (e.g. connection dropped mid-stream). If no
                        // streaming bubble exists the filter is a no-op.
                        setMessages(prev =>
                            prev.some(m => m.streaming) ? prev.filter(m => !m.streaming) : prev
                        );
                        // Only unmute if nothing is currently queued/playing
                        if (!playerRef.current.isActive()) {
                            isMutedRef.current = false;
                        }
                    }
                    if (msg.text === 'speech_detected' || msg.text === 'processing') {
                        // User has started speaking — abort any leftover audio
                        playerRef.current.stop();
                        isMutedRef.current = false;
                        setIsSpeaking(false);
                    }
                }

                if (msg.type === 'session_id' && onSessionId) {
                    onSessionId(msg.text);
                }

                if (msg.type === 'transcript' && msg.text) {
                    const m: Message = {
                        role: 'user', text: msg.text,
                        time: nowStr(), turn: msg.turn ? Number(msg.turn) : undefined,
                    };
                    setMessages(prev => [...prev, m]);
                    if (onMessageRef.current) onMessageRef.current(m);
                }

                // ── live text tokens → build assistant bubble word-by-word ──
                if (msg.type === 'text_token' && msg.text) {
                    if (!isStreamingRef.current) {
                        isStreamingRef.current = true;
                        isMutedRef.current = true;   // mute mic while assistant speaks
                        setIsThinking(false);        // streaming bubble takes over
                        setMessages(prev => [...prev, {
                            role: 'assistant', text: msg.text,
                            time: nowStr(), streaming: true,
                        }]);
                    } else {
                        setMessages(prev => {
                            const msgs = [...prev];
                            const last = msgs[msgs.length - 1];
                            if (last?.streaming) {
                                msgs[msgs.length - 1] = { ...last, text: last.text + msg.text };
                            }
                            return msgs;
                        });
                    }
                }

                // ── audio_chunk: push onto serial queue — no await needed ──
                if (msg.type === 'audio_chunk' && msg.audio) {
                    playerRef.current.enqueue(msg.audio);
                    setIsSpeaking(true);
                }

                // ── response / question: finalise text, unmute after audio ends ──
                // Always handle the event even if msg.text is empty — if it's
                // empty the token-accumulated streaming bubble text is used as
                // fallback so the first AI reply is never silently discarded.
                if (msg.type === 'response' || msg.type === 'question') {
                    setIsThinking(false);
                    // Resolve final text outside the updater so the onMessage
                    // callback is never called inside it (React may invoke
                    // updater functions more than once in Strict Mode, which
                    // would cause duplicate messages).
                    let resolvedMsg: Message | null = null;
                    setMessages(prev => {
                        const streamingBubble = prev.find(m => m.streaming);
                        const finalText = msg.text || streamingBubble?.text || '';
                        const filtered  = prev.filter(m => !m.streaming);
                        if (!finalText) return filtered; // nothing to show
                        resolvedMsg = {
                            role: 'assistant', text: finalText,
                            time: nowStr(), turn: msg.turn ? Number(msg.turn) : undefined,
                        };
                        return [...filtered, resolvedMsg];
                    });
                    // Fire the callback exactly once, outside the updater
                    if (resolvedMsg && onMessageRef.current) onMessageRef.current(resolvedMsg);
                    isStreamingRef.current = false;

                    // Legacy: single-chunk audio (question events / /ws/live)
                    if (msg.audio) {
                        playerRef.current.enqueue(msg.audio);
                    }
                    if (msg.type === 'question' && onQuestion) {
                        onQuestion(msg.text, msg.audio ?? '', Number(msg.turn ?? 0));
                    }

                    // Unmute mic only after all scheduled audio has finished
                    playerRef.current.whenDone(() => {
                        isMutedRef.current = false;
                        setIsSpeaking(false);
                    });

                    if (msg.final === 'true') stopLive();
                }

                if (msg.type === 'score' && onScore) {
                    onScore({
                        accuracy:     Number(msg.accuracy),
                        terminology:  Number(msg.terminology),
                        completeness: Number(msg.completeness),
                        clarity:      Number(msg.clarity),
                        total_score:  Number(msg.total_score),
                        wer:          Number(msg.wer),
                        feedback:     msg.feedback ?? '',
                        turn:         Number(msg.turn ?? 0),
                        is_correct:   Boolean(msg.is_correct),
                    });
                }
                if (msg.type === 'latency' && onLatency) {
                    onLatency({
                        stt_ms: Number(msg.stt_ms),
                        llm_ms: Number(msg.llm_ms),
                        tts_ms: Number(msg.tts_ms),
                    });
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: SAMPLE_RATE, channelCount: 1,
                    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
                },
            });
            streamRef.current = stream;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)({
                sampleRate: SAMPLE_RATE,
            }) as AudioContext;
            audioCtxRef.current = ctx;

            const source    = ctx.createMediaStreamSource(stream);

            // ── High-pass filter: removes low-freq rumble (fans, A/C, keyboard) ──
            const highpass = ctx.createBiquadFilter();
            highpass.type            = 'highpass';
            highpass.frequency.value = 80;   // cut everything below 80 Hz
            highpass.Q.value         = 0.7;

            // ── Dynamics compressor: brings speech up, pushes noise down ──────
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = -24;
            compressor.knee.value      = 8;
            compressor.ratio.value     = 4;
            compressor.attack.value    = 0.003;
            compressor.release.value   = 0.15;

            const processor = ctx.createScriptProcessor(CHUNK_SIZE, 1, 1);
            processorRef.current = processor;

            noiseHoldRef.current = 0;

            processor.onaudioprocess = (e: AudioProcessingEvent) => {
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

                const input = e.inputBuffer.getChannelData(0);

                // Calibration phase: sample the noise floor, send silence
                if (calibratingRef.current) {
                    calibSamplesRef.current.push(rms(input));
                    wsRef.current.send(new Int16Array(CHUNK_SIZE).buffer);
                    return;
                }

                if (isMutedRef.current) return;

                // Adaptive noise gate (threshold set by per-session calibration)
                if (rms(input) >= adaptiveGateRef.current) {
                    noiseHoldRef.current = NOISE_GATE_HOLD_CHUNKS;
                    wsRef.current.send(float32ToInt16(input).buffer);
                } else if (noiseHoldRef.current > 0) {
                    noiseHoldRef.current--;
                    wsRef.current.send(float32ToInt16(input).buffer);
                } else {
                    wsRef.current.send(new Int16Array(CHUNK_SIZE).buffer);
                }
            };

            // Chain: source → highpass → compressor → processor → destination
            source.connect(highpass);
            highpass.connect(compressor);
            compressor.connect(processor);
            processor.connect(ctx.destination);

            // ── Adaptive noise floor calibration ─────────────────────────────
            // Stay silent for CALIBRATION_MS while measuring room noise, then
            // set the gate to 4× the measured floor so only genuine speech
            // (clearly louder than ambient noise) is sent to the backend.
            calibratingRef.current = true;
            calibSamplesRef.current = [];
            setStatus('calibrating');

            await new Promise<void>(resolve => setTimeout(resolve, CALIBRATION_MS));

            calibratingRef.current = false;
            // Guard: if stopLive() was called during calibration, bail out
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

            const samples = calibSamplesRef.current;
            if (samples.length > 0) {
                const floor = samples.reduce((a, b) => a + b, 0) / samples.length;
                adaptiveGateRef.current = Math.max(0.025, Math.min(0.20, floor * 4.0));
            } else {
                adaptiveGateRef.current = NOISE_GATE_RMS_DEFAULT;
            }
            console.log('[NoiseGate] calibrated threshold:', adaptiveGateRef.current.toFixed(4));

            setIsLive(true);
            setStatus('listening');
        } catch (err) {
            console.error('startLive error:', err);
            setStatus('error');
            cleanup();
            setIsLive(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wsUrl]);

    const stopLive = useCallback(() => {
        wsRef.current?.close();
        cleanup();
        setIsLive(false);
        setStatus('idle');
        setIsThinking(false);
    }, []);

    function cleanup() {
        calibratingRef.current = false;   // abort calibration if in progress
        processorRef.current?.disconnect();
        processorRef.current = null;
        audioCtxRef.current?.close();
        audioCtxRef.current  = null;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        playerRef.current.stop();
        setIsSpeaking(false);
    }

    const stopSpeaking = useCallback(() => {
        playerRef.current.stop();
        setIsSpeaking(false);
        isMutedRef.current = false;
    }, []);

    return { status, messages, isLive, startLive, stopLive, isThinking, isSpeaking, stopSpeaking,
        addMessage:    (m: Message) => setMessages(prev => [...prev, m]),
        clearMessages: ()           => setMessages([]) };
}

// Legacy helper kept for any pages that still use it directly
export async function playBase64Audio(b64: string): Promise<void> {
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)() as AudioContext;
    const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    await new Promise<void>(resolve => {
        src.onended = () => { ctx.close(); resolve(); };
        src.start();
    });
}

