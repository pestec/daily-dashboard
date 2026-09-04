import type { BoardPayload } from "../../shared/types.ts";
import { mockBoard } from "../../shared/fixtures.ts";
import { config } from "./config.ts";
import { mockVariant, mockVariantRequested } from "./params.ts";

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

  // Forwarded so a deployed preview can be put into its failure states from
  // the URL, without a local build and without touching mock mode.
  const path = mockVariantRequested
    ? `/api/board?mock=${mockVariant}`
    : "/api/board";

  const response = await fetch(path, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`/api/board responded ${response.status}`);
  }
  const payload = (await response.json()) as BoardPayload;
  return { payload, durationMs: performance.now() - started };
}
