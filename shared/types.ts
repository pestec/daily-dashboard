/**
 * The contract between the Worker and the board. Imported by both sides, so a
 * change to a payload shape breaks the typecheck rather than the TV.
 */

/** Every source is wrapped in this. It is what makes one dead API grey exactly
 *  one tile instead of blanking the board. */
export type SourceStatus = "ok" | "stale" | "error" | "disabled";

export interface Source<T> {
  status: SourceStatus;
  /** Last known-good value. Deliberately retained across failures so a tile can
   *  show old data with a staleness marker rather than going blank. */
  data: T | null;
  /** ISO timestamp of the fetch that produced `data`, not of this response. */
  fetchedAt: string | null;
  /** Age past which the client should mark the tile stale. */
  ttlSeconds: number;
  /** Sanitised. Never contains a key, token, or upstream URL. */
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Weather                                                                     */
/* -------------------------------------------------------------------------- */

/** WMO weather interpretation code, as returned by Open-Meteo. */
export type WeatherCode = number;

export interface WeatherNow {
  temperatureC: number;
  apparentC: number;
  code: WeatherCode;
  isDay: boolean;
  windKph: number;
  humidityPct: number;
  precipitationMm: number;
}

export interface WeatherHour {
  time: string;
  temperatureC: number;
  code: WeatherCode;
  precipitationProbabilityPct: number;
  isDay: boolean;
}

export interface WeatherDay {
  date: string;
  minC: number;
  maxC: number;
  code: WeatherCode;
  precipitationProbabilityPct: number;
}

export interface Weather {
  label: string;
  now: WeatherNow;
  /** Next 12 hours. */
  hourly: WeatherHour[];
  /** Next 7 days, today first. */
  daily: WeatherDay[];
}

/* -------------------------------------------------------------------------- */
/* Commute                                                                     */
/* -------------------------------------------------------------------------- */

export type TrafficState = "good" | "slow" | "bad";

/** Inside the morning window: a real routing call with live traffic. */
export interface CommuteLive {
  kind: "live";
  destination: string;
  durationMinutes: number;
  freeFlowMinutes: number;
  delayMinutes: number;
  state: TrafficState;
}

/** Outside the window: a typical fallback, and no API call at all. */
export interface CommuteTypical {
  kind: "typical";
  destination: string;
  typicalMinutes: number;
}

export type Commute = CommuteLive | CommuteTypical;

/* -------------------------------------------------------------------------- */
/* Disruption (TfL)                                                            */
/* -------------------------------------------------------------------------- */

export type DisruptionSeverity = "good" | "minor" | "severe";

export interface DisruptionItem {
  id: string;
  name: string;
  kind: "line" | "road";
  /** Official line colour when known, e.g. TfL tube line hex. */
  color?: string;
  status: string;
  severity: DisruptionSeverity;
}

export interface Tfl {
  /** Only the things that are not running normally. */
  items: DisruptionItem[];
  /** How many lines and roads were checked and found fine, so the tile can say
   *  "all clear" honestly instead of just showing nothing. */
  goodCount: number;
}

/* -------------------------------------------------------------------------- */
/* Bins                                                                        */
/* -------------------------------------------------------------------------- */

export type BinKind = "general" | "recycling" | "garden" | "food";

export interface BinCollection {
  /** ISO date, no time component. */
  date: string;
  kinds: BinKind[];
}

export interface Bins {
  /** Which provider produced this, so the tile can be honest about a fallback. */
  provider: string;
  next: BinCollection | null;
  following: BinCollection | null;
}

/* -------------------------------------------------------------------------- */
/* Crypto                                                                      */
/* -------------------------------------------------------------------------- */

export interface CryptoTicker {
  id: string;
  symbol: string;
  price: number;
  change24hPct: number;
}

export interface Crypto {
  vsCurrency: string;
  tickers: CryptoTicker[];
}

/* -------------------------------------------------------------------------- */
/* Board                                                                       */
/* -------------------------------------------------------------------------- */

/** Drives the whole layout. The Worker decides it from the configured window
 *  so the board does not depend on the TV's clock being right. */
export type BoardMode = "morning" | "ambient";

export interface BoardMeta {
  timezone: string;
  mode: BoardMode;
}

export interface BoardPayload {
  /** When this response was assembled. Not the age of the data in it. */
  generatedAt: string;
  meta: BoardMeta;
  weather: Source<Weather>;
  commute: Source<Commute>;
  tfl: Source<Tfl>;
  bins: Source<Bins>;
  crypto: Source<Crypto>;
}

/** Keys of every source on the payload, for iterating in the debug overlay. */
export const SOURCE_KEYS = [
  "weather",
  "commute",
  "tfl",
  "bins",
  "crypto",
] as const;

export type SourceKey = (typeof SOURCE_KEYS)[number];
