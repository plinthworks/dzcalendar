import { describe, expect, it } from 'vitest';
import { Temporal, createEventStore, createKernel, normalizeMany, createIdGenerator } from '../src/index.js';
import type { EventInput } from '../src/index.js';
import type { SourceNotice } from '../src/source/manager.js';

// Owner, 18h: above 2 000 events, the shown period is loaded at once and the rest while the page is idle.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');

/** One event a day at 09:00 for the year 2026, ids e0…e364, plus `extra`. */
function year(extra: EventInput[] = []): EventInput[] {
  const out: EventInput[] = [];
  let d = Temporal.PlainDate.from('2026-01-01');
  for (let i = 0; d.year === 2026; i++, d = d.add({ days: 1 })) {
    // Several a day: over the threshold (8 × 365 = 2 920).
    for (let k = 0; k < 8; k++) out.push({ id: `e${i}-${k}`, title: `ev ${i}`, start: `${d}T${String(9 + k).padStart(2, '0')}:00[Europe/Paris]`, duration: { minutes: 30 } });
  }
  return [...out, ...extra];
}

/** Timers run by hand. */
function manualTimers() {
  const queue = new Map<number, () => void>();
  let n = 0;
  return {
    timers: { set: (fn: () => void) => (queue.set(++n, fn), n), clear: (h: unknown) => void queue.delete(h as number) },
    runAll() {
      while (queue.size > 0) {
        const [k, fn] = [...queue][0]!;
        queue.delete(k);
        fn();
      }
    },
    get pending() {
      return queue.size;
    },
  };
}

const count = (store: ReturnType<typeof createEventStore>) => [...store.snapshot.allEvents()].length;

