import { describe, it, expect } from 'vitest';
import { Temporal, buildResourceTree, computeViewRange, createEventStore, createIdGenerator, createKernel, flattenRows, normalizeMany, UNASSIGNED, UNASSIGNED_RESOURCE } from '@dzcalendar/core';
import type { EventInput, ResourceRow } from '@dzcalendar/core';
import { buildTimelineAxis, buildTimelineModel, updateTimelineModel, TIMELINE_VIEWS } from '../src/model-entry.js';
import type { TimelineModel } from '../src/model-entry.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const nav = { firstDay: 1 as const, today: d('2026-10-21') };
const range = (type: string, at: string) => computeViewRange(d(at), TIMELINE_VIEWS[type]!, nav);
const label = (s: { time: { toString(): string } | null; date: { toString(): string }; offset: string; pass: string | null }) =>
  `${s.time ? s.time.toString().slice(0, 5) : s.date.toString()}${s.pass === 'second' ? '*' : ''}${s.offset}`;

describe('timeline axis: elapsed, cut on the wall clock', () => {
  it('Paris, 25 October 2026 (fall back at 03:00 to 02:00): 50 half hours, 02:00 and 02:30 twice', () => {
    const a = buildTimelineAxis(range('timelineDay', '2026-10-25'), 'Europe/Paris');
    expect([a.unit, a.slotMinutes, a.slots.length, a.length]).toEqual(['time', 30, 50, 50]);
    expect(a.slots.slice(3, 9).map(label)).toEqual(['01:30+02:00', '02:00+02:00', '02:30+02:00', '02:00*+01:00', '02:30*+01:00', '03:00+01:00']);
    expect(a.slots[4]!.pass).toBe('first');
    // Every slot is 30 real minutes: the second 02:00 starts an hour after the first.
    expect(a.slots[6]!.start.epochMilliseconds - a.slots[4]!.start.epochMilliseconds).toBe(3_600_000);
  });

  it('Paris, 29 March 2026 (02:00 becomes 03:00): 46 half hours, 01:30 is followed by 03:00', () => {
    const a = buildTimelineAxis(range('timelineDay', '2026-03-29'), 'Europe/Paris');
    expect([a.slots.length, a.length]).toEqual([46, 46]);
    expect(a.slots.slice(2, 5).map(label)).toEqual(['01:00+01:00', '01:30+01:00', '03:00+02:00']);
    expect(a.slots[3]!.end.toString()).toBe('2026-03-29T01:00:00Z');
  });

  it('a week of hours: 24, 24, … and 25 on the Sunday the clocks fall back — 169 hours wide', () => {
    const a = buildTimelineAxis(range('timelineWeek', '2026-10-21'), 'Europe/Paris');
    expect([a.slotMinutes, a.groups.map((g) => g.lengthMinutes / 60), a.length]).toEqual([60, [24, 24, 24, 24, 24, 24, 25], 169]);
    // Sunday starts 144 hours in; its 25 hours run to 169.
    expect([a.toPosition(a.groups[6]!.start), a.toPosition(a.groups[6]!.end)]).toEqual([144, 169]);
  });

  it('Lord Howe: spring skips half an hour (47 slots), autumn repeats one (49, 01:30 twice)', () => {
    // 4 October 2026: 02:00 (+10:30) becomes 02:30 (+11:00).
    const spring = buildTimelineAxis(range('timelineDay', '2026-10-04'), 'Australia/Lord_Howe');
    expect([spring.slots.length, spring.groups[0]!.lengthMinutes]).toEqual([47, 1410]);
    expect(spring.slots.slice(3, 5).map(label)).toEqual(['01:30+10:30', '02:30+11:00']);
    // 5 April 2026: 02:00 (+11:00) becomes 01:30 (+10:30).
    const autumn = buildTimelineAxis(range('timelineDay', '2026-04-05'), 'Australia/Lord_Howe');
    expect([autumn.slots.length, autumn.groups[0]!.lengthMinutes]).toEqual([49, 1470]);
    expect(autumn.slots.slice(2, 6).map(label)).toEqual(['01:00+11:00', '01:30+11:00', '01:30*+10:30', '02:00+10:30']);
  });

  it('São Paulo, 4 November 2018: the day starts at 01:00 (midnight skipped), 23 hours', () => {
    const a = buildTimelineAxis(range('timelineDay', '2018-11-04'), 'America/Sao_Paulo', { slot: 60 });
    expect([a.slots.length, label(a.slots[0]!), a.slots[0]!.start.toString()]).toEqual([23, '01:00-02:00', '2018-11-04T03:00:00Z']);
  });

  it('Kolkata: no clock change, 48 half hours at +05:30', () => {
    const a = buildTimelineAxis(range('timelineDay', '2026-10-25'), 'Asia/Kolkata');
    expect([a.slots.length, a.slots[0]!.offset]).toEqual([48, '+05:30']);
  });

  it('a month of days: each as wide as its hours (25 October is 25/24 of a day), months above', () => {
    const a = buildTimelineAxis(range('timelineMonth', '2026-10-21'), 'Europe/Paris');
    expect([a.unit, a.slotMinutes, a.slots.length, a.groups.length]).toEqual(['day', 1440, 31, 1]);
    const sunday = a.slots[24]!;
    expect(sunday.date.toString()).toBe('2026-10-25');
    expect(a.toPosition(sunday.end) - a.toPosition(sunday.start)).toBeCloseTo(25 / 24, 9);
    expect(a.length).toBeCloseTo(31 + 1 / 24, 9);
  });

  it('positions: clamped, back and forth; the slot of an instant', () => {
    const a = buildTimelineAxis(range('timelineDay', '2026-10-25'), 'Europe/Paris');
    const second0200 = Temporal.Instant.from('2026-10-25T01:00:00Z');
    expect([a.toPosition(second0200), a.slotAt(second0200), a.fromPosition(6).toString()]).toEqual([6, 6, '2026-10-25T01:00:00Z']);
    expect([a.toPosition(Temporal.Instant.from('2026-10-20T00:00:00Z')), a.toPosition(Temporal.Instant.from('2026-11-20T00:00:00Z')), a.slotAt(Temporal.Instant.from('2026-11-20T00:00:00Z'))]).toEqual([0, 50, -1]);
  });

  it('a slot length that does not divide a day falls back to the default', () => {
    expect(buildTimelineAxis(range('timelineDay', '2026-10-21'), 'UTC', { slot: 7 }).slotMinutes).toBe(30);
    expect(buildTimelineAxis(range('timelineWeek', '2026-10-21'), 'UTC', { slot: 'day' }).slots.length).toBe(7);
  });
});

