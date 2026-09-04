import type { Crypto, Source } from "../../../shared/types.ts";
import { formatMoney, formatSignedPct } from "../../lib/format.ts";
import { Tile } from "../Tile.tsx";

interface Props {
  source: Source<Crypto> | null;
  now: number;
}

export function CryptoTile({ source, now }: Props) {
  return (
    <Tile area="area-crypto" label="Crypto" source={source} now={now}>
      {(crypto) => (
        <ul className="flex min-h-0 flex-1 flex-col justify-around">
          {crypto.tickers.map((ticker) => {
            const up = ticker.change24hPct >= 0;
            return (
              <li
                key={ticker.id}
                className="flex items-baseline justify-between gap-4"
              >
                <span className="text-body font-medium">{ticker.symbol}</span>
                <span className="tnum text-body text-fg-muted">
                  {formatMoney(ticker.price, crypto.vsCurrency)}
                </span>
                <span
                  className={`tnum flex w-40 items-baseline justify-end gap-2 text-body font-medium ${
                    up ? "text-good" : "text-bad"
                  }`}
                >
                  {/* Arrow as well as colour: red/green alone is not a signal. */}
                  <span aria-hidden="true">{up ? "▲" : "▼"}</span>
                  {formatSignedPct(ticker.change24hPct)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Tile>
  );
}
