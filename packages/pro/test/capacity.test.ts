import { describe, it, expect } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { findSlots as findFree } from '@dzcalendar/slots';
import { checkSlot, findSlots } from '../src/slots-entry.js';
import type { SeatsQuery } from '../src/slots-entry.js';

// A class in Riyadh (+03:00, no clock change), Wednesday 21 October 2026, 08:00–10:00, 30-minute slots.
const R = (hm: string) => `2026-10-21T${hm}+03:00[Asia/Riyadh]`;
const base: SeatsQuery = {
  availability: { timeZone: 'Asia/Riyadh', weekly: [{ days: [3], from: '08:00', to: '10:00' }] },
  from: R('00:00'),
  to: R('23:59'),
  duration: 30,
  capacity: 2,
};
const shown = (r: ReturnType<typeof findSlots>) => r.slots.map((s) => `${s.start.toString().slice(11, 16)}:${s.seats}`);

describe('seats', () => {
  it('a slot stays offered while a seat remains, and says how many', () => {
    const r = findSlots({ ...base, busy: [{ start: R('08:00'), end: R('08:30') }] });
    expect([shown(r), r.problems]).toEqual([['08:00:1', '08:30:2', '09:00:2', '09:30:2'], []]);
  });

  it('full: two bookings, or one of two seats; checkSlot says "full"', () => {
    const two = findSlots({ ...base, busy: [{ start: R('08:00'), end: R('08:30') }, { start: R('08:00'), end: R('08:30') }] });
    expect(shown(two)).toEqual(['08:30:2', '09:00:2', '09:30:2']);
    const pair = { ...base, busy: [{ start: R('08:00'), end: R('08:30'), seats: 2 }] };
    expect(shown(findSlots(pair))[0]).toBe('08:30:2');
    expect(checkSlot(pair, R('08:00'))).toEqual({ ok: false, reason: 'full' });
    const ok = checkSlot({ ...base, busy: [{ start: R('08:00'), end: R('08:30') }] }, R('08:00'));
    expect(ok.ok && [ok.slot.seats, ok.slot.capacity, ok.slot.start.toString()]).toEqual([1, 2, '2026-10-21T08:00:00+03:00[Asia/Riyadh]']);
  });

  it('the most seats taken at once counts, not the sum: back-to-back bookings share a seat', () => {
    // 08:00–08:15 and 08:15–08:30 never meet: the 08:00 slot has one seat taken, not two.
    const r = findSlots({ ...base, busy: [{ start: R('08:00'), end: R('08:15') }, { start: R('08:15'), end: R('08:30') }] });
    expect(shown(r)[0]).toBe('08:00:1');
  });

  it('buffers pad a booking as the free engine does: 10 minutes after 08:00–08:30 reach into the 08:30 slot', () => {
    const r = findSlots({ ...base, bufferAfter: 10, busy: [{ start: R('08:00'), end: R('08:30') }] });
    expect(shown(r)).toEqual(['08:00:1', '08:30:1', '09:00:2', '09:30:2']);
  });

  it('a block takes the whole slot ("busy"); maxPerDay counts bookings, not seats ("daily-cap")', () => {
    const blocked = { ...base, busy: [{ start: R('09:00'), end: R('09:30'), kind: 'block' as const }] };
    expect(shown(findSlots(blocked))).toEqual(['08:00:2', '08:30:2', '09:30:2']);
    expect(checkSlot(blocked, R('09:00'))).toEqual({ ok: false, reason: 'busy' });
    const capped = { ...base, maxPerDay: 2, busy: [{ start: R('08:00'), end: R('08:30'), seats: 1 }, { start: R('09:00'), end: R('09:30'), seats: 1 }] };
    expect(shown(findSlots(capped))).toEqual([]);
    expect(checkSlot(capped, R('09:30'))).toEqual({ ok: false, reason: 'daily-cap' });
  });

  it('capacity 1 without seats: the free engine’s answer exactly', () => {
    const q = { ...base, capacity: 1, bufferAfter: 10, busy: [{ start: R('08:30'), end: R('09:00') }] };
    const free = findFree({ ...q, capacity: undefined } as never);
    expect(findSlots(q).slots.map((s) => s.start.toString())).toEqual(free.slots.map((s) => s.start.toString()));
  });

  it('bad input never throws: a bad capacity refuses the query, a bad seats count is a warning', () => {
    expect(findSlots({ ...base, capacity: 0 }).problems.map((p) => [p.code, p.severity, p.path])).toEqual([['invalid-slot-query', 'error', 'capacity']]);
    expect(checkSlot({ ...base, capacity: 1.5 }, R('08:00'))).toMatchObject({ ok: false, reason: 'invalid-query' });
    const r = findSlots({ ...base, busy: [{ start: R('08:00'), end: R('08:30'), seats: -1 }] });
    expect([r.problems.map((p) => [p.severity, p.path]), shown(r)[0]]).toEqual([[['warning', 'busy[0].seats']], '08:00:1']);
    for (const junk of [null, undefined, 42, { capacity: 'x' }]) expect(() => findSlots(junk as never)).not.toThrow();
  });
});

