import { describe, it, expect } from 'vitest';
import {
  Temporal,
  createEventStore,
  createIdGenerator,
  normalizeMany,
  normalizeEvent,
  viewWindow,
  arraySource,
  loadStaticSource,
  itemEvent,
} from '../src/index.js';
import type { CalEvent, EventInput, NormalizeContext, StoreChange, Normalized } from '../src/index.js';

const ctx = (): NormalizeContext => ({ displayZone: 'Europe/Paris', newId: createIdGenerator('t') });
const ev = (input: EventInput): CalEvent => {
  const r = normalizeEvent(input, ctx());
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return itemEvent(r.value);
};
const d = (s: string) => Temporal.PlainDate.from(s);
const ids = (xs: { key: string }[]) => xs.map((x) => x.key);
const items = (inputs: EventInput[], source = 'api') => normalizeMany(inputs, ctx(), source).items;

describe('queryInstances', () => {
  const store = createEventStore();
  store.apply(
    [
      ev({ id: 'morning', title: 'B', start: '2026-10-26T09:00[Europe/Paris]', end: '2026-10-26T10:00[Europe/Paris]' }),
      ev({ id: 'long', title: 'A', start: '2026-10-26T09:00[Europe/Paris]', end: '2026-10-26T12:00[Europe/Paris]' }),
      // 08:00 in Tokyo (+09:00) is 23:00Z, midnight Monday in Paris, which is +01:00 since Sunday.
      ev({ id: 'tokyo', start: '2026-10-26T08:00[Asia/Tokyo]' }),
      ev({ id: 'allday', start: '2026-10-26' }),
      ev({ id: 'trip', start: '2026-10-20', end: '2026-10-30' }),
      ev({ id: 'milestone', start: '2026-10-26T15:00[UTC]', end: '2026-10-26T15:00[UTC]' }),
      ev({ id: 'hidden', start: '2026-10-26T09:00[UTC]', display: 'none' }),
      ev({ id: 'bg', start: '2026-10-26T09:00[UTC]', display: 'background' }),
      ev({ id: 'nextday', start: '2026-10-27T00:00[Europe/Paris]' }),
      ev({ id: 'room', start: '2026-10-26T13:00[UTC]', resourceIds: ['r1'] }),
    ].map((after) => ({ kind: 'event' as const, after })),
    'api',
  );
  const monday = viewWindow(d('2026-10-26'), d('2026-10-27'), 'Europe/Paris');

  it('finds timed events by instant, all-day ones by date, and orders them', () => {
    expect(ids(store.snapshot.queryInstances(monday))).toEqual([
      // all-day first only because they start at midnight; longer first; then title
      'trip', 'allday', 'tokyo', 'long', 'morning', 'bg', 'room', 'milestone',
    ]);
  });

  it('a window is half-open: the next day’s midnight is not in it', () => {
    expect(ids(store.snapshot.queryInstances(monday))).not.toContain('nextday');
  });

  it('a milestone is found inside its window', () => {
    expect(ids(store.snapshot.queryInstances(monday))).toContain('milestone');
  });

  it('display none is never returned; background on request', () => {
    expect(ids(store.snapshot.queryInstances(monday, { includeBackground: false }))).not.toContain('bg');
  });

  it('by resource, only that resource’s events', () => {
    expect(ids(store.snapshot.queryInstances(monday, { resourceId: 'r1' }))).toEqual(['room']);
    expect(store.snapshot.queryInstances(monday, { resourceId: 'nobody' })).toEqual([]);
  });

  it('the same instant on a different display day: Tokyo’s 08:00 is Monday 00:00 in Paris, Sunday 18:00 in Chicago', () => {
    const sundayChicago = viewWindow(d('2026-10-25'), d('2026-10-26'), 'America/Chicago');
    expect(ids(store.snapshot.queryInstances(sundayChicago))).toContain('tokyo');
  });

  it('the 25-hour Sunday in Paris is a 25-hour window', () => {
    const w = viewWindow(d('2026-10-25'), d('2026-10-26'), 'Europe/Paris');
    expect((w.end.epochMilliseconds - w.start.epochMilliseconds) / 3_600_000).toBe(25);
  });
});

