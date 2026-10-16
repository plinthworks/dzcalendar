import { describe, it, expect } from 'vitest';
import {
  Temporal,
  buildColumnAxis,
  createIdGenerator,
  dateIndex,
  dayInfos,
  normalizeEvent,
  segmentAllDay,
  segmentTimed,
  splitByWeek,
} from '../src/index.js';
import type { EventInput, EventInstance } from '../src/index.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const inst = (input: EventInput): EventInstance => {
  const r = normalizeEvent({ id: 'e', ...input }, { displayZone: 'Europe/Paris', newId: createIdGenerator('p') });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return { key: r.value.event.id, event: r.value.event, origin: 'single' };
};
const iso = (x: { toString(): string }) => x.toString();

describe('segmentTimed on real days', () => {
  it('a night across the 25-hour Sunday in Paris: three slices, the middle one 25 hours', () => {
    const days = dayInfos(d('2026-10-24'), 3, 'Europe/Paris');
    const segs = segmentTimed(inst({ start: '2026-10-24T20:00[Europe/Paris]', end: '2026-10-26T08:00[Europe/Paris]' }), days);
    expect(segs.map((s) => s.dayIndex)).toEqual([0, 1, 2]);
    expect(segs.map((s) => (s.to.epochMilliseconds - s.from.epochMilliseconds) / 3_600_000)).toEqual([4, 25, 8]);
    expect(segs.map((s) => [s.startsHere, s.endsHere])).toEqual([[true, false], [false, false], [false, true]]);
  });

  it('an event ending exactly at midnight is not on the next day; a milestone at midnight is', () => {
    const days = dayInfos(d('2026-05-01'), 2, 'UTC');
    expect(segmentTimed(inst({ start: '2026-05-01T22:00[UTC]', end: '2026-05-02T00:00[UTC]' }), days).map((s) => s.dayIndex)).toEqual([0]);
    expect(segmentTimed(inst({ start: '2026-05-02T00:00[UTC]', end: '2026-05-02T00:00[UTC]' }), days).map((s) => s.dayIndex)).toEqual([1]);
  });

  it('a Tokyo event lands on the display zone’s day', () => {
    const days = dayInfos(d('2026-05-01'), 2, 'Europe/Paris');
    // 05:00 Tokyo on the 2nd is 22:00 Paris on the 1st.
    expect(segmentTimed(inst({ start: '2026-05-02T05:00[Asia/Tokyo]' }), days).map((s) => s.dayIndex)).toEqual([0]);
  });

  it('a skipped day gets no slice (Apia, 30 December 2011)', () => {
    const days = dayInfos(d('2011-12-29'), 3, 'Pacific/Apia');
    const segs = segmentTimed(inst({ start: '2011-12-29T20:00[Pacific/Apia]', end: '2011-12-31T04:00[Pacific/Apia]' }), days);
    expect(segs.map((s) => s.dayIndex)).toEqual([0, 2]);
  });

  it('cutAtRepeat splits a slice at the fall-back, so each part reads the right way up', () => {
    const days = dayInfos(d('2026-10-25'), 1, 'Europe/Paris');
    const ev = inst({ start: '2026-10-25T02:50+02:00[Europe/Paris]', end: '2026-10-25T02:10+01:00[Europe/Paris]' });
    expect(segmentTimed(ev, days)).toHaveLength(1);
    const parts = segmentTimed(ev, days, { cutAtRepeat: true });
    expect(parts.map((p) => [p.part, p.startsHere, p.endsHere])).toEqual([[0, true, false], [1, false, true]]);
    expect(parts.map((p) => p.key)).toEqual(['e|0|0', 'e|0|1']);
  });
});

describe('segmentAllDay and splitByWeek', () => {
  const week = [d('2026-05-04'), d('2026-05-05'), d('2026-05-06'), d('2026-05-07'), d('2026-05-08')]; // weekend hidden

  it('a bar across a hidden weekend is cut in two', () => {
    const view = dateIndex([...week, d('2026-05-11'), d('2026-05-12')]);
    const segs = segmentAllDay(inst({ start: '2026-05-07', end: '2026-05-12' }), view);
    expect(segs.map((s) => [s.dayIndex, s.dayCount, s.startsHere, s.endsHere])).toEqual([[3, 2, true, false], [5, 1, false, true]]);
  });

  it('clipped to the view: neither end rounded when the event runs past both', () => {
    const segs = segmentAllDay(inst({ start: '2026-05-01', end: '2026-05-20' }), dateIndex(week));
    expect(segs.map((s) => [s.dayIndex, s.dayCount, s.startsHere, s.endsHere])).toEqual([[0, 5, false, false]]);
  });

  it('splitByWeek cuts a bar at each row end', () => {
    const view = dateIndex(Array.from({ length: 14 }, (_, i) => d('2026-05-04').add({ days: i })));
    const segs = segmentAllDay(inst({ start: '2026-05-09', end: '2026-05-13' }), view);
    const rows = splitByWeek(segs, [[0, 1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12, 13]]);
    expect(rows.map((r) => r.map((s) => [s.dayIndex, s.dayCount, s.startsHere, s.endsHere]))).toEqual([[[5, 2, true, false]], [[7, 2, false, true]]]);
  });
});

