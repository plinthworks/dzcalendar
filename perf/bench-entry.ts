/**
 * The Phase 1 budgets, measured. Bundled and minified by scripts/bench.mjs
 * before it runs: the Temporal polyfill attaches a debug string to every
 * object it creates *unless minified*, so measuring the sources directly
 * would measure a cost no user pays.
 */
import {
  BUILTIN_VIEWS,
  Temporal,
  buildDayGridModel,
  buildTimeGridModel,
  computeViewRange,
  createEventStore,
  createHistory,
  createIdGenerator,
  createSourceManager,
  dayInfos,
  fnSource,
  layoutColumn,
  normalizeMany,
  viewWindow,
  itemEvent,
} from '../packages/core/src/index.js';
import type { EventInput, Mutation } from '../packages/core/src/index.js';
import { expandZoned, parseRRule } from '../packages/rrule/src/index.js';
import { buildListModel, buildMultiMonthModel } from '../packages/core/src/views.js';
import { findSlots } from '../packages/slots/src/index.js';
import type { Busy } from '../packages/slots/src/index.js';

// Run by node with --expose-gc; `gc` is not in @types/node's globals.
const gc = (globalThis as { gc?: () => void }).gc;

const ctx = { displayZone: 'Europe/Paris', newId: createIdGenerator('p') };

function inputs(n: number): EventInput[] {
  const out: EventInput[] = [];
  let seed = 9;
  const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const jan1 = Temporal.PlainDate.from('2026-01-01');
  for (let i = 0; i < n; i++) {
    const date = jan1.add({ days: Math.floor(r() * 365) });
    if (r() < 0.15) {
      out.push({ id: `e${i}`, title: `all ${i}`, start: date.toString(), end: date.add({ days: 1 + Math.floor(r() * 3) }).toString() });
    } else {
      const hh = String(7 + Math.floor(r() * 12)).padStart(2, '0');
      out.push({ id: `e${i}`, title: `ev ${i}`, start: `${date}T${hh}:${r() < 0.5 ? '00' : '30'}[Europe/Paris]`, duration: { minutes: 30 + 30 * Math.floor(r() * 4) } });
    }
  }
  return out;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const time = (runs: number, fn: () => void) => {
  const xs: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    xs.push(performance.now() - t0);
  }
  return median(xs);
};

const raw = inputs(10_000);
const load = () => {
  const { items } = normalizeMany(raw, ctx);
  const store = createEventStore();
  store.apply(items.map((x) => ({ kind: 'event', after: itemEvent(x) }) as Mutation), 'api');
  return store;
};
load();
load();

const results: Record<string, number> = {};
results['normalize+index 10k'] = time(9, load);
const { items } = normalizeMany(raw, ctx);
const muts = items.map((x) => ({ kind: 'event', after: itemEvent(x) }) as Mutation);
results['index 10k'] = time(5, () => createEventStore().apply(muts, 'api'));

// The real path of a source: one chunk of 10 000, then the same again (a refresh).
const sourced = normalizeMany(raw.map(({ id: _id, ...rest }) => rest), ctx, 'api').items;
results['replaceSourceChunk 10k'] = time(5, () => createEventStore().replaceSourceChunk('api', 'all', sourced));
const refetched = createEventStore();
refetched.replaceSourceChunk('api', 'all', sourced);
results['refetch 10k identical'] = time(5, () => refetched.replaceSourceChunk('api', 'all', normalizeMany(raw.map(({ id: _id, ...rest }) => rest), ctx, 'api').items));

