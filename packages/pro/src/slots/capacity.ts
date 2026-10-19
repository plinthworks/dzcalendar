import { busyFromEvents, findSlots as findFree, checkSlot as checkFree, readMoment } from '@dzcalendar/slots';
import type { Busy, CheckQuery, Moment, Slot, SlotCheck, SlotQuery, SlotRefusal } from '@dzcalendar/slots';
import type { CalEvent, EventInstance, Problem, Resource, ZoneId } from '@dzcalendar/core';

/** Something already taking the time; a booking may take several seats (default 1). */
export interface SeatedBusy extends Busy {
  /** Seats this booking takes: a whole number ≥ 1. Default 1. Ignored on a `block`. */
  readonly seats?: number;
}

/**
 * The capacity of a provider (a class, a group session, a room with seats):
 * how many bookings may share a slot. Owner's decision: simple seats — a
 * slot is offered while seats remain; no rotas.
 */
interface Seated {
  /** Bookings a slot can hold at once: a whole number ≥ 1. Default 1 (the free engine's answer). */
  readonly capacity?: number;
  readonly busy?: readonly SeatedBusy[];
}

export type SeatsQuery = Omit<SlotQuery, 'busy'> & Seated;
export type SeatsCheckQuery = Omit<CheckQuery, 'busy'> & Seated;

/** A slot, and the seats still free in it. */
export interface SeatedSlot extends Slot {
  readonly seats: number;
  readonly capacity: number;
}

/** Why a start was refused: the free engine's reasons, and `full` (no seat left). */
export type SeatsRefusal = SlotRefusal | 'full';

export type SeatsCheck =
  | { readonly ok: true; readonly slot: SeatedSlot }
  | { readonly ok: false; readonly reason: SeatsRefusal; readonly problems?: readonly Problem[] };

const MIN = 60_000;
const problem = (path: string, detail: string, severity: Problem['severity'] = 'error'): Problem => ({ code: 'invalid-slot-query', severity, path, detail });
const wholeAtLeastOne = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 100_000;

/** A booking, padded by the buffers, with its seats. */
interface Seat {
  readonly s: number;
  readonly e: number;
  readonly n: number;
  /** The provider's date it starts on (what `maxPerDay` counts). */
  readonly date: string;
}

interface Split {
  readonly capacity: number;
  /** Validated once: what the seat count and the daily cap are read with. */
  readonly before: number;
  readonly after: number;
  readonly cap: number;
  /** What the free engine still sees: blocks (and unreadable entries, which it reports). */
  readonly blocks: Busy[];
  readonly seats: Seat[];
  readonly problems: Problem[];
  /** The longest padded booking: how far back one may still reach a slot. */
  readonly longest: number;
}

