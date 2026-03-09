'use strict';
const router  = require('express').Router();
const http    = require('http');
const https   = require('https');
const { URL } = require('url');
const crypto  = require('crypto');
const { getDB } = require('../db');
const { broadcast } = require('../ws/server');

// GET /api/replay/runs
router.get('/runs', (req, res) => {
  const { twinId } = req.query;
  const db = getDB();
  let rows;
  if (twinId) {
    rows = db.prepare(`
      SELECT r.*, t.name as twin_name FROM replay_runs r
      JOIN twins t ON t.id=r.twin_id WHERE r.twin_id=? ORDER BY r.created_at DESC
    `).all(twinId);
  } else {
    rows = db.prepare(`
      SELECT r.*, t.name as twin_name FROM replay_runs r
      JOIN twins t ON t.id=r.twin_id ORDER BY r.created_at DESC LIMIT 50
    `).all();
  }
  res.json(rows);
});

// GET /api/replay/runs/:runId/results
router.get('/runs/:runId/results', (req, res) => {
  const results = getDB().prepare('SELECT * FROM replay_results WHERE run_id=? ORDER BY rowid').all(req.params.runId);
  res.json(results.map(r => ({
    ...r,
    twin_body:  r.twin_body  ? JSON.parse(r.twin_body)  : null,
    real_body:  r.real_body  ? JSON.parse(r.real_body)  : null,
    diff_patch: r.diff_patch ? JSON.parse(r.diff_patch) : [],
    match:      !!r.match,
  })));
});

// POST /api/replay/start  { twinId, compareReal, name }
router.post('/start', async (req, res) => {
  const { twinId, compareReal = false, name = '' } = req.body;
  if (!twinId) return res.status(400).json({ error: 'twinId required' });

  const db = getDB();
  const twin = db.prepare('SELECT * FROM twins WHERE id=?').get(twinId);
  if (!twin) return res.status(404).json({ error: 'Twin not found' });
  if (!twin.running || !twin.proxy_port) return res.status(400).json({ error: 'Twin is not running. Start a capture session first.' });

  // Load events to replay
  const events = db.prepare('SELECT * FROM events WHERE twin_id=? ORDER BY captured_at ASC').all(twinId);
  if (!events.length) return res.status(400).json({ error: 'No captured events to replay' });

  const runId = crypto.randomUUID();
  db.prepare(`INSERT INTO replay_runs (id, twin_id, name, status, total) VALUES (?,?,?,'running',?)`)
    .run(runId, twinId, name, events.length);

  broadcast('replay:started', { runId, total: events.length, twinId });
  res.json({ runId, total: events.length });

  // Run asynchronously
  _runReplay({ runId, twin, events, compareReal, db }).catch(err => {
    console.error('Replay error:', err);
    db.prepare("UPDATE replay_runs SET status='error', finished_at=datetime('now') WHERE id=?").run(runId);
  });
});

async function _runReplay({ runId, twin, events, compareReal, db }) {
  let passed = 0, failed = 0;

  for (const ev of events) {
    const reqBody = ev.req_body ? JSON.parse(ev.req_body) : null;

    // Hit the twin mock server
    let twinStatus = null, twinLatency = null, twinBody = null;
    try {
      const r = await _request({
        url: `http://127.0.0.1:${twin.proxy_port}${ev.path}`,
        method: ev.method,
        body: reqBody,
      });
      twinStatus  = r.status;
      twinLatency = r.latency;
      twinBody    = r.body;
    } catch (err) {
      twinBody = { error: err.message };
    }

    // Optionally hit the real upstream
    let realStatus = null, realLatency = null, realBody = null;
    if (compareReal && twin.upstream) {
      try {
        const r = await _request({
          url: `${twin.upstream}${ev.path}`,
          method: ev.method,
          body: reqBody,
        });
        realStatus  = r.status;
        realLatency = r.latency;
        realBody    = r.body;
      } catch (err) {
        realBody = { error: err.message };
      }
    }

    // Diff
    const diffPatch = _diff(twinBody, realBody || JSON.parse(ev.res_body || 'null'));
    const expectedStatus = JSON.parse(ev.res_body || 'null') !== null ? ev.status : 200;
    const match = twinStatus === expectedStatus && diffPatch.length === 0;

    if (match) passed++; else failed++;

    const resultId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO replay_results (id, run_id, method, path,
        twin_status, real_status, twin_latency, real_latency,
        twin_body, real_body, diff_patch, match)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      resultId, runId, ev.method, ev.path,
      twinStatus, realStatus, twinLatency, realLatency,
      JSON.stringify(twinBody), JSON.stringify(realBody),
      JSON.stringify(diffPatch), match ? 1 : 0,
    );

    db.prepare('UPDATE replay_runs SET passed=?, failed=? WHERE id=?').run(passed, failed, runId);

    broadcast('replay:result', {
      runId, resultId,
      method: ev.method, path: ev.path,
      twinStatus, realStatus, twinLatency, realLatency,
      twinBody, realBody, diffPatch, match,
    });
  }

  db.prepare("UPDATE replay_runs SET status='done', finished_at=datetime('now'), passed=?, failed=? WHERE id=?")
    .run(passed, failed, runId);
  broadcast('replay:complete', { runId, passed, failed, total: events.length });
}

function _diff(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [];
  const diffs = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!(k in b)) diffs.push({ op: 'remove', path: k });
    else if (!(k in a)) diffs.push({ op: 'add', path: k, value: b[k] });
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      diffs.push({ op: 'replace', path: k, from: a[k], value: b[k] });
    }
  }
  return diffs;
}

