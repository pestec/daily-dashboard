import type {
  BoardMode,
  BoardPayload,
  Bins,
  Crypto,
  Commute,
  Source,
  Tfl,
  Weather,
  WeatherDay,
  WeatherHour,
} from "./types.ts";

/**
 * Fixtures for developing and reviewing the whole UI with no keys and no
 * network. Lives in shared/ because the Worker serves them too when MOCK is
 * on, so the deployed preview shows a real board before any API is wired.
 */
export type MockVariant = "ambient" | "morning" | "degraded";

export const MOCK_VARIANTS: readonly MockVariant[] = [
  "ambient",
  "morning",
  "degraded",
];

export function isMockVariant(value: string | null): value is MockVariant {
  return value !== null && (MOCK_VARIANTS as readonly string[]).includes(value);
}

function ok<T>(data: T, ttlSeconds: number, ageSeconds = 30): Source<T> {
  return {
    status: "ok",
    data,
    fetchedAt: new Date(Date.now() - ageSeconds * 1000).toISOString(),
    ttlSeconds,
  };
}

/** Old data still on screen, plus the marker that says so. */
function stale<T>(data: T, ttlSeconds: number, ageSeconds: number): Source<T> {
  return {
    status: "stale",
    data,
    fetchedAt: new Date(Date.now() - ageSeconds * 1000).toISOString(),
    ttlSeconds,
    error: "Upstream did not respond",
  };
}

/** Never came back at all -- nothing to show. */
function failed<T>(ttlSeconds: number, error: string): Source<T> {
  return { status: "error", data: null, fetchedAt: null, ttlSeconds, error };
}

function disabled<T>(ttlSeconds: number): Source<T> {
  return { status: "disabled", data: null, fetchedAt: null, ttlSeconds };
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const HOURLY_SHAPE: ReadonlyArray<[tempC: number, code: number, popPct: number]> =
  [
    [13, 3, 10],
    [13, 3, 10],
    [12, 61, 45],
    [12, 61, 60],
    [11, 63, 75],
    [11, 61, 55],
    [10, 3, 30],
    [10, 2, 15],
    [9, 2, 10],
    [9, 1, 5],
    [8, 1, 5],
    [8, 0, 0],
  ];

function buildHourly(): WeatherHour[] {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  return HOURLY_SHAPE.map(([temperatureC, code, precipitationProbabilityPct], i) => {
    const time = new Date(start.getTime() + i * 3_600_000);
    const hour = time.getHours();
    return {
      time: time.toISOString(),
      temperatureC,
      code,
      precipitationProbabilityPct,
      isDay: hour >= 7 && hour < 19,
    };
  });
}

const DAILY: ReadonlyArray<Omit<WeatherDay, "date">> = [
  { minC: 8, maxC: 14, code: 61, precipitationProbabilityPct: 70 },
  { minC: 7, maxC: 13, code: 3, precipitationProbabilityPct: 25 },
  { minC: 9, maxC: 16, code: 1, precipitationProbabilityPct: 5 },
];

const weather: Weather = {
  label: "Home",
  now: {
    temperatureC: 13,
    apparentC: 11,
    code: 61,
    isDay: true,
    windKph: 18,
    humidityPct: 82,
    precipitationMm: 0.4,
  },
  hourly: buildHourly(),
  daily: DAILY.map((d, i) => ({ ...d, date: isoDate(i) })),
};

const commuteLive: Commute = {
  kind: "live",
  destination: "Work",
  durationMinutes: 47,
  freeFlowMinutes: 32,
  delayMinutes: 15,
  state: "bad",
};

const tfl: Tfl = {
  items: [
    {
      id: "central",
      name: "Central",
      kind: "line",
      status: "Severe Delays",
      severity: "severe",
    },
    {
      id: "district",
      name: "District",
      kind: "line",
      status: "Minor Delays",
      severity: "minor",
    },
    { id: "a12", name: "A12", kind: "road", status: "Slow", severity: "minor" },
  ],
  goodCount: 11,
};

const tflAllClear: Tfl = { items: [], goodCount: 14 };

const bins: Bins = {
  provider: "manual",
  next: { date: isoDate(1), kinds: ["general", "food"] },
  following: { date: isoDate(8), kinds: ["recycling", "garden", "food"] },
};

const crypto: Crypto = {
  vsCurrency: "gbp",
  tickers: [
    { id: "bitcoin", symbol: "BTC", price: 71432.18, change24hPct: 2.41 },
    { id: "ethereum", symbol: "ETH", price: 2874.6, change24hPct: -1.08 },
    { id: "solana", symbol: "SOL", price: 138.92, change24hPct: 5.73 },
  ],
};

function base(mode: BoardMode): BoardPayload {
  return {
    generatedAt: new Date().toISOString(),
    meta: { timezone: "Europe/London", mode },
    weather: ok(weather, 900),
    commute: mode === "morning" ? ok(commuteLive, 180) : disabled(180),
    tfl: ok(mode === "morning" ? tfl : tflAllClear, 300),
    bins: ok(bins, 21_600, 4_000),
    crypto: ok(crypto, 300),
  };
}

/**
 * Fixtures for developing the whole UI with no keys and no network.
 * `degraded` is the one that matters for review: it puts every failure mode on
 * screen at once so the layout can be checked when things are broken, not just
 * when they are healthy.
 */
export function mockBoard(variant: MockVariant): BoardPayload {
  if (variant === "degraded") {
    const payload = base("morning");
    return {
      ...payload,
      weather: stale(weather, 900, 5_400),
      commute: failed(180, "Routing provider returned 502"),
      tfl: ok(tfl, 300),
      bins: failed(21_600, "Council endpoint unreachable"),
      crypto: stale(crypto, 300, 1_800),
    };
  }
  return base(variant === "morning" ? "morning" : "ambient");
}