// Phase 9: one answer of a year cut into twelve monthly chunks — normalize, partition, apply.
const yearSource = fnSource('api', () => raw, { chunk: { unit: 'month', prefetch: 0 } });
results['source delivery 10k over 12 months'] = time(5, () => {
  const m = createSourceManager({ store: createEventStore(), normalize: () => ctx });
  m.add(yearSource);
  m.setRange(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2027-01-01'), 'Europe/Paris');
  m.destroy();
});

const store = load();
const w = viewWindow(Temporal.PlainDate.from('2026-06-01'), Temporal.PlainDate.from('2026-07-06'), 'Europe/Paris');
results['query 5 weeks of 10k'] = time(50, () => store.snapshot.queryInstances(w));

// Phase 2: pure layout and view models.
const overlapping = Array.from({ length: 1000 }, (_, i) => ({ key: `c${i}`, start: (i * 7) % 600, end: ((i * 7) % 600) + 60 + (i % 90), order: i }));
results['layoutColumn 1000 overlapping'] = time(20, () => layoutColumn(overlapping, { minVisual: 15 }));
results['dayInfos 366'] = time(10, () => dayInfos(Temporal.PlainDate.from('2026-01-01'), 366, 'Europe/Paris'));
const nav = { firstDay: 1 as const, today: Temporal.PlainDate.from('2026-06-10') };
const weekRange = computeViewRange(Temporal.PlainDate.from('2026-06-10'), BUILTIN_VIEWS.timeGridWeek!, nav);
results['timeGrid week model (10k)'] = time(20, () => buildTimeGridModel(weekRange, store.snapshot, { displayZone: 'Europe/Paris' }));
const monthRange = computeViewRange(Temporal.PlainDate.from('2026-06-10'), BUILTIN_VIEWS.dayGridMonth!, nav);
results['dayGrid month model (10k)'] = time(20, () => buildDayGridModel(monthRange, store.snapshot, { displayZone: 'Europe/Paris', maxLanes: 4 }));
// Phase 12: W, the worst case — 10 000 events in one week.
const wStore = createEventStore();
wStore.replaceSourceChunk('w', '*', normalizeMany(inputs(10_000).map((e, i) => {
  const day = Temporal.PlainDate.from('2026-06-08').add({ days: i % 7 });
  return e.allDay === undefined && typeof e.start === 'string' && e.start.includes('T') ? { ...e, start: `${day}${e.start.slice(10)}` } : { ...e, start: String(day), end: String(day.add({ days: 1 })) };
}), ctx, 'w').items);
const wWeek = computeViewRange(Temporal.PlainDate.from('2026-06-10'), BUILTIN_VIEWS.timeGridWeek!, nav);
results['timeGrid week model (W)'] = time(5, () => buildTimeGridModel(wWeek, wStore.snapshot, { displayZone: 'Europe/Paris' }));
results['dayGrid month model (W)'] = time(5, () => buildDayGridModel(monthRange, wStore.snapshot, { displayZone: 'Europe/Paris', maxLanes: 4 }));

// Phase 10: a year at once (nothing virtualized yet — Phase 12).
const yearList = computeViewRange(Temporal.PlainDate.from('2026-06-10'), BUILTIN_VIEWS.listYear!, nav);
results['list year model (10k)'] = time(10, () => buildListModel(yearList, store.snapshot, { displayZone: 'Europe/Paris' }));
const yearGrid = computeViewRange(Temporal.PlainDate.from('2026-06-10'), BUILTIN_VIEWS.multiMonthYear!, nav);
results['multiMonth model (10k)'] = time(10, () => buildMultiMonthModel(yearGrid, store.snapshot, { displayZone: 'Europe/Paris', maxLanes: 2 }));

// Phase 5: recurrence. The criterion: a year of a daily rule in ≤ 5 ms.
const daily = parseRRule('FREQ=DAILY');
if (!daily.ok) throw new Error('rule');
const dstart = Temporal.ZonedDateTime.from('2026-01-01T09:00[Europe/Paris]');
const year = { from: dstart.toInstant(), to: dstart.add({ years: 1 }).toInstant() };
results['expand daily 1 year'] = time(20, () => expandZoned(dstart, { rules: [daily.rule], exdates: [], rdates: [] }, year));
// What a view pays: 200 weekly series seen through one week, two years after they began (fresh objects, no cache).
const seriesInputs: EventInput[] = Array.from({ length: 200 }, (_, i) => ({
  id: `r${i}`,
  start: `2024-06-${String(3 + (i % 5)).padStart(2, '0')}T${String(8 + (i % 9)).padStart(2, '0')}:00[Europe/Paris]`,
  duration: { minutes: 30 },
  rrule: 'FREQ=WEEKLY',
}));
const seriesMuts = () => normalizeMany(seriesInputs, ctx).items.map((x) => (x.kind === 'series' ? { kind: 'series', after: x.series } : { kind: 'event', after: x.event }) as Mutation);
results['normalize+index 200 series'] = time(10, () => createEventStore().apply(seriesMuts(), 'api'));
const seriesWeek = viewWindow(Temporal.PlainDate.from('2026-06-01'), Temporal.PlainDate.from('2026-06-08'), 'Europe/Paris');
// Fresh series each run: the occurrence cache would otherwise answer.
const stores = Array.from({ length: 10 }, () => {
  const st = createEventStore();
  st.apply(seriesMuts(), 'api');
  return st;
});
let si = 0;
results['week of 200 series'] = time(10, () => stores[si++ % stores.length]!.snapshot.queryInstances(seriesWeek));

// Phase 6: editing a series. A daily series with 100 renamed occurrences.
{
  const editCtx = { normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('x') } };
  const setup = () => {
    const st = createEventStore();
    const h = createHistory(st, editCtx);
    h.run({ type: 'event.create', event: { id: 'd', start: '2026-01-01T09:00[Europe/Paris]', duration: { minutes: 30 }, rrule: 'FREQ=DAILY' } });
    let day = Temporal.PlainDate.from('2026-01-01');
    for (let i = 0; i < 100; i++, day = day.add({ days: 3 })) {
      const key = day.toZonedDateTime({ timeZone: 'Europe/Paris', plainTime: '09:00' }).toString();
      h.run({ type: 'event.update', id: 'd', key, scope: 'this', patch: { title: `o${i}` } });
    }
    return { st, h };
  };
  const pool = Array.from({ length: 12 }, setup);
  let pi = 0;
  results['series edit this'] = time(10, () => pool[pi++ % pool.length]!.h.run({ type: 'event.update', id: 'd', key: '2026-06-02T09:00:00+02:00[Europe/Paris]', scope: 'this', patch: { title: `t${pi}` } }));
  const pool2 = Array.from({ length: 12 }, setup);
  let pj = 0;
  results['series edit following (100 overrides)'] = time(10, () => pool2[pj++ % pool2.length]!.h.run({ type: 'event.move', id: 'd', key: '2026-04-01T09:00:00+02:00[Europe/Paris]', scope: 'following', start: '2026-04-01T10:00' }));
}

