import { describe, it, expect, afterEach, vi } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, Instant } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';

// A running event (`ongoing`) with an expected length, split at now (owner, 2026-11-05): from its start to now the
// running look, from now to its expected end the expected part — `data-expected` and `--dz-ongoing-now` (where now
// falls along the piece, 0 to 1). Expectations worked out by hand from the zones' rules.
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});
let at: Instant = Temporal.Instant.from('2026-10-21T07:30:00Z');
const make = (events: EventInput[], o: Record<string, unknown> = {}) =>
  (cal = createCalendar(document.body.appendChild(document.createElement('div')), {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    initialView: 'timeGridWeek',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    now: () => at,
    events,
    ...o,
  }));
/** Each piece of an event, by its day: [data-expected?, --dz-ongoing-now]. */
const pieces = (id: string) =>
  [...cal!.element.querySelectorAll<HTMLElement>(`.dz-ev[data-event-id="${id}"]`)].map((e) => [e.closest<HTMLElement>('.dz-tg__col')?.dataset['date'], e.hasAttribute('data-expected'), e.style.getPropertyValue('--dz-ongoing-now')]);

describe('a running event split at now, in the time grid', () => {
  it('Paris, 21 October 2026, now 09:30 (+02:00): 09:00 for 70 minutes is 30 of 70 run (0.4286); with no length it ends at now, whole', () => {
    at = Temporal.Instant.from('2026-10-21T07:30:00Z');
    make([
      { id: 'run', title: 'Import', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 70 }, ongoing: true },
      { id: 'open', title: 'Sync', start: '2026-10-21T08:00[Europe/Paris]', ongoing: true },
      { id: 'over', title: 'Late', start: '2026-10-21T08:00[Europe/Paris]', duration: { minutes: 20 }, ongoing: true },
      { id: 'done', title: 'Done', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 70 } },
    ]);
    expect([pieces('run'), pieces('open'), pieces('over'), pieces('done')]).toEqual([
      [['2026-10-21', true, '0.4286']],
      [['2026-10-21', false, '']],
      // Its expected end (08:20) behind now: it grew to now, run all along.
      [['2026-10-21', false, '']],
      [['2026-10-21', false, '']],
    ]);
    // Still said running, its end not written.
    expect(cal!.element.querySelector('.dz-ev[data-event-id="run"]')!.getAttribute('data-ongoing')).toBe('');
    expect(cal!.element.querySelector('.dz-ev[data-event-id="run"]')!.textContent).toContain('en cours');
  });

  it('cut at midnight: 23:00 for 3 hours — at 23:30 the first piece straddles (0.5), the second is ahead (0); at 00:30 the first is behind, the second 0.25', () => {
    const ev: EventInput = { id: 'night', title: 'Backup', start: '2026-10-21T23:00[Europe/Paris]', duration: { hours: 3 }, ongoing: true };
    at = Temporal.Instant.from('2026-10-21T21:30:00Z');
    make([ev]);
    expect(pieces('night')).toEqual([
      ['2026-10-21', true, '0.5'],
      ['2026-10-22', true, '0'],
    ]);
    cal!.destroy();
    at = Temporal.Instant.from('2026-10-21T22:30:00Z');
    make([ev]);
    expect(pieces('night')).toEqual([
      ['2026-10-21', false, ''],
      ['2026-10-22', true, '0.25'],
    ]);
  });

  it('Lord Howe, 4 October 2026 (02:00 +10:30 becomes 02:30 +11:00), wall axis: 01:30 for 90 real minutes ends 03:30; at 02:45 the bar reads 75 of 120 (0.625), not 45 of 90', () => {
    // Start 01:30 +10:30 = 15:00Z; now 02:45 +11:00 = 15:45Z; expected end 16:30Z = 03:30 +11:00.
    // On the wall axis: top 90, now 165, end 210 — the skipped half hour is drawn.
    at = Temporal.Instant.from('2026-10-03T15:45:00Z');
    make([{ id: 'lh', title: 'Run', start: '2026-10-04T01:30[Australia/Lord_Howe]', duration: { minutes: 90 }, ongoing: true }], {
      timeZone: 'Australia/Lord_Howe',
      initialView: 'timeGridDay',
      initialDate: Temporal.PlainDate.from('2026-10-04'),
    });
    expect(pieces('lh')).toEqual([['2026-10-04', true, '0.625']]);
  });

  it('once a minute the split follows now, with no change to the store; past the expected end it is gone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    at = Temporal.Instant.from('2026-10-21T07:30:00Z');
    make([{ id: 'run', title: 'Import', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 70 }, ongoing: true }]);
    const revision = cal!.kernel.store.snapshot.getEvent('run')!.revision;
    expect(pieces('run')).toEqual([['2026-10-21', true, '0.4286']]);
    // 09:51: 51 of 70.
    at = Temporal.Instant.from('2026-10-21T07:51:00Z');
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(pieces('run')).toEqual([['2026-10-21', true, '0.7286']]);
    expect(cal!.kernel.store.snapshot.getEvent('run')!.revision).toBe(revision);
    // 10:15: past 10:10, the event grows to now and runs all along.
    at = Temporal.Instant.from('2026-10-21T08:15:00Z');
    vi.advanceTimersByTime(60_000);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(pieces('run')).toEqual([['2026-10-21', false, '']]);
  });
});
