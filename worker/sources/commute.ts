import type { Commute, TrafficState } from "../../shared/types.ts";
import type { Config } from "../config.ts";
import { fetchJson, UpstreamError } from "../http.ts";
import { zonedNow } from "../time.ts";

interface TomTomRoutingResponse {
  routes?: Array<{
    summary?: {
      travelTimeInSeconds: number;
      trafficDelayInSeconds?: number;
      noTrafficTravelTimeInSeconds?: number;
    };
  }>;
}

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
    typicalMinutes: Math.round(config.commute.typicalMinutes),
  };
}

export async function fetchCommute(config: Config, apiKey: string): Promise<Commute> {
  const { home, work } = config.commute;
  const url =
    "https://api.tomtom.com/routing/1/calculateRoute/" +
    `${home.lat},${home.lon}:${work.lat},${work.lon}/json` +
    `?key=${encodeURIComponent(apiKey)}` +
    "&traffic=true&departAt=now&computeTravelTimeFor=all" +
    "&routeType=fastest&travelMode=car";

  const body = await fetchJson<TomTomRoutingResponse>(url, { label: "TomTom" });

  const summary = body.routes?.[0]?.summary;
  if (summary === undefined) {
    throw new UpstreamError("TomTom returned no route");
  }

  const delaySeconds = summary.trafficDelayInSeconds ?? 0;
  // travelTimeInSeconds always includes traffic delay, so free-flow is derived
  // from it when the explicit no-traffic figure is missing.
  const freeFlowSeconds =
    summary.noTrafficTravelTimeInSeconds ??
    Math.max(0, summary.travelTimeInSeconds - delaySeconds);

  const durationMinutes = Math.round(summary.travelTimeInSeconds / 60);
  const freeFlowMinutes = Math.round(freeFlowSeconds / 60);
  const delayMinutes = Math.round(delaySeconds / 60);

  return {
    kind: "live",
    destination: config.commute.label,
    durationMinutes,
    freeFlowMinutes,
    delayMinutes,
    state: trafficState(delayMinutes, freeFlowMinutes),
  };
}
