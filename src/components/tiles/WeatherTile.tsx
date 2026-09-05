import type {
  BoardMode,
  Source,
  Weather,
  WeatherDay,
  WeatherHour,
} from "../../../shared/types.ts";
import {
  formatHour,
  formatTemp,
  formatWeekdayShort,
} from "../../lib/format.ts";
import { tempColor } from "../../lib/tempScale.ts";
import { describeCode } from "../../lib/weatherCodes.ts";
import { Tile } from "../Tile.tsx";
import { WeatherIcon } from "../WeatherIcon.tsx";

/* ---------------------------------------------------------------------------
   The weather tile lives in two very different boxes. Ambient gives it
   1165x634 of content; morning -- where the commute tile takes the top band --
   gives it 1165x244, barely over a third of the height at the same width.

   Rather than reflowing into two unrelated layouts, both modes run the same
   three-part structure, read left to right: what it is doing now, what it will
   do over the next twelve hours, and what the week looks like. Only the
   metrics grid is dropped in the short box, and every size comes from one
   table below so the vertical budget can be checked by reading it.

   Everything that could grow is a flex child with min-h-0/min-w-0, and every
   list row is flex-1, so rows divide whatever height the box has instead of
   summing past it. Fixed-height stacks in a box too short to hold them are
   exactly what was overlapping before.
--------------------------------------------------------------------------- */

interface Scale {
  /** Current conditions. */
  nowIcon: number;
  nowTemp: number;
  nowCondition: number;
  nowMeta: number;
  /** Hourly strip. */
  hourLabel: number;
  hourIcon: number;
  hourTemp: number;
  hourPct: number;
  /** Seven-day list. */
  dayLabel: number;
  dayLabelWidth: number;
  dayIcon: number;
  dayPct: number;
  dayPctWidth: number;
  dayTemp: number;
  dayTempWidth: number;
  dayBar: number;
  dayMarker: number;
}

const SCALE: Record<"full" | "compact", Scale> = {
  // Ambient: six grid rows. Room for the metrics grid and tall rain bars.
  full: {
    nowIcon: 122,
    nowTemp: 138,
    nowCondition: 36,
    nowMeta: 28,
    hourLabel: 24,
    hourIcon: 40,
    hourTemp: 28,
    hourPct: 20,
    dayLabel: 30,
    dayLabelWidth: 84,
    dayIcon: 42,
    dayPct: 24,
    dayPctWidth: 54,
    dayTemp: 30,
    dayTempWidth: 54,
    dayBar: 12,
    dayMarker: 14,
  },
  // Morning: three grid rows, so ~244px for all of it. Sized to leave the
  // rain-chance track a positive height rather than borrowing from the row
  // below it.
  compact: {
    nowIcon: 64,
    nowTemp: 76,
    nowCondition: 24,
    nowMeta: 20,
    hourLabel: 18,
    hourIcon: 28,
    hourTemp: 22,
    hourPct: 17,
    dayLabel: 20,
    dayLabelWidth: 62,
    dayIcon: 22,
    dayPct: 17,
    dayPctWidth: 46,
    dayTemp: 20,
    dayTempWidth: 38,
    dayBar: 8,
    dayMarker: 10,
  },
};

interface Props {
  source: Source<Weather> | null;
  now: number;
  mode: BoardMode;
}

export function WeatherTile({ source, now, mode }: Props) {
  const compact = mode === "morning";
  const s = SCALE[compact ? "compact" : "full"];
  const label = source?.data?.label;

  return (
    <Tile
      area="area-weather"
      label="Weather"
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
          <div className="flex min-h-0 min-w-0 flex-[1.35] flex-col gap-4">
            <CurrentConditions weather={weather} s={s} compact={compact} />
            {!compact && <MetricsGrid weather={weather} />}
            <HourlyStrip hours={weather.hourly} s={s} />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border/40 pl-6">
            <DailyForecast
              days={weather.daily.slice(0, 7)}
              nowC={weather.now.temperatureC}
              s={s}
            />
          </div>
        </div>
      )}
    </Tile>
  );
}

/* -------------------------------------------------------------------------- */

/** Icon, temperature and condition on one baseline, so the block stays only as
 *  tall as the number no matter how much text sits beside it. */
