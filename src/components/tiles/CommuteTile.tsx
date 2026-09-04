import type { Commute, Source, TrafficState } from "../../../shared/types.ts";
import { Tile } from "../Tile.tsx";

/** Colour is never the only signal -- each state carries a word and a shape. */
const STATE: Record<
  TrafficState,
  { label: string; text: string; dot: string }
> = {
  good: { label: "Clear", text: "text-good", dot: "bg-good" },
  slow: { label: "Slow", text: "text-warn", dot: "bg-warn" },
  bad: { label: "Heavy", text: "text-bad", dot: "bg-bad" },
};

/**
 * Sized against the tile rather than the mode. The commute cell is three
 * columns in ambient and nine in the morning, and it falls back to the typical
 * baseline whenever no routing key is set -- so the number has to fill either
 * shape without being told which it is in.
 */
const NUMBER_SIZE = "min(140px, 16cqw)";

interface Props {
  source: Source<Commute> | null;
  now: number;
}

export function CommuteTile({ source, now }: Props) {
  return (
    <Tile area="area-commute" label="Commute" source={source} now={now}>
      {(commute) =>
        commute.kind === "live" ? (
          <div className="flex min-h-0 flex-1 items-center gap-12">
            <div className="flex shrink-0 flex-col gap-3">
              <p className="flex items-baseline gap-4">
                <span
                  className={`tnum leading-none font-semibold ${STATE[commute.state].text}`}
                  style={{ fontSize: NUMBER_SIZE }}
                >
                  {commute.durationMinutes}
                </span>
                <span className="text-title text-fg-muted">min</span>
              </p>
              <p className="text-body text-fg-muted">to {commute.destination}</p>
            </div>

            <div className="flex min-w-0 flex-col gap-4 border-l border-border/40 pl-12">
              <p className="flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className={`inline-block size-5 shrink-0 rounded-full ${STATE[commute.state].dot}`}
                />
                <span
                  className={`text-headline leading-none font-semibold ${STATE[commute.state].text}`}
                >
                  {STATE[commute.state].label}
                </span>
              </p>
              <p className="text-body text-fg-muted">
                {commute.delayMinutes > 0 ? (
                  <>
                    <span className="tnum">+{commute.delayMinutes} min</span> vs
                    free-flow{" "}
                    <span className="tnum">{commute.freeFlowMinutes}</span>
                  </>
                ) : (
                  <>
                    running free-flow (
                    <span className="tnum">{commute.freeFlowMinutes}</span> min)
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          // Outside the morning window: the configured baseline, no API call,
          // and labelled so it is never mistaken for a live reading.
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
            <p className="flex items-baseline gap-3">
              <span
                className="tnum leading-none font-semibold text-fg-muted"
                style={{ fontSize: NUMBER_SIZE }}
              >
                {commute.typicalMinutes}
              </span>
              <span className="text-body text-fg-muted">min typical</span>
            </p>
            <p className="text-body text-fg-muted">to {commute.destination}</p>
            <p className="text-caption text-fg-muted/70">
              outside morning window
            </p>
          </div>
        )
      }
    </Tile>
  );
}
