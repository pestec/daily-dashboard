import type {
  Source,
  Weather,
  WeatherDay,
  WeatherHour,
} from "../../../shared/types.ts";
import {
  formatClockDate,
  formatClockTime,
  formatHour,
  formatTemp,
  formatWeekdayShort,
} from "../../lib/format.ts";
import { tempColor } from "../../lib/tempScale.ts";
import { describeCode } from "../../lib/weatherCodes.ts";
import { Tile } from "../Tile.tsx";
import { WeatherIcon } from "../WeatherIcon.tsx";

/* ---------------------------------------------------------------------------
   Time and weather in one panel.

   They were two tiles before, which cost a whole grid cell to say something
   every phone says for free, and left the clock stranded in a corner. Together
   they are the "what is it like right now" panel and hold the same block of
   the board in both modes, so the two things glanced at most never move.

   The box is a fixed 1165x504 now that the layout no longer reshuffles between
   modes, so the sizes below are one set rather than two. They are tuned to
   leave the rain track roughly 38px: it is a rhythm to read the strip by, not
   a chart, and it used to eat a third of the tile.
--------------------------------------------------------------------------- */

const S = {
  clockTime: 96,
  clockDate: 26,
  nowIcon: 80,
  nowTemp: 88,
  nowCondition: 30,
  nowMeta: 22,
  hourLabel: 22,
  hourIcon: 34,
  hourTemp: 26,
  hourPct: 18,
  dayLabel: 28,
  dayLabelWidth: 84,
  dayIcon: 40,
  dayPct: 24,
  dayPctWidth: 54,
  dayTemp: 28,
  dayTempWidth: 54,
  dayBar: 12,
  dayMarker: 14,
} as const;

interface Props {
  source: Source<Weather> | null;
  /** Milliseconds, for the staleness marker. */
  now: number;
  /** The ticking clock. Separate from `now` because one is a timestamp to
   *  compare against and the other is a value to render. */
  clock: Date;
}

export function WeatherTile({ source, now, clock }: Props) {
  const label = source?.data?.label;

  return (
    <Tile
      area="area-weather"
      label="Now"
      source={source}
      now={now}
      accessory={
        label === undefined ? null : (
          <span className="truncate text-caption text-fg-muted">{label}</span>
        )
      }
    >
      {(weather) => (
        <div className="flex min-h-0 min-w-0 flex-1 gap-6">
          <div className="flex min-h-0 min-w-0 flex-[1.35] flex-col gap-2.5">
            <Clock clock={clock} />
            <CurrentConditions weather={weather} />
            <MetricsRow weather={weather} />
            <HourlyStrip hours={weather.hourly} />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border/40 pl-6">
            <DailyForecast
              days={weather.daily.slice(0, 7)}
              nowC={weather.now.temperatureC}
            />
          </div>
        </div>
      )}
    </Tile>
  );
}

/* -------------------------------------------------------------------------- */

/** 24-hour and tabular, with no seconds: a per-second repaint for weeks buys
 *  nothing on a wall display, and the digits would shimmer from across a
 *  room. Tabular figures stop the line reflowing on every tick. */
function Clock({ clock }: { clock: Date }) {
  return (
    <div className="flex shrink-0 items-baseline gap-5">
      <time
        className="tnum leading-none font-semibold"
        style={{ fontSize: `${S.clockTime}px` }}
        dateTime={clock.toISOString()}
      >
        {formatClockTime(clock)}
      </time>
      <p
        className="min-w-0 truncate leading-none text-fg-muted"
        style={{ fontSize: `${S.clockDate}px` }}
      >
        {formatClockDate(clock)}
      </p>
    </div>
  );
}

/** Icon, temperature and condition on one baseline, so the block stays only as
 *  tall as the number no matter how much text sits beside it. */
function CurrentConditions({ weather }: { weather: Weather }) {
  const { now } = weather;

  return (
    <div className="flex shrink-0 items-center gap-5">
      <WeatherIcon
        code={now.code}
        isDay={now.isDay}
        size={S.nowIcon}
        className="shrink-0 text-fg"
      />
      <p
        className="tnum shrink-0 leading-none font-semibold"
        style={{ fontSize: `${S.nowTemp}px` }}
      >
        {formatTemp(now.temperatureC)}
      </p>
      <div className="flex min-w-0 flex-col gap-1">
        <p
          className="truncate leading-tight font-medium"
          style={{ fontSize: `${S.nowCondition}px` }}
        >
          {describeCode(now.code)}
        </p>
        <p
          className="truncate leading-tight text-fg-muted"
          style={{ fontSize: `${S.nowMeta}px` }}
        >
          feels <span className="tnum">{formatTemp(now.apparentC)}</span>
        </p>
      </div>
    </div>
  );
}

