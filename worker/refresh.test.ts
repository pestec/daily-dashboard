import assert from "node:assert/strict";
import test from "node:test";

import { readConfig } from "./config.ts";
import type { Env } from "./env.ts";
import { refreshDue } from "./refresh.ts";

/**
 * The Workers KV free tier allows 1,000 writes a day across the whole account,
 * and the cron is what spends them: five sources on a five-minute trigger is
 * 288 opportunities to write each. This walks a full simulated day of ticks
 * against a counting KV stub and asserts the total stays inside the tier, which
 * is the property that was actually being violated -- the daily cap was being
 * reached on days the board was never opened.
 */

const TICKS_PER_DAY = 288;
const TICK_MS = 5 * 60 * 1000;
const KV_FREE_TIER_DAILY_WRITES = 1_000;

class CountingKv {
  readonly store = new Map<string, string>();
  reads = 0;
  writes = 0;
  readonly writesByKey = new Map<string, number>();

  async get(key: string): Promise<unknown> {
    this.reads += 1;
    const raw = this.store.get(key);
    return raw === undefined ? null : JSON.parse(raw);
  }

  async put(key: string, value: string): Promise<void> {
    this.writes += 1;
    this.store.set(key, value);
    this.writesByKey.set(key, (this.writesByKey.get(key) ?? 0) + 1);
  }
}

/** Mirrors the vars in wrangler.jsonc. No secrets: with no Google Routes key
 *  the commute source takes its typical-value path and makes no upstream call. */
function testEnv(kv: CountingKv): Env {
  return {
    BOARD_KV: kv as unknown as KVNamespace,
    TIMEZONE: "Europe/London",
    WEATHER_LAT: "51.5",
    WEATHER_LON: "0.1",
    WEATHER_LABEL: "Home",
    COMMUTE_LABEL: "Work",
    COMMUTE_HOME_LABEL: "Home",
    COMMUTE_MORNING_WINDOW_START: "05:30",
    COMMUTE_MORNING_WINDOW_END: "09:00",
    COMMUTE_AFTERNOON_WINDOW_START: "15:00",
    COMMUTE_AFTERNOON_WINDOW_END: "19:00",
    COMMUTE_DAYS: "1,2,3,4,5",
    TFL_ROAD_IDS: "a12,a13,a406",
    TFL_LINE_MODES: "tube",
    CRYPTO_IDS: "ethereum,bitcoin,uniswap,chainlink,arbitrum,1inch,sei-network,render-token,solana,ondo-finance",
    CRYPTO_VS: "usd",
    BIN_PROVIDER: "manual",
    BIN_SCHEDULE: JSON.stringify([
      { kinds: ["general", "food"], anchor: "2026-01-07", intervalDays: 14 },
    ]),
    MOCK: "false",
  } as unknown as Env;
}

const TUBE_LINES = [
  "bakerloo",
  "central",
  "circle",
  "district",
  "hammersmith-city",
  "jubilee",
  "metropolitan",
  "northern",
  "piccadilly",
  "victoria",
  "waterloo-city",
];

const CRYPTO_IDS = [
  "ethereum",
  "bitcoin",
  "uniswap",
  "chainlink",
  "arbitrum",
  "1inch",
  "sei-network",
  "render-token",
  "solana",
  "ondo-finance",
];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Upstreams that behave like the real ones do with respect to *change*, which
 * is what the unchanged-write skip keys off:
 *
 *  - weather and crypto return something different on every call, so nothing
 *    dedupes them and their cadence is the only thing bounding their cost;
 *  - TfL returns good service all day, as it nearly always does.
 *
 * That combination is the honest upper bound rather than a flattering one.
 */