/** The bookings taken out of `busy`, padded like the free engine pads them; the rest left to it. */
function split(q: Seated & { readonly bufferBefore?: number; readonly bufferAfter?: number; readonly availability?: { readonly timeZone?: string } }): Split | Problem {
  const capacity = q.capacity ?? 1;
  if (!wholeAtLeastOne(capacity)) return problem('capacity', String(q.capacity));
  // The free engine's own checks, here too: a value it would refuse is refused (not read as 0).
  const minutesOk = (x: unknown) => x === undefined || (typeof x === 'number' && Number.isFinite(x) && x >= 0);
  if (!minutesOk(q.bufferBefore)) return problem('bufferBefore', String(q.bufferBefore));
  if (!minutesOk(q.bufferAfter)) return problem('bufferAfter', String(q.bufferAfter));
  const m = (q as { maxPerDay?: unknown }).maxPerDay;
  if (m !== undefined && !(typeof m === 'number' && Number.isInteger(m) && m >= 0 && m <= 100_000)) return problem('maxPerDay', String(m));
  const cap = (m as number | undefined) ?? Infinity;
  const before = (q.bufferBefore ?? 0) * MIN;
  const after = (q.bufferAfter ?? 0) * MIN;
  const zone = q.availability?.timeZone ?? 'UTC';
  const blocks: Busy[] = [];
  const seats: Seat[] = [];
  const problems: Problem[] = [];
  // As the free engine: busy is a list, or the query is refused.
  if (q.busy !== undefined && !Array.isArray(q.busy)) return problem('busy', typeof q.busy);
  (q.busy ?? []).forEach((b, i) => {
    const s = readMoment(b?.start);
    const e = readMoment(b?.end);
    // What cannot be read is said here, at its own place in the list (the engine sees only the blocks).
    if (!b || typeof b !== 'object' || !s || !e || e.epochMilliseconds < s.epochMilliseconds) {
      problems.push(problem(`busy[${i}]`, b && typeof b === 'object' ? `${String(b.start)}–${String(b.end)}` : String(b), 'warning'));
      return;
    }
    if (b.kind === 'block') {
      blocks.push({ start: b.start, end: b.end, kind: 'block' });
      return;
    }
    let n = 1;
    if (b.seats !== undefined) {
      if (wholeAtLeastOne(b.seats)) n = b.seats;
      else problems.push(problem(`busy[${i}].seats`, String(b.seats), 'warning'));
    }
    let date = '';
    try {
      date = s.toZonedDateTimeISO(zone).toPlainDate().toString();
    } catch {
      // An unknown zone: the free engine refuses the query, with its own problem.
    }
    seats.push({ s: s.epochMilliseconds - before, e: e.epochMilliseconds + after, n, date });
  });
  seats.sort((a, b) => a.s - b.s);
  return { capacity, before, after, cap, blocks, seats, problems, longest: seats.reduce((x, y) => Math.max(x, y.e - y.s), 0) };
}

/** The most seats taken at once inside `[s, e)`; bookings sorted by start, none longer than `longest`. */
function taken(seats: readonly Seat[], longest: number, s: number, e: number): number {
  // The first booking that may still reach `s`: a binary search, not a walk from the start.
  let lo = 0;
  let hi = seats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (seats[mid]!.s < s - longest) lo = mid + 1;
    else hi = mid;
  }
  const edges: [number, number][] = [];
  for (let i = lo; i < seats.length; i++) {
    const x = seats[i]!;
    if (x.s >= e) break;
    if (x.e <= s) continue;
    edges.push([Math.max(x.s, s), x.n], [Math.min(x.e, e), -x.n]);
  }
  // Ends before starts at the same instant: a booking ending at 10:00 leaves its seat to one starting then.
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let max = 0;
  for (const [, d] of edges) {
    now += d;
    max = Math.max(max, now);
  }
  return max;
}

/** Bookings per provider date. */
const perDay = (seats: readonly Seat[]) => {
  const m = new Map<string, number>();
  for (const x of seats) m.set(x.date, (m.get(x.date) ?? 0) + 1);
  return m;
};

/** What the free engine is asked: the same query, its blocks only, no daily cap (counted here, on bookings). */
const freeQuery = <Q extends { readonly maxPerDay?: number }>(q: Q, blocks: Busy[]) => {
  const { maxPerDay: _cap, ...rest } = q as Q & { capacity?: unknown };
  delete (rest as { capacity?: unknown }).capacity;
  return { ...rest, busy: blocks };
};

/**
 * The bookable slots with seats: `findSlots` of `@dzcalendar/slots`, where a
 * booking takes its seats instead of the whole slot. A slot is offered while
 * a seat remains (with its buffers, the most seats taken at once in it), and
 * says how many (`seats`). `maxPerDay` counts bookings, not seats. With
 * `capacity: 1` and no `seats`, the free engine's answer exactly.
 */
export function findSlots(q: SeatsQuery): { slots: SeatedSlot[]; problems: Problem[] } {
  // Not a query at all: the free engine says why, as it would.
  if (!q || typeof q !== 'object') return { slots: [], problems: findFree(q as never).problems };
  try {
    return seated(q);
  } catch (e) {
    return { slots: [], problems: [problem('query', String(e))] };
  }
}

