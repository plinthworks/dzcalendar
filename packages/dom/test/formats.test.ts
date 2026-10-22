import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, ZonedDateTime } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';
import '../src/list.js';
import '../src/multimonth.js';

// How places are written (docs/behaviors/formats.md). Paris, the week of 19 – 25 October 2026.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const ev: EventInput = { id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } };
const make = (o: Record<string, unknown> = {}) =>
  (cal = createCalendar(document.body.appendChild(document.createElement('div')), {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    initialView: 'timeGridWeek',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    now,
    events: [ev],
    ...o,
  }));
const text = (c: CalendarInstance, sel: string) => c.element.querySelector(sel)?.textContent;

describe('formats', () => {
  it('slotLabel as options: "09 h"; dayHeader as a function; eventTime as options', () => {
    const c = make({
      formats: {
        slotLabel: { hour: 'numeric' },
        dayHeader: ({ date }: { date: PlainDate }) => `J${date.day}`,
        eventTime: { hour: 'numeric', minute: '2-digit' },
      },
    });
    const ticks = [...c.element.querySelectorAll('.dz-tick')].map((t) => t.textContent).filter(Boolean);
    const heads = [...c.element.querySelectorAll('.dz-tg__dayhead')].map((h) => h.textContent);
    // fr-FR (CLDR) writes an hour alone "HH 'h'": "09 h"; with numeric hours and minutes: "9:00".
    expect([ticks.includes('09 h'), heads[0]?.startsWith('J19'), text(c, '[data-event-id="a"] .dz-ev__time')]).toEqual([true, true, '9:00 – 10:00']);
  });

  it('eventTimeRange as a function: given both ends and their texts', () => {
    const c = make({ formats: { eventTimeRange: (a: { start: ZonedDateTime; startText: string; endText: string }) => `${a.startText}→${a.endText} (${a.start.hour})` } });
    expect(text(c, '[data-event-id="a"] .dz-ev__time')).toBe('09:00→10:00 (9)');
  });

  it('title: a function given the first and last days; options make a range; live, and back to the default', () => {
    const c = make({ formats: { title: (t: { start: PlainDate; end: PlainDate; view: string }) => `${t.view} ${t.start}..${t.end}` } });
    const fn = c.kernel.getState().title;
    c.update({ formats: { title: { weekday: 'long', day: 'numeric' } } });
    const opts = c.kernel.getState().title;
    c.update({ formats: {} });
    expect([fn, opts.includes('lundi'), opts.includes('dimanche'), c.kernel.getState().title === opts]).toEqual(['timeGridWeek 2026-10-19..2026-10-25', true, true, false]);
  });

  it('a month: dayCell, weekNumber (a function), morePopover; a year: monthHeader', () => {
    const many = ['b', 'c', 'd', 'e'].map((id) => ({ id, title: id, start: '2026-10-21', allDay: true }));
    const c = make({
      initialView: 'dayGridMonth',
      weekNumbers: true,
      dayMaxLanes: 2,
      events: many,
      formats: { dayCell: ({ date }: { date: PlainDate }) => `<${date.day}>`, weekNumber: ({ week }: { week: number }) => `Sem. ${week}`, morePopover: { day: 'numeric', month: 'numeric' }, monthHeader: { month: 'short' } },
    });
    const cell = c.element.querySelector('.dz-dg__cell[data-date="2026-10-21"]')!;
    const weeks = [...c.element.querySelectorAll('.dz-dg__wk')].map((w) => w.textContent);
    c.element.querySelector<HTMLElement>('.dz-more')!.click();
    const panel = document.querySelector('.dz-pop__head')?.textContent ?? '';
    const month = [cell.querySelector('.dz-dg__num')?.textContent, weeks.includes('Sem. 43'), panel.includes('21/10')];
    c.update({ view: 'multiMonthYear' });
    expect([...month, text(c, '.dz-mm__title')]).toEqual(['<21>', true, true, 'janv.']);
  });

  it('a list: listDay and listDaySide', () => {
    const c = make({ initialView: 'listWeek', formats: { listDay: { weekday: 'long' }, listDaySide: { day: 'numeric', month: 'long' } } });
    expect([text(c, '.dz-list__date'), text(c, '.dz-list__side')]).toEqual(['mercredi', '21 octobre']);
  });

  it('what is said keeps the full words; a function that throws or returns no text is reported, the default kept', async () => {
    const reported: unknown[] = [];
    const on = (e: unknown) => void reported.push(e);
    process.on('unhandledRejection', on as never);
    const c = make({ formats: { eventTime: () => 'X', slotLabel: () => { throw new Error('bug'); }, dayCell: () => 3 as never } });
    const label = c.element.querySelector('[data-event-id="a"]')?.getAttribute('aria-label') ?? '';
    const ticks = [...c.element.querySelectorAll('.dz-tick')].map((t) => t.textContent);
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', on as never);
    expect([text(c, '[data-event-id="a"] .dz-ev__time'), label.includes('09:00'), ticks.includes('09:00'), reported.length > 0]).toEqual(['X – X', true, true, true]);
  });

  it('the same options in a new object redraw nothing', () => {
    const c = make({ formats: { slotLabel: { hour: 'numeric' } } });
    const tick = c.element.querySelector('.dz-tick');
    c.update({ formats: { slotLabel: { hour: 'numeric' } } });
    expect(c.element.querySelector('.dz-tick')).toBe(tick);
  });
});

