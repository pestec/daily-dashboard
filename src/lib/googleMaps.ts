/**
 * Loading the Maps JavaScript API, and the dark style the board draws it in.
 *
 * The types below are hand-written rather than pulled from @types/google.maps.
 * The board touches four things on Google's surface -- construct a map, attach
 * a traffic layer, and two setters -- and writing them out keeps that surface
 * visible instead of importing a megabyte of definitions to describe it.
 */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

/**
 * Nearly opaque. Every change to the view -- centre, style, the night
 * boundary -- rebuilds the map rather than mutating it, so the only reason
 * to hold the handle is to find out what zoom the map *actually* took and,
 * when that is not the one it was given, to insist. See MapTile.
 */
export interface GoogleMapInstance {
  /** Undefined before the map has settled on one. */
  getZoom(): number | undefined;
  setZoom(zoom: number): void;
}

interface MapOptions {
  center: LatLngLiteral;
  zoom: number;
  mapId?: string;
  /** Every control, including the ones that only appear on hover. Nothing on
   *  this board is interactive and a stray control would just sit there. */
  disableDefaultUI?: boolean;
  gestureHandling?: "none";
  keyboardShortcuts?: boolean;
  clickableIcons?: boolean;
  /**
   * Raster maps round the zoom to an integer unless this is on, and a
   * rounded zoom moves the edges by up to a factor of two -- which is the
   * difference between a frame that reaches the landmark it was told to and
   * one that stops a mile short. Vector maps (a cloud `mapId`) default to
   * true; this board asks explicitly because it usually runs raster.
   */
  isFractionalZoomEnabled?: boolean;
  /** Painted before any tile arrives. Left unset it is Google's near-white,
   *  which on a dark board is a flash of a bright rectangle on every load. */
  backgroundColor?: string;
  styles?: readonly MapStyle[];
}

interface MapStyle {
  featureType?: string;
  elementType?: string;
  stylers: ReadonlyArray<Record<string, string | number>>;
}

interface TrafficLayerInstance {
  setMap(map: GoogleMapInstance | null): void;
}

export interface MapsApi {
  Map: new (host: HTMLElement, options: MapOptions) => GoogleMapInstance;
  TrafficLayer: new () => TrafficLayerInstance;
}

declare global {
  interface Window {
    google?: { maps?: MapsApi };
    __dashboardMapsReady?: () => void;
  }
}

/**
 * The board's palette, applied to the map.
 *
 * Two jobs beyond looking right. The first is luminance: this panel is the
 * largest continuous area of the board and it is on for most of the day, so
 * every surface is pushed down to near the page background and nothing is
 * allowed to be a big pale shape. The second is that the traffic layer is the
 * only saturated thing left, which is the entire point of the tile -- green,
 * amber and red read instantly when they are the sole colours on screen.
 *
 * Labels are cut back to localities and motorway numbers. At the zoom this
 * runs at, street names are illegible from a sofa and would only add clutter
 * to a picture that is being read as shapes.
 */
export const DARK_MAP_STYLE: readonly MapStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#081222" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7f9bc4" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#040c18" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#081222" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ visibility: "off" }],
  },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#030d1b" }] },
  { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#152c48" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.local", stylers: [{ visibility: "simplified" }] },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#1a3757" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#22456d" }],
  },
  // The one class of road label worth keeping: knowing the red stripe is the
  // A12 is most of the value of the tile.
  {
    featureType: "road.highway",
    elementType: "labels.text",
    stylers: [{ visibility: "on" }, { color: "#8fb0d8" }],
  },
];

/** Google calls this by name once its script has parsed. */
const CALLBACK = "__dashboardMapsReady";

/** A TV on a flaky connection can leave a script request hanging rather than
 *  failing it, and a promise that never settles is a tile stuck on "Loading"
 *  until the nightly reload. */
const LOAD_TIMEOUT_MS = 20_000;

let pending: Promise<MapsApi> | null = null;

/**
 * Loads the Maps JavaScript API once per page.
 *
 * The promise is cached so remounting the tile -- which happens at every mode
 * change and every night boundary -- reuses the script that is already there
 * instead of adding another. A *failed* load is deliberately not cached: the
 * board is expected to survive the router being off for an hour, so the tile
 * must be able to try again once the network is back.
 */
export function loadGoogleMaps(key: string): Promise<MapsApi> {
  if (pending !== null) return pending;

  pending = new Promise<MapsApi>((resolve, reject) => {
    const loaded = window.google?.maps;
    if (loaded !== undefined) {
      resolve(loaded);
      return;
    }

    const script = document.createElement("script");

    // Declared before `timer` exists, and that is fine: nothing here runs
    // until the script settles one way or the other, by which point the
    // timeout below has been assigned.
    const cleanup = () => {
      window.clearTimeout(timer);
      delete window[CALLBACK];
    };

    const fail = (reason: string) => {
      cleanup();
      script.remove();
      reject(new Error(reason));
    };

    window[CALLBACK] = () => {
      cleanup();
      const api = window.google?.maps;
      if (api === undefined) {
        fail("Maps script loaded without an API");
        return;
      }
      resolve(api);
    };

    const timer = window.setTimeout(
      () => fail("Maps script timed out"),
      LOAD_TIMEOUT_MS,
    );
    script.onerror = () => fail("Maps script failed to load");

    script.async = true;
    // `loading=async` is what stops Google logging a performance warning on
    // every load; with it, the callback parameter is the supported way in.
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(key)}` +
      "&v=weekly&libraries=maps&loading=async" +
      `&callback=${CALLBACK}`;
    document.head.append(script);
  });

  // Clears the cache on failure without leaving the rejection unhandled. The
  // caller still sees its own rejection from the promise it was handed.
  pending.catch(() => {
    pending = null;
  });

  return pending;
}
