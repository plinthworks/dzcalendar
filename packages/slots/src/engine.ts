import { Temporal, isValidZone, normalizeIntervals } from '@dzcalendar/core';
import type { Instant, MsSpan, Problem, ZonedDateTime } from '@dzcalendar/core';
import { openSpans } from './availability.js';
import { problem } from './problem.js';
import type { Moment, Slot, SlotCheck, SlotQuery, SlotRefusal } from './types.js';

const MIN = 60_000;

/** A moment as an Instant, or null when it cannot be read. */
export function toInstant(m: Moment): Instant | null {
  try {
    if (m instanceof Temporal.Instant) return m;
    if (m instanceof Temporal.ZonedDateTime) return m.toInstant();
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
  readonly open: MsSpan[];
}

const nonNegative = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;

function plan(q: SlotQuery, problems: Problem[]): Plan | null {
  const bad = (path: string, detail: string) => {
    problems.push(problem('invalid-slot-query', 'error', path, detail));
    return null;
  };
  const zone = q.availability?.timeZone;
  if (typeof zone !== 'string' || !isValidZone(zone)) {
    problems.push(problem('unknown-zone', 'error', 'availability.timeZone', String(zone)));
    return null;
  }
  const from = toInstant(q.from);
  const to = toInstant(q.to);
  if (!from) return bad('from', String(q.from));
  if (!to) return bad('to', String(q.to));
  if (!(typeof q.duration === 'number' && q.duration > 0 && Number.isFinite(q.duration))) return bad('duration', String(q.duration));
  const step = q.step ?? q.duration;
  if (!(typeof step === 'number' && step > 0 && Number.isFinite(step))) return bad('step', String(q.step));
  for (const k of ['bufferBefore', 'bufferAfter', 'minNotice', 'maxAdvanceDays', 'maxPerDay'] as const) {
    if (q[k] !== undefined && !nonNegative(q[k])) return bad(k, String(q[k]));
  }
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
    const s = toInstant(b.start);
    const e = toInstant(b.end);
    if (!s || !e || e.epochMilliseconds < s.epochMilliseconds) {
      problems.push(problem('invalid-slot-query', 'warning', `busy[${i}]`, `${String(b.start)}–${String(b.end)}`));
      return;
    }
    const booking = b.kind !== 'block';
    // A booking keeps its own buffers: two appointments are bufferAfter + bufferBefore apart.
    busy.push(booking ? { s: s.epochMilliseconds - before, e: e.epochMilliseconds + after } : { s: s.epochMilliseconds, e: e.epochMilliseconds });
    if (booking) {
      const d = s.toZonedDateTimeISO(zone).toPlainDate().toString();
      booked.set(d, (booked.get(d) ?? 0) + 1);
    }
  });
  const zFrom = from.toZonedDateTimeISO(zone).toPlainDate();
  const zTo = to.toZonedDateTimeISO(zone).toPlainDate();
  // A window opened the day before may run past midnight into the range.
  const open = openSpans(q.availability, zFrom.subtract({ days: 1 }), zTo.add({ days: 1 }), problems);
  const nowMs = now?.epochMilliseconds ?? -Infinity;
  return {
    zone,
    from: from.epochMilliseconds,
    to: to.epochMilliseconds,
    dur: q.duration * MIN,
    step: step * MIN,
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
  for (const o of p.open) for (let t = o.s; t + p.dur <= o.e; t += p.step) yield t;
}

/** The first rule a candidate start breaks, or null; `cursor` walks the merged busy spans forward. */
function refusal(p: Plan, t: number, zdt: ZonedDateTime, cursor: { i: number }): SlotRefusal | null {
  if (t < p.earliest) return 'notice';
  if (t > p.latest) return 'advance';
  if ((p.booked.get(zdt.toPlainDate().toString()) ?? 0) >= p.cap) return 'daily-cap';
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
  const p = plan(q, problems);
  if (!p) return { slots: [], problems };
  const slots: Slot[] = [];
  const cursor = { i: 0 };
  for (const t of candidates(p)) {
    if (t < p.from) continue;
    if (t + p.dur > p.to) break;
    const slot = slotAt(p, t);
    if (refusal(p, t, slot.start, cursor) === null) slots.push(slot);
  }
  return { slots, problems };
}

/**
 * Whether `start` is one of the slots `findSlots(q)` would offer — what a
 * server asks before saving a booking, with the same rules as the page.
 */
export function checkSlot(q: SlotQuery, start: Moment): SlotCheck {
  const problems: Problem[] = [];
  const at = toInstant(start);
  const p = at && plan(q, problems);
  if (!p || !at || problems.some((x) => x.severity === 'error')) return { ok: false, reason: 'invalid-query' };
  const t = at.epochMilliseconds;
  if (t < p.from || t + p.dur > p.to) return { ok: false, reason: 'out-of-range' };
  const opening = p.open.find((o) => o.s <= t && t + p.dur <= o.e);
  if (!opening) return { ok: false, reason: 'closed' };
  if ((t - opening.s) % p.step !== 0) return { ok: false, reason: 'misaligned' };
  const slot = slotAt(p, t);
  const reason = refusal(p, t, slot.start, { i: 0 });
  return reason ? { ok: false, reason } : { ok: true, slot };
}
