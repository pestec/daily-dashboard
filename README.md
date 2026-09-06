# Daily Dashboard

An always-on information board for a TV. Clock and weather, morning commute,
live traffic around home, bin collections and crypto — on one fixed 1920×1080
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
Cron (every 5 min) ──► refresh whatever is due ──► KV
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
| `npm test` | Worker unit tests, plus the KV write-budget simulation |
| `npm run deploy` | Build and deploy the Worker and its assets |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |

Run `typecheck`, `lint`, `test` and `build` before committing.

## URL flags

Nothing on the board is interactive, so these are how you inspect it.

| Flag | Effect |
| --- | --- |
| `?debug` | Overlays fetch timings, per-source freshness and errors |
| `?mock=ambient` \| `morning` \| `degraded` | Serves a fixture, even in production |
| `?mode=morning` \| `ambient` | Forces a layout |
| `?focus=map` \| `tfl` | Picks what fills the focus slot outside commute windows |
| `?night=1` \| `0` | Forces the dim or bright palette |

`?mock=degraded` is the useful one: it puts two dead sources and two stale ones
on screen at once, so you can check the failure states on the real device
without breaking anything.

`?focus=tfl` brings back the tube and road disruption board the traffic map
replaced. It is still built and still fetched, so the two can be compared on
the actual screen without a deploy. Pair it with `?night=0` after 22:00, since
the map blanks itself overnight.

## Deploying

### 1. KV namespace

Already created and wired up in `wrangler.jsonc`. If you ever need a fresh one
(a different account, say):

```bash
npx wrangler kv namespace create BOARD_KV
```

…and paste the returned id into `kv_namespaces[0].id`. The id is an identifier,
not a credential — it is safe to commit, and Cloudflare's own templates do.

#### The write budget

The KV free tier allows **1,000 writes a day for the whole account**, and reads
are effectively free at 100,000. The cron is what spends the writes, not the
board: a source on a five-minute cadence writes 288 times a day on its own, so
five of them will exhaust the tier overnight with nobody watching.

Three rules keep it inside the allowance, and `worker/refresh.test.ts` walks a
full simulated day of ticks to prove it:

- a source that returns exactly what is already cached is not rewritten, until
  its stamp is one cadence away from crossing its TTL;
- a source with nothing to cache — the commute outside its window — writes
  nothing at all rather than storing a null;
- cadences below 900s are reserved for sources that earn it.

That comes to roughly 380 writes on a weekday. Before adding a source or
tightening a cadence in `CADENCE`, check the total is still under the cap:

```bash
npm test
```

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

**Keep your real coordinates out of the repo.** Set them in the Cloudflare
dashboard under **Worker → Settings → Variables and Secrets**, as plaintext
variables: `WEATHER_LAT`, `WEATHER_LON`, `HOME_LAT`, `HOME_LON`, `WORK_LAT`,
`WORK_LON`, and your own `BIN_SCHEDULE`. These seven are the only configuration
`wrangler.jsonc` does not carry, and that absence is what protects them — see
the note below before adding any of them back.

The traffic map's four optional vars — `MAP_LAT`, `MAP_LON`, `MAP_ZOOM` and
`MAP_ID` — are dashboard-owned for a different reason: the right zoom is found
by standing in front of the TV and trying one, and a var in `wrangler.jsonc`
could not be changed without a deploy. Left unset, the map centres on `HOME_*`
at zoom 11.

`HOME_*` and `WORK_*` are load-bearing: leave one unset and the commute is
routed between two placeholder points in central London rather than falling
back to anything sensible. Confirm all four with `/api/debug/commute-live`
after setting them.

> **Why these seven are missing from `wrangler.jsonc`.** `keep_vars: true` is
> necessary but not sufficient. It stops wrangler *deleting* dashboard vars the
> config does not mention; it does not stop it *overwriting* the ones it does.
> Every key under `vars` is uploaded on each deploy and replaces whatever the
> dashboard holds — so a var listed there with a placeholder is reset to that
> placeholder on every single push, flag or no flag. The only way to leave a
> value under the dashboard's control is to keep its key out of `vars`
> entirely. Do not "document" a real var by adding a placeholder for it; add it
> to [`.env.example`](.env.example) instead, which is not uploaded. The
> fallbacks for an unset var live in [`worker/config.ts`](worker/config.ts).

