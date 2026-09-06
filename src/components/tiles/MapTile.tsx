import { useEffect, useRef, useState, type CSSProperties } from "react";
import { zoomForLongitudeSpan } from "../../../shared/mapFraming.ts";
import type { MapView } from "../../../shared/types.ts";
import { useSlowOffset } from "../../hooks/useBurnInShift.ts";
import { useNightDim } from "../../hooks/useNightDim.ts";
import { config } from "../../lib/config.ts";
import { DARK_MAP_STYLE, loadGoogleMaps } from "../../lib/googleMaps.ts";

/** How long to wait before trying the script again. The board is expected to
 *  ride out a router reboot, so this retries for as long as the tile is up
 *  rather than giving up after a few goes. */
const RETRY_MS = 300_000;

type Status = "loading" | "ready" | "failed";

/** The outcome of one attempt, tagged with the view it was an attempt at. */
interface Attempt {
  view: string;
  status: Exclude<Status, "loading">;
}

interface Props {
  /** Null when the Worker has no Maps key configured. */
  view: MapView | null;
  /** The ticking clock, for the night decision. */
  clock: Date;
}

/**
 * Live traffic around home, in the slot the disruption board used to hold.
 *
 * Three things make this different from every other tile. It draws itself
 * rather than being handed data, so there is no Source wrapper and no
 * staleness marker -- Google's traffic layer refreshes itself inside the map
 * that is already on screen, and a stamp saying when the *payload* arrived
 * would be describing the wrong thing entirely.
 *
 * It is also the only tile that costs money to show. Google bills the JS map
 * per instantiation, not per repaint, so what matters is how often this
 * mounts: the nightly reload, the two mode changes on a weekday, and waking
 * up in the morning. Single figures a day. The 60s poll replaces the payload
 * object every minute and must not rebuild the map along with it, which is
 * why the effect below depends on the individual fields rather than on the
 * object they arrive in.
 *
 * And it is the worst thing on the board for burn-in: the largest continuous
 * area, on for most of the day, drawing a shape that is identical every
 * single day. See the drift and the night blanking below.
 */