describe('snapshots and changes', () => {
  it('an old snapshot never sees later changes', () => {
    const store = createEventStore();
    store.apply([{ kind: 'event', after: ev({ id: 'a', start: '2026-05-01' }) }], 'api');
    const before = store.snapshot;
    store.apply([{ kind: 'event', before: before.getEvent('a')!, after: ev({ id: 'a', title: 'moved', start: '2026-05-03' }) }], 'api');
    store.apply([{ kind: 'event', after: ev({ id: 'b', start: '2026-05-02' }) }], 'api');
    expect(before.getEvent('a')!.start.toString()).toBe('2026-05-01');
    expect(before.getEvent('b')).toBeUndefined();
    expect(before.queryInstances(viewWindow(d('2026-05-03'), d('2026-05-04'), 'UTC'))).toEqual([]);
    expect(store.snapshot.counts.events).toBe(2);
  });

  it('reports net changes and the old and new places as dirty', () => {
    const store = createEventStore();
    const a1 = ev({ id: 'a', start: '2026-05-01T09:00[UTC]' });
    store.apply([{ kind: 'event', after: a1 }], 'api');
    const seen: StoreChange[] = [];
    store.subscribe((c) => seen.push(c));
    const a2 = ev({ id: 'a', start: '2026-05-01T15:00[UTC]' });
    const change = store.apply([{ kind: 'event', before: a1, after: a2 }], 'command');
    expect(change).toMatchObject({ added: [], updated: ['a'], removed: [], cause: 'command' });
    const h = (s: string) => Temporal.Instant.from(s).epochMilliseconds;
    expect(change.dirtySpans).toEqual([
      { s: h('2026-05-01T09:00Z'), e: h('2026-05-01T10:00Z') },
      { s: h('2026-05-01T15:00Z'), e: h('2026-05-01T16:00Z') },
    ]);
    expect(seen).toHaveLength(1);
  });

  it('a batch that changes nothing notifies no one and keeps the version', () => {
    const store = createEventStore();
    const a = ev({ id: 'a', start: '2026-05-01' });
    store.apply([{ kind: 'event', after: a }], 'api');
    const v = store.snapshot.version;
    let calls = 0;
    store.subscribe(() => calls++);
    const change = store.apply([{ kind: 'event', before: a, after: a }], 'api');
    expect(change.version).toBe(v);
    expect(store.snapshot.version).toBe(v);
    expect(calls).toBe(0);
  });

  it('add then remove in one batch is no change at all', () => {
    const store = createEventStore();
    const a = ev({ id: 'a', start: '2026-05-01' });
    const change = store.apply([{ kind: 'event', after: a }, { kind: 'event', before: a }], 'api');
    expect([change.added, change.removed]).toEqual([[], []]);
  });

  it('a resource event moved to another resource leaves the first resource’s index', () => {
    const store = createEventStore();
    const a1 = ev({ id: 'a', start: '2026-05-01', resourceIds: ['r1'] });
    store.apply([{ kind: 'event', after: a1 }], 'api');
    store.apply([{ kind: 'event', before: a1, after: ev({ id: 'a', start: '2026-05-01', resourceIds: ['r2'] }) }], 'api');
    const w = viewWindow(d('2026-05-01'), d('2026-05-02'), 'UTC');
    expect(store.snapshot.queryInstances(w, { resourceId: 'r1' })).toEqual([]);
    expect(ids(store.snapshot.queryInstances(w, { resourceId: 'r2' }))).toEqual(['a']);
  });
});