let k = 0;
results['apply one update'] = time(50, () => {
  const before = store.snapshot.getEvent('e5')!;
  store.apply([{ kind: 'event', before, after: { ...before, title: `x${k++}` } }], 'command');
});

const victims = [...store.snapshot.allEvents()].slice(0, 2238).map((e) => ({ kind: 'event', before: e }) as Mutation);
results['delete 2238'] = time(1, () => store.apply(victims, 'command'));

if (typeof gc === 'function') {
  gc();
  const m0 = process.memoryUsage().heapUsed;
  const kept = load();
  gc();
  results['bytes per stored event'] = (process.memoryUsage().heapUsed - m0) / kept.snapshot.counts.events;
}

// Phase 14 (G.2): 30 days of 15-minute slots, open 08:00–20:00 every day in Riyadh, 300 bookings, buffers, notice, a daily cap.
const slotBusy: Busy[] = Array.from({ length: 300 }, (_, i) => {
  const start = Temporal.ZonedDateTime.from('2026-11-01T08:00[Asia/Riyadh]').add({ days: i % 30, minutes: 45 * Math.floor(i / 30) });
  return { start, end: start.add({ minutes: 30 }) };
});
results['slots 30 days at 15 min'] = time(20, () =>
  findSlots({
    availability: { timeZone: 'Asia/Riyadh', weekly: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '08:00', to: '20:00' }] },
    from: '2026-11-01T00:00[Asia/Riyadh]',
    to: '2026-12-01T00:00[Asia/Riyadh]',
    duration: 15,
    bufferBefore: 5,
    bufferAfter: 5,
    now: '2026-10-31T12:00[Asia/Riyadh]',
    minNotice: 120,
    maxPerDay: 40,
    busy: slotBusy,
  }),
);
process.stdout.write(JSON.stringify(results));
