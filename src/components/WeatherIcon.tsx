import type { WeatherCode } from "../../shared/types.ts";
import {
  GLYPH_LABELS,
  glyphForCode,
} from "../lib/weatherCodes.ts";

const CLOUD = "M7.5 18h9a3.5 3.5 0 0 0 .3-6.99A5.5 5.5 0 0 0 6.2 12.2 3 3 0 0 0 7.5 18Z";
/* Same cloud lifted so the precipitation below it still fits the 24-unit grid. */
const CLOUD_HIGH =
  "M7.5 14.2h9a3.5 3.5 0 0 0 .3-6.99A5.5 5.5 0 0 0 6.2 8.4 3 3 0 0 0 7.5 14.2Z";

interface Props {
  code: WeatherCode;
  isDay: boolean;
  /** Pixel size. Icons are drawn on a 24-unit grid and scale cleanly. */
  size: number;
  className?: string;
}

/**
 * Hand-drawn so there is no icon-library dependency and no emoji -- emoji
 * render differently on every WebView and cannot be themed.
 */
export function WeatherIcon({ code, isDay, size, className }: Props) {
  const glyph = glyphForCode(code);

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={GLYPH_LABELS[glyph]}
    >
      {glyph === "clear" &&
        (isDay ? (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
          </>
        ) : (
          <path d="M20 14.4A8.2 8.2 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z" />
        ))}

      {glyph === "partly" && (
        <>
          {isDay ? (
            <>
              <circle cx="8.4" cy="8" r="3" />
              <path d="M8.4 2.4v1.6M2.8 8h1.6M4.4 4 5.5 5.1M12.4 4l-1.1 1.1" />
            </>
          ) : (
            <path d="M13.4 8.6A5.4 5.4 0 0 1 7 2.6a5.5 5.5 0 1 0 6.4 6Z" />
          )}
          <path d={CLOUD} />
        </>
      )}

      {glyph === "cloud" && <path d={CLOUD} />}

      {glyph === "fog" && (
        <>
          <path d="M6.4 14.6h9a3.5 3.5 0 0 0 .3-6.99A5.5 5.5 0 0 0 5.1 8.8 3 3 0 0 0 6.4 14.6Z" />
          <path d="M4 18h16M6.5 21h11" />
        </>
      )}

      {glyph === "drizzle" && (
        <>
          <path d={CLOUD_HIGH} />
          <path d="M9.6 17.2v1.6M14.4 17.2v1.6M12 18.4v1.6" />
        </>
      )}

      {glyph === "rain" && (
        <>
          <path d={CLOUD_HIGH} />
          <path d="M9.2 16.8v3.4M12 17.6v3.6M14.8 16.8v3.4" />
        </>
      )}

      {glyph === "snow" && (
        <>
          <path d={CLOUD_HIGH} />
          <path d="M9.4 17.6v2.6M8.3 18.2l2.2 1.4M10.5 18.2l-2.2 1.4" />
          <path d="M14.6 17.6v2.6M13.5 18.2l2.2 1.4M15.7 18.2l-2.2 1.4" />
        </>
      )}

      {glyph === "thunder" && (
        <>
          <path d={CLOUD_HIGH} />
          <path d="M13.4 16.2 9.8 20.4h3.1l-1.7 3.2" />
        </>
      )}

    </svg>
  );
}
