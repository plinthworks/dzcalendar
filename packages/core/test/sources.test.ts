import { describe, it, expect, vi } from 'vitest';
import {
  Temporal,
  createEventStore,
  createHistory,
  createIdGenerator,
  createSourceManager,
  chunksCovering,
  exportInputs,
  fnSource,
  jsonSource,
  normalizeMany,
  viewWindow,
} from '../src/index.js';
import type { EventInput, EventSourceSpec, FetchRequest, SourceNotice, Timers } from '../src/index.js';

const PARIS = 'Europe/Paris';
const d = (s: string) => Temporal.PlainDate.from(s);
const ctx = () => ({ displayZone: PARIS, newId: createIdGenerator('t') });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

/** A source whose answers the test gives by hand, one per request, in order. */
function manual(id: string, chunk: EventSourceSpec['chunk'] = { unit: 'month', prefetch: 0 }, extra: Partial<EventSourceSpec> = {}) {
  const calls: { req: FetchRequest; answer: ReturnType<typeof deferred<readonly EventInput[]>> }[] = [];
  const spec: EventSourceSpec = {
    id,
    chunk,
    fetch: (req) => {
      const answer = deferred<readonly EventInput[]>();
      calls.push({ req, answer });
      return answer.promise;
    },
    ...extra,
  };
  return { spec, calls };
}

const span = (r: FetchRequest) => `${r.window!.startDate}..${r.window!.endDate}`;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function setup(opts: { timers?: Timers; keepChunks?: number; maxConcurrent?: number } = {}) {
  const store = createEventStore();
  const notices: SourceNotice[] = [];
  const m = createSourceManager({ store, normalize: ctx, notify: (n) => notices.push(n), ...opts });
  return { store, m, notices };
}

const titles = (store: ReturnType<typeof createEventStore>, from = '2026-01-01', to = '2027-01-01') =>
  store.snapshot.queryInstances(viewWindow(d(from), d(to), PARIS)).map((i) => i.event.title);

