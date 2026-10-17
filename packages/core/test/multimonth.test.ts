import { describe, it, expect } from 'vitest';
import { BUILTIN_VIEWS, Temporal, computeViewRange, createEventStore, createIdGenerator, createKernel, normalizeMany } from '../src/index.js';
import { buildMultiMonthModel, updateMultiMonthModel } from '../src/views.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const nav = { firstDay: 1 as const, today: d('2026-10-21') };

describe('multi-month range', () => {
  it('a year is twelve month grids; the range runs from the first grid to the last', () => {
    const r = computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.multiMonthYear!, nav);
    expect(r.months!.map((m) => m.activeStart.toString().slice(0, 7))).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`));
    // January 2026 starts on a Thursday: its grid starts Monday 29 December 2025.
    expect(r.start.toString()).toBe('2025-12-29');
    // December 2026's six-week grid ends Sunday 10 January 2027 (exclusive end: the 11th).
    expect(r.end.toString()).toBe('2027-01-11');
    expect([r.activeStart.toString(), r.activeEnd.toString()]).toEqual(['2026-01-01', '2027-01-01']);
    expect(r.dates).toHaveLength(365);
  });

  it('a list month runs for its duration', () => {
    const spec = { ...BUILTIN_VIEWS.listMonth!, duration: { months: 2 } };
    const r = computeViewRange(d('2026-10-21'), spec, nav);
    expect([r.start.toString(), r.end.toString()]).toEqual(['2026-10-01', '2026-12-01']);
  });
});

describe('multi-month model', () => {
  const store = createEventStore();
  store.replaceSourceChunk(
    's',
    '*',
    normalizeMany(
      [
        { id: 'eve', start: '2026-10-31T20:00[Europe/Paris]', title: 'eve' },
        { id: 'nov', start: '2026-11-02T09:00[Europe/Paris]', title: 'nov' },
      ],
      { displayZone: 'Europe/Paris', newId: createIdGenerator('t') },
    ).items,
  );
  const range = computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.multiMonthYear!, nav);
  const model = buildMultiMonthModel(range, store.snapshot, { displayZone: 'Europe/Paris', maxLanes: 3 });
  const keysIn = (month: number) => model.months[month - 1]!.model.weeks.flatMap((w) => w.segments.map((s) => s.instance.event.id));

  it('each date’s events are drawn in its own month only, never in a neighbour’s padding', () => {
    expect(keysIn(10)).toEqual(['eve']);
    expect(keysIn(11)).toEqual(['nov']);
    // 2 November is padding at the end of October's grid; 31 October at the start of November's.
    expect(model.months[9]!.model.weeks.flatMap((w) => w.dates.map(String))).toContain('2026-11-02');
    expect(model.months[10]!.model.weeks.flatMap((w) => w.dates.map(String))).toContain('2026-10-31');
  });

  it('a change redraws the months it touches; the others keep their objects', () => {
    const change = store.apply([{ kind: 'event', before: store.snapshot.getEvent('nov')!, after: { ...store.snapshot.getEvent('nov')!, title: 'nov!' } }], 'api');
    const next = updateMultiMonthModel(model, store.snapshot, change);
    expect(next.months[0]).toBe(model.months[0]);
    expect(next.months[10]).not.toBe(model.months[10]);
  });
});

describe('hidden days for the whole calendar', () => {
  const k = () => createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', initialDate: d('2026-10-21'), initialView: 'dayGridMonth', hiddenDays: [6, 7], now: () => Temporal.Instant.from('2026-10-21T08:00:00Z') });

  it('every view leaves them out; a view naming its own keeps them', () => {
    const kernel = k();
    expect(kernel.getState().range.weeks[0]!.map((x) => x.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    kernel.setView('timeGridWeek');
    expect(kernel.getState().range.dates.map(String)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    const own = createKernel({ timeZone: 'UTC', locale: 'fr-FR', initialDate: d('2026-10-21'), hiddenDays: [6, 7], initialView: 'mine', views: { mine: { ...BUILTIN_VIEWS.timeGridWeek!, type: 'mine', hiddenDays: [3] } } });
    expect(own.getState().range.dates.map((x) => x.dayOfWeek)).toEqual([1, 2, 4, 5, 6, 7]);
  });

  it('setOptions changes them; the same list again says nothing; all seven are refused', () => {
    const kernel = k();
    const seen: string[] = [];
    kernel.subscribe((e) => e.type === 'state' && seen.push(...e.causes));
    kernel.setOptions({ hiddenDays: [7, 6] });
    expect(seen).toEqual([]);
    kernel.setOptions({ hiddenDays: [] });
    expect(seen).toEqual(['options']);
    expect(kernel.getState().range.weeks[0]).toHaveLength(7);
    expect(() => kernel.setOptions({ hiddenDays: [1, 2, 3, 4, 5, 6, 7] })).toThrow(RangeError);
  });

  it('the view spec in force keeps its identity while nothing changes', () => {
    const kernel = k();
    const a = kernel.getState().view;
    kernel.navigate('next');
    expect(kernel.getState().view).toBe(a);
  });
});
