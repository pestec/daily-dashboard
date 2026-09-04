# Daily Dashboard

An always-on information board for a TV. Weather, morning commute, transport
disruption, bin collections, crypto, and a clock — on one fixed 1920×1080
screen with no scrolling and nothing to interact with.

Built to run for weeks unattended in a living room: dark palette, per-tile
failure isolation, automatic recovery when Wi-Fi drops, burn-in mitigation, and
a nightly reload.

- **Frontend** — React + TypeScript + Vite + Tailwind v4, built to static assets.
- **Backend** — a single Cloudflare Worker. It serves those assets *and*
  `GET /api/board`, so there is one deploy, one origin, and no CORS.
- **Data** — a Cron Trigger refreshes each source into Workers KV on its own
  schedule. `/api/board` only ever reads that cache, so a page reload never
  costs API quota and the board never waits on a third party.

```
Cron (every 2 min) ──► refresh whatever is due ──► KV
                                                   │
                    TV ──► GET /api/board ─────────┘  (cache only)
```

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:5173>. The Vite plugin runs the real Worker alongside
the frontend, with a local KV, so `/api/board` behaves exactly as it does in
production.

To build the whole UI with no keys and no network, set `VITE_USE_MOCK=true` in
`.env.local`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite + the Worker, together, on :5173 |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | Regenerates Worker types, then `tsc --build` |
| `npm run lint` | ESLint over app, Worker and shared code |
| `npm run deploy` | Build and deploy the Worker and its assets |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |

Run `typecheck`, `lint` and `build` before committing.

## URL flags

Nothing on the board is interactive, so these are how you inspect it.

| Flag | Effect |
| --- | --- |
| `?debug` | Overlays fetch timings, per-source freshness and errors |
| `?mock=ambient` \| `morning` \| `degraded` | Serves a fixture, even in production |
| `?mode=morning` \| `ambient` | Forces a layout |
| `?night=1` \| `0` | Forces the dim or bright palette |

`?mock=degraded` is the useful one: it puts two dead sources and two stale ones
on screen at once, so you can check the failure states on the real device
without breaking anything.

## Deploying

### 1. KV namespace

Already created and wired up in `wrangler.jsonc`. If you ever need a fresh one
(a different account, say):

```bash
npx wrangler kv namespace create BOARD_KV
```

…and paste the returned id into `kv_namespaces[0].id`. The id is an identifier,
not a credential — it is safe to commit, and Cloudflare's own templates do.

### 2. Deploy

Requires Node 22.12 or newer — `.node-version` pins this for Cloudflare's
build image, which otherwise picks a default too old for Vite 8 and wrangler.

Connect the repo for automatic deploys — Cloudflare dashboard → **Workers** →
**Create** → **Import a repository**. You can leave the Build command field
empty: `wrangler.jsonc` declares `build.command`, so wrangler runs the build
itself before uploading. Either `npx wrangler deploy` or
`npx wrangler versions upload` works as the deploy command.

Or deploy by hand with `npm run deploy`.

Once connected, every push to a branch gets its own preview URL of the form
`<branch>-daily-dashboard.<subdomain>.workers.dev`.

> **Two configs, both valid.** `npm run deploy` points wrangler at
> `dist/daily_dashboard/wrangler.json`, which the Vite plugin generates during
> the build. Plain `npx wrangler deploy` reads the root `wrangler.jsonc`
> instead. Both are kept working: the root config sets `assets.directory` to
> `./dist/client` explicitly so the default command does not fail, and the
> generated config overrides it with its own relative path.

### 3. Set your real configuration

**Keep your real coordinates out of the repo.** The values in `wrangler.jsonc`
are placeholders. Set the real ones in the Cloudflare dashboard under
**Worker → Settings → Variables and Secrets**, as plaintext variables:
`WEATHER_LAT`, `WEATHER_LON`, `HOME_LAT`, `HOME_LON`, `WORK_LAT`, `WORK_LON`,
and your own `BIN_SCHEDULE`.

