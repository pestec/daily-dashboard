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

export async function fetchTfl(config: Config): Promise<Tfl> {
  const requests: Array<Promise<DisruptionItem[]>> = [];

  if (config.tfl.lineModes.length > 0) {
    const modes = config.tfl.lineModes.map(encodeURIComponent).join(",");
    requests.push(
      fetchJson<TflLine[]>(`https://api.tfl.gov.uk/Line/Mode/${modes}/Status`, {
        label: "TfL lines",
      }).then((lines) =>
        lines.map((line) => {
          const status = line.lineStatuses?.[0];
          return {
            id: line.id ?? line.name ?? "line",
            name: line.name ?? line.id ?? "Line",
            kind: "line" as const,
            status: status?.statusSeverityDescription ?? "Unknown",
            severity: lineSeverity(status?.statusSeverity ?? 10),
          };
        }),
      ),
    );
  }

  // Roads are requested one at a time on purpose. TfL 404s the *entire*
  // request if any single id in a comma-separated list is not part of its
  // network (a127, for instance, is Essex), which would silently drop road
  // status altogether. One request each means an unknown id costs only itself.
  for (const roadId of config.tfl.roadIds) {
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

  const items = all.filter((item) => item.severity !== "good");
  // Severe first, so the three that fit on screen are the three that matter.
  items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "severe" ? -1 : 1));

  return { items, goodCount: all.length - items.length };
}