export function MapTile({ view, clock }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  const night = useNightDim(clock);
  const asleep = night && config.mapHideAtNight;

  const drift = useSlowOffset(config.mapDriftPx, config.mapDriftMinutes);

  // Pulled out of `view` on purpose. `payload.meta.map` is a fresh object on
  // every poll even when nothing in it changed, so depending on the object
  // would tear down and rebuild the map -- and rebill it -- once a minute.
  const key = view?.key ?? null;
  const lat = view?.lat ?? null;
  const lon = view?.lon ?? null;
  const zoom = view?.zoom ?? null;
  const westLon = view?.westLon ?? null;
  const eastLon = view?.eastLon ?? null;
  const mapId = view?.mapId ?? null;

  /**
   * Identity of the map currently being asked for.
   *
   * Carrying it alongside the outcome is what lets "loading" be *derived*
   * rather than assigned: change the zoom in the dashboard, or cross the night
   * boundary, and the tag no longer matches, so the tile reads as loading
   * again without the effect having to reach back and reset it.
   */
  const token = [key, lat, lon, zoom, westLon, eastLon, mapId, asleep].join("|");
  const status: Status = attempt?.view === token ? attempt.status : "loading";

  useEffect(() => {
    if (key === null || lat === null || lon === null || zoom === null) return;
    if (asleep) return;

    // Captured once. Effects run after the host is in the DOM, and holding
    // the node rather than re-reading the ref is what lets the cleanup below
    // clear the same element this attempt filled.
    const host = hostRef.current;
    if (host === null) return;

    let cancelled = false;
    let retry: number | undefined;

    const attach = async (): Promise<void> => {
      try {
        const maps = await loadGoogleMaps(key);
        if (cancelled) return;

        // Measured, not assumed. The frame is the panel's own box; the host
        // above it is deliberately wider, overhanging by the drift distance
        // so the burn-in shift never uncovers an edge, and framing against
        // that would put the limits slightly outside the visible window.
        //
        // Read once, at construction. The board is a fixed 1920x1080 canvas
        // scaled as a whole -- a CSS transform, which does not change layout
        // widths -- so this tile is 1229px for the life of the page and there
        // is nothing to re-measure on.
        const framed = frame(frameRef.current, westLon, eastLon);

        const map = new maps.Map(host, {
          center: { lat, lng: framed?.centreLon ?? lon },
          zoom: framed?.zoom ?? zoom,
          isFractionalZoomEnabled: true,
          // A cloud-styled map id and inline styles are mutually exclusive:
          // Google ignores the second and warns. Send whichever is configured.
          ...(mapId !== null ? { mapId } : { styles: DARK_MAP_STYLE }),
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          clickableIcons: false,
          backgroundColor: "#081222",
        });
        new maps.TrafficLayer().setMap(map);

        setAttempt({ view: token, status: "ready" });
      } catch {
        if (cancelled) return;
        setAttempt({ view: token, status: "failed" });
        retry = window.setTimeout(() => void attach(), RETRY_MS);
      }
    };

    void attach();

    return () => {
      cancelled = true;
      if (retry !== undefined) window.clearTimeout(retry);
      // Google fills the host with DOM of its own, which React neither owns
      // nor removes. Without this, re-running the effect on a host that is
      // still mounted -- a zoom changed in the dashboard, say -- constructs a
      // second map on top of the first and leaks it.
      host.replaceChildren();
    };
  }, [key, lat, lon, zoom, westLon, eastLon, mapId, asleep, token]);

  return (
    <section className="area-focus glass-panel min-h-0 min-w-0 overflow-hidden rounded-2xl">
      {/* The shell's own `> *` rule makes this the positioning context, which
          is what the absolutely placed map and label below hang off. */}
      <div ref={frameRef} className="h-full w-full">
        {view !== null && !asleep && (
          <div
            ref={hostRef}
            className="map-layer"
            style={
              {
                "--map-inset": `${-config.mapDriftPx}px`,
                "--map-x": `${drift.x}px`,
                "--map-y": `${drift.y}px`,
              } as CSSProperties
            }
          />
        )}

        <div className="absolute top-6 left-6 flex items-center gap-3 rounded-xl border border-border/35 bg-bg/72 px-4 py-2 backdrop-blur-sm">
          <h2 className="text-title leading-none font-medium tracking-[0.08em] text-fg-muted uppercase">
            Traffic
          </h2>
          <State view={view} asleep={asleep} status={status} />
        </div>
      </div>
    </section>
  );
}

/**
 * Centre and zoom derived from the configured east-west limits, or null when
 * they are not set and the tile should use its own `lon` and `zoom`.
 *
 * The limits define the horizontal centre as well as the zoom: asking for a
 * particular thing at each edge fixes the midpoint between them, and honouring
 * the span while centring somewhere else would put one of the two limits off
 * screen. The vertical centre is left alone -- there is no second pair for it,
 * because north-south coverage is not a free choice: it is whatever the tile's
 * height-to-width ratio makes of the east-west extent.
 */
function frame(
  element: HTMLElement | null,
  westLon: number | null,
  eastLon: number | null,
): { centreLon: number; zoom: number } | null {
  if (element === null || westLon === null || eastLon === null) return null;

  const zoom = zoomForLongitudeSpan(eastLon - westLon, element.clientWidth);
  if (zoom === null) return null;

  return { centreLon: (westLon + eastLon) / 2, zoom };
}

/**
 * The one-word tail on the label, which is also the tile's whole error
 * surface. A map that is up says "live" and nothing else; every other state
 * says which of the four possible reasons it is not showing one, because from
 * a sofa "no key configured" and "the Wi-Fi is down" look identical otherwise.
 */
function State({
  view,
  asleep,
  status,
}: {
  view: MapView | null;
  asleep: boolean;
  status: Status;
}) {
  if (view === null) {
    return <span className="text-caption text-fg-muted/70">Not configured</span>;
  }

  if (asleep) {
    return (
      <span className="text-caption text-fg-muted/70 tnum">
        Resumes {String(config.nightEndHour).padStart(2, "0")}:00
      </span>
    );
  }

  if (status === "failed") {
    return <span className="text-caption text-warn">Unavailable</span>;
  }

  if (status === "loading") {
    return <span className="text-caption text-fg-muted/70">Loading…</span>;
  }

  return (
    <span className="flex items-center gap-2 text-caption text-good">
      <span aria-hidden="true" className="size-2.5 rounded-full bg-good" />
      Live
    </span>
  );
}
