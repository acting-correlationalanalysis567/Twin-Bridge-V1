'use strict';
const router = require('express').Router();
const engine = require('./engine');
const { getDB } = require('../db');

// POST /api/proxy/start
router.post('/start', async (req, res) => {
  const { twinId, upstream, port } = req.body;
  if (!twinId || !upstream) return res.status(400).json({ error: 'twinId and upstream required' });

  const db = getDB();
  const twin = db.prepare('SELECT * FROM twins WHERE id=?').get(twinId);
  if (!twin) return res.status(404).json({ error: 'Twin not found' });

  // Pick port
  let proxyPort = port ? parseInt(port) : await _freePort(7890);

  try {
    const result = await engine.start({ twinId, upstream, port: proxyPort });
    res.json({ ok: true, port: result.port, sessionId: result.sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proxy/stop
router.post('/stop', async (req, res) => {
  const { twinId, port } = req.body;
  if (!twinId || !port) return res.status(400).json({ error: 'twinId and port required' });
  try {
    await engine.stop(twinId, parseInt(port));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proxy/status
router.get('/status', (req, res) => {
  const entries = [...engine.running.entries()].map(([port, v]) => ({
    port, twinId: v.twinId, upstream: v.upstream,
  }));
  res.json({ running: entries });
});

async function _freePort(start) {
  const net = require('net');
  const free = p => new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => { s.close(); resolve(true); });
    s.listen(p, '127.0.0.1');
  });
  let p = start;
  while (!(await free(p))) p++;
  return p;
}

module.exports = router;
