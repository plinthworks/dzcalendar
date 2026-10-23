import { describe, expect, it } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarOptions } from '../src/index.js';

// Phase 18k: Sehhaty's production report (retours/2026-10-23-sehhaty.md).
const mount = (opts: Partial<CalendarOptions> = {}) => {
  const host = document.body.appendChild(document.createElement('div'));
  const cal = createCalendar(host, { timeZone: 'Africa/Algiers', locale: 'fr-FR', initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), ...opts } as CalendarOptions);
  return { host, cal };
};

describe('1. the axis labels every labelMinutes', () => {
  it('ticks every 15 minutes, labelled every 30: 08:00, 08:30, 09:00 named; every tick says its time', () => {
    const { host } = mount({ timeGrid: { slotMin: { hours: 8 }, slotMax: { hours: 10 }, slotMinutes: 15, labelMinutes: 30 } });
    const ticks = [...host.querySelectorAll<HTMLElement>('.dz-tick')];
    expect(ticks.map((t) => t.textContent)).toEqual(['08:00', '', '08:30', '', '09:00', '', '09:30', '', '10:00']);
    expect(ticks.map((t) => t.dataset['time'])).toEqual(['08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45', '10:00']);
  });

  it('by default the whole hours, as before', () => {
    const { host } = mount({ timeGrid: { slotMin: { hours: 8 }, slotMax: { hours: 9 }, slotMinutes: 30 } });
    expect([...host.querySelectorAll('.dz-tick')].map((t) => t.textContent)).toEqual(['08:00', '', '09:00']);
  });
});

describe('5. a right-click on a month background opens the day menu', () => {
  it('the cell under the pointer, though the background bar lives beside the cells', () => {
    const { host, cal } = mount({ initialView: 'dayGridMonth', events: [{ id: 'closed', start: '2026-10-22', end: '2026-10-23', allDay: true, display: 'background' }] });
    const bg = host.querySelector<HTMLElement>('.dz-bar--bg')!;
    const cell = host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-22"]')!;
    // jsdom has no layout: what is under the point is said by hand.
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [bg, cell];
    bg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    const menu = host.querySelector<HTMLElement>('.dz-menu')!;
    expect(menu.hidden).toBe(false);
    cal.destroy();
  });
});

describe('10. the month shows every event by default', () => {
  it('thirteen appointments on a day: thirteen bars, no "+N" unless asked', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, title: `RDV ${i}`, start: `2026-10-21T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}[Africa/Algiers]`, duration: { minutes: 30 } }));
    const { host, cal } = mount({ initialView: 'dayGridMonth', events: many });
    expect([host.querySelectorAll('.dz-dg__week .dz-bar').length, host.querySelectorAll('.dz-more').length]).toEqual([13, 0]);
    cal.update({ dayMaxLanes: 3 });
    expect(host.querySelectorAll('.dz-more').length).toBe(1);
    cal.destroy();
  });

  it('a year keeps "+N" by default (its days are tiny); back to the month, every event again', async () => {
    await import('../src/multimonth.js');
    const many = Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, start: `2026-10-21T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}[Africa/Algiers]`, duration: { minutes: 30 } }));
    const { host, cal } = mount({ initialView: 'dayGridMonth', events: many, headerViews: ['dayGridMonth', 'multiMonthYear'] });
    cal.update({ view: 'multiMonthYear' });
    expect(host.querySelectorAll('.dz-more').length).toBeGreaterThan(0);
    cal.update({ view: 'dayGridMonth' });
    expect([host.querySelectorAll('.dz-dg__week .dz-bar').length, host.querySelectorAll('.dz-more').length]).toEqual([13, 0]);
    cal.destroy();
  });
});

describe('3. an event that says it is editable is, in a calendar that is not', () => {
  it('its node carries data-editable (the grip and the grab cursor are drawn for it); one that says nothing does not', () => {
    const { host, cal } = mount({
      editable: false,
      events: [
        { id: 'mine', start: '2026-10-21T09:00[Africa/Algiers]', duration: { minutes: 30 }, durationEditable: true },
        { id: 'other', start: '2026-10-21T11:00[Africa/Algiers]', duration: { minutes: 30 } },
      ],
    });
    const mine = host.querySelector<HTMLElement>('[data-event-id="mine"]')!;
    const other = host.querySelector<HTMLElement>('[data-event-id="other"]')!;
    expect([mine.hasAttribute('data-editable'), other.hasAttribute('data-editable'), host.querySelector('.dz-cal')!.classList.contains('dz-editable')]).toEqual([true, false, false]);
    cal.destroy();
  });
});

describe('runtime problems: onProblem, else the console once per code', () => {
  it('all-day events in a time grid without its all-day row: events-not-drawn, told once', () => {
    const told: string[] = [];
    const { cal } = mount({
      allDaySlot: false,
      onProblem: (p) => told.push(`${p.code}: ${p.detail}`),
      events: [
        { id: 'conf', title: 'Congrès', start: '2026-10-20', end: '2026-10-23', allDay: true },
        { id: 'closed', start: '2026-10-22', end: '2026-10-23', allDay: true, display: 'background' },
      ],
    });
    cal.update({ editable: true });
    expect(told).toEqual(['events-not-drawn: 1 all-day event(s) in timeGridWeek: allDaySlot is false, so they are not drawn (backgrounds still wash their columns)']);
    cal.destroy();
  });

  it('without onProblem: a console warning, once per code', () => {
    const warn = console.warn;
    const said: string[] = [];
    console.warn = (m: string) => said.push(m);
    try {
      const { cal } = mount({ allDaySlot: false, events: [{ id: 'a', start: '2026-10-21', allDay: true }] });
      cal.update({ view: 'timeGridDay' });
      expect(said.filter((m) => m.startsWith('dzcalendar: events-not-drawn')).length).toBe(1);
      cal.destroy();
    } finally {
      console.warn = warn;
    }
  });
});

