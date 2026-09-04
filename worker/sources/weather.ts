import type { Weather, WeatherDay, WeatherHour } from "../../shared/types.ts";
import type { Config } from "../config.ts";
import { fetchJson, UpstreamError } from "../http.ts";

/**
 * Open-Meteo is keyless.
 *
 * Times come back as local ISO strings for the requested zone, with the zone's
 * offset reported separately. That is deliberate over `timeformat=unixtime`:
 * the daily buckets are local midnights, so turning them into dates via
 * toISOString() lands on the previous day for any zone ahead of UTC -- the
 * 3-day forecast would be labelled a day early all summer.
 */
interface OpenMeteoResponse {
  utc_offset_seconds?: number;
  current?: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    is_day: number;
    weather_code: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
    precipitation: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
    is_day: number[];
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
}

const HOURS_AHEAD = 12;
const FORECAST_DAYS = 3;

/** 3600 -> "+01:00". Qualifies the local timestamps so the browser cannot
 *  reinterpret them in whatever zone the TV happens to be set to. */
function offsetSuffix(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

export async function fetchWeather(config: Config): Promise<Weather> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${config.weather.lat}` +
    `&longitude=${config.weather.lon}` +
    "&current=temperature_2m,apparent_temperature,is_day,weather_code," +
    "wind_speed_10m,relative_humidity_2m,precipitation" +
    "&hourly=temperature_2m,weather_code,precipitation_probability,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min," +
    "precipitation_probability_max" +
    "&wind_speed_unit=kmh" +
    `&timezone=${encodeURIComponent(config.timezone)}` +
    `&forecast_days=${FORECAST_DAYS}`;

  const body = await fetchJson<OpenMeteoResponse>(url, { label: "Open-Meteo" });

  const current = body.current;
  const hourly = body.hourly;
  const daily = body.daily;
  if (current === undefined || hourly === undefined || daily === undefined) {
    throw new UpstreamError("Open-Meteo returned an unexpected shape");
  }

  const suffix = offsetSuffix(body.utc_offset_seconds ?? 0);

  // Both are local ISO strings for the same zone, so a lexicographic
  // comparison is an exact "later than now" test with no offset arithmetic.
  const hours: WeatherHour[] = [];
  for (let i = 0; i < hourly.time.length && hours.length < HOURS_AHEAD; i += 1) {
    const local = hourly.time[i];
    if (local === undefined || local <= current.time) continue;
    hours.push({
      time: `${local}:00${suffix}`,
      temperatureC: hourly.temperature_2m[i] ?? 0,
      code: hourly.weather_code[i] ?? 0,
      precipitationProbabilityPct: hourly.precipitation_probability[i] ?? 0,
      isDay: (hourly.is_day[i] ?? 1) === 1,
    });
  }

  const days: WeatherDay[] = daily.time
    .slice(0, FORECAST_DAYS)
    .map((date, i) => ({
      date,
      code: daily.weather_code[i] ?? 0,
      maxC: daily.temperature_2m_max[i] ?? 0,
      minC: daily.temperature_2m_min[i] ?? 0,
      precipitationProbabilityPct: daily.precipitation_probability_max[i] ?? 0,
    }));

  return {
    label: config.weather.label,
    now: {
      temperatureC: current.temperature_2m,
      apparentC: current.apparent_temperature,
      code: current.weather_code,
      isDay: current.is_day === 1,
      windKph: current.wind_speed_10m,
      humidityPct: Math.round(current.relative_humidity_2m),
      precipitationMm: current.precipitation,
    },
    hourly: hours,
    daily: days,
  };
}
