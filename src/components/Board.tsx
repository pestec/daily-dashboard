import type { BoardMode, BoardPayload } from "../../shared/types.ts";
import { daysUntil } from "../lib/format.ts";
import { BinsTile } from "./tiles/BinsTile.tsx";
import { CommuteTile } from "./tiles/CommuteTile.tsx";
import { CryptoTile } from "./tiles/CryptoTile.tsx";
import { TflTile } from "./tiles/TflTile.tsx";
import { WeatherTile } from "./tiles/WeatherTile.tsx";
import { TileErrorBoundary } from "./TileErrorBoundary.tsx";

interface Props {
  payload: BoardPayload | null;
  mode: BoardMode;
  now: Date;
}

/**
 * Three tiles, sometimes four.
 *
 * Commute and disruption share one slot rather than competing for space:
 * inside a commute window the only question is how long the drive is, and
 * outside one it is whether the network is broken. Bins joins them only on the
 * eve of a collection -- a tile that spends six days a week saying "not yet"
 * is six days of clutter for one day of use.
 */
export function Board({ payload, mode, now }: Props) {
  const nowMs = now.getTime();
  const commuting = mode === "morning";

  // Deliberately keyed off real data, not off the tile merely existing: if the
  // bins source is dead we do not know whether tomorrow is a collection, and
  // an "Unavailable" panel appearing at random is worse than no panel.
  const next = payload?.bins.data?.next ?? null;
  const showBins = next !== null && daysUntil(next.date, now) === 1;

  return (
    <div
      className="board"
      data-mode={mode}
      data-bins={showBins ? "true" : "false"}
    >
      <TileErrorBoundary label="Now" className="area-weather">
        <WeatherTile source={payload?.weather ?? null} now={nowMs} clock={now} />
      </TileErrorBoundary>

      {commuting ? (
        <TileErrorBoundary label="Commute" className="area-focus">
          <CommuteTile source={payload?.commute ?? null} now={nowMs} />
        </TileErrorBoundary>
      ) : (
        <TileErrorBoundary label="Disruption" className="area-focus">
          <TflTile source={payload?.tfl ?? null} now={nowMs} />
        </TileErrorBoundary>
      )}

      <TileErrorBoundary label="Crypto" className="area-crypto">
        <CryptoTile source={payload?.crypto ?? null} now={nowMs} />
      </TileErrorBoundary>

      {showBins && (
        <TileErrorBoundary label="Bins" className="area-bins">
          <BinsTile source={payload?.bins ?? null} now={nowMs} />
        </TileErrorBoundary>
      )}
    </div>
  );
}