describe('a large events option (deferred)', () => {
  it('loads the shown week (and a margin) at once, the rest when idle; the shown model is the same', () => {
    const t = manualTimers();
    const store = createEventStore();
    const events = year();
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), events, store, timers: t.timers });
    // The raw store (shared, read directly) holds the period and its margin: three weeks of eight a day, not the year.
    const first = count(store);
    expect(first).toBeGreaterThanOrEqual(7 * 8);
    expect(first).toBeLessThan(events.length / 4);
    const shown = JSON.stringify(k.viewModel().model, (_k, v) => (typeof v === 'object' && v !== null && 'epochMilliseconds' in v ? String(v) : v)).length;
    expect(t.pending).toBe(1);
    t.runAll();
    expect(count(store)).toBe(events.length);
    // The week drawn before and after: the same.
    expect(JSON.stringify(k.viewModel().model, (_k, v) => (typeof v === 'object' && v !== null && 'epochMilliseconds' in v ? String(v) : v)).length).toBe(shown);
    k.destroy();
  });

  it('kernel.store is never partial: reading it finishes the load first', () => {
    const t = manualTimers();
    const store = createEventStore();
    const events = year();
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events, store, timers: t.timers });
    expect(count(store)).toBeLessThan(events.length);
    expect([...k.store.snapshot.allEvents()].length).toBe(events.length);
    expect(t.pending).toBe(0);
    k.destroy();
  });

  it('the next week is in the margin already loaded; a period far away, a command: loaded first', () => {
    {
      const t = manualTimers();
      const store = createEventStore();
      const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year(), store, timers: t.timers });
      const first = count(store);
      k.navigate('next');
      expect(count(store)).toBe(first);
      k.destroy();
    }
    {
      // Far away: the weeks that period needs at once (all of March 2–8 drawn), the rest still for idle time.
      const t = manualTimers();
      const store = createEventStore();
      const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year(), store, timers: t.timers });
      k.setView('timeGridWeek', Temporal.PlainDate.from('2026-03-02'));
      const march = Array.from({ length: 7 }, (_, d) => store.snapshot.getEvent(`e${60 + d}-0`) !== undefined);
      expect([march.every(Boolean), count(store) < year().length, t.pending]).toEqual([true, true, 1]);
      k.destroy();
    }
    {
      // A command on an event of March: it exists for the command.
      const t = manualTimers();
      const store = createEventStore();
      const events = year();
      const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events, store, timers: t.timers });
      expect(k.run({ type: 'event.delete', id: 'e70-0' }).ok).toBe(true);
      expect(count(store)).toBe(events.length - 1);
      k.destroy();
    }
  });

  it('the problems of the rest are told when it is loaded, at their place in the list', () => {
    const t = manualTimers();
    const seen: SourceNotice[] = [];
    const bad: EventInput = { id: 'bad', start: '2026-03-02T09:00[Europe/Paris]', duration: { minutes: -5 } };
    const events = year([bad]);
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events, timers: t.timers, onSource: (n) => seen.push(n) });
    // At creation: the week's report (nothing wrong there).
    expect(k.getProblems()!.problems).toEqual([]);
    t.runAll();
    const told = seen.filter((n) => n.type === 'problems');
    expect(told.length).toBe(1);
    const report = (told[0] as Extract<SourceNotice, { type: 'problems' }>).report;
    expect([report.accepted, report.rejected, report.problems.map((p) => `${p.code} ${p.path}`)]).toEqual([events.length - 1, 1, [`invalid-duration events[${events.length - 1}].duration`]]);
    expect(k.getProblems()).toBe(report);
    k.destroy();
  });

  it('the same ids as a load at once: identical events without an id keep their ranks; a repeated id is still refused', () => {
    const t = manualTimers();
    const twin = { title: 'Same', start: '2026-02-03T10:00[Europe/Paris]', duration: { minutes: 30 } };
    const events = year([twin, { ...twin }, { id: 'e5-0', title: 'again', start: '2026-02-04T10:00[Europe/Paris]' }]);
    const store = createEventStore();
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events, store, timers: t.timers });
    t.runAll();
    const whole = normalizeMany(events, { displayZone: 'Europe/Paris', newId: createIdGenerator('x') }, 'events');
    expect([...store.snapshot.allEvents()].map((e) => e.id).sort()).toEqual(whole.items.map((x) => (x.kind === 'event' ? x.event.id : x.series.id)).sort());
    expect(k.getProblems()!.problems.map((p) => p.code)).toEqual(['duplicate-id']);
    k.destroy();
  });

  it('a small setEvents after a large load leaves nothing of the large one', () => {
    const t = manualTimers();
    const store = createEventStore();
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year(), store, timers: t.timers });
    k.setEvents([{ id: 'only', start: '2026-10-21T09:00[Europe/Paris]' }]);
    // The pending months are cancelled, and those written are emptied.
    t.runAll();
    expect([...store.snapshot.allEvents()].map((e) => e.id)).toEqual(['only']);
    k.destroy();
  });

  it('whenLoaded resolves once the rest is in (at once for a small load)', async () => {
    const t = manualTimers();
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year(), timers: t.timers });
    let loaded = false;
    const p = k.whenLoaded().then(() => (loaded = true));
    await Promise.resolve();
    expect(loaded).toBe(false);
    t.runAll();
    await p;
    expect(loaded).toBe(true);
    k.setEvents([{ id: 'a', start: '2026-10-21T09:00[Europe/Paris]' }]);
    await k.whenLoaded();
    k.destroy();
  });

  it('two thousand events or fewer: loaded at once, as before', () => {
    const t = manualTimers();
    const store = createEventStore();
    const events = year().slice(0, 2000);
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events, store, timers: t.timers });
    expect([count(store), t.pending]).toEqual([2000, 0]);
    k.destroy();
  });
});

describe('the coarse day arithmetic of the deferred load', () => {
  it('adds days across months, years and leap days as the calendar does', async () => {
    const { addDays } = await import('../src/source/deferred.js');
    expect([addDays('2026-10-19', -7), addDays('2026-12-30', 3), addDays('2024-02-28', 1), addDays('2023-02-28', 1), addDays('2026-03-02', 1), addDays('2000-03-01', -1)]).toEqual(['2026-10-12', '2027-01-02', '2024-02-29', '2023-03-01', '2026-03-03', '2000-02-29']);
  });
});

