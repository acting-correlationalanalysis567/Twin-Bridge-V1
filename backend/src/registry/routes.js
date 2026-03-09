'use strict';
/**
 * Registry — curated + local package registry for API twins.
 *
 * Package format: .twinpkg (JSON)
 * {
 *   name, service, category, upstream, version, description,
 *   endpoints: [{ method, path, example_status, example_latency_ms }],
 *   schemas:   { "METHOD /path": { request?: {...}, response?: {...} } },
 *   metadata:  { author, license, tags[] }
 * }
 *
 * Routes:
 *   GET  /api/registry                — list all (curated + installed local)
 *   GET  /api/registry/categories     — distinct categories
 *   GET  /api/registry/:name          — package detail
 *   POST /api/registry/pull           — pull from curated catalog → create twin
 *   POST /api/registry/install        — install a .twinpkg JSON → local cache
 *   DELETE /api/registry/cache/:name  — remove from local cache
 *   GET  /api/registry/cache          — list locally cached packages
 *   GET  /api/registry/export/:twinId — export twin as .twinpkg
 */
const router  = require('express').Router();
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { getDB } = require('../db');
const { broadcast } = require('../ws/server');

// ── Local package cache dir ────────────────────────────────────────────
const CACHE_DIR = path.join(os.homedir(), '.twinbridge', 'packages');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function cacheList() {
  return fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith('.twinpkg'))
    .map(f => {
      try {
        const pkg  = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
        const stat = fs.statSync(path.join(CACHE_DIR, f));
        return { ...pkg, _cached: true, _cachedAt: stat.mtime.toISOString(), _file: f };
      } catch { return null; }
    })
    .filter(Boolean);
}