> **The same flag means obsolete vars are never cleaned up.** Because wrangler
> no longer deletes what it does not mention, a variable you remove from
> `wrangler.jsonc` — or one that was only ever set by hand — stays on the
> deployed Worker until you delete it in the dashboard yourself. Nothing on the
> board reads an unknown var, so a stale one is clutter rather than a hazard;
> `grep -rho 'env\.[A-Z][A-Z0-9_]*' worker/ | sort -u` lists everything the
> Worker actually reads, and anything outside that list plus the two secrets is
> safe to remove.

Note that a variable change only reaches the board once that source next
refreshes, since tiles render from the cached payload — up to 15 minutes for
weather.

Every variable is documented in [`.env.example`](.env.example).

### 3.5 Browser Rendering for bins

The Havering provider now depends on Cloudflare Browser Rendering. Keep the
`browser.binding` entry in [`wrangler.jsonc`](wrangler.jsonc) as `BROWSER`, and
enable Browser Rendering for the Worker in Cloudflare if your account requires
an explicit toggle.

### 4. Secrets

```bash
npx wrangler secret put GOOGLE_ROUTES_API_KEY
npx wrangler secret put COINGECKO_API_KEY
npx wrangler secret put GOOGLE_MAPS_BROWSER_KEY
```

Or add them in the dashboard under **Worker → Settings → Variables and
Secrets** → *Add* → type **Secret**. Either way they arrive as `env.<NAME>`;
nothing in the code cares which route was used, and a secret set in the
dashboard survives a deploy. Locally, copy `.dev.vars.example` to `.dev.vars`
instead — it is gitignored.

**`GOOGLE_ROUTES_API_KEY` is genuinely optional.** Without it the commute tile
shows a labelled typical fallback and never calls the routing API.

**`COINGECKO_API_KEY` is optional in theory and required in practice.**
CoinGecko's keyless tier is limited per source IP, and a Worker egresses from
shared Cloudflare datacenter ranges — so it returns 429 no matter how little
this board asks for, and the crypto tile silently serves its last good value
behind a staleness marker until you add one.

Use a **Demo** key, which is free. This code sends `x-cg-demo-api-key` to
`api.coingecko.com`, which is the Demo pairing; a paid **Pro** key wants
`pro-api.coingecko.com` and `x-cg-pro-api-key` and will get a 400 here.

Check it took with `/api/debug/crypto-live` — see below.

**`GOOGLE_MAPS_BROWSER_KEY` is not a secret, and must be restricted.**
Without it the traffic tile says "Not configured" and loads nothing. It is
stored as a secret only to keep it out of the repo: it is a *Maps JavaScript
API* key, which by design is handed to the browser to load Google's script,
and it therefore also travels in `/api/board`, which is public. Secrecy is not
what protects it. Two settings are:

1. **Application restriction → HTTP referrers**, listing only the board's own
   origin, e.g. `https://daily-dashboard.<subdomain>.workers.dev/*`.
2. **API restriction → Maps JavaScript API** alone. Not the Routes API — keep
   that on `GOOGLE_ROUTES_API_KEY`, which never leaves the Worker.

Enable the Maps JavaScript API on the Google Cloud project first, or the
script loads and the tile renders Google's own error over a grey rectangle.

Cost is not the concern it looks like. Google bills dynamic maps per map
*load* — each time a map object is constructed — not per traffic repaint, and
the traffic layer refreshes itself inside a map that is already on screen.
This board constructs one on the nightly reload, on each mode change, and
when the map wakes in the morning: single figures a day, against a free
monthly allowance in the thousands. It is the kiosk shape of the thing — one
page, open for weeks — that makes a live map essentially free here.

## How it behaves

**Three tiles at a time, sometimes four.** Weather — which carries the clock —
holds the top-left block permanently, so the two things glanced at most never
move. Crypto owns the right-hand column. The block below weather belongs to
whichever of commute or traffic is relevant, and they are never both up.

**The board changes with the time of day.** On configured weekdays, commute is
active in two windows: 05:30-09:00 (Home -> Work) and 15:00-19:00
(Work -> Home). Inside a window the only question is how long the drive is, so
the commute tile takes the slot; outside one it is what the roads around home
look like, so the traffic map does. The Worker decides which, so the layout
does not depend on the TV's clock.

**The traffic map is the one tile that draws itself.** Everything else renders
from the cached payload; the map is a live Google map with the traffic layer
on, and the payload carries only where to centre it, how far out, and the key.
There is no staleness marker on it because there would be nothing true to put
in one — Google refreshes the traffic inside the map on its own schedule.

