import type { BinKind, Bins, Source } from "../../../shared/types.ts";
import { relativeDayLabelShort } from "../../lib/format.ts";
import { Tile } from "../Tile.tsx";

const KIND: Record<BinKind, { label: string; swatch: string }> = {
  general: { label: "General", swatch: "bg-fg-muted" },
  recycling: { label: "Recycling", swatch: "bg-accent" },
  garden: { label: "Garden", swatch: "bg-good" },
  food: { label: "Food", swatch: "bg-warn" },
};

interface Props {
  source: Source<Bins> | null;
  now: number;
}

/**
 * Only on screen the evening before a collection -- the Board decides that, so
 * this tile no longer has to spend its space counting down. That leaves it
 * needing to say two things in one glance: that it is tomorrow, and which
 * bins. The provider goes in the header, where it costs no content height but
 * is still there to catch a silent fallback to the manual schedule.
 */
export function BinsTile({ source, now }: Props) {
  return (
    <Tile
      area="area-bins"
      label="Bins"
      source={source}
      now={now}
      accessory={
        source?.data == null ? null : (
          <span className="truncate text-caption text-fg-muted/70">
            via {source.data.provider}
          </span>
        )
      }
    >
      {(bins) =>
        bins.next === null ? (
          <div className="flex min-h-0 flex-1 items-center">
            <p className="text-body text-fg-muted">No collection scheduled</p>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-3">
            <p className="truncate text-[40px] leading-none font-semibold text-warn">
              {relativeDayLabelShort(bins.next.date)}
            </p>
            <ul className="flex min-w-0 flex-wrap gap-2">
              {bins.next.kinds.map((kind) => (
                <li
                  key={kind}
                  className="glass-subpanel flex shrink-0 items-center gap-2 rounded-lg px-3 py-1"
                >
                  <span
                    aria-hidden="true"
                    className={`size-3 shrink-0 rounded-sm ${KIND[kind].swatch}`}
                  />
                  <span className="text-[20px] leading-tight text-fg-muted">
                    {KIND[kind].label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </Tile>
  );
}