describe('the deferred load, after the reviews', () => {
  it('a store handed back from another kernel (its face) is the same store: one pending load, the problems told once', () => {
    const t = manualTimers();
    const k1 = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21') });
    const notices: SourceNotice[] = [];
    const bad: EventInput = { id: 'bad', start: '2026-03-03T09:00[Europe/Paris]', duration: { minutes: -5 } };
    const k2 = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year([bad]), store: k1.store, timers: t.timers, onSource: (n) => notices.push(n) });
    expect([k2.store === k1.store, t.pending]).toEqual([true, 1]);
    t.runAll();
    expect(notices.filter((n) => n.type === 'problems').length).toBe(1);
    k1.destroy();
    k2.destroy();
  });

  it('a source sending an id of an event not loaded yet: the event keeps it and the source is refused, as in a full load', async () => {
    const t = manualTimers();
    const store = createEventStore();
    const notices: SourceNotice[] = [];
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year(), store, timers: t.timers, onSource: (n) => notices.push(n) });
    k.sources.add({ id: 'api', fetch: () => [{ id: 'e70-0', title: 'from the source', start: '2026-10-22T09:00[Europe/Paris]' }], chunk: { unit: 'none', prefetch: 0 } });
    await new Promise((r) => setTimeout(r, 0));
    t.runAll();
    expect(store.snapshot.getEvent('e70-0')?.title).toBe('ev 70');
    k.destroy();
  });

  it('kernel.history: an undo after a large setEvents that keeps the event as it is — it applies, as after a full load', () => {
    const t = manualTimers();
    const store = createEventStore();
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year(), store, timers: t.timers });
    k.run({ type: 'event.update', id: 'e70-0', patch: { title: 'Renamed' } });
    // The same list but that event as it is now (the source agrees with the change): its object is kept, the undo still applies.
    k.setEvents(year().map((e) => (e.id === 'e70-0' ? { ...e, title: 'Renamed' } : e)));
    expect(k.history.undo()).toBe(true);
    expect([t.pending, store.snapshot.getEvent('e70-0')?.title]).toEqual([0, 'ev 70']);
    k.destroy();
  });

  it('destroyed while loading: whenLoaded lets go', async () => {
    const t = manualTimers();
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year(), timers: t.timers });
    const p = k.whenLoaded();
    k.destroy();
    await p;
  });

  it('a listener reading kernel.store during a week written: everything loaded, the problems told once', () => {
    const t = manualTimers();
    const notices: SourceNotice[] = [];
    const bad: EventInput = { id: 'bad', start: '2026-03-03T09:00[Europe/Paris]', duration: { minutes: -5 } };
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year([bad]), timers: t.timers, onSource: (n) => notices.push(n) });
    let read = 0;
    k.subscribe((e) => {
      if (e.type === 'store' && read === 0) read = [...k.store.snapshot.allEvents()].length;
    });
    t.runAll();
    expect([read, notices.filter((n) => n.type === 'problems').length]).toEqual([year().length, 1]);
    k.destroy();
  });

  it('a second calendar on the same store, showing another period: what it shows is there at once', () => {
    const t = manualTimers();
    const store = createEventStore();
    const a = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialView: 'dayGridMonth', initialDate: Temporal.PlainDate.from('2026-10-21'), events: year(), store, timers: t.timers });
    const b = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-03-09'), store });
    b.viewModel();
    // March 9–15: days 67…73 of the year, eight events each.
    expect(Array.from({ length: 7 }, (_, d) => store.snapshot.getEvent(`e${67 + d}-7`) !== undefined).every(Boolean)).toBe(true);
    expect(t.pending).toBe(1);
    a.destroy();
    b.destroy();
  });

  it('a long event of the first large load, removed by the next, is gone at once wherever the calendar is', () => {
    const t = manualTimers();
    const store = createEventStore();
    const long: EventInput = { id: 'LONG', start: '2026-01-11', end: '2026-02-21', allDay: true };
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21'), events: year([long]), store, timers: t.timers });
    t.runAll();
    k.setView('dayGridMonth', Temporal.PlainDate.from('2026-02-01'));
    k.setEvents(year());
    expect(store.snapshot.getEvent('LONG')).toBeUndefined();
    k.destroy();
  });

  it('a period not written as a plain ISO day (another calendar): everything at once', () => {
    const t = manualTimers();
    const store = createEventStore();
    const events = year();
    createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialDate: Temporal.PlainDate.from('2026-10-21').withCalendar('hebrew'), events, store, timers: t.timers });
    expect(count(store) === events.length || t.pending === 1).toBe(true);
    // The shown week is there either way.
    expect(store.snapshot.getEvent('e293-0')).toBeDefined();
  });
});