**Bins only shows up when it matters.** The tile appears on the eve of a
collection and is absent every other day — a panel that spends six days a week
saying "not yet" is six days of clutter for one day of use. It takes the bottom
of the crypto column when it does appear.

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

**The map gets its own burn-in treatment, because it needs it.** It is the
largest continuous area on the board and it draws a shape that is identical
every day — a road network never moves — which is the exact pattern a panel
retains. Four things work against that:

- It is **only up outside commute windows**, and **blanked entirely overnight**
  between the configured night hours rather than dimmed. Not drawing it for
  nine hours a day beats any amount of dimming, and there is no traffic to
  report at 03:00. `VITE_MAP_HIDE_AT_NIGHT=false` keeps it on.
- The map layer **drifts 16px around its own box every 7 minutes**, on top of
  the board's own 6px/10min creep. The periods differ on purpose: on the same
  period the two stay locked and add up to one bigger step instead of covering
  more pixels. The layer is oversized by the drift distance, so it never
  uncovers an edge.
- It is drawn in a **dark, low-luminance style** with points of interest,
  transit and street labels off, leaving Google's green/amber/red as the only
  saturated thing on screen — which is also what makes it readable at a glance.
- Nothing bright is pinned over it. The only overlay is the small "Traffic"
  label, which moves with the board's own shift.

## Data sources

| Tile | Source | Key | Refresh | Notes |
| --- | --- | --- | --- | --- |
| Weather + clock | Open-Meteo | none | 15 min | Current, next 12 hours, next 7 days |
| Commute | Google Routes API | optional | 5 min | Morning and afternoon windows, one direction at a time |
| Traffic | Google Maps JavaScript API | required for the tile | live | Drawn in the browser outside commute windows. No KV writes, no Worker requests |
| Disruption | TfL Unified API | none | 5 min | All 11 tube lines + A12/A13/A406. No longer on the board -- reachable at `?focus=tfl`. Roads are limited to TfL's own network -- no motorways |
| Bins | Havering collection-day portal (rendered) | none | ~3.5 days | Only on the eve of a collection; scrape, then manual-schedule fallback |
| Crypto | CoinGecko | optional | 5 min | 10 tickers in USD, with 24h and 7d change |

### Commute debug endpoint

`/api/debug/commute-live` performs one live Google Routes call and returns the
raw upstream JSON, the parsed commute payload, and — under `resolved` — the two
endpoints the Worker actually routed between.

Check `resolved` after changing `HOME_LAT`/`HOME_LON`/`WORK_LAT`/`WORK_LON`. A
commute from the wrong coordinates still returns a perfectly plausible journey
time, so the board cannot tell you the variable did not take effect; this can.
It is intended for shape-verification while setting up route fields and should
not be polled.

### Crypto debug endpoint

`/api/debug/crypto-live` returns the coin ids and currency the Worker actually
resolved, plus one live CoinGecko fetch that bypasses KV. Use it when the tile
shows the wrong coins: a failed refresh keeps the last good value, so stale
data and a broken upstream look identical on the board.

### Bins debug endpoint

`/api/debug/bins-live` performs one live bins-provider fetch and returns the
raw provider payload plus the parsed bins result. In rendered Havering mode the
raw payload is the extracted table rows from the browser session, which helps
confirm exactly what was visible after page JavaScript ran.

### Bins

Default provider is Havering's collection-day page for your configured street:

`https://portal.havering.gov.uk/Process-Waste-CollectionDays/?type=CD&uprn=010096017137&usrn=21300590`

It uses Cloudflare Browser Rendering to load the page as a real browser,
waits for the rendered table rows, then extracts Domestic Waste and Recycling
dates into board kinds. If browser rendering is unavailable, or rows cannot be
read, it falls back to the manual recurring schedule configured in
`BIN_SCHEDULE`:

```json
[
  { "kinds": ["general", "food"], "anchor": "2026-01-07", "intervalDays": 14 },
  { "kinds": ["recycling", "garden", "food"], "anchor": "2026-01-14", "intervalDays": 14 }
]
```

`anchor` is any date you know a collection actually happened on; everything else
is derived from it. Valid kinds are `general`, `recycling`, `garden`, `food`.

`worker/sources/bins/havering.ts` implements the scraper. Providers still share
the same interface, so any future council/provider can be swapped in by
registering it in `worker/sources/bins/index.ts`.

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