function installFetchStub(clock: { now: number }): () => void {
  const original = globalThis.fetch;

  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    // Something changing every tick, so weather and crypto never dedupe.
    const drift = clock.now / TICK_MS;

    if (url.includes("api.open-meteo.com")) {
      return Promise.resolve(json({
        utc_offset_seconds: 3600,
        current: {
          time: "2026-09-07T00:00",
          temperature_2m: 15 + (drift % 7),
          apparent_temperature: 14 + (drift % 7),
          is_day: 1,
          weather_code: 3,
          wind_speed_10m: 12,
          relative_humidity_2m: 70,
          precipitation: 0,
        },
        hourly: {
          time: ["2026-09-07T01:00", "2026-09-07T02:00"],
          temperature_2m: [15, 16],
          weather_code: [3, 3],
          precipitation_probability: [10, 20],
          is_day: [1, 1],
        },
        daily: {
          time: ["2026-09-07"],
          weather_code: [3],
          temperature_2m_max: [20],
          temperature_2m_min: [12],
          precipitation_probability_max: [30],
        },
      }));
    }

    if (url.includes("/Line/Mode/")) {
      return Promise.resolve(json(
        TUBE_LINES.map((id) => ({
          id,
          name: id,
          lineStatuses: [{ statusSeverity: 10, statusSeverityDescription: "Good Service" }],
        })),
      ));
    }

    if (url.includes("api.tfl.gov.uk/Road/")) {
      const roadId = /\/Road\/([^/]+)\//.exec(url)?.[1] ?? "a12";
      return Promise.resolve(json([{
        id: roadId,
        displayName: roadId.toUpperCase(),
        statusSeverity: "Good",
        statusSeverityDescription: "No Exceptional Delays",
      }]));
    }

    if (url.includes("api.coingecko.com")) {
      return Promise.resolve(json(
        CRYPTO_IDS.map((id, i) => ({
          id,
          symbol: id.slice(0, 3),
          current_price: 100 + i + (drift % 11),
          price_change_percentage_24h: 1.5,
          price_change_percentage_7d_in_currency: 2.5,
        })),
      ));
    }

    throw new Error(`unexpected fetch in test: ${url}`);
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = original;
  };
}

test("a full day of cron ticks stays inside the KV free tier write allowance", async () => {
  const kv = new CountingKv();
  const env = testEnv(kv);
  const config = readConfig(env);

  // Monday, so the commute windows are active for part of the day.
  const start = Date.UTC(2026, 8, 7, 0, 0, 0);
  assert.equal(new Date(start).getUTCDay(), 1, "simulated day should be a Monday");

  const clock = { now: start };
  const restoreFetch = installFetchStub(clock);

  try {
    for (let tick = 0; tick < TICKS_PER_DAY; tick += 1) {
      clock.now = start + tick * TICK_MS;
      await refreshDue(config, env, new Date(clock.now));
    }
  } finally {
    restoreFetch();
  }

  const perKey = Object.fromEntries(kv.writesByKey);

  // Every source must have written at least once, otherwise this is measuring
  // a day in which the fixtures failed to parse rather than a day of refreshes.
  for (const key of ["source:weather", "source:tfl", "source:crypto"]) {
    assert.ok((perKey[key] ?? 0) > 0, `${key} never wrote: ${JSON.stringify(perKey)}`);
  }

  // No envelope may be written on every tick -- that is the shape of the bug.
  for (const [key, count] of kv.writesByKey) {
    assert.ok(
      count < TICKS_PER_DAY,
      `${key} wrote on every tick (${count}), which is the runaway pattern`,
    );
  }

  assert.ok(
    kv.writes < KV_FREE_TIER_DAILY_WRITES / 2,
    `a quiet day should leave headroom, used ${kv.writes}: ${JSON.stringify(perKey)}`,
  );

  console.log(`  writes in a simulated day: ${kv.writes}`, perKey);
});

test("commute writes nothing outside its window", async () => {
  const kv = new CountingKv();
  const env = testEnv(kv);
  const config = readConfig(env);

  // Sunday 02:00 UTC: no commute day, no window.
  const start = Date.UTC(2026, 8, 6, 2, 0, 0);
  const clock = { now: start };
  const restoreFetch = installFetchStub(clock);

  try {
    for (let tick = 0; tick < 12; tick += 1) {
      clock.now = start + tick * TICK_MS;
      await refreshDue(config, env, new Date(clock.now), ["commute"]);
    }
  } finally {
    restoreFetch();
  }

  assert.equal(kv.writes, 0, "an inactive commute must not write a null envelope");
});