describe('buildColumnAxis', () => {
  it('wall, spring forward in Paris: a gap band 02:00–03:00, positions are clock minutes', () => {
    const axis = buildColumnAxis(d('2026-03-29'), 'Europe/Paris');
    expect(axis.length).toBe(1440);
    expect(axis.bands.map((b) => [b.kind, b.from, b.to])).toEqual([['gap', 120, 180]]);
    expect(axis.toPosition(Temporal.Instant.from('2026-03-29T01:00:00Z'))).toBe(180); // 03:00 CEST
    const at = axis.fromPosition(150);
    expect([at.exists, iso(at.instant)]).toEqual([false, '2026-03-29T01:30:00Z']); // pushed to 03:30
    expect(axis.ticks(60).find((t) => t.position === 120)).toMatchObject({ note: 'skipped', instant: null });
  });

  it('wall, fall back: both 02:30s share a position, the band is marked', () => {
    const axis = buildColumnAxis(d('2026-10-25'), 'Europe/Paris');
    expect(axis.bands.map((b) => [b.kind, b.from, b.to])).toEqual([['repeat', 120, 180]]);
    expect(axis.toPosition(Temporal.Instant.from('2026-10-25T00:30:00Z'))).toBe(150);
    expect(axis.toPosition(Temporal.Instant.from('2026-10-25T01:30:00Z'))).toBe(150);
    const first = axis.fromPosition(150);
    const second = axis.fromPosition(150, { prefer: 'later' });
    expect([iso(first.instant), iso(second.instant), first.ambiguous]).toEqual(['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', true]);
    expect(iso(axis.fromPosition(150, { prefer: { offset: '+01:00' } }).instant)).toBe('2026-10-25T01:30:00Z');
    expect(axis.toPosition(axis.day.end)).toBe(1440);
  });

  it('elapsed, fall back: a 25-hour column, the second pass marked', () => {
    const axis = buildColumnAxis(d('2026-10-25'), 'Europe/Paris', { mode: 'elapsed' });
    expect(axis.length).toBe(1500);
    expect(axis.bands.map((b) => [b.kind, b.from, b.to])).toEqual([['repeat', 180, 240]]);
    const ticks = axis.ticks(60);
    expect(ticks).toHaveLength(26);
    expect(ticks.slice(2, 5).map((t) => [t.label.toString(), t.note])).toEqual([['02:00:00', 'first-pass'], ['02:00:00', 'second-pass'], ['03:00:00', undefined]]);
  });

  it('Lord Howe: half-hour bands', () => {
    expect(buildColumnAxis(d('2026-10-04'), 'Australia/Lord_Howe').bands.map((b) => [b.kind, b.from, b.to])).toEqual([['gap', 120, 150]]);
    expect(buildColumnAxis(d('2026-04-05'), 'Australia/Lord_Howe').bands.map((b) => [b.kind, b.from, b.to])).toEqual([['repeat', 90, 120]]);
  });

  it('Havana: the missing midnight hour is a band at the top', () => {
    expect(buildColumnAxis(d('2023-03-12'), 'America/Havana').bands.map((b) => [b.kind, b.from, b.to])).toEqual([['gap', 0, 60]]);
  });

  it('Apia: a skipped day has an empty axis', () => {
    const axis = buildColumnAxis(d('2011-12-30'), 'Pacific/Apia');
    expect([axis.length, axis.ticks(60)]).toEqual([0, []]);
  });

  it('slotMin and slotMax: 08:00 to 20:00, start and end of the axis', () => {
    const axis = buildColumnAxis(d('2026-05-01'), 'UTC', { slotMin: 'PT8H', slotMax: 'PT20H' });
    expect([axis.length, iso(axis.start), iso(axis.end)]).toEqual([720, '2026-05-01T08:00:00Z', '2026-05-01T20:00:00Z']);
    expect(axis.toPosition(Temporal.Instant.from('2026-05-01T09:30:00Z'))).toBe(90);
  });

  it('a tick step of zero or less is refused instead of looping forever', () => {
    const axis = buildColumnAxis(d('2026-10-21'), 'Europe/Paris');
    expect(() => axis.ticks(0)).toThrow(RangeError);
    expect(() => buildColumnAxis(d('2026-10-21'), 'Europe/Paris', { mode: 'elapsed' }).ticks(-5)).toThrow(RangeError);
  });

  it('refuses slotMax beyond 24 hours and empty ranges, rather than draw them half right', () => {
    expect(() => buildColumnAxis(d('2026-05-01'), 'UTC', { slotMax: 'PT30H' })).toThrow(RangeError);
    expect(() => buildColumnAxis(d('2026-05-01'), 'UTC', { slotMin: 'PT10H', slotMax: 'PT10H' })).toThrow(RangeError);
  });

  it('elapsed axis starting after the fall-back: no phantom band at the top', () => {
    const axis = buildColumnAxis(d('2026-10-25'), 'Europe/Paris', { mode: 'elapsed', slotMin: 'PT6H' });
    expect(axis.bands).toEqual([]);
  });

  it('toEndPosition: an end at the fall-back closes the first pass; in the second pass it is its clock time', () => {
    const axis = buildColumnAxis(d('2026-10-25'), 'Europe/Paris');
    expect(axis.toEndPosition(Temporal.Instant.from('2026-10-25T01:00:00Z'))).toBe(180); // 03:00 first pass
    expect(axis.toPosition(Temporal.Instant.from('2026-10-25T01:00:00Z'))).toBe(120); // 02:00 second pass
    expect(axis.toEndPosition(Temporal.Instant.from('2026-10-25T01:10:00Z'))).toBe(130);
    expect(axis.toEndPosition(axis.day.end)).toBe(1440);
  });
});
