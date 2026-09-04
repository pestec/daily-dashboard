import type { BoardMode, Source, Weather } from "../../../shared/types.ts";
import {
  formatHour,
  formatTemp,
  relativeDayLabel,
} from "../../lib/format.ts";
import { describeCode } from "../../lib/weatherCodes.ts";
import { Tile } from "../Tile.tsx";
import { WeatherIcon } from "../WeatherIcon.tsx";

interface Props {
  source: Source<Weather> | null;
  now: number;
  mode: BoardMode;
}

export function WeatherTile({ source, now, mode }: Props) {
  // Morning turns this into a wide, short band so the commute can dominate.
  // The 3-day forecast is dropped there on purpose: at 07:30 what matters is
  // the next few hours, and keeping it would clip the tile.
  const wide = mode === "morning";

  return (
    <Tile area="area-weather" label="Weather" source={source} now={now}>
      {(weather) => (
        <div
          className={`flex min-h-0 flex-1 gap-8 ${wide ? "flex-row" : "flex-col"}`}
        >
          <div className={wide ? "flex shrink-0 items-center gap-6" : "flex min-h-0 flex-1 gap-8"}>
            <div className="flex shrink-0 items-center gap-6">
              <WeatherIcon
                code={weather.now.code}
                isDay={weather.now.isDay}
                size={wide ? 120 : 190}
                className="shrink-0 text-fg"
              />
              <div className="flex flex-col gap-2">
                <p
                  className="tnum leading-none font-semibold"
                  style={{ fontSize: wide ? "120px" : "180px" }}
                >
                  {formatTemp(weather.now.temperatureC)}
                </p>
                <p className="text-body text-fg-muted">
                  {describeCode(weather.now.code)} · feels{" "}
                  <span className="tnum">{formatTemp(weather.now.apparentC)}</span>
                </p>
                <p className="text-caption text-fg-muted">
                  <span className="tnum">{Math.round(weather.now.windKph)}</span>{" "}
                  km/h · <span className="tnum">{weather.now.humidityPct}</span>%
                  humidity
                </p>
              </div>
            </div>

            {/* Next 3 days, alongside the current conditions rather than
                stacked under them -- otherwise the tall layout leaves a band
                of dead space across the middle. */}
            {!wide && (
              <ul className="flex min-w-0 flex-1 flex-col justify-center gap-3">
                {weather.daily.map((day) => (
                  <li
                    key={day.date}
                    className="glass-subpanel flex items-center gap-5 rounded-xl px-6 py-4"
                  >
                    <WeatherIcon
                      code={day.code}
                      isDay
                      size={52}
                      className="shrink-0 text-fg-muted"
                    />
                    <span className="min-w-0 flex-1 truncate text-body text-fg-muted">
                      {relativeDayLabel(day.date)}
                    </span>
                    <span className="tnum shrink-0 text-body font-medium">
                      {formatTemp(day.maxC)}{" "}
                      <span className="text-fg-muted">{formatTemp(day.minC)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Next 12 hours */}
          <ul
            className={`flex items-end justify-between gap-2 ${
              wide
                ? "min-w-0 flex-1 border-l border-border/40 pl-8"
                : "shrink-0 border-t border-border/40 pt-6"
            }`}
          >
            {weather.hourly.map((hour) => (
              <li key={hour.time} className="flex flex-1 flex-col items-center gap-2">
                <span className="tnum text-caption text-fg-muted">
                  {formatHour(hour.time)}
                </span>
                <WeatherIcon
                  code={hour.code}
                  isDay={hour.isDay}
                  size={40}
                  className="text-fg-muted"
                />
                <span className="tnum text-body font-medium">
                  {formatTemp(hour.temperatureC)}
                </span>
                <span
                  className={`tnum text-caption ${
                    hour.precipitationProbabilityPct >= 40
                      ? "text-accent"
                      : "text-fg-muted/50"
                  }`}
                >
                  {hour.precipitationProbabilityPct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  );
}
