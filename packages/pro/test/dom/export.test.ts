import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance } from '@dzcalendar/dom';
import { exportCSV, exportICS, exportPDF, exportPNG, exportXLSX } from '../../src/export-entry.js';
import { printPages } from '../../src/print-entry.js';

// The public functions in jsdom: what bad input returns (never a throw), what the ICS keeps.
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const mount = () => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'),
    initialView: 'timeGridWeek',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    events: [{ id: 'w', title: 'Garde', start: '2026-10-19T09:00[Europe/Paris]', end: '2026-10-19T10:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=5', exdate: ['2026-10-22T09:00[Europe/Paris]'] }],
  });
  return cal;
};
const codes = (r: { problems: readonly { code: string; path: string; detail?: string }[] }) => r.problems.map((p) => `${p.path}:${p.detail}`);

describe('exports and print, bad input', () => {
  it('null options, a bad separator, a view named "toString", a paper that is not one, `to` before `from`: problems, no file', async () => {
    const c = mount();
    const r = await Promise.all([
      exportXLSX(c, null as never),
      exportCSV(c, { separator: 'ab' as never }),
      exportPDF(c, { view: 'toString' }),
      exportPNG(c, { paper: 'b5' as never }),
      exportICS(c, { from: Temporal.PlainDate.from('2026-10-25'), to: Temporal.PlainDate.from('2026-10-20') }),
      printPages(c, { view: 'toString', print: false }),
    ]);
    expect(r.map(codes)).toEqual([['options:object'], ['separator:ab'], ['view:toString'], ['paper:b5'], ['to:not-after-from'], ['view:toString']]);
    expect([r[0]!.blob, document.querySelector('.dz-print')]).toEqual([null, null]);
  });
});

describe('ICS of the week', () => {
  // The excluded 09:00 of 22 October in Paris (+02:00) is 07:00 UTC, as the store keeps it (an instant).
  it('the series whole: its rule, its excluded date, its moved occurrence (kept with its RECURRENCE-ID)', async () => {
    const c = mount();
    c.run({ type: 'event.update', id: 'w', key: '2026-10-21T09:00:00+02:00[Europe/Paris]', scope: 'this', patch: { start: '2026-10-21T15:00[Europe/Paris]', end: '2026-10-21T16:00[Europe/Paris]' } });
    const { blob, problems } = await exportICS(c);
    const ics = (await blob!.text()).replace(/\r\n /g, '');
    expect([problems.length, /RRULE:FREQ=DAILY;COUNT=5/.test(ics), /EXDATE:20261022T070000Z/.test(ics), /RECURRENCE-ID;TZID=Europe\/Paris:20261021T090000/.test(ics), /DTSTART;TZID=Europe\/Paris:20261021T150000/.test(ics)]).toEqual([0, true, true, true, true]);
  });
});
