import { Temporal } from '@dzcalendar/core';
import type { PlainDate, RRule, RRuleWeekday as Weekday, ZoneId } from '@dzcalendar/core';

/** How often, in the editor's words. */
export type RepeatFreq = 'none' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export type RepeatEnd = { readonly kind: 'never' } | { readonly kind: 'until'; readonly date: PlainDate } | { readonly kind: 'count'; readonly count: number };

/**
 * A recurrence as the editor shows it (owner's decision: the usual ones).
 * A rule beyond it is `custom`: shown as written and kept unless the person
 * picks another one.
 */
export type RepeatForm =
  | {
      readonly freq: RepeatFreq;
      /** Every N days, weeks, months, years. */
      readonly interval: number;
      /** Weekly: the weekdays (ISO, Monday 1). */
      readonly weekdays: readonly Weekday[];
      /** Monthly: the start's day of the month ("on the 21st"), its n-th weekday ("the 3rd Wednesday"), or the last such weekday. */
      readonly monthly: 'day' | 'nth' | 'last';
      readonly end: RepeatEnd;
    }
  | { readonly freq: 'custom'; readonly text: string };

/**
 * Where a date stands among its weekday's days in the month: the n-th (1 to
 * 5) and whether it is the last. "The 4th Wednesday" and "the last
 * Wednesday" are the same day in some months only: both are offered when
 * both are true, and each keeps its meaning.
 */
export function nthOf(date: PlainDate): { readonly n: number; readonly last: boolean; readonly weekday: Weekday } {
  return { n: Math.ceil(date.day / 7), last: date.day + 7 > date.daysInMonth, weekday: date.dayOfWeek as Weekday };
}

const NONE = { freq: 'none', interval: 1, weekdays: [] as Weekday[], monthly: 'day', end: { kind: 'never' } } as const;

/** The form for a series' rules (none: a single event), read against its first start. */
export function readRepeat(rules: readonly RRule[] | null, start: PlainDate, zone: ZoneId, text: string): RepeatForm {
  if (!rules || rules.length === 0) return { ...NONE, weekdays: [start.dayOfWeek as Weekday] };
  const custom: RepeatForm = { freq: 'custom', text };
  if (rules.length > 1) return custom;
  const r = rules[0]!;
  const extra = r.bySecond ?? r.byMinute ?? r.byHour ?? r.byYearDay ?? r.byWeekNo ?? r.bySetPos;
  if (extra || (r.freq !== 'DAILY' && r.freq !== 'WEEKLY' && r.freq !== 'MONTHLY' && r.freq !== 'YEARLY')) return custom;
  const end: RepeatEnd =
    r.count !== undefined
      ? { kind: 'count', count: r.count }
      : r.until !== undefined
        ? { kind: 'until', date: r.until instanceof Temporal.PlainDate ? r.until : r.until.toZonedDateTimeISO(zone).toPlainDate() }
        : { kind: 'never' };
  const base = { freq: r.freq, interval: r.interval, weekdays: [start.dayOfWeek as Weekday], monthly: 'day' as const, end };
  const only = (xs: readonly number[] | undefined, v: number) => xs === undefined || (xs.length === 1 && xs[0] === v);
  switch (r.freq) {
    case 'DAILY':
      return r.byDay || r.byMonthDay || r.byMonth ? custom : base;
    case 'WEEKLY': {
      if (r.byMonthDay || r.byMonth || r.byDay?.some((d) => d.n !== undefined)) return custom;
      const days = r.byDay ? [...new Set(r.byDay.map((d) => d.weekday))].sort() : [start.dayOfWeek as Weekday];
      return { ...base, weekdays: days };
    }
    case 'MONTHLY': {
      if (r.byMonth) return custom;
      if (r.byDay) {
        const nth = nthOf(start);
        const d = r.byDay[0]!;
        if (r.byMonthDay || r.byDay.length !== 1 || d.weekday !== nth.weekday) return custom;
        if (d.n === -1 && nth.last) return { ...base, monthly: 'last' };
        return d.n === nth.n && nth.n <= 4 ? { ...base, monthly: 'nth' } : custom;
      }
      return only(r.byMonthDay, start.day) ? base : custom;
    }
    case 'YEARLY':
      return !r.byDay && only(r.byMonth, start.month) && only(r.byMonthDay, start.day) ? base : custom;
  }
  return custom;
}

const DAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const basic = (d: PlainDate) => `${pad(d.year, 4)}${pad(d.month)}${pad(d.day)}`;

/**
 * The rule a form stands for, or null for "does not repeat". A `custom` form
 * gives back its rule as it was. UNTIL is the end's whole day, inclusive: a
 * date for an all-day series, the last instant of that day in the event's
 * zone (in UTC, as RFC 5545 asks) otherwise. WKST is left to the calendar.
 */
export function writeRepeat(form: RepeatForm, start: PlainDate, o: { readonly allDay: boolean; readonly zone: ZoneId }): string | null {
  if (form.freq === 'custom') return form.text;
  if (form.freq === 'none') return null;
  const parts = [`FREQ=${form.freq}`];
  const interval = Number.isInteger(form.interval) && form.interval >= 1 ? form.interval : 1;
  if (interval !== 1) parts.push(`INTERVAL=${interval}`);
  if (form.freq === 'WEEKLY') {
    const days = form.weekdays.length > 0 ? [...new Set(form.weekdays)].sort() : [start.dayOfWeek as Weekday];
    parts.push(`BYDAY=${days.map((d) => DAY[d - 1]).join(',')}`);
  }
  if (form.freq === 'MONTHLY' && form.monthly !== 'day') {
    const nth = nthOf(start);
    // A fifth weekday exists in some months only: it is "the last" one.
    const n = form.monthly === 'last' || nth.n > 4 ? -1 : nth.n;
    parts.push(`BYDAY=${n}${DAY[nth.weekday - 1]}`);
  }
  if (form.end.kind === 'count') parts.push(`COUNT=${Math.max(1, Math.floor(form.end.count))}`);
  if (form.end.kind === 'until') {
    if (o.allDay) parts.push(`UNTIL=${basic(form.end.date)}`);
    else {
      const last = form.end.date.add({ days: 1 }).toZonedDateTime({ timeZone: o.zone }).toInstant().subtract({ seconds: 1 });
      const u = last.toZonedDateTimeISO('UTC');
      parts.push(`UNTIL=${basic(u.toPlainDate())}T${pad(u.hour)}${pad(u.minute)}${pad(u.second)}Z`);
    }
  }
  return parts.join(';');
}
