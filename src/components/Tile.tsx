import type { ReactNode } from "react";
import type { Source } from "../../shared/types.ts";
import { formatAge } from "../lib/format.ts";
import { isStale } from "../lib/staleness.ts";

interface TileProps<T> {
  /** Grid area class, e.g. "area-weather". */
  area: string;
  label: string;
  source: Source<T> | null;
  now: number;
  /** Optional compact summary shown beside the label, so a tile can surface a
   *  count without spending one of its precious content rows on it. */
  accessory?: ReactNode;
  /** Rendered only when there is data to render. */
  children: (data: T) => ReactNode;
}

/**
 * Shared tile shell: label, staleness marker, and the three states every tile
 * shares -- loading, dead, and showing data that may be old.
 */
export function Tile<T>({
  area,
  label,
  source,
  now,
  accessory,
  children,
}: TileProps<T>) {
  const stale = source !== null && source.data !== null && isStale(source, now);
  const dead = source !== null && source.data === null;
  const loading = source === null;

  return (
    <section
      className={`${area} flex min-h-0 min-w-0 flex-col gap-5 overflow-hidden rounded-2xl border border-border/40 bg-surface p-8 ${
        dead ? "opacity-50" : ""
      }`}
    >
      <header className="flex shrink-0 items-baseline justify-between gap-4">
        <h2 className="text-title leading-none font-medium tracking-[0.08em] text-fg-muted uppercase">
          {label}
        </h2>
        {!dead && !loading && accessory}
        {stale && source.fetchedAt !== null && (
          <span className="flex items-center gap-2 text-caption leading-none text-warn">
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-full bg-warn"
            />
            <span className="tnum">{formatAge(source.fetchedAt, now)} old</span>
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {loading && <p className="text-body text-fg-muted">Loading…</p>}
        {dead && (
          <div className="flex flex-1 flex-col justify-center gap-2">
            <p className="text-body text-fg-muted">Unavailable</p>
            {source.error !== undefined && (
              <p className="text-caption text-fg-muted/70">{source.error}</p>
            )}
          </div>
        )}
        {source !== null && source.data !== null && children(source.data)}
      </div>
    </section>
  );
}
