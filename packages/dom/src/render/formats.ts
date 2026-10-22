import { formatTemporal } from '@dzcalendar/core';
import type { CalEvent, PlainDate, PlainDateTime, PlainTime, TitleFormat, ZonedDateTime } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';

/** How a place is written: the platform's date-format options, or a function returning the text (docs/behaviors/formats.md). */
export type FormatSpec<A> = Intl.DateTimeFormatOptions | ((arg: A) => string);

interface Base {
  readonly locale: string;
}
export interface DateFormatArg extends Base {
  readonly date: PlainDate;
  readonly view: string;
}
export interface TimeFormatArg extends Base {
  readonly time: PlainTime;
  readonly view: string;
}
export interface EventTimeFormatArg extends Base {
  /** The wall time in the calendar's zone. */
  readonly time: PlainDateTime;
  readonly event: CalEvent;
}
export interface EventTimeRangeFormatArg extends Base {
  readonly start: ZonedDateTime;
  readonly end: ZonedDateTime;
  /** Each end as `eventTime` writes it (with a repeated hour's mark). */
  readonly startText: string;
  readonly endText: string;
  readonly event: CalEvent;
}
export interface MonthFormatArg extends Base {
  /** The month's first day. */
  readonly month: PlainDate;
}
export interface WeekFormatArg extends Base {
  readonly week: number;
  /** The week's first day shown. */
  readonly date: PlainDate;
}

/** How the calendar writes each place; a place not given is written as by default. */
export interface Formats {
  /** The header's title: written by the kernel (`TitleFormat`). */
  readonly title?: TitleFormat;
  readonly dayHeader?: FormatSpec<DateFormatArg>;
  readonly dayCell?: FormatSpec<DateFormatArg>;
  readonly slotLabel?: FormatSpec<TimeFormatArg>;
  readonly eventTime?: FormatSpec<EventTimeFormatArg>;
  readonly eventTimeRange?: FormatSpec<EventTimeRangeFormatArg>;
  readonly listDay?: FormatSpec<DateFormatArg>;
  readonly listDaySide?: FormatSpec<DateFormatArg>;
  readonly monthHeader?: FormatSpec<MonthFormatArg>;
  readonly morePopover?: FormatSpec<DateFormatArg>;
  /** A function only: the platform has no week field. */
  readonly weekNumber?: (arg: WeekFormatArg) => string;
}

type Value = PlainDate | PlainTime | PlainDateTime | ZonedDateTime;

/**
 * A place written as the application asked: its options on `value`, its
 * function on `arg` (one that throws or returns no text: reported, the
 * default kept), else `fallback()`.
 */
export function written<A>(ctx: ViewCtx, spec: FormatSpec<A> | undefined, value: Value, arg: () => A, fallback: () => string): string {
  if (spec === undefined || spec === null || (typeof spec !== 'function' && typeof spec !== 'object')) return fallback();
  if (BROKEN.has(spec)) return fallback();
  try {
    const out = typeof spec === 'function' ? spec(arg()) : formatTemporal(value, spec, ctx.locale);
    if (typeof out === 'string') return out;
    throw new TypeError('dzcalendar: a format function returned no text');
  } catch (err) {
    // Said once for that format (options the platform refuses, a function that throws): not at every cell of every drawing.
    BROKEN.add(spec);
    void Promise.reject(err);
    return fallback();
  }
}

/** Formats that failed once: written as by default from then on, without saying it again. */
const BROKEN = new WeakSet<object>();

/** Two sets of formats alike: the same functions, the same options (a new object rebuilt with the same contents redraws nothing). */
export function sameFormats(a: Formats | undefined, b: Formats | undefined): boolean {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]) as Set<keyof Formats>;
  for (const k of keys) {
    const x = a?.[k];
    const y = b?.[k];
    if (x === y) continue;
    if (typeof x === 'function' || typeof y === 'function' || JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}

/** A week's number as the application writes it (`formats.weekNumber`), else the calendar's words ("S43"). */
export const weekWords = (ctx: ViewCtx, week: number, date: PlainDate): string =>
  written(ctx, typeof ctx.formats.weekNumber === 'function' ? ctx.formats.weekNumber : undefined, date, () => ({ week, date, locale: ctx.locale }), () => ctx.messages.weekShort({ week }));
