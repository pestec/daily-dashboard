import type { DisruptionItem, DisruptionSeverity, Tfl } from "../../shared/types.ts";
import type { Config } from "../config.ts";
import { fetchJson } from "../http.ts";

/** TfL's unified API is keyless for status endpoints. */
interface TflLine {
  id?: string;
  name?: string;
  lineStatuses?: Array<{
    statusSeverity?: number;
    statusSeverityDescription?: string;
  }>;
}

interface TflRoad {
  id?: string;
  displayName?: string;
  statusSeverity?: string;
  statusSeverityDescription?: string;
}

interface Point {
  lat: number;
  lon: number;
}

const RM13_7YB: Point = {
  lat: 51.53578437178105,
  lon: 0.19729711541201045,
};

const ROAD_RADIUS_MILES = 20;

const MAIN_TUBE_LINES: ReadonlyMap<string, { name: string; color: string }> = new Map([
  ["bakerloo", { name: "Bakerloo", color: "#B36305" }],
  ["central", { name: "Central", color: "#E32017" }],
  ["circle", { name: "Circle", color: "#FFD300" }],
  ["district", { name: "District", color: "#00782A" }],
  ["hammersmith-city", { name: "Hammersmith & City", color: "#F3A9BB" }],
  ["jubilee", { name: "Jubilee", color: "#A0A5A9" }],
  ["metropolitan", { name: "Metropolitan", color: "#9B0056" }],
  ["northern", { name: "Northern", color: "#000000" }],
  ["piccadilly", { name: "Piccadilly", color: "#003688" }],
  ["victoria", { name: "Victoria", color: "#0098D4" }],
  ["waterloo-city", { name: "Waterloo & City", color: "#95CDBA" }],
]);

const MAIN_ROAD_ANCHORS: ReadonlyMap<string, Point> = new Map([
  ["a12", { lat: 51.5636, lon: 0.0736 }],
  ["a13", { lat: 51.5192, lon: 0.0895 }],
  ["a406", { lat: 51.5919, lon: 0.0338 }],
  ["m25", { lat: 51.533, lon: 0.287 }],
]);

/**
 * TfL's numeric line severities, grouped.
 * 10 Good Service and 18 No Issues are the only genuinely fine states;
 * anything that closes or suspends part of a line is severe, and the rest
 * (reduced service, minor delays, diversions) is worth a mention but not alarm.
 */
const SEVERE_LINE_CODES = new Set([0, 1, 2, 3, 4, 5, 6, 11, 12, 16, 20]);
const GOOD_LINE_CODES = new Set([10, 18]);

function lineSeverity(code: number): DisruptionSeverity {
  if (GOOD_LINE_CODES.has(code)) return "good";
  if (SEVERE_LINE_CODES.has(code)) return "severe";
  return "minor";
}

function roadSeverity(value: string): DisruptionSeverity {
  const normalised = value.trim().toLowerCase();
  if (normalised === "good" || normalised === "no exceptional delays") return "good";
  if (normalised === "severe" || normalised === "serious" || normalised === "closure") {
    return "severe";
  }
  return "minor";
}

function normaliseRoadId(value: string): string {
  return value.trim().toLowerCase();
}

function milesBetween(a: Point, b: Point): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusMiles * c;
}

function isRoadInScope(roadId: string): boolean {
  const point = MAIN_ROAD_ANCHORS.get(roadId);
  if (point === undefined) return false;
  return milesBetween(RM13_7YB, point) <= ROAD_RADIUS_MILES;
}

export async function fetchTfl(config: Config): Promise<Tfl> {
  const requests: Array<Promise<DisruptionItem[]>> = [];

  if (config.tfl.lineModes.length > 0) {
    const modes = config.tfl.lineModes.map(encodeURIComponent).join(",");
    requests.push(
      fetchJson<TflLine[]>(`https://api.tfl.gov.uk/Line/Mode/${modes}/Status`, {
        label: "TfL lines",
      }).then((lines) =>
        lines.flatMap((line) => {
          const id = (line.id ?? "").trim().toLowerCase();
          const tube = MAIN_TUBE_LINES.get(id);
          if (tube === undefined) return [];
          const status = line.lineStatuses?.[0];
          return [{
            id: line.id ?? line.name ?? "line",
            name: tube.name,
            color: tube.color,
            kind: "line" as const,
            status: status?.statusSeverityDescription ?? "Unknown",
            severity: lineSeverity(status?.statusSeverity ?? 10),
          }];
        }),
      ),
    );
  }

  // Roads are requested one at a time on purpose. TfL 404s the *entire*
  // request if any single id in a comma-separated list is not part of its
  // network (a127, for instance, is Essex), which would silently drop road
  // status altogether. One request each means an unknown id costs only itself.
  const scopedRoadIds = config.tfl.roadIds
    .map(normaliseRoadId)
    .filter((roadId) => MAIN_ROAD_ANCHORS.has(roadId) && isRoadInScope(roadId));

  for (const roadId of scopedRoadIds) {
    requests.push(
      fetchJson<TflRoad[]>(
        `https://api.tfl.gov.uk/Road/${encodeURIComponent(roadId)}/Status`,
        { label: `TfL road ${roadId}` },
      ).then((entries) =>
        entries.map((road) => ({
          id: road.id ?? roadId,
          name: road.displayName ?? roadId.toUpperCase(),
          kind: "road" as const,
          status: road.statusSeverityDescription ?? road.statusSeverity ?? "Unknown",
          severity: roadSeverity(road.statusSeverity ?? "good"),
        })),
      ),
    );
  }

  // Lines and roads are separate endpoints; one being down should still leave
  // the other's status on screen rather than emptying the tile.
  const settled = await Promise.allSettled(requests);
  const all = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (all.length === 0 && settled.length > 0) {
    const firstRejection = settled.find((r) => r.status === "rejected");
    throw firstRejection?.status === "rejected"
      ? (firstRejection.reason as Error)
      : new Error("TfL returned nothing");
  }

  const items = [...all];
  // Stable order, not severity order. The tile now shows the whole monitored
  // network at once rather than a top-five, so this is a board someone learns
  // the shape of -- "is the Central line red today" is a glance at a fixed
  // position. Re-sorting it every time something breaks would destroy that,
  // and colour already makes disruption findable.
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "line" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    items,
    goodCount: all.filter((item) => item.severity === "good").length,
  };
}
