import { describe, it, expect, afterEach, vi } from 'vitest';
import { Temporal, createKernel } from '../src/index.js';
import { liveSource, sseSource } from '../src/live.js';
import type { LiveMessage } from '../src/live.js';
import type { EventInput } from '../src/index.js';

// Sources that are told, not asked (owner, 2026-11-05): `@dzcalendar/core/live`.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const make = (sources: Parameters<typeof createKernel>[0]['sources']) =>
  createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', initialDate: Temporal.PlainDate.from('2026-10-21'), initialView: 'timeGridWeek', now, ...(sources && { sources }) });
const run = (id: string, title: string, extra: object = {}) => ({ id, title, start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 20 }, ...extra });

describe('liveSource', () => {
  it('each message changes its events: made, changed (props merged), gone, all anew; closed when removed', async () => {
    let emit: (m: LiveMessage | readonly LiveMessage[]) => void = () => undefined;
    let closed = 0;
    const k = make([liveSource('runs', { connect: (e) => ((emit = e), () => void closed++) })]);
    const seen = () => [...k.store.snapshot.allEvents()].filter((e) => e.sourceId === 'runs').map((e) => `${e.id}:${e.title}:${String(e.props['status'])}`).sort();
    emit({ create: run('a', 'Import', { extendedProps: { status: 'running', rows: 3 } }) });
    await k.sources.idle();
    const made = seen();
    emit([{ update: 'a', patch: { extendedProps: { status: 'ok' } } }, { create: run('b', 'Billing') }]);
    await k.sources.idle();
    const changed = seen();
    const rows = k.store.snapshot.getEvent('a')?.props['rows'];
    emit({ remove: 'b' });
    await k.sources.idle();
    const removed = seen();
    emit({ reset: [run('c', 'Backup')] });
    await k.sources.idle();
    const reset = seen();
    k.sources.remove('runs');
    expect([made, changed, rows, removed, reset, closed, seen()]).toEqual([
      ['a:Import:running'],
      ['a:Import:ok', 'b:Billing:undefined'],
      3,
      ['a:Import:ok'],
      ['c:Backup:undefined'],
      1,
      [],
    ]);
    k.destroy();
  });

  it('an update of an event it never had changes nothing; one without an id is given one; destroy closes it', async () => {
    let emit: (m: LiveMessage | readonly LiveMessage[]) => void = () => undefined;
    let closed = 0;
    const k = make([liveSource('feed', { connect: (e) => ((emit = e), () => void closed++) })]);
    emit([{ update: 'nobody', patch: { title: 'x' } }, { create: { title: 'Anonymous', start: '2026-10-21T10:00[Europe/Paris]' } }]);
    await k.sources.idle();
    const ids = [...k.store.snapshot.allEvents()].map((e) => e.id);
    k.destroy();
    expect([ids, closed]).toEqual([['feed-1'], 1]);
  });
});

describe('sseSource', () => {
  class FakeES {
    static made: FakeES[] = [];
    readyState = 0;
    closed = false;
    readonly listeners = new Map<string, ((e: { data?: unknown; lastEventId?: string }) => void)[]>();
    constructor(readonly url: string) {
      FakeES.made.push(this);
    }
    addEventListener(type: string, f: (e: { data?: unknown; lastEventId?: string }) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), f]);
    }
    fire(type: string, e: { data?: unknown; lastEventId?: string }) {
      for (const f of this.listeners.get(type) ?? []) f(e);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }
  afterEach(() => {
    vi.useRealTimers();
    FakeES.made = [];
    delete (globalThis as { EventSource?: unknown }).EventSource;
  });

  it('reads JSON messages and named events through map; closed for good by the server, opened again with the last id', async () => {
    vi.useFakeTimers();
    (globalThis as { EventSource?: unknown }).EventSource = FakeES;
    const k = make([
      sseSource('runs', '/api/runs?team=ops', {
        events: ['run'],
        reopenAfterMs: 1000,
        map: (data) => {
          const d = data as { kind: string; id: string; title?: string };
          return d.kind === 'start' ? { create: run(d.id, d.title ?? '') } : d.kind === 'end' ? { update: d.id, patch: { title: `${d.title} ✓` } } : null;
        },
      }),
    ]);
    const es = FakeES.made[0]!;
    es.fire('message', { data: JSON.stringify({ kind: 'start', id: 'a', title: 'Import' }), lastEventId: '41' });
    es.fire('run', { data: JSON.stringify({ kind: 'end', id: 'a', title: 'Import' }), lastEventId: '42' });
    es.fire('message', { data: 'not json', lastEventId: '43' });
    await k.sources.idle();
    const title = k.store.snapshot.getEvent('a')?.title;
    // The server ends the stream with an error status: the browser does not try again, the source does.
    es.readyState = 2;
    es.fire('error', {});
    vi.advanceTimersByTime(1000);
    const again = FakeES.made[1]?.url;
    k.destroy();
    expect([title, es.closed, again, FakeES.made[1]?.closed]).toEqual(['Import ✓', true, '/api/runs?team=ops&lastEventId=43', true]);
  });

  it('without an EventSource (a server render): nothing opened, nothing thrown', () => {
    const k = make([sseSource('runs', '/api/runs', { map: () => null })]);
    expect(FakeES.made.length).toBe(0);
    k.destroy();
  });
});

describe('liveSource and forget (review)', () => {
  it('what the calendar forgot is not brought back by the next message, nor kept by the source', async () => {
    let emit: (m: LiveMessage | readonly LiveMessage[]) => void = () => undefined;
    let fetched: readonly EventInput[] = [];
    const spec = liveSource('feed', { connect: (e) => ((emit = e), () => undefined) });
    const k = make([{ ...spec, fetch: (r) => (fetched = spec.fetch(r) as readonly EventInput[]) }]);
    emit([{ create: { id: 'old', title: 'Old', start: '2026-10-10T09:00[Europe/Paris]', duration: { hours: 1 } } }, { create: run('new', 'New') }]);
    await k.sources.idle();
    k.forgetBefore(Temporal.Instant.from('2026-10-14T08:00:00Z'));
    emit({ create: run('newer', 'Newer', { start: '2026-10-21T10:00[Europe/Paris]' }) });
    await k.sources.idle();
    const ids = [...k.store.snapshot.allEvents()].map((e) => e.id).sort();
    expect([ids, fetched.length]).toEqual([['new', 'newer'], 2]);
    k.destroy();
  });
});
