// sidepanel.js — main logic for all features
// Depends on: api.js (window.SpeechAPI), audio.js (window.AudioUtils)

'use strict';

// ── Shared player (used by Voice & Video QA for single-response audio) ────────
let sharedPlayer = null;

function getSharedPlayer() {
  if (!sharedPlayer) sharedPlayer = new window.AudioUtils.SentencePlayer();
  return sharedPlayer;
}

// ── Utility helpers ────────────────────────────────────────────────────────────

function nowStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUS_COLORS = {
  idle:       '#6b7280',
  connecting: '#f59e0b',
  listening:  '#10b981',
  thinking:   '#6366f1',
  speaking:   '#3b82f6',
  processing: '#f59e0b',
  error:      '#ef4444',
};

function setStatusBadge(elementId, statusKey, label) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const color = STATUS_COLORS[statusKey] || STATUS_COLORS.idle;
  el.innerHTML =
    `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;` +
    `background:${color};margin-right:5px;"></span>${escapeHtml(label || statusKey)}`;
}

function appendMessage(containerId, role, text) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML =
    `<div class="message-role">${role === 'user' ? '🎤 You' : '🤖 AI'}</div>` +
    `<div class="message-text">${escapeHtml(text)}</div>` +
    `<div class="message-time">${nowStr()}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function clearMessages(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

// ── Mic permission helpers ────────────────────────────────────────────────────

async function requestMicPermission() {
  // 1. Permissions API query (no prompt, instant, tells us current state)
  let permState = 'unknown';
  if (navigator.permissions) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      permState = status.state;   // 'granted' | 'prompt' | 'denied'
      console.info('[Mic] Permissions API state:', permState);
    } catch (e) {
      console.warn('[Mic] Permissions API unavailable:', e.message);
    }
  }

  // If Permissions API already says 'denied' skip getUserMedia to avoid
  // throwing an error with no visible Chrome prompt.
  if (permState === 'denied') {
    return { ok: false, name: 'NotAllowedError', state: 'denied', permState };
  }

  // 2. Actual getUserMedia call to trigger Chrome's prompt (if state==='prompt')
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach(t => t.stop());  // release immediately
    console.info('[Mic] getUserMedia succeeded, permission granted.');
    return { ok: true };
  } catch (e) {
    console.error('[Mic] getUserMedia error:', e.name, '-', e.message, '| permState:', permState);
    return { ok: false, name: e.name, message: e.message, permState };
  }
}

function showPreflight(show) {
  const el = document.getElementById('mic-preflight');
  if (el) {
    if (show) el.removeAttribute('hidden');
    else      el.setAttribute('hidden', '');
  }
}

function showMicBanner(show, result) {
  const banner = document.getElementById('mic-permission-banner');
  if (!banner) return;

  if (!show) { banner.setAttribute('hidden', ''); return; }

  const steps     = banner.querySelector('.mic-banner-steps');
  const errorInfo = banner.querySelector('.mic-banner-debug');
  const name      = (result && result.name)     || 'NotAllowedError';
  const permState = (result && result.permState) || 'unknown';
  const msg       = (result && result.message)   || '';
  const isHw      = name === 'NotFoundError' || name === 'DevicesNotFoundError';
  // 'dismissed' = permState was 'prompt' and user closed the Chrome prompt without choosing
  const isDismissed = name === 'NotAllowedError' && permState === 'prompt';

  if (errorInfo) {
    errorInfo.textContent = `ℹ ${name}${msg ? ': ' + msg : ''} | state: ${permState}`;
  }

  if (isHw) {
    steps.innerHTML =
      '<li>No microphone detected by Chrome.</li>' +
      '<li>Plug in a mic or headset, then click <strong>Retry</strong>.</li>';
  } else if (isDismissed) {
    // User saw the prompt but clicked X instead of Allow
    banner.querySelector('.mic-banner-title').textContent = '⚠️ Permission prompt was dismissed';
    steps.innerHTML =
      '<li>Chrome showed a permission bubble at the <strong>top of the browser window</strong> (near the address bar) but it was closed without clicking <em>Allow</em>.</li>' +
      '<li>Click <strong>Retry</strong> below — when the bubble appears again, click <strong style="color:#10b981">Allow</strong>.</li>' +
      '<li>If the bubble doesn’t appear, click the <strong>📷</strong> or <strong>🔒</strong> icon just left of the address bar, set Microphone to <em>Allow</em>, then reload the extension and try again.</li>';
  } else {
    // Permanently denied (permState = 'denied') or macOS block
    steps.innerHTML =
      '<li><strong>macOS:</strong> Open <em>System Settings → Privacy &amp; Security → Microphone</em> and enable <strong>Google Chrome</strong>. Then quit and relaunch Chrome.</li>' +
      '<li><strong>Chrome:</strong> Click “Open Chrome Mic Settings” below, find the <code>chrome-extension://…</code> entry under <em>Not allowed</em>, and change it to <em>Allow</em>.</li>' +
      '<li>Reload the extension at <code>chrome://extensions</code>, reopen this panel, then click <strong>Retry</strong>.</li>';
  }

  banner.removeAttribute('hidden');
}

// ── Tab navigation ────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('active', c.id === `tab-${tab}`)
  );
  if (tab === 'analytics') loadAnalytics();
  if (tab === 'settings')  loadSettings();
}

// ══════════════════════════════════════════════════════════════════════════════
// VOICE ASSISTANT  (WS /ws/live)
// ══════════════════════════════════════════════════════════════════════════════

let voiceWS       = null;
let voiceCapture  = null;
let voiceActive   = false;
let voicePlayer   = null;
let voiceClosing  = false;  // true when WE initiate close — avoids re-entrant stopVoice()

async function toggleVoice() {
  voiceActive ? stopVoice() : await startVoice();
}

async function startVoice() {
  const btn = document.getElementById('voice-btn');
  btn.disabled = true;
  setStatusBadge('voice-status', 'connecting', 'Requesting mic…');

  voicePlayer = new window.AudioUtils.SentencePlayer();

  try {
    // ── Step 1: acquire microphone BEFORE opening the WebSocket ──────────
    // Use a two-step approach:
    //   a) lightweight getUserMedia test — triggers Chrome's native prompt
    //   b) full createAudioCapture for actual PCM streaming
    showMicBanner(false);
    showPreflight(true);
    const micResult = await requestMicPermission();
    showPreflight(false);
    if (!micResult.ok) {
      showMicBanner(true, micResult);
      const hint = micResult.name === 'NotFoundError' || micResult.name === 'DevicesNotFoundError'
        ? 'No microphone found. Plug in a mic and click Retry.'
        : micResult.permState === 'prompt'
        ? 'Permission prompt dismissed — click Retry and then click Allow in the browser toolbar.'
        : 'Mic access blocked. Error: ' + (micResult.name || 'NotAllowedError') + '. Follow the steps shown above.';
      throw new Error(hint);
    }

    let capture;
    try {
      capture = await window.AudioUtils.createAudioCapture({
        onChunk: (buf) => {
          if (voiceWS && voiceWS.readyState === WebSocket.OPEN) voiceWS.send(buf);
        },
      });
    } catch (micErr) {
      showMicBanner(true, micErr.name);
      throw new Error(`Mic setup failed: ${micErr.message}`);
    }
    voiceCapture = capture;

    // ── Step 2: open WebSocket ────────────────────────────────────────────
    setStatusBadge('voice-status', 'connecting', 'Connecting…');
    const wsBase = await window.SpeechAPI.getWsBase();
    const ws     = new WebSocket(`${wsBase}/ws/live`);
    voiceWS = ws;

    await new Promise((resolve, reject) => {
      ws.onopen  = resolve;
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
      setTimeout(() => reject(new Error('Connection timed out after 8 s')), 8000);
    });

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === 'status') {
        const label = msg.text.charAt(0).toUpperCase() + msg.text.slice(1);
        setStatusBadge('voice-status', msg.text, label);
        if (msg.text === 'listening') voiceCapture?.unmute();
      }
      if (msg.type === 'transcript' && msg.text) {
        appendMessage('voice-messages', 'user', msg.text);
      }
      if (msg.type === 'response' && msg.text) {
        appendMessage('voice-messages', 'assistant', msg.text);
        if (msg.audio) {
          voiceCapture?.mute();
          voicePlayer.enqueue(msg.audio);
          voicePlayer.whenDone(() => voiceCapture?.unmute());
        }
      }
    };

    ws.onclose = () => { if (!voiceClosing) stopVoice(); };
    ws.onerror = () => setStatusBadge('voice-status', 'error', 'Error');

    voiceActive  = true;
    btn.disabled = false;
    btn.className = 'btn btn-danger btn-wide';
    btn.textContent = '⏹ Stop Listening';
    setStatusBadge('voice-status', 'listening', 'Listening');
  } catch (err) {
    console.error('[Voice] start error:', err);
    setStatusBadge('voice-status', 'error', err.message);
    btn.disabled = false;
    btn.className = 'btn btn-primary btn-wide';
    btn.textContent = '🎤 Start Listening';
    cleanupVoice();
  }
}

function cleanupVoice() {
  voiceClosing = true;
  voicePlayer?.stop();
  voicePlayer = null;
  voiceCapture?.stop();
  voiceCapture = null;
  if (voiceWS) { try { voiceWS.close(); } catch (_) {} voiceWS = null; }
  voiceClosing = false;
}

function stopVoice() {
  voiceActive = false;
  cleanupVoice();
  setStatusBadge('voice-status', 'idle', 'Idle');
  const btn = document.getElementById('voice-btn');
  if (btn) { btn.className = 'btn btn-primary btn-wide'; btn.textContent = 'Start Listening'; btn.disabled = false; }
}

// ══════════════════════════════════════════════════════════════════════════════
// STUDY MODES  (WS /ws/study?mode=explain|quiz|viva)
// ══════════════════════════════════════════════════════════════════════════════

// Per-mode state object — keyed by mode string
// closing: true when WE initiate ws.close() — prevents re-entrant stopStudy()
const studyState = {
  explain: { ws: null, capture: null, player: null, active: false, streamEl: null, streamText: '', closing: false },
  quiz:    { ws: null, capture: null, player: null, active: false, streamEl: null, streamText: '', closing: false },
  viva:    { ws: null, capture: null, player: null, active: false, streamEl: null, streamText: '', closing: false },
};

async function toggleStudy(mode) {
  studyState[mode].active ? stopStudy(mode) : await startStudy(mode);
}

async function startStudy(mode) {
  const st  = studyState[mode];
  const btn = document.getElementById(`${mode}-btn`);
  btn.disabled = true;
  setStatusBadge(`${mode}-status`, 'connecting', 'Requesting mic…');

  st.player     = new window.AudioUtils.SentencePlayer();
  st.streamEl   = null;
  st.streamText = '';

  try {
    // ── Step 1: acquire microphone BEFORE opening the WebSocket ──────────
    // Use a two-step approach:
    //   a) lightweight getUserMedia test — triggers Chrome's native prompt
    //   b) full createAudioCapture for actual PCM streaming
    const micResult = await requestMicPermission();
    if (!micResult.ok) {
      throw new Error(
        micResult.name === 'NotFoundError' || micResult.name === 'DevicesNotFoundError'
          ? 'No microphone found. Plug in a mic and try again.'
          : 'Mic blocked. Use the Voice tab to see how to fix it.'
      );
    }

    let capture;
    try {
      capture = await window.AudioUtils.createAudioCapture({
        onChunk: (buf) => {
          if (st.ws && st.ws.readyState === WebSocket.OPEN) st.ws.send(buf);
        },
      });
    } catch (micErr) {
      throw new Error(`Mic setup failed: ${micErr.message}`);
    }
    st.capture = capture;

    // ── Step 2: open WebSocket ────────────────────────────────────────────
    setStatusBadge(`${mode}-status`, 'connecting', 'Connecting…');
    const wsBase = await window.SpeechAPI.getWsBase();
    const lang   = document.getElementById(`${mode}-lang`).value  || 'en';
    const topic  = (document.getElementById(`${mode}-topic`).value || '').trim();
    const qs     = new URLSearchParams({ mode, language: lang, ...(topic && { topic }) });
    const ws     = new WebSocket(`${wsBase}/ws/study?${qs}`);
    st.ws = ws;

    await new Promise((resolve, reject) => {
      ws.onopen  = resolve;
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
      setTimeout(() => reject(new Error('Connection timed out after 8 s')), 8000);
    });

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      handleStudyMessage(mode, msg);
    };

    ws.onclose = () => { if (!st.closing) stopStudy(mode); };
    ws.onerror = () => setStatusBadge(`${mode}-status`, 'error', 'Error');

    st.active    = true;
    btn.disabled = false;
    btn.className = 'btn btn-danger btn-wide';
    btn.textContent = '⏹ Stop Session';
    setStatusBadge(`${mode}-status`, 'listening', 'Listening');
  } catch (err) {
    console.error(`[Study:${mode}] start error:`, err);
    setStatusBadge(`${mode}-status`, 'error', err.message);
    btn.disabled = false;
    btn.className = 'btn btn-primary btn-wide';
    btn.textContent = 'Start Session';
    cleanupStudy(mode);
  }
}

function handleStudyMessage(mode, msg) {
  const st = studyState[mode];
  const mc = `${mode}-messages`;

  switch (msg.type) {
    case 'status': {
      const label = msg.text.charAt(0).toUpperCase() + msg.text.slice(1);
      setStatusBadge(`${mode}-status`, msg.text, label);
      if (msg.text === 'listening') st.capture?.unmute();
      if (msg.text === 'speaking')  st.capture?.mute();
      break;
    }
    case 'transcript':
      if (msg.text) appendMessage(mc, 'user', msg.text);
      break;

    case 'text_token':
      if (msg.text) appendStreamToken(mode, msg.text);
      break;

    case 'audio_chunk':
      finalizeStreamToken(mode);           // commit the streamed text bubble
      if (msg.audio) st.player.enqueue(msg.audio);
      break;

    case 'score':
      finalizeStreamToken(mode);
      renderScore(mode, msg);
      break;

    case 'latency':
      document.getElementById(`${mode}-latency`).textContent =
        `STT: ${msg.stt_ms} ms  ·  LLM: ${msg.llm_ms} ms  ·  TTS: ${msg.tts_ms} ms`;
      break;
  }
}

// Streaming text token accumulation into a live bubble
function appendStreamToken(mode, token) {
  const st        = studyState[mode];
  const container = document.getElementById(`${mode}-messages`);
  if (!container) return;

  if (!st.streamEl) {
    st.streamEl = document.createElement('div');
    st.streamEl.className  = 'message assistant streaming';
    st.streamEl.innerHTML  = '<div class="message-role">🤖 AI</div><div class="message-text"></div>';
    container.appendChild(st.streamEl);
    st.streamText = '';
  }

  st.streamText += token;
  st.streamEl.querySelector('.message-text').textContent = st.streamText;
  container.scrollTop = container.scrollHeight;
}

function finalizeStreamToken(mode) {
  const st = studyState[mode];
  if (!st.streamEl) return;
  st.streamEl.classList.remove('streaming');
  const timeDiv    = document.createElement('div');
  timeDiv.className = 'message-time';
  timeDiv.textContent = nowStr();
  st.streamEl.appendChild(timeDiv);
  st.streamEl   = null;
  st.streamText = '';
}

function renderScore(mode, msg) {
  const container = document.getElementById(`${mode}-score`);
  if (!container) return;

  const total = parseFloat(msg.total_score) || 0;
  const cls   = total >= 80 ? 'score-high' : total >= 60 ? 'score-mid' : 'score-low';

  // Only show correct/wrong badge in quiz mode
  const correctBadge = mode === 'quiz'
    ? `<span>${msg.is_correct ? '✅ Correct' : '❌ Wrong'}</span>`
    : '';

  container.innerHTML = `
    <div class="score-card ${cls}">
      <div class="score-header">Turn ${escapeHtml(String(msg.turn))} score</div>
      <div class="score-total">${total.toFixed(1)}<small style="font-size:13px">/100</small></div>
      <div class="score-breakdown">
        <span>Accuracy: ${(+msg.accuracy).toFixed(1)}</span>
        <span>Terms: ${(+msg.terminology).toFixed(1)}</span>
        <span>Complete: ${(+msg.completeness).toFixed(1)}</span>
        <span>Clarity: ${(+msg.clarity).toFixed(1)}</span>
        ${msg.wer != null ? `<span>WER: ${(+msg.wer).toFixed(2)}</span>` : ''}
        ${correctBadge}
      </div>
      ${msg.feedback ? `<div class="score-feedback">${escapeHtml(msg.feedback)}</div>` : ''}
    </div>`;
}

function cleanupStudy(mode) {
  const st = studyState[mode];
  st.closing = true;
  st.player?.stop();
  st.player  = null;
  st.capture?.stop();
  st.capture = null;
  if (st.ws) { try { st.ws.close(); } catch (_) {} st.ws = null; }
  st.closing = false;
}

function stopStudy(mode) {
  const st = studyState[mode];
  st.active = false;
  finalizeStreamToken(mode);
  cleanupStudy(mode);
  setStatusBadge(`${mode}-status`, 'idle', 'Idle');
  const btn = document.getElementById(`${mode}-btn`);
  if (btn) { btn.className = 'btn btn-primary btn-wide'; btn.textContent = 'Start Session'; btn.disabled = false; }
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO QA  (POST /video/transcript | /video/upload | /video/ask)
// ══════════════════════════════════════════════════════════════════════════════

let videoSessionId = null;

async function processYouTube() {
  const url = document.getElementById('yt-url').value.trim();
  if (!url) { alert('Please enter a YouTube URL'); return; }

  setVideoProcessing(true, 'Downloading and transcribing…');
  try {
    const res  = await window.SpeechAPI.apiPost('/video/transcript', { url, language: 'en' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Transcription failed');

    videoSessionId = data.session_id;
    showVideoResult(data.title || 'Video', data.transcript);
  } catch (err) {
    document.getElementById('video-status').textContent = '⚠ ' + err.message;
  } finally {
    setVideoProcessing(false, '');
  }
}

async function processVideoFile(file) {
  if (!file) return;

  setVideoProcessing(true, `Processing "${file.name}"…`);
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res  = await window.SpeechAPI.apiPost('/video/upload', fd);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload/transcription failed');

    videoSessionId = data.session_id;
    showVideoResult(data.title || file.name, data.transcript);
  } catch (err) {
    document.getElementById('video-status').textContent = '⚠ ' + err.message;
  } finally {
    setVideoProcessing(false, '');
  }
}

function setVideoProcessing(active, label) {
  const btn = document.getElementById('yt-process-btn');
  btn.disabled    = active;
  btn.textContent = active ? '⏳ Processing…' : '▶ Process';
  document.getElementById('video-status').textContent = label || '';
}

function showVideoResult(title, transcript) {
  const details = document.getElementById('video-transcript-details');
  details.removeAttribute('hidden');
  document.getElementById('video-title').textContent         = title;
  document.getElementById('video-transcript-text').textContent = transcript || '(no transcript)';

  const qa = document.getElementById('video-qa-section');
  qa.removeAttribute('hidden');

  document.getElementById('video-status').textContent = '✓ Ready — ask a question below';
}

async function askVideoQuestion() {
  const input    = document.getElementById('video-question');
  const question = input.value.trim();
  if (!question)          { alert('Please type a question'); return; }
  if (!videoSessionId)    { alert('Please process a video first'); return; }

  appendMessage('video-messages', 'user', question);
  input.value = '';

  const askBtn = document.getElementById('video-ask-btn');
  askBtn.disabled = true;
  try {
    const res  = await window.SpeechAPI.apiPost('/video/ask', {
      session_id: videoSessionId,
      question,
      tts: true,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to get answer');

    appendMessage('video-messages', 'assistant', data.answer);
    if (data.audio) getSharedPlayer().enqueue(data.audio);
  } catch (err) {
    appendMessage('video-messages', 'assistant', '⚠ ' + err.message);
  } finally {
    askBtn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS  (GET /analytics/summary  GET /analytics/sessions)
// ══════════════════════════════════════════════════════════════════════════════

async function loadAnalytics() {
  const loading = document.getElementById('analytics-loading');
  const content = document.getElementById('analytics-content');
  loading.textContent = 'Loading…';
  loading.removeAttribute('hidden');
  content.setAttribute('hidden', '');

  try {
    const [summaryRes, sessionsRes] = await Promise.all([
      window.SpeechAPI.apiGet('/analytics/summary'),
      window.SpeechAPI.apiGet('/analytics/sessions'),
    ]);

    const summary  = await summaryRes.json();
    const sessions = await sessionsRes.json();

    renderAnalyticsSummary(summary, sessions);
    renderSessionsTable(sessions);

    loading.setAttribute('hidden', '');
    content.removeAttribute('hidden');
  } catch (err) {
    loading.textContent = '⚠ Error loading analytics: ' + err.message;
  }
}

function renderAnalyticsSummary(summary, sessions) {
  // summary = { topic_stats, trend, latency }
  // We derive top-level numbers from the trend array (recent 30 sessions)
  const trend = Array.isArray(summary.trend) ? summary.trend : sessions;

  const total      = trend.length;
  const validScore = trend.filter(s => s.avg_score != null);
  const avgScore   = validScore.length
    ? (validScore.reduce((a, s) => a + s.avg_score, 0) / validScore.length).toFixed(1)
    : 'N/A';
  const validWer   = trend.filter(s => s.avg_wer != null);
  const avgWer     = validWer.length
    ? (validWer.reduce((a, s) => a + s.avg_wer, 0) / validWer.length).toFixed(2)
    : 'N/A';
  const totalTurns = trend.reduce((a, s) => a + (s.turn_count || 0), 0);

  document.getElementById('stat-sessions').textContent = total;
  document.getElementById('stat-score').textContent    = avgScore;
  document.getElementById('stat-wer').textContent      = avgWer;
  document.getElementById('stat-turns').textContent    = totalTurns;
}

function renderSessionsTable(sessions) {
  const tbody = document.querySelector('#sessions-table tbody');
  tbody.innerHTML = '';

  if (!sessions.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;opacity:.5;padding:16px">No sessions yet</td></tr>';
    return;
  }

  sessions.forEach(s => {
    const tr   = document.createElement('tr');
    const date = s.started_at
      ? new Date(s.started_at + 'Z').toLocaleDateString()
      : '—';
    tr.innerHTML =
      `<td><span class="mode-badge mode-${escapeHtml(s.mode)}">${escapeHtml(s.mode)}</span></td>` +
      `<td>${escapeHtml(s.language || 'en')}</td>` +
      `<td>${s.avg_score != null ? (+s.avg_score).toFixed(1) : '—'}</td>` +
      `<td>${s.turn_count ?? 0}</td>` +
      `<td>${date}</td>`;
    tbody.appendChild(tr);
  });
}

async function resetAnalytics() {
  if (!confirm('Reset all analytics data? This cannot be undone.')) return;
  try {
    await window.SpeechAPI.apiDelete('/analytics/reset');
    loadAnalytics();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

function loadSettings() {
  chrome.storage.local.get({ backendUrl: 'http://localhost:8000' }, d => {
    document.getElementById('backend-url').value = d.backendUrl;
  });
}

function saveSettings() {
  const url = document.getElementById('backend-url').value.trim();
  if (!url) { alert('Backend URL cannot be empty'); return; }

  chrome.storage.local.set({ backendUrl: url }, () => {
    const el = document.getElementById('settings-saved');
    el.removeAttribute('hidden');
    setTimeout(() => el.setAttribute('hidden', ''), 2500);
  });
}

async function testConnection() {
  const okEl  = document.getElementById('settings-ok');
  const errEl = document.getElementById('settings-error');
  okEl.setAttribute('hidden', '');
  errEl.setAttribute('hidden', '');

  const url = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    okEl.removeAttribute('hidden');
    setTimeout(() => okEl.setAttribute('hidden', ''), 3000);
  } catch (err) {
    errEl.textContent = '✗ ' + err.message;
    errEl.removeAttribute('hidden');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INIT — wire up all event listeners
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // ── Tab bar ────────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  // ── Voice tab ──────────────────────────────────────────────────────────────
  document.getElementById('voice-btn').addEventListener('click', toggleVoice);
  document.getElementById('voice-clear').addEventListener('click', () => clearMessages('voice-messages'));
  document.getElementById('mic-retry-btn').addEventListener('click', () => {
    showMicBanner(false);
    setStatusBadge('voice-status', 'idle', 'Idle');
    toggleVoice();
  });
  document.getElementById('mic-open-setup-btn').addEventListener('click', () => {
    // Open the dedicated full-tab permission page — Chrome shows the mic
    // prompt as a bold bar at the top of a full tab, which is much easier
    // to see and click than the tiny icon shown for calls from a side panel.
    const url = (typeof chrome !== 'undefined' && chrome.runtime)
      ? chrome.runtime.getURL('mic-setup.html')
      : 'mic-setup.html';
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url });
    } else {
      window.open(url);
    }
  });

  document.getElementById('mic-open-settings-btn').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
    } else {
      navigator.clipboard.writeText('chrome://settings/content/microphone')
        .then(() => alert('URL copied — paste it in Chrome\'s address bar:\nchrome://settings/content/microphone'))
        .catch(() => alert('Open a new tab and go to:\nchrome://settings/content/microphone'));
    }
  });

  // ── Study tabs ─────────────────────────────────────────────────────────────
  ['explain', 'quiz', 'viva'].forEach(mode => {
    document.getElementById(`${mode}-btn`).addEventListener('click', () => toggleStudy(mode));
    document.getElementById(`${mode}-clear`).addEventListener('click', () => {
      clearMessages(`${mode}-messages`);
      document.getElementById(`${mode}-score`).innerHTML   = '';
      document.getElementById(`${mode}-latency`).textContent = '';
    });
  });

  // ── Video QA tab ───────────────────────────────────────────────────────────
  document.getElementById('yt-process-btn').addEventListener('click', processYouTube);

  document.getElementById('yt-url').addEventListener('keydown', e => {
    if (e.key === 'Enter') processYouTube();
  });

  document.getElementById('video-upload-btn').addEventListener('click', () =>
    document.getElementById('video-file').click()
  );
  document.getElementById('video-file').addEventListener('change', e => {
    if (e.target.files.length) processVideoFile(e.target.files[0]);
  });

  document.getElementById('video-ask-btn').addEventListener('click', askVideoQuestion);
  document.getElementById('video-question').addEventListener('keydown', e => {
    if (e.key === 'Enter') askVideoQuestion();
  });

  // ── Analytics tab ──────────────────────────────────────────────────────────
  document.getElementById('analytics-refresh').addEventListener('click', loadAnalytics);
  document.getElementById('analytics-reset').addEventListener('click', resetAnalytics);

  // ── Settings tab ───────────────────────────────────────────────────────────
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('test-connection').addEventListener('click', testConnection);

  // Load settings on every startup (so URL field is pre-filled)
  loadSettings();
});
