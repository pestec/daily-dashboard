/**
 * Turning a pair of east-west limits into a Google Maps zoom.
 *
 * The traffic tile is framed by naming what should sit at its left and right
 * edges -- "London City Airport to Lakeside" -- rather than by guessing a zoom
 * number and checking the result on the TV. This is the arithmetic that
 * converts one into the other, and it lives in `shared/` so it can be tested:
 * the framing is impossible to eyeball from anywhere but the sofa, and a
 * factor-of-two error here looks exactly like a plausible map.
 */

/**
 * The range of zooms the traffic layer is actually useful over.
 *
 * The floor is Google's own thinning: it draws less traffic the further out
 * you go, and below 10 the tile stops being a picture of an area and becomes a
 * few coloured motorways on an empty field. That one is a real limit -- past
 * it the tile silently stops doing its job.
 *
 * The ceiling is softer, and has been raised: 14 was a judgement about how
 * much surrounding network is worth keeping on screen, which is not a
 * judgement worth enforcing against the person actually looking at the
 * screen. 16 is roughly where a 1229px tile is down to a couple of
 * kilometres and the question stops being about traffic at all.
 *
 * Shared because both sides clamp: the Worker when MAP_ZOOM is pinned by
 * hand, and the board when it derives a zoom from the configured limits.
 */
export const MAP_ZOOM_MIN = 9;
export const MAP_ZOOM_MAX = 16;

/** Used when nothing is pinned and no limits are set to derive from. */
export const MAP_ZOOM_DEFAULT = 11;

/** Google's world is 256px square at zoom 0, and doubles with every step. */
const WORLD_TILE_PX = 256;

export function clampMapZoom(zoom: number): number {
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, zoom));
}

/**
 * The zoom at which `spanDegrees` of longitude exactly fills `widthPx`.
 *
 * Longitude is the easy axis: Web Mercator is linear in it, so the whole
 * calculation is "how many doublings fit 360 degrees of a 256px world into
 * this many pixels", with no latitude and no earth radius involved. Latitude
 * would need the projection proper, which is why the tile is framed by its
 * left and right edges and not its top and bottom.
 *
 * The result is deliberately fractional. Rounding it to an integer zoom moves
 * the edges by up to a factor of two, which is the difference between reaching
 * the next town and stopping short of it -- the map is asked to honour it with
 * `isFractionalZoomEnabled`.
 *
 * Returns null rather than a wrong number for input that cannot describe a
 * frame: a zero or negative span, or a container that has not been laid out.
 */
export function zoomForLongitudeSpan(
  spanDegrees: number,
  widthPx: number,
): number | null {
  if (!Number.isFinite(spanDegrees) || spanDegrees <= 0) return null;
  if (!Number.isFinite(widthPx) || widthPx <= 0) return null;

  return clampMapZoom(
    Math.log2((widthPx * 360) / (WORLD_TILE_PX * spanDegrees)),
  );
}