/** The readings that do not fit beside the temperature. */
function MetricsRow({ weather }: { weather: Weather }) {
  const { now } = weather;
  const cells: Array<{ label: string; value: string }> = [
    { label: "Feels like", value: formatTemp(now.apparentC) },
    { label: "Wind", value: `${Math.round(now.windKph)} km/h` },
    { label: "Humidity", value: `${now.humidityPct}%` },
    { label: "Rain", value: `${now.precipitationMm.toFixed(1)} mm` },
  ];

  return (
    <ul className="grid shrink-0 grid-cols-4 gap-3">
      {cells.map((cell) => (
        <li
          key={cell.label}
          className="glass-subpanel flex min-w-0 flex-col gap-1.5 rounded-xl px-4 py-3"
        >
          <span className="truncate text-[19px] leading-none tracking-[0.08em] text-fg-muted uppercase">
            {cell.label}
          </span>
          <span className="tnum truncate text-[28px] leading-none font-semibold">
            {cell.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Next twelve hours. The rain-chance bars are deliberately a thin band along
 * the bottom: they are there to give the strip a rhythm you can read at a
 * glance, and the exact number is already printed under each one.
 */
function HourlyStrip({ hours }: { hours: WeatherHour[] }) {
  return (
    <ul className="flex min-h-0 min-w-0 flex-1 gap-1 border-t border-border/40 pt-3">
      {hours.map((hour) => (
        <li
          key={hour.time}
          className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-1"
        >
          <span
            className="tnum shrink-0 leading-none text-fg-muted"
            style={{ fontSize: `${S.hourLabel}px` }}
          >
            {formatHour(hour.time)}
          </span>
          <WeatherIcon
            code={hour.code}
            isDay={hour.isDay}
            size={S.hourIcon}
            className="shrink-0 text-fg-muted"
          />
          <span
            className="tnum shrink-0 leading-none font-medium"
            style={{ fontSize: `${S.hourTemp}px` }}
          >
            {formatTemp(hour.temperatureC)}
          </span>

          {/* Capped as well as flexed. Without the cap this track is simply
              whatever height is left over, which is how it came to dominate
              the tile in the first place. */}
          <div className="flex max-h-[44px] min-h-[14px] w-full flex-1 items-end justify-center border-b border-border/30">
            <div
              className="w-[62%] rounded-t-sm bg-accent"
              style={{
                // A floor keeps the baseline visible at 0%, so a dry hour
                // reads as "no rain" rather than as a rendering failure.
                height: `${Math.max(3, hour.precipitationProbabilityPct)}%`,
                opacity: hour.precipitationProbabilityPct >= 20 ? 0.9 : 0.35,
              }}
            />
          </div>

          <span
            className={`tnum shrink-0 leading-none ${
              hour.precipitationProbabilityPct >= 40
                ? "text-accent"
                : "text-fg-muted/60"
            }`}
            style={{ fontSize: `${S.hourPct}px` }}
          >
            {hour.precipitationProbabilityPct}%
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Seven days as range bars on one shared scale -- the part of a forecast a
 * column of numbers cannot show. Every bar is positioned against the week's
 * own low and high, so a cold snap or a warm run is a shape to be recognised
 * rather than seven pairs of digits to be compared.
 */
function DailyForecast({ days, nowC }: { days: WeatherDay[]; nowC: number }) {
  const weekMin = Math.min(...days.map((d) => d.minC), nowC);
  const weekMax = Math.max(...days.map((d) => d.maxC), nowC);
  // A perfectly flat week would otherwise divide by zero and collapse every
  // bar to a point.
  const span = weekMax - weekMin || 1;
  const pos = (c: number): number =>
    Math.min(100, Math.max(0, ((c - weekMin) / span) * 100));

  return (
    <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
      {days.map((day, i) => (
        <li
          key={day.date}
          className="flex min-h-0 min-w-0 flex-1 items-center gap-2"
        >
          <span
            className={`shrink-0 truncate leading-none ${
              i === 0 ? "font-semibold text-fg" : "text-fg-muted"
            }`}
            style={{
              fontSize: `${S.dayLabel}px`,
              width: `${S.dayLabelWidth}px`,
            }}
          >
            {i === 0 ? "Today" : formatWeekdayShort(day.date)}
          </span>

          <WeatherIcon
            code={day.code}
            isDay
            size={S.dayIcon}
            className="shrink-0 text-fg-muted"
          />

          <span
            className="tnum shrink-0 truncate leading-none text-accent"
            style={{ fontSize: `${S.dayPct}px`, width: `${S.dayPctWidth}px` }}
          >
            {day.precipitationProbabilityPct >= 20
              ? `${day.precipitationProbabilityPct}%`
              : ""}
          </span>

          <span
            className="tnum shrink-0 truncate text-right leading-none text-fg-muted"
            style={{ fontSize: `${S.dayTemp}px`, width: `${S.dayTempWidth}px` }}
          >
            {formatTemp(day.minC)}
          </span>

          <div
            className="relative min-w-0 flex-1 rounded-full bg-surface-2/70"
            style={{ height: `${S.dayBar}px` }}
          >
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${pos(day.minC)}%`,
                right: `${100 - pos(day.maxC)}%`,
                background: `linear-gradient(90deg, ${tempColor(day.minC)}, ${tempColor(day.maxC)})`,
              }}
            />
            {/* Where the temperature actually is right now, on today's bar. */}
            {i === 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-bg"
                style={{
                  left: `${pos(nowC)}%`,
                  width: `${S.dayMarker}px`,
                  height: `${S.dayMarker}px`,
                }}
              />
            )}
          </div>

          <span
            className="tnum shrink-0 truncate text-right leading-none font-semibold"
            style={{ fontSize: `${S.dayTemp}px`, width: `${S.dayTempWidth}px` }}
          >
            {formatTemp(day.maxC)}
          </span>
        </li>
      ))}
    </ul>
  );
}
