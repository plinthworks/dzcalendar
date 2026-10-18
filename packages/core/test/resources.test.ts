import { describe, it, expect } from 'vitest';
import {
  BUILTIN_VIEWS,
  Temporal,
  buildDayGridModel,
  buildResourceTree,
  buildTimeGridModel,
  computeViewRange,
  createEventStore,
  createIdGenerator,
  createKernel,
  flattenRows,
  normalizeMany,
  proposeMove,
  columnResources,
  updateTimeGridModel,
  validateProposal,
} from '../src/index.js';
import type { CalEvent, EventInput, KernelEvent, ResourceInput, TimeGridModel, DayGridModel, ZonedDateTime } from '../src/index.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const z = (s: string) => Temporal.ZonedDateTime.from(s);
const nav = { firstDay: 1 as const, today: d('2026-10-21') };
const PARIS = 'Europe/Paris';
const norm = () => ({ displayZone: PARIS, newId: createIdGenerator('t') });
const storeWith = (inputs: EventInput[]) => {
  const s = createEventStore();
  s.replaceSourceChunk('t', 'all', normalizeMany(inputs, norm(), 't').items);
  return s;
};
const ids = (rs: readonly { id: string }[]) => rs.map((r) => r.id);

describe('resource tree', () => {
  it('orders siblings by `order`, then as given; children under their parent, depth first', () => {
    const { tree, problems } = buildResourceTree([
      { id: 'c', title: 'Carla' },
      { id: 'a', title: 'Ali', order: 2 },
      { id: 'b', title: 'Bilal', order: 1 },
      { id: 'd', title: 'Dina', parentId: 'b' },
      { id: 'e', title: 'Emad', parentId: 'b', order: 0 },
    ]);
    expect(problems).toEqual([]);
    expect(ids(tree.order)).toEqual(['b', 'e', 'd', 'a', 'c']);
    expect(tree.roots.map((n) => n.resource.id)).toEqual(['b', 'a', 'c']);
    const dina = tree.byId.get('d')!;
    expect([dina.depth, dina.path, dina.parent?.resource.id]).toEqual([1, ['b', 'd'], 'b']);
  });

  it('`orderBy` names fields (a leading - descends), after `order`', () => {
    const inputs = [
      { id: 'x', title: 'Zed' },
      { id: 'y', title: 'Amy' },
      { id: 'z', title: 'Moe', extendedProps: { rank: 1 } },
    ];
    expect(ids(buildResourceTree(inputs, { orderBy: 'title' }).tree.order)).toEqual(['y', 'z', 'x']);
    expect(ids(buildResourceTree(inputs, { orderBy: '-title' }).tree.order)).toEqual(['x', 'z', 'y']);
    // A field read from extendedProps; resources without it go last, as given.
    expect(ids(buildResourceTree(inputs, { orderBy: 'rank' }).tree.order)).toEqual(['z', 'x', 'y']);
    expect(ids(buildResourceTree(inputs, { orderBy: (a, b) => b.id.localeCompare(a.id) }).tree.order)).toEqual(['z', 'y', 'x']);
  });

  it('never throws: refused entries, duplicates, unknown parents and cycles are problems', () => {
    const { tree, problems } = buildResourceTree([
      null,
      { title: 'no id' },
      { id: 'a' },
      { id: 'a' },
      { id: 'b', parentId: 'nope' },
      { id: 'c', parentId: 'd' },
      { id: 'd', parentId: 'c' },
      { id: 'e', timeZone: 'Mars/Olympus' },
      { id: 'f', businessHours: { daysOfWeek: [9], start: '09:00', end: '10:00' } },
    ]);
    expect(problems.map((p) => [p.code, p.severity, p.path])).toEqual([
      ['invalid-resource', 'error', 'resources[0]'],
      ['invalid-resource', 'error', 'resources[1].id'],
      ['duplicate-id', 'error', 'resources[3].id'],
      ['unknown-zone', 'warning', 'resources[7].timeZone'],
      ['invalid-resource', 'warning', 'resources[8].businessHours'],
      ['unknown-resource', 'warning', 'resources[4].parentId'],
      ['resource-cycle', 'warning', 'resources[5].parentId'],
    ]);
    // c, first of its cycle, became a root; d stays its child. The bad zone and hours are dropped.
    expect(ids(tree.order)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect([tree.byId.get('d')!.parent?.resource.id, tree.byId.get('e')!.resource.timeZone, tree.byId.get('f')!.resource.businessHours]).toEqual(['c', null, null]);
    for (const junk of [undefined, null, 'x', 42, {}, [1, 'a', []]]) expect(() => buildResourceTree(junk)).not.toThrow();
    expect(buildResourceTree('x').problems.map((p) => p.code)).toEqual(['invalid-resource']);
  });

  it('an orderBy that throws is input order, said once; a prototype key is no field', () => {
    const inputs = [{ id: 'b' }, { id: 'a' }, { id: 'c' }];
    const r = buildResourceTree(inputs, {
      orderBy: () => {
        throw new Error('boom');
      },
    });
    expect([ids(r.tree.order), r.problems.map((p) => `${p.code}@${p.path}`)]).toEqual([['b', 'a', 'c'], ['invalid-resource@resourceOrder']]);
    // 'constructor' is on every object's prototype: not a field of these resources, so the order stays as given.
    expect(ids(buildResourceTree(inputs, { orderBy: 'constructor' }).tree.order)).toEqual(['b', 'a', 'c']);
  });

  it('a cycle above a resource is broken at its own first member, not under it', () => {
    // e hangs under a, and a ⇄ b loop: a (first of the loop) becomes the root, e stays a's child.
    const { tree, problems } = buildResourceTree([
      { id: 'e', parentId: 'a' },
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]);
    expect(problems.map((p) => [p.code, p.path])).toEqual([['resource-cycle', 'resources[1].parentId']]);
    expect([tree.roots.map((n) => n.resource.id), tree.byId.get('e')!.parent?.resource.id, tree.byId.get('b')!.parent?.resource.id]).toEqual([['a'], 'a', 'a']);
  });
});

describe('rows and columns', () => {
  const { tree } = buildResourceTree([
    { id: 'card', title: 'Cardiology', unit: 'North' },
    { id: 'ali', title: 'Dr Ali', parentId: 'card' },
    { id: 'sara', title: 'Dr Sara', parentId: 'card' },
    { id: 'derm', title: 'Dermatology', unit: 'South' },
    { id: 'omar', title: 'Dr Omar', parentId: 'derm' },
    { id: 'ent', title: 'ENT', unit: 'North' },
  ]);

  it('flattens depth first; a collapsed resource hides its subtree; a filter drops one with its subtree', () => {
    const rows = (s: Parameters<typeof flattenRows>[1], f?: Parameters<typeof flattenRows>[2]) =>
      flattenRows(tree, s, f).map((r) => (r.kind === 'group' ? `[${r.value}:${r.count}]` : `${'  '.repeat(r.depth)}${r.resource.id}${r.expanded === null ? '' : r.expanded ? '-' : '+'}`));
    expect(rows({})).toEqual(['card-', '  ali', '  sara', 'derm-', '  omar', 'ent']);
    expect(rows({ expanded: new Set(['derm']) })).toEqual(['card+', 'derm-', '  omar', 'ent']);
    expect(rows({}, (r) => r.id !== 'card')).toEqual(['derm-', '  omar', 'ent']);
  });

  it('groups the roots by a field, in the order a group first comes; a collapsed group keeps its count', () => {
    const rows = (s: Parameters<typeof flattenRows>[1]) => flattenRows(tree, s).map((r) => (r.kind === 'group' ? `[${r.value}:${r.count}${r.expanded ? '' : '+'}]` : r.resource.id));
    expect(rows({ groupBy: 'unit' })).toEqual(['[North:4]', 'card', 'ali', 'sara', 'ent', '[South:2]', 'derm', 'omar']);
    expect(rows({ groupBy: 'unit', collapsedGroups: new Set(['North']) })).toEqual(['[North:4+]', '[South:2]', 'derm', 'omar']);
    const cols = columnResources(tree, 'unit');
    expect([ids(cols.resources), cols.groups]).toEqual([
      ['card', 'ali', 'sara', 'ent', 'derm', 'omar'],
      [
        { value: 'North', from: 0, count: 4 },
        { value: 'South', from: 4, count: 2 },
      ],
    ]);
  });
});

describe('resource columns in the time grid', () => {
  const resources = buildResourceTree([
    { id: 'paris', title: 'Dr Paris' },
    { id: 'riyadh', title: 'Dr Riyadh', timeZone: 'Asia/Riyadh', businessHours: { daysOfWeek: [7, 1, 2, 3, 4], start: '08:00', end: '12:00' } },
  ]).tree.order;
  const day = computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.resourceTimeGridDay!, nav);
  const week = computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.resourceTimeGridWeek!, nav);

  it('one column per resource and date, resources first; each shows its own events, a shared one in both', () => {
    const store = storeWith([
      { id: 'p', start: '2026-10-21T10:00[Europe/Paris]', resourceId: 'paris' },
      { id: 'r', start: '2026-10-21T10:00[Europe/Paris]', resourceId: 'riyadh' },
      { id: 'both', start: '2026-10-21T14:00[Europe/Paris]', resourceIds: ['paris', 'riyadh'] },
      { id: 'none', start: '2026-10-21T15:00[Europe/Paris]' },
    ]);
    const m = buildTimeGridModel(week, store.snapshot, { displayZone: PARIS, resources });
    expect(m.columns.length).toBe(14);
    expect([m.columns[0]!.key, m.columns[6]!.key, m.columns[7]!.key]).toEqual(['2026-10-19|paris', '2026-10-25|paris', '2026-10-19|riyadh']);
    const wed = (r: number) => m.columns[r * 7 + 2]!;
    expect(wed(0).events.map((e) => e.segment.instance.key).sort()).toEqual(['both', 'p']);
    expect(wed(1).events.map((e) => e.segment.instance.key).sort()).toEqual(['both', 'r']);
    // The shared event: a key per column, so each column's node is its own.
    const keyOf = (r: number) => wed(r).events.find((e) => e.segment.instance.key === 'both')!.segment.key;
    expect(keyOf(0)).not.toBe(keyOf(1));
    expect(m.resourceHeads.map((h) => [h.resource.id, h.from, h.count])).toEqual([
      ['paris', 0, 7],
      ['riyadh', 7, 7],
    ]);
  });

  it("a resource's hours are read in its zone; one without its own takes the calendar's", () => {
    // Wednesday 21 October 2026: Paris is UTC+2 (summer time ends on the 25th), Riyadh UTC+3 all year.
    // Riyadh 08:00–12:00 is 05:00–09:00 UTC, 07:00–11:00 in Paris: shaded before 07:00 and from 11:00.
    const m = buildTimeGridModel(day, createEventStore().snapshot, { displayZone: PARIS, resources, businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } });
    expect(m.columns.map((c) => c.offHours)).toEqual([
      [
        { top: 0, height: 540 },
        { top: 1020, height: 420 },
      ],
      [
        { top: 0, height: 420 },
        { top: 660, height: 780 },
      ],
    ]);
  });

  it('all-day bars sit in their resource’s columns; the update rebuilds the touched resource’s column', () => {
    const store = storeWith([
      { id: 'leave', start: '2026-10-20', end: '2026-10-22', allDay: true, resourceId: 'riyadh' },
      { id: 'meet', start: '2026-10-22T09:00[Europe/Paris]', resourceId: 'paris' },
    ]);
    const m = buildTimeGridModel(week, store.snapshot, { displayZone: PARIS, resources });
    // Tuesday and Wednesday of the second resource: columns 7 + 1, two days.
    expect(m.allDay.bars.map((b) => [b.segment.instance.key, b.column, b.segment.dayCount])).toEqual([['leave', 8, 2]]);
    const before = m.columns.map((c) => c);
    const change = store.apply([{ kind: 'event', before: store.snapshot.getEvent('meet')! }], 'api');
    const next = updateTimeGridModel(m, store.snapshot, change) as TimeGridModel;
    // Thursday's columns (one per resource) rebuilt; every other one kept as it was.
    const rebuilt = next.columns.flatMap((c, i) => (c === before[i] ? [] : [c.key]));
    expect(rebuilt).toEqual(['2026-10-22|paris', '2026-10-22|riyadh']);
    expect(next.columns[3]!.events).toEqual([]);
  });

  it("bookable slots with a resourceId show in that resource's columns only", () => {
    const slot = (h: string, resourceId?: string) => ({
      start: Temporal.Instant.from(`2026-10-21T${h}:00Z`),
      end: Temporal.Instant.from(`2026-10-21T${h}:30Z`),
      ...(resourceId && { resourceId }),
    });
    const m = buildTimeGridModel(day, createEventStore().snapshot, { displayZone: PARIS, resources, availableSlots: [slot('08', 'riyadh'), slot('09')] });
    expect(m.columns.map((c) => c.slots.map((s) => s.top))).toEqual([[660], [600, 660]]);
  });
});

