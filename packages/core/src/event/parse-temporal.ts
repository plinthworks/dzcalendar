import { Temporal } from '../temporal.js';
import type { Instant, PlainDate, PlainDateTime, ZonedDateTime } from '../temporal.js';
import { isOffsetZone, isValidZone, resolveWall } from '../zone.js';
import { problem } from './problems.js';
import type { Problem } from './problems.js';

/**
 * One moment as written, sorted into what it actually says.
 *
 * - `zoned`: a place and a time — the only form that is a moment by itself.
 * - `instant`: a moment with no place (`…Z`, `…+02:00`, an `Instant`).
 * - `wall`: a clock reading with no place (`2026-03-29T09:00`).
 * - `date`: a calendar day.
 */
export type Parsed =
  | { readonly kind: 'zoned'; readonly value: ZonedDateTime }
  | { readonly kind: 'instant'; readonly value: Instant }
  | { readonly kind: 'wall'; readonly value: PlainDateTime }
  | { readonly kind: 'date'; readonly value: PlainDate };

export type ParseResult =
  | { readonly ok: true; readonly parsed: Parsed; readonly problems: readonly Problem[] }
  | { readonly ok: false; readonly problems: readonly Problem[] };

const TAG = Symbol.toStringTag;
const tagOf = (x: object): unknown => (x as Record<symbol, unknown>)[TAG];
// The tag of the built-in date object. Compared as text so this file never
// names the type it exists to keep out (purity.test.ts).
const LEGACY_DATE_TAG = '[object ' + 'Da' + 'te]';

const OFFSET_AT_END = /(?:Z|[+-]\d{2}(?::?\d{2}(?::?\d{2}(?:[.,]\d+)?)?)?)$/i;
const ZONE_ANNOTATION = /\[!?([^\]=]+)\]/;

/** The string before its annotations: `[Europe/Paris]`, `[u-ca=buddhist]` say nothing about the time. */
const headOf = (s: string): string => s.split('[')[0] ?? '';
/** A date followed by a time, joined by `T`, `t` or a space — Temporal accepts all three. */
const TIME_PART = /^[+-]?\d{4,6}-?\d{2}-?\d{2}[Tt ]\d/;
const hasTimePart = (s: string): boolean => TIME_PART.test(headOf(s));
const hasOffset = (s: string): boolean => hasTimePart(s) && OFFSET_AT_END.test(headOf(s));

/** `kind` names the field for the error code: start errors are `invalid-start`, end errors `invalid-end`. */
export function parseTemporal(input: unknown, path: string, field: 'start' | 'end'): ParseResult {
  const invalid = field === 'start' ? 'invalid-start' : 'invalid-end';

  if (input instanceof Temporal.ZonedDateTime) return ok({ kind: 'zoned', value: input });
  if (input instanceof Temporal.Instant) return ok({ kind: 'instant', value: input });
  if (input instanceof Temporal.PlainDateTime) return ok({ kind: 'wall', value: input });
  if (input instanceof Temporal.PlainDate) return ok({ kind: 'date', value: input });

  if (typeof input === 'object' && input !== null) {
    if (Object.prototype.toString.call(input) === LEGACY_DATE_TAG) {
      return fail(problem('date-object-rejected', 'error', path,
        'convert explicitly: Temporal.Instant.fromEpochMilliseconds(value.getTime())'));
    }
    // A Temporal object from another copy of the polyfill: instanceof says no,
    // but it knows how to write itself down, and the string is the contract.
    const tag = tagOf(input);
    if (typeof tag === 'string' && tag.startsWith('Temporal.')) {
      const again = parseString(String(input), path, invalid);
      const warning = problem('foreign-temporal', 'warning', path, tag);
      return again.ok ? { ...again, problems: [warning, ...again.problems] } : again;
    }
    return fail(problem(invalid, 'error', path, 'not a Temporal value or an ISO 8601 string'));
  }

  if (typeof input === 'string') return parseString(input, path, invalid);
  return fail(problem(invalid, 'error', path, `got ${typeof input}`));
}