describe('chunks', () => {
  it('a week in October is the October chunk; a month grid is three months, one request', () => {
    expect(chunksCovering('month', d('2026-10-19'), d('2026-10-26')).map((c) => c.key)).toEqual(['2026-10']);
    expect(chunksCovering('month', d('2026-09-28'), d('2026-11-09')).map((c) => c.key)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(chunksCovering('month', d('2026-10-19'), d('2026-10-26'), 1).map((c) => c.key)).toEqual(['2026-09', '2026-10', '2026-11']);
    // Weeks begin on Monday whatever the locale: a chunk is a fetch, not a row.
    expect(chunksCovering('week', d('2026-10-18'), d('2026-10-25')).map((c) => c.key)).toEqual(['2026-10-12', '2026-10-19']);
    expect(chunksCovering('year', d('2026-12-28'), d('2027-01-04')).map((c) => c.key)).toEqual(['2026', '2027']);
  });
});

describe('source manager', () => {
  it('fetches the shown month, its window wide enough for every zone', async () => {
    const { m } = setup();
    const { spec, calls } = manual('s');
    m.add(spec);
    expect(calls).toHaveLength(0); // nothing shown yet
    m.setRange(d('2026-10-19'), d('2026-10-26'), PARIS);
    expect(calls).toHaveLength(1);
    const w = calls[0]!.req.window!;
    expect(span(calls[0]!.req)).toBe('2026-10-01..2026-11-01');
    // 1 October begins first at UTC+14 (30 September, 10:00 UTC); 1 November ends last at UTC−12.
    expect(w.start.toString()).toBe('2026-09-30T10:00:00Z');
    expect(w.end.toString()).toBe('2026-11-01T12:00:00Z');
    expect(w.displayZone).toBe(PARIS);
  });

  it('two contiguous missing chunks go out as one request; a known one splits the run', () => {
    const { m } = setup();
    const { spec, calls } = manual('s');
    m.add(spec);
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    m.setRange(d('2026-08-31'), d('2026-12-07'), PARIS); // Aug, Sep, [Oct in flight], Nov, Dec
    expect(calls.map((c) => span(c.req))).toEqual(['2026-10-01..2026-11-01', '2026-08-01..2026-10-01', '2026-11-01..2027-01-01']);
  });

  it('aborts a request nobody shows any more, and ignores its late answer', async () => {
    const { m, store } = setup();
    const { spec, calls } = manual('s');
    m.add(spec);
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    const aborted = vi.fn();
    calls[0]!.req.signal.addEventListener('abort', aborted);
    m.setRange(d('2027-03-01'), d('2027-03-08'), PARIS);
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(calls[0]!.req.signal.aborted).toBe(true);
    calls[0]!.answer.resolve([{ id: 'late', title: 'late', start: '2026-10-06T09:00[Europe/Paris]' }]);
    await flush();
    expect(store.snapshot.getEvent('late')).toBeUndefined();
    // Back to October: asked again, not served from an aborted request.
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    expect(calls.map((c) => span(c.req))).toEqual(['2026-10-01..2026-11-01', '2027-03-01..2027-04-01', '2026-10-01..2026-11-01']);
  });

  it('keeps a request half of which is still shown', () => {
    const { m } = setup();
    const { spec, calls } = manual('s');
    m.add(spec);
    m.setRange(d('2026-09-28'), d('2026-11-09'), PARIS); // Sep..Nov
    m.setRange(d('2026-11-02'), d('2026-11-09'), PARIS); // Nov only
    expect(calls[0]!.req.signal.aborted).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('a refetch ignores the answer of the generation before it', async () => {
    const { m, store } = setup();
    const { spec, calls } = manual('s');
    m.add(spec);
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    m.refetch('s');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.req.signal.aborted).toBe(true);
    calls[1]!.answer.resolve([{ id: 'new', title: 'new', start: '2026-10-06T09:00[Europe/Paris]' }]);
    calls[0]!.answer.resolve([{ id: 'old', title: 'old', start: '2026-10-06T09:00[Europe/Paris]' }]);
    await flush();
    expect(titles(store)).toEqual(['new']);
  });

  it('a refetch keeps the events on screen until the new answer replaces them', async () => {
    const { m, store } = setup();
    const { spec, calls } = manual('s');
    m.add(spec);
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    calls[0]!.answer.resolve([{ id: 'a', title: 'A', start: '2026-10-06T09:00[Europe/Paris]' }]);
    await flush();
    m.refetch();
    expect(titles(store)).toEqual(['A']);
    calls[1]!.answer.resolve([{ id: 'a', title: 'A2', start: '2026-10-06T09:00[Europe/Paris]' }]);
    await flush();
    expect(titles(store)).toEqual(['A2']);
  });

  it('an event over two chunks belongs to both and leaves with the last', async () => {
    const { m, store } = setup({ keepChunks: 0 });
    const night: EventInput = { id: 'night', title: 'night', start: '2026-10-31T22:00[Europe/Paris]', end: '2026-11-01T02:00[Europe/Paris]' };
    const spec = fnSource('s', ({ window }) => (window!.startDate.month <= 11 && window!.endDate.month >= 11 ? [night] : []));
    m.add(spec);
    m.setRange(d('2026-10-26'), d('2026-11-02'), PARIS); // Oct + Nov: one request
    await flush();
    expect(store.snapshot.getEvent('night')).toBeDefined();
    m.setRange(d('2026-11-02'), d('2026-11-09'), PARIS); // Oct dropped, Nov still holds it
    await flush();
    expect(store.snapshot.getEvent('night')).toBeDefined();
    m.setRange(d('2027-02-01'), d('2027-02-08'), PARIS); // Nov dropped too
    await flush();
    expect(store.snapshot.getEvent('night')).toBeUndefined();
  });

  it('applies a multi-chunk answer as one store change', async () => {
    const { m, store } = setup();
    const { spec, calls } = manual('s');
    m.add(spec);
    m.setRange(d('2026-09-28'), d('2026-11-09'), PARIS);
    const changes: unknown[] = [];
    store.subscribe((c) => changes.push(c));
    calls[0]!.answer.resolve([
      { id: 'a', start: '2026-09-29T09:00[Europe/Paris]' },
      { id: 'b', start: '2026-10-15T09:00[Europe/Paris]' },
      { id: 'c', start: '2026-11-03T09:00[Europe/Paris]' },
    ]);
    await flush();
    expect(changes).toHaveLength(1);
    expect(store.snapshot.counts.events).toBe(3);
  });

  it('a synchronous source is in the store before setRange returns', () => {
    const { m, store } = setup();
    m.add(fnSource('s', () => [{ id: 'a', title: 'A', start: '2026-10-06T09:00[Europe/Paris]' }]));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    expect(titles(store)).toEqual(['A']);
    expect(m.loading).toBe(false);
  });

  it('an unchunked source is fetched once, with no window, and never dropped', () => {
    const { m, store } = setup({ keepChunks: 0 });
    const fetch = vi.fn((_: FetchRequest) => [{ id: 'a', title: 'A', start: '2026-10-06T09:00[Europe/Paris]' }]);
    m.add({ id: 's', fetch, chunk: { unit: 'none', prefetch: 0 } });
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    m.setRange(d('2030-10-05'), d('2030-10-12'), PARIS);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0].window).toBeNull();
    expect(store.snapshot.getEvent('a')).toBeDefined();
  });

  it('changing the zone fetches nothing: a chunk is its dates everywhere', () => {
    const { m } = setup();
    const { spec, calls } = manual('s');
    m.add(spec);
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    m.setRange(d('2026-10-05'), d('2026-10-12'), 'Pacific/Kiritimati');
    m.setRange(d('2026-10-05'), d('2026-10-12'), 'Pacific/Pago_Pago');
    expect(calls).toHaveLength(1);
  });

  it('at most four requests at once, the rest queued', async () => {
    const { m } = setup();
    const sources = Array.from({ length: 6 }, (_, i) => manual(`s${i}`));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    for (const s of sources) m.add(s.spec);
    expect(sources.filter((s) => s.calls.length > 0)).toHaveLength(4);
    sources[0]!.calls[0]!.answer.resolve([]);
    await flush();
    expect(sources.filter((s) => s.calls.length > 0)).toHaveLength(5);
    expect(m.loading).toBe(true);
  });

  it('says when it starts and stops loading', async () => {
    const { m, notices } = setup();
    const { spec, calls } = manual('s');
    m.add(spec);
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    expect(m.loading).toBe(true);
    calls[0]!.answer.resolve([]);
    await m.idle();
    expect(notices.filter((n) => n.type === 'loading')).toEqual([
      { type: 'loading', loading: true },
      { type: 'loading', loading: false },
    ]);
  });

  it('retries with exponential backoff, then reports the error', async () => {
    const pending: { fn: () => void; ms: number }[] = [];
    const timers: Timers = { set: (fn, ms) => pending.push({ fn, ms }), clear: () => {} };
    const { m, notices } = setup({ timers });
    const { spec, calls } = manual('s', undefined, { retry: { attempts: 2, backoffMs: 100 } });
    m.add(spec);
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    calls[0]!.answer.reject(new Error('down'));
    await flush();
    expect(pending.map((p) => p.ms)).toEqual([100]);
    expect(m.loading).toBe(true); // waiting to retry is still loading
    pending.shift()!.fn();
    expect(calls).toHaveLength(2);
    calls[1]!.answer.reject(new Error('down'));
    await flush();
    expect(pending.map((p) => p.ms)).toEqual([200]);
    pending.shift()!.fn();
    calls[2]!.answer.reject(new Error('down'));
    await flush();
    const err = notices.find((n) => n.type === 'error');
    expect(err).toMatchObject({ type: 'error', sourceId: 's', chunks: ['2026-10'] });
    expect(m.loading).toBe(false);
    // The same range again (a locale changed, say): not asked again in a loop.
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    expect(calls).toHaveLength(3);
    // Shown again after moving away: asked again.
    m.setRange(d('2026-11-02'), d('2026-11-09'), PARIS);
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    expect(calls.map((c) => span(c.req)).slice(3)).toEqual(['2026-11-01..2026-12-01', '2026-10-01..2026-11-01']);
  });

  it('a stale chunk is fetched again when shown; a fresh one is not', async () => {
    let t = Temporal.Instant.from('2026-10-17T10:00:00Z');
    const store = createEventStore();
    const m = createSourceManager({ store, normalize: ctx, now: () => t });
    const fetch = vi.fn(() => []);
    m.add({ id: 's', fetch, chunk: { unit: 'month', prefetch: 0 }, staleAfter: Temporal.Duration.from({ minutes: 5 }) });
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    t = t.add({ minutes: 4 });
    m.setRange(d('2026-10-12'), d('2026-10-19'), PARIS);
    expect(fetch).toHaveBeenCalledTimes(1);
    t = t.add({ minutes: 2 });
    m.setRange(d('2026-10-19'), d('2026-10-26'), PARIS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports problems in a delivery, with the source named', async () => {
    const { m, notices } = setup();
    m.add(fnSource('s', () => ({ events: [{ id: 'bad', start: 'yesterday' }], problems: [{ code: 'ical-syntax', severity: 'error', path: 'line 3' }] })));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    const n = notices.find((x) => x.type === 'problems');
    expect(n?.type === 'problems' && n.report.problems.map((p) => [p.code, p.sourceId])).toEqual([
      ['ical-syntax', 's'],
      ['invalid-start', 's'],
    ]);
  });

  it('remove takes the source’s events away', () => {
    const { m, store } = setup();
    m.add(fnSource('s', () => [{ id: 'a', start: '2026-10-06T09:00[Europe/Paris]' }]));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    m.remove('s');
    expect(store.snapshot.counts.events).toBe(0);
    expect(m.ids()).toEqual([]);
  });

  it('replacing a spec keeps the events until the new one answers', async () => {
    const { m, store } = setup();
    m.add(fnSource('s', () => [{ id: 'a', title: 'A', start: '2026-10-06T09:00[Europe/Paris]' }]));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    const next = manual('s');
    m.add(next.spec);
    expect(titles(store)).toEqual(['A']);
    next.calls[0]!.answer.resolve([{ id: 'a', title: 'B', start: '2026-10-06T09:00[Europe/Paris]' }]);
    await flush();
    expect(titles(store)).toEqual(['B']);
  });
});

describe('writing edits back (save)', () => {
  const event: EventInput = { id: 'a', title: 'A', start: '2026-10-06T09:00[Europe/Paris]', end: '2026-10-06T10:00[Europe/Paris]' };

  function editable(save: EventSourceSpec['save']) {
    const { store, m, notices } = setup();
    const answers: ReturnType<typeof deferred<readonly EventInput[]>>[] = [];
    let live = true;
    m.add({
      id: 's',
      chunk: { unit: 'month', prefetch: 0 },
      fetch: () => {
        if (live) return [event];
        const a = deferred<readonly EventInput[]>();
        answers.push(a);
        return a.promise;
      },
      save,
    });
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    live = false;
    const history = createHistory(store, () => ({ normalize: ctx(), weekStart: 1 }), { limit: 50 });
    const start = () => store.snapshot.getEvent('a')!.start.toString();
    return { store, m, notices, history, answers, start };
  }

  it('shows the edit at once, and sends it with what it was', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { history, start, m, notices } = editable(save);
    history.run({ type: 'event.move', id: 'a', start: '2026-10-07T09:00[Europe/Paris]' });
    expect(start()).toBe('2026-10-07T09:00:00+02:00[Europe/Paris]');
    await flush(); // saves of one source go one after the other, from a promise chain
    expect(save).toHaveBeenCalledTimes(1);
    const req = (save.mock.calls[0] as unknown as [import('../src/index.js').SaveRequest])[0];
    expect(req.cause).toBe('command');
    expect(req.edits.map((e) => [e.kind, e.id, e.kind === 'event' && e.before?.start.toString(), e.kind === 'event' && e.after?.start.toString()])).toEqual([
      ['event', 'a', '2026-10-06T09:00:00+02:00[Europe/Paris]', '2026-10-07T09:00:00+02:00[Europe/Paris]'],
    ]);
    await m.idle();
    expect(notices.some((n) => n.type === 'saved')).toBe(true);
  });

  it('a refused save puts the event back, says so, and leaves nothing to undo', async () => {
    const { history, start, m, notices } = editable(() => Promise.reject(new Error('403')));
    history.run({ type: 'event.move', id: 'a', start: '2026-10-07T09:00[Europe/Paris]' });
    await m.idle();
    expect(start()).toBe('2026-10-06T09:00:00+02:00[Europe/Paris]');
    expect(notices.find((n) => n.type === 'save-error')).toMatchObject({ sourceId: 's', reverted: true });
    expect(history.canUndo).toBe(false);
  });

  it('an undo is saved too', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { history, m } = editable(save);
    history.run({ type: 'event.move', id: 'a', start: '2026-10-07T09:00[Europe/Paris]' });
    history.undo();
    await m.idle();
    expect(save.mock.calls.map((c) => (c as unknown as [{ cause: string }])[0].cause)).toEqual(['command', 'undo']);
  });

  it('a refetch while the save is out does not overwrite the edit, then asks again', async () => {
    const pending = deferred<void>();
    const { history, start, m, answers } = editable(() => pending.promise);
    history.run({ type: 'event.move', id: 'a', start: '2026-10-07T09:00[Europe/Paris]' });
    m.refetch();
    answers[0]!.resolve([event]); // the server has not seen the edit yet
    await flush();
    expect(start()).toBe('2026-10-07T09:00:00+02:00[Europe/Paris]');
    pending.resolve();
    await flush();
    await flush();
    // Something came in during the save: the source is asked again for the truth.
    expect(answers).toHaveLength(2);
    answers[1]!.resolve([{ ...event, start: '2026-10-07T09:00[Europe/Paris]', end: '2026-10-07T10:00[Europe/Paris]' }]);
    await m.idle();
    expect(start()).toBe('2026-10-07T09:00:00+02:00[Europe/Paris]');
  });

  it('edits to a source without save stay local (until fetched again)', () => {
    const { store, m } = setup();
    m.add(fnSource('s', () => [event]));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    const history = createHistory(store, () => ({ normalize: ctx(), weekStart: 1 }), { limit: 50 });
    expect(history.run({ type: 'event.move', id: 'a', start: '2026-10-07T09:00[Europe/Paris]' }).ok).toBe(true);
    m.refetch();
    expect(store.snapshot.getEvent('a')!.start.toString()).toBe('2026-10-06T09:00:00+02:00[Europe/Paris]');
  });
});

