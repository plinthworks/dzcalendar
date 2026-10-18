import { describe, it, expect } from 'vitest';
import { Temporal, normalizeEvent, createIdGenerator } from '@dzcalendar/core';
import { busyFromEvents, checkSlot, findSlots } from '@dzcalendar/slots';
import type { SlotQuery } from '@dzcalendar/slots';

const Z = 'Asia/Riyadh';
const at = (s: string) => Temporal.ZonedDateTime.from(`${s}[${Z}]`);

describe('the case of the forum thread: only the free slots, in ten lines', () => {
  it('client and server share one query; the server refuses what the page would not offer', () => {
    // ── the ten lines ──
    const query = (busy: SlotQuery['busy']): SlotQuery => ({
      availability: { timeZone: Z, weekly: [{ days: [7, 1, 2, 3, 4], from: '08:00', to: '12:00' }] },
      from: '2026-10-21T00:00+03:00[Asia/Riyadh]',
      to: '2026-10-22T00:00+03:00[Asia/Riyadh]',
      duration: 30,
      busy,
    });
    const booked = [{ start: '2026-10-21T09:00+03:00[Asia/Riyadh]', end: '2026-10-21T09:30+03:00[Asia/Riyadh]' }];
    const { slots } = findSlots(query(booked)); // the page shows these
    const ok = checkSlot(query(booked), slots[0]!.start); // the server, before saving
    // ── end ──
    expect(slots.map((s) => s.start.toPlainTime().toString({ smallestUnit: 'minute' }))).toEqual(['08:00', '08:30', '09:30', '10:00', '10:30', '11:00', '11:30']);
    expect(ok.ok).toBe(true);
    expect(checkSlot(query(booked), '2026-10-21T09:00+03:00[Asia/Riyadh]')).toEqual({ ok: false, reason: 'busy' });
  });
});

describe('slots', () => {
  it('a slot is in the provider’s zone and shows in the client’s by withTimeZone', () => {
    const { slots } = findSlots({
      availability: { timeZone: Z, weekly: [{ days: [3], from: '08:00', to: '09:00' }] },
      from: '2026-10-21T00:00Z',
      to: '2026-10-22T00:00Z',
      duration: 60,
    });
    expect(slots[0]!.start.toString()).toBe('2026-10-21T08:00:00+03:00[Asia/Riyadh]');
    // Paris is at +02:00 on 21 October 2026 (summer time until the 25th).
    expect(slots[0]!.start.withTimeZone('Europe/Paris').toString()).toBe('2026-10-21T07:00:00+02:00[Europe/Paris]');
  });

  it('accepts Instants, ZonedDateTimes and strings alike, and says where an input is wrong', () => {
    const r = findSlots({
      availability: { timeZone: Z, weekly: [{ days: [3], from: '08:00', to: '09:00' }], exceptions: [{ date: 'nope' }] },
      from: Temporal.Instant.from('2026-10-21T00:00Z'),
      to: at('2026-10-22T00:00'),
      duration: 60,
      busy: [{ start: 'x', end: 'y' }],
    });
    expect(r.slots).toHaveLength(1);
    expect(r.problems.map((p) => p.path)).toEqual(['busy[0]', 'availability.exceptions[0].date']);
  });

  it('never throws, whatever it is given', () => {
    expect(() => findSlots({} as SlotQuery)).not.toThrow();
    expect(() => checkSlot({} as SlotQuery, 'garbage')).not.toThrow();
    expect(findSlots({ availability: { timeZone: Z }, from: 'a', to: 'b', duration: 30 }).problems.map((p) => p.code)).toContain('invalid-slot-query');
    const bad = findSlots({ availability: { timeZone: Z, weekly: [{ days: [3], from: '8h', to: '9h' }] }, from: '2026-10-21T00:00Z', to: '2026-10-22T00:00Z', duration: 30 });
    expect(bad.problems.map((p) => p.code)).toContain('invalid-availability');
  });

  it('the calendar’s own events are busy time: timed ones are bookings, all-day ones block their dates', () => {
    const newId = createIdGenerator('s');
    const norm = (input: Parameters<typeof normalizeEvent>[0]) => {
      const r = normalizeEvent(input, { displayZone: Z, newId });
      if (!r.ok || r.value.kind !== 'event') throw new Error('event');
      return r.value.event;
    };
    const events = [
      norm({ id: 'a', start: '2026-10-21T09:00[Asia/Riyadh]', end: '2026-10-21T10:00[Asia/Riyadh]' }),
      norm({ id: 'b', start: '2026-10-22', allDay: true }),
      norm({ id: 'c', start: '2026-10-21T10:00[Asia/Riyadh]', end: '2026-10-21T11:00[Asia/Riyadh]', status: 'cancelled' }),
    ];
    const busy = busyFromEvents(events, Z);
    expect(busy).toHaveLength(2);
    const { slots } = findSlots({
      availability: { timeZone: Z, weekly: [{ days: [3, 4], from: '08:00', to: '12:00' }] },
      from: '2026-10-21T00:00+03:00[Asia/Riyadh]',
      to: '2026-10-23T00:00+03:00[Asia/Riyadh]',
      duration: 60,
      maxPerDay: 4,
      busy,
    });
    // Wednesday: 09:00 booked, the cancelled 10:00 free; Thursday: blocked all day.
    expect(slots.map((s) => s.start.toPlainDateTime().toString({ smallestUnit: 'minute' }))).toEqual(['2026-10-21T08:00', '2026-10-21T10:00', '2026-10-21T11:00']);
  });
});