describe('a fixed period (visibleRange)', () => {
  it('a congress in a day grid: two whole weeks, Monday 2 to Sunday 15, the days around the period outside; next leaves them', () => {
    const c = make({ initialView: 'congres', views: { congres: { family: 'dayGrid', visibleRange: { start: Temporal.PlainDate.from('2026-11-03'), end: Temporal.PlainDate.from('2026-11-13') } } } });
    const cells = () => [...c.element.querySelectorAll<HTMLElement>('.dz-dg__cell')].map((x) => `${x.dataset['date']}${x.classList.contains('dz-dg__cell--outside') ? '-' : ''}`);
    const first = cells();
    c.navigate('next');
    // Every row has seven columns: they line up under the weekdays.
    const rows = [...c.element.querySelectorAll('.dz-dg__week')].map((w) => w.querySelectorAll('.dz-dg__cell').length);
    expect([first.length, first[0], first[1], first[10], first[11], rows, cells(), c.kernel.getState().title.includes('2')]).toEqual([14, '2026-11-02-', '2026-11-03', '2026-11-12', '2026-11-13-', [7, 7], first, true]);
  });

  it('PageDown in a fixed period: said, the cursor stays', () => {
    const c = make({ initialView: 'congres', views: { congres: { family: 'timeGrid', visibleRange: { start: Temporal.PlainDate.from('2026-11-03'), end: Temporal.PlainDate.from('2026-11-13') } } } });
    const cursor = c.element.querySelector<HTMLElement>('.dz-cursor')!;
    cursor.focus();
    const press = (key: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press('ArrowRight');
    const at = document.activeElement!.getAttribute('aria-label');
    press('PageDown');
    press('PageDown');
    // The cursor did not jump back to the period's first day: it is where it was.
    expect([document.activeElement!.getAttribute('aria-label'), at?.includes('novembre')]).toEqual([at, true]);
  });

  it('a day grid of two weeks by settings: rows of weeks, aligned on the week’s first day', () => {
    const c = make({ initialView: 'q', views: { q: { family: 'dayGrid', duration: { weeks: 2 } } } });
    const r = c.kernel.getState().range;
    expect([String(r.start), r.weeks.length, r.weeks[0]!.length]).toEqual(['2026-10-19', 2, 7]);
  });
});

describe('after the 18f-3 review (DOM)', () => {
  it('a broken format is said once, not at every cell; options the platform refuses too', async () => {
    const reported: unknown[] = [];
    const on = (e: unknown) => void reported.push(e);
    process.on('unhandledRejection', on as never);
    const c = make({ initialView: 'dayGridMonth', formats: { dayCell: () => { throw new Error('bug'); }, dayHeader: { weekday: 'nonsense' } as never } });
    c.navigate('next');
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', on as never);
    expect([reported.length, text(c, '.dz-dg__cell[data-date="2026-11-18"] .dz-dg__num')]).toEqual([2, '18']);
  });

  it('a fixed period: the arrows and "today" are disabled', () => {
    const c = make({ initialView: 'congres', views: { congres: { family: 'timeGrid', visibleRange: { start: Temporal.PlainDate.from('2026-11-03'), end: Temporal.PlainDate.from('2026-11-13') } } } });
    const disabled = ['.dz-toolbar__prev', '.dz-toolbar__next', '.dz-toolbar__today'].map((s) => c.element.querySelector<HTMLButtonElement>(s)!.disabled);
    c.update({ view: 'timeGridWeek' });
    expect([disabled, c.element.querySelector<HTMLButtonElement>('.dz-toolbar__next')!.disabled]).toEqual([[true, true, true], false]);
  });

  it('short words of the application are for the eye: the full ones are said', () => {
    const c = make({ initialView: 'dayGridMonth', formats: { dayHeader: ({ date }: { date: PlainDate }) => 'LMMJVSD'[date.dayOfWeek - 1]!, monthHeader: { month: 'short' }, listDay: { day: 'numeric', month: 'numeric' } } });
    const head = c.element.querySelector('.dz-dg__weekday')!;
    c.update({ view: 'listWeek' });
    expect([head.textContent, head.getAttribute('aria-label'), c.element.querySelector('.dz-list__date')?.getAttribute('aria-label')]).toEqual(['L', 'lundi', 'mercredi 21 octobre 2026']);
  });
});
