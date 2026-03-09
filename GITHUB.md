# GitHub Repository Metadata

## Description (≤ 350 characters — paste into the "About" field on GitHub)

```
Desktop tool for creating API digital twins. Capture live HTTP traffic through a local proxy, replay it for offline dev and CI, compare twin vs real responses, snapshot schemas, and push OpenAPI specs to GitHub. Electron + React + Node.
```

---

## Topics (paste into the "Topics" field on GitHub — one per line or comma-separated)

```
api-mocking
api-testing
developer-tools
electron
http-proxy
openapi
rest-api
regression-testing
digital-twin
nodejs
react
vite
desktop-app
cli
mock-server
api-capture
replay-testing
schema-diff
```

---

## Social preview / banner text

If you need a short tagline for a banner image or social card:

> **TwinBridge** — capture, replay, and diff your APIs. Build and test offline against twins that learned from your real traffic.

---

## GitHub Actions badges (add to top of README if you set up CI)

```markdown
![Build](https://github.com/YOUR_USERNAME/twinbridge/actions/workflows/build.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
```

---

## Suggested repository settings

| Setting | Value |
|---|---|
| Visibility | Public or Private |
| Default branch | `main` |
| Issues | ✓ Enabled |
| Projects | ✓ Enabled (for tracking features) |
| Wiki | optional |
| Releases | Tag as `v1.0.0` on first stable build |

---

## Suggested .gitignore additions

```gitignore
# TwinBridge runtime data
.twinbridge/

# Build outputs
dist/
electron/renderer/

# Node
node_modules/
backend/node_modules/
frontend/node_modules/
electron/node_modules/
cli/node_modules/

# Env
.env
.env.local

# OS
.DS_Store
Thumbs.db
```

---

## Suggested first release notes (`v1.0.0`)

```markdown
## TwinBridge v1.0.0

First public release.

### What's included

- **Proxy capture** — HTTP/HTTPS intercepting proxy with full request/response recording,
  timing breakdown, and automatic auth header redaction
- **Replay** — replay captured events against running twins; diff twin vs real response body
- **Shadow mode** — mirror live production traffic against your twin in real time
- **Schema versioning** — snapshot and diff endpoint schemas over time
- **GitHub integration** — push OpenAPI specs to any repo; pull OpenAPI files to create twins
- **Registry** — curated packages for Stripe, GitHub, HubSpot, Twilio, Shopify, Salesforce,
  OpenAI, SendGrid; local `.twinpkg` format for sharing your own
- **CLI** — full `twin` command with zero external dependencies
- **No native deps** — pure-JS data store, works on Node 18+ without Visual Studio or build tools

### Install

See [README](./README.md) for setup instructions.
```
