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
  createIdGenerator,
  dayInfos,
  layoutColumn,
  normalizeMany,
  viewWindow,
} from '../packages/core/src/index.js';
import type { EventInput, Mutation } from '../packages/core/src/index.js';

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
  store.apply(items.map((x) => ({ kind: 'event', after: x.event }) as Mutation), 'api');
  return store;
};
load();
load();

const results: Record<string, number> = {};
results['normalize+index 10k'] = time(9, load);
const { items } = normalizeMany(raw, ctx);
const muts = items.map((x) => ({ kind: 'event', after: x.event }) as Mutation);
results['index 10k'] = time(5, () => createEventStore().apply(muts, 'api'));

// The real path of a source: one chunk of 10 000, then the same again (a refresh).
const sourced = normalizeMany(raw.map(({ id: _id, ...rest }) => rest), ctx, 'api').items;
results['replaceSourceChunk 10k'] = time(5, () => createEventStore().replaceSourceChunk('api', 'all', sourced));
const refetched = createEventStore();
refetched.replaceSourceChunk('api', 'all', sourced);
results['refetch 10k identical'] = time(5, () => refetched.replaceSourceChunk('api', 'all', normalizeMany(raw.map(({ id: _id, ...rest }) => rest), ctx, 'api').items));

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

process.stdout.write(JSON.stringify(results));
