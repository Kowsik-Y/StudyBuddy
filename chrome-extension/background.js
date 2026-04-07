// background.js — service worker
// Opens the side panel whenever the user clicks the extension toolbar icon.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
