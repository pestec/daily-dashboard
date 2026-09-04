import type { DisruptionSeverity, Source, Tfl } from "../../../shared/types.ts";
import { Tile } from "../Tile.tsx";

const SEVERITY: Record<DisruptionSeverity, { dot: string; text: string }> = {
  good: { dot: "bg-good", text: "text-good" },
  minor: { dot: "bg-warn", text: "text-warn" },
  severe: { dot: "bg-bad", text: "text-bad" },
};

/** The tile is two grid rows tall. Three rows of body text is what fits
 *  without clipping; anything beyond that is rolled into the header count. */
const MAX_ITEMS = 3;

interface Props {
  source: Source<Tfl> | null;
  now: number;
}

export function TflTile({ source, now }: Props) {
  const data = source?.data ?? null;
  const hidden = data === null ? 0 : Math.max(0, data.items.length - MAX_ITEMS);

  return (
    <Tile
      area="area-tfl"
      label="Disruption"
      source={source}
      now={now}
      accessory={
        data === null ? null : (
          <span className="text-caption text-fg-muted">
            {hidden > 0 && (
              <>
                <span className="tnum">+{hidden}</span> more ·{" "}
              </>
            )}
            <span className="tnum">{data.goodCount}</span> normal
          </span>
        )
      }
    >
      {(tfl) =>
        tfl.items.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center gap-4">
            <span aria-hidden="true" className="size-5 shrink-0 rounded-full bg-good" />
            <p className="text-headline leading-none font-semibold text-good">
              All clear
            </p>
          </div>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col justify-center gap-3">
            {tfl.items.slice(0, MAX_ITEMS).map((item) => (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex items-center gap-4"
              >
                <span
                  aria-hidden="true"
                  className={`size-4 shrink-0 rounded-full ${SEVERITY[item.severity].dot}`}
                />
                <span className="shrink-0 text-body font-medium">{item.name}</span>
                <span
                  className={`truncate text-body ${SEVERITY[item.severity].text}`}
                >
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    </Tile>
  );
}
