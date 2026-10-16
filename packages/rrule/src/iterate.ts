import { Temporal } from './temporal.js';
import type { ByDay, RRule, Weekday } from './types.js';

/*
 * The expansion of RFC 5545 §3.3.10, period by period. Days are handled as
 * day numbers (integers) while the BY* parts filter and expand them; Temporal
 * objects are built only for the occurrences that survive.
 *
 * Time semantics (ARCHITECTURE B.8):
 * - DAILY and slower are wall-clock: 09:00 stays 09:00 across a clock change.
 *   A wall time in a gap moves forward ("compatible"); in a repeated hour it
 *   takes the first reading.
 * - HOURLY, MINUTELY, SECONDLY step in elapsed time from DTSTART.
 */

// ── civil calendar on day numbers (days since 1970-01-01, ISO) ───────────────
function dayNumber(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}

function civil(n: number): { y: number; m: number; d: number } {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: era * 400 + yoe + (m <= 2 ? 1 : 0), m, d };
}

/** ISO weekday of a day number: 1970-01-01 was a Thursday. */
const weekdayOf = (n: number): Weekday => ((((n + 3) % 7) + 7) % 7) + 1 as Weekday;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
const startOfWeek = (n: number, wkst: Weekday) => n - ((weekdayOf(n) - wkst + 7) % 7);

/** RFC week 1: the first week (starting on WKST) with at least four days of the year — the one holding 4 January. */
const week1Start = (y: number, wkst: Weekday) => startOfWeek(dayNumber(y, 1, 4), wkst);

/** The (year, week number) a day belongs to, and how many weeks that year has. */
function weekOf(n: number, wkst: Weekday): { year: number; week: number; weeks: number } {
  let y = civil(n).y;
  if (n >= week1Start(y + 1, wkst)) y += 1;
  else if (n < week1Start(y, wkst)) y -= 1;
  const start = week1Start(y, wkst);
  return { year: y, week: Math.floor((n - start) / 7) + 1, weeks: (week1Start(y + 1, wkst) - start) / 7 };
}

// ── the BY* tests on one day ─────────────────────────────────────────────────
interface Defaults {
  readonly byMonth?: readonly number[];
  readonly byMonthDay?: readonly number[];
  readonly byDay?: readonly ByDay[];
}

/** RFC 5545: with no day part at all, the rule repeats DTSTART's month, day or weekday. */
function defaultsFor(r: RRule, start: number): Defaults {
  if (r.byWeekNo || r.byYearDay || r.byMonthDay || r.byDay) return {};
  const { m, d } = civil(start);
  switch (r.freq) {
    case 'YEARLY':
      return { byMonth: r.byMonth ?? [m], byMonthDay: [d] };
    case 'MONTHLY':
      return { byMonthDay: [d] };
    case 'WEEKLY':
      return { byDay: [{ weekday: weekdayOf(start) }] };
    default:
      return {};
  }
}

function dayMatches(n: number, r: RRule, def: Defaults, nthScope: 'month' | 'year' | null): boolean {
  const { y, m, d } = civil(n);
  const byMonth = r.byMonth ?? def.byMonth;
  if (byMonth && !byMonth.includes(m)) return false;
  if (r.byWeekNo) {
    const w = weekOf(n, r.wkst);
    if (!r.byWeekNo.some((x) => (x > 0 ? x : w.weeks + x + 1) === w.week)) return false;
  }
  if (r.byYearDay) {
    const yday = n - dayNumber(y, 1, 1) + 1;
    const len = isLeap(y) ? 366 : 365;
    if (!r.byYearDay.some((x) => (x > 0 ? x : len + x + 1) === yday)) return false;
  }
  const byMonthDay = r.byMonthDay ?? def.byMonthDay;
  if (byMonthDay) {
    const dim = daysInMonth(y, m);
    if (!byMonthDay.some((x) => (x > 0 ? x : dim + x + 1) === d)) return false;
  }
  const byDay = r.byDay ?? def.byDay;
  if (byDay) {
    const wd = weekdayOf(n);
    const ok = byDay.some((b) => {
      if (b.weekday !== wd) return false;
      if (b.n === undefined || nthScope === null) return true;
      // The n-th of its weekday within the month (or year), counted from either end.
      const first = nthScope === 'month' ? dayNumber(y, m, 1) : dayNumber(y, 1, 1);
      const len = nthScope === 'month' ? daysInMonth(y, m) : isLeap(y) ? 366 : 365;
      const idx = n - first;
      return b.n > 0 ? Math.floor(idx / 7) + 1 === b.n : -(Math.floor((len - 1 - idx) / 7) + 1) === b.n;
    });
    if (!ok) return false;
  }
  return true;
}

