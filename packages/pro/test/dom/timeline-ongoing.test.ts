import { describe, it, expect, afterEach, vi } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, Instant } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance } from '@dzcalendar/dom';
import '../../src/index.js';

// A running event (`ongoing`) split at now on the timeline (owner, 2026-11-05): `data-expected` and
// `--dz-ongoing-now` (where now falls along the bar, 0 to 1). Expectations worked out by hand. One row each (no lanes cut).
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
    now: () => at,
    events,
    resources: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, title: id.toUpperCase() })),
    initialView: 'resourceTimelineDay',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    ...o,
  }));
const bar = (id: string) => {
  const e = cal!.element.querySelector<HTMLElement>(`.dz-tl__ev[data-event-id="${id}"]`)!;
  return [e.hasAttribute('data-expected'), e.style.getPropertyValue('--dz-ongoing-now')];
};

describe('a running event split at now, on the timeline', () => {
  it('Paris, now 09:30: 09:00 for 70 minutes is 0.4286 run; 11:00 for an hour wholly ahead (0); with no length, or past its expected end, run all along', () => {
    make([
      { id: 'run', title: 'Import', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 70 }, resourceId: 'a', ongoing: true },
      { id: 'ahead', title: 'Next', start: '2026-10-21T11:00[Europe/Paris]', duration: { hours: 1 }, resourceId: 'b', ongoing: true },
      { id: 'open', title: 'Sync', start: '2026-10-21T08:00[Europe/Paris]', resourceId: 'c', ongoing: true },
      { id: 'over', title: 'Late', start: '2026-10-21T08:00[Europe/Paris]', duration: { minutes: 20 }, resourceId: 'd', ongoing: true },
      { id: 'done', title: 'Done', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 70 }, resourceId: 'e' },
    ]);
    expect(['run', 'ahead', 'open', 'over', 'done'].map(bar)).toEqual([
      [true, '0.4286'],
      [true, '0'],
      [false, ''],
      [false, ''],
      [false, ''],
    ]);
  });

  it('a week cut at midnight: 23:00 for 3 hours at 00:30 — one bar across the days, 1.5 of 3 hours run (the bar is not cut)', () => {
    at = Temporal.Instant.from('2026-10-21T22:30:00Z');
    make([{ id: 'night', title: 'Backup', start: '2026-10-21T23:00[Europe/Paris]', duration: { hours: 3 }, resourceId: 'a', ongoing: true }], { initialView: 'resourceTimelineWeek' });
    expect(bar('night')).toEqual([true, '0.5']);
  });

  it('once a minute the split follows now', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    at = Temporal.Instant.from('2026-10-21T07:30:00Z');
    make([{ id: 'run', title: 'Import', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 70 }, resourceId: 'a', ongoing: true }]);
    at = Temporal.Instant.from('2026-10-21T07:51:00Z');
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(bar('run')).toEqual([true, '0.7286']);
  });
});
