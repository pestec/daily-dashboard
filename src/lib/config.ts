function num(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

const env = import.meta.env;

export const config = {
  /** Serve fixtures instead of calling the Worker. No keys, no network. */
  useMock: bool(env.VITE_USE_MOCK, false),
  /** How often to ask the Worker. The Worker decides how stale each source
   *  is allowed to be; this is just the heartbeat. */
  pollSeconds: num(env.VITE_POLL_SECONDS, 60),
  /** Hour the palette dims, and the hour it comes back. Wraps midnight. */
  nightStartHour: num(env.VITE_NIGHT_START, 22),
  nightEndHour: num(env.VITE_NIGHT_END, 7),
  /** Quiet hour for the once-a-day full reload. */
  reloadHour: num(env.VITE_RELOAD_HOUR, 4),
  /** Pixel radius of the burn-in shift, and how often it steps. */
  burnInPx: num(env.VITE_BURN_IN_PX, 6),
  burnInMinutes: num(env.VITE_BURN_IN_MINUTES, 10),
  timezone: env.VITE_TIMEZONE ?? "Europe/London",
  locale: env.VITE_LOCALE ?? "en-GB",
} as const;
