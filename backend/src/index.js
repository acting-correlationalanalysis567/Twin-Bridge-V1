require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const { initDB } = require('./db');
const { createWsServer } = require('./ws/server');
const captureRoutes  = require('./capture/routes');
const twinsRoutes    = require('./twins/routes');
const proxyRoutes    = require('./proxy/routes');
const replayRoutes   = require('./replay/routes');
const registryRoutes = require('./registry/routes');
const versionsRoutes = require('./versions/routes');
const githubRoutes   = require('./github/routes');

const app  = express();
const PORT = process.env.BACKEND_PORT || 7891;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) console.log(`\x1b[36m${req.method}\x1b[0m ${req.path}`);
  next();
});

app.use('/api/capture',  captureRoutes);
app.use('/api/twins',    twinsRoutes);
app.use('/api/proxy',    proxyRoutes);
app.use('/api/replay',   replayRoutes);
app.use('/api/registry', registryRoutes);
app.use('/api/versions', versionsRoutes);
app.use('/api/github',   githubRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.0.0', ts: Date.now() }));
app.use('/api/*', (_req, res) => res.status(404).json({ error: 'Not found' }));

async function start() {
  await initDB();
  const server = http.createServer(app);
  createWsServer(server);
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\x1b[32m✓ TwinBridge backend on http://127.0.0.1:${PORT}\x1b[0m`);
  });
}
start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
