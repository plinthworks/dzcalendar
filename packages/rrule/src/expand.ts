import { Temporal } from './temporal.js';
import { _dayNumber, _plainSubDaily, iterateDates, iterateZoned } from './iterate.js';
import type { RRuleProblem, RRuleSet } from './types.js';

export interface ExpandWindow {
  /** Occurrences starting before this are skipped (they may still overlap: the caller widens by the duration). */
  readonly from: Temporal.Instant | Temporal.PlainDate;
  /** Exclusive. */
  readonly to: Temporal.Instant | Temporal.PlainDate;
}

export interface ExpandResult<T> {
  readonly starts: T[];
  /** `too-many-occurrences` when `limit` cut the list short. */
  readonly problems: readonly RRuleProblem[];
}

const DEFAULT_LIMIT = 10_000;

function instantOf(x: Temporal.Instant | Temporal.PlainDate, zone: string): bigint {
  return x instanceof Temporal.Instant ? x.epochNanoseconds : x.toZonedDateTime({ timeZone: zone }).epochNanoseconds;
}

/**
 * The starts of a timed series inside a window: its rules (merged, in
 * order), plus RDATEs, minus EXDATEs — an EXDATE instant removes that moment,
 * an EXDATE date removes every occurrence on that date in the series' zone.
 * Stops at `limit` and says so rather than running away.
 */
export function expandZoned(start: Temporal.ZonedDateTime, set: RRuleSet, w: ExpandWindow, limit = DEFAULT_LIMIT): ExpandResult<Temporal.ZonedDateTime> {
  const zone = start.timeZoneId;
  const from = instantOf(w.from, zone);
  const to = instantOf(w.to, zone);
  const exInstants = new Set<bigint>();
  const exDates = new Set<string>();
  for (const x of set.exdates) {
    if (x instanceof Temporal.Instant) exInstants.add(x.epochNanoseconds);
    else exDates.add(x.toString());
  }
  const excluded = (z: Temporal.ZonedDateTime) => exInstants.has(z.epochNanoseconds) || exDates.has(z.toPlainDate().toString());

  const found = new Map<bigint, Temporal.ZonedDateTime>();
  const state = { cut: false };
  for (const rule of set.rules) {
    // Each rule brings up to one more than the limit: the union, sorted, is then cut.
    let n = 0;
    for (const z of iterateZoned(start, rule, Temporal.Instant.fromEpochNanoseconds(from), state)) {
      const ns = z.epochNanoseconds;
      if (ns >= to) break;
      if (ns < from || excluded(z)) continue;
      found.set(ns, z);
      // One more than the limit: exactly `limit` occurrences is not too many.
      if (++n > limit) break;
    }
  }
  for (const r of set.rdates) {
    const z = r instanceof Temporal.PlainDate ? r.toZonedDateTime({ timeZone: zone, plainTime: start.toPlainTime() }) : r.withTimeZone(zone);
    const ns = z.epochNanoseconds;
    if (ns >= from && ns < to && !excluded(z)) found.set(ns, z);
  }
  const starts = [...found.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, z]) => z);
  const r = cutAt(starts, limit);
  // A generator that ran out of steps did not reach the window's end: say so.
  return state.cut && r.problems.length === 0 ? { starts: r.starts, problems: [{ code: 'too-many-occurrences', detail: 'the rule needs too many steps to reach this window' }] } : r;
}

/** The same for an all-day series: dates in, dates out. */
export function expandDates(start: Temporal.PlainDate, set: RRuleSet, w: { readonly from: Temporal.PlainDate; readonly to: Temporal.PlainDate }, limit = DEFAULT_LIMIT): ExpandResult<Temporal.PlainDate> {
  const ex = new Set(set.exdates.map((x) => (x instanceof Temporal.PlainDate ? x : x.toZonedDateTimeISO('UTC').toPlainDate()).toString()));
  const found = new Map<string, Temporal.PlainDate>();
  for (const rule of set.rules) {
    let n = 0;
    for (const d of iterateDates(start, rule, _dayNumber(w.from.year, w.from.month, w.from.day))) {
      if (Temporal.PlainDate.compare(d, w.to) >= 0) break;
      if (Temporal.PlainDate.compare(d, w.from) < 0 || ex.has(d.toString())) continue;
      found.set(d.toString(), d);
      if (++n > limit) break;
    }
  }
  for (const r of set.rdates) {
    const d = r instanceof Temporal.PlainDate ? r : r.toPlainDate();
    if (Temporal.PlainDate.compare(d, w.from) >= 0 && Temporal.PlainDate.compare(d, w.to) < 0 && !ex.has(d.toString())) found.set(d.toString(), d);
  }
  return cutAt([...found.values()].sort(Temporal.PlainDate.compare), limit);
}

