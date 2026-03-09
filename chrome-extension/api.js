// api.js — shared HTTP/WebSocket helpers
// Loaded as a regular script; exposes window.SpeechAPI.

const DEFAULT_BACKEND = 'http://localhost:8000';

function getBackendUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get({ backendUrl: DEFAULT_BACKEND }, d =>
      resolve(d.backendUrl.replace(/\/$/, ''))
    );
  });
}

async function apiFetch(path, options = {}) {
  const base = await getBackendUrl();
  const res = await fetch(`${base}${path}`, options);
  return res;
}

async function apiGet(path) {
  return apiFetch(path);
}

async function apiPost(path, body) {
  if (body instanceof FormData) {
    return apiFetch(path, { method: 'POST', body });
  }
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}

async function getWsBase() {
  const base = await getBackendUrl();
  // Replace http(s) → ws(s) for WebSocket connections
  return base.replace(/^http/, 'ws');
}

window.SpeechAPI = { apiGet, apiPost, apiDelete, getWsBase, getBackendUrl };
