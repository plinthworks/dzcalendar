import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';
import '../src/list.js';

// States as attributes (docs/styling.md). Paris, Wednesday 21 October 2026, 10:00.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const make = (o: Record<string, unknown> = {}) =>
  (cal = createCalendar(document.body.appendChild(document.createElement('div')), {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    initialView: 'timeGridWeek',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    now,
    events: [
      { id: 'past', title: 'P', start: '2026-10-21T08:00[Europe/Paris]', duration: { hours: 1 } },
      { id: 'later', title: 'L', start: '2026-10-21T14:00[Europe/Paris]', duration: { hours: 1 }, tone: 'green' },
      { id: 'day', title: 'D', start: '2026-10-22', allDay: true },
    ],
    ...o,
  }));
const flags = (el: Element | null, names: string[]) => names.filter((n) => el?.hasAttribute(`data-${n}`));

describe('states as data-* attributes', () => {
  it('a time grid’s columns: Tuesday 20 past, Wednesday 21 today, Thursday 22 future; their ISO weekday', () => {
    const c = make();
    const col = (d: string) => c.element.querySelector(`.dz-tg__col[data-date="${d}"]`);
    const head = c.element.querySelector('.dz-tg__dayhead[data-today]');
    expect([flags(col('2026-10-20'), ['past', 'today', 'future']), flags(col('2026-10-21'), ['past', 'today', 'future']), flags(col('2026-10-22'), ['past', 'today', 'future']), col('2026-10-25')?.getAttribute('data-weekday'), head !== null]).toEqual([['past'], ['today'], ['future'], '7', true]);
  });

  it('events: past (ended at 09:00, before 10:00) and future (14:00); the tone named; all-day', () => {
    const c = make();
    const ev = (id: string) => c.element.querySelector(`.dz-ev[data-event-id="${id}"], .dz-bar[data-event-id="${id}"]`);
    expect([flags(ev('past'), ['past', 'future']), flags(ev('later'), ['past', 'future']), ev('later')?.getAttribute('data-tone'), flags(ev('day'), ['all-day'])]).toEqual([['past'], ['future'], 'green', ['all-day']]);
  });

  it('a month: 28 September is outside October; the calendar says it is editable', () => {
    const c = make({ initialView: 'dayGridMonth', editable: true });
    const cell = (d: string) => c.element.querySelector(`.dz-dg__cell[data-date="${d}"]`);
    expect([flags(cell('2026-09-28'), ['outside', 'past']), flags(cell('2026-10-21'), ['today', 'outside']), c.element.hasAttribute('data-editable')]).toEqual([['outside', 'past'], ['today'], true]);
  });

  it('a list’s day: today', () => {
    const c = make({ initialView: 'listWeek' });
    expect(flags(c.element.querySelector('.dz-list__day[data-date="2026-10-21"]'), ['today'])).toEqual(['today']);
  });

  it('the keyboard holding an event: data-grabbing on the view, data-moving on the event', () => {
    const c = make({ editable: true });
    const node = c.element.querySelector<HTMLElement>('.dz-ev[data-event-id="later"]')!;
    node.focus();
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }));
    expect([c.element.querySelector('.dz-tg')?.hasAttribute('data-grabbing'), c.element.querySelector('[data-event-id="later"][data-moving]') !== null]).toEqual([true, true]);
  });
});

describe('after the 18g-1 reviews', () => {
  it('a time grid with Monday–Friday hours: Saturday and Sunday closed, column and head; Wednesday not', () => {
    const c = make({ businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } });
    const closed = (d: string) => [c.element.querySelector(`.dz-tg__col[data-date="${d}"]`)?.hasAttribute('data-closed'), c.element.querySelector(`.dz-tg__dayhead[data-date="${d}"]`)?.hasAttribute('data-closed')];
    expect([closed('2026-10-24'), closed('2026-10-25'), closed('2026-10-21')]).toEqual([[true, true], [true, true], [false, false]]);
  });

  it('resource columns: a day’s head says its resource, as its column does', () => {
    // A week of two resources: fourteen day heads (a one-day view has none: the resources are the heads).
    const c = make({ initialView: 'resourceTimeGridWeek', resources: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] });
    const heads = [...c.element.querySelectorAll<HTMLElement>('.dz-tg__dayhead')].map((h) => h.dataset['resource']);
    expect([heads.length, heads.filter((r) => r === 'a').length, heads.filter((r) => r === 'b').length]).toEqual([14, 7, 7]);
  });
});