describe('sources: chunks, revisions, stable ids', () => {
  const window = viewWindow(d('2026-05-01'), d('2026-06-01'), 'UTC');

  it('an event without id gets the same id on every refetch, and keeps its object when unchanged', () => {
    const store = createEventStore();
    const raw = [{ title: 'standup', start: '2026-05-04T09:00[UTC]' }];
    store.replaceSourceChunk('api', '2026-05', items(raw));
    const first = store.snapshot.queryInstances(window)[0]!.event;
    expect(first.id).toMatch(/^api:/);
    expect(first.revision).toBe(1);
    const change = store.replaceSourceChunk('api', '2026-05', items(raw));
    expect([change.added, change.updated, change.removed]).toEqual([[], [], []]);
    expect(store.snapshot.queryInstances(window)[0]!.event).toBe(first);
  });

  it('a changed title from the source is an update, with a higher revision', () => {
    const store = createEventStore();
    store.replaceSourceChunk('api', 'c', items([{ id: 'x', title: 'old', start: '2026-05-04' }]));
    const first = store.snapshot.getEvent('x')!.revision;
    const change = store.replaceSourceChunk('api', 'c', items([{ id: 'x', title: 'new', start: '2026-05-04' }]));
    expect(change.updated).toEqual(['x']);
    expect(store.snapshot.getEvent('x')!.revision).toBeGreaterThan(first);
    expect(store.snapshot.getEvent('x')!.sourceId).toBe('api');
  });

  it('a refetch with nested extendedProps, parsed afresh, is a no-op', () => {
    const store = createEventStore();
    const raw = () => JSON.parse('[{"id":"x","start":"2026-05-04","extendedProps":{"room":{"floor":2}}}]');
    store.replaceSourceChunk('api', 'c', items(raw()));
    const kept = store.snapshot.getEvent('x');
    const change = store.replaceSourceChunk('api', 'c', items(raw()));
    expect(change.updated).toEqual([]);
    expect(store.snapshot.getEvent('x')).toBe(kept);
  });

  it('an event evicted and delivered again never reuses a revision for other content', () => {
    const store = createEventStore();
    store.replaceSourceChunk('api', 'c', items([{ id: 'x', title: 'one', start: '2026-05-04' }]));
    const r1 = store.snapshot.getEvent('x')!.revision;
    store.replaceSourceChunk('api', 'c', []);
    store.replaceSourceChunk('api', 'c', items([{ id: 'x', title: 'two', start: '2026-05-04' }]));
    expect(store.snapshot.getEvent('x')!.revision).not.toBe(r1);
  });

  it('the store stamps what it is given: an apply cannot slip in a stale revision', () => {
    const store = createEventStore();
    store.apply([{ kind: 'event', after: ev({ id: 'a', start: '2026-05-01' }) }], 'api');
    const stale = { ...ev({ id: 'a', title: 'x', start: '2026-05-01' }), revision: 1 } as CalEvent;
    const change = store.apply([{ kind: 'event', after: stale }], 'api');
    expect(store.snapshot.getEvent('a')!.revision).toBe(change.version);
    expect(change.applied[0]!.after).toBe(store.snapshot.getEvent('a'));
  });

  it('two identical events in one batch are both kept, told apart by rank', () => {
    const store = createEventStore();
    const raw = [{ title: 'x', start: '2026-05-04' }, { title: 'x', start: '2026-05-04' }];
    store.replaceSourceChunk('api', 'c', items(raw));
    expect(store.snapshot.counts.events).toBe(2);
  });

  it('an event overlapping two chunks belongs to both, and goes only when both drop it', () => {
    const store = createEventStore();
    const spanning = { id: 'trip', start: '2026-05-30', end: '2026-06-03' };
    store.replaceSourceChunk('api', '2026-05', items([spanning]));
    store.replaceSourceChunk('api', '2026-06', items([spanning]));
    expect(store.replaceSourceChunk('api', '2026-05', []).removed).toEqual([]);
    expect(store.snapshot.getEvent('trip')).toBeDefined();
    expect(store.replaceSourceChunk('api', '2026-06', []).removed).toEqual(['trip']);
  });

  it('a source cannot overwrite an event it does not own', () => {
    const store = createEventStore();
    store.apply([{ kind: 'event', after: ev({ id: 'mine', start: '2026-05-04' }) }], 'command');
    const change = store.replaceSourceChunk('api', 'c', items([{ id: 'mine', title: 'hijack', start: '2026-05-05' }]));
    expect(change.problems.map((p) => p.code)).toEqual(['duplicate-id']);
    expect(store.snapshot.getEvent('mine')!.title).toBe('');
  });

  it('loadStaticSource puts an array source in the store, with its defaults', () => {
    const store = createEventStore();
    const { change, report } = loadStaticSource(
      store,
      arraySource('holidays', [{ title: 'Toussaint', start: '2026-11-01' }, { start: 'nope' }], { tone: 'holiday' }),
      ctx(),
    );
    expect(change.added).toHaveLength(1);
    expect(report.rejected).toBe(1);
    const e = store.snapshot.queryInstances(viewWindow(d('2026-11-01'), d('2026-11-02'), 'UTC'))[0]!.event;
    expect(e.tone).toBe('holiday');
    expect(e.sourceId).toBe('holidays');
  });

  it('refuses a chunked or asynchronous source, which the manager will handle', () => {
    const store = createEventStore();
    expect(() => loadStaticSource(store, { id: 's', fetch: () => [], chunk: { unit: 'month', prefetch: 1 } }, ctx())).toThrow(/chunked/);
    expect(() => loadStaticSource(store, { id: 's', fetch: async () => [], chunk: { unit: 'none', prefetch: 0 } }, ctx())).toThrow(/asynchronous/);
  });
});

it('normalizeMany ids: same input, same id, across calls', () => {
  const a = items([{ title: 'x', start: '2026-05-04T09:00[UTC]' }]) as Normalized[];
  const b = items([{ title: 'x', start: '2026-05-04T09:00[UTC]' }]) as Normalized[];
  expect(itemEvent(a[0]!).id).toBe(itemEvent(b[0]!).id);
  expect(itemEvent(items([{ title: 'y', start: '2026-05-04T09:00[UTC]' }])[0]!).id).not.toBe(itemEvent(a[0]!).id);
});
