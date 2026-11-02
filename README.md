# Agent Bridge Control Centre

A **read-only** monitoring console for the ChatGPT ↔ Instinct AI Agent Bridge. It shows Josh, on one screen, what each agent is responsible for, what is blocked, what needs his decision, which handoffs were delivered or processed, and the newest bridge activity that has recorded evidence.

It is not a chatbot, not a task tracker and not a replacement for the bridge Google Sheet. The Sheet stays authoritative.

> **Phase 1 status:** runs entirely on **fictional demo data**. No live bridge records, credentials or Sheet identifiers are in this repository or its build output.
>
> **Live demo:** https://nerradrekab.github.io/agent-bridge-dashboard/
>
> **Real data:** a private copy runs on a Cloudflare Worker behind a Cloudflare Access login (`worker/`). Setup steps for beginners are in [docs/LIVE_DATA_SETUP.md](docs/LIVE_DATA_SETUP.md).

## Live data (private)

`worker/` is a Cloudflare Worker that serves a live-data build of this same app (`npm run build:private`, configured by `.env.private`) and implements the read-only API in `docs/API_CONTRACT.md`.

- It reads the Sheet with a **read-only** Google service account. Columns are matched by header name, and a changed layout fails closed with "Source unavailable".
- It checks the Cloudflare Access login on every API call. It refuses all requests until the Access settings exist.
- All configuration lives in **Worker secrets**: Sheet ID, key, Access settings and allowed email. None of it is in this repo.
- Worker tests use synthetic rows only (`worker/test/`).

Deploy with `npm run worker:deploy` once Wrangler is logged in.

## Quick start

Requires Node 22+.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc -b` (strict) |
| `npm test` | Vitest (unit + UI) |
| `npm run check` | typecheck → tests → build (what CI runs) |
| `npm run scan:dist` | Scan `dist/` for Sheet URLs, Sheet-ID-shaped tokens and secrets |
| `npm run scan:staged` | Same scan over files staged for commit |

### Pre-commit guard (recommended)

```bash
printf '#!/bin/sh\nexec node scripts/check-no-secrets.mjs --staged --deny-file ../private/deny.txt\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The optional deny file sits **outside** the repo and lists literal strings that must never be committed, such as the real Sheet ID, one per line. This lets the guard check for the ID without the ID ever appearing in the repo.

## Configuration

All configuration is public, build-time `VITE_*` variables (see `.env.example`). **Everything here is inlined into the browser bundle.** Never put secrets, Sheet IDs or URLs here.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_DATA_SOURCE` | `mock` | `mock` (fictional fixtures) or `http` (secure proxy API) |
| `VITE_API_BASE_URL` | – | Proxy origin, e.g. `https://bridge-api.example.com`. HTTPS required (localhost allowed). |
| `VITE_BASE_PATH` | `/` | Asset base path. Project Pages need `/<repo>/`. |
| `VITE_STALE_AFTER_MINUTES` | `180` | Source age after which the UI shows a stale banner |

### Changing the base path

GitHub *project* Pages serve from `https://<user>.github.io/<repo>/`, so the Pages workflow builds with `VITE_BASE_PATH=/<repo>/`. For a custom domain, or a `<user>.github.io` repo, use `/`. For any other static host, set it to whatever sub-path the site is served from. Routing uses hash URLs (`#/tasks`), so no server rewrite rules are needed.

## Architecture

```
 ┌──────────────────────── Browser (static, GitHub Pages) ───────────────────────┐
 │                                                                               │
 │  views/  Overview · Tasks · Agents · Messages · Delivery · Approvals · Conn.  │
 │     │            (read-only; raw status text always shown)                    │
 │     ▼                                                                         │
 │  data/hooks.ts ── TanStack Query (in-memory cache only, no persistence)       │
 │     │                                                                         │
 │     ▼                                                                         │
 │  BridgeDataSource  (data/source.ts — the only seam)                           │
 │     ├── mock adapter  → data/mock/fixtures.ts  (fictional, relative to now)   │
 │     └── http adapter  → GET {VITE_API_BASE_URL}/api/v1/*                      │
 │                          credentials: include, no tokens in the browser       │
 │  domain/  types · status classifier · pure derivations (now injected)         │
 └──────────────────────────────────────────┬────────────────────────────────────┘
                                            │ HTTPS + session cookie
                          (Phase 2, not built)
 ┌──────────────────────────────────────────▼────────────────────────────────────┐
 │  Authenticated read-only proxy (e.g. Cloudflare Worker behind Access)         │
 │  holds a read-only service-account credential; reads the 7 tabs; returns the  │
 │  Envelope contract in docs/API_CONTRACT.md                                    │
 └──────────────────────────────────────────┬────────────────────────────────────┘
                                            ▼
                     Bridge Google Sheet (authoritative; unchanged)
```

