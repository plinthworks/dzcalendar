import { firstDayFor } from '@tzslot/core';
import { Temporal } from '../temporal.js';
import type { PlainDate, Weekday } from '../temporal.js';

export interface WeekRules {
  readonly firstDay: Weekday;
  /** Days of the new year a week needs to be its week 1: 4 under ISO, 1 in the US. */
  readonly minimalDays: number;
}

interface WeekInfo {
  readonly firstDay?: number;
  readonly minimalDays?: number;
}

/**
 * The locale's week rules, from `Intl.Locale` week info (method or getter,
 * as engines differ — the same fallback tzslot uses for the first day).
 * `minimalDays` falls back to CLDR's regional rule when the engine omits it.
 */
export function weekRulesFor(locale: string): WeekRules {
  let info: WeekInfo | undefined;
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };
    info = typeof l.getWeekInfo === 'function' ? l.getWeekInfo() : l.weekInfo;
  } catch {
    info = undefined;
  }
  return { firstDay: (info?.firstDay as Weekday | undefined) ?? firstDayFor(locale), minimalDays: info?.minimalDays ?? minimalDaysFor(locale) };
}

/**
 * Regions whose week 1 needs four days of the new year (CLDR `minDays` 4);
 * everywhere else, the week holding 1 January is week 1. Used only when the
 * engine's week info leaves `minimalDays` out — V8 does.
 */
const FOUR_DAY_REGIONS = new Set(
  'AD AN AT AX BE BG CH CZ DE DK EE ES FI FJ FO FR GB GF GG GI GP GR HU IE IM IS IT JE LI LT LU MC MQ NL NO PL PT RE RU SE SJ SK SM VA'.split(' '),
);

function minimalDaysFor(locale: string): number {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return region !== undefined && FOUR_DAY_REGIONS.has(region) ? 4 : 1;
  } catch {
    return 4;
  }
}

const startOfWeek = (d: PlainDate, firstDay: number) => d.subtract({ days: (d.dayOfWeek - firstDay + 7) % 7 });

/** The first day of week 1 of `year` under these rules. */
function week1Start(year: number, r: WeekRules): PlainDate {
  const jan1 = Temporal.PlainDate.from({ year, month: 1, day: 1 });
  const start = startOfWeek(jan1, r.firstDay);
  const daysInYear = 7 - jan1.since(start).days;
  return daysInYear >= r.minimalDays ? start : start.add({ days: 7 });
}

/**
 * The week number of a date under a locale's rules. ISO (Monday, 4 days) is
 * `PlainDate#weekOfYear`; this also covers the US (Sunday, 1 day) and every
 * other combination. A date before week 1 belongs to the previous year's
 * last week; one on or after next year's week 1 is week 1.
 */
export function weekNumber(date: PlainDate, r: WeekRules): number {
  const d = date.calendarId === 'iso8601' ? date : date.withCalendar('iso8601');
  const next = week1Start(d.year + 1, r);
  if (Temporal.PlainDate.compare(d, next) >= 0) return 1;
  let start = week1Start(d.year, r);
  if (Temporal.PlainDate.compare(d, start) < 0) start = week1Start(d.year - 1, r);
  return Math.floor(d.since(start).days / 7) + 1;
}
