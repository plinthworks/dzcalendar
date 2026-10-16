import { _civil, _dayNumber, iterateDates, iterateZoned } from './iterate.js';
import { Temporal } from './temporal.js';
import type { ByDay, RRule, RRuleSet, Weekday } from './types.js';

type Start = Temporal.ZonedDateTime | Temporal.PlainDate;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const dayOf = (x: Start): number => _dayNumber(x.year, x.month, x.day);
const weekdayOf = (n: number): Weekday => (((((n + 3) % 7) + 7) % 7) + 1) as Weekday;
const daysIn = (y: number, m: number) => _dayNumber(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - _dayNumber(y, m, 1);
const daysInYear = (y: number) => _dayNumber(y + 1, 1, 1) - _dayNumber(y, 1, 1);
const mod = (a: number, n: number) => ((a % n) + n) % n;
/**
 * Moves a 1-based value (or a count from the end, negative) by `by` days,
 * always to a valid one: the day after the last is the first (-1 + 1 → 1),
 * the day before the first is the last (1 - 1 → -1); beyond, it wraps.
 */
function wrap(v: number, by: number, size: number): number {
  const n = v + by;
  if (v > 0) return n >= 1 ? mod(n - 1, size) + 1 : n - 1 >= -size ? n - 1 : -(mod(-n, size) + 1);
  return n <= -1 ? -(mod(-n - 1, size) + 1) : n + 1 <= size ? n + 1 : mod(n, size) + 1;
}
const isTimed = (x: Start): x is Temporal.ZonedDateTime => !(x instanceof Temporal.PlainDate);

/** Which n-th of its month (or year) a day is, counted from the end when `fromEnd`. */
function nthOf(n: number, fromEnd: boolean, scope: 'month' | 'year'): number {
  const { y, m, d } = _civil(n);
  if (scope === 'year') {
    const doy = n - _dayNumber(y, 1, 1);
    return fromEnd ? -(Math.floor((daysInYear(y) - 1 - doy) / 7) + 1) : Math.floor(doy / 7) + 1;
  }
  return fromEnd ? -(Math.floor((daysIn(y, m) - d) / 7) + 1) : Math.floor((d - 1) / 7) + 1;
}

const ordinalScope = (r: RRule): 'month' | 'year' => (r.freq === 'MONTHLY' || (r.freq === 'YEARLY' && r.byMonth) ? 'month' : 'year');

function dedupe<T>(xs: readonly T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
const sortedNums = (xs: readonly number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** The BY parts a rule takes from its DTSTART when it does not say them. */
export type ImplicitPart = 'byDay' | 'byMonthDay' | 'byMonth' | 'byHour' | 'byMinute' | 'bySecond';

/**
 * The same rule with what it took from DTSTART written out — the weekday of
 * a WEEKLY rule, the day of a MONTHLY one, the month and day of a YEARLY one,
 * the time of day of a daily-or-slower timed one — so it repeats the same
 * dates from any other DTSTART (INTERVAL's phase aside). `added` lists what
 * was written, for `implicitRule` to take back.
 */
export function explicitRule(rule: RRule, dtstart: Start): { rule: RRule; added: ImplicitPart[] } {
  const r: Mutable<RRule> = { ...rule };
  const added: ImplicitPart[] = [];
  const n = dayOf(dtstart);
  const { m, d } = _civil(n);
  if (!(r.byWeekNo || r.byYearDay || r.byMonthDay || r.byDay)) {
    if (r.freq === 'WEEKLY') (r.byDay = [{ weekday: weekdayOf(n) }]), added.push('byDay');
    if (r.freq === 'MONTHLY') (r.byMonthDay = [d]), added.push('byMonthDay');
    if (r.freq === 'YEARLY') {
      if (!r.byMonth) (r.byMonth = [m]), added.push('byMonth');
      r.byMonthDay = [d];
      added.push('byMonthDay');
    }
  }
  if (isTimed(dtstart) && r.freq !== 'HOURLY' && r.freq !== 'MINUTELY' && r.freq !== 'SECONDLY') {
    if (!r.byHour) (r.byHour = [dtstart.hour]), added.push('byHour');
    if (!r.byMinute) (r.byMinute = [dtstart.minute]), added.push('byMinute');
    if (!r.bySecond) (r.bySecond = [dtstart.second]), added.push('bySecond');
  }
  return { rule: r, added };
}

/** Takes back what `explicitRule` wrote, where the new DTSTART would imply the same: the rule reads as it was given. */
export function implicitRule(rule: RRule, dtstart: Start, added: readonly ImplicitPart[]): RRule {
  const r: Mutable<RRule> = { ...rule };
  const n = dayOf(dtstart);
  const { m, d } = _civil(n);
  const one = (xs: readonly number[] | undefined, v: number) => xs !== undefined && xs.length === 1 && xs[0] === v;
  if (added.includes('byDay') && r.byDay?.length === 1 && r.byDay[0]!.n === undefined && r.byDay[0]!.weekday === weekdayOf(n)) delete r.byDay;
  if (added.includes('byMonth') && one(r.byMonth, m) && added.includes('byMonthDay') && one(r.byMonthDay, d)) {
    delete r.byMonth;
    delete r.byMonthDay;
  } else if (added.includes('byMonthDay') && !added.includes('byMonth') && one(r.byMonthDay, d)) delete r.byMonthDay;
  if (isTimed(dtstart)) {
    if (added.includes('byHour') && one(r.byHour, dtstart.hour)) delete r.byHour;
    if (added.includes('byMinute') && one(r.byMinute, dtstart.minute)) delete r.byMinute;
    if (added.includes('bySecond') && one(r.bySecond, dtstart.second)) delete r.bySecond;
  }
  return r;
}

/**
 * The rule that repeats the same way around a moved occurrence. What named
 * the old start names the new one ("the second Tuesday" moved to the third
 * Thursday becomes "the third Thursday"; "the 10th" moved to the 12th, "the
 * 12th"); the other values move by the same difference, staying valid (a
 * day of the month stays within 1..31, a last-day count stays negative).
 * Rules relying on DTSTART for a part are best made explicit first
 * (`explicitRule`). COUNT and UNTIL are not touched here.
 */
export function rebaseRule(rule: RRule, oldStart: Start, newStart: Start): RRule {
  const o = dayOf(oldStart);
  const n = dayOf(newStart);
  const delta = n - o;
  const old = _civil(o);
  const now = _civil(n);
  const next: Mutable<RRule> = { ...rule };
  const scope = ordinalScope(rule);

  if (delta !== 0) {
    if (rule.byDay) {
      next.byDay = dedupe(
        rule.byDay.map((b): ByDay => {
          if (b.n === undefined) return { weekday: weekdayOf(o + mod(b.weekday - weekdayOf(o), 7) + delta) };
          // The entry that named the start is recounted from the new day; the others keep their rank.
          const named = b.weekday === weekdayOf(o) && b.n === nthOf(o, b.n < 0, scope);
          if (named) return { weekday: weekdayOf(n), n: nthOf(n, b.n < 0, scope) };
          return { weekday: weekdayOf(o + mod(b.weekday - weekdayOf(o), 7) + delta), n: b.n };
        }),
        (b) => `${b.n ?? ''}:${b.weekday}`,
      );
    }
    if (rule.byMonthDay) {
      const oldNeg = old.d - daysIn(old.y, old.m) - 1;
      const newNeg = now.d - daysIn(now.y, now.m) - 1;
      next.byMonthDay = sortedNums(rule.byMonthDay.map((v) => (v === old.d ? now.d : v === oldNeg ? newNeg : wrap(v, delta, 31))));
    }
    if (rule.byMonth && rule.freq === 'YEARLY' && old.m !== now.m) next.byMonth = sortedNums(rule.byMonth.map((v) => (v === old.m ? now.m : wrap(v, now.m - old.m, 12))));
    if (rule.byYearDay) {
      const oldDoy = o - _dayNumber(old.y, 1, 1) + 1;
      const newDoy = n - _dayNumber(now.y, 1, 1) + 1;
      const oldNeg = oldDoy - daysInYear(old.y) - 1;
      const newNeg = newDoy - daysInYear(now.y) - 1;
      next.byYearDay = sortedNums(rule.byYearDay.map((v) => (v === oldDoy ? newDoy : v === oldNeg ? newNeg : wrap(v, delta, 366))));
    }
    if (rule.byWeekNo) {
      const weeks = Math.round(delta / 7);
      if (weeks !== 0) next.byWeekNo = sortedNums(rule.byWeekNo.map((v) => wrap(v, weeks, 53)));
    }
  }

  // The time of day: the value that was the start's becomes the new start's; the others move by as much.
  if (isTimed(oldStart) && isTimed(newStart)) {
    const time = (xs: readonly number[] | undefined, a: number, b: number, size: number) => (xs ? sortedNums(xs.map((v) => (v === a ? b : mod(v + b - a, size)))) : undefined);
    const h = time(rule.byHour, oldStart.hour, newStart.hour, 24);
    const mi = time(rule.byMinute, oldStart.minute, newStart.minute, 60);
    const se = time(rule.bySecond, oldStart.second, newStart.second, 60);
    if (h) next.byHour = h;
    if (mi) next.byMinute = mi;
    if (se) next.bySecond = se;
  }
  return next;
}

/**
 * Cuts a rule at the occurrence starting at `cut` (exclusive): what repeats
 * before it, and what repeats from it on. COUNT is shared between the two
 * (the occurrences already passed stay with the first); UNTIL bounds the
 * first by the last start before the cut and stays with the second. `before`
 * is null when nothing of this rule comes before the cut, `after` when
 * nothing comes from it on.
 */
export function splitRule(rule: RRule, start: Start, cut: Start): { before: RRule | null; after: RRule | null } {
  const { count, last } = countBefore(rule, start, cut);
  if (count === 0) return { before: null, after: rule };
  const { count: _c, until: _u, ...open } = rule;
  const before: RRule =
    rule.count !== undefined ? { ...open, count } : { ...open, until: last instanceof Temporal.PlainDate ? last : (last as Temporal.ZonedDateTime).toInstant() };
  const after: RRule | null = rule.count === undefined ? rule : rule.count - count > 0 ? { ...open, count: rule.count - count } : null;
  return { before, after };
}

/** How many starts of `rule` (from `start`) come strictly before `cut`, and the last of them. */
export function countBefore(rule: RRule, start: Start, cut: Start): { count: number; last: Start | null } {
  let count = 0;
  let last: Start | null = null;
  for (const x of iterateRule(start, rule)) {
    if (!lessThan(x, cut)) break;
    count++;
    last = x;
  }
  return { count, last };
}

const iterateRule = (start: Start, rule: RRule): Iterable<Start> => (start instanceof Temporal.PlainDate ? iterateDates(start, rule) : iterateZoned(start, rule));

function lessThan(a: Start, b: Start): boolean {
  if (a instanceof Temporal.PlainDate) return Temporal.PlainDate.compare(a, b as Temporal.PlainDate) < 0;
  return (a as Temporal.ZonedDateTime).epochNanoseconds < (b as Temporal.ZonedDateTime).epochNanoseconds;
}
const same = (a: Start, b: Start) => !lessThan(a, b) && !lessThan(b, a);

/**
 * Every start of a set — its rules merged, its RDATEs among them, EXDATEs
 * *not* removed (an excluded start keeps its place: it is still a key) — in
 * order, each once.
 */
export function* iterateUnion(start: Start, set: RRuleSet): Generator<Start> {
  const timed = isTimed(start);
  const zone = timed ? start.timeZoneId : 'UTC';
  const rdates: Start[] = set.rdates
    .map((r): Start => (timed ? (r instanceof Temporal.PlainDate ? r.toZonedDateTime({ timeZone: zone, plainTime: start.toPlainTime() }) : r) : r instanceof Temporal.PlainDate ? r : r.toPlainDate()))
    .sort((a, b) => (lessThan(a, b) ? -1 : lessThan(b, a) ? 1 : 0));
  const its = set.rules.map((r) => iterateRule(start, r)[Symbol.iterator]());
  const heads = its.map((it) => it.next());
  let ri = 0;
  let last: Start | null = null;
  for (;;) {
    let best = -1;
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i]!;
      if (!h.done && (best === -1 || lessThan(h.value, heads[best]!.value as Start))) best = i;
    }
    const fromRule = best === -1 ? null : (heads[best]!.value as Start);
    const fromRdate = ri < rdates.length ? rdates[ri]! : null;
    let next: Start;
    if (fromRule === null && fromRdate === null) return;
    if (fromRule !== null && (fromRdate === null || !lessThan(fromRdate, fromRule))) {
      next = fromRule;
      heads[best] = its[best]!.next();
    } else {
      next = fromRdate!;
      ri++;
    }
    if (last !== null && same(last, next)) continue;
    last = next;
    yield next;
  }
}

/** Where a start sits in the set (0 = first), or -1 when the set never produces it. Walks at most `budget` starts. */
export function indexOfStart(start: Start, set: RRuleSet, at: Start, budget = 50_000): number {
  let i = 0;
  for (const x of iterateUnion(start, set)) {
    if (same(x, at)) return i;
    if (lessThan(at, x) || ++i > budget) return -1;
  }
  return -1;
}

/** The n-th start of the set (0 = first), or null. */
export function nthStart(start: Start, set: RRuleSet, n: number): Start | null {
  let i = 0;
  for (const x of iterateUnion(start, set)) if (i++ === n) return x;
  return null;
}
