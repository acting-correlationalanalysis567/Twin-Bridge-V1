const { WebSocketServer } = require('ws');
let wss;
const clients = new Set();

function createWsServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }));
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
  return wss;
}

function broadcast(type, data) {
  if (!wss || clients.size === 0) return;
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  for (const ws of clients) { if (ws.readyState === 1) ws.send(msg); }
}

module.exports = { createWsServer, broadcast };