- **`src/domain/`**: types mirroring the seven Sheet tabs, the free-text status classifier, and pure derivations (`needsJosh`, `diagnoseDelivery`, `agentActivity`, `buildOverview` and so on). Fully unit-tested, with `now` injected.
- **`src/data/`**: the `BridgeDataSource` interface, the mock and HTTP adapters, and the React Query hooks. Every method returns `Envelope<T> = { data, meta }`. `meta` carries `generatedAt`, `sourceUpdatedAt`, `isDemo` and `warnings`.
- **`src/components/`**: small shared UI pieces such as `StatusBadge`, `Timestamp`, `EvidenceTag`, `Drawer`, `QueryBoundary` and `FreshnessBanner`.
- **`src/views/`**: one file per screen.

### Evidence rules the UI enforces

| Class | Source | Shown as |
|---|---|---|
| **observed** | Timestamps written by bridge automation (Delivery log) | ◉ Observed |
| **reported** | Text an agent wrote about its own work (Messages, Task board evidence) | ◐ Reported |
| **hypothesis** | Attributed assumptions (`Mission and profiles`) | ◇ Hypothesis |
| **unknown** | Empty cell | ? Unknown |

- The UI never says an agent is "online" or "healthy". "Last verified activity" is the newest **observed** timestamp. Delivery diagnosis uses recorded timestamps only.
- Status cells are always shown verbatim. The glyph and colour are a secondary interpretation, explained in the tooltip. Text that doesn't match a known pattern is labelled *Unclassified* rather than guessed. Mixed text is marked *(mixed)*.
- Unparseable dates show **Unknown** plus the raw text.

### Adding an agent

No UI change is needed. The API returns another `AgentInventory` (`agentId`, `displayName`, `aliases`, `inventoryTab`, `items`) from `/api/v1/agents`. Aliases drive matching in the free-text Owner/From/To cells. An agent without a predefined colour gets a neutral one. To give it a colour, add a `--ag-*` token in `index.css` and an entry in `AgentChip.tsx`.

## Security boundary

- GitHub Pages is **public static hosting**. Anything in the bundle is readable by anyone who loads it. A Sheets API key, OAuth secret or service-account JSON can therefore never be shipped to the browser, including through GitHub Actions secrets that get inlined at build time.
- Live data must come from a **separate authenticated server-side proxy** that validates the user and performs read-only Sheet access. See `docs/PHASE2_PROPOSAL.md`.
- The HTTP adapter sends **no credentials of its own**. It relies on the proxy's session cookie (`credentials: 'include'`), refuses non-HTTPS base URLs, and uses `cache: 'no-store'`.
- Records are cached **in memory only** and are never written to `localStorage` or IndexedDB. The only stored value is the theme preference.
- There are **no write paths**. The Approvals page is a derived reading list with no buttons.
- `.gitignore` excludes `.env*` (except `.env.example`), `*.csv`, `*.xlsx` and `private/`. `scripts/check-no-secrets.mjs` guards commits and build output.
- `index.html` sets `noindex, nofollow` and `referrer: no-referrer`.

## Real vs simulated

| Real (works now) | Simulated / not built |
|---|---|
| All seven views, filters, drawers, loading/empty/error/stale states | Every record shown: fictional fixtures in `src/data/mock/fixtures.ts` |
| Status classification, evidence rules, delivery diagnosis | The proxy API: contract only, in `docs/API_CONTRACT.md` |
| HTTP adapter (tested against mocked `fetch`) | Authentication: expected from the proxy (e.g. Cloudflare Access) |
| Public GitHub Pages site serving the demo build | Nothing live is deployed; the public site only ever shows fictional data |
| Unit and UI tests, secret/Sheet-ID scan | Any connection to the live Sheet, Apps Script or Gmail signals |

## Deployment

The repository is public and GitHub Pages is enabled with *Source: GitHub Actions*. `.github/workflows/pages.yml` runs `npm ci` → `npm run check` → builds with `VITE_BASE_PATH=/<repo>/` and `VITE_DATA_SOURCE=mock` → scans `dist/` → deploys.

Deploys are **manual** (`workflow_dispatch`):

```bash
gh workflow run pages.yml
```

To deploy on every push to `main` instead, add a `push: { branches: [main] }` trigger to the workflow. The public build always uses the mock adapter. Never point a public bundle at a live API that isn't behind access control.
