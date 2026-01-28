# PlayFab-Purchase Service — Minecraft Bedrock Edition

> **Node.js/Express** API for quoting and executing **Minecraft Bedrock Marketplace** purchases (Minecoins), plus helpers to read balances/entitlements and fetch creator/offer metadata. Hardened with JWT auth, CORS allow‑list, Helmet, request/response logging, OpenAPI docs, and sensible timeouts.

[![Runtime](https://img.shields.io/badge/runtime-Node.js_18%2B-339933?logo=node.js)](#)
[![Framework](https://img.shields.io/badge/framework-Express-000?logo=express)](#)
[![OpenAPI](https://img.shields.io/badge/docs-/openapi.json-blue)](#)
[![Auth](https://img.shields.io/badge/auth-JWT-orange)](#)
[![Status](https://img.shields.io/badge/stability-stable-success)](#)

---

## Table of Contents

* [Overview](#overview)
* [Key Features](#key-features)
* [Quickstart](#quickstart)
* [Configuration (Environment)](#configuration-environment)
* [Runtime & Architecture](#runtime--architecture)
* [Security Model](#security-model)
* [HTTP API](#http-api)

  * [Authentication & Tokens](#authentication--tokens)
  * [Global Conventions](#global-conventions)
  * [Routes Summary](#routes-summary)
  * [Routes — Detailed Reference](#routes--detailed-reference)
  * [Usage Examples (cURL)](#usage-examples-curl)
* [Rate Limiting](#rate-limiting)
* [OpenAPI & Swagger UI](#openapi--swagger-ui)
* [Logging](#logging)
* [Deployment](#deployment)

  * [Docker](#docker)
  * [docker-compose](#docker-compose)
  * [Kubernetes (snippet)](#kubernetes-snippet)
  * [Reverse Proxy (Nginx)](#reverse-proxy-nginx)
* [Observability & Ops](#observability--ops)
* [Troubleshooting](#troubleshooting)
* [FAQ](#faq)
* [Changelog Template](#changelog-template)
* [Contributing](#contributing)
* [License](#license)

---

## Overview

**PlayFab-Purchase Service** exposes a compact, production‑ready façade over Minecraft Bedrock Marketplace endpoints:

* Quote and execute **virtual currency** purchases (Minecoins).
* Resolve **creator lists** and **offer details** when Marketplace integration is enabled.
* Inspect **balances** and **entitlements** for the signed‑in MC session.
* Utility route to **decode tokens** (JWS/JWE/opaque) during development.

The service is stateless and proxy/CDN friendly. It uses keep‑alive HTTP agents, strict input validation, standardized error shapes, and colorized request logs with correlation IDs.

> Repository: **[https://github.com/Daniel-Ric/PlayFab-Purchase-Service](https://github.com/Daniel-Ric/PlayFab-Purchase-Service)**

---

## Key Features

* 🔐 **JWT authentication** middleware for all business routes.
* 🧰 **CORS allow‑list**, Helmet hardening, compression, and request rate limiting.
* 📄 **OpenAPI 3** spec served at `/openapi.json` and **Swagger UI** at `/api-docs` (toggle).
* 🔗 **PlayFab → MC token exchange** helper (via PlayFab SessionTicket).
* 🪙 **Purchases**: quote price and perform Minecoin purchase with resilient error mapping.
* 🧾 **Inventory**: read virtual currency **balances** and **entitlements**.
* 🧑‍🎨 **Marketplace**: list creators, fetch creator summary and offer details (optional integration).
* 🧪 **Debug**: decode common auth token formats quickly during dev.
* 📈 **Pretty logs** (or JSON) with timings, method badges, and request IDs.

---

## Quickstart

```bash
# 1) Clone & install
git clone https://github.com/Daniel-Ric/PlayFab-Purchase-Service
cd PlayFab-Purchase-Service
npm ci

# 2) Configure environment
cp .env.example .env
# IMPORTANT: set JWT_SECRET (>= 16 chars), and optionally MARKETPLACE/XLink toggles

# 3) Start (development)
NODE_ENV=development node src/server.js

# 4) Production
NODE_ENV=production LOG_PRETTY=false node src/server.js
```

**Default base URL**: `http://localhost:8090`

---

## Configuration (Environment)

> The process validates env vars at boot using **Joi** (`src/config/env.js`). Missing/invalid values cause startup failure.

### Core

| Variable          | Default       | Notes                                             |
| ----------------- | ------------- | ------------------------------------------------- |
| `PORT`            | `8090`        | HTTP port                                         |
| `NODE_ENV`        | `development` | `development` | `production` | `test`             |
| `JWT_SECRET`      | — (required)  | ≥ 16 chars; used to sign/verify client JWTs       |
| `TRUST_PROXY`     | `"loopback"`  | Express `trust proxy` setting (boolean or string) |
| `CORS_ORIGIN`     | `*`           | Comma‑separated allow‑list; `*` allows all        |
| `HTTP_TIMEOUT_MS` | `15000`       | Axios timeout for upstreams                       |
| `LOG_PRETTY`      | `true` in dev | Colorized vs compact logs                         |

### Minecraft / PlayFab

| Variable           | Default     | Notes                                       |
| ------------------ | ----------- | ------------------------------------------- |
| `MC_GAME_VERSION`  | `1.21.62`   | Passed when minting MC token                |
| `MC_PLATFORM`      | `Windows10` | Device platform string                      |
| `PLAYFAB_TITLE_ID` | `20ca2`     | Used for PlayFab endpoints and payload tags |
| `ACCEPT_LANGUAGE`  | `en-US`     | Forwarded where applicable                  |

### Docs

| Variable             | Default | Notes                                 |
| -------------------- | ------- | ------------------------------------- |
| `SWAGGER_ENABLED`    | `true`  | Serve `/api-docs` and `/openapi.json` |
| `SWAGGER_SERVER_URL` | —       | Override server URL in the spec       |

### Optional Marketplace & xLink

| Variable                 | Default | Notes                                        |
| ------------------------ | ------- | -------------------------------------------- |
| `ENABLE_MARKETPLACE_API` | `false` | Enable calls to the external Marketplace API |
| `MARKETPLACE_API_BASE`   | `""`    | Base URL of Marketplace API                  |
| `ENABLE_XLINK_API`       | `false` | Allow xLink-issued tokens as fallback        |
| `XLINK_API_BASE`         | `""`    | Base URL for xLink (if used)                 |

---

## Runtime & Architecture

```
Client ──► Bearer JWT ─┐
                       │          ┌────────────────────┐
Headers (MC/XLink/PF) ─┼────────► │ Express API         │
                       │          │  • Routes           │
                       │          │  • Middleware       │
                       │          └─────────┬──────────┘
                       │                    │
                       │                    ▼
                       │          ┌────────────────────┐
                       │          │ Services            │
                       │          │  • minecraft        │
                       │          │  • purchase         │
                       │          │  • marketplace      │
                       │          └─────────┬──────────┘
                       │                    │
                       │                    ▼
                       │          ┌────────────────────┐
                       │          │ utils/http + axios │──► MC / PlayFab / Marketplace
                       │          └────────────────────┘
```

* Keep‑alive agents, bounded redirects, and strict `validateStatus`.
* Per‑request correlation ID via `X-Request-Id` (generated if missing) printed with latency.

---

## Security Model

* **Auth**: All business routes require `Authorization: Bearer <jwt>` signed with `JWT_SECRET`.
* **Input validation**: `Joi` schemas at route boundaries; consistent error model.
* **CORS**: allow‑list using `CORS_ORIGIN` (supports `*`).
* **Helmet**: baseline headers; CSP disabled for Swagger UI compatibility.
* **Compression**: gzip compression enabled.

---

## HTTP API

### Authentication & Tokens

Obtain a client JWT from your own identity system (this service only **verifies** the JWT using `JWT_SECRET`). Send it on each call:

```
Authorization: Bearer <jwt>
```

To act **on behalf of a Minecraft player**, provide either:

* `x-mc-token: <Minecraft authorization header>` (preferred), or
* `x-playfab-session: <PlayFab SessionTicket>` → the service exchanges it for an MC token.

Optional Marketplace headers (when enabled):

* `x-marketplace-token: <bearer>` or `x-xlink-token: <bearer>`

### Global Conventions

* `Content-Type: application/json; charset=utf-8`
* All responses are JSON; errors are standardized.
* Correlation ID echoed as `X-Request-Id`.

### Routes Summary

#### System & Docs

| Method | Path            | Description         | Auth |
| ------ | --------------- | ------------------- | ---- |
| GET    | `/healthz`      | Liveness            | ❌    |
| GET    | `/readyz`       | Readiness           | ❌    |
| GET    | `/openapi.json` | OpenAPI 3 schema    | ❌    |
| GET    | `/api-docs`     | Swagger UI (toggle) | ❌    |

#### Marketplace

| Method | Path                                        | Description                                                             |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/marketplace/creators`                     | Map of creator display names → IDs (from store config)                  |
| GET    | `/marketplace/creator/summary?creator=<id>` | Condensed list of a creator’s offers (Marketplace/xLink token optional) |
| GET    | `/marketplace/offer/details?offerId=<id>`   | Offer details including price/display properties                        |

#### Inventory

| Method | Path                                          | Description                                         |
| ------ | --------------------------------------------- | --------------------------------------------------- |
| GET    | `/inventory/balances`                         | Player virtual currency balances                    |
| GET    | `/inventory/entitlements?includeReceipt=true` | Player entitlements (optionally with receipts)      |
| GET    | `/inventory/creators?includeUnknown=true`     | Inventory counts grouped by creator display name    |
| GET    | `/inventory/playfab/items?filter=<query>`     | PlayFab inventory items with official filters       |

#### Purchase

| Method | Path                | Description                                       |
| ------ | ------------------- | ------------------------------------------------- |
| POST   | `/purchase/quote`   | Resolve price/metadata for an offer before buying |
| POST   | `/purchase/virtual` | Execute a Minecoin purchase for the offer         |

#### Debug

| Method | Path                  | Description                         |
| ------ | --------------------- | ----------------------------------- |
| POST   | `/debug/decode-token` | Decode one token or a map of tokens |

> See **[OpenAPI paths](src/utils/swagger.js)** for the authoritative schema.

### Routes — Detailed Reference

#### `GET /healthz` / `GET /readyz`

No auth. Basic service probes.

#### `GET /marketplace/creators`

Headers: `authorization` (JWT), `x-mc-token` (required). Returns a dictionary `{ displayName: id }`.

#### `GET /marketplace/creator/summary?creator=<id>`

Headers: `authorization` (JWT). Requires `ENABLE_MARKETPLACE_API=true` and `MARKETPLACE_API_BASE`. Optional `x-marketplace-token` or `x-xlink-token`.

#### `GET /marketplace/offer/details?offerId=<id>`

Same integration rules as above. Returns offer metadata (price, display properties, etc.).

#### `GET /inventory/balances`

Headers: `authorization` (JWT), `x-mc-token` (required). Returns Minecoin and other virtual currency balances.

#### `GET /inventory/entitlements?includeReceipt=<bool>`

Headers: `authorization` (JWT), `x-mc-token` (required). Returns `{ count, entitlements: [] }` when called via `/inventory`; purchase routes return the raw upstream payload.

#### `GET /inventory/creators?includeUnknown=<bool>`

Headers: `authorization` (JWT), `x-mc-token` (required). Returns `{ count, totalItems, unknownCount, creators }` with creator ownership counts derived from entitlements and mapped to creator display names.

#### `GET /inventory/playfab/items?filter=<query>`

Headers: `authorization` (JWT), `x-playfab-session` (required), `x-playfab-id` (required). Returns the PlayFab Economy inventory payload with official PlayFab filter queries. Supported filter fields are `type`, `id`, and `stackId` with `eq`.

#### `POST /purchase/quote`

Headers: `authorization` (JWT) and **either** `x-mc-token` **or** `x-playfab-session`.
Body:

```json
{ "offerId": "<id>", "price": 123 }
```

* When Marketplace integration is **enabled**, the service fetches details and picks the authoritative price.
* When **disabled**, you **must** pass `price` (> 0).

Response:

```json
{ "offerId": "...", "price": 123, "details": { /* offer detail or {offerId} */ } }
```

#### `POST /purchase/virtual`

Headers: `authorization` (JWT) and **either** `x-mc-token` **or** `x-playfab-session`.
Body:

```json
{ "offerId": "<id>", "price": 123, "xuid": "<optional>" }
```

Response (example):

```json
{ "correlationId": "...", "deviceSessionId": "...", "seq": 42, "transaction": { /* upstream */ } }
```

### Usage Examples (cURL)

```bash
BASE=http://localhost:8090
TOKEN="<jwt>"
MC="<minecraft-auth-header>"
ST="<playfab-session-ticket>"

# Creators map
curl -sS "$BASE/marketplace/creators" \
 -H "Authorization: Bearer $TOKEN" \
 -H "x-mc-token: $MC"

# Quote an offer (MC token or PlayFab session)
curl -sS -X POST "$BASE/purchase/quote" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -H "x-mc-token: $MC" \
 -d '{"offerId":"<offerId>"}'

# Execute a virtual purchase
curl -sS -X POST "$BASE/purchase/virtual" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -H "x-playfab-session: $ST" \
 -d '{"offerId":"<offerId>","price":1230}'

# Balances
curl -sS "$BASE/inventory/balances" \
 -H "Authorization: Bearer $TOKEN" -H "x-mc-token: $MC"

# Entitlements (with receipts)
curl -sS "$BASE/inventory/entitlements?includeReceipt=true" \
 -H "Authorization: Bearer $TOKEN" -H "x-mc-token: $MC"

# Inventory creator counts
curl -sS "$BASE/inventory/creators?includeUnknown=true" \
 -H "Authorization: Bearer $TOKEN" -H "x-mc-token: $MC"

# PlayFab inventory items with filter query
curl -sS "$BASE/inventory/playfab/items?filter=type%20eq%20%27Subscription%27" \
 -H "Authorization: Bearer $TOKEN" -H "x-playfab-session: $ST" -H "x-playfab-id: <playfabId>"

# PlayFab inventory items with shortcut parameters
curl -sS "$BASE/inventory/playfab/items?type=Subscription" \
 -H "Authorization: Bearer $TOKEN" -H "x-playfab-session: $ST" -H "x-playfab-id: <playfabId>"

# Debug: decode multiple tokens
curl -sS -X POST "$BASE/debug/decode-token" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"tokens": {"mc":"'$MC'","pf":"'$ST'"}}'
```

---

## Rate Limiting

* **Global**: `600 req/min` per instance (`express-rate-limit`).
* **Purchase limiter**: included (`src/middleware/rateLimit.js`) for optional per‑route use (`window=60s`, `max=20`).

429 responses use a friendly JSON body:

```json
{ "error": { "code": "TOO_MANY_REQUESTS", "message": "Too many purchase requests" } }
```

---

## OpenAPI & Swagger UI

* Spec: **`GET /openapi.json`** (always available when `SWAGGER_ENABLED=true`).
* UI: **`GET /api-docs`** (Swagger UI).
* Global security scheme: `BearerAuth` (JWT).

---

## Logging

Request logger prints a single line on response finish:

```
HH:MM:SS [OK|WARN|ERR] <METHOD> <url> <status> <ms> #<id>
```

* Pretty mode (`LOG_PRETTY=true`): color badges via **chalk**.
* Compact mode: JSON‑like plain text.
* Each response includes `X-Request-Id`. Provide `x-correlation-id` or `x-request-id` to propagate.

---

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 8090
CMD ["node","src/server.js"]
```

### docker-compose

```yaml
version: "3.8"
services:
  purchase:
    build: .
    ports: ["8090:8090"]
    environment:
      PORT: 8090
      JWT_SECRET: ${JWT_SECRET}
      SWAGGER_ENABLED: "true"
      LOG_PRETTY: "false"
      ENABLE_MARKETPLACE_API: "false"
    restart: unless-stopped
```

### Kubernetes (snippet)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: playfab-purchase }
spec:
  replicas: 2
  selector: { matchLabels: { app: playfab-purchase } }
  template:
    metadata: { labels: { app: playfab-purchase } }
    spec:
      containers:
        - name: api
          image: ghcr.io/your-org/playfab-purchase:latest
          ports: [{ containerPort: 8090 }]
          envFrom: [{ secretRef: { name: purchase-secrets } }]
          readinessProbe: { httpGet: { path: "/readyz", port: 8090 }, initialDelaySeconds: 5 }
          livenessProbe:  { httpGet: { path: "/healthz", port: 8090 }, initialDelaySeconds: 10 }
---
apiVersion: v1
kind: Service
metadata: { name: playfab-purchase }
spec:
  selector: { app: playfab-purchase }
  ports: [{ port: 80, targetPort: 8090 }]
```

### Reverse Proxy (Nginx)

```nginx
server {
  listen 80;
  server_name purchase.example.com;
  location / {
    proxy_pass http://127.0.0.1:8090;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}
```

---

## Observability & Ops

* Propagate `X-Request-Id` across hops; logs include the short id suffix.
* Place a CDN/edge in front if desired; responses are small and cacheable where appropriate.
* Ensure upstream domains are reachable from your network; timeouts are 15s by default.

---

## Troubleshooting

* **401/403**: Missing/invalid JWT; ensure clients send `Authorization: Bearer <jwt>`.
* **400**: Missing headers (`x-mc-token` or `x-playfab-session`), invalid payload fields.
* **500**: Upstream errors; the response includes `{ error: { code, message, details? } }`.
* **Marketplace disabled**: Calls to `/marketplace/creator/summary` or `/marketplace/offer/details` return 500 with `Marketplace API disabled` unless toggled on.

---

## FAQ

**Do I need both MC token and PlayFab session?**
No. Provide **either** `x-mc-token` or `x-playfab-session`. If you send the SessionTicket, the service mints an MC token for you.

**Where does price come from?**
If Marketplace integration is enabled, price is resolved from offer details. Otherwise you must provide `price` when quoting/purchasing.

**What if the player already owns the item?**
Purchase will fail with `AlreadyOwned` mapped to a 500 with `code: "AlreadyOwned"` in `details`.

**How are errors shaped?**

```json
{
  "error": {
    "code": "BAD_REQUEST | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | INTERNAL | HTTP_4xx/5xx",
    "message": "Human readable",
    "details": { /* optional */ },
    "stack": "... (non‑prod only)"
  }
}
```

---

## Changelog Template

```markdown
## [1.2.0] - 2025-11-11
### Added
- Initial public release of PlayFab-Purchase Service
- Swagger UI and OpenAPI spec
- Marketplace creator/offer integrations (feature‑flagged)
- Token decoder utility

### Changed
- —

### Fixed
- —
```

---

## Contributing

1. Fork and create a feature branch.
2. Add tests where applicable.
3. Keep code style consistent and small modules.
4. Update README/OpenAPI when behavior changes.
5. Open a PR with clear description and logs/screenshots when relevant.

---

## License

This project