function seated(q: SeatsQuery): { slots: SeatedSlot[]; problems: Problem[] } {
  const parts = split(q);
  if (!('capacity' in parts)) return { slots: [], problems: [parts] };
  const free = findFree(freeQuery(q, parts.blocks) as SlotQuery);
  const problems = [...parts.problems, ...free.problems];
  if (free.problems.some((p) => p.severity === 'error')) return { slots: [], problems };
  const { before, after, cap } = parts;
  const days = perDay(parts.seats);
  const slots: SeatedSlot[] = [];
  for (const slot of free.slots) {
    if ((days.get(slot.start.toPlainDate().toString()) ?? 0) >= cap) continue;
    const used = taken(parts.seats, parts.longest, slot.start.epochMilliseconds - before, slot.end.epochMilliseconds + after);
    if (used < parts.capacity) slots.push({ ...slot, seats: parts.capacity - used, capacity: parts.capacity });
  }
  return { slots, problems };
}

/**
 * Whether `start` is one of the slots `findSlots(q)` offers — what a server
 * asks before saving. The free engine's reasons first (in its order, `busy`
 * for a block), then `daily-cap`, then `full` when no seat is left.
 */
export function checkSlot(q: SeatsCheckQuery, start: Moment): SeatsCheck {
  if (!q || typeof q !== 'object') {
    const r = checkFree(q as never, start);
    return r.ok ? { ok: false, reason: 'invalid-query' } : r;
  }
  try {
    return check(q, start);
  } catch (e) {
    return { ok: false, reason: 'invalid-query', problems: [problem('query', String(e))] };
  }
}

function check(q: SeatsCheckQuery, start: Moment): SeatsCheck {
  const parts = split(q);
  if (!('capacity' in parts)) return { ok: false, reason: 'invalid-query', problems: [parts] };
  const r = checkFree(freeQuery(q, parts.blocks) as CheckQuery, start);
  // The free engine's own refusals come first, except a block's `busy`: the daily cap is counted before it, as there.
  if (!r.ok && r.reason !== 'busy') return r;
  const at = readMoment(start)!;
  const date = at.toZonedDateTimeISO(q.availability.timeZone).toPlainDate().toString();
  if ((perDay(parts.seats).get(date) ?? 0) >= parts.cap) return { ok: false, reason: 'daily-cap' };
  if (!r.ok) return r;
  const used = taken(parts.seats, parts.longest, r.slot.start.epochMilliseconds - parts.before, r.slot.end.epochMilliseconds + parts.after);
  if (used >= parts.capacity) return { ok: false, reason: 'full' };
  return { ok: true, slot: { ...r.slot, seats: parts.capacity - used, capacity: parts.capacity } };
}

/**
 * The busy time of calendar events, with their seats: `busyFromEvents` of
 * `@dzcalendar/slots`, where a timed event's `extendedProps[field]` (a whole
 * number ≥ 1) is how many seats it takes (a group booking).
 */
export function seatedBusyFromEvents(events: Iterable<CalEvent | EventInstance>, zone: ZoneId, field = 'seats'): SeatedBusy[] {
  const out: SeatedBusy[] = [];
  for (const x of events) {
    const ev = 'event' in x ? x.event : x;
    for (const b of busyFromEvents([ev], zone)) {
      const n = ev.props[field];
      out.push(b.kind !== 'block' && wholeAtLeastOne(n) ? { ...b, seats: n as number } : b);
    }
  }
  return out;
}

/**
 * A resource's seats (a room, a class): its `extendedProps[field]` as the
 * capacity (1 when it has none; anything else is passed on, for `findSlots`
 * to refuse) and the busy time of the events that carry it — spread into a
 * query: `findSlots({ ...query, ...resourceSeats(room, events, zone) })`.
 */
export function resourceSeats(resource: Resource, events: Iterable<CalEvent | EventInstance>, zone: ZoneId, o: { readonly field?: string; readonly seatsField?: string } = {}): { capacity: number; busy: SeatedBusy[] } {
  const mine: CalEvent[] = [];
  for (const x of events) {
    const ev = 'event' in x ? x.event : x;
    if (ev.resourceIds.includes(resource.id)) mine.push(ev);
  }
  const c = resource.extendedProps[o.field ?? 'capacity'];
  return { capacity: (c ?? 1) as number, busy: seatedBusyFromEvents(mine, zone, o.seatsField) };
}