describe('resource columns in the day grid', () => {
  const resources = buildResourceTree([{ id: 'a' }, { id: 'b', businessHours: { daysOfWeek: [1, 2], start: '09:00', end: '12:00' } }]).tree.order;

  it('a week: every resource’s seven days in one row, bars at their resource’s cells', () => {
    const range = computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.resourceDayGridWeek!, nav);
    const store = storeWith([
      { id: 'onB', start: '2026-10-21', allDay: true, resourceId: 'b' },
      { id: 'onBoth', start: '2026-10-19', end: '2026-10-21', allDay: true, resourceIds: ['a', 'b'] },
    ]);
    const m = buildDayGridModel(range, store.snapshot, { displayZone: PARIS, resources }) as DayGridModel;
    const w = m.weeks[0]!;
    expect([w.dates.length, w.dates[7]!.toString(), w.resources[6]?.id, w.resources[7]?.id]).toEqual([14, '2026-10-19', 'a', 'b']);
    const bars = w.bars.map((b) => [b.segment.instance.key, b.pieces[0]!.from, b.pieces[0]!.to]).sort((x, y) => (x[1] as number) - (y[1] as number));
    // onBoth: Monday–Tuesday of a (cells 0–1) and of b (7–8); onB: b's Wednesday (cell 9).
    expect(bars).toEqual([
      ['onBoth', 0, 2],
      ['onBoth', 7, 9],
      ['onB', 9, 10],
    ]);
    // b is closed except Monday and Tuesday; a has no hours of its own, nor the calendar: never closed.
    expect(w.closed).toEqual([false, false, false, false, false, false, false, false, false, true, true, true, true, true]);
    expect(m.resourceHeads.map((h) => [h.resource.id, h.from, h.count])).toEqual([
      ['a', 0, 7],
      ['b', 7, 7],
    ]);
  });

  it('a month: each week row holds both resources’ weeks; `firstColumn` counts cells', () => {
    const range = computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.resourceDayGridMonth!, nav);
    const store = storeWith([{ id: 'x', start: '2026-10-28', allDay: true, resourceId: 'b' }]);
    const m = buildDayGridModel(range, store.snapshot, { displayZone: PARIS, resources });
    // Six weeks from Monday 28 September; the 28th of October is the Wednesday of the fifth.
    expect(m.weeks.map((w) => w.firstColumn)).toEqual([0, 14, 28, 42, 56, 70]);
    const row = m.weeks[4]!;
    expect(row.bars.map((b) => [b.segment.instance.key, b.segment.dayIndex - row.firstColumn])).toEqual([['x', 9]]);
  });
});