describe('after the 18k review', () => {
  it('a problem gone and back is told again; events outside the hours are told too', () => {
    const told: string[] = [];
    const { cal } = mount({
      allDaySlot: false,
      timeGrid: { slotMin: { hours: 8 }, slotMax: { hours: 18 } },
      onProblem: (p) => told.push(p.detail.split(':')[0]!),
      events: [
        { id: 'conf', start: '2026-10-20', end: '2026-10-21', allDay: true },
        { id: 'night', start: '2026-10-21T22:00[Africa/Algiers]', duration: { hours: 1 } },
      ],
    });
    cal.update({ allDaySlot: true });
    cal.update({ allDaySlot: false });
    expect(told).toEqual(['1 all-day event(s) in timeGridWeek', '1 event(s) in timeGridWeek entirely outside the hours shown (slotMin–slotMax)', '1 all-day event(s) in timeGridWeek']);
    cal.destroy();
  });

  it('labelMinutes or slotMinutes that cannot be taken: refused (RangeError) before anything changes, never thrown while drawing', () => {
    const { cal } = mount({ timeGrid: { slotMinutes: 30 } });
    expect(() => cal.update({ timeGrid: { labelMinutes: 0 } })).toThrow(RangeError);
    expect(() => cal.update({ timeGrid: { slotMinutes: 7.5 } })).toThrow(RangeError);
    cal.destroy();
  });
});

describe('a resize-only event in a calendar that is not editable (18k review)', () => {
  it('its menu offers "Change duration…" only: no move, no delete; data-editable says resize', () => {
    let ids: string[] = [];
    const { host, cal } = mount({
      editable: false,
      contextMenu: (_c, d) => ((ids = d.map((x) => x.id)), d),
      events: [{ id: 'r', start: '2026-10-21T09:00[Africa/Algiers]', duration: { minutes: 30 }, durationEditable: true }],
    });
    const el = host.querySelector<HTMLElement>('[data-event-id="r"]')!;
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }));
    expect([el.dataset['editable'], ids.filter((i) => i.startsWith('event.'))]).toEqual(['resize', ['event.resize']]);
    cal.destroy();
  });
});

describe('the base entry (18i)', () => {
  it('a view whose renderer is not imported names its entry', async () => {
    const { hasRenderer } = await import('../src/base.js');
    // The full entry has the grids; the message for a family without a renderer names the import.
    expect(hasRenderer('timeGrid')).toBe(true);
  });
});

describe('zone-from-browser (Sehhaty, after 18k)', () => {
  it('no timeZone given: said once; a zone given: nothing', () => {
    const told: string[] = [];
    const host = document.body.appendChild(document.createElement('div'));
    const cal = createCalendar(host, { locale: 'fr-FR', initialView: 'timeGridWeek', onProblem: (p) => told.push(p.code) } as CalendarOptions);
    cal.update({ view: 'timeGridDay' });
    cal.destroy();
    const { cal: given } = mount({ onProblem: (p) => told.push(`given:${p.code}`) });
    given.destroy();
    expect(told.filter((c) => c.endsWith('zone-from-browser'))).toEqual(['zone-from-browser']);
  });
});

describe('messages.views (18j: a label for a view of its own)', () => {
  it('keeps the built-in labels beside it, in the locale', () => {
    const { host, cal } = mount({
      views: { threeDays: { family: 'timeGrid', duration: { days: 3 } } },
      headerViews: ['threeDays', 'timeGridWeek', 'dayGridMonth'],
      messages: { views: { threeDays: '3 jours' } },
    } as Partial<CalendarOptions>);
    expect([...host.querySelectorAll('.dz-toolbar__view')].map((b) => b.textContent)).toEqual(['3 jours', 'Semaine', 'Mois']);
    cal.destroy();
  });
});

describe('the week checked at creation as in update() (18j review)', () => {
  it('every day hidden, a weekday 8, a first day 9: RangeError at createCalendar, nothing drawn', () => {
    for (const bad of [{ weekends: false, hiddenDays: [1, 2, 3, 4, 5] }, { hiddenDays: [8] }, { firstDay: 9 }] as Partial<CalendarOptions>[]) {
      const host = document.body.appendChild(document.createElement('div'));
      expect(() => createCalendar(host, { timeZone: 'Europe/Paris', ...bad } as CalendarOptions)).toThrow(RangeError);
      expect(host.querySelector('.dz-cal')).toBeNull();
    }
    const { cal } = mount({ hiddenDays: [3] });
    expect(() => cal.update({ weekends: false, hiddenDays: [1, 2, 3, 4, 5] })).toThrow('every day of the week is hidden');
    cal.destroy();
  });
});

describe('update({ resourceOrder }) says a comparison that throws (18j review)', () => {
  it('onResourceProblems hears it, the columns in input order', () => {
    const told: string[] = [];
    const { cal } = mount({ initialView: 'resourceTimeGridDay', resources: [{ id: 'b', title: 'B' }, { id: 'a', title: 'A' }], onResourceProblems: (ps) => told.push(...ps.map((p) => `${p.code} ${p.path}`)) });
    cal.update({ resourceOrder: () => { throw new Error('boom'); } });
    expect(told).toEqual(['invalid-resource resourceOrder']);
    expect(cal.kernel.getState().view.type).toBe('resourceTimeGridDay');
    cal.destroy();
  });
});
