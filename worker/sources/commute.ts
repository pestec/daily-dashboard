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

export type CommuteSlot = "morning" | "afternoon";

interface CommuteLeg {
  origin: { lat: number; lon: number; label: string };
  destination: { lat: number; lon: number; label: string };
}

interface RoutingProvider {
  label: string;
  fetchTiming(leg: CommuteLeg, apiKey: string): Promise<{ raw: unknown; timing: RouteTiming }>;
}

const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_FIELD_MASK = "routes.duration,routes.staticDuration,routes.distanceMeters";
const TYPICAL_FALLBACK_MINUTES = 30;

/** Inside the configured window on a configured day, and only then, is the
 *  routing API worth spending quota on. */
export function activeCommuteSlot(config: Config, now: Date): CommuteSlot | null {
  const { minutesOfDay, weekday } = zonedNow(now, config.timezone);
  const {
    morningStartMinutes,
    morningEndMinutes,
    afternoonStartMinutes,
    afternoonEndMinutes,
    days,
  } = config.commute;

  if (days.length > 0 && !days.includes(weekday)) return null;
  if (minutesOfDay >= morningStartMinutes && minutesOfDay < morningEndMinutes) {
    return "morning";
  }
  if (minutesOfDay >= afternoonStartMinutes && minutesOfDay < afternoonEndMinutes) {
    return "afternoon";
  }
  return null;
}

export function isInCommuteWindow(config: Config, now: Date): boolean {
  return activeCommuteSlot(config, now) !== null;
}

export function legForSlot(config: Config, slot: CommuteSlot): CommuteLeg {
  if (slot === "morning") {
    return {
      origin: { ...config.commute.home, label: config.commute.homeLabel },
      destination: { ...config.commute.work, label: config.commute.workLabel },
    };
  }
  return {
    origin: { ...config.commute.work, label: config.commute.workLabel },
    destination: { ...config.commute.home, label: config.commute.homeLabel },
  };
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
    destination: config.commute.workLabel,
    typicalMinutes: TYPICAL_FALLBACK_MINUTES,
  };
}

export function typicalCommuteForSlot(config: Config, slot: CommuteSlot): Commute {
  const leg = legForSlot(config, slot);
  return {
    kind: "typical",
    destination: leg.destination.label,
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

function computeRoutesBody(leg: CommuteLeg): Record<string, unknown> {
  return {
    origin: {
      location: {
        latLng: { latitude: leg.origin.lat, longitude: leg.origin.lon },
      },
    },
    destination: {
      location: {
        latLng: { latitude: leg.destination.lat, longitude: leg.destination.lon },
      },
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
  };
}

const googleRoutesProvider: RoutingProvider = {
  label: "Google Routes",
  async fetchTiming(leg: CommuteLeg, apiKey: string): Promise<{ raw: unknown; timing: RouteTiming }> {
    const raw = await fetchJson<GoogleRoutesResponse>(GOOGLE_ROUTES_URL, {
      label: "Google Routes",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
      },
      body: JSON.stringify(computeRoutesBody(leg)),
    });
    return { raw, timing: parseGoogleRouteTiming(raw) };
  },
};

const ACTIVE_ROUTING_PROVIDER: RoutingProvider = googleRoutesProvider;

function toLiveCommute(config: Config, timing: RouteTiming, slot: CommuteSlot): Commute {
  const leg = legForSlot(config, slot);
  const durationMinutes = Math.round(timing.durationSeconds / 60);
  const freeFlowMinutes = Math.round(timing.staticDurationSeconds / 60);
  const delayMinutes = Math.round(timing.delaySeconds / 60);

  return {
    kind: "live",
    destination: leg.destination.label,
    durationMinutes,
    freeFlowMinutes,
    delayMinutes,
    state: trafficState(delayMinutes, freeFlowMinutes),
  };
}

export async function fetchCommute(
  config: Config,
  apiKey: string,
  slot: CommuteSlot,
): Promise<Commute> {
  const leg = legForSlot(config, slot);
  const { timing } = await ACTIVE_ROUTING_PROVIDER.fetchTiming(leg, apiKey);
  return toLiveCommute(config, timing, slot);
}

export async function fetchCommuteDebug(
  config: Config,
  apiKey: string,
  slot: CommuteSlot,
): Promise<{ provider: string; parsed: Commute; raw: unknown }> {
  const leg = legForSlot(config, slot);
  const { raw, timing } = await ACTIVE_ROUTING_PROVIDER.fetchTiming(leg, apiKey);
  return {
    provider: "google-routes",
    parsed: toLiveCommute(config, timing, slot),
    raw,
  };
}
