import { describe, it, expect } from 'vitest';
import { Temporal, createIdGenerator, createKernel, normalizeEvent, itemEvent } from '../src/index.js';
import type { CalEvent, EventInput, Instant, TimedEvent } from '../src/index.js';

// Still running (owner, 2026-11-05): drawn from its start to now, growing; its end or duration, the length expected.
let clock = Temporal.Instant.from('2026-10-21T09:37:00Z');
const now = (): Instant => clock;
const ctx = { displayZone: 'Europe/Paris', newId: createIdGenerator('t'), now };
const timed = (input: EventInput) => {
  const r = normalizeEvent(input, ctx);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return { event: itemEvent(r.value) as TimedEvent, codes: r.problems.map((p) => p.code) };
};
const errors = (input: EventInput) => {
  const r = normalizeEvent(input, ctx);
  return r.ok ? [] : r.problems.filter((p) => p.severity === 'error').map((p) => p.code);
};
const ends = (e: CalEvent | undefined) => (e && !e.allDay ? [e.end.toString(), e.expectedEnd?.toString() ?? null, e.ongoing ?? false] : null);

describe('an event still running (ongoing)', () => {
  it('ends where now is (11:37 in Paris), its expected end kept; none given, it still ends now; a later expected end stands', () => {
    clock = Temporal.Instant.from('2026-10-21T09:37:00Z');
    // Started 11:00, expected 20 minutes: 11:20 is past, so now; started 11:30 expected an hour: 12:30 stands.
    expect([
      ends(timed({ start: '2026-10-21T11:00[Europe/Paris]', duration: { minutes: 20 }, ongoing: true }).event),
      ends(timed({ start: '2026-10-21T11:00[Europe/Paris]', ongoing: true }).event),
      ends(timed({ start: '2026-10-21T11:30[Europe/Paris]', end: '2026-10-21T12:30[Europe/Paris]', ongoing: true }).event),
    ]).toEqual([
      ['2026-10-21T11:37:00+02:00[Europe/Paris]', '2026-10-21T11:20:00+02:00[Europe/Paris]', true],
      ['2026-10-21T11:37:00+02:00[Europe/Paris]', null, true],
      ['2026-10-21T12:30:00+02:00[Europe/Paris]', '2026-10-21T12:30:00+02:00[Europe/Paris]', true],
    ]);
  });

  it('a date alone or a series cannot be running: refused', () => {
    expect(errors({ start: '2026-10-21', ongoing: true })).toEqual(['ongoing-not-timed']);
    expect(errors({ start: '2026-10-21T11:00[Europe/Paris]', rrule: 'FREQ=DAILY', ongoing: true })).toEqual(['ongoing-not-timed']);
  });

  it('the kernel brings it up to now each time it is asked (no undo entry); finished without an end, it ends now', () => {
    clock = Temporal.Instant.from('2026-10-21T09:37:00Z');
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, events: [{ id: 'run', start: '2026-10-21T11:00[Europe/Paris]', ongoing: true }] });
    const first = ends(k.store.snapshot.getEvent('run'));
    clock = Temporal.Instant.from('2026-10-21T09:52:00Z');
    const moved = k.refreshOngoing();
    const again = k.refreshOngoing();
    const grown = ends(k.store.snapshot.getEvent('run'));
    const undoable = k.history.canUndo;
    clock = Temporal.Instant.from('2026-10-21T09:58:30Z');
    k.run({ type: 'event.update', id: 'run', patch: { ongoing: false } });
    expect([first, moved, again, grown, undoable, ends(k.store.snapshot.getEvent('run'))]).toEqual([
      ['2026-10-21T11:37:00+02:00[Europe/Paris]', null, true],
      true,
      false,
      ['2026-10-21T11:52:00+02:00[Europe/Paris]', null, true],
      false,
      ['2026-10-21T11:58:30+02:00[Europe/Paris]', null, false],
    ]);
  });

  it('finished with its end said: that end; another field changed: still running, its expected end kept', () => {
    clock = Temporal.Instant.from('2026-10-21T09:37:00Z');
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, events: [{ id: 'run', title: 'Import', start: '2026-10-21T11:00[Europe/Paris]', duration: { minutes: 50 }, ongoing: true }] });
    k.run({ type: 'event.update', id: 'run', patch: { title: 'Import (lot 2)' } });
    const renamed = ends(k.store.snapshot.getEvent('run'));
    k.run({ type: 'event.update', id: 'run', patch: { ongoing: false, end: '2026-10-21T11:41:05[Europe/Paris]' } });
    expect([renamed, ends(k.store.snapshot.getEvent('run'))]).toEqual([
      ['2026-10-21T11:50:00+02:00[Europe/Paris]', '2026-10-21T11:50:00+02:00[Europe/Paris]', true],
      ['2026-10-21T11:41:05+02:00[Europe/Paris]', null, false],
    ]);
  });
});
