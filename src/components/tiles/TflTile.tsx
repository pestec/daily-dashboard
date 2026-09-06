import type { DisruptionSeverity, Source, Tfl } from "../../../shared/types.ts";
import { Tile } from "../Tile.tsx";

const SEVERITY: Record<DisruptionSeverity, { dot: string; text: string }> = {
  good: { dot: "bg-good", text: "text-fg-muted/70" },
  minor: { dot: "bg-warn", text: "text-warn" },
  severe: { dot: "bg-bad", text: "text-bad" },
};

/**
 * TfL's own wording, shortened.
 *
 * The tile now shows the whole network in three columns, which leaves roughly
 * 130px for a status -- "No Exceptional Delays" does not fit and would
 * truncate to something that reads worse than nothing. Anything unmapped falls
 * through unchanged and truncates, so a new status TfL invents still shows.
 */
const SHORT_STATUS: Readonly<Record<string, string>> = {
  "good service": "Good",
  "no issues": "Good",
  good: "Good",
  "no exceptional delays": "Clear",
  minimal: "Minimal",
  serious: "Serious",
  severe: "Severe",
  closure: "Closed",
  "minor delays": "Minor delays",
  "severe delays": "Severe delays",
  "part suspended": "Part susp.",
  "part closure": "Part closed",
  "part closed": "Part closed",
  "planned closure": "Planned",
  "reduced service": "Reduced",
  "bus service": "Buses",
  "special service": "Special",
  "change of frequency": "Frequency",
  "no step free access": "No step-free",
  "service closed": "Closed",
  "issues reported": "Issues",
  "not running": "Not running",
  "exit only": "Exit only",
  information: "Info",
};

const shortStatus = (status: string): string =>
  SHORT_STATUS[status.trim().toLowerCase()] ?? status;

interface Props {
  source: Source<Tfl> | null;
  now: number;
}

/**
 * Every monitored tube line and road at once, five to a column.
 *
 * The old tile showed the worst five and hid the rest behind a count, which
 * answered "is anything broken" but never "is *my* line broken" -- the only
 * question anyone actually walks up to it with. Fifteen slim rows fit in the
 * same space, in a fixed order, so a line is found by position rather than by
 * reading. Colour then does the only job left: showing which ones are bad.
 */
export function TflTile({ source, now }: Props) {
  const data = source?.data ?? null;
  const disrupted =
    data === null ? 0 : data.items.filter((i) => i.severity !== "good").length;

  return (
    <Tile
      area="area-focus"
      label="Disruption"
      source={source}
      now={now}
      accessory={
        data === null ? null : disrupted === 0 ? (
          <span className="flex items-center gap-2 text-caption text-good">
            <span aria-hidden="true" className="size-3 rounded-full bg-good" />
            All clear
          </span>
        ) : (
          <span className="text-caption text-fg-muted">
            <span className="tnum">{disrupted}</span> of{" "}
            <span className="tnum">{data.items.length}</span> disrupted
          </span>
        )
      }
    >
      {(tfl) =>
        tfl.items.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center gap-4">
            <span
              aria-hidden="true"
              className="size-5 shrink-0 rounded-full bg-good"
            />
            <p className="text-headline leading-none font-semibold text-good">
              All clear
            </p>
          </div>
        ) : (
          // Column-major: five rows filled top to bottom, so the eleven tube
          // lines stay alphabetical down the first two columns and the roads
          // gather at the foot of the third.
          <ul className="grid min-h-0 min-w-0 flex-1 auto-cols-fr grid-flow-col grid-rows-5 gap-x-3 gap-y-2">
            {tfl.items.slice(0, 15).map((item) => (
              <li
                key={`${item.kind}-${item.id}`}
                className="glass-subpanel flex min-w-0 items-center gap-2 rounded-lg px-3 py-1"
              >
                {item.kind === "line" && item.color !== undefined ? (
                  <span
                    aria-hidden="true"
                    className="size-3.5 shrink-0 rounded-full border border-white/35"
                    style={{ backgroundColor: item.color }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className={`size-3.5 shrink-0 rounded-full ${SEVERITY[item.severity].dot}`}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-[20px] font-medium">
                  {item.name}
                </span>
                <span
                  className={`shrink-0 truncate text-[20px] ${
                    item.severity === "good" ? "" : "font-semibold"
                  } ${SEVERITY[item.severity].text}`}
                >
                  {shortStatus(item.status)}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    </Tile>
  );
}