describe('jsonSource', () => {
  it('asks for the stretch as instants and the zone, and reads the list', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: unknown) => ({ ok: true, status: 200, json: async () => [{ id: 'a', start: '2026-10-06T09:00:00Z' }] }));
    const { m, store } = setup();
    m.add(jsonSource('j', { url: 'https://api.test/events?cal=7', fetchImpl, params: { team: 'a b' } }));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    await m.idle();
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      'https://api.test/events?cal=7&team=a%20b&start=2026-09-30T10%3A00%3A00Z&end=2026-11-01T12%3A00%3A00Z&timeZone=Europe%2FParis',
    );
    expect(store.snapshot.getEvent('a')?.sourceId).toBe('j');
  });

  it('posts a form when asked, and maps the JSON', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: { method: string; body?: string; headers: Record<string, string> }) => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: 'a', start: '2026-10-06T09:00:00Z' }] }),
    }));
    const { m, store } = setup();
    m.add(jsonSource('j', { url: '/e', method: 'POST', fetchImpl, startParam: 'from', zoneParam: null, map: (raw) => (raw as { items: EventInput[] }).items }));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    await m.idle();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/e');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('from=2026-09-30T10%3A00%3A00Z&end=2026-11-01T12%3A00%3A00Z');
    expect(init.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(store.snapshot.counts.events).toBe(1);
  });

  it('an HTTP error is a failed fetch', async () => {
    const fetchImpl = async () => ({ ok: false, status: 503, json: async () => null });
    const { m, notices } = setup();
    m.add(jsonSource('j', { url: '/e', fetchImpl }));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    await m.idle();
    const err = notices.find((n) => n.type === 'error');
    expect(err?.type === 'error' && (err.error as Error).message).toBe('HTTP 503');
  });
});

