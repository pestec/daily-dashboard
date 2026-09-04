import type { BoardMode, Source, Weather } from "../../../shared/types.ts";
import {
  formatHour,
  formatTemp,
  formatWeekdayShort,
  relativeDayLabelShort,
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
  const wide = mode === "morning";

  return (
    <Tile area="area-weather" label="Weather" source={source} now={now}>
      {(weather) => (
        <div className={`flex min-h-0 flex-1 ${wide ? "flex-col gap-4" : "flex-row gap-6"}`}>
          <div className={wide ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4" : "flex min-h-0 flex-1 gap-6"}>
            <div className="flex shrink-0 items-center gap-5">
              <WeatherIcon
                code={weather.now.code}
                isDay={weather.now.isDay}
                size={wide ? 78 : 150}
                className="shrink-0 text-fg"
              />
              <div className="flex flex-col gap-2">
                <p
                  className="tnum leading-none font-semibold"
                  style={{ fontSize: wide ? "90px" : "150px" }}
                >
                  {formatTemp(weather.now.temperatureC)}
                </p>
                <p className={wide ? "text-[20px] text-fg-muted" : "text-body text-fg-muted"}>
                  {describeCode(weather.now.code)} · feels{" "}
                  <span className="tnum">{formatTemp(weather.now.apparentC)}</span>
                </p>
                <p className={wide ? "text-[18px] text-fg-muted" : "text-caption text-fg-muted"}>
                  <span className="tnum">{Math.round(weather.now.windKph)}</span>{" "}
                  km/h · <span className="tnum">{weather.now.humidityPct}</span>%
                  humidity
                </p>
              </div>
            </div>

            <ul
              className={
                wide
                  ? "grid min-w-0 grid-cols-7 gap-1"
                  : "grid min-w-0 flex-1 grid-cols-1 gap-2"
              }
            >
              {weather.daily.slice(0, 7).map((day) => (
                <li
                  key={day.date}
                  className={`glass-subpanel flex rounded-lg ${
                    wide
                      ? "min-w-0 flex-col items-center gap-0.5 px-1 py-1.5"
                      : "items-center gap-4 px-4 py-2"
                  }`}
                >
                  <span
                    className={`min-w-0 truncate text-fg-muted ${wide ? "text-[14px]" : "text-caption"}`}
                    title={relativeDayLabelShort(day.date)}
                  >
                    {wide ? formatWeekdayShort(day.date) : relativeDayLabelShort(day.date)}
                  </span>
                  <WeatherIcon
                    code={day.code}
                    isDay
                    size={wide ? 18 : 34}
                    className="text-fg-muted"
                  />
                  <span className={`tnum font-medium ${wide ? "text-[14px]" : "text-caption"}`}>
                    {formatTemp(day.maxC)} <span className="text-fg-muted">{formatTemp(day.minC)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Next 12 hours */}
          <ul
            className={`flex items-end justify-between gap-2 ${
              wide
                ? "min-w-0 border-t border-border/40 pt-4"
                : "min-w-0 shrink-0 border-l border-border/40 pl-5"
            }`}
          >
            {weather.hourly.map((hour) => (
              <li key={hour.time} className="flex flex-1 flex-col items-center gap-1">
                <span className={`tnum text-fg-muted ${wide ? "text-[18px]" : "text-caption"}`}>
                  {formatHour(hour.time)}
                </span>
                <WeatherIcon
                  code={hour.code}
                  isDay={hour.isDay}
                  size={wide ? 28 : 40}
                  className="text-fg-muted"
                />
                <span className={`tnum font-medium ${wide ? "text-[20px]" : "text-body"}`}>
                  {formatTemp(hour.temperatureC)}
                </span>
                <span
                  className={`tnum ${wide ? "text-[16px]" : "text-caption"} ${
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