describe('rules on resources', () => {
  const tree = buildResourceTree([
    { id: 'riyadh', timeZone: 'Asia/Riyadh', businessHours: { daysOfWeek: [7, 1, 2, 3, 4], start: '08:00', end: '12:00' }, eventConstraint: 'businessHours' },
    { id: 'paris' },
    { id: 'r1', eventOverlap: false },
    { id: 'r2', eventOverlap: true },
    { id: 'r3' },
  ]).tree;
  const store = storeWith([
    { id: 'ev', start: '2026-10-21T08:00[Europe/Paris]', duration: { minutes: 30 }, resourceId: 'riyadh' },
    { id: 'x1', start: '2026-10-21T10:00[Europe/Paris]', duration: { hours: 1 }, resourceId: 'r1' },
    { id: 'x2', start: '2026-10-21T10:00[Europe/Paris]', duration: { hours: 1 }, resourceId: 'r2' },
    { id: 'x3', start: '2026-10-21T10:00[Europe/Paris]', duration: { hours: 1 }, resourceId: 'r3' },
    { id: 'mover', start: '2026-10-21T15:00[Europe/Paris]', duration: { minutes: 30 } },
  ]);
  const ev = (id: string) => store.snapshot.getEvent(id) as CalEvent;
  const at = (id: string, hm: string, resourceIds: string[]) => {
    const start = z(`2026-10-21T${hm}[Europe/Paris]`);
    return { event: ev(id), start, end: start.add({ minutes: 30 }), resourceIds };
  };
  const codes = (p: ReturnType<typeof at>, extra: object = {}) => validateProposal(store.snapshot, p, { displayZone: PARIS, resources: tree, ...extra }).map((v) => [v.code, v.detail]);

  it("a resource's constraint is checked against its own hours in its own zone", () => {
    // 10:00–10:30 in Paris is 11:00–11:30 in Riyadh: inside 08:00–12:00.
    expect(codes(at('ev', '10:00', ['riyadh']))).toEqual([]);
    // 11:00 in Paris is 12:00 in Riyadh: closed.
    expect(codes(at('ev', '11:00', ['riyadh']))).toEqual([['constraint', 'riyadh']]);
  });

  it("the calendar's constraint uses each resource's hours; a resource without any uses the calendar's", () => {
    const rules = { constraint: 'businessHours', businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } };
    expect(codes(at('mover', '08:30', ['paris']), rules)).toEqual([['constraint', 'paris']]);
    expect(codes(at('mover', '09:30', ['paris']), rules)).toEqual([]);
    expect(codes(at('mover', '13:00', ['paris']), rules)).toEqual([]);
    // Also inside the calendar's 09:00–17:00, but Riyadh's own hours close at 12:00 there (11:00 in Paris).
    expect(codes(at('mover', '13:00', ['riyadh']), rules)).toEqual([['constraint', 'riyadh']]);
  });

  it("a resource's eventOverlap decides for the events it shares, over the calendar's", () => {
    // r1 refuses overlaps even though the calendar allows them; r2 and r3 follow the calendar.
    expect(codes(at('mover', '10:30', ['r1']))).toEqual([['overlap', 'x1']]);
    expect(codes(at('mover', '10:30', ['r2']))).toEqual([]);
    // The calendar refuses overlaps: r2 allows its own, r3 does not.
    expect(codes(at('mover', '10:30', ['r2']), { overlap: false })).toEqual([]);
    expect(codes(at('mover', '10:30', ['r3']), { overlap: false })).toEqual([['overlap', 'x3']]);
  });
});

