import { useEffect, useRef, useState } from "react";
import type { BoardPayload } from "../../shared/types.ts";
import { fetchBoard } from "../lib/api.ts";
import { config } from "../lib/config.ts";

export interface BoardState {
  payload: BoardPayload | null;
  /** Last fetch error, cleared on the next success. Previous payload is kept. */
  error: string | null;
  lastSuccessAt: number | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  /** Epoch ms of the next scheduled attempt, for the debug overlay. */
  nextPollAt: number | null;
}

const INITIAL: BoardState = {
  payload: null,
  error: null,
  lastSuccessAt: null,
  lastDurationMs: null,
  consecutiveFailures: 0,
  nextPollAt: null,
};

const MAX_BACKOFF_MS = 60_000;

/** 1s, 2s, 4s ... capped at 60s, with jitter so a fleet of these would not
 *  retry in lockstep. Here it mostly avoids hammering a Worker that is down. */
function backoffMs(failures: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (failures - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Polls /api/board forever.
 *
 * Uses a self-rescheduling timeout rather than setInterval: a request slower
 * than the poll period would otherwise stack up requests until the device
 * fell over. Every timer, listener and in-flight request is torn down on
 * unmount, so there is nothing left to leak.
 */
export function useBoard(): BoardState {
  const [state, setState] = useState<BoardState>(INITIAL);

  const timerRef = useRef<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const failuresRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    /** Arms the next attempt and reports when it will happen. */
    const schedule = (delayMs: number): number | null => {
      clearTimer();
      if (stoppedRef.current) return null;
      timerRef.current = window.setTimeout(() => void run(), delayMs);
      return Date.now() + delayMs;
    };

    const run = async (): Promise<void> => {
      if (stoppedRef.current) return;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const { payload, durationMs } = await fetchBoard(controller.signal);
        if (stoppedRef.current || controller.signal.aborted) return;

        failuresRef.current = 0;
        const nextPollAt = schedule(config.pollSeconds * 1000);
        setState({
          payload,
          error: null,
          lastSuccessAt: Date.now(),
          lastDurationMs: Math.round(durationMs),
          consecutiveFailures: 0,
          nextPollAt,
        });
      } catch (error) {
        if (stoppedRef.current || controller.signal.aborted) return;

        failuresRef.current += 1;
        const nextPollAt = schedule(backoffMs(failuresRef.current));
        setState((previous) => ({
          ...previous,
          // The previous payload stays on screen; tiles mark themselves stale.
          error: messageOf(error),
          consecutiveFailures: failuresRef.current,
          nextPollAt,
        }));
      }
    };

    void run();

    // Wi-Fi coming back, or the WebView being brought forward, should recover
    // in seconds rather than waiting out the current backoff.
    const kick = () => {
      if (stoppedRef.current || document.hidden) return;
      failuresRef.current = 0;
      schedule(0);
    };

    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);

    return () => {
      stoppedRef.current = true;
      clearTimer();
      controllerRef.current?.abort();
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, []);

  return state;
}