function setPos<T>(xs: readonly T[], pos: readonly number[] | undefined): T[] {
  if (!pos) return [...xs];
  const picked = new Set<number>();
  for (const p of pos) {
    const i = p > 0 ? p - 1 : xs.length + p;
    if (i >= 0 && i < xs.length) picked.add(i);
  }
  return [...picked].sort((a, b) => a - b).map((i) => xs[i]!);
}

const sorted = (xs: readonly number[]) => [...new Set(xs)].sort((a, b) => a - b);

/**
 * Empty periods in a row before a rule is declared barren (31 February).
 * The Gregorian calendar repeats every 400 years (146 097 days), so any date
 * pattern that can happen happens within one cycle: a 29 February rule may
 * wait eight years (2096 → 2104), never four hundred. Counted in periods.
 */
function maxEmpty(r: RRule): number {
  const perCycle = r.freq === 'YEARLY' ? 400 : r.freq === 'MONTHLY' ? 4800 : r.freq === 'WEEKLY' ? 20871 : 146097;
  return Math.ceil(perCycle / r.interval) + 1;
}

// ── the generators ───────────────────────────────────────────────────────────

/**
 * Every occurrence of an all-day rule from `start` (a date), in order.
 * Times in the rule are ignored; sub-daily frequencies make no sense here.
 */
/**
 * `fromDay` (a day number, see `_dayNumber`) is a hint: occurrences before
 * it are only counted, never built — COUNT stays exact, a window two years
 * after the start costs arithmetic, not objects.
 */
export function* iterateDates(start: Temporal.PlainDate, r: RRule, fromDay = -Infinity): Generator<Temporal.PlainDate> {
  const s = dayNumber(start.year, start.month, start.day);
  const def = defaultsFor(r, s);
  const barren = maxEmpty(r);
  const until = r.until === undefined ? null : r.until instanceof Temporal.PlainDate ? dayNumber(r.until.year, r.until.month, r.until.day) : null;
  const untilInstant = r.until instanceof Temporal.Instant ? r.until : null;
  let count = 0;
  let empty = 0;
  for (let k = 0; ; k++) {
    const days = periodDays(r, s, k);
    if (days === null) return;
    const scope = nthScopeOf(r);
    const kept = setPos(days.filter((n) => dayMatches(n, r, def, scope)), r.bySetPos);
    if (kept.length === 0 && ++empty > barren) return;
    if (kept.length > 0) empty = 0;
    for (const n of kept) {
      if (n < s) continue;
      if (until !== null && n > until) return;
      if (n < fromDay && (untilInstant === null || n < untilDayOf(untilInstant) - 2)) {
        if (r.count !== undefined && ++count >= r.count) return;
        continue;
      }
      const { y, m, d } = civil(n);
      const date = Temporal.PlainDate.from({ year: y, month: m, day: d });
      if (untilInstant && Temporal.Instant.compare(date.toZonedDateTime('UTC').toInstant(), untilInstant) > 0) return;
      yield date;
      if (r.count !== undefined && ++count >= r.count) return;
    }
  }
}

