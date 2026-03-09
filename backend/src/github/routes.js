'use strict';
/**
 * GitHub Integration
 *
 * POST /api/github/push    — export twin OpenAPI spec → GitHub file (create/update)
 * POST /api/github/pull    — import OpenAPI spec from GitHub file → local twin
 * GET  /api/github/repos   — list user repos (needs token)
 * GET  /api/github/status  — check token validity
 * POST /api/github/settings — save token + default repo
 */
const router = require('express').Router();
const https  = require('https');
const crypto = require('crypto');
const { getDB } = require('../db');
const { broadcast } = require('../ws/server');

const GH_API = 'api.github.com';

function ghRequest({ method, path, token, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: GH_API,
      path,
      method: method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'TwinBridge/1.0',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        if (res.statusCode >= 400) reject(Object.assign(new Error(data.message || `GitHub ${res.statusCode}`), { status: res.statusCode, data }));
        else resolve(data);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// GET /api/github/status
router.get('/status', async (req, res) => {
  const store = require('../db').getStore();
  const token = store.github?.token;
  if (!token) return res.json({ connected: false });
  try {
    const user = await ghRequest({ path: '/user', token });
    res.json({ connected: true, user: { login: user.login, name: user.name, avatar: user.avatar_url } });
  } catch {
    res.json({ connected: false, error: 'Invalid or expired token' });
  }
});

// POST /api/github/settings  { token, defaultRepo, defaultBranch }
router.post('/settings', (req, res) => {
  const { token, defaultRepo, defaultBranch = 'main' } = req.body;
  const store = require('../db').getStore();
  store.github = { ...store.github, token, defaultRepo, defaultBranch };
  require('../db').scheduleSave();
  res.json({ ok: true });
});

// GET /api/github/settings
router.get('/settings', (req, res) => {
  const store = require('../db').getStore();
  const gh = store.github || {};
  res.json({ defaultRepo: gh.defaultRepo || '', defaultBranch: gh.defaultBranch || 'main', hasToken: !!gh.token });
});

// GET /api/github/repos
router.get('/repos', async (req, res) => {
  const store = require('../db').getStore();
  const token = store.github?.token;
  if (!token) return res.status(401).json({ error: 'No GitHub token configured' });
  try {
    const repos = await ghRequest({ path: '/user/repos?per_page=50&sort=updated&type=all', token });
    res.json(repos.map(r => ({
      full_name: r.full_name, name: r.name, private: r.private,
      description: r.description, default_branch: r.default_branch,
      updated_at: r.updated_at,
    })));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/github/push  { twinId, repo, branch, path, message }
router.post('/push', async (req, res) => {
  const { twinId, repo, branch = 'main', filePath = null, message = '' } = req.body;
  const store = require('../db').getStore();
  const token = store.github?.token;
  if (!token) return res.status(401).json({ error: 'No GitHub token configured' });

  const db   = getDB();
  const twin = db.prepare('SELECT * FROM twins WHERE id=?').get(twinId);
  if (!twin) return res.status(404).json({ error: 'Twin not found' });

  // Build OpenAPI spec from captured events
  const events = db.prepare('SELECT * FROM events WHERE twin_id=? ORDER BY captured_at ASC LIMIT 1000').all(twinId);
  const spec   = _buildOpenAPI(events, twin);
  const content = Buffer.from(JSON.stringify(spec, null, 2)).toString('base64');
  const targetPath = filePath || `twins/${twin.name}/openapi.json`;
  const commitMsg  = message || `Update ${twin.name} twin schema (${events.length} events)`;

  try {
    // Check if file exists to get its SHA (needed for update)
    let sha;
    try {
      const existing = await ghRequest({ path: `/repos/${repo}/contents/${targetPath}?ref=${branch}`, token });
      sha = existing.sha;
    } catch {}

    const body = { message: commitMsg, content, branch };
    if (sha) body.sha = sha;

    const result = await ghRequest({
      method: 'PUT',
      path:   `/repos/${repo}/contents/${targetPath}`,
      token,  body,
    });

    broadcast('github:pushed', { twinId, repo, path: targetPath, sha: result.content?.sha });
    res.json({
      ok: true, repo, path: targetPath, branch,
      url: result.content?.html_url,
      sha: result.content?.sha,
      action: sha ? 'updated' : 'created',
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/github/pull  { repo, branch, filePath, twinName }
router.post('/pull', async (req, res) => {
  const { repo, branch = 'main', filePath, twinName } = req.body;
  const store = require('../db').getStore();
  const token = store.github?.token;
  if (!token) return res.status(401).json({ error: 'No GitHub token configured' });
  if (!filePath) return res.status(400).json({ error: 'filePath required' });

  try {
    const file = await ghRequest({ path: `/repos/${repo}/contents/${filePath}?ref=${branch}`, token });
    const spec  = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));

    // Extract endpoints from OpenAPI paths
    const endpoints = [];
    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, op] of Object.entries(methods)) {
        if (['get','post','put','patch','delete','head','options'].includes(method)) {
          const statuses = Object.keys(op.responses || { 200: {} }).map(Number);
          endpoints.push({ method: method.toUpperCase(), path, avg_status: statuses[0] || 200, avg_latency: 50, count: 1 });
        }
      }
    }

    const name    = twinName || spec.info?.title?.toLowerCase().replace(/\s+/g, '-') || 'imported-twin';
    const upstream = spec.servers?.[0]?.url || '';
    const db      = getDB();

    // Check for existing twin
    const existing = db.prepare('SELECT id FROM twins WHERE name=?').get(name);
    if (existing) return res.status(409).json({ error: `Twin "${name}" already exists` });

    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO twins (id, name, service, upstream, version, tags, notes)
      VALUES (?,?,?,?,?,?,?)`).run(
      id, name, spec.info?.title || name, upstream,
      spec.info?.version || '1.0.0',
      JSON.stringify(['github']),
      `Imported from ${repo}/${filePath} on ${branch}`,
    );

    const twin = { ...db.prepare('SELECT * FROM twins WHERE id=?').get(id), tags: ['github'], running: false };
    broadcast('twin:created', twin);

    res.json({ ok: true, twin, endpoints: endpoints.length, source: `${repo}/${filePath}@${branch}` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/github/tree?repo=&branch=  — list .json / .yaml files for picker
router.get('/tree', async (req, res) => {
  const { repo, branch = 'main' } = req.query;
  const store = require('../db').getStore();
  const token = store.github?.token;
  if (!token) return res.status(401).json({ error: 'No GitHub token configured' });
  if (!repo)  return res.status(400).json({ error: 'repo required' });

  try {
    const tree = await ghRequest({ path: `/repos/${repo}/git/trees/${branch}?recursive=1`, token });
    const files = (tree.tree || [])
      .filter(f => f.type === 'blob' && /\.(json|yaml|yml)$/i.test(f.path))
      .map(f => ({ path: f.path, sha: f.sha, size: f.size }))
      .slice(0, 200);
    res.json(files);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

function _buildOpenAPI(events, twin) {
  const paths = {};
  for (const ev of events) {
    const pathStr = (ev.path || '/').split('?')[0].replace(/\/[0-9a-f-]{20,}|\b\d{4,}\b/g, '/{id}');
    const method  = (ev.method || 'GET').toLowerCase();
    if (!paths[pathStr]) paths[pathStr] = {};
    if (!paths[pathStr][method]) {
      paths[pathStr][method] = { summary: `${method.toUpperCase()} ${pathStr}`, responses: {} };
    }
    const status = String(ev.status || 200);
    if (!paths[pathStr][method].responses[status]) {
      let body = null;
      try { body = typeof ev.res_body === 'string' ? JSON.parse(ev.res_body) : ev.res_body; } catch {}
      paths[pathStr][method].responses[status] = {
        description: ev.status < 400 ? 'Success' : 'Error',
        ...(body ? { content: { 'application/json': { schema: _schema(body) } } } : {}),
      };
    }
  }
  return {
    openapi: '3.0.0',
    info: { title: twin.name, version: twin.version || '1.0.0', description: `TwinBridge export — ${events.length} captured events` },
    servers: twin.upstream ? [{ url: twin.upstream }] : [],
    paths,
  };
}

function _schema(val, d = 0) {
  if (d > 3 || val == null) return {};
  if (typeof val === 'boolean') return { type: 'boolean', example: val };
  if (typeof val === 'number')  return { type: 'number',  example: val };
  if (typeof val === 'string')  return { type: 'string',  example: val };
  if (Array.isArray(val))       return { type: 'array', items: val[0] ? _schema(val[0], d+1) : {} };
  if (typeof val === 'object') {
    const props = {};
    for (const [k, v] of Object.entries(val)) props[k] = _schema(v, d+1);
    return { type: 'object', properties: props };
  }
  return {};
}

module.exports = router;
