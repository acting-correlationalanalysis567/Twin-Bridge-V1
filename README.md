# TwinBridge

**TwinBridge** is a desktop developer tool for creating, managing, and testing API digital twins — local mock proxies that learn from your real traffic and replay it for offline development, CI testing, and behavioral regression detection.

---

## What it does

You point TwinBridge at a live API. It captures every request and response through a local proxy, builds a schema of how that API behaves, and lets you replay that traffic against the twin later — without touching the real API. When the twin's responses diverge from the original, you know immediately.

It also ships a CLI, a GitHub integration for sharing twin schemas as OpenAPI specs, a versioning system for snapshotting and diffing schemas over time, and a shadow mode that mirrors production traffic against your twin in real time.

---

## Architecture

TwinBridge is a three-tier Electron desktop app:

```
┌─────────────────────────────────────────────────┐
│  Electron shell  (electron/)                    │
│    Spawns backend, waits for health, loads UI   │
├───────────────────┬─────────────────────────────┤
│  React frontend   │  Express backend            │
│  (frontend/)      │  (backend/)                 │
│  Vite + Zustand   │  REST API + WebSocket       │
│  Port 5173 (dev)  │  Port 7891                  │
└───────────────────┴─────────────────────────────┘
                          │
              ~/.twinbridge/twinbridge.json   ← data store
              ~/.twinbridge/packages/        ← local package cache
```

The backend is pure Node.js with no native dependencies. Data is stored as JSON — no SQLite, no Postgres, no setup required.

---

## Install

**Requirements:** Node.js 18+, Windows / macOS / Linux

```bash
# Clone or extract the project
cd twinbridge

# Install all three sub-projects
npm install
npm install --prefix backend
npm install --prefix frontend
npm install --prefix electron
```

**Run in development mode:**

```bash
npm run dev
```

This starts three processes concurrently:

| Process | What it does |
|---|---|
| `[BACK]` | Express API + WebSocket on `http://127.0.0.1:7891` |
| `[FRONT]` | Vite dev server on `http://localhost:5173` |
| `[ELEC]` | Electron window loading the Vite frontend |

Expected startup output:
```
[BACK] ✓ DB ready at ~/.twinbridge/twinbridge.json
[BACK] ✓ TwinBridge backend on http://127.0.0.1:7891
[FRONT] VITE ready in 800ms → http://localhost:5173
[ELEC] Electron window open
```

---

## Features

### Twins

A twin is a named proxy that sits in front of a real API. Create one, point it at an upstream URL, and start capturing.

```
Dashboard  →  manage all twins, see event counts and accuracy scores
Twins      →  create, clone, edit notes, add tags, delete
```

### Capture

Start a local proxy on any port. Route your app's HTTP traffic through it. Every request and response is recorded — headers, body, timing breakdown (DNS / connect / TTFB / download). Auth headers are automatically redacted.

```
Capture    →  start/stop proxy, live stream of captured requests,
              click any row to inspect headers + body + timing,
              export as HAR / JSON / OpenAPI
```

### Replay

Replay all captured events against the running twin. Optionally hit the real upstream simultaneously and compare responses field by field.

```
Replay     →  start a replay run, watch results stream in,
              see per-request status / latency / body diff,
              click a completed run to reload its results
```

**Shadow mode** spins up a secondary HTTP server that you can point real traffic at. Each incoming request is forwarded to the real upstream (so your callers get a real response) and simultaneously replayed against the twin — giving you a live accuracy score against production traffic without changing anything in your stack.

```
Replay → ⬡ Shadow Mode  →  set duration, start, point traffic at the shadow port,
                            watch twin vs upstream comparison in real time
```

### Schema Diff

Compare the endpoint schemas of any two twins side by side. Useful for spotting API drift between environments or versions.

### Versioning

Snapshot a twin's current endpoint schema at any point in time, give it a label, and diff any two snapshots to see what changed.