describe('overrides as input (RECURRENCE-ID)', () => {
  const weekly: EventInput = { id: 'w', title: 'standup', start: '2026-10-05T09:30[Europe/Paris]', duration: { minutes: 15 }, rrule: 'FREQ=WEEKLY;COUNT=4' };

  it('joins its series, keyed in the series’ zone, and replaces that occurrence', () => {
    // Given in New York's wall time: 03:30 there is 09:30 in Paris on 12 October.
    const moved: EventInput = { id: 'w@2', seriesId: 'w', recurrenceId: '2026-10-12T03:30[America/New_York]', title: 'standup (late)', start: '2026-10-12T11:00[Europe/Paris]' };
    const { items, report } = normalizeMany([moved, weekly], ctx(), 'src');
    expect(report.problems).toEqual([]);
    const series = items.find((i) => i.kind === 'series');
    expect(series?.kind === 'series' && [...series.series.overrides]).toEqual([['2026-10-12T09:30:00+02:00[Europe/Paris]', 'w@2']]);
    const store = createEventStore();
    store.replaceSourceChunk('src', '*', items);
    const shown = store.snapshot.queryInstances(viewWindow(d('2026-10-05'), d('2026-11-02'), PARIS)).map((i) => `${i.event.start.toString().slice(0, 10)} ${i.event.title}`);
    expect(shown).toEqual(['2026-10-05 standup', '2026-10-12 standup (late)', '2026-10-19 standup', '2026-10-26 standup']);
  });

  it('round-trips through exportInputs', () => {
    const moved: EventInput = { id: 'w@2', seriesId: 'w', recurrenceId: '2026-10-12T09:30[Europe/Paris]', title: 'late', start: '2026-10-12T11:00[Europe/Paris]' };
    const store = createEventStore();
    store.replaceSourceChunk('src', '*', normalizeMany([weekly, moved], ctx(), 'src').items);
    const again = createEventStore();
    again.replaceSourceChunk('src', '*', normalizeMany(exportInputs(store.snapshot), ctx(), 'src').items);
    const w = viewWindow(d('2026-10-05'), d('2026-11-02'), PARIS);
    const show = (s: typeof store) => s.snapshot.queryInstances(w).map((i) => `${i.key} ${i.event.start} ${i.event.title}`);
    expect(show(again)).toEqual(show(store));
  });

  it('without its series it stays an event, with a warning; a bad one is refused', () => {
    const { items, report } = normalizeMany(
      [
        { id: 'x', seriesId: 'nope', recurrenceId: '2026-10-12T09:30[Europe/Paris]', start: '2026-10-12T11:00[Europe/Paris]' },
        { id: 'y', seriesId: 'w', recurrenceId: 'soon', start: '2026-10-12T11:00[Europe/Paris]' },
        { id: 'z', recurrenceId: '2026-10-12T09:30[Europe/Paris]', start: '2026-10-12T11:00[Europe/Paris]' },
      ],
      ctx(),
    );
    expect(report.problems.map((p) => p.code)).toEqual(['invalid-recurrence-id', 'invalid-recurrence-id', 'orphan-override']);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind === 'event' && items[0]!.event.ref).toBeUndefined();
  });
});