describe('seats, on random queries over the project’s zones (seeded)', () => {
  const ZONES = ['Europe/Paris', 'America/Chicago', 'Australia/Lord_Howe', 'America/Sao_Paulo', 'America/Havana', 'Pacific/Apia', 'Asia/Kolkata', 'Europe/Dublin', 'UTC'];
  let seed = 42;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const query = (): SeatsQuery => {
    const zone = pick(ZONES);
    const open = 6 * 60 + Math.floor(rnd() * 8) * 30;
    const day = Temporal.PlainDate.from(pick(['2026-10-23', '2026-10-24', '2026-10-25', '2026-03-28', '2026-03-29', '2026-04-05', '2026-10-04']));
    const at = (d: number, m: number) => Temporal.ZonedDateTime.from({ year: day.year, month: day.month, day: day.day, hour: 0, timeZone: zone }).add({ days: d, minutes: m });
    const busy = Array.from({ length: Math.floor(rnd() * 8) }, () => {
      const s = at(Math.floor(rnd() * 2), open + Math.floor(rnd() * 16) * 15);
      return { start: s, end: s.add({ minutes: 15 + Math.floor(rnd() * 4) * 15 }), ...(rnd() < 0.2 && { kind: 'block' as const }), ...(rnd() < 0.3 && { seats: 1 + Math.floor(rnd() * 3) }) };
    });
    return {
      availability: { timeZone: zone, weekly: [{ days: [1, 2, 3, 4, 5, 6, 7], from: hm(open), to: hm(Math.min(1440, open + 6 * 60)) }] },
      from: at(0, 0),
      to: at(2, 0),
      duration: pick([15, 30, 45]),
      ...(rnd() < 0.5 && { bufferAfter: pick([0, 5, 10]) }),
      ...(rnd() < 0.3 && { bufferBefore: 5 }),
      ...(rnd() < 0.3 && { maxPerDay: 1 + Math.floor(rnd() * 4) }),
      capacity: 1 + Math.floor(rnd() * 3),
      busy,
    };
  };

  it('capacity 1, no seats: the free engine’s slots exactly', () => {
    for (let i = 0; i < 200; i++) {
      const q = { ...query(), capacity: 1 };
      const plain = { ...q, busy: (q.busy ?? []).map(({ seats: _s, ...b }) => b) };
      const free = findFree(plain as never).slots.map((s) => s.start.toString());
      expect(findSlots(plain).slots.map((s) => s.start.toString())).toEqual(free);
    }
  });

  it('checkSlot accepts exactly what findSlots offers (every quarter of two days, 30 queries)', () => {
    for (let i = 0; i < 30; i++) {
      const q = query();
      const offered = new Set(findSlots(q).slots.map((s) => s.start.toString()));
      // Every quarter of the two days: offered ones are ok, the others refused.
      const from = Temporal.ZonedDateTime.from(q.from as string);
      for (let m = 0; m < 2 * 1440; m += 15) {
        const t = from.add({ minutes: m });
        const r = checkSlot(q, t);
        expect([t.toString(), r.ok]).toEqual([t.toString(), offered.has(t.toString())]);
      }
    }
  });

  it('a bad maxPerDay or buffer is refused, as the free engine refuses it (not read as nothing)', () => {
    for (const [k, v] of [['maxPerDay', 'x'], ['maxPerDay', 1.5], ['maxPerDay', -1], ['bufferAfter', -5], ['bufferBefore', 'ten']] as const) {
      expect(findSlots({ ...base, [k]: v } as never).problems.map((p) => [p.severity, p.path])).toEqual([['error', k]]);
    }
  });

  it('seatedBusyFromEvents: a timed event’s extendedProps.seats is its seats; all-day events block', async () => {
    const { normalizeMany, createIdGenerator } = await import('@dzcalendar/core');
    const items = normalizeMany(
      [
        { id: 'g', start: R('08:00'), end: R('08:30'), extendedProps: { seats: 2 } },
        { id: 'h', start: '2026-10-22', allDay: true },
      ],
      { displayZone: 'Asia/Riyadh', newId: createIdGenerator('x') },
    ).items.map((i) => (i.kind === 'event' ? i.event : i.series.base));
    const { seatedBusyFromEvents } = await import('../src/slots-entry.js');
    const busy = seatedBusyFromEvents(items, 'Asia/Riyadh');
    expect(busy.map((b) => [b.kind ?? 'booking', b.seats ?? 1])).toEqual([['booking', 2], ['block', 1]]);
    expect(checkSlot({ ...base, busy }, R('08:00'))).toEqual({ ok: false, reason: 'full' });
  });
});

