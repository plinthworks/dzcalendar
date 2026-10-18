import { describe, it, expect } from 'vitest';
import { Temporal, normalizeEvent, createIdGenerator } from '@dzcalendar/core';
import { busyFromEvents, checkSlot, findSlots } from '@dzcalendar/slots';
import type { SlotQuery } from '@dzcalendar/slots';
import type { Weekday } from '@dzcalendar/core';

const Z = 'Asia/Riyadh';
const at = (s: string) => Temporal.ZonedDateTime.from(`${s}[${Z}]`);

describe('the case of the forum thread: only the free slots, in ten lines', () => {
  it('client and server share one query; the server refuses what the page would not offer', () => {
    // ── the ten lines (docs/slots.md) ──
    const rules = { availability: { timeZone: Z, weekly: [{ days: [7, 1, 2, 3, 4] as Weekday[], from: '08:00', to: '12:00' }] }, duration: 30 };
    const booked = [{ start: '2026-10-21T09:00+03:00[Asia/Riyadh]', end: '2026-10-21T09:30+03:00[Asia/Riyadh]' }];
    const { slots } = findSlots({ ...rules, from: '2026-10-21T00:00+03:00[Asia/Riyadh]', to: '2026-10-22T00:00+03:00[Asia/Riyadh]', busy: booked }); // the page
    const ok = checkSlot({ ...rules, busy: booked }, slots[0]!.start); // the server, before saving: no range needed
    // ── end ──
    expect(slots.map((s) => s.start.toPlainTime().toString({ smallestUnit: 'minute' }))).toEqual(['08:00', '08:30', '09:30', '10:00', '10:30', '11:00', '11:30']);
    expect(ok.ok).toBe(true);
    expect(checkSlot({ ...rules, busy: booked }, '2026-10-21T09:00+03:00[Asia/Riyadh]')).toEqual({ ok: false, reason: 'busy' });
    // Every slot the page offers, the server accepts.
    expect(slots.every((x) => checkSlot({ ...rules, busy: booked }, x.start).ok)).toBe(true);
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

describe('review fixes (Phase 14)', () => {
  const av = { timeZone: Z, weekly: [{ days: [3] as const, from: '08:00', to: '12:00' }] } as unknown as SlotQuery['availability'];
  const q = (over: Record<string, unknown> = {}) => ({ availability: av, from: '2026-10-21T00:00+03:00[Asia/Riyadh]', to: '2026-10-22T00:00+03:00[Asia/Riyadh]', duration: 60, ...over }) as SlotQuery;

  it('nothing throws, whatever shape the input has (JSON from a database)', () => {
    const shapes: unknown[] = [
      null, 5, 'x', { availability: null },
      q({ maxAdvanceDays: 1.5, now: '2026-10-20T00:00Z' }), q({ maxAdvanceDays: 1e9, now: '2026-10-20T00:00Z' }),
      q({ duration: 1 / 7 }), q({ step: 1 / 7 }), q({ duration: -5 }), q({ duration: Infinity }), q({ duration: NaN }),
      q({ to: '+275760-09-13T00:00Z' }), q({ busy: 5 }), q({ busy: [null] }),
      q({ availability: { timeZone: Z, weekly: 'x' } }), q({ availability: { timeZone: Z, weekly: [null] } }),
      q({ availability: { timeZone: Z, exceptions: [null] } }), q({ availability: { timeZone: Z, exceptions: [{ date: 5 }] } }),
      q({ availability: { timeZone: Z, exceptions: [{ date: '2026-10-21', windows: 'x' }] } }),
      q({ availability: { timeZone: Z, rules: [null] } }), q({ availability: { timeZone: Z, rules: [{ from: '08:00', to: '09:00', start: '2026-10-01' }] } }),
      q({ availability: { timeZone: Z, rules: [{ rrule: 'FREQ=DAILY', from: '08:00', to: '09:00', start: '2026-10-01', exdates: '2026-10-19' }] } }),
      q({ availability: { timeZone: Z, weekly: [{ days: [3], from: 8, to: {} }] } }),
    ];
    for (const s of shapes) {
      expect(() => findSlots(s as SlotQuery)).not.toThrow();
      expect(() => checkSlot(s as SlotQuery, '2026-10-21T09:00+03:00[Asia/Riyadh]')).not.toThrow();
    }
  });

  it('refuses what Temporal cannot count: a step under a minute, fractional days or caps', () => {
    for (const bad of [{ step: 0.5 }, { duration: 0.2 }, { maxAdvanceDays: 1.5, now: '2026-10-20T00:00Z' }, { maxPerDay: 2.5 }]) {
      expect(findSlots(q(bad)).problems.map((p) => p.code)).toContain('invalid-slot-query');
    }
  });

  it('a tiny step over a long range stops at 10 000 slots, with a warning, instead of hanging', () => {
    const r = findSlots({ availability: { timeZone: 'UTC', weekly: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '24:00' }] }, from: '2026-01-01T00:00Z', to: '2027-01-01T00:00Z', duration: 1 });
    expect(r.slots).toHaveLength(10_000);
    expect(r.problems.map((p) => p.code)).toContain('too-many-occurrences');
  });

  it('checkSlot says why a query is invalid, and refuses a start between milliseconds', () => {
    const r = checkSlot({ ...q(), availability: { timeZone: 'Mars/Olympus' } } as SlotQuery, '2026-10-21T09:00+03:00[Asia/Riyadh]');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems?.map((p) => p.code)).toEqual(['unknown-zone']);
    expect(checkSlot(q(), '2026-10-21T09:00:00.0005+03:00[Asia/Riyadh]')).toEqual({ ok: false, reason: 'misaligned' });
  });
});
