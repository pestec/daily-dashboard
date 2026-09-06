import type {
  BoardMode,
  BoardPayload,
  Bins,
  Crypto,
  Commute,
  DisruptionItem,
  DisruptionSeverity,
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
  { minC: 10, maxC: 18, code: 2, precipitationProbabilityPct: 15 },
  { minC: 11, maxC: 19, code: 3, precipitationProbabilityPct: 35 },
  { minC: 9, maxC: 17, code: 51, precipitationProbabilityPct: 45 },
  { minC: 8, maxC: 15, code: 1, precipitationProbabilityPct: 10 },
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

/* The tile shows the whole monitored network at once, so the fixture has to be
   the whole network too -- eleven tube lines and four roads, in the same fixed
   order the Worker emits. A three-item fixture would have hidden the fact that
   fifteen rows need to fit. */
const TUBE: ReadonlyArray<[id: string, name: string, color: string]> = [
  ["bakerloo", "Bakerloo", "#B36305"],
  ["central", "Central", "#E32017"],
  ["circle", "Circle", "#FFD300"],
  ["district", "District", "#00782A"],
  ["hammersmith-city", "Hammersmith & City", "#F3A9BB"],
  ["jubilee", "Jubilee", "#A0A5A9"],
  ["metropolitan", "Metropolitan", "#9B0056"],
  ["northern", "Northern", "#000000"],
  ["piccadilly", "Piccadilly", "#003688"],
  ["victoria", "Victoria", "#0098D4"],
  ["waterloo-city", "Waterloo & City", "#95CDBA"],
];

const ROADS: ReadonlyArray<string> = ["A12", "A13", "A406", "M25"];

function network(
  disrupted: ReadonlyMap<string, [status: string, severity: DisruptionSeverity]>,
): Tfl {
  const items: DisruptionItem[] = [
    ...TUBE.map(([id, name, color]) => {
      const hit = disrupted.get(id);
      return {
        id,
        name,
        color,
        kind: "line" as const,
        status: hit?.[0] ?? "Good Service",
        severity: hit?.[1] ?? ("good" as const),
      };
    }),
    ...ROADS.map((name) => {
      const hit = disrupted.get(name.toLowerCase());
      return {
        id: name.toLowerCase(),
        name,
        kind: "road" as const,
        status: hit?.[0] ?? "No Exceptional Delays",
        severity: hit?.[1] ?? ("good" as const),
      };
    }),
  ];
  return {
    items,
    goodCount: items.filter((item) => item.severity === "good").length,
  };
}

const tfl: Tfl = network(
  new Map<string, [string, DisruptionSeverity]>([
    ["central", ["Severe Delays", "severe"]],
    ["district", ["Minor Delays", "minor"]],
    ["waterloo-city", ["Part Closure", "severe"]],
    ["a12", ["Serious", "severe"]],
    ["a406", ["Minimal", "minor"]],
  ]),
);

const tflAllClear: Tfl = network(new Map());

const bins: Bins = {
  provider: "manual",
  next: { date: isoDate(1), kinds: ["general", "food"] },
  following: { date: isoDate(8), kinds: ["recycling", "garden", "food"] },
};

/* Ten tickers, spanning six-figure prices down to sub-dollar ones, so the
   column widths get exercised by the fixture rather than only in production. */
const crypto: Crypto = {
  vsCurrency: "usd",
  tickers: [
    { id: "ethereum", symbol: "ETH", price: 3128.44, change24hPct: -1.08, change7dPct: 4.62 },
    { id: "bitcoin", symbol: "BTC", price: 104_318.72, change24hPct: 2.41, change7dPct: -3.15 },
    { id: "uniswap", symbol: "UNI", price: 9.87, change24hPct: 0.94, change7dPct: 12.408 },
    { id: "chainlink", symbol: "LINK", price: 17.62, change24hPct: -2.73, change7dPct: 1.09 },
    { id: "arbitrum", symbol: "ARB", price: 0.4312, change24hPct: 3.18, change7dPct: -8.44 },
    { id: "1inch", symbol: "1INCH", price: 0.2874, change24hPct: -0.42, change7dPct: 0 },
    { id: "sei-network", symbol: "SEI", price: 0.3391, change24hPct: 6.05, change7dPct: 21.73 },
    { id: "render-token", symbol: "RENDER", price: 4.128, change24hPct: -4.16, change7dPct: -11.28 },
    { id: "solana", symbol: "SOL", price: 187.35, change24hPct: 5.73, change7dPct: 9.01 },
    // Null rather than 0: the provider genuinely omits this for some coins.
    { id: "ondo-finance", symbol: "ONDO", price: 0.9142, change24hPct: 1.27, change7dPct: null },
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
