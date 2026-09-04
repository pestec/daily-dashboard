import type { Commute, TrafficState } from "../../shared/types.ts";
import type { Config } from "../config.ts";
import { fetchJson, UpstreamError } from "../http.ts";
import { zonedNow } from "../time.ts";

interface GoogleRoutesResponse {
  routes?: Array<{
    duration?: string;
    staticDuration?: string;
    distanceMeters?: number;
  }>;
}

interface RouteTiming {
  durationSeconds: number;
  staticDurationSeconds: number;
  delaySeconds: number;
  distanceMeters: number | null;
}

interface RoutingProvider {
  label: string;
  fetchTiming(config: Config, apiKey: string): Promise<{ raw: unknown; timing: RouteTiming }>;
}

const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_FIELD_MASK = "routes.duration,routes.staticDuration,routes.distanceMeters";
const TYPICAL_FALLBACK_MINUTES = 30;

/** Inside the configured window on a configured day, and only then, is the
 *  routing API worth spending quota on. */
export function isInCommuteWindow(config: Config, now: Date): boolean {
  const { minutesOfDay, weekday } = zonedNow(now, config.timezone);
  const { windowStartMinutes, windowEndMinutes, days } = config.commute;

  if (days.length > 0 && !days.includes(weekday)) return false;
  return minutesOfDay >= windowStartMinutes && minutesOfDay < windowEndMinutes;
}

/**
 * Graded on the delay as a share of free-flow, not on absolute minutes: five
 * minutes lost on a twenty minute run is a different morning from five lost on
 * an hour. The absolute floor stops a short route flipping to red over a delay
 * nobody would notice.
 */
export function trafficState(delayMinutes: number, freeFlowMinutes: number): TrafficState {
  if (delayMinutes < 3) return "good";
  const ratio = freeFlowMinutes > 0 ? delayMinutes / freeFlowMinutes : 0;
  if (ratio < 0.15) return "good";
  if (ratio < 0.35) return "slow";
  return "bad";
}

/** The baseline shown outside the window. No API call, and labelled in the UI
 *  as typical so it is never mistaken for a live reading. */
export function typicalCommute(config: Config): Commute {
  return {
    kind: "typical",
    destination: config.commute.label,
    typicalMinutes: TYPICAL_FALLBACK_MINUTES,
  };
}

export function parseDurationSeconds(value: string): number {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (match === null) {
    throw new UpstreamError("Google Routes returned an invalid duration");
  }
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new UpstreamError("Google Routes returned an invalid duration");
  }
  return seconds;
}

export function parseGoogleRouteTiming(body: GoogleRoutesResponse): RouteTiming {
  const route = body.routes?.[0];
  if (route === undefined) {
    throw new UpstreamError("Google Routes returned no route");
  }
  if (route.duration === undefined || route.staticDuration === undefined) {
    throw new UpstreamError("Google Routes omitted route timing");
  }

  const durationSeconds = parseDurationSeconds(route.duration);
  const staticDurationSeconds = parseDurationSeconds(route.staticDuration);

  return {
    durationSeconds,
    staticDurationSeconds,
    delaySeconds: Math.max(0, durationSeconds - staticDurationSeconds),
    distanceMeters: typeof route.distanceMeters === "number" ? route.distanceMeters : null,
  };
}

function computeRoutesBody(config: Config): Record<string, unknown> {
  const { home, work } = config.commute;
  return {
    origin: {
      location: {
        latLng: { latitude: home.lat, longitude: home.lon },
      },
    },
    destination: {
      location: {
        latLng: { latitude: work.lat, longitude: work.lon },
      },
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
  };
}

const googleRoutesProvider: RoutingProvider = {
  label: "Google Routes",
  async fetchTiming(config: Config, apiKey: string): Promise<{ raw: unknown; timing: RouteTiming }> {
    const raw = await fetchJson<GoogleRoutesResponse>(GOOGLE_ROUTES_URL, {
      label: "Google Routes",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
      },
      body: JSON.stringify(computeRoutesBody(config)),
    });
    return { raw, timing: parseGoogleRouteTiming(raw) };
  },
};

const ACTIVE_ROUTING_PROVIDER: RoutingProvider = googleRoutesProvider;

function toLiveCommute(config: Config, timing: RouteTiming): Commute {
  const durationMinutes = Math.round(timing.durationSeconds / 60);
  const freeFlowMinutes = Math.round(timing.staticDurationSeconds / 60);
  const delayMinutes = Math.round(timing.delaySeconds / 60);

  return {
    kind: "live",
    destination: config.commute.label,
    durationMinutes,
    freeFlowMinutes,
    delayMinutes,
    state: trafficState(delayMinutes, freeFlowMinutes),
  };
}

export async function fetchCommute(config: Config, apiKey: string): Promise<Commute> {
  const { timing } = await ACTIVE_ROUTING_PROVIDER.fetchTiming(config, apiKey);
  return toLiveCommute(config, timing);
}

export async function fetchCommuteDebug(
  config: Config,
  apiKey: string,
): Promise<{ provider: string; parsed: Commute; raw: unknown }> {
  const { raw, timing } = await ACTIVE_ROUTING_PROVIDER.fetchTiming(config, apiKey);
  return {
    provider: "google-routes",
    parsed: toLiveCommute(config, timing),
    raw,
  };
}
