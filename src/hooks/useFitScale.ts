import { useEffect, useState } from "react";

/** The board is authored at exactly this size and then scaled to the panel. */
export const BOARD_WIDTH = 1920;
export const BOARD_HEIGHT = 1080;

function computeScale(): number {
  const byWidth = window.innerWidth / BOARD_WIDTH;
  const byHeight = window.innerHeight / BOARD_HEIGHT;
  // Whichever axis is tighter, so the board always fits whole. Upscaling is
  // allowed, so a panel reporting a 4K viewport fills the screen rather than
  // showing a 1920x1080 board in the middle of it.
  const scale = Math.min(byWidth, byHeight);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * Fits the fixed-size board to whatever viewport it lands in.
 *
 * The viewport meta tag alone is not enough to rely on: desktop Chromium
 * ignores it entirely, and there is no way to confirm from here what a given
 * WebView reports. Measuring and scaling makes the fit explicit, so "it must
 * never scroll" holds on hardware this was never tested against.
 */
export function useFitScale(): number {
  const [scale, setScale] = useState(computeScale);

  useEffect(() => {
    let frame = 0;

    const onResize = () => {
      // Resize can fire in bursts while a TV renegotiates its output mode.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScale(computeScale()));
    };

    // Covers the case where the viewport settled between first render and now.
    onResize();

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return scale;
}