describe('after the 16a code review', () => {
  it('a busy that is not a list refuses the query; an unreadable entry is a warning at its own place', () => {
    expect(findSlots({ ...base, busy: 'x' as never }).problems.map((p) => [p.severity, p.path])).toEqual([['error', 'busy']]);
    const r = findSlots({ ...base, busy: [{ start: R('08:00'), end: R('08:30') }, { start: 'nope', end: R('09:00') }, null as never] });
    expect(r.problems.map((p) => [p.severity, p.path])).toEqual([
      ['warning', 'busy[1]'],
      ['warning', 'busy[2]'],
    ]);
  });
});

describe('seats per resource', () => {
  it('a room of three: its capacity, and only the bookings that carry it', async () => {
    const { buildResourceTree, normalizeMany, createIdGenerator } = await import('@dzcalendar/core');
    const { resourceSeats } = await import('../src/slots-entry.js');
    const { tree } = buildResourceTree([{ id: 'r1', title: 'Salle 1', extendedProps: { capacity: 3 } }, { id: 'r2', title: 'Salle 2' }, { id: 'r3', title: 'Salle 3', extendedProps: { capacity: 'x' } }]);
    const events = normalizeMany(
      [
        { id: 'a', start: R('08:00'), end: R('08:30'), resourceId: 'r1', extendedProps: { seats: 2 } },
        { id: 'b', start: R('08:00'), end: R('08:30'), resourceId: 'r2' },
        { id: 'c', start: R('08:00'), end: R('08:30'), resourceId: 'r1' },
      ],
      { displayZone: 'Asia/Riyadh', newId: createIdGenerator('x') },
    ).items.flatMap((i) => (i.kind === 'event' ? [i.event] : []));
    const room = (id: string) => tree.byId.get(id)!.resource;
    const r1 = resourceSeats(room('r1'), events, 'Asia/Riyadh');
    expect([r1.capacity, r1.busy.length]).toEqual([3, 2]);
    // Three seats, three taken at 08:00 (2 + 1): full.
    expect(checkSlot({ ...base, ...r1 }, R('08:00'))).toEqual({ ok: false, reason: 'full' });
    // Salle 2: no capacity given, one seat, its one booking.
    expect(checkSlot({ ...base, ...resourceSeats(room('r2'), events, 'Asia/Riyadh') }, R('08:00'))).toEqual({ ok: false, reason: 'full' });
    // A capacity that is not a number: refused by findSlots, as a Problem.
    expect(findSlots({ ...base, ...resourceSeats(room('r3'), events, 'Asia/Riyadh') }).problems.map((p) => p.path)).toEqual(['capacity']);
  });
});
