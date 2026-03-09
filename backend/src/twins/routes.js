'use strict';
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { getDB } = require('../db');
const { broadcast } = require('../ws/server');

// ── helpers ──────────────────────────────────────────────────────────
function row2twin(r) {
  if (!r) return null;
  return {
    ...r,
    running: !!r.running,
    tags: JSON.parse(r.tags || '[]'),
  };
}

// GET /api/twins
router.get('/', (req, res) => {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM twins ORDER BY created_at DESC').all();
  res.json(rows.map(row2twin));
});

// GET /api/twins/:id
router.get('/:id', (req, res) => {
  const twin = row2twin(getDB().prepare('SELECT * FROM twins WHERE id=?').get(req.params.id));
  if (!twin) return res.status(404).json({ error: 'Twin not found' });
  res.json(twin);
});

// POST /api/twins
router.post('/', (req, res) => {
  const { name, service, upstream, version = '1.0.0', tags = [], notes = '' } = req.body;
  if (!name || !service) return res.status(400).json({ error: 'name and service required' });

  const id = uuid();
  getDB().prepare(`
    INSERT INTO twins (id, name, service, upstream, version, tags, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, service, upstream || null, version, JSON.stringify(tags), notes);

  const twin = row2twin(getDB().prepare('SELECT * FROM twins WHERE id=?').get(id));
  broadcast('twin:created', twin);
  res.status(201).json(twin);
});

// PATCH /api/twins/:id
router.patch('/:id', (req, res) => {
  const db = getDB();
  const twin = db.prepare('SELECT * FROM twins WHERE id=?').get(req.params.id);
  if (!twin) return res.status(404).json({ error: 'Not found' });

  const allowed = ['name', 'upstream', 'version', 'tags', 'notes', 'accuracy'];
  const sets = [], vals = [];
  for (const k of allowed) {
    if (k in req.body) {
      sets.push(`${k}=?`);
      vals.push(k === 'tags' ? JSON.stringify(req.body[k]) : req.body[k]);
    }
  }
  if (!sets.length) return res.json(row2twin(twin));

  sets.push("updated_at=datetime('now')");
  vals.push(req.params.id);
  db.prepare(`UPDATE twins SET ${sets.join(',')} WHERE id=?`).run(...vals);

  const updated = row2twin(db.prepare('SELECT * FROM twins WHERE id=?').get(req.params.id));
  broadcast('twin:updated', updated);
  res.json(updated);
});

// DELETE /api/twins/:id
router.delete('/:id', (req, res) => {
  const db = getDB();
  const twin = db.prepare('SELECT * FROM twins WHERE id=?').get(req.params.id);
  if (!twin) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM twins WHERE id=?').run(req.params.id);
  broadcast('twin:deleted', { id: req.params.id });
  res.json({ ok: true });
});

// POST /api/twins/:id/clone
router.post('/:id/clone', (req, res) => {
  const db = getDB();
  const src = db.prepare('SELECT * FROM twins WHERE id=?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Not found' });

  const newId = uuid();
  db.prepare(`
    INSERT INTO twins (id, name, service, upstream, version, tags, notes, accuracy, event_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(newId, src.name + '-copy', src.service, src.upstream, src.version, src.tags, src.notes, src.accuracy, 0);

  const clone = row2twin(db.prepare('SELECT * FROM twins WHERE id=?').get(newId));
  broadcast('twin:created', clone);
  res.status(201).json(clone);
});

// GET /api/twins/:id/schema  – return captured endpoint list for diff
router.get('/:id/schema', (req, res) => {
  const db = getDB();
  const twin = db.prepare('SELECT * FROM twins WHERE id=?').get(req.params.id);
  if (!twin) return res.status(404).json({ error: 'Not found' });

  const endpoints = db.prepare(`
    SELECT method, path, COUNT(*) as count,
           AVG(status) as avg_status, AVG(latency_ms) as avg_latency
    FROM events WHERE twin_id=?
    GROUP BY method, path
    ORDER BY path, method
  `).all(req.params.id);

  res.json({ twinId: req.params.id, name: twin.name, endpoints });
});

// GET /api/twins/:id/events
router.get('/:id/events', (req, res) => {
  const { limit = 200, offset = 0 } = req.query;
  const events = getDB().prepare(`
    SELECT * FROM events WHERE twin_id=? ORDER BY captured_at DESC LIMIT ? OFFSET ?
  `).all(req.params.id, parseInt(limit), parseInt(offset));

  res.json(events.map(e => ({
    ...e,
    req_headers: JSON.parse(e.req_headers || '{}'),
    req_body:    e.req_body    ? JSON.parse(e.req_body)    : null,
    res_headers: JSON.parse(e.res_headers || '{}'),
    res_body:    e.res_body    ? JSON.parse(e.res_body)    : null,
    timing:      JSON.parse(e.timing || '{}'),
  })));
});

module.exports = router;
