import { Temporal, isValidZone, normalizeIntervals } from '@dzcalendar/core';
import type { Instant, MsSpan, Problem, ZonedDateTime } from '@dzcalendar/core';
import { openSpans } from './availability.js';
import { problem } from './problem.js';
import type { CheckQuery, Moment, Slot, SlotCheck, SlotQuery, SlotRefusal } from './types.js';

const MIN = 60_000;
/** At most this many slots are offered, and this many starts looked at: a tiny step over years would never end. */
const MAX_SLOTS = 10_000;
const MAX_CANDIDATES = 200_000;

/** A moment as an Instant, or null when it cannot be read. */
export function toInstant(m: unknown): Instant | null {
  try {
    if (m instanceof Temporal.Instant) return m;
    if (m instanceof Temporal.ZonedDateTime) return m.toInstant();
    if (typeof m !== 'string') return null;
    return m.includes('[') ? Temporal.ZonedDateTime.from(m).toInstant() : Temporal.Instant.from(m);
  } catch {
    return null;
  }
}

/** A query read and checked once; null when it cannot be answered (the reasons in `problems`). */
interface Plan {
  readonly zone: string;
  readonly from: number;
  readonly to: number;
  readonly dur: number;
  readonly step: number;
  readonly before: number;
  readonly after: number;
  readonly earliest: number;
  readonly latest: number;
  readonly cap: number;
  /** Busy time a slot (with its buffers) must not touch: merged epoch-ms spans. */
  readonly busy: MsSpan[];
  /** Bookings per provider date. */
  readonly booked: Map<string, number>;
  /** Merged openings, each with the origin of its slot grid. */
  readonly open: Opening[];
}

/** An opening and where its grid starts (its own start, or a fixed grid for one open for days on end). */
interface Opening extends MsSpan {
  readonly a: number;
}

/** How far back openings are looked for: one that began earlier still counts from its true start. */
const LOOKBACK_DAYS = 7;

const nonNegative = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const wholeNonNegative = (x: unknown) => nonNegative(x) && Number.isInteger(x);
/** At least a minute, at most a year. */
const minutes = (x: unknown) => typeof x === 'number' && x >= 1 && x <= 525_600;

function plan(q: CheckQuery, problems: Problem[], at?: Instant): Plan | null {
  const bad = (path: string, detail: string) => {
    problems.push(problem('invalid-slot-query', 'error', path, detail));
    return null;
  };
  if (!q || typeof q !== 'object') return bad('query', String(q));
  const zone = q.availability?.timeZone;
  if (typeof zone !== 'string' || !isValidZone(zone)) {
    problems.push(problem('unknown-zone', 'error', 'availability.timeZone', String(zone)));
    return null;
  }
  if (!minutes(q.duration)) return bad('duration', String(q.duration));
  // checkSlot without a range: the slot's own time.
  const from = q.from === undefined && at ? at : q.from === undefined ? null : toInstant(q.from);
  const to = q.to === undefined && at ? at.add({ milliseconds: q.duration * MIN }) : q.to === undefined ? null : toInstant(q.to);
  if (!from) return bad('from', String(q.from));
  if (!to) return bad('to', String(q.to));
  const step = q.step ?? q.duration;
  if (!minutes(step)) return bad('step', String(q.step));
  for (const k of ['bufferBefore', 'bufferAfter', 'minNotice'] as const) {
    if (q[k] !== undefined && !nonNegative(q[k])) return bad(k, String(q[k]));
  }
  // Whole numbers: days are added as calendar days, bookings counted one by one.
  for (const k of ['maxAdvanceDays', 'maxPerDay'] as const) {
    if (q[k] !== undefined && !(wholeNonNegative(q[k]) && q[k]! <= 100_000)) return bad(k, String(q[k]));
  }
  if (q.busy !== undefined && !Array.isArray(q.busy)) return bad('busy', typeof q.busy);
  let now: Instant | null = null;
  if (q.now !== undefined) {
    now = toInstant(q.now);
    if (!now) return bad('now', String(q.now));
  } else if (q.minNotice !== undefined || q.maxAdvanceDays !== undefined) {
    return bad('now', 'minNotice and maxAdvanceDays need now');
  }
  const before = (q.bufferBefore ?? 0) * MIN;
  const after = (q.bufferAfter ?? 0) * MIN;
  const busy: MsSpan[] = [];
  const booked = new Map<string, number>();
  (q.busy ?? []).forEach((b, i) => {
    const s = toInstant(b?.start);
    const e = toInstant(b?.end);
    if (!s || !e || e.epochMilliseconds < s.epochMilliseconds) {
      problems.push(problem('invalid-slot-query', 'warning', `busy[${i}]`, `${String(b.start)}–${String(b.end)}`));
      return;
    }
    const booking = b!.kind !== 'block';
    // A booking keeps its own buffers: two appointments are bufferAfter + bufferBefore apart.
    busy.push(booking ? { s: s.epochMilliseconds - before, e: e.epochMilliseconds + after } : { s: s.epochMilliseconds, e: e.epochMilliseconds });
    if (booking) {
      const d = s.toZonedDateTimeISO(zone).toPlainDate().toString();
      booked.set(d, (booked.get(d) ?? 0) + 1);
    }
  });
  const zFrom = from.toZonedDateTimeISO(zone).toPlainDate();
  const zTo = to.toZonedDateTimeISO(zone).toPlainDate();
  // Openings that began before the range (a window opened the day before, or chained ones) keep their grid:
  // it starts at the opening's true start, looked for up to a week back. One open since the very first
  // day looked at (open for days on end: 24/7) cannot be traced to a start — its grid is fixed instead,
  // multiples of the step since the epoch, the same whatever range is asked.
  const first = zFrom.subtract({ days: LOOKBACK_DAYS });
  const firstEnd = first.add({ days: 1 }).toZonedDateTime({ timeZone: zone }).epochMilliseconds;
  const stepMs = Math.round(step * MIN);
  const open = openSpans(q.availability, first, zTo.add({ days: 1 }), problems).map((o) => ({
    ...o,
    a: o.s < firstEnd ? Math.ceil(o.s / stepMs) * stepMs : o.s,
  }));
  const nowMs = now?.epochMilliseconds ?? -Infinity;
  return {
    zone,
    from: from.epochMilliseconds,
    to: to.epochMilliseconds,
    // Whole milliseconds: what instants are counted in.
    dur: Math.round(q.duration * MIN),
    step: stepMs,
    before,
    after,
    earliest: nowMs + (q.minNotice ?? 0) * MIN,
    latest: now && q.maxAdvanceDays !== undefined ? now.toZonedDateTimeISO(zone).add({ days: q.maxAdvanceDays }).epochMilliseconds : Infinity,
    cap: q.maxPerDay ?? Infinity,
    busy: normalizeIntervals(busy.filter((b) => b.e > b.s)),
    booked,
    open,
  };
}