Every variable is documented in [`.env.example`](.env.example).

### 4. Secrets (both optional)

```bash
npx wrangler secret put TOMTOM_API_KEY
npx wrangler secret put COINGECKO_API_KEY
```

Locally, copy `.dev.vars.example` to `.dev.vars` instead — it is gitignored.

**The board works with no secrets at all.** Weather (Open-Meteo), disruption
(TfL) and crypto (CoinGecko) are all keyless, and bins come from your config.
Without `TOMTOM_API_KEY` the commute tile shows `COMMUTE_TYPICAL_MINUTES`,
clearly labelled as typical, and never calls the routing API.

## How it behaves

**The board changes with the time of day.** Inside the commute window on a
configured weekday it switches to a morning layout: the commute takes the
top-right with a large colour-coded number, and weather shrinks to a wide band
showing only the next 12 hours. The rest of the day, weather takes the largest
cell and the commute shrinks to a single line. The Worker decides which, so the
layout does not depend on the TV's clock.

**Each tile fails on its own.** Every source carries its own status, timestamp
and TTL. A dead source greys one tile; a stale one keeps showing its last good
value behind an age marker. Every tile is wrapped in an error boundary, so even
a render crash cannot white-screen a display nobody is standing in front of.

**It recovers by itself.** Polling is a self-rescheduling timeout, never
`setInterval`, so a slow response cannot stack up requests. Failures back off
exponentially to 60s with jitter, and `online` / `visibilitychange` force an
immediate retry — so Wi-Fi returning brings the board back in seconds.

**It looks after the panel.** The whole layout creeps a few pixels around a
small box every 10 minutes under a 20-second transition, invisible from a sofa
but enough that nothing static sits on the same pixels for weeks. The palette
dims between the configured night hours by swapping design tokens. Once a day
at a quiet hour the page reloads itself.

## Data sources

| Tile | Source | Key | Refresh | Notes |
| --- | --- | --- | --- | --- |
| Weather | Open-Meteo | none | 15 min | Current, next 12 hours, next 3 days |
| Commute | TomTom Routing | optional | 2 min | Morning window only — ~105 calls a weekday, well inside the 2,500/day free tier |
| Disruption | TfL Unified API | none | 5 min | Line status plus road corridors |
| Bins | Config schedule | none | 6 h | Pluggable provider, see below |
| Crypto | CoinGecko | optional | 5 min | |

### Bins

Council endpoints are unreliable and change without notice, so the default
provider is a recurring schedule you configure yourself, in `BIN_SCHEDULE`:

```json
[
  { "kinds": ["general", "food"], "anchor": "2026-01-07", "intervalDays": 14 },
  { "kinds": ["recycling", "garden", "food"], "anchor": "2026-01-14", "intervalDays": 14 }
]
```

`anchor` is any date you know a collection actually happened on; everything else
is derived from it. Valid kinds are `general`, `recycling`, `garden`, `food`.

`worker/sources/bins/havering.ts` is a deliberate stub implementing the same
interface. Havering publishes no documented API for collection dates, so the
only option would be scraping a page that changes without warning — which
breaks quietly on a screen nobody is watching. Selecting it falls back to the
manual schedule, and the tile reports which provider actually answered. To add
a real one, implement `BinProvider` and register it in
`worker/sources/bins/index.ts`.

## Device setup

See [docs/DEVICE_SETUP.md](docs/DEVICE_SETUP.md) for putting this on a Fire TV
Stick with Fully Kiosk Browser.

## Project layout

```
shared/     Payload contract and fixtures — imported by both sides
worker/     Worker entry, config, KV cache, cron refresh, data sources
src/        React app: hooks, tiles, debug overlay
docs/       Device setup
```

`shared/types.ts` is the contract between the two. Changing a payload shape
breaks the typecheck rather than the TV.
