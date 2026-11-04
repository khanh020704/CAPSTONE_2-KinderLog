// TURN servers for the PeerJS cameras (Camera.jsx, camera.html, viewer.html).
// Without TURN, viewers on another network (4G, school wifi) get stuck on "Connecting…".
//
// Setup: copy this file to ice-config.js (same folder, not committed to git), then paste
// the username / credential from https://dashboard.metered.ca → TURN Server → your credential.
window.KINDERLOG_ICE_SERVERS = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: 'PASTE_USERNAME', credential: 'PASTE_CREDENTIAL' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'PASTE_USERNAME', credential: 'PASTE_CREDENTIAL' },
  { urls: 'turn:global.relay.metered.ca:443', username: 'PASTE_USERNAME', credential: 'PASTE_CREDENTIAL' },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'PASTE_USERNAME', credential: 'PASTE_CREDENTIAL' },
]