/**
 * Every start the openings offer, in order: from each opening's start, one
 * step at a time (elapsed minutes), while a whole slot fits in the opening.
 */
function* candidates(p: Plan): Generator<number> {
  // Openings wholly before the range are skipped, and a long one is entered at the range's start on its grid.
  for (const o of p.open) {
    if (o.e <= p.from) continue;
    const t0 = o.a >= p.from ? o.a : o.a + Math.ceil((p.from - o.a) / p.step) * p.step;
    for (let t = t0; t + p.dur <= o.e; t += p.step) yield t;
  }
}

/** The first rule a candidate start breaks, or null; `cursor` walks the merged busy spans forward. */
function refusal(p: Plan, t: number, zdt: ZonedDateTime, cursor: { i: number }): SlotRefusal | null {
  if (t < p.earliest) return 'notice';
  if (t > p.latest) return 'advance';
  if (p.cap !== Infinity && (p.booked.get(zdt.toPlainDate().toString()) ?? 0) >= p.cap) return 'daily-cap';
  const s = t - p.before;
  const e = t + p.dur + p.after;
  while (cursor.i < p.busy.length && p.busy[cursor.i]!.e <= s) cursor.i++;
  const b = p.busy[cursor.i];
  if (b && b.s < e) return 'busy';
  return null;
}

const slotAt = (p: Plan, t: number): Slot => {
  const start = Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(p.zone);
  return { start, end: Temporal.Instant.fromEpochMilliseconds(t + p.dur).toZonedDateTimeISO(p.zone) };
};

/**
 * The bookable slots between `from` and `to`: the openings of the provider's
 * week and exceptions, cut into slots of `duration`, minus what is busy (with
 * buffers), too soon (`minNotice`), too far (`maxAdvanceDays`) or on a full
 * date (`maxPerDay`). Bad input never throws: it is in `problems`.
 */
export function findSlots(q: SlotQuery): { slots: Slot[]; problems: Problem[] } {
  const problems: Problem[] = [];
  try {
    const p = plan(q, problems);
    if (!p) return { slots: [], problems };
    const slots: Slot[] = [];
    const cursor = { i: 0 };
    let seen = 0;
    for (const t of candidates(p)) {
      if (t + p.dur > p.to) break;
      if (++seen > MAX_CANDIDATES || slots.length >= MAX_SLOTS) {
        problems.push(problem('too-many-occurrences', 'warning', 'step', `more than ${MAX_SLOTS} slots or ${MAX_CANDIDATES} starts: narrow the range`));
        break;
      }
      const slot = slotAt(p, t);
      if (refusal(p, t, slot.start, cursor) === null) slots.push(slot);
    }
    return { slots, problems };
  } catch (e) {
    // Last resort: a value no check foresaw (a date out of Temporal's range…) is still an answer, not a throw.
    problems.push(problem('invalid-slot-query', 'error', 'query', String(e)));
    return { slots: [], problems };
  }
}

/**
 * Whether `start` is one of the slots `findSlots(q)` would offer — what a
 * server asks before saving a booking, with the same rules as the page.
 * Without `from`/`to`, the range is the slot itself.
 */
export function checkSlot(q: CheckQuery, start: Moment): SlotCheck {
  try {
    return check(q, start);
  } catch (e) {
    return { ok: false, reason: 'invalid-query', problems: [problem('invalid-slot-query', 'error', 'query', String(e))] };
  }
}

function check(q: CheckQuery, start: Moment): SlotCheck {
  const problems: Problem[] = [];
  const at = toInstant(start);
  if (!at) problems.push(problem('invalid-slot-query', 'error', 'start', String(start)));
  const p = at && plan(q, problems, at);
  if (!p || !at || problems.some((x) => x.severity === 'error')) return { ok: false, reason: 'invalid-query', problems };
  const t = at.epochMilliseconds;
  if (t < p.from || t + p.dur > p.to) return { ok: false, reason: 'out-of-range' };
  const opening = p.open.find((o) => o.s <= t && t + p.dur <= o.e);
  if (!opening) return { ok: false, reason: 'closed' };
  // Off the grid — or between milliseconds, which slots never are.
  if (t < opening.a || (t - opening.a) % p.step !== 0 || at.epochNanoseconds % 1_000_000n !== 0n) return { ok: false, reason: 'misaligned' };
  const slot = slotAt(p, t);
  const reason = refusal(p, t, slot.start, { i: 0 });
  return reason ? { ok: false, reason } : { ok: true, slot };
}