const nthScopeOf = (r: RRule): 'month' | 'year' | null =>
  r.freq === 'MONTHLY' ? 'month' : r.freq === 'YEARLY' ? (r.byMonth ? 'month' : 'year') : null;

/** The candidate days of period k (before the BY* tests), or null past Temporal's range. */
function periodDays(r: RRule, s: number, k: number): number[] | null {
  const { y, m } = civil(s);
  const step = k * r.interval;
  switch (r.freq) {
    case 'YEARLY': {
      const yy = y + step;
      if (yy > 275759) return null;
      const first = dayNumber(yy, 1, 1);
      const len = isLeap(yy) ? 366 : 365;
      return Array.from({ length: len }, (_, i) => first + i);
    }
    case 'MONTHLY': {
      const total = y * 12 + (m - 1) + step;
      const yy = Math.floor(total / 12);
      if (yy > 275759) return null;
      const mm = (total % 12) + 1;
      const first = dayNumber(yy, mm, 1);
      return Array.from({ length: daysInMonth(yy, mm) }, (_, i) => first + i);
    }
    case 'WEEKLY': {
      const first = startOfWeek(s, r.wkst) + 7 * step;
      if (first > 100_000_000) return null;
      return Array.from({ length: 7 }, (_, i) => first + i);
    }
    default: {
      const day = s + step;
      if (day > 100_000_000) return null;
      return [day];
    }
  }
}

/**
 * Every occurrence of a timed rule from `start`, in order, as zoned moments
 * in `start`'s zone.
 */
/**
 * `from` is a hint, as for `iterateDates`: what starts before it may be
 * skipped (counted, not built). Every occurrence at or after it is yielded.
 */
export function* iterateZoned(start: Temporal.ZonedDateTime, r: RRule, from?: Temporal.Instant, state?: IterationState): Generator<Temporal.ZonedDateTime> {
  if (r.freq === 'HOURLY' || r.freq === 'MINUTELY' || r.freq === 'SECONDLY') {
    yield* iterateSubDaily(start, r, from, state);
    return;
  }
  // Two days of margin either side: an offset moves a wall day by less than one.
  const fromDay = from === undefined ? -Infinity : untilDayOf(from) - 2;
  const lastSafe = r.until === undefined ? Infinity : r.until instanceof Temporal.PlainDate ? dayNumber(r.until.year, r.until.month, r.until.day) - 2 : untilDayOf(r.until) - 2;
  const zone = start.timeZoneId;
  const s = dayNumber(start.year, start.month, start.day);
  const def = defaultsFor(r, s);
  const hours = sorted(r.byHour ?? [start.hour]);
  const minutes = sorted(r.byMinute ?? [start.minute]);
  const seconds = sorted(r.bySecond ?? [start.second]);
  const scope = nthScopeOf(r);
  const barren = maxEmpty(r);
  const startNs = start.epochNanoseconds;
  let count = 0;
  let empty = 0;
  for (let k = 0; ; k++) {
    const days = periodDays(r, s, k);
    if (days === null) return;
    const matching = days.filter((n) => dayMatches(n, r, def, scope));
    // Every day × time of the period, then BYSETPOS over that whole set.
    const slots: [number, number, number, number][] = [];
    for (const n of matching) for (const h of hours) for (const mi of minutes) for (const se of seconds) slots.push([n, h, mi, se]);
    const kept = setPos(slots, r.bySetPos);
    if (kept.length === 0 && ++empty > barren) return;
    if (kept.length > 0) empty = 0;
    for (const [n, h, mi, se] of kept) {
      if (n < fromDay && n >= s + 2 && n < lastSafe) {
        if (r.count !== undefined && ++count >= r.count) return;
        continue;
      }
      const { y, m, d } = civil(n);
      // DTSTART is always the first occurrence as given — its second reading of a repeated hour included.
      const isStart = n === s && h === start.hour && mi === start.minute && se === start.second;
      // RFC: a time that does not exist moves forward; a repeated one takes its first reading.
      const zdt = isStart ? start : Temporal.PlainDateTime.from({ year: y, month: m, day: d, hour: h, minute: mi, second: Math.min(se, 59) }).toZonedDateTime(zone, {
        disambiguation: 'compatible',
      });
      if (zdt.epochNanoseconds < startNs) continue;
      if (beyondUntil(zdt, r)) return;
      yield zdt;
      if (r.count !== undefined && ++count >= r.count) return;
    }
  }
}