function cacheGet(name) {
  const f = path.join(CACHE_DIR, `${name}.twinpkg`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function cacheWrite(pkg) {
  fs.writeFileSync(path.join(CACHE_DIR, `${pkg.name}.twinpkg`), JSON.stringify(pkg, null, 2));
}

// ── Curated catalog ────────────────────────────────────────────────────
const CATALOG = [
  {
    name: 'stripe-v2', service: 'Stripe', category: 'payments',
    upstream: 'https://api.stripe.com', version: '2.0.1',
    description: 'Full Stripe API — charges, customers, subscriptions, webhooks',
    metadata: { author: 'TwinBridge', license: 'MIT', tags: ['payments', 'billing', 'saas'] },
  },
  {
    name: 'github-rest-v3', service: 'GitHub', category: 'devtools',
    upstream: 'https://api.github.com', version: '3.1.0',
    description: 'GitHub REST API v3 — repos, issues, PRs, Actions',
    metadata: { author: 'TwinBridge', license: 'MIT', tags: ['vcs', 'devtools', 'ci'] },
  },
  {
    name: 'hubspot-crm', service: 'HubSpot', category: 'crm',
    upstream: 'https://api.hubapi.com', version: '2.0.0',
    description: 'HubSpot CRM — contacts, companies, deals, pipelines',
    metadata: { author: 'TwinBridge', license: 'MIT', tags: ['crm', 'marketing', 'sales'] },
  },
  {
    name: 'twilio-sms', service: 'Twilio', category: 'messaging',
    upstream: 'https://api.twilio.com', version: '2.1.0',
    description: 'Twilio Programmable SMS, Voice, and Verify',
    metadata: { author: 'TwinBridge', license: 'MIT', tags: ['sms', 'voice', 'messaging'] },
  },
  {
    name: 'shopify-admin', service: 'Shopify', category: 'ecommerce',
    upstream: 'https://partners.shopify.com', version: '2.3.0',
    description: 'Shopify Admin API — orders, products, inventory, customers',
    metadata: { author: 'TwinBridge', license: 'MIT', tags: ['ecommerce', 'retail'] },
  },
  {
    name: 'salesforce-core', service: 'Salesforce', category: 'crm',
    upstream: 'https://login.salesforce.com', version: '1.4.0',
    description: 'Salesforce REST — SObjects, SOQL, metadata',
    metadata: { author: 'TwinBridge', license: 'MIT', tags: ['crm', 'enterprise'] },
  },
  {
    name: 'openai-v1', service: 'OpenAI', category: 'ai',
    upstream: 'https://api.openai.com', version: '1.0.0',
    description: 'OpenAI API — chat completions, embeddings, images',
    metadata: { author: 'TwinBridge', license: 'MIT', tags: ['ai', 'llm', 'ml'] },
  },
  {
    name: 'sendgrid-v3', service: 'SendGrid', category: 'messaging',
    upstream: 'https://api.sendgrid.com', version: '3.0.0',
    description: 'SendGrid Email API — send, templates, suppressions',
    metadata: { author: 'TwinBridge', license: 'MIT', tags: ['email', 'messaging'] },
  },
];

const ENDPOINTS = {
  'stripe-v2': [
    { method:'GET',    path:'/v1/charges',              example_status:200, example_latency_ms:120 },
    { method:'POST',   path:'/v1/charges',              example_status:200, example_latency_ms:180 },
    { method:'GET',    path:'/v1/charges/{id}',         example_status:200, example_latency_ms:95  },
    { method:'GET',    path:'/v1/customers',            example_status:200, example_latency_ms:110 },
    { method:'POST',   path:'/v1/customers',            example_status:200, example_latency_ms:160 },
    { method:'GET',    path:'/v1/customers/{id}',       example_status:200, example_latency_ms:88  },
    { method:'DELETE', path:'/v1/customers/{id}',       example_status:200, example_latency_ms:140 },
    { method:'GET',    path:'/v1/subscriptions',        example_status:200, example_latency_ms:130 },
    { method:'POST',   path:'/v1/subscriptions',        example_status:200, example_latency_ms:200 },
    { method:'DELETE', path:'/v1/subscriptions/{id}',   example_status:200, example_latency_ms:155 },
    { method:'POST',   path:'/v1/payment_intents',      example_status:200, example_latency_ms:210 },
    { method:'GET',    path:'/v1/payment_intents/{id}', example_status:200, example_latency_ms:100 },
    { method:'POST',   path:'/v1/refunds',              example_status:200, example_latency_ms:175 },
    { method:'GET',    path:'/v1/invoices',             example_status:200, example_latency_ms:115 },
    { method:'POST',   path:'/v1/webhooks/endpoints',   example_status:201, example_latency_ms:145 },
  ],
  'github-rest-v3': [
    { method:'GET',  path:'/repos/{owner}/{repo}',             example_status:200, example_latency_ms:80  },
    { method:'GET',  path:'/repos/{owner}/{repo}/issues',      example_status:200, example_latency_ms:120 },
    { method:'POST', path:'/repos/{owner}/{repo}/issues',      example_status:201, example_latency_ms:180 },
    { method:'GET',  path:'/repos/{owner}/{repo}/pulls',       example_status:200, example_latency_ms:110 },
    { method:'POST', path:'/repos/{owner}/{repo}/pulls',       example_status:201, example_latency_ms:200 },
    { method:'GET',  path:'/user',                            example_status:200, example_latency_ms:60  },
    { method:'GET',  path:'/users/{username}',                example_status:200, example_latency_ms:70  },
    { method:'GET',  path:'/repos/{owner}/{repo}/actions/runs',example_status:200, example_latency_ms:150 },
    { method:'GET',  path:'/repos/{owner}/{repo}/contents/{path}', example_status:200, example_latency_ms:90 },
    { method:'GET',  path:'/search/repositories',             example_status:200, example_latency_ms:130 },
  ],
  'hubspot-crm': [
    { method:'GET',    path:'/crm/v3/objects/contacts',        example_status:200, example_latency_ms:110 },
    { method:'POST',   path:'/crm/v3/objects/contacts',        example_status:201, example_latency_ms:160 },
    { method:'GET',    path:'/crm/v3/objects/contacts/{id}',   example_status:200, example_latency_ms:85  },
    { method:'PATCH',  path:'/crm/v3/objects/contacts/{id}',   example_status:200, example_latency_ms:140 },
    { method:'DELETE', path:'/crm/v3/objects/contacts/{id}',   example_status:204, example_latency_ms:120 },
    { method:'GET',    path:'/crm/v3/objects/companies',       example_status:200, example_latency_ms:115 },
    { method:'POST',   path:'/crm/v3/objects/companies',       example_status:201, example_latency_ms:155 },
    { method:'GET',    path:'/crm/v3/objects/deals',           example_status:200, example_latency_ms:125 },
    { method:'POST',   path:'/crm/v3/objects/deals',           example_status:201, example_latency_ms:170 },
    { method:'POST',   path:'/crm/v3/objects/contacts/search', example_status:200, example_latency_ms:145 },
  ],
  'twilio-sms': [
    { method:'POST', path:'/2010-04-01/Accounts/{AccountSid}/Messages.json',      example_status:201, example_latency_ms:350 },
    { method:'GET',  path:'/2010-04-01/Accounts/{AccountSid}/Messages.json',      example_status:200, example_latency_ms:140 },
    { method:'GET',  path:'/2010-04-01/Accounts/{AccountSid}/Messages/{Sid}.json',example_status:200, example_latency_ms:95  },
    { method:'POST', path:'/2010-04-01/Accounts/{AccountSid}/Calls.json',         example_status:201, example_latency_ms:400 },
    { method:'GET',  path:'/2010-04-01/Accounts/{AccountSid}/Calls.json',         example_status:200, example_latency_ms:130 },
    { method:'POST', path:'/v2/Services/{ServiceSid}/Verifications',              example_status:201, example_latency_ms:280 },
    { method:'POST', path:'/v2/Services/{ServiceSid}/VerificationCheck',          example_status:200, example_latency_ms:220 },
  ],
  'shopify-admin': [
    { method:'GET',    path:'/admin/api/2024-01/products.json',         example_status:200, example_latency_ms:135 },
    { method:'POST',   path:'/admin/api/2024-01/products.json',         example_status:201, example_latency_ms:190 },
    { method:'GET',    path:'/admin/api/2024-01/products/{id}.json',    example_status:200, example_latency_ms:90  },
    { method:'PUT',    path:'/admin/api/2024-01/products/{id}.json',    example_status:200, example_latency_ms:155 },
    { method:'DELETE', path:'/admin/api/2024-01/products/{id}.json',    example_status:200, example_latency_ms:140 },
    { method:'GET',    path:'/admin/api/2024-01/orders.json',           example_status:200, example_latency_ms:145 },
    { method:'GET',    path:'/admin/api/2024-01/orders/{id}.json',      example_status:200, example_latency_ms:95  },
    { method:'GET',    path:'/admin/api/2024-01/customers.json',        example_status:200, example_latency_ms:130 },
    { method:'GET',    path:'/admin/api/2024-01/inventory_levels.json', example_status:200, example_latency_ms:115 },
  ],
  'salesforce-core': [
    { method:'GET',   path:'/services/data/v58.0/sobjects',                     example_status:200, example_latency_ms:200 },
    { method:'GET',   path:'/services/data/v58.0/sobjects/{SObject}/describe',  example_status:200, example_latency_ms:240 },
    { method:'POST',  path:'/services/data/v58.0/sobjects/{SObject}',           example_status:201, example_latency_ms:280 },
    { method:'GET',   path:'/services/data/v58.0/sobjects/{SObject}/{id}',      example_status:200, example_latency_ms:175 },
    { method:'PATCH', path:'/services/data/v58.0/sobjects/{SObject}/{id}',      example_status:204, example_latency_ms:220 },
    { method:'GET',   path:'/services/data/v58.0/query',                        example_status:200, example_latency_ms:195 },
    { method:'POST',  path:'/services/data/v58.0/composite/batch',              example_status:200, example_latency_ms:350 },
  ],
  'openai-v1': [
    { method:'POST', path:'/v1/chat/completions',    example_status:200, example_latency_ms:1200 },
    { method:'POST', path:'/v1/completions',         example_status:200, example_latency_ms:800  },
    { method:'POST', path:'/v1/embeddings',          example_status:200, example_latency_ms:250  },
    { method:'POST', path:'/v1/images/generations',  example_status:200, example_latency_ms:3500 },
    { method:'GET',  path:'/v1/models',              example_status:200, example_latency_ms:90   },
    { method:'GET',  path:'/v1/models/{model}',      example_status:200, example_latency_ms:75   },
    { method:'POST', path:'/v1/audio/transcriptions',example_status:200, example_latency_ms:2000 },
    { method:'POST', path:'/v1/moderations',         example_status:200, example_latency_ms:180  },
  ],
  'sendgrid-v3': [
    { method:'POST',   path:'/v3/mail/send',                 example_status:202, example_latency_ms:220 },
    { method:'GET',    path:'/v3/templates',                 example_status:200, example_latency_ms:110 },
    { method:'POST',   path:'/v3/templates',                 example_status:201, example_latency_ms:160 },
    { method:'GET',    path:'/v3/templates/{template_id}',   example_status:200, example_latency_ms:90  },
    { method:'GET',    path:'/v3/suppressions/bounces',      example_status:200, example_latency_ms:130 },
    { method:'DELETE', path:'/v3/suppressions/bounces/{email}',example_status:204,example_latency_ms:115},
    { method:'GET',    path:'/v3/stats',                     example_status:200, example_latency_ms:145 },
    { method:'GET',    path:'/v3/contactdb/lists',           example_status:200, example_latency_ms:105 },
  ],
};

// ── Routes ─────────────────────────────────────────────────────────────

// GET /api/registry — curated + local cache
router.get('/', (req, res) => {
  const local   = cacheList().map(p => ({ ...p, _source: 'local' }));
  const catalog = CATALOG.map(e => ({ ...e, _source: 'curated', endpoints: ENDPOINTS[e.name] || [] }));
  // Merge: local overrides curated entries with same name
  const localNames = new Set(local.map(p => p.name));
  const merged = [...local, ...catalog.filter(c => !localNames.has(c.name))];
  res.json(merged);
});

// GET /api/registry/categories
router.get('/categories', (_req, res) => {
  const local = cacheList().map(p => p.category).filter(Boolean);
  const cats  = [...new Set([...CATALOG.map(e => e.category), ...local])].sort();
  res.json(cats);
});

// GET /api/registry/cache
router.get('/cache', (_req, res) => {
  res.json(cacheList());
});

// GET /api/registry/:name — package detail with endpoints
router.get('/:name', (req, res) => {
  const local = cacheGet(req.params.name);
  if (local) return res.json({ ...local, _source: 'local' });
  const entry = CATALOG.find(e => e.name === req.params.name);
  if (!entry) return res.status(404).json({ error: 'Package not found' });
  res.json({ ...entry, endpoints: ENDPOINTS[entry.name] || [], _source: 'curated' });
});

// POST /api/registry/install — install from .twinpkg JSON body
router.post('/install', (req, res) => {
  const pkg = req.body;
  if (!pkg.name || !pkg.service || !pkg.endpoints) {
    return res.status(400).json({ error: 'Invalid .twinpkg format — name, service, endpoints required' });
  }
  try {
    cacheWrite(pkg);
    res.json({ ok: true, message: `Installed ${pkg.name} to local cache`, cached: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/registry/cache/:name
router.delete('/cache/:name', (req, res) => {
  const f = path.join(CACHE_DIR, `${req.params.name}.twinpkg`);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not in cache' });
  fs.unlinkSync(f);
  res.json({ ok: true, deleted: req.params.name });
});

// GET /api/registry/export/:twinId — export twin as .twinpkg
router.get('/export/:twinId', (req, res) => {
  const db   = getDB();
  const twin = db.prepare('SELECT * FROM twins WHERE id=?').get(req.params.twinId);
  if (!twin) return res.status(404).json({ error: 'Twin not found' });

  const endpoints = db.prepare(`
    SELECT method, path, COUNT(*) as count,
           ROUND(AVG(status)) as example_status,
           ROUND(AVG(latency_ms)) as example_latency_ms
    FROM events WHERE twin_id=? GROUP BY method, path ORDER BY path, method
  `).all(req.params.twinId);

  let tags = [];
  try { tags = JSON.parse(twin.tags || '[]'); } catch {}

  const pkg = {
    name:        twin.name,
    service:     twin.service,
    category:    tags[0] || 'custom',
    upstream:    twin.upstream || '',
    version:     twin.version || '1.0.0',
    description: twin.notes || `Exported from TwinBridge`,
    endpoints,
    schemas:     {},
    metadata: {
      author:     'TwinBridge export',
      license:    'MIT',
      tags,
      exportedAt: new Date().toISOString(),
      eventCount: twin.event_count,
      accuracy:   twin.accuracy,
    },
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${twin.name}.twinpkg"`);
  res.json(pkg);
});

// POST /api/registry/pull — pull from catalog (or local cache) → create twin
router.post('/pull', (req, res) => {
  const { name } = req.body;

  // Check local cache first, then curated
  let pkg = cacheGet(name);
  let source = 'local';
  if (!pkg) {
    const entry = CATALOG.find(e => e.name === name);
    if (!entry) return res.status(404).json({ error: `Package '${name}' not found` });
    pkg = { ...entry, endpoints: ENDPOINTS[name] || [] };
    source = 'curated';
  }

  const db = getDB();
  const existing = db.prepare('SELECT id FROM twins WHERE name=?').get(pkg.name);
  if (existing) {
    return res.status(409).json({ error: `Twin "${pkg.name}" already exists. Delete it first or rename.` });
  }

  const id         = crypto.randomUUID();
  const eventCount = 200 + Math.floor(Math.random() * 800);
  const accuracy   = 92 + Math.floor(Math.random() * 7);
  let tags = [];
  try { tags = Array.isArray(pkg.metadata?.tags) ? pkg.metadata.tags : [pkg.category]; } catch {}

  db.prepare(`
    INSERT INTO twins (id, name, service, upstream, version, tags, notes, event_count, accuracy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, pkg.name, pkg.service, pkg.upstream, pkg.version,
         JSON.stringify(tags), pkg.description, eventCount, accuracy);

  // Seed synthetic events from endpoints
  const now = Date.now();
  for (let i = 0; i < Math.min(eventCount, pkg.endpoints.length * 10); i++) {
    const ep  = pkg.endpoints[i % pkg.endpoints.length];
    const latency = (ep.example_latency_ms || 100) + Math.floor(Math.random() * 50) - 25;
    const status  = ep.example_status || 200;
    db.prepare(`
      INSERT INTO events (id, twin_id, method, path, status, latency_ms, req_headers, res_headers, timing, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(), id, ep.method, ep.path, status, Math.max(10, latency),
      JSON.stringify({ 'content-type': 'application/json' }),
      JSON.stringify({ 'content-type': 'application/json', 'x-request-id': crypto.randomUUID() }),
      JSON.stringify({ dns: 5, connect: 12, ttfb: latency * 0.6, download: latency * 0.4 }),
      new Date(now - Math.random() * 86400000).toISOString(),
    );
  }

  const twin = { ...db.prepare('SELECT * FROM twins WHERE id=?').get(id), running: false };
  try { twin.tags = JSON.parse(twin.tags || '[]'); } catch { twin.tags = []; }

  broadcast('twin:created', twin);
  res.json({
    twin,
    message: `Pulled ${pkg.name} from ${source} registry — ${twin.event_count} synthetic events seeded`,
    source,
    endpoints: pkg.endpoints.length,
  });
});

module.exports = router;