```
Versions   →  select twin → Snapshot (with optional label)
              tag any two snapshots A / B → Diff
              see +added / −removed / unchanged endpoints
```

### Registry

A curated catalog of pre-built twin packages for common APIs, plus support for local `.twinpkg` packages you build yourself.

**Included packages:** Stripe, GitHub, HubSpot, Twilio, Shopify, Salesforce, OpenAI, SendGrid

Pull a package to instantly create a twin with seeded synthetic events — no capture session needed.

**Package format (`.twinpkg`):**

```json
{
  "name": "my-api-v2",
  "service": "My API",
  "category": "internal",
  "upstream": "https://api.mycompany.com",
  "version": "2.1.0",
  "description": "Internal service twin",
  "endpoints": [
    { "method": "GET", "path": "/v2/users", "example_status": 200, "example_latency_ms": 85 },
    { "method": "POST", "path": "/v2/users", "example_status": 201, "example_latency_ms": 140 }
  ],
  "schemas": {},
  "metadata": { "author": "you", "license": "MIT", "tags": ["internal"] }
}
```

Install a `.twinpkg` file via **Settings → Local Package Cache → Import**, or use the CLI:

```bash
twin registry pull my-api-v2
```

Export any of your twins as a `.twinpkg` via **Settings → Export Twin as Package**.

### GitHub Integration

Push a twin's learned OpenAPI spec to any GitHub repository, or pull an OpenAPI spec from a repo to create a twin.

Configure in **Settings → GitHub Integration**:

