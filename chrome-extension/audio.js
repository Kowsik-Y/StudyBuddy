// audio.js — AudioContext helpers + gapless SentencePlayer
// Ported from the Next.js frontend (useVoiceWS.ts / voice-assistant.tsx).
// Exposes window.AudioUtils.

// ── float32 → int16 PCM conversion ──────────────────────────────────────────
function float32ToInt16(f32) {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return i16;
}

// ── Gapless MP3 sentence player ──────────────────────────────────────────────
// Mirrors the TypeScript SentencePlayer from the web frontend.
class SentencePlayer {
  constructor() {
    this._ctx      = null;
    this._nextAt   = 0;      // schedule cursor (AudioContext seconds)
    this._pending  = 0;      // sources started but not yet ended
    this._onDone   = null;
    this._q        = [];     // queued base64 MP3 strings
    this._draining = false;
    this._stopped  = false;
  }

  _getCtx() {
    if (!this._ctx || this._ctx.state === 'closed') {
      this._ctx = new AudioContext();
      this._nextAt = 0;
    }
    return this._ctx;
  }

  /** Push one base64 MP3 for gapless playback. */
  enqueue(b64) {
    this._stopped = false;
    this._q.push(b64);
    if (!this._draining) this._drain();
  }

  async _drain() {
    this._draining = true;
    while (this._q.length > 0 && !this._stopped) {
      const b64 = this._q.shift();
      await this._play(b64);
    }
    this._draining = false;
  }

  async _play(b64) {
    if (this._stopped) return;
    const ctx = this._getCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    let buf;
    try {
      buf = await ctx.decodeAudioData(bytes.buffer);
    } catch (e) {
      console.error('[SentencePlayer] decodeAudioData failed:', e);
      return;
    }
    if (this._stopped) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.005, this._nextAt);
    src.start(startAt);
    this._nextAt = startAt + buf.duration;
    this._pending++;

    src.onended = () => {
      this._pending--;
      if (this._pending === 0 && this._onDone) {
        this._onDone();
        this._onDone = null;
      }
    };
  }

  /** Register callback that fires once the last sentence finishes playing. */
  whenDone(cb) {
    if (this._pending === 0 && this._q.length === 0 && !this._draining) {
      cb();
      return;
    }
    this._onDone = cb;
  }

  /** True while audio is queued, decoding, or playing. */
  isActive() {
    return this._pending > 0 || this._draining || this._q.length > 0;
  }

  stop() {
    this._stopped  = true;
    this._q        = [];
    this._onDone   = null;
    if (this._ctx) {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }
    this._nextAt  = 0;
    this._pending = 0;
    this._draining = false;
  }
}

// ── Microphone capture helper ────────────────────────────────────────────────
// Returns a controller with .mute(), .unmute(), .stop().
// onChunk(arrayBuffer) is called with each raw PCM int16 chunk.
async function createAudioCapture({ onChunk, sampleRate = 16000, chunkSize = 1024 }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate,
      channelCount: 1,
      echoCancellation:  true,
      noiseSuppression:  true,
      autoGainControl:   true,
    },
  });

  const ctx       = new AudioContext({ sampleRate });
  const source    = ctx.createMediaStreamSource(stream);
  // ScriptProcessorNode is deprecated but remains the widest-supported
  // approach for raw PCM extraction in extension pages.
  const processor = ctx.createScriptProcessor(chunkSize, 1, 1);

  let muted = false;

  processor.onaudioprocess = (e) => {
    if (muted) return;
    const f32 = e.inputBuffer.getChannelData(0);
    const i16 = float32ToInt16(f32);
    onChunk(i16.buffer);
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  return {
    mute()   { muted = true;  },
    unmute() { muted = false; },
    stop()   {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach(t => t.stop());
      ctx.close().catch(() => {});
    },
  };
}

window.AudioUtils = { SentencePlayer, createAudioCapture, float32ToInt16 };
