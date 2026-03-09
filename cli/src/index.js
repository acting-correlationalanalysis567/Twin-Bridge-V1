#!/usr/bin/env node
'use strict';
/**
 * TwinBridge CLI  —  twin <command> [options]
 *
 * Commands:
 *   twin list                       List all twins
 *   twin new <name> <service>       Create a twin
 *   twin delete <name>              Delete a twin
 *   twin start <name> <upstream>    Start proxy capture for a twin
 *   twin stop <name>                Stop proxy for a twin
 *   twin status                     Show all running proxies
 *   twin replay <name>              Replay captured events against twin
 *   twin snapshot <name> [label]    Snapshot current twin schema
 *   twin versions <name>            List versions of a twin
 *   twin diff <name> <vA> <vB>      Diff two versions
 *   twin export <name> <format>     Export twin (json|har|openapi)
 *   twin push <name> <repo> [file]  Push twin OpenAPI to GitHub
 *   twin pull <repo> <file>         Pull OpenAPI from GitHub into a twin
 *   twin registry list              List registry packages
 *   twin registry pull <package>    Pull a registry package
 *   twin cache list                 List locally cached packages
 *   twin cache clear                Clear local cache
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const BASE_URL = process.env.TWIN_API || 'http://127.0.0.1:7891';

// ── ANSI ─────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
};

const hl  = s => `${c.cyan}${s}${c.reset}`;
const ok  = s => `${c.green}✓${c.reset} ${s}`;
const err = s => `${c.red}✗${c.reset} ${s}`;
const dim = s => `${c.dim}${s}${c.reset}`;
const bold= s => `${c.bold}${s}${c.reset}`;

// ── HTTP client ────────────────────────────────────────────────────────
function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url     = new URL(`${BASE_URL}/api${path}`);
    const opts    = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          const data = JSON.parse(text);
          if (res.statusCode >= 400) reject(Object.assign(new Error(data.error || 'Request failed'), { data, status: res.statusCode }));
          else resolve(data);
        } catch { reject(new Error(`Invalid JSON: ${text.slice(0, 80)}`)); }
      });
    });
    req.on('error', e => reject(new Error(`Cannot connect to TwinBridge backend at ${BASE_URL} — is it running?\n  ${e.message}`)));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Local cache ────────────────────────────────────────────────────────
const CACHE_DIR = path.join(os.homedir(), '.twinbridge', 'cache');
function cacheGet(key) {
  const f = path.join(CACHE_DIR, `${key}.json`);
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}
function cacheSet(key, data) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify({ data, cachedAt: new Date().toISOString() }, null, 2));
}
function cacheClear() {
  if (!fs.existsSync(CACHE_DIR)) return 0;
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  files.forEach(f => fs.unlinkSync(path.join(CACHE_DIR, f)));
  return files.length;
}
function cacheList() {
  if (!fs.existsSync(CACHE_DIR)) return [];
  return fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
      const stat = fs.statSync(path.join(CACHE_DIR, f));
      return { key: f.replace('.json',''), cachedAt: data.cachedAt, size: stat.size };
    });
}

// ── Table printer ──────────────────────────────────────────────────────
function table(rows, cols) {
  if (!rows.length) { console.log(dim('  (none)')); return; }
  const widths = cols.map(col => Math.max(col.label.length, ...rows.map(r => String(r[col.key] ?? '—').length)));
  const header = cols.map((col, i) => bold(col.label.padEnd(widths[i]))).join('  ');
  const sep    = cols.map((col, i) => '─'.repeat(widths[i])).join('  ');
  console.log(`  ${header}`);
  console.log(dim(`  ${sep}`));
  rows.forEach(row => {
    const line = cols.map((col, i) => {
      const val = String(row[col.key] ?? '—');
      const colored = col.color ? col.color(val, row) : val;
      return colored.padEnd(widths[i] + (colored.length - val.length));
    }).join('  ');
    console.log(`  ${line}`);
  });
}

// ── Commands ───────────────────────────────────────────────────────────
const commands = {

  async list() {
    const twins = await api('GET', '/twins');
    if (!twins.length) { console.log(dim('  No twins yet. Run: twin new <name> <service>')); return; }
    console.log(`\n${hl('Twins')}  ${dim(`(${twins.length})`)}\n`);
    table(twins, [
      { key: 'name',        label: 'Name',     color: (v) => bold(v) },
      { key: 'service',     label: 'Service' },
      { key: 'version',     label: 'Version',  color: v => dim(v) },
      { key: 'event_count', label: 'Events',   color: v => v > 0 ? hl(v) : dim(v) },
      { key: 'accuracy',    label: 'Accuracy', color: (v,r) => r.accuracy >= 90 ? `${c.green}${v}%${c.reset}` : `${c.yellow}${v}%${c.reset}` },
      { key: 'running',     label: 'Status',   color: (v,r) => r.running ? `${c.green}▶ :${r.proxy_port}${c.reset}` : dim('■ stopped') },
    ]);
    console.log();
  },

  async new(args) {
    const [name, service, upstream = ''] = args;
    if (!name || !service) { console.error(err('Usage: twin new <name> <service> [upstream-url]')); process.exit(1); }
    const twin = await api('POST', '/twins', { name, service, upstream, version: '1.0.0' });
    console.log(ok(`Created twin ${hl(twin.name)} (${dim(twin.id.slice(0,8))})`));
  },

  async delete(args) {
    const name = args[0];
    if (!name) { console.error(err('Usage: twin delete <name>')); process.exit(1); }
    const twins = await api('GET', '/twins');
    const twin  = twins.find(t => t.name === name);
    if (!twin) { console.error(err(`Twin "${name}" not found`)); process.exit(1); }
    await api('DELETE', `/twins/${twin.id}`);
    console.log(ok(`Deleted ${hl(name)}`));
  },

  async start(args) {
    const [name, upstream] = args;
    if (!name || !upstream) { console.error(err('Usage: twin start <name> <upstream-url>')); process.exit(1); }
    const twins = await api('GET', '/twins');
    const twin  = twins.find(t => t.name === name);
    if (!twin) { console.error(err(`Twin "${name}" not found`)); process.exit(1); }
    const result = await api('POST', '/proxy/start', { twinId: twin.id, upstream });
    console.log(ok(`Proxy started — ${hl(name)} → ${upstream}`));
    console.log(dim(`  Capture at: http://127.0.0.1:${result.port}`));
    console.log(dim(`  Session:    ${result.sessionId}`));
  },

  async stop(args) {
    const name = args[0];
    const status = await api('GET', '/proxy/status');
    if (name) {
      const twins  = await api('GET', '/twins');
      const twin   = twins.find(t => t.name === name);
      if (!twin) { console.error(err(`Twin "${name}" not found`)); process.exit(1); }
      const entry  = status.running.find(e => e.twinId === twin.id);
      if (!entry) { console.log(dim(`  ${name} is not running`)); return; }
      await api('POST', '/proxy/stop', { twinId: twin.id, port: entry.port });
      console.log(ok(`Stopped ${hl(name)}`));
    } else {
      if (!status.running.length) { console.log(dim('  No proxies running')); return; }
      for (const entry of status.running) {
        await api('POST', '/proxy/stop', { twinId: entry.twinId, port: entry.port });
        console.log(ok(`Stopped :${entry.port}`));
      }
    }
  },

  async status() {
    const [proxies, twins] = await Promise.all([api('GET', '/proxy/status'), api('GET', '/twins')]);
    console.log(`\n${hl('Running Proxies')}  ${dim(`(${proxies.running.length})`)}\n`);
    if (!proxies.running.length) { console.log(dim('  None')); }
    else {
      proxies.running.forEach(p => {
        const twin = twins.find(t => t.id === p.twinId);
        console.log(`  ${c.green}▶${c.reset} ${bold(twin?.name || p.twinId)}  :${hl(p.port)}  →  ${dim(p.upstream)}`);
      });
    }
    console.log();
  },

  async replay(args) {
    const name = args[0];
    if (!name) { console.error(err('Usage: twin replay <name>')); process.exit(1); }
    const twins = await api('GET', '/twins');
    const twin  = twins.find(t => t.name === name);
    if (!twin) { console.error(err(`Twin "${name}" not found`)); process.exit(1); }
    if (!twin.running) { console.error(err(`Twin "${name}" is not running — start it first`)); process.exit(1); }

    process.stdout.write(`Starting replay for ${hl(name)}…`);
    const run = await api('POST', '/replay/start', { twinId: twin.id, compareReal: false, name: `CLI ${new Date().toLocaleTimeString()}` });
    console.log(` ${dim(run.total + ' requests')}`);

    // Poll for completion
    let done = false;
    while (!done) {
      await new Promise(r => setTimeout(r, 800));
      const runs = await api('GET', `/replay/runs?twinId=${twin.id}`);
      const r    = runs.find(r => r.id === run.runId);
      if (!r) break;
      process.stdout.write(`\r  ${c.cyan}▶${c.reset} ${r.passed + r.failed}/${r.total}  `);
      if (r.status === 'done' || r.status === 'error') {
        done = true;
        const passRate = r.total ? Math.round(r.passed / r.total * 100) : 0;
        const color    = passRate === 100 ? c.green : passRate >= 80 ? c.yellow : c.red;
        console.log(`\n${ok(`${r.passed}/${r.total} passed`)}  ${color}${passRate}%${c.reset}`);
      }
    }
  },

  async snapshot(args) {
    const [name, label = ''] = args;
    if (!name) { console.error(err('Usage: twin snapshot <name> [label]')); process.exit(1); }
    const twins = await api('GET', '/twins');
    const twin  = twins.find(t => t.name === name);
    if (!twin) { console.error(err(`Twin "${name}" not found`)); process.exit(1); }
    const version = await api('POST', `/versions/${twin.id}/snapshot`, { label });
    console.log(ok(`Snapshot ${hl(version.label)} — ${version.endpoints.length} endpoints`));
    console.log(dim(`  ID: ${version.id.slice(0,8)}`));
  },

  async versions(args) {
    const name = args[0];
    if (!name) { console.error(err('Usage: twin versions <name>')); process.exit(1); }
    const twins = await api('GET', '/twins');
    const twin  = twins.find(t => t.name === name);
    if (!twin) { console.error(err(`Twin "${name}" not found`)); process.exit(1); }
    const versions = await api('GET', `/versions/${twin.id}`);
    if (!versions.length) { console.log(dim('  No snapshots yet. Run: twin snapshot <name>')); return; }
    console.log(`\n${hl('Versions')} — ${twin.name}\n`);
    table(versions, [
      { key: 'label',      label: 'Version', color: v => bold(v) },
      { key: 'id',         label: 'ID',      color: v => dim(v.slice(0,8)) },
      { key: 'endpoints',  label: 'Endpoints', color: (v,r) => String(r.endpoints?.length ?? 0) },
      { key: 'accuracy',   label: 'Accuracy',  color: v => v ? `${v}%` : '—' },
      { key: 'created_at', label: 'Created',   color: v => dim(new Date(v).toLocaleDateString()) },
    ]);
    console.log();
  },

  async diff(args) {
    const [name, vA, vB] = args;
    if (!name || !vA || !vB) { console.error(err('Usage: twin diff <name> <versionA-id> <versionB-id>')); process.exit(1); }
    const twins = await api('GET', '/twins');
    const twin  = twins.find(t => t.name === name);
    if (!twin) { console.error(err(`Twin "${name}" not found`)); process.exit(1); }
    const diff = await api('GET', `/versions/${twin.id}/diff?a=${vA}&b=${vB}`);
    console.log(`\n${hl('Schema Diff')}  ${bold(diff.versionA.label)} → ${bold(diff.versionB.label)}\n`);
    console.log(`  ${c.green}+${diff.added} added${c.reset}   ${c.red}-${diff.removed} removed${c.reset}   ${c.dim}${diff.same} unchanged${c.reset}\n`);
    for (const line of diff.lines) {
      if (line.status === 'added')   console.log(`  ${c.green}+${c.reset} ${line.key}`);
      else if (line.status === 'removed') console.log(`  ${c.red}-${c.reset} ${dim(line.key)}`);
      else console.log(`  ${dim('·')} ${dim(line.key)}`);
    }
    console.log();
  },

  async export(args) {
    const [name, format = 'openapi'] = args;
    if (!name) { console.error(err('Usage: twin export <name> [json|har|openapi]')); process.exit(1); }
    const twins = await api('GET', '/twins');
    const twin  = twins.find(t => t.name === name);
    if (!twin) { console.error(err(`Twin "${name}" not found`)); process.exit(1); }

    return new Promise((resolve, reject) => {
      const url  = new URL(`${BASE_URL}/api/capture/export?format=${format}&twinId=${twin.id}`);
      const out  = `${name}-export.${format === 'har' ? 'har' : 'json'}`;
      const file = fs.createWriteStream(out);
      http.get({ hostname: url.hostname, port: url.port, path: url.pathname + url.search }, res => {
        res.pipe(file);
        file.on('finish', () => { console.log(ok(`Exported to ${hl(out)}`)); resolve(); });
      }).on('error', reject);
    });
  },

  async push(args) {
    const [name, repo, filePath = ''] = args;
    if (!name || !repo) { console.error(err('Usage: twin push <name> <owner/repo> [file-path]')); process.exit(1); }
    const twins = await api('GET', '/twins');
    const twin  = twins.find(t => t.name === name);
    if (!twin) { console.error(err(`Twin "${name}" not found`)); process.exit(1); }
    process.stdout.write(`Pushing ${hl(name)} → ${repo}…`);
    const result = await api('POST', '/github/push', { twinId: twin.id, repo, filePath: filePath || undefined });
    console.log(` ${ok(result.action)}`);
    console.log(dim(`  ${result.url || repo + '/' + result.path}`));
  },

  async pull(args) {
    const [repo, filePath, twinName = ''] = args;
    if (!repo || !filePath) { console.error(err('Usage: twin pull <owner/repo> <file-path> [twin-name]')); process.exit(1); }
    process.stdout.write(`Pulling ${repo}/${filePath}…`);
    const result = await api('POST', '/github/pull', { repo, filePath, twinName: twinName || undefined });
    console.log(` ${ok(`${result.endpoints} endpoints`)}`);
    console.log(dim(`  Twin: ${result.twin.name}`));
  },

  registry: {
    async list(args) {
      const cacheKey = 'registry-list';
      let entries = cacheGet(cacheKey)?.data;
      if (!entries) {
        entries = await api('GET', '/registry');
        cacheSet(cacheKey, entries);
      }
      console.log(`\n${hl('Registry Packages')}  ${dim(`(${entries.length})`)}\n`);
      table(entries, [
        { key: 'name',        label: 'Package',  color: v => bold(v) },
        { key: 'service',     label: 'Service' },
        { key: 'category',    label: 'Category', color: v => dim(v) },
        { key: 'version',     label: 'Version',  color: v => dim(`v${v}`) },
        { key: 'description', label: 'Description', color: v => dim(v.slice(0, 40) + (v.length > 40 ? '…' : '')) },
      ]);
      console.log();
    },
    async pull(args) {
      const name = args[0];
      if (!name) { console.error(err('Usage: twin registry pull <package-name>')); process.exit(1); }
      process.stdout.write(`Pulling ${hl(name)}…`);
      const result = await api('POST', '/registry/pull', { name });
      console.log(` ${ok(result.message)}`);
    },
  },

  cache: {
    list() {
      const entries = cacheList();
      if (!entries.length) { console.log(dim('  Cache is empty')); return; }
      console.log(`\n${hl('Local Cache')}  ${dim(`(${entries.length} items, ${CACHE_DIR})`)}\n`);
      table(entries, [
        { key: 'key',      label: 'Key',    color: v => bold(v) },
        { key: 'cachedAt', label: 'Cached', color: v => dim(new Date(v).toLocaleString()) },
        { key: 'size',     label: 'Size',   color: v => dim(`${Math.round(v/1024*10)/10} KB`) },
      ]);
      console.log();
    },
    clear() {
      const n = cacheClear();
      console.log(ok(`Cleared ${n} cached item${n !== 1 ? 's' : ''}`));
    },
  },
};

// ── Help ──────────────────────────────────────────────────────────────
function help() {
  console.log(`
${c.cyan}${c.bold}TwinBridge CLI${c.reset}  ${dim('v1.0.0')}

${bold('Usage:')}  twin <command> [args]

${bold('Twin management:')}
  ${hl('twin list')}                        List all twins
  ${hl('twin new')} <name> <service> [url]  Create a twin
  ${hl('twin delete')} <name>               Delete a twin
  ${hl('twin status')}                      Show running proxies

${bold('Capture & replay:')}
  ${hl('twin start')} <name> <upstream>     Start proxy capture
  ${hl('twin stop')} [name]                 Stop proxy (or all)
  ${hl('twin replay')} <name>               Replay captured traffic

${bold('Versioning:')}
  ${hl('twin snapshot')} <name> [label]     Snapshot current schema
  ${hl('twin versions')} <name>             List snapshots
  ${hl('twin diff')} <name> <vA> <vB>       Diff two snapshots

${bold('Export & GitHub:')}
  ${hl('twin export')} <name> [format]      Export (json/har/openapi)
  ${hl('twin push')} <name> <repo> [path]   Push OpenAPI to GitHub
  ${hl('twin pull')} <repo> <path> [name]   Pull OpenAPI from GitHub

${bold('Registry:')}
  ${hl('twin registry list')}               Browse registry packages
  ${hl('twin registry pull')} <package>     Pull a package locally

${bold('Cache:')}
  ${hl('twin cache list')}                  Show cached items
  ${hl('twin cache clear')}                 Clear local cache

${dim('Backend URL: ' + BASE_URL + '  (override with TWIN_API=http://... twin ...)')}
`);
}

// ── Dispatch ──────────────────────────────────────────────────────────
async function main() {
  const [,, cmd, sub, ...rest] = process.argv;

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { help(); return; }

  // Sub-command groups
  if (cmd === 'registry') {
    const fn = commands.registry[sub];
    if (!fn) { console.error(err(`Unknown registry command: ${sub}`)); process.exit(1); }
    await fn(rest);
    return;
  }
  if (cmd === 'cache') {
    const fn = commands.cache[sub];
    if (!fn) { console.error(err(`Unknown cache command: ${sub}`)); process.exit(1); }
    await fn(rest);
    return;
  }

  const fn = commands[cmd];
  if (!fn) { console.error(err(`Unknown command: ${cmd}`)); help(); process.exit(1); }
  await fn(sub ? [sub, ...rest] : rest);
}

main().catch(e => {
  console.error(err(e.message));
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
