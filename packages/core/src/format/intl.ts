import { Temporal } from '../temporal.js';
import type { PlainDate, PlainDateTime, PlainTime, PlainYearMonth, Weekday, ZonedDateTime } from '../temporal.js';

/**
 * Formatting without `Date` and without handing Temporal objects to Intl —
 * which the polyfill does not teach Intl to accept (Phase 0 spike 2). A
 * moment becomes epoch milliseconds plus the zone it is read in; a floating
 * date or time is read in UTC, where it cannot shift.
 */
export type Fmt = Intl.DateTimeFormatOptions;
export type Formattable = ZonedDateTime | PlainDate | PlainDateTime | PlainTime | PlainYearMonth;

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, f: Fmt, timeZone: string): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(f)}`;
  let dtf = cache.get(key);
  if (!dtf) {
    if (cache.size > 500) cache.clear();
    dtf = new Intl.DateTimeFormat(locale, { ...f, timeZone });
    cache.set(key, dtf);
  }
  return dtf;
}

// Made on first use, not at import: Temporal may still be loading (18i, `loadTemporal()`).
let _midnight: ReturnType<typeof Temporal.PlainTime.from> | undefined;
const MIDNIGHT = () => (_midnight ??= Temporal.PlainTime.from('00:00'));
// Made on first use, not at import: Temporal may still be loading (18i, `loadTemporal()`).
let _epoch_date: ReturnType<typeof Temporal.PlainDate.from> | undefined;
const EPOCH_DATE = () => (_epoch_date ??= Temporal.PlainDate.from('1970-01-01'));

/** The epoch milliseconds and zone that make Intl print `v` as written. */
function asEpoch(v: Formattable): { ms: number; zone: string } {
  if (v instanceof Temporal.ZonedDateTime) return { ms: v.epochMilliseconds, zone: v.timeZoneId };
  if (v instanceof Temporal.PlainDate) return { ms: v.toZonedDateTime({ timeZone: 'UTC' }).epochMilliseconds, zone: 'UTC' };
  if (v instanceof Temporal.PlainDateTime) return { ms: v.toZonedDateTime('UTC').epochMilliseconds, zone: 'UTC' };
  if (v instanceof Temporal.PlainTime) return { ms: EPOCH_DATE().toPlainDateTime(v).toZonedDateTime('UTC').epochMilliseconds, zone: 'UTC' };
  return { ms: v.toPlainDate({ day: 1 }).toPlainDateTime(MIDNIGHT()).toZonedDateTime('UTC').epochMilliseconds, zone: 'UTC' };
}

export function formatTemporal(v: Formattable, f: Fmt, locale: string): string {
  const { ms, zone } = asEpoch(v);
  return formatter(locale, f, zone).format(ms);
}

export function formatToPartsTemporal(v: Formattable, f: Fmt, locale: string): Intl.DateTimeFormatPart[] {
  const { ms, zone } = asEpoch(v);
  return formatter(locale, f, zone).formatToParts(ms);
}

/**
 * "15–21 mars 2026", "Mar 30 – Apr 5, 2026", "15.–21. März 2026": Intl's own
 * range formatting, given epoch milliseconds — it takes numbers, so no `Date`
 * is needed. Both ends are read in the first one's zone. An engine without
 * `formatRange` gets the two ends joined by `separator`.
 *
 * For titles (dates), not for an event's hours across a clock change: Intl
 * names one zone offset for the whole range, so 01:30 (+02:00) to 02:30
 * (+01:00) prints as "01:30 – 02:30 UTC+1". Format each end on its own there.
 */
export function formatRangeTitle(a: Formattable, b: Formattable, f: Fmt, locale: string, o: { readonly separator?: string } = {}): string {
  // Ends given the wrong way round still make a readable title.
  let ea = asEpoch(a);
  let eb = asEpoch(b);
  if (eb.ms < ea.ms) [ea, eb] = [eb, ea];
  const dtf = formatter(locale, f, ea.zone) as Intl.DateTimeFormat & { formatRange?: (x: number, y: number) => string };
  if (typeof dtf.formatRange === 'function') return dtf.formatRange(ea.ms, eb.ms);
  const left = dtf.format(ea.ms);
  const right = formatter(locale, f, ea.zone).format(eb.ms);
  return left === right ? left : `${left}${o.separator ?? ' – '}${right}`;
}

/** Monday 1 January 2024: a known Monday, in UTC. */
// Made on first use, not at import: Temporal may still be loading (18i, `loadTemporal()`).
let _monday: ReturnType<typeof Temporal.PlainDate.from> | undefined;
const MONDAY = () => (_monday ??= Temporal.PlainDate.from('2024-01-01'));

export function weekdayNames(locale: string, width: 'narrow' | 'short' | 'long', firstDay: Weekday): string[] {
  return Array.from({ length: 7 }, (_, i) => formatTemporal(MONDAY().add({ days: (firstDay - 1 + i) % 7 }), { weekday: width }, locale));
}

export function monthNames(locale: string, width: 'short' | 'long'): string[] {
  return Array.from({ length: 12 }, (_, i) => formatTemporal(MONDAY().with({ month: i + 1, day: 1 }), { month: width }, locale));
}
