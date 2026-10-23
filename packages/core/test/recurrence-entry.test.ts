import { afterEach, describe, expect, it } from 'vitest';
import { createIdGenerator, normalizeEvent } from '../src/index.js';
import { recurrenceEngine, useRecurrence } from '../src/recurrence/engine.js';

// Owner, 18i: repeating events are an entry of their own; without it, an rrule is refused and said.
const engine = recurrenceEngine();
afterEach(() => useRecurrence(engine));

describe('the recurrence entry', () => {
  it('without it, an event with rrule is refused: recurrence-not-loaded, at its rrule', () => {
    useRecurrence(null);
    const r = normalizeEvent({ id: 's', start: '2026-10-21T09:00[Europe/Paris]', rrule: 'FREQ=WEEKLY' }, { displayZone: 'Europe/Paris', newId: createIdGenerator('x') });
    expect(r.ok ? 'accepted' : r.problems.map((p) => `${p.code} ${p.path}`)).toEqual(['recurrence-not-loaded event.rrule']);
    expect(r.ok ? [] : r.problems.map((p) => p.code)).toEqual(['recurrence-not-loaded']);
  });

  it('with it, the same event is a series; an event without rrule never needs it', () => {
    const ctx = { displayZone: 'Europe/Paris', newId: createIdGenerator('x') };
    const r = normalizeEvent({ id: 's', start: '2026-10-21T09:00[Europe/Paris]', rrule: 'FREQ=WEEKLY' }, ctx);
    expect(r.ok && r.value.kind).toBe('series');
    useRecurrence(null);
    expect(normalizeEvent({ id: 'e', start: '2026-10-21T09:00[Europe/Paris]' }, ctx).ok).toBe(true);
  });
});

describe('without the recurrence entry, after the 18i review', () => {
  it('a source delivering a repeating event: the problem, no throw; a series handed to the store by hand: a plain error', async () => {
    const { createEventStore, createSourceManager, fnSource, Temporal } = await import('../src/index.js');
    useRecurrence(null);
    const notices: { type: string; report?: { problems: readonly { code: string }[] } }[] = [];
    const store = createEventStore();
    const m = createSourceManager({ store, normalize: () => ({ displayZone: 'Europe/Paris', newId: createIdGenerator('s') }), notify: (n) => notices.push(n as never) });
    m.add(fnSource('api', () => [{ id: 'r', start: '2026-10-21T09:00[Europe/Paris]', rrule: 'FREQ=DAILY' }, { id: 'e', start: '2026-10-21T10:00[Europe/Paris]' }]));
    m.setRange(Temporal.PlainDate.from('2026-10-19'), Temporal.PlainDate.from('2026-10-26'), 'Europe/Paris');
    await new Promise((r) => setTimeout(r, 0));
    expect([...store.snapshot.allEvents()].map((e) => e.id)).toEqual(['e']);
    expect(notices.flatMap((n) => n.report?.problems.map((p) => p.code) ?? [])).toEqual(['recurrence-not-loaded']);
    m.destroy();
  });
});
