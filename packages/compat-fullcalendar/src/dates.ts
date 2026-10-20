import { Temporal, isValidZone } from '@dzcalendar/core';
import type { Problem, ZoneId } from '@dzcalendar/core';

/** A problem of the translation: where, and a short code. */
export const said = (code: Problem['code'], path: string, detail: string, severity: Problem['severity'] = 'warning'): Problem => ({ code, severity, path, detail }) satisfies Problem;

/** The calendar's zone from the other library's `timeZone`: an IANA name as is; 'local' the browser's; 'UTC'. */
export function zoneOf(given: unknown, problems: Problem[]): ZoneId | undefined {
  if (given === undefined) return undefined;
  if (given === 'local') {
    const here = Temporal.Now.timeZoneId();
    problems.push(said('zone-guessed', 'timeZone', `local:${here}`));
    return here;
  }
  if (typeof given === 'string' && (given === 'UTC' || isValidZone(given))) return given;
  problems.push(said('unknown-zone', 'timeZone', String(given), 'error'));
  return undefined;
}

/** "HH:mm[:ss]", an ISO duration, a duration object or milliseconds as minutes; null when it cannot be read. */
export function minutesOf(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x / 60000 : null;
  if (typeof x === 'string') {
    const m = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(x.trim());
    if (m) return Number(m[1]) * 60 + Number(m[2]) + Number(m[3] ?? 0) / 60;
    try {
      return Temporal.Duration.from(x.trim()).total({ unit: 'minutes' });
    } catch {
      return null;
    }
  }
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    const n = (k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : 0);
    const total = n('days') * 1440 + n('hours') * 60 + n('minutes') + n('seconds') / 60 + n('milliseconds') / 60000;
    return Number.isFinite(total) ? total : null;
  }
  return null;
}

/** Minutes as a Temporal duration-like ({ minutes }). */
export const duration = (minutes: number) => ({ minutes: Math.round(minutes) });

/** Sunday = 0 … Saturday = 6 (the other library) to Monday = 1 … Sunday = 7 (ISO); null for what is not a day. */
export const weekday = (d: unknown): 1 | 2 | 3 | 4 | 5 | 6 | 7 | null =>
  typeof d === 'number' && Number.isInteger(d) ? (((((d % 7) + 7) % 7 || 7) as 1 | 2 | 3 | 4 | 5 | 6 | 7)) : null;
/** A list of the other library's weekdays as ISO ones (what is not a day left out). */
export const weekdays = (x: unknown): (1 | 2 | 3 | 4 | 5 | 6 | 7)[] | null => (Array.isArray(x) ? x.map(weekday).filter((d) => d !== null) : null);

/** The code an unreadable moment is said with, by where it was. */
const unreadable = (path: string): Problem['code'] => (/\]\.start$/.test(path) ? 'invalid-start' : /\]\.end$/.test(path) ? 'invalid-end' : /exdate/.test(path) ? 'invalid-exdate' : 'invalid-option');

/**
 * A moment as DzCalendar reads it: a `Date` or epoch milliseconds an instant
 * (in the calendar's zone); a string with an offset or `Z` the instant it
 * says; a date alone a date; a wall time without a zone read in the
 * calendar's zone — guessed, said. What cannot be read is said and null.
 * What it returns always parses.
 */
export function momentOf(x: unknown, zone: ZoneId, path: string, problems: Problem[]): string | null {
  if (x === undefined || x === null || x === '') return null;
  const bad = (detail: string) => (problems.push(said(unreadable(path), path, detail, 'error')), null);
  if (x instanceof Date || typeof x === 'number') {
    const ms = x instanceof Date ? x.getTime() : x;
    if (!Number.isFinite(ms)) return bad('invalid-date');
    try {
      return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone).toString();
    } catch {
      return bad('out-of-range');
    }
  }
  if (typeof x !== 'string') return bad(typeof x);
  const s = x.trim();
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Temporal.PlainDate.from(s, { overflow: 'reject' }).toString();
    if (/\[.+\]$/.test(s)) return Temporal.ZonedDateTime.from(s).toString();
    if (/\d(Z|[+-]\d{2}(:?\d{2})?)$/i.test(s)) return Temporal.Instant.from(s).toZonedDateTimeISO(zone).toString();
    // A wall time without a zone: the calendar's, said.
    const wall = Temporal.PlainDateTime.from(s, { overflow: 'reject' });
    problems.push(said('zone-guessed', path, zone));
    return `${wall.toString()}[${zone}]`;
  } catch {
    return bad('unreadable');
  }
}

/** A date (the first ten characters of what `momentOf` gave, which always parse). */
export const dateOf10 = (m: string) => Temporal.PlainDate.from(m.slice(0, 10));
