'use strict';
/**
 * proxy/engine.js  –  Real HTTP/HTTPS intercepting proxy.
 *
 * Creates a local http.Server per twin+port combo. All requests are
 * forwarded to the upstream, full req/res captured, then stored in SQLite
 * and broadcast over WebSocket.
 */
const http   = require('http');
const https  = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const { getDB } = require('../db');
const { broadcast } = require('../ws/server');

// Map of proxyPort → http.Server
const running = new Map();

function isRunning(port) { return running.has(port); }

async function start({ twinId, upstream, port }) {
  if (running.has(port)) throw new Error(`Port ${port} already in use`);

  const upstreamUrl  = new URL(upstream.replace(/\/$/, ''));
  const isHttps      = upstreamUrl.protocol === 'https:';
  const transport    = isHttps ? https : http;
  const sessionId    = crypto.randomUUID();

  const server = http.createServer((req, res) => {
    const start = Date.now();
    const chunks = [];

    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const reqBody = chunks.length ? Buffer.concat(chunks) : null;

      const options = {
        hostname: upstreamUrl.hostname,
        port:     upstreamUrl.port || (isHttps ? 443 : 80),
        path:     req.url,
        method:   req.method,
        headers:  { ...req.headers, host: upstreamUrl.hostname },
        rejectUnauthorized: false,
        timeout: 15000,
      };

      const proxyReq = transport.request(options, proxyRes => {
        const resChunks = [];
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.on('data', c => { resChunks.push(c); res.write(c); });
        proxyRes.on('end', () => {
          res.end();
          const latency   = Date.now() - start;
          const resBody   = resChunks.length ? Buffer.concat(resChunks) : null;
          _store({ twinId, sessionId, req, reqBody, proxyRes, resBody, latency });
        });
      });

      proxyReq.on('error', err => {
        if (!res.headersSent) {
          res.writeHead(502);
          res.end(JSON.stringify({ error: 'proxy_error', message: err.message }));
        }
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) { res.writeHead(504); res.end(); }
      });

      if (reqBody) proxyReq.write(reqBody);
      proxyReq.end();
    });
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  running.set(port, { server, twinId, sessionId, upstream });

  // Mark twin as running + store session
  const db = getDB();
  db.prepare("UPDATE twins SET running=1, proxy_port=?, updated_at=datetime('now') WHERE id=?").run(port, twinId);
  db.prepare("INSERT INTO sessions (id, twin_id, proxy_port, upstream) VALUES (?,?,?,?)").run(sessionId, twinId, port, upstream);

  broadcast('proxy:started', { twinId, port, upstream, sessionId });
  return { port, sessionId };
}

async function stop(twinId, port) {
  const entry = running.get(port);
  if (!entry) return;

  await new Promise(resolve => entry.server.close(resolve));
  running.delete(port);

  const db = getDB();
  db.prepare("UPDATE twins SET running=0, proxy_port=NULL, updated_at=datetime('now') WHERE id=?").run(twinId);
  db.prepare("UPDATE sessions SET status='stopped', stopped_at=datetime('now') WHERE id=?").run(entry.sessionId);

  broadcast('proxy:stopped', { twinId, port });
}

function _store({ twinId, sessionId, req, reqBody, proxyRes, resBody, latency }) {
  const id     = crypto.randomUUID();
  const path   = req.url || '/';
  const method = req.method;
  const status = proxyRes.statusCode;

  // Parse bodies
  const parseBody = buf => {
    if (!buf || !buf.length) return null;
    const str = buf.toString('utf8');
    try { return JSON.parse(str); } catch { return str.length > 4096 ? str.slice(0, 4096) + '…' : str; }
  };

  // Sanitize auth headers
  const sanitize = hdrs => {
    const out = { ...hdrs };
    ['authorization', 'cookie', 'set-cookie', 'x-api-key'].forEach(h => { if (out[h]) out[h] = '[REDACTED]'; });
    return out;
  };

  const reqHeaders = sanitize(req.headers || {});
  const resHeaders = sanitize(proxyRes.headers || {});
  const reqParsed  = parseBody(reqBody);
  const resParsed  = parseBody(resBody);

  // Estimated timing breakdown
  const dns      = Math.min(10, Math.floor(latency * 0.05));
  const connect  = Math.min(30, Math.floor(latency * 0.10));
  const ttfb     = Math.floor(latency * 0.70);
  const download = Math.max(0, latency - dns - connect - ttfb);
  const timing   = { dns, connect, ttfb, download, total: latency };

  const db = getDB();
  db.prepare(`
    INSERT INTO events (id, twin_id, session_id, method, path, status, latency_ms,
      req_headers, req_body, res_headers, res_body, timing)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, twinId, sessionId, method, path, status, latency,
    JSON.stringify(reqHeaders),
    reqParsed != null ? JSON.stringify(reqParsed) : null,
    JSON.stringify(resHeaders),
    resParsed != null ? JSON.stringify(resParsed) : null,
    JSON.stringify(timing),
  );

  // Update twin event_count + accuracy heuristic
  const count = db.prepare('SELECT COUNT(*) as n FROM events WHERE twin_id=?').get(twinId).n;
  const accuracy = Math.min(99, Math.round(70 + Math.min(25, count * 0.5)));
  db.prepare("UPDATE twins SET event_count=?, accuracy=?, updated_at=datetime('now') WHERE id=?").run(count, accuracy, twinId);
  db.prepare("UPDATE sessions SET event_count=event_count+1 WHERE id=?").run(sessionId);

  // Build event object for broadcast
  const event = {
    id, twin_id: twinId, session_id: sessionId,
    method, path, status, latency_ms: latency,
    req_headers: reqHeaders,
    req_body: reqParsed,
    res_headers: resHeaders,
    res_body: resParsed,
    timing,
    captured_at: new Date().toISOString(),
  };

  broadcast('capture:event', { event });
}

module.exports = { start, stop, isRunning, running };
