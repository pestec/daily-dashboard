import type { Crypto, Source } from "../../../shared/types.ts";
import { formatMoney, formatSignedPct } from "../../lib/format.ts";
import { Tile } from "../Tile.tsx";

/* Column widths are shared by the header and every row, which is the only
   thing keeping the four columns lined up -- they are separate flex rows, not
   one table, so nothing aligns them automatically. */
const W = {
  symbol: 104,
  change: 118,
} as const;

interface Props {
  source: Source<Crypto> | null;
  now: number;
}

/** Sign and arrow as well as colour: red against green is not a signal on its
 *  own, and this board is read from across a room. */
function Change({
  pct,
  size,
}: {
  pct: number | null | undefined;
  size: number;
}) {
  // KV holds whatever JSON the Worker last wrote successfully, which may be
  // from a version of the code that did not have this field yet. A cached
  // envelope therefore arrives with the field *absent*, not null -- and
  // `undefined` run through a percentage formatter renders as "NaN%" on a
  // screen nobody is standing in front of. Checking the value is a real
  // number covers the missing field, an explicit null, and a NaN alike.
  if (typeof pct !== "number" || !Number.isFinite(pct)) {
    return (
      <span
        className="shrink-0 truncate text-right leading-none text-fg-muted/50"
        style={{ fontSize: `${size}px`, width: `${W.change}px` }}
      >
        —
      </span>
    );
  }

  const up = pct >= 0;
  return (
    <span
      className={`tnum shrink-0 truncate text-right leading-none font-medium ${
        up ? "text-good" : "text-bad"
      }`}
      style={{ fontSize: `${size}px`, width: `${W.change}px` }}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {formatSignedPct(pct)}
    </span>
  );
}

export function CryptoTile({ source, now }: Props) {
  return (
    <Tile
      area="area-crypto"
      label="Crypto"
      source={source}
      now={now}
      accessory={
        source?.data == null ? null : (
          <span className="text-caption text-fg-muted uppercase">
            {source.data.vsCurrency}
          </span>
        )
      }
    >
      {(crypto) => (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {/* Without this the two percentage columns are indistinguishable,
              and a 7d figure read as a 24h one is worse than no figure. */}
          <div className="flex shrink-0 items-center gap-2 px-3 text-[17px] leading-none tracking-[0.08em] text-fg-muted/70 uppercase">
            <span className="shrink-0" style={{ width: `${W.symbol}px` }} />
            <span className="min-w-0 flex-1 truncate text-right">
              {crypto.vsCurrency}
            </span>
            <span
              className="shrink-0 text-right"
              style={{ width: `${W.change}px` }}
            >
              24h
            </span>
            <span
              className="shrink-0 text-right"
              style={{ width: `${W.change}px` }}
            >
              7d
            </span>
          </div>

          <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
            {crypto.tickers.map((ticker) => (
              <li
                key={ticker.id}
                className="glass-subpanel flex min-h-0 min-w-0 flex-1 items-center gap-2 rounded-lg px-3"
              >
                <span
                  className="shrink-0 truncate text-[26px] leading-none font-semibold"
                  style={{ width: `${W.symbol}px` }}
                >
                  {ticker.symbol}
                </span>
                <span className="tnum min-w-0 flex-1 truncate text-right text-[24px] leading-none">
                  {formatMoney(ticker.price, crypto.vsCurrency)}
                </span>
                <Change pct={ticker.change24hPct} size={21} />
                <Change pct={ticker.change7dPct} size={21} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  );
}
