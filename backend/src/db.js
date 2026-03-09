'use strict';
/**
 * db.js  –  Pure-JS drop-in for better-sqlite3.
 * No native deps. Stores data as JSON at ~/.twinbridge/twinbridge.json.
 * Exposes prepare(sql).run/get/all — same interface as better-sqlite3.
 */
const path   = require('path');
const os     = require('os');
const fs     = require('fs');
const crypto = require('crypto');

const DB_DIR  = process.env.DB_DIR || path.join(os.homedir(), '.twinbridge');
const DB_PATH = path.join(DB_DIR, 'twinbridge.json');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let store = { twins: [], events: [], replay_runs: [], replay_results: [], sessions: [] };

function _load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      store = { ...store, ...data };
      store.twins = store.twins.map(t => ({ ...t, running: 0, proxy_port: null }));
    }
  } catch {}
}

let _saveTimer = null;
function _scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2)); } catch {}
  }, 300);
}

function _col(table) {
  return { twins:'twins', events:'events', replay_runs:'replay_runs', replay_results:'replay_results', sessions:'sessions' }[table] || table;
}

function _now() { return new Date().toISOString(); }

/* ── Parse INSERT columns from "INSERT INTO tbl (a,b,c) VALUES (?,?,?)" */
function _insertCols(sql) {
  const m = sql.match(/INSERT INTO\s+\w+\s*\(([^)]+)\)/i);
  return m ? m[1].split(',').map(c => c.trim()) : [];
}

/* ── Parse SET fields from "UPDATE tbl SET a=?, b=datetime('now') WHERE ..." */
function _parseSET(sql, params) {
  const m = sql.match(/SET\s+(.+?)\s+WHERE/i);
  if (!m) return {};
  const patch = {};
  let pi = 0;
  // Count ?'s in everything before SET to offset
  const beforeSet = sql.substring(0, sql.search(/\bSET\b/i));
  pi = (beforeSet.match(/\?/g) || []).length;
  for (const clause of m[1].split(',')) {
    const col = clause.match(/(\w+)\s*=/)?.[1];
    if (!col) continue;
    if (/\?/.test(clause)) { patch[col] = params[pi++]; }
    else if (/datetime\('now'\)/i.test(clause)) { patch[col] = _now(); }
    else {
      // Static string value like status='done'
      const valM = clause.match(/=\s*'([^']*)'/);
      if (valM) patch[col] = valM[1];
    }
  }
  return patch;
}

/* ── Build WHERE predicate; returns [fn, paramsConsumedBefore] */
function _buildWhere(sql, params) {
  const m = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+GROUP\s+BY|$)/i);
  if (!m) return () => true;
  const clause = m[1].trim();
  // Count ?'s before WHERE
  const beforeWhere = sql.substring(0, sql.search(/\bWHERE\b/i));
  let pi = (beforeWhere.match(/\?/g) || []).length;
  const conds = clause.split(/\s+AND\s+/i).map(c => {
    const colM = c.match(/(?:\w+\.)?([\w]+)\s*=\s*\?/i);  // strip table alias
    if (colM) {
      const col = colM[1], val = params[pi++];
      return row => String(row[col] ?? '') === String(val ?? '');
    }
    return () => true;
  });
  return row => conds.every(fn => fn(row));
}

/* ── Apply ORDER BY and LIMIT/OFFSET ── */
function _sortLimit(rows, sql, params) {
  const orderM = sql.match(/ORDER BY\s+([\w.]+)(?:\s+(ASC|DESC))?/i);
  if (orderM) {
    const col = orderM[1].split('.').pop(), desc = orderM[2]?.toUpperCase() === 'DESC';
    rows = [...rows].sort((a, b) => {
      const av = a[col], bv = b[col];
      const c = av < bv ? -1 : av > bv ? 1 : 0;
      return desc ? -c : c;
    });
  }
  // Find limit/offset ? indices (always last params)
  const allQ   = (sql.match(/\?/g) || []).length;
  const hasLim = /LIMIT\s+\?/i.test(sql);
  const hasOff = /OFFSET\s+\?/i.test(sql);
  const numLim = sql.match(/LIMIT\s+(\d+)/i);
  if (hasOff) { const off = parseInt(params[allQ-2])||0; rows = rows.slice(off); }
  if (hasLim) { const lim = parseInt(params[allQ-1])||500; rows = rows.slice(0, lim); }
  else if (numLim) { rows = rows.slice(0, parseInt(numLim[1])); }
  return rows;
}