describe('moving between resources', () => {
  const store = storeWith([{ id: 'e', start: '2026-10-21T10:00[Europe/Paris]', resourceIds: ['a', 'b'] }]);
  const ev = store.snapshot.getEvent('e') as CalEvent;
  const ctx = { snap: store.snapshot, displayZone: PARIS, snapMinutes: 15 };
  const hit = (resourceId?: string) => ({ kind: 'slot' as const, date: d('2026-10-21'), instant: (ev.start as ZonedDateTime).toInstant(), ...(resourceId && { resourceId }) });

  it('the resource grabbed on is swapped for the one under the pointer; the others stay', () => {
    expect(proposeMove(ctx, ev, hit('a'), hit('c')).resourceIds).toEqual(['c', 'b']);
    // Onto its other resource: the two become one.
    expect(proposeMove(ctx, ev, hit('a'), hit('b')).resourceIds).toEqual(['b']);
    expect(proposeMove(ctx, ev, hit('a'), hit('a')).resourceIds).toEqual(['a', 'b']);
    // Grabbed outside a resource column, dropped on one: that one alone.
    expect(proposeMove(ctx, ev, hit(), hit('c')).resourceIds).toEqual(['c']);
    // Over no resource (a plain view): unchanged.
    expect(proposeMove(ctx, ev, hit('a'), hit()).resourceIds).toEqual(['a', 'b']);
  });
});