/** The UTC day number of an instant. */
const untilDayOf = (i: Temporal.Instant): number => Math.floor(i.epochMilliseconds / 86_400_000) + dayNumber(1970, 1, 1);

function beyondUntil(zdt: Temporal.ZonedDateTime, r: RRule): boolean {
  if (r.until === undefined) return false;
  if (r.until instanceof Temporal.PlainDate) return Temporal.PlainDate.compare(zdt.toPlainDate(), r.until) > 0;
  return Temporal.Instant.compare(zdt.toInstant(), r.until) > 0;
}

/** A sub-daily rule with no BY part yields exactly one occurrence per step. */
const plainSubDaily = (r: RRule): boolean =>
  !r.byHour && !r.byMinute && !r.bySecond && !r.byDay && !r.byMonth && !r.byMonthDay && !r.byYearDay && !r.bySetPos;

/** Steps one sub-daily generator may take before it gives up: a hard bound on any input. */
const MAX_STEPS = 2_000_000;

/** Filled in by an iterator that stopped on its step budget rather than at the rule's end. */
export interface IterationState {
  cut: boolean;
}

/** HOURLY and finer: periods advance in elapsed time; finer BY* parts expand within, coarser ones filter. */
function* iterateSubDaily(start: Temporal.ZonedDateTime, r: RRule, from?: Temporal.Instant, state?: IterationState): Generator<Temporal.ZonedDateTime> {
  const unit = r.freq === 'HOURLY' ? 'hours' : r.freq === 'MINUTELY' ? 'minutes' : 'seconds';
  // The day parts filter each step; BYWEEKNO is YEARLY-only and never reaches here.
  const { byWeekNo: _ignored, ...dayRule } = r;
  const zone = start.timeZoneId;
  const startNs = start.epochNanoseconds;
  const startMs = start.epochMilliseconds;
  const stepMs = (unit === 'hours' ? 3_600_000 : unit === 'minutes' ? 60_000 : 1000) * r.interval;
  const plain = plainSubDaily(r);
  // Steps are elapsed time, so the first step near `from` is arithmetic — and
  // with no BY part, so is the number of occurrences before it (COUNT stays exact).
  const k0 = from === undefined || (r.count !== undefined && !plain) ? 0 : Math.max(0, Math.floor((from.epochMilliseconds - startMs) / stepMs) - 1);
  let count = plain ? k0 : 0;
  if (r.count !== undefined && count >= r.count) return;
  let empty = 0;
  let steps = 0;
  for (let k = k0; ; k++) {
    if (++steps > MAX_STEPS) {
      if (state) state.cut = true;
      return;
    }
    let p: Temporal.ZonedDateTime;
    try {
      p = start.add({ [unit]: k * r.interval });
    } catch {
      return;
    }
    const n = dayNumber(p.year, p.month, p.day);
    if (!dayMatches(n, dayRule, {}, null)) {
      // Jump to the next day that can match, found in day arithmetic: a
      // barren rule (30 February) ends after one Gregorian cycle of days,
      // never after millions of steps.
      let m = n + 1;
      while (!dayMatches(m, dayRule, {}, null)) if (++m - n > 146_097) return;
      const { y, m: mo, d } = civil(m);
      const midnight = Temporal.PlainDate.from({ year: y, month: mo, day: d }).toZonedDateTime({ timeZone: zone }).epochMilliseconds;
      k = Math.max(k, Math.ceil((midnight - startMs) / stepMs) - 1);
      continue;
    }
    // An hour (or, finer, a minute) that cannot match: jump to the next one
    // that can, as for days — a rule at 09:00:00 every second costs a few
    // steps per day, not 86 400.
    const nextTime = skipTo(p, r);
    if (nextTime !== null) {
      const { y, m: mo, d } = civil(n);
      const target =
        nextTime.hour >= 24
          ? Temporal.PlainDate.from({ year: y, month: mo, day: d }).add({ days: 1 }).toZonedDateTime({ timeZone: zone }).epochMilliseconds
          : Temporal.PlainDateTime.from({ year: y, month: mo, day: d, hour: nextTime.hour, minute: nextTime.minute }).toZonedDateTime(zone, { disambiguation: 'earlier' }).epochMilliseconds;
      // Wall time rewinds at a fall-back: never jump across a transition, stop at it and look again.
      const transition = p.getTimeZoneTransition('next');
      const bound = transition !== null && transition.epochMilliseconds < target ? transition.epochMilliseconds : target;
      const next = Math.ceil((bound - startMs) / stepMs) - 1;
      if (next > k) {
        k = next;
        continue;
      }
    }
    // BYHOUR always limits here; BYMINUTE limits MINUTELY and SECONDLY (expands HOURLY);
    // BYSECOND limits SECONDLY (expands the others).
    const ok =
      (!r.byHour || r.byHour.includes(p.hour)) &&
      (r.freq === 'HOURLY' || !r.byMinute || r.byMinute.includes(p.minute)) &&
      (r.freq !== 'SECONDLY' || !r.bySecond || r.bySecond.includes(p.second));
    let cands: Temporal.ZonedDateTime[] = [];
    if (ok) {
      const minutes = r.freq === 'HOURLY' ? sorted(r.byMinute ?? [p.minute]) : [p.minute];
      const secs = r.freq === 'SECONDLY' ? [p.second] : sorted(r.bySecond ?? [p.second]);
      for (const mi of minutes) for (const se of secs) cands.push(p.with({ minute: mi, second: Math.min(se, 59) }, { offset: 'prefer' }));
      cands = setPos(cands, r.bySetPos);
    }
    // Within days that match, the time parts can still never meet (BYHOUR=9
    // with an interval that never lands on 9): cut after one year of steps.
    if (cands.length === 0 && ++empty > (unit === 'hours' ? 8784 : unit === 'minutes' ? 527040 : 31622400) / r.interval) return;
    if (cands.length > 0) empty = 0;
    for (const zdt of cands) {
      if (zdt.epochNanoseconds < startNs) continue;
      if (beyondUntil(zdt, r)) return;
      yield zdt;
      if (r.count !== undefined && ++count >= r.count) return;
    }
  }
}

/**
 * When `p`'s hour (or, for MINUTELY/SECONDLY, its minute) cannot match, the
 * next wall hour:minute that can, on the same day — or hour 24 for the next
 * day. Null when `p` itself may match.
 */
function skipTo(p: Temporal.ZonedDateTime, r: RRule): { hour: number; minute: number } | null {
  const hours = r.byHour;
  const minutes = r.freq !== 'HOURLY' ? r.byMinute : undefined;
  if (hours && !hours.includes(p.hour)) {
    const h = sorted(hours).find((x) => x > p.hour);
    return h === undefined ? { hour: 24, minute: 0 } : { hour: h, minute: minutes ? Math.min(...minutes) : 0 };
  }
  if (minutes && !minutes.includes(p.minute)) {
    const mi = sorted(minutes).find((x) => x > p.minute);
    if (mi !== undefined) return { hour: p.hour, minute: mi };
    const h = hours ? sorted(hours).find((x) => x > p.hour) : p.hour + 1;
    return h === undefined || h >= 24 ? { hour: 24, minute: 0 } : { hour: h, minute: Math.min(...minutes) };
  }
  return null;
}

export { dayNumber as _dayNumber, civil as _civil, weekOf as _weekOf, plainSubDaily as _plainSubDaily };