const PARIS = 'Europe/Paris';
const storeWith = (inputs: EventInput[]) => {
  const s = createEventStore();
  s.replaceSourceChunk('t', 'all', normalizeMany(inputs, { displayZone: PARIS, newId: createIdGenerator('t') }, 't').items);
  return s;
};
const tree = buildResourceTree([
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B', timeZone: 'Asia/Riyadh', businessHours: { daysOfWeek: [7, 1, 2, 3, 4], start: '08:00', end: '12:00' } },
]).tree;
const rows = (extra: ResourceRow[] = []) => [...extra, ...flattenRows(tree)];

describe('timeline model', () => {
  it('a row per resource; an event at its true place and length; lanes for overlaps', () => {
    const store = storeWith([
      { id: 'x', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 2 }, resourceId: 'a' },
      { id: 'y', start: '2026-10-21T10:00[Europe/Paris]', duration: { hours: 1 }, resourceId: 'a' },
      { id: 'z', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 30 }, resourceId: 'b' },
    ]);
    const m = buildTimelineModel(range('resourceTimelineDay', '2026-10-21'), store.snapshot, { displayZone: PARIS, rows: rows(), resources: tree.order });
    const row = m.rows[0]!;
    if (row.kind !== 'resource') throw new Error('row');
    // 09:00 is 18 half hours in, two hours wide (4 slots); y beside it on the second lane.
    expect(row.events.map((e) => [e.segment.instance.key, e.from, e.to, e.lane])).toEqual([
      ['x', 18, 22, 0],
      ['y', 20, 22, 1],
    ]);
    expect(row.lanes).toBe(2);
  });

  it('past maxLanes the last lane is "+N", one per stretch', () => {
    const store = storeWith(
      ['09:00', '09:00', '09:00', '09:00', '14:00'].map((t, i) => ({ id: `e${i}`, start: `2026-10-21T${t}[Europe/Paris]`, duration: { hours: 1 }, resourceId: 'a' })),
    );
    const m = buildTimelineModel(range('resourceTimelineDay', '2026-10-21'), store.snapshot, { displayZone: PARIS, rows: rows(), resources: tree.order, maxLanes: 3 });
    const row = m.rows[0]!;
    if (row.kind !== 'resource') throw new Error('row');
    // Lanes 0 and 1 drawn; the two others of 09:00 behind one link; 14:00 alone in lane 0.
    expect(row.events.map((e) => [e.segment.instance.key, e.lane])).toEqual([
      ['e0', 0],
      ['e1', 1],
      ['e4', 0],
    ]);
    expect(row.more.map((x) => [x.from, x.to, x.events.map((e) => e.segment.instance.key)])).toEqual([[18, 20, ['e2', 'e3']]]);
    expect(row.lanes).toBe(3);
  });

  it("a resource's hours are shaded in its zone; an all-day event spans its dates in the calendar's zone", () => {
    const store = storeWith([{ id: 'off', start: '2026-10-21', allDay: true, resourceId: 'b' }]);
    const m = buildTimelineModel(range('resourceTimelineDay', '2026-10-21'), store.snapshot, { displayZone: PARIS, rows: rows(), resources: tree.order });
    const b = m.rows[1]!;
    if (b.kind !== 'resource') throw new Error('row');
    // Riyadh 08:00–12:00 is 07:00–11:00 in Paris (UTC+2 that day): shaded before 14 slots and from 22.
    expect(b.offHours).toEqual([
      { from: 0, to: 14 },
      { from: 22, to: 48 },
    ]);
    expect(b.events.map((e) => [e.from, e.to])).toEqual([[0, 48]]);
  });

  it('"Unassigned": events on no resource or an unknown one; groups pass through', () => {
    const store = storeWith([
      { id: 'none', start: '2026-10-21T09:00[Europe/Paris]' },
      { id: 'ghost', start: '2026-10-21T10:00[Europe/Paris]', resourceId: 'zz' },
      { id: 'mine', start: '2026-10-21T11:00[Europe/Paris]', resourceIds: ['zz', 'a'] },
    ]);
    const un: ResourceRow = { kind: 'resource', resource: UNASSIGNED_RESOURCE, depth: 0, expanded: null, rowKey: 'r:un' };
    const m = buildTimelineModel(range('resourceTimelineDay', '2026-10-21'), store.snapshot, { displayZone: PARIS, rows: rows([un]), resources: tree.order });
    const first = m.rows[0]!;
    if (first.kind !== 'resource') throw new Error('row');
    expect([first.resource.id === UNASSIGNED, first.events.map((e) => e.segment.instance.key)]).toEqual([true, ['none', 'ghost']]);
  });

  it('without resources: one row of every event, with its own lane count', () => {
    const store = storeWith([{ id: 'x', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'a' }, { id: 'y', start: '2026-10-21T09:00[Europe/Paris]' }]);
    const m = buildTimelineModel(range('timelineDay', '2026-10-21'), store.snapshot, { displayZone: PARIS, fillLanes: 5 });
    expect([m.rows.length, m.rows[0]!.kind, m.maxLanes, m.rows[0]!.kind === 'all' ? m.rows[0]!.events.length : 0]).toEqual([1, 'all', 5, 2]);
  });

  it('an update rebuilds only the rows of the resources an event left or joined', () => {
    const store = storeWith([
      { id: 'x', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'a' },
      { id: 'y', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'b' },
    ]);
    const m = buildTimelineModel(range('resourceTimelineDay', '2026-10-21'), store.snapshot, { displayZone: PARIS, rows: rows(), resources: tree.order });
    const before = store.snapshot.getEvent('x')!;
    const change = store.apply([{ kind: 'event', before, after: { ...before, start: before.start, resourceIds: ['a'], title: 'moved' } as typeof before }], 'api');
    const next = updateTimelineModel(m, store.snapshot, change) as TimelineModel;
    expect([next.rows[0] === m.rows[0], next.rows[1] === m.rows[1], next.axis === m.axis]).toEqual([false, true, true]);
  });
});

describe('timeline in the kernel', () => {
  const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
  it('the eight views are known to every kernel; rows follow the tree, its collapsed state and "Unassigned"', () => {
    const k = createKernel({
      timeZone: PARIS,
      locale: 'fr-FR',
      now,
      initialView: 'resourceTimelineWeek',
      resources: [{ id: 'dep' }, { id: 'a', parentId: 'dep' }, { id: 'b', parentId: 'dep' }],
    });
    expect(Object.keys(TIMELINE_VIEWS).every((t) => k.getViewSpec(t)?.family === 'timeline')).toBe(true);
    const keys = () => (k.viewModel().model as TimelineModel).rows.map((r) => (r.kind === 'resource' ? r.resource.id.replace(UNASSIGNED, 'UN') : r.key));
    expect(keys()).toEqual(['dep', 'a', 'b']);
    k.setOptions({ collapsedResources: ['dep'], showUnassigned: true });
    expect(keys()).toEqual(['UN', 'dep']);
    expect((k.viewModel().model as TimelineModel).axis.slotMinutes).toBe(60);
    k.setOptions({ timeline: { slot: 'day' } });
    expect((k.viewModel().model as TimelineModel).axis.unit).toBe('day');
  });
});
