import type { BinKind, Bins, Source } from "../../../shared/types.ts";
import {
  daysUntil,
  relativeDayLabel,
  relativeDayLabelShort,
} from "../../lib/format.ts";
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

export function BinsTile({ source, now }: Props) {
  return (
    <Tile area="area-bins" label="Bins" source={source} now={now}>
      {(bins) =>
        bins.next === null ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
            <p className="text-body text-fg-muted">No collection scheduled</p>
            <p className="text-caption text-fg-muted/70">
              via {bins.provider}
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-4">
            <div className="flex flex-col gap-4">
              <p
                className={`leading-none font-semibold text-nowrap ${
                  daysUntil(bins.next.date) <= 1 ? "text-warn" : "text-fg"
                }`}
                style={{ fontSize: "min(72px, 13cqw)" }}
              >
                {relativeDayLabelShort(bins.next.date)}
              </p>
              <ul className="flex flex-wrap gap-3">
                {bins.next.kinds.map((kind) => (
                  <li
                    key={kind}
                    className="flex items-center gap-3 rounded-lg bg-surface-2 px-4 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className={`size-4 rounded-sm ${KIND[kind].swatch}`}
                    />
                    <span className="text-caption">{KIND[kind].label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {bins.following !== null && (
              <p className="text-caption text-fg-muted">
                Then {relativeDayLabel(bins.following.date)} ·{" "}
                {bins.following.kinds.map((k) => KIND[k].label).join(", ")}
              </p>
            )}

            <p className="text-caption text-fg-muted/70">via {bins.provider}</p>
          </div>
        )
      }
    </Tile>
  );
}
