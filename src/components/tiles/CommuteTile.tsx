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
 * columns in ambient and nine in the morning, and it falls back to a typical
 * value whenever no live route is available -- so the number has to fill either
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
      {(commute) => {
        if (commute.kind === "live") {
          const arrival = new Date(now + commute.durationMinutes * 60_000);
          const delayPct =
            commute.freeFlowMinutes > 0
              ? Math.round((commute.delayMinutes / commute.freeFlowMinutes) * 100)
              : 0;

          return (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
              <div className="flex min-w-0 flex-col justify-between gap-5">
                <p className="flex items-baseline gap-4">
                  <span
                    className={`tnum leading-none font-semibold ${STATE[commute.state].text}`}
                    style={{ fontSize: NUMBER_SIZE }}
                  >
                    {commute.durationMinutes}
                  </span>
                  <span className="text-title text-fg-muted">min</span>
                </p>

                <div className="space-y-2">
                  <p className="text-body text-fg-muted">to {commute.destination}</p>
                  <p className="text-caption text-fg-muted">
                    ETA <span className="tnum">{arrival.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span>
                  </p>
                </div>

                <div className="space-y-2">
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
                        <span className="tnum">+{commute.delayMinutes} min</span> vs free-flow (
                        <span className="tnum">{commute.freeFlowMinutes}</span> min)
                      </>
                    ) : (
                      <>
                        running free-flow (<span className="tnum">{commute.freeFlowMinutes}</span> min)
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="glass-subpanel flex min-w-0 flex-col justify-center gap-4 rounded-xl px-5 py-4">
                <p className="text-caption uppercase tracking-[0.08em] text-fg-muted">Delay load</p>
                <p className={`tnum text-display-l leading-none font-semibold ${STATE[commute.state].text}`}>
                  {Math.max(0, delayPct)}%
                </p>
                <div className="h-3 overflow-hidden rounded-full bg-surface-2/80">
                  <div
                    className={`h-full ${STATE[commute.state].dot}`}
                    style={{ width: `${Math.min(100, Math.max(6, delayPct))}%` }}
                  />
                </div>
                <p className="text-caption text-fg-muted">
                  free-flow <span className="tnum">{commute.freeFlowMinutes}</span> min
                </p>
              </div>
            </div>
          );
        }

        return (
          // Outside the morning window: a typical value, no API call,
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
        );
      }}
    </Tile>
  );
}