/* ── Statement factory ─────────────────────────────────────────────── */
function _stmt(sql) {
  const norm = sql.replace(/\s+/g, ' ').trim();

  function run(...args) {
    const p = args.flat();
    if (/^INSERT INTO/i.test(norm)) {
      const tableM = norm.match(/INSERT INTO\s+(\w+)/i);
      const table  = tableM?.[1]; if (!table) return { changes:0 };
      const cols   = _insertCols(norm);
      const obj    = {};
      cols.forEach((c, i) => { obj[c] = p[i] !== undefined ? p[i] : null; });
      if (!obj.id) obj.id = crypto.randomUUID();
      if (!obj.created_at) obj.created_at = _now();
      if (!obj.updated_at) obj.updated_at = _now();
      if (table === 'twins') { if (obj.running === undefined) obj.running = 0; if (!obj.event_count) obj.event_count = 0; if (!obj.accuracy) obj.accuracy = 0; }
      store[_col(table)].push(obj);
      _scheduleSave();
      return { lastInsertRowid: obj.id, changes: 1 };
    }
    if (/^UPDATE/i.test(norm)) {
      const tableM = norm.match(/UPDATE\s+(\w+)/i);
      const table  = tableM?.[1]; if (!table) return { changes:0 };
      const patch  = _parseSET(norm, p);
      patch.updated_at = _now();
      const pred   = _buildWhere(norm, p);
      let changes  = 0;
      store[_col(table)] = store[_col(table)].map(r => { if (pred(r)) { changes++; return { ...r, ...patch }; } return r; });
      _scheduleSave();
      return { changes };
    }
    if (/^DELETE FROM/i.test(norm)) {
      const tableM = norm.match(/DELETE FROM\s+(\w+)/i);
      const table  = tableM?.[1]; if (!table) return { changes:0 };
      const pred   = _buildWhere(norm, p);
      const before = store[_col(table)].length;
      // Cascade delete for twins
      if (table === 'twins') {
        const twinIds = store.twins.filter(pred).map(t => t.id);
        store.events         = store.events.filter(e => !twinIds.includes(e.twin_id));
        store.replay_runs    = store.replay_runs.filter(r => !twinIds.includes(r.twin_id));
        store.replay_results = store.replay_results.filter(r => {
          const runIds = store.replay_runs.filter(rr => twinIds.includes(rr.twin_id)).map(rr => rr.id);
          return !runIds.includes(r.run_id);
        });
      }
      store[_col(table)] = store[_col(table)].filter(r => !pred(r));
      _scheduleSave();
      return { changes: before - store[_col(table)].length };
    }
    return { changes: 0 };
  }

  function all(...args) {
    const p = args.flat();
    if (!/^SELECT/i.test(norm)) return [];
    const fromM = norm.match(/FROM\s+(\w+)/i);
    if (!fromM) {
      // Scalar SELECT (health check etc.)
      return [{}];
    }
    const table = fromM[1];
    let rows = [...(store[_col(table)] || [])];

    // JOIN support (replay_runs JOIN twins)
    const joinM = norm.match(/JOIN\s+(\w+)\s+(\w+)?\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
    if (joinM) {
      const joinTable = joinM[1];
      const joinRows  = store[_col(joinTable)] || [];
      const [,,, t1, c1, t2, c2] = joinM;
      rows = rows.map(row => {
        const rel = joinRows.find(r => r[c2] === row[c1] || r[c1] === row[c2] || r.id === row.twin_id);
        return rel ? { ...row, twin_name: rel.name } : row;
      });
    }

    // WHERE
    const pred = _buildWhere(norm, p);
    rows = rows.filter(pred);

    // COUNT(*)
    const countM = norm.match(/SELECT\s+COUNT\(\*\)\s+as\s+(\w+)/i);
    if (countM) return [{ [countM[1]]: rows.length }];

    // AVG / GROUP BY (used by schema endpoint)
    if (/GROUP BY/i.test(norm)) {
      const groups = {};
      for (const row of rows) {
        const key = `${row.method}||${row.path}`;
        if (!groups[key]) groups[key] = { method: row.method, path: row.path, count: 0, statuses: [], latencies: [] };
        groups[key].count++;
        groups[key].statuses.push(Number(row.status));
        groups[key].latencies.push(Number(row.latency_ms));
      }
      return Object.values(groups).map(g => ({
        method: g.method, path: g.path, count: g.count,
        avg_status:  g.statuses.reduce((a,b)=>a+b,0) / g.statuses.length,
        avg_latency: g.latencies.reduce((a,b)=>a+b,0) / g.latencies.length,
      }));
    }

    return _sortLimit(rows, norm, p);
  }

  function get(...args) { return all(...args)[0] ?? null; }

  return { run, get, all };
}

/* ── Public API ─────────────────────────────────────────────────────── */
const dbProxy = {
  prepare:     (sql) => _stmt(sql),
  pragma:      ()    => {},
  exec:        ()    => {},
  transaction: (fn)  => (...args) => fn(...args),
};

let initialized = false;
function getDB() {
  if (!initialized) throw new Error('DB not initialized');
  return dbProxy;
}

async function initDB() {
  _load();
  initialized = true;
  console.log(`\x1b[32m✓ DB ready at ${DB_PATH}\x1b[0m`);
  return dbProxy;
}


// Additional exports for modules that need direct store access
function getStore() { return store; }
function scheduleSave() { _scheduleSave(); }

module.exports = { getDB, initDB, DB_PATH, getStore, scheduleSave };