1. Create a [Personal Access Token](https://github.com/settings/tokens/new) with `repo` scope
2. Paste it in Settings, set a default repo, Save
3. On any Registry card for a pulled twin, click **↑ GitHub** to push

```
POST /api/github/push   →  creates/updates twins/{name}/openapi.json in your repo
POST /api/github/pull   →  fetches an OpenAPI file and creates a local twin
```

### Logs

Filterable real-time log stream from all subsystems — proxy, replay, system events. Export as CSV or JSON.

---

## CLI

The CLI talks to a running TwinBridge backend over HTTP. Install it with:

```bash
cd twinbridge/cli
npm link
```

Or run directly:

```bash
node twinbridge/cli/src/index.js list
```

Override the backend URL with the `TWIN_API` environment variable if you've changed the port:

```bash
TWIN_API=http://127.0.0.1:7891 twin list
```

**Commands:**

```
twin list                           List all twins
twin new <name> <service> [url]     Create a twin
twin delete <name>                  Delete a twin
twin status                         Show running proxies

twin start <name> <upstream-url>    Start proxy capture
twin stop [name]                    Stop proxy (or all)
twin replay <name>                  Replay captured traffic

twin snapshot <name> [label]        Snapshot current schema
twin versions <name>                List snapshots
twin diff <name> <vA-id> <vB-id>    Diff two snapshots

twin export <name> [json|har|openapi]   Export captured data
twin push <name> <owner/repo> [path]    Push OpenAPI to GitHub
twin pull <owner/repo> <path> [name]    Pull OpenAPI from GitHub

twin registry list                  Browse registry packages
twin registry pull <package>        Pull a registry package

twin cache list                     Show locally cached packages
twin cache clear                    Clear local cache
```

---

## API reference

The backend exposes a REST API on `http://127.0.0.1:7891/api`. All endpoints return JSON.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/twins` | List all twins |
| `POST` | `/api/twins` | Create twin |
| `PATCH` | `/api/twins/:id` | Update twin |
| `DELETE` | `/api/twins/:id` | Delete twin |
| `POST` | `/api/twins/:id/clone` | Clone twin |
| `GET` | `/api/twins/:id/schema` | Endpoint schema from events |
| `POST` | `/api/proxy/start` | Start capture proxy |
| `POST` | `/api/proxy/stop` | Stop capture proxy |
| `GET` | `/api/proxy/status` | List running proxies |
| `GET` | `/api/capture/events` | Paginated event log |
| `GET` | `/api/capture/export` | Export as HAR / JSON / OpenAPI |
| `GET` | `/api/replay/runs` | List replay runs |
| `POST` | `/api/replay/start` | Start a replay run |
| `GET` | `/api/replay/runs/:id/results` | Per-request results |
| `POST` | `/api/replay/shadow/start` | Start shadow session |
| `POST` | `/api/replay/shadow/stop` | Stop shadow session |
| `GET` | `/api/replay/shadow/:id/results` | Shadow comparison results |
| `GET` | `/api/registry` | List all packages |
| `POST` | `/api/registry/pull` | Pull package → create twin |
| `POST` | `/api/registry/install` | Install `.twinpkg` to local cache |
| `GET` | `/api/registry/export/:twinId` | Export twin as `.twinpkg` |
| `POST` | `/api/versions/:twinId/snapshot` | Create schema snapshot |
| `GET` | `/api/versions/:twinId` | List snapshots |
| `GET` | `/api/versions/:twinId/diff` | Diff two snapshots |
| `GET` | `/api/github/status` | Check GitHub connection |
| `POST` | `/api/github/settings` | Save GitHub token + default repo |
| `GET` | `/api/github/repos` | List user repos |
| `POST` | `/api/github/push` | Push OpenAPI spec to GitHub |
| `POST` | `/api/github/pull` | Import OpenAPI from GitHub |

**WebSocket events** (connect to `ws://127.0.0.1:7891/ws`):

| Event | Payload |
|---|---|
| `capture:event` | Full captured request/response |
| `twin:created` / `twin:updated` / `twin:deleted` | Twin object or `{ id }` |
| `proxy:started` / `proxy:stopped` | `{ twinId, port, upstream }` |
| `replay:started` / `replay:result` / `replay:complete` | Run progress and per-request results |
| `shadow:started` / `shadow:result` / `shadow:stopped` | Shadow session progress |
| `version:created` | `{ twinId, version }` |
| `github:pushed` | `{ twinId, repo, path, sha }` |

---

## Data

Everything is stored in `~/.twinbridge/`:

```
~/.twinbridge/
  twinbridge.json      ← all twins, events, replay runs, sessions, versions
  packages/            ← locally installed .twinpkg files
    stripe-v2.twinpkg
    my-api.twinpkg
```

To reset all data: delete `~/.twinbridge/twinbridge.json`. The app will start fresh on next launch.

---

## Project structure

```
twinbridge/
├── package.json                 ← root: runs all three via concurrently
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.js             ← Express app, mounts all routes
│       ├── db.js                ← Pure-JS JSON store (no native deps)
│       ├── ws/server.js         ← WebSocket broadcast server
│       ├── proxy/
│       │   ├── engine.js        ← HTTP intercepting proxy per twin
│       │   └── routes.js
│       ├── twins/routes.js      ← CRUD + clone + schema
│       ├── capture/routes.js    ← Event log + export
│       ├── replay/routes.js     ← Replay runs + shadow mode
│       ├── registry/routes.js   ← Curated catalog + local cache
│       ├── versions/routes.js   ← Schema snapshots + diff
│       └── github/routes.js     ← GitHub push/pull
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx              ← WS wiring, view routing
│       ├── store/index.js       ← Zustand global state
│       ├── api/index.js         ← REST client
│       ├── api/ws.js            ← WebSocket hook (useWS)
│       ├── components/          ← Titlebar, Sidebar, CmdPalette, NotifPanel, EventInspector
│       └── views/               ← Dashboard, Twins, Capture, Replay, Diff, Logs, Versions, Registry, Settings
├── electron/
│   ├── package.json
│   └── src/main.js              ← Spawns backend, waits for health, opens window
└── cli/
    ├── package.json
    └── src/index.js             ← Full CLI (zero external deps)
```

---

## License

MIT
#   T w i n - B r i d g e - V 1  
 #   T w i n - B r i d g e - V 1  
 