describe('kernel resources', () => {
  const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
  const inputs: ResourceInput[] = [
    { id: 'b', title: 'Bilal', unit: 'South' },
    { id: 'a', title: 'Ali', unit: 'North' },
  ];

  it('a resource view gets the resources as columns; setResources redraws, with cause "resources"', () => {
    const k = createKernel({ timeZone: PARIS, locale: 'en-GB', now, initialView: 'resourceTimeGridDay', resources: inputs, resourceOrder: 'title', resourceGroupField: 'unit' });
    const m = () => k.viewModel().model as TimeGridModel;
    expect([m().columns.map((c) => c.key), m().groupHeads]).toEqual([
      ['2026-10-21|a', '2026-10-21|b'],
      [
        { value: 'North', from: 0, count: 1 },
        { value: 'South', from: 1, count: 1 },
      ],
    ]);
    const seen: KernelEvent[] = [];
    k.subscribe((e) => seen.push(e));
    const problems = k.setResources([{ id: 'c', title: 'Carla' }, { title: 'none' } as never]);
    expect([problems.map((p) => p.code), k.getResourceProblems().length, ids(k.getResources().order)]).toEqual([['invalid-resource'], 1, ['c']]);
    expect(seen.map((e) => (e.type === 'state' ? e.causes : e.type))).toEqual([['resources']]);
    expect(m().columns.map((c) => c.key)).toEqual(['2026-10-21|c']);
    expect(k.rules().resources?.byId.has('c')).toBe(true);
  });

  it('another order or group field rebuilds the columns; the same one changes nothing', () => {
    const k = createKernel({ timeZone: PARIS, locale: 'en-GB', now, initialView: 'resourceDayGridDay', resources: inputs });
    const keys = () => (k.viewModel().model as DayGridModel).resourceHeads.map((h) => h.resource.id);
    expect(keys()).toEqual(['b', 'a']);
    let states = 0;
    k.subscribe((e) => e.type === 'state' && states++);
    k.setOptions({ resourceOrder: 'title' });
    expect(keys()).toEqual(['a', 'b']);
    k.setOptions({ resourceOrder: ['title'] });
    expect(states).toBe(1);
  });

  it('a plain view ignores the resources; without any, rules carry none', () => {
    const k = createKernel({ timeZone: PARIS, locale: 'en-GB', now, initialView: 'timeGridDay', resources: inputs });
    expect((k.viewModel().model as TimeGridModel).columns.map((c) => c.key)).toEqual(['2026-10-21']);
    expect(createKernel({ timeZone: PARIS, locale: 'en-GB', now }).rules().resources).toBeUndefined();
  });
});
