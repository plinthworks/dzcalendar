/**
 * A series with more occurrences in what is shown than are drawn (2 000) is
 * said through onProblem (owner, 18j-3: it was cut in silence), once a series,
 * and again when it comes back after going away.
 */
import { describe, expect, it } from 'vitest';
import '@dzcalendar/core/recurrence';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarOptions } from '../src/index.js';

const mount = (opts: Partial<CalendarOptions>) => {
  const host = document.createElement('div');
  document.body.append(host);
  return createCalendar(host, { timeZone: 'Africa/Algiers', initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), ...opts } as CalendarOptions);
};

describe('too-many-occurrences', () => {
  it('a rule every minute over a week: said once, gone a week before it starts, said again when back', () => {
    const told: string[] = [];
    const cal = mount({
      onProblem: (p) => told.push(`${p.code}: ${p.detail}`),
      // From Monday the 19th: 7 × 1 440 minutes in the week shown, far over 2 000.
      events: [{ id: 'tick', title: 'Tick', start: '2026-10-19T00:00[Africa/Algiers]', duration: { minutes: 1 }, rrule: 'FREQ=MINUTELY' }],
    });
    cal.update({ editable: true });
    expect(told).toEqual(['too-many-occurrences: series tick: more than 2000 in the window — the first ones are drawn']);
    cal.navigate('prev'); // the week of the 12th: before the series
    expect(told.length).toBe(1);
    cal.navigate('next');
    expect(told.length).toBe(2);
    cal.destroy();
  });

  it('a weekly series is never cut', () => {
    const told: string[] = [];
    const cal = mount({ initialView: 'dayGridMonth', onProblem: (p) => told.push(p.code), events: [{ id: 'w', start: '2026-10-19T08:00[Africa/Algiers]', duration: { hours: 1 }, rrule: 'FREQ=WEEKLY' }] });
    expect(told).toEqual([]);
    cal.destroy();
  });
});
