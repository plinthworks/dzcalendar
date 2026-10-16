import { resolveWallTime } from '@tzslot/core';
import { Temporal } from './temporal.js';
import type { Instant, PlainDate, PlainDateTime, PlainTime, ZoneId } from './temporal.js';

/**
 * Facts about a time zone on a given day. Pure time, no calendar semantics —
 * which is why these are candidates for @tzslot/core 2.2 (ARCHITECTURE.md, 0).
 * They live here first, with their final signatures, so DzCalendar does not
 * wait on a tzslot release.
 */

/**
 * 24 h, 23 h, 25 h, a day that does not exist (Apia, 30 December 2011), or
 * anything else (Lord Howe's 23 h 30, a local-mean-time change in 1911).
 * Whether a day *carries* a change is `transitions.length`, not `kind`.
 */
export type DayKind = 'normal' | 'short' | 'long' | 'skipped' | 'irregular';

export interface Transition {
  readonly at: Instant;
  readonly offsetBefore: string;
  readonly offsetAfter: string;
  /**
   * +60 when clocks spring forward, -60 when they fall back, +30 on Lord Howe,
   * +1440 in Apia 2011. Fractional for historical offsets with seconds:
   * Paris left mean time (+00:09:21) for +00:00 in 1911, a change of -9.35.
   */
  readonly deltaMinutes: number;
  /** The clock face just before the change, read with the old offset: 02:00 in Paris each March. */
  readonly wallBefore: PlainDateTime;
  /** The clock face at the change, read with the new offset: 03:00 in Paris each March. */
  readonly wallAfter: PlainDateTime;
  /** `gap`: wall times between the two never happen. `repeat`: they happen twice. */
  readonly kind: 'gap' | 'repeat';
}

export interface DayInfo {
  readonly date: PlainDate;
  readonly zone: ZoneId;
  /**
   * The first instant of the day. Not always midnight: São Paulo in 2018 and
   * Havana each March skip from 23:59:59 to 01:00, and the day starts there.
   */
  readonly start: Instant;
  /** The first instant of the next day — so `[start, end)`. */
  readonly end: Instant;
  /** Elapsed, not wall: 1380 on a spring-forward Sunday, 1500 on a fall-back one, 0 for a skipped day. Not rounded. */
  readonly lengthMinutes: number;
  readonly kind: DayKind;
  readonly transitions: readonly Transition[];
}

const startOf = (date: PlainDate, zone: ZoneId): Instant =>
  date.toZonedDateTime({ timeZone: zone }).toInstant();

const kindFor = (minutes: number): DayKind =>
  minutes === 1440
    ? 'normal'
    : minutes === 1380
      ? 'short'
      : minutes === 1500
        ? 'long'
        : minutes === 0
          ? 'skipped'
          : 'irregular';

/**
 * Every offset change in `[from, to)`, in order.
 *
 * Asks Temporal for the next transition rather than probing hour by hour: the
 * Phase 0 spike found `getTimeZoneTransition` in both temporal-polyfill/full
 * 1.0.5 and the native implementations, so no bisection fallback is needed.
 */
export function transitionsBetween(from: Instant, to: Instant, zone: ZoneId): Transition[] {
  const out: Transition[] = [];
  // One nanosecond back, so a transition exactly at `from` is found: Havana's
  // day starts *on* its transition.
  let cursor = from.subtract({ nanoseconds: 1 }).toZonedDateTimeISO(zone);
  for (;;) {
    const next = cursor.getTimeZoneTransition('next');
    if (!next) break;
    const at = next.toInstant();
    if (Temporal.Instant.compare(at, to) >= 0) break;
    const transition = describe(at, zone);
    if (transition) out.push(transition);
    cursor = next;
  }
  return out;
}

function describe(at: Instant, zone: ZoneId): Transition | null {
  const before = at.subtract({ nanoseconds: 1 }).toZonedDateTimeISO(zone);
  const after = at.toZonedDateTimeISO(zone);
  const deltaNs = after.offsetNanoseconds - before.offsetNanoseconds;
  if (deltaNs === 0) return null;
  return {
    at,
    offsetBefore: before.offset,
    offsetAfter: after.offset,
    deltaMinutes: deltaNs / 60e9,
    // Read through UTC plus the old offset rather than through a zone named by
    // that offset: "+00:09:21" is a valid offset but not a valid zone name.
    wallBefore: at.toZonedDateTimeISO('UTC').toPlainDateTime().add({ nanoseconds: before.offsetNanoseconds }),
    wallAfter: after.toPlainDateTime(),
    kind: deltaNs > 0 ? 'gap' : 'repeat',
  };
}

/**
 * A transition belongs to the one day whose `[start, end)` contains it. So the
 * day that *starts* on one owns it (São Paulo 2018, Havana), and a day of
 * length zero owns none: Apia's 30 December 2011 is `skipped`, and the jump
 * is carried by the 31st, which begins on it.
 */
function build(date: PlainDate, zone: ZoneId, start: Instant, end: Instant, transitions: readonly Transition[]): DayInfo {
  const lengthMinutes = (end.epochMilliseconds - start.epochMilliseconds) / 60000;
  return { date, zone, start, end, lengthMinutes, kind: kindFor(lengthMinutes), transitions };
}