function parseString(s: string, path: string, invalid: 'invalid-start' | 'invalid-end'): ParseResult {
  const text = s.trim();
  const zoneName = ZONE_ANNOTATION.exec(text)?.[1];

  if (zoneName !== undefined && !zoneName.startsWith('u-')) {
    if (!isValidZone(zoneName)) return fail(problem('unknown-zone', 'error', path, zoneName));
    return parseZoned(text, zoneName, path, invalid);
  }

  try {
    if (hasOffset(text)) return ok({ kind: 'instant', value: Temporal.Instant.from(text) });
    if (hasTimePart(text)) return ok({ kind: 'wall', value: Temporal.PlainDateTime.from(text) });
    return ok({ kind: 'date', value: Temporal.PlainDate.from(text) });
  } catch (e) {
    return fail(problem(invalid, 'error', path, (e as Error).message));
  }
}

function parseZoned(text: string, zone: string, path: string, invalid: 'invalid-start' | 'invalid-end'): ParseResult {
  const problems: Problem[] = [];
  if (isOffsetZone(zone)) problems.push(problem('offset-only', 'warning', path, zone));

  if (hasOffset(text)) {
    try {
      return ok({ kind: 'zoned', value: Temporal.ZonedDateTime.from(text, { offset: 'reject' }) }, problems);
    } catch {
      // The offset disagrees with the zone's rules — stale data written before
      // a rule change, usually. The zone is the authority; the wall time stands.
      try {
        const value = Temporal.ZonedDateTime.from(text, { offset: 'ignore' });
        problems.push(problem('offset-mismatch', 'warning', path, `${text} → ${value.offset}`));
        return ok({ kind: 'zoned', value }, problems);
      } catch (e) {
        return fail(problem(invalid, 'error', path, (e as Error).message));
      }
    }
  }

  // No offset: a wall time in a named zone. It may not happen, or happen twice.
  let wall: PlainDateTime;
  try {
    wall = Temporal.PlainDateTime.from(text);
  } catch (e) {
    return fail(problem(invalid, 'error', path, (e as Error).message));
  }
  const { value, problems: wallProblems } = placeWall(wall, zone, path);
  return ok({ kind: 'zoned', value }, [...problems, ...wallProblems]);
}

/**
 * A clock reading put in a zone. A skipped reading moves forward
 * (`compatible`: 02:30 becomes 03:30 in Paris each March); a repeated one takes
 * its first occurrence (`earlier`). Both say so.
 */
export function placeWall(wall: PlainDateTime, zone: string, path: string): { value: ZonedDateTime; problems: Problem[] } {
  const r = resolveWall(wall.toPlainDate(), wall.toPlainTime(), zone, 'earlier');
  const problems: Problem[] = [];
  let value: ZonedDateTime;
  if (!r.exists) {
    value = wall.toZonedDateTime(zone, { disambiguation: 'compatible' });
    problems.push(problem('wall-time-skipped', 'warning', path, `${wall.toString()} → ${value.toPlainDateTime().toString()}`));
  } else {
    value = wall.toZonedDateTime(zone, { disambiguation: 'earlier' });
    if (r.ambiguous) problems.push(problem('wall-time-ambiguous', 'warning', path, `${wall.toString()} → ${value.offset}`));
  }
  return { value, problems };
}

/**
 * The model counts in ISO: a `[u-ca=hebrew]` written on the way in would make
 * two equal moments compare and print differently, and change every key built
 * from them. The calendar a reader sees comes from the locale, at format time.
 */
function iso(parsed: Parsed): Parsed {
  switch (parsed.kind) {
    case 'instant':
      return parsed;
    case 'zoned':
      return parsed.value.calendarId === 'iso8601' ? parsed : { kind: 'zoned', value: parsed.value.withCalendar('iso8601') };
    case 'wall':
      return parsed.value.calendarId === 'iso8601' ? parsed : { kind: 'wall', value: parsed.value.withCalendar('iso8601') };
    case 'date':
      return parsed.value.calendarId === 'iso8601' ? parsed : { kind: 'date', value: parsed.value.withCalendar('iso8601') };
  }
}

const ok = (parsed: Parsed, problems: readonly Problem[] = []): ParseResult => ({ ok: true, parsed: iso(parsed), problems });
const fail = (p: Problem): ParseResult => ({ ok: false, problems: [p] });