async function _request({ url, method, body }) {
  return new Promise((resolve, reject) => {
    const parsed    = new URL(url);
    const isHttps   = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const payload   = body ? JSON.stringify(body) : null;
    const start     = Date.now();

    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      rejectUnauthorized: false,
      timeout: 10000,
    };

    const req = transport.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const latency = Date.now() - start;
        const raw = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
        let body;
        try { body = JSON.parse(raw); } catch { body = raw || null; }
        resolve({ status: res.statusCode, latency, body });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = router;

// ─────────────────────────────────────────────────────────────────────
// PRODUCTION TRAFFIC REPLAY
//
// POST /api/replay/shadow/start  { twinId, upstreamUrl, durationMs }
//   Start a "shadow mode" session: spin up a local HTTP server that
//   accepts real traffic, forwards it to upstream, and simultaneously
//   replays each request against the twin for comparison.
//
// POST /api/replay/shadow/stop   { sessionId }
// GET  /api/replay/shadow/:sessionId/results
// ─────────────────────────────────────────────────────────────────────
const net = require('net');
const shadowSessions = new Map();  // sessionId → { server, results[], twinId }

router.post('/shadow/start', async (req, res) => {
  const { twinId, durationMs = 300000 } = req.body;
  if (!twinId) return res.status(400).json({ error: 'twinId required' });

  const db   = getDB();
  const twin = db.prepare('SELECT * FROM twins WHERE id=?').get(twinId);
  if (!twin) return res.status(404).json({ error: 'Twin not found' });
  if (!twin.running || !twin.proxy_port) {
    return res.status(400).json({ error: 'Twin must be running (start a capture session first)' });
  }

  const sessionId = crypto.randomUUID();
  const results   = [];

  // Create a shadow HTTP server that mirrors traffic → upstream + twin
  const server = http.createServer(async (sreq, sres) => {
    const chunks = [];
    sreq.on('data', c => chunks.push(c));
    sreq.on('end', async () => {
      const body = chunks.length ? Buffer.concat(chunks) : null;
      const method = sreq.method;
      const urlPath = sreq.url;
      const start = Date.now();

      // Forward to upstream
      let upstreamStatus = null, upstreamBody = null, upstreamLatency = null;
      if (twin.upstream) {
        try {
          const r = await _request({ url: `${twin.upstream}${urlPath}`, method, body: body ? JSON.parse(body) : null });
          upstreamStatus  = r.status;
          upstreamBody    = r.body;
          upstreamLatency = r.latency;
          // Proxy the real response back to the caller
          sres.writeHead(r.status, { 'content-type': 'application/json' });
          sres.end(JSON.stringify(r.body));
        } catch (e) {
          sres.writeHead(502); sres.end(JSON.stringify({ error: e.message }));
        }
      } else {
        sres.writeHead(200); sres.end('{}');
      }

      // Simultaneously replay against twin
      let twinStatus = null, twinBody = null, twinLatency = null;
      try {
        const r = await _request({ url: `http://127.0.0.1:${twin.proxy_port}${urlPath}`, method, body: body ? JSON.parse(body) : null });
        twinStatus  = r.status;
        twinBody    = r.body;
        twinLatency = r.latency;
      } catch {}

      const result = {
        id:              crypto.randomUUID(),
        method, path: urlPath,
        upstreamStatus, upstreamLatency, upstreamBody,
        twinStatus,     twinLatency,     twinBody,
        diffPatch:       _diff(twinBody, upstreamBody),
        match:           twinStatus === upstreamStatus,
        ts:              new Date().toISOString(),
      };
      results.push(result);
      broadcast('shadow:result', { sessionId, result });
    });
  });

  // Find a free port
  const port = await _freePort(8100);
  server.listen(port, '127.0.0.1');

  shadowSessions.set(sessionId, { server, results, twinId, port, startedAt: new Date().toISOString() });

  // Auto-stop after durationMs
  setTimeout(() => {
    if (shadowSessions.has(sessionId)) {
      server.close();
      broadcast('shadow:stopped', { sessionId });
      // Keep results in memory for retrieval, remove server ref
      shadowSessions.set(sessionId, { results, twinId, port: null, stopped: true });
    }
  }, durationMs);

  broadcast('shadow:started', { sessionId, twinId, port, twinPort: twin.proxy_port });
  res.json({ sessionId, port, twinPort: twin.proxy_port, durationMs,
    instructions: `Point your HTTP client/load balancer at http://127.0.0.1:${port} — traffic will be mirrored to your twin automatically.` });
});

router.post('/shadow/stop', (req, res) => {
  const { sessionId } = req.body;
  const session = shadowSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Shadow session not found' });
  if (session.server) session.server.close();
  broadcast('shadow:stopped', { sessionId });
  shadowSessions.set(sessionId, { ...session, server: null, stopped: true });
  res.json({ ok: true, results: session.results.length });
});

router.get('/shadow/:sessionId/results', (req, res) => {
  const session = shadowSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    sessionId: req.params.sessionId,
    twinId:    session.twinId,
    count:     session.results.length,
    stopped:   session.stopped || false,
    results:   session.results,
  });
});

router.get('/shadow', (_req, res) => {
  const active = [...shadowSessions.entries()].map(([id, s]) => ({
    sessionId: id, twinId: s.twinId, port: s.port,
    results: s.results.length, stopped: s.stopped || false,
    startedAt: s.startedAt,
  }));
  res.json(active);
});

async function _freePort(start) {
  for (let p = start; p < start + 100; p++) {
    const free = await new Promise(r => {
      const s = net.createServer();
      s.once('error', () => r(false));
      s.once('listening', () => { s.close(); r(true); });
      s.listen(p, '127.0.0.1');
    });
    if (free) return p;
  }
  throw new Error('No free port found');
}
