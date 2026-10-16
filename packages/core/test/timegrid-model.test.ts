import { describe, it, expect } from 'vitest';
import {
  BUILTIN_VIEWS,
  Temporal,
  buildTimeGridModel,
  computeViewRange,
  createEventStore,
  createHistory,
  createIdGenerator,
  locateNow,
  normalizeMany,
  updateTimeGridModel,
} from '../src/index.js';
import type { EventInput } from '../src/index.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const nav = { firstDay: 1 as const, today: d('2026-10-21') };
const opts = { displayZone: 'Europe/Paris' };
const ctx = () => ({ normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('m') } });
const storeWith = (inputs: EventInput[]) => {
  const s = createEventStore();
  s.replaceSourceChunk('t', 'all', normalizeMany(inputs, ctx().normalize, 't').items);
  return s;
};

describe('readings on a day the clocks change', () => {
  it('the two 02:30s say which pass they are, the real length is given', () => {
    const store = storeWith([
      { id: 'first', start: '2026-10-25T02:30+02:00[Europe/Paris]', duration: { minutes: 30 } },
      { id: 'second', start: '2026-10-25T02:30+01:00[Europe/Paris]', duration: { minutes: 30 } },
      { id: 'across', start: '2026-10-25T01:30+02:00[Europe/Paris]', end: '2026-10-25T02:30+01:00[Europe/Paris]' },
    ]);
    const col = buildTimeGridModel(computeViewRange(d('2026-10-25'), BUILTIN_VIEWS.timeGridDay!, nav), store.snapshot, opts).columns[0]!;
    const byKey = (k: string) => col.events.filter((e) => e.segment.instance.key === k);
    expect(byKey('first')[0]!.startReading).toEqual({ offset: '+02:00', pass: 'first' });
    expect(byKey('second')[0]!.startReading).toEqual({ offset: '+01:00', pass: 'second' });
    // 01:30 (+02:00) to 02:30 (+01:00): two hours, drawn as two parts on the wall axis.
    expect(byKey('across').map((e) => e.realMinutes)).toEqual([120, 120]);
  });

  it('an ordinary day carries no readings at all', () => {
    const store = storeWith([{ id: 'a', start: '2026-10-21T09:00[Europe/Paris]' }]);
    const ev = buildTimeGridModel(computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.timeGridDay!, nav), store.snapshot, opts).columns[0]!.events[0]!;
    expect('startReading' in ev || 'realMinutes' in ev).toBe(false);
  });
});

describe('updateTimeGridModel', () => {
  it('rebuilds only the columns a change touches; the others keep their identity', () => {
    const store = storeWith([
      { id: 'mon', start: '2026-10-19T09:00[Europe/Paris]' },
      { id: 'wed', start: '2026-10-21T09:00[Europe/Paris]' },
    ]);
    const range = computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.timeGridWeek!, nav);
    const prev = buildTimeGridModel(range, store.snapshot, opts);
    const h = createHistory(store, ctx());
    const r = h.run({ type: 'event.update', id: 'wed', patch: { start: '2026-10-21T14:00[Europe/Paris]' } });
    const next = updateTimeGridModel(prev, store.snapshot, r.change!);
    expect(next.columns.map((c, i) => c === prev.columns[i])).toEqual([true, true, false, true, true, true, true]);
    expect(next.allDay).toBe(prev.allDay);
    expect(next.columns[2]!.events[0]!.top).toBe(840);
    // Same as a full rebuild.
    const full = buildTimeGridModel(range, store.snapshot, opts);
    expect(next.columns[2]!.events.map((e) => [e.segment.key, e.top, e.height])).toEqual(full.columns[2]!.events.map((e) => [e.segment.key, e.top, e.height]));
  });

  it('a change outside the view returns the same model object', () => {
    const store = storeWith([]);
    const prev = buildTimeGridModel(computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.timeGridWeek!, nav), store.snapshot, opts);
    const r = createHistory(store, ctx()).run({ type: 'event.create', event: { id: 'far', start: '2027-01-01T09:00[Europe/Paris]' } });
    const next = updateTimeGridModel(prev, store.snapshot, r.change!);
    expect(next.columns).toBe(prev.columns);
    expect(next.allDay).toBe(prev.allDay);
  });

  it('an all-day change rebuilds the all-day row and no column', () => {
    const store = storeWith([]);
    const prev = buildTimeGridModel(computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.timeGridWeek!, nav), store.snapshot, opts);
    const r = createHistory(store, ctx()).run({ type: 'event.create', event: { id: 'ad', start: '2026-10-22' } });
    const next = updateTimeGridModel(prev, store.snapshot, r.change!);
    expect(next.columns.every((c, i) => c === prev.columns[i])).toBe(true);
    expect(next.allDay.bars.map((b) => b.segment.instance.key)).toEqual(['ad']);
  });
});

describe('gutter and now', () => {
  it('the gutter comes from an ordinary day, even in the week of a clock change', () => {
    const model = buildTimeGridModel(computeViewRange(d('2026-10-25'), BUILTIN_VIEWS.timeGridWeek!, nav), createEventStore().snapshot, { ...opts, slotMinutes: 60 });
    expect(model.gutter).toHaveLength(25);
    expect(model.gutter.some((t) => t.note)).toBe(false);
  });

  it('locateNow finds the column and the position; outside the view, null', () => {
    const model = buildTimeGridModel(computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.timeGridWeek!, nav), createEventStore().snapshot, opts);
    expect(locateNow(model, Temporal.Instant.from('2026-10-21T08:15:00Z'))).toEqual({ column: 2, position: 615 });
    expect(locateNow(model, Temporal.Instant.from('2026-11-30T08:15:00Z'))).toBeNull();
  });
});