export function dayInfo(date: PlainDate, zone: ZoneId): DayInfo {
  const start = startOf(date, zone);
  const end = startOf(date.add({ days: 1 }), zone);
  return build(date, zone, start, end, transitionsBetween(start, end, zone));
}

/**
 * `count` consecutive days. Each day's end is the next one's start, computed
 * once, and the zone is asked for its transitions once for the whole range —
 * not once a day, which in a zone without daylight saving means a long search
 * that ends in null, day after day.
 */
export function dayInfos(from: PlainDate, count: number, zone: ZoneId): DayInfo[] {
  if (count <= 0) return [];
  const bounds: Instant[] = [];
  let date = from;
  for (let i = 0; i <= count; i++) {
    bounds.push(startOf(date, zone));
    date = date.add({ days: 1 });
  }
  const all = transitionsBetween(bounds[0]!, bounds[count]!, zone);
  const out: DayInfo[] = [];
  let k = 0;
  date = from;
  for (let i = 0; i < count; i++) {
    const start = bounds[i]!;
    const end = bounds[i + 1]!;
    const mine: Transition[] = [];
    while (k < all.length && Temporal.Instant.compare(all[k]!.at, end) < 0) mine.push(all[k++]!);
    out.push(build(date, zone, start, end, mine));
    date = date.add({ days: 1 });
  }
  return out;
}

export type WallPolicy = 'compatible' | 'earlier' | 'later' | 'reject' | { readonly preferOffset: string };

export interface ResolvedWall {
  /** The instant chosen under the policy; null when the policy refuses. */
  readonly instant: Instant | null;
  readonly exists: boolean;
  readonly ambiguous: boolean;
  /** The reading not chosen, when the wall time happens twice. */
  readonly other: Instant | null;
  /**
   * With `preferOffset` on a repeated wall time: whether the offset named one
   * of the two readings. False means the first reading was taken by default.
   * Null for every other policy and every unambiguous time.
   */
  readonly offsetMatched: boolean | null;
}

const OFFSET = /^([+-])(\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,](\d{1,9}))?)?)?$/;

/** "+01:00", "+0100", "+01" all name the same offset; compared in nanoseconds, never as text. */
function offsetNanoseconds(offset: string): number | null {
  const m = OFFSET.exec(offset);
  if (!m) return null;
  const [, sign, h, min = '0', sec = '0', frac = ''] = m;
  const ns = ((Number(h) * 60 + Number(min)) * 60 + Number(sec)) * 1e9 + Number(frac.padEnd(9, '0') || 0);
  return sign === '-' ? -ns : ns;
}

/**
 * A wall time on a date, made into an instant under an explicit policy.
 *
 * tzslot's `resolveWallTime` says what the clock does (`exists`, `ambiguous`)
 * but returns no instant inside a gap. A calendar has to place an event there
 * anyway — a drop at 02:30 on a spring-forward Sunday — so the gap is pushed
 * forward (`compatible`, `later`) or back (`earlier`) the way Temporal does.
 */
export function resolveWall(date: PlainDate, time: PlainTime, zone: ZoneId, policy: WallPolicy): ResolvedWall {
  const r = resolveWallTime(date, time, zone);
  const [first, second] = r.instants;

  if (r.ambiguous && first && second) {
    let pick: 0 | 1 | null;
    let offsetMatched: boolean | null = null;
    if (typeof policy === 'object') {
      const wanted = offsetNanoseconds(policy.preferOffset);
      const secondNs = second.toZonedDateTimeISO(zone).offsetNanoseconds;
      const firstNs = first.toZonedDateTimeISO(zone).offsetNanoseconds;
      pick = wanted === secondNs ? 1 : 0;
      offsetMatched = wanted === secondNs || wanted === firstNs;
    } else {
      pick = policy === 'reject' ? null : policy === 'later' ? 1 : 0;
    }
    if (pick === null) return { instant: null, exists: true, ambiguous: true, other: null, offsetMatched };
    return {
      instant: pick === 0 ? first : second,
      exists: true,
      ambiguous: true,
      other: pick === 0 ? second : first,
      offsetMatched,
    };
  }

  if (r.exists && first) return { instant: first, exists: true, ambiguous: false, other: null, offsetMatched: null };

  if (policy === 'reject') return { instant: null, exists: false, ambiguous: false, other: null, offsetMatched: null };
  const disambiguation = policy === 'earlier' ? 'earlier' : 'compatible';
  const instant = date.toPlainDateTime(time).toZonedDateTime(zone, { disambiguation }).toInstant();
  return { instant, exists: false, ambiguous: false, other: null, offsetMatched: null };
}

const zoneCache = new Map<string, boolean>();

/** True for an identifier Temporal accepts as a time zone — IANA names, "UTC", and bare offsets. */
export function isValidZone(zone: string): boolean {
  let ok = zoneCache.get(zone);
  if (ok === undefined) {
    try {
      Temporal.PlainDate.from('2000-01-01').toZonedDateTime({ timeZone: zone });
      ok = true;
    } catch {
      ok = false;
    }
    zoneCache.set(zone, ok);
  }
  return ok;
}

/** "+02:00" is a valid Temporal zone but not a place: it has no daylight saving to follow. */
export const isOffsetZone = (zone: string): boolean => /^[+-]\d{2}(:?\d{2})?$/.test(zone);
