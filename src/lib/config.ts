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
  /**
   * The traffic map's own burn-in cycle, inside its tile.
   *
   * Deliberately a bigger step than the board's and on a period that does not
   * divide into it, because the map is the one thing on the board whose shape
   * never changes on its own -- a road network is the same picture every day,
   * which is precisely the pattern a panel retains. The map layer is oversized
   * by this many pixels so the drift never uncovers an edge.
   */
  mapDriftPx: num(env.VITE_MAP_DRIFT_PX, 16),
  mapDriftMinutes: num(env.VITE_MAP_DRIFT_MINUTES, 7),
  /** Blank the map overnight rather than dim it. Eight hours a day of not
   *  drawing it at all is worth more than any amount of dimming, and there is
   *  no traffic to report at 03:00 anyway. */
  mapHideAtNight: bool(env.VITE_MAP_HIDE_AT_NIGHT, true),
  /**
   * The map's own blanking window, deliberately not the palette's.
   *
   * The dim exists so the room is not lit up; the blank exists so the panel
   * is not asked to hold one road network in the same pixels for years.
   * Different jobs, so different hours -- traffic is still worth a look for
   * the hour after the board has dimmed, while people are still out on it.
   * Wraps midnight exactly as the night hours do.
   */
  mapHideStartHour: num(env.VITE_MAP_HIDE_START, 23),
  mapHideEndHour: num(env.VITE_MAP_HIDE_END, 7),
  timezone: env.VITE_TIMEZONE ?? "Europe/London",
  locale: env.VITE_LOCALE ?? "en-GB",
} as const;
