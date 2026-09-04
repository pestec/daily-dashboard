import type { BoardMode, BoardPayload } from "../../shared/types.ts";
import { BinsTile } from "./tiles/BinsTile.tsx";
import { ClockTile } from "./tiles/ClockTile.tsx";
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

export function Board({ payload, mode, now }: Props) {
  const nowMs = now.getTime();

  return (
    <div className="board" data-mode={mode}>
      <TileErrorBoundary label="Clock" className="area-clock">
        <ClockTile now={now} />
      </TileErrorBoundary>

      <TileErrorBoundary label="Weather" className="area-weather">
        <WeatherTile source={payload?.weather ?? null} now={nowMs} mode={mode} />
      </TileErrorBoundary>

      <TileErrorBoundary label="Commute" className="area-commute">
        <CommuteTile source={payload?.commute ?? null} now={nowMs} />
      </TileErrorBoundary>

      <TileErrorBoundary label="Disruption" className="area-tfl">
        <TflTile source={payload?.tfl ?? null} now={nowMs} />
      </TileErrorBoundary>

      <TileErrorBoundary label="Bins" className="area-bins">
        <BinsTile source={payload?.bins ?? null} now={nowMs} />
      </TileErrorBoundary>

      <TileErrorBoundary label="Crypto" className="area-crypto">
        <CryptoTile source={payload?.crypto ?? null} now={nowMs} />
      </TileErrorBoundary>
    </div>
  );
}
