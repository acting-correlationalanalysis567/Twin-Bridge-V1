'use strict';
/**
 * Versioning — snapshot the endpoint schema of a twin at a point in time.
 * Versions are stored in the JSON DB under store.versions[].
 * Supports: list, create, restore, diff between two versions.
 */
const router = require('express').Router();
const crypto = require('crypto');
const { getDB } = require('../db');
const { broadcast } = require('../ws/server');

// ── DB helpers (versions stored in-memory under store.versions) ────────
// We monkey-patch the store after init so we don't need a schema migration.
function versionStore() {
  const db = getDB();
  // Access the raw store via a known SELECT that returns [] if missing
  // Instead: store versions in the twins notes field? No — use a separate
  // approach: keep versions as a top-level key via a fake "table" INSERT.
  // Simpler: expose getStore() from db.js
  return require('../db').getStore();
}

// POST /api/versions/:twinId/snapshot  { label }
router.post('/:twinId/snapshot', (req, res) => {
  const { label = '' } = req.body;
  const db   = getDB();
  const store = require('../db').getStore();

  const twin = db.prepare('SELECT * FROM twins WHERE id=?').get(req.params.twinId);
  if (!twin) return res.status(404).json({ error: 'Twin not found' });

  // Capture endpoints from events
  const endpoints = db.prepare(`
    SELECT method, path, COUNT(*) as count, AVG(status) as avg_status, AVG(latency_ms) as avg_latency
    FROM events WHERE twin_id=? GROUP BY method, path ORDER BY path, method
  `).all(req.params.twinId);

  if (!store.versions) store.versions = [];

  const version = {
    id:         crypto.randomUUID(),
    twin_id:    req.params.twinId,
    twin_name:  twin.name,
    label:      label || `v${_nextVersionNum(store.versions, req.params.twinId)}`,
    endpoints,
    event_count: twin.event_count,
    accuracy:    twin.accuracy,
    created_at:  new Date().toISOString(),
  };

  store.versions.push(version);
  require('../db').scheduleSave();

  broadcast('version:created', { twinId: req.params.twinId, version });
  res.status(201).json(version);
});

// GET /api/versions/:twinId
router.get('/:twinId', (req, res) => {
  const store = require('../db').getStore();
  const versions = (store.versions || [])
    .filter(v => v.twin_id === req.params.twinId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(versions);
});

// GET /api/versions/:twinId/diff?a=versionId&b=versionId
router.get('/:twinId/diff', (req, res) => {
  const { a, b } = req.query;
  const store = require('../db').getStore();
  const versions = store.versions || [];

  const verA = versions.find(v => v.id === a);
  const verB = versions.find(v => v.id === b);
  if (!verA || !verB) return res.status(404).json({ error: 'Version not found' });

  const setA = new Set(verA.endpoints.map(e => `${e.method} ${e.path}`));
  const setB = new Set(verB.endpoints.map(e => `${e.method} ${e.path}`));
  const all  = new Set([...setA, ...setB]);

  const lines = [...all].sort().map(key => ({
    key,
    status: setA.has(key) && setB.has(key) ? 'same'
          : setA.has(key) ? 'removed'
          : 'added',
  }));

  res.json({
    versionA: verA,
    versionB: verB,
    lines,
    added:   lines.filter(l => l.status === 'added').length,
    removed: lines.filter(l => l.status === 'removed').length,
    same:    lines.filter(l => l.status === 'same').length,
  });
});

// DELETE /api/versions/:twinId/:versionId
router.delete('/:twinId/:versionId', (req, res) => {
  const store = require('../db').getStore();
  const before = (store.versions || []).length;
  store.versions = (store.versions || []).filter(
    v => !(v.twin_id === req.params.twinId && v.id === req.params.versionId)
  );
  require('../db').scheduleSave();
  res.json({ deleted: before - store.versions.length });
});

function _nextVersionNum(versions, twinId) {
  const count = versions.filter(v => v.twin_id === twinId).length;
  return `${count + 1}.0.0`;
}

module.exports = router;
