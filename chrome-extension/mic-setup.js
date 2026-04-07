// mic-setup.js — runs inside mic-setup.html (full extension tab)
// Calls getUserMedia here so Chrome shows the permission bar prominently at
// the top of the tab, rather than as a tiny icon in the address bar.
'use strict';

async function grantMic() {
  const btn      = document.getElementById('grant-btn');
  const statusEl = document.getElementById('status');

  btn.disabled    = true;
  btn.textContent = '⏳ Waiting for permission…';
  statusEl.setAttribute('hidden', '');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    // Immediately release the tracks — we only needed the permission grant
    stream.getTracks().forEach(t => t.stop());

    // Store a flag so the side panel can detect the grant on Retry
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ micPermissionGranted: true });
    }

    btn.textContent = '✓ Microphone Access Granted!';
    statusEl.className = 'success';
    statusEl.innerHTML =
      '<strong>✓ Done!</strong><br>' +
      'Microphone access is now allowed for the AI Speech Assistant.<br><br>' +
      'You can close this tab and click <strong>↺ Retry</strong> in the Assistant side panel.';
    statusEl.removeAttribute('hidden');
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = '🎤 Grant Microphone Access';

    statusEl.className = 'error';
    if (e.name === 'NotAllowedError') {
      statusEl.innerHTML =
        '<strong>✗ Permission was not granted.</strong><br><br>' +
        'If you clicked Block or dismissed the bar, click the <strong>🎙</strong> or <strong>🔒</strong> icon in Chrome\'s address bar and set Microphone to <em>Allow</em>, then click the button again.';
    } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
      statusEl.textContent = '✗ No microphone found. Plug in a mic or headset, then try again.';
    } else {
      statusEl.textContent = '✗ Error: ' + e.name + ' – ' + e.message;
    }
    statusEl.removeAttribute('hidden');
    console.error('[MicSetup] getUserMedia error:', e.name, e.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('grant-btn');
  if (btn) {
    btn.addEventListener('click', grantMic);
  }
});
