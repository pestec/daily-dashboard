import { SOURCE_KEYS, type BoardMode, type BoardPayload } from "../../shared/types.ts";
import type { BoardState } from "../hooks/useBoard.ts";
import type { BurnInOffset } from "../hooks/useBurnInShift.ts";
import { config } from "../lib/config.ts";
import { formatAge } from "../lib/format.ts";
import { mockVariant } from "../lib/params.ts";
import { isStale } from "../lib/staleness.ts";

interface Props {
  board: BoardState;
  mode: BoardMode;
  night: boolean;
  burnIn: BurnInOffset;
  now: number;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-36 shrink-0 text-fg-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

const STATUS_COLOUR: Record<string, string> = {
  ok: "text-good",
  stale: "text-warn",
  error: "text-bad",
  disabled: "text-fg-muted",
};

/**
 * Rendered only for ?debug. Deliberately an overlay rather than a route, so it
 * can be checked against the real board on the real device without changing
 * what the board is doing.
 *
 * Text here is below the 24px floor the board itself keeps -- this is a
 * diagnostic panel read up close, not content read from three metres.
 */
export function DebugOverlay({ board, mode, night, burnIn, now }: Props) {
  const payload: BoardPayload | null = board.payload;

  return (
    <aside className="pointer-events-none fixed top-6 left-6 z-50 max-h-[calc(100%-3rem)] w-[560px] overflow-hidden rounded-xl border border-border bg-black/85 p-5 font-mono text-[17px] leading-relaxed text-fg">
      <h2 className="mb-3 font-semibold tracking-wide text-accent">debug</h2>

      <div className="flex flex-col gap-1">
        <Row label="source">
          {config.useMock ? `mock (${mockVariant})` : "worker /api/board"}
        </Row>
        <Row label="last fetch">
          {board.lastDurationMs === null ? "—" : `${board.lastDurationMs} ms`}
        </Row>
        <Row label="last success">
          {board.lastSuccessAt === null
            ? "never"
            : `${formatAge(new Date(board.lastSuccessAt).toISOString(), now)} ago`}
        </Row>
        <Row label="next poll">
          {board.nextPollAt === null
            ? "—"
            : `${Math.max(0, Math.round((board.nextPollAt - now) / 1000))}s`}
        </Row>
        <Row label="failures">
          <span className={board.consecutiveFailures > 0 ? "text-bad" : ""}>
            {board.consecutiveFailures}
          </span>
        </Row>
        {board.error !== null && (
          <Row label="fetch error">
            <span className="text-bad">{board.error}</span>
          </Row>
        )}
      </div>

      <h3 className="mt-4 mb-2 font-semibold text-fg-muted">sources</h3>
      <div className="flex flex-col gap-1">
        {payload === null ? (
          <span className="text-fg-muted">no payload yet</span>
        ) : (
          SOURCE_KEYS.map((key) => {
            const source = payload[key];
            const stale = isStale(source, now);
            return (
              <Row key={key} label={key}>
                <span className={STATUS_COLOUR[source.status] ?? ""}>
                  {source.status}
                </span>
                {" · "}
                {source.fetchedAt === null
                  ? "never"
                  : `${formatAge(source.fetchedAt, now)} old`}
                {" / ttl "}
                {source.ttlSeconds}s{stale && <span className="text-warn"> STALE</span>}
                {source.error !== undefined && (
                  <span className="text-bad"> · {source.error}</span>
                )}
              </Row>
            );
          })
        )}
      </div>

      <h3 className="mt-4 mb-2 font-semibold text-fg-muted">layout</h3>
      <div className="flex flex-col gap-1">
        <Row label="mode">{mode}</Row>
        <Row label="night">{String(night)}</Row>
        <Row label="burn-in">
          {burnIn.x}, {burnIn.y} px
        </Row>
        <Row label="generated">{payload?.generatedAt ?? "—"}</Row>
      </div>
    </aside>
  );
}