/**
 * The last start a series can have, or null when it never ends (no COUNT,
 * no UNTIL in some rule). What the store indexes a series by.
 */
export function lastStart(start: Temporal.ZonedDateTime | Temporal.PlainDate, set: RRuleSet): Temporal.ZonedDateTime | Temporal.PlainDate | null {
  let last: Temporal.ZonedDateTime | Temporal.PlainDate | null = start;
  const later = (a: typeof last, b: Temporal.ZonedDateTime | Temporal.PlainDate) =>
    a === null ? b : a instanceof Temporal.PlainDate ? (Temporal.PlainDate.compare(b as Temporal.PlainDate, a) > 0 ? b : a) : Temporal.ZonedDateTime.compare(b as Temporal.ZonedDateTime, a) > 0 ? b : a;
  for (const rule of set.rules) {
    if (rule.count === undefined && rule.until === undefined) return null;
    if (rule.until !== undefined && rule.count === undefined) {
      // UNTIL bounds it without walking: the until itself is an upper bound.
      const u = rule.until;
      const bound = start instanceof Temporal.PlainDate ? (u instanceof Temporal.PlainDate ? u : u.toZonedDateTimeISO('UTC').toPlainDate()) : u instanceof Temporal.PlainDate ? u.add({ days: 1 }).toZonedDateTime({ timeZone: start.timeZoneId }) : u.toZonedDateTimeISO(start.timeZoneId);
      last = later(last, bound);
      continue;
    }
    // COUNT with no BY part, sub-daily: the last start is arithmetic.
    if (!(start instanceof Temporal.PlainDate) && _plainSubDaily(rule) && (rule.freq === 'HOURLY' || rule.freq === 'MINUTELY' || rule.freq === 'SECONDLY')) {
      const unit = rule.freq === 'HOURLY' ? 'hours' : rule.freq === 'MINUTELY' ? 'minutes' : 'seconds';
      last = later(last, start.add({ [unit]: (rule.count! - 1) * rule.interval }));
      continue;
    }
    // COUNT: walk it — within a budget. Past it the series is indexed as
    // endless: a safe upper bound, and no input can stall the store.
    if (rule.count! > WALK_BUDGET) return null;
    const state = { cut: false };
    const it = start instanceof Temporal.PlainDate ? iterateDates(start, rule) : iterateZoned(start, rule, undefined, state);
    for (const x of it) last = later(last, x);
    // Out of steps before COUNT: the true end is unknown, so it is endless for the index.
    if (state.cut) return null;
  }
  for (const r of set.rdates) {
    // An all-day series reads its RDATEs as dates.
    const x = start instanceof Temporal.PlainDate ? (r instanceof Temporal.PlainDate ? r : r.toPlainDate()) : r instanceof Temporal.PlainDate ? r.toZonedDateTime({ timeZone: start.timeZoneId, plainTime: start.toPlainTime() }) : r;
    last = later(last, x);
  }
  return last;
}

/** COUNT a series may walk to find its end; beyond, it is indexed as endless. */
const WALK_BUDGET = 50_000;

/** The first start a series can have: DTSTART, or an earlier RDATE. */
export function firstStart(start: Temporal.ZonedDateTime | Temporal.PlainDate, set: RRuleSet): Temporal.ZonedDateTime | Temporal.PlainDate {
  let first = start;
  for (const r of set.rdates) {
    if (start instanceof Temporal.PlainDate) {
      const d = r instanceof Temporal.PlainDate ? r : r.toPlainDate();
      if (Temporal.PlainDate.compare(d, first as Temporal.PlainDate) < 0) first = d;
    } else {
      const z = r instanceof Temporal.PlainDate ? r.toZonedDateTime({ timeZone: start.timeZoneId, plainTime: start.toPlainTime() }) : r;
      if (Temporal.ZonedDateTime.compare(z, first as Temporal.ZonedDateTime) < 0) first = z;
    }
  }
  return first;
}

function cutAt<T>(starts: T[], limit: number): ExpandResult<T> {
  if (starts.length <= limit) return { starts, problems: [] };
  return { starts: starts.slice(0, limit), problems: [{ code: 'too-many-occurrences', detail: `more than ${limit} in the window` }] };
}
