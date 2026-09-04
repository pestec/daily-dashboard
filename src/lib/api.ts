import type { BoardPayload } from "../../shared/types.ts";
import { mockBoard } from "../mocks/board.mock.ts";
import { config } from "./config.ts";
import { mockVariant } from "./params.ts";

export interface FetchResult {
  payload: BoardPayload;
  /** Wall-clock milliseconds the request took, for the debug overlay. */
  durationMs: number;
}

export async function fetchBoard(signal: AbortSignal): Promise<FetchResult> {
  const started = performance.now();

  if (config.useMock) {
    // A touch of latency so loading states are actually exercised in dev.
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return { payload: mockBoard(mockVariant), durationMs: performance.now() - started };
  }

  const response = await fetch("/api/board", { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`/api/board responded ${response.status}`);
  }
  const payload = (await response.json()) as BoardPayload;
  return { payload, durationMs: performance.now() - started };
}