function CurrentConditions({
  weather,
  s,
  compact,
}: {
  weather: Weather;
  s: Scale;
  compact: boolean;
}) {
  const { now } = weather;

  return (
    <div className="flex shrink-0 items-center gap-5">
      <WeatherIcon
        code={now.code}
        isDay={now.isDay}
        size={s.nowIcon}
        className="shrink-0 text-fg"
      />
      <p
        className="tnum shrink-0 leading-none font-semibold"
        style={{ fontSize: `${s.nowTemp}px` }}
      >
        {formatTemp(now.temperatureC)}
      </p>
      <div className="flex min-w-0 flex-col gap-1">
        <p
          className="truncate leading-tight font-medium"
          style={{ fontSize: `${s.nowCondition}px` }}
        >
          {describeCode(now.code)}
        </p>
        <p
          className="truncate leading-tight text-fg-muted"
          style={{ fontSize: `${s.nowMeta}px` }}
        >
          feels <span className="tnum">{formatTemp(now.apparentC)}</span>
          {/* The morning box has no room for the metrics grid, so the same
              readings ride along here rather than being dropped. */}
          {compact && (
            <>
              {" · "}
              <span className="tnum">{Math.round(now.windKph)}</span> km/h
              {" · "}
              <span className="tnum">{now.humidityPct}</span>% humidity
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** Ambient only: the readings that do not fit beside the temperature. */
function MetricsGrid({ weather }: { weather: Weather }) {
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
          <span className="tnum truncate text-[30px] leading-none font-semibold">
            {cell.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Next twelve hours. The rain-chance bars sit in a flex-1 track, and that
 * track is what absorbs the difference between the two boxes: tall bars in
 * ambient, a thin band in the morning, and never a negative height in either.
 */
function HourlyStrip({ hours, s }: { hours: WeatherHour[]; s: Scale }) {
  return (
    <ul className="flex min-h-0 min-w-0 flex-1 gap-1 border-t border-border/40 pt-3">
      {hours.map((hour) => (
        <li
          key={hour.time}
          className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-1"
        >
          <span
            className="tnum shrink-0 leading-none text-fg-muted"
            style={{ fontSize: `${s.hourLabel}px` }}
          >
            {formatHour(hour.time)}
          </span>
          <WeatherIcon
            code={hour.code}
            isDay={hour.isDay}
            size={s.hourIcon}
            className="shrink-0 text-fg-muted"
          />
          <span
            className="tnum shrink-0 leading-none font-medium"
            style={{ fontSize: `${s.hourTemp}px` }}
          >
            {formatTemp(hour.temperatureC)}
          </span>

          <div className="flex min-h-0 w-full flex-1 items-end justify-center border-b border-border/30">
            <div
              className="w-[62%] rounded-t-sm bg-accent"
              style={{
                // A floor keeps the baseline visible at 0%, so a dry hour
                // reads as "no rain" rather than as a rendering failure.
                height: `${Math.max(2, hour.precipitationProbabilityPct)}%`,
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
            style={{ fontSize: `${s.hourPct}px` }}
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
 * rather than six pairs of digits to be compared.
 */
function DailyForecast({
  days,
  nowC,
  s,
}: {
  days: WeatherDay[];
  nowC: number;
  s: Scale;
}) {
  const weekMin = Math.min(...days.map((d) => d.minC), nowC);
  const weekMax = Math.max(...days.map((d) => d.maxC), nowC);
  // A perfectly flat week would otherwise divide by zero and collapse
  // every bar to a point.
  const span = weekMax - weekMin || 1;
  const pos = (c: number): number =>
    Math.min(100, Math.max(0, ((c - weekMin) / span) * 100));

  return (
    <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
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
              fontSize: `${s.dayLabel}px`,
              width: `${s.dayLabelWidth}px`,
            }}
          >
            {i === 0 ? "Today" : formatWeekdayShort(day.date)}
          </span>

          <WeatherIcon
            code={day.code}
            isDay
            size={s.dayIcon}
            className="shrink-0 text-fg-muted"
          />

          <span
            className="tnum shrink-0 truncate leading-none text-accent"
            style={{ fontSize: `${s.dayPct}px`, width: `${s.dayPctWidth}px` }}
          >
            {day.precipitationProbabilityPct >= 20
              ? `${day.precipitationProbabilityPct}%`
              : ""}
          </span>

          <span
            className="tnum shrink-0 truncate text-right leading-none text-fg-muted"
            style={{ fontSize: `${s.dayTemp}px`, width: `${s.dayTempWidth}px` }}
          >
            {formatTemp(day.minC)}
          </span>

          <div
            className="relative min-w-0 flex-1 rounded-full bg-surface-2/70"
            style={{ height: `${s.dayBar}px` }}
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
                  width: `${s.dayMarker}px`,
                  height: `${s.dayMarker}px`,
                }}
              />
            )}
          </div>

          <span
            className="tnum shrink-0 truncate text-right leading-none font-semibold"
            style={{ fontSize: `${s.dayTemp}px`, width: `${s.dayTempWidth}px` }}
          >
            {formatTemp(day.maxC)}
          </span>
        </li>
      ))}
    </ul>
  );
}