describe('kernel with sources', () => {
  it('fetches what each view shows as it moves, not again on a zone change', async () => {
    const { createKernel } = await import('../src/index.js');
    const asked: string[] = [];
    const k = createKernel({
      timeZone: PARIS,
      locale: 'fr-FR',
      initialDate: d('2026-10-21'),
      initialView: 'timeGridWeek',
      now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'),
      sources: [fnSource('s', (r) => (asked.push(span(r)), [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]' }]))],
    });
    expect(asked).toEqual(['2026-10-01..2026-11-01']);
    expect(k.store.snapshot.getEvent('a')?.sourceId).toBe('s');
    k.navigate('next'); // 26 Oct – 1 Nov: still October
    k.navigate('next'); // 2 – 8 Nov
    k.setTimeZone('Asia/Kolkata');
    k.setView('dayGridMonth'); // November's grid runs into December
    expect(asked).toEqual(['2026-10-01..2026-11-01', '2026-11-01..2026-12-01', '2026-12-01..2027-01-01']);
    k.destroy();
  });
});

describe('review fixes', () => {
  const weekly: EventInput = { id: 'w', title: 'standup', start: '2026-10-05T09:00[Europe/Paris]', duration: { minutes: 30 }, rrule: 'FREQ=WEEKLY;COUNT=6' };
  const KEY = '2026-10-12T09:00:00+02:00[Europe/Paris]';

  function seriesSource(save: EventSourceSpec['save'], server: () => readonly EventInput[] = () => [weekly]) {
    const { store, m, notices } = setup();
    m.add({ id: 's', chunk: { unit: 'none', prefetch: 0 }, fetch: () => server(), save });
    m.setRange(d('2026-10-05'), d('2026-11-16'), PARIS);
    const history = createHistory(store, () => ({ normalize: ctx(), weekStart: 1 }), { limit: 50 });
    const shown = () =>
      store.snapshot.queryInstances(viewWindow(d('2026-10-05'), d('2026-11-16'), PARIS)).map((i) => `${i.event.start.toString().slice(5, 16)} ${i.event.title}`);
    return { store, m, notices, history, shown };
  }

  it('moving one occurrence sends the series and the override it made', async () => {
    const save = vi.fn((_: import('../src/index.js').SaveRequest) => Promise.resolve());
    const { history, m } = seriesSource(save);
    expect(history.run({ type: 'event.move', id: `w@${KEY}`, start: '2026-10-12T11:00[Europe/Paris]' }).ok).toBe(true);
    await m.idle();
    const sent = save.mock.calls[0]![0].edits.map((e) => `${e.kind}:${e.kind === 'event' ? (e.after?.ref ? 'override' : e.id) : e.id}`);
    expect(sent.sort()).toEqual(['event:override', 'series:w']);
  });

  it('a refused occurrence edit leaves neither the override nor a double', async () => {
    const { history, m, shown } = seriesSource(() => Promise.reject(new Error('no')));
    history.run({ type: 'event.move', id: `w@${KEY}`, start: '2026-10-12T11:00[Europe/Paris]' });
    await m.idle();
    expect(shown().filter((x) => x.startsWith('10-12'))).toEqual(['10-12T09:00 standup']);
  });

  it('"this and following" sends the cut series and its new tail', async () => {
    const save = vi.fn((_: import('../src/index.js').SaveRequest) => Promise.resolve());
    const { history, m } = seriesSource(save);
    expect(history.run({ type: 'event.move', id: `w@${KEY}`, scope: 'following', start: '2026-10-12T10:00[Europe/Paris]' }).ok).toBe(true);
    await m.idle();
    const series = save.mock.calls[0]![0].edits.filter((e) => e.kind === 'series');
    expect(series).toHaveLength(2);
    expect(series.some((e) => e.kind === 'series' && e.after?.splitFrom?.seriesId === 'w')).toBe(true);
  });

  it('an override saved and delivered back under its id is adopted, not refused', async () => {
    let server: EventInput[] = [weekly];
    const { history, m, store, shown, notices } = seriesSource(
      async (req) => {
        // The server stores what it is sent.
        const { eventInput, seriesInput } = await import('../src/index.js');
        for (const e of req.edits) {
          const input = e.kind === 'event' ? (e.after ? eventInput(e.after) : null) : e.after ? seriesInput(e.after) : null;
          server = server.filter((x) => x.id !== e.id);
          if (input) server.push(input);
        }
      },
      () => server,
    );
    history.run({ type: 'event.move', id: `w@${KEY}`, start: '2026-10-12T11:00[Europe/Paris]' });
    await m.idle();
    m.refetch();
    await m.idle();
    expect(notices.some((n) => n.type === 'problems')).toBe(false);
    expect(shown().filter((x) => x.startsWith('10-12'))).toEqual(['10-12T11:00 standup']);
    expect([...store.snapshot.getSeries('w')!.overrides.keys()]).toEqual([KEY]);
  });

  it('a source cannot take the id of the kernel’s own events', () => {
    const { m, notices } = setup();
    const m2 = createSourceManager({ store: createEventStore(), normalize: ctx, reserved: ['events'], notify: (n) => notices.push(n) });
    m2.add(fnSource('events', () => []));
    expect(m2.ids()).toEqual([]);
    const n = notices.find((x) => x.type === 'problems');
    expect(n?.type === 'problems' && n.report.problems.map((p) => p.code)).toEqual(['duplicate-id']);
    m.destroy();
  });

  it('removing a source lets the queued requests of the others go', async () => {
    const { m } = setup({ maxConcurrent: 1 });
    const a = manual('a');
    const b = manual('b');
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    m.add(a.spec);
    m.add(b.spec);
    expect(b.calls).toHaveLength(0);
    m.remove('a');
    expect(b.calls).toHaveLength(1);
    b.calls[0]!.answer.resolve([]);
    await m.idle();
    expect(m.loading).toBe(false);
  });

  it('a new spec with another chunk unit drops what the old chunks held', async () => {
    const { m, store } = setup();
    m.add(fnSource('s', () => [{ id: 'a', start: '2026-10-06T09:00[Europe/Paris]' }]));
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    m.add(fnSource('s', () => [], { chunk: { unit: 'week', prefetch: 0 } }));
    expect(store.snapshot.getEvent('a')).toBeUndefined();
  });

  it('a chunk with a save out is not evicted', async () => {
    const pending = deferred<void>();
    const { store, m } = setup({ keepChunks: 0 });
    m.add({ ...fnSource('s', () => [{ id: 'a', title: 'A', start: '2026-10-06T09:00[Europe/Paris]' }]), save: () => pending.promise });
    m.setRange(d('2026-10-05'), d('2026-10-12'), PARIS);
    const history = createHistory(store, () => ({ normalize: ctx(), weekStart: 1 }), { limit: 50 });
    history.run({ type: 'event.move', id: 'a', start: '2026-10-07T09:00[Europe/Paris]' });
    m.setRange(d('2027-03-01'), d('2027-03-08'), PARIS);
    expect(store.snapshot.getEvent('a')?.start.toString()).toBe('2026-10-07T09:00:00+02:00[Europe/Paris]');
    pending.resolve();
    await m.idle();
  });
});

describe('hold: other dates fetched and kept beside the shown ones (printing, exports)', () => {
  it('fetches December beside October, ready once loaded, kept while held, then a spare chunk', async () => {
    const { store, m } = setup({ keepChunks: 0 });
    const s = manual('s');
    m.add(s.spec);
    m.setRange(d('2026-10-01'), d('2026-11-01'), PARIS);
    expect(s.calls.map((c) => span(c.req))).toEqual(['2026-10-01..2026-11-01']);
    const h = m.hold(d('2026-12-01'), d('2027-01-01'));
    expect(s.calls.map((c) => span(c.req))).toEqual(['2026-10-01..2026-11-01', '2026-12-01..2027-01-01']);
    let ready: readonly string[] | null = null;
    void h.ready.then((r) => (ready = r.failed));
    s.calls[0]!.answer.resolve([{ id: 'o', title: 'Oct', start: '2026-10-21T09:00[Europe/Paris]' }]);
    await flush();
    expect(ready).toBe(null);
    s.calls[1]!.answer.resolve([{ id: 'x', title: 'Dec', start: '2026-12-21T09:00[Europe/Paris]' }]);
    await flush();
    expect([ready, titles(store)]).toEqual([[], ['Oct', 'Dec']]);
    // Moving the shown range does not drop what is held.
    m.setRange(d('2026-11-01'), d('2026-12-01'), PARIS);
    expect(titles(store)).toContain('Dec');
    h.release();
    // Released, with no spare chunk kept: gone (October too, no longer shown).
    expect(titles(store)).toEqual([]);
  });
});

describe('hold: what could not be loaded is said', () => {
  it('December fails: ready names it (source:chunk); what the file lacks is known', async () => {
    const { m } = setup();
    const s = manual('s');
    m.add(s.spec);
    const h = m.hold(d('2026-12-01'), d('2027-01-01'));
    s.calls[0]!.answer.reject(new Error('503'));
    await flush();
    const r = await h.ready;
    expect(r.failed.length === 1 && r.failed[0]!.startsWith('s:')).toBe(true);
    h.release();
  });
});

