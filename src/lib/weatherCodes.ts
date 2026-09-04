import type { WeatherCode } from "../../shared/types.ts";

export type WeatherGlyph =
  | "clear"
  | "partly"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder";

/** WMO interpretation codes, grouped down to the shapes worth drawing. */
export function glyphForCode(code: WeatherCode): WeatherGlyph {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloud";
}

export const GLYPH_LABELS: Record<WeatherGlyph, string> = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloud: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  thunder: "Thunderstorm",
};

export const describeCode = (code: WeatherCode): string =>
  GLYPH_LABELS[glyphForCode(code)];
