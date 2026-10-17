import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { createCalendar, registerView } from '../src/index.js';
import { h } from '../src/toolkit.js';
import { defineView } from '../src/custom.js';
import type { CalendarInstance } from '../src/index.js';
import '../src/multimonth.js';

// Phase 10 in jsdom: multi-month, week numbers, hidden days, custom views.

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const mount = (events: EventInput[], over: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, events, initialView: 'multiMonthYear', ...over });
  return host;
};
const key = (k: string, mods: KeyboardEventInit = {}) =>
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
const active = () => document.activeElement as HTMLElement;

describe('multi-month', () => {
  const events: EventInput[] = [
    { id: 'eve', title: 'Réveillon', start: '2026-10-31T20:00[Europe/Paris]' },
    { id: 'nov', title: 'Novembre', start: '2026-11-02T09:00[Europe/Paris]' },
  ];

  it('twelve month grids, each named, each event once — in its own month', () => {
    const host = mount(events);
    const grids = [...host.querySelectorAll<HTMLElement>('.dz-mm__grid[role="grid"]')];
    expect(grids).toHaveLength(12);
    expect(grids[9]!.getAttribute('aria-label')).toBe('octobre 2026');
    const items = [...host.querySelectorAll<HTMLElement>('.dz-dg__item')].map((i) => i.dataset['eventId']);
    expect(items.sort()).toEqual(['eve', 'nov']);
    // October's grid draws 2 November as padding, empty.
    const oct = grids[9]!;
    expect(oct.querySelector('.dz-dg__cell[data-date="2026-11-02"]')!.classList.contains('dz-dg__cell--outside')).toBe(true);
    expect(oct.querySelector('.dz-dg__cell[data-date="2026-11-02"] .dz-dg__item')).toBeNull();
  });

  it('one tab stop for the year; the arrows cross from one month into the next', () => {
    const host = mount(events);
    const stops = [...host.querySelectorAll<HTMLElement>('.dz-mm [tabindex="0"]')];
    expect(stops.map((s) => s.dataset['date'])).toEqual(['2026-10-21']);
    host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-31"]:not(.dz-dg__cell--outside)')!.focus();
    key('ArrowRight');
    expect(active().dataset['date']).toBe('2026-11-01');
    expect(active().closest('.dz-mm__grid')!.getAttribute('aria-label')).toBe('novembre 2026');
    expect(active().classList.contains('dz-dg__cell--outside')).toBe(false);
  });

  it('past the year’s last day, the next year', () => {
    const host = mount([]);
    host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-12-31"]:not(.dz-dg__cell--outside)')!.focus();
    key('ArrowRight');
    expect(cal!.kernel.getState().title).toBe('2027');
    expect(active().dataset['date']).toBe('2027-01-01');
  });

  it('a month’s title leads to that month', () => {
    const host = mount([]);
    host.querySelectorAll<HTMLButtonElement>('.dz-mm__go')[2]!.click();
    expect(cal!.kernel.getState().view.type).toBe('dayGridMonth');
    expect(cal!.kernel.getState().date.toString()).toBe('2026-03-01');
  });

  it('multiMonthMaxColumns sets the columns; a bad value is refused before any change', () => {
    const host = mount([], { multiMonthMaxColumns: 1 });
    const root = host.querySelector<HTMLElement>('.dz-cal')!;
    expect(root.style.getPropertyValue('--dz-mm-cols')).toBe('1');
    expect(() => cal!.update({ multiMonthMaxColumns: 0, view: 'dayGridMonth' })).toThrow(RangeError);
    expect(cal!.kernel.getState().view.type).toBe('multiMonthYear');
  });
});

describe('week numbers', () => {
  it('on the first cell of each month row, by the locale’s rules; a button to that week', () => {
    const host = mount([], { initialView: 'dayGridMonth', weekNumbers: true });
    const wk = [...host.querySelectorAll<HTMLElement>('.dz-dg__wk')].map((w) => w.textContent);
    // October 2026 in France: weeks 40 to 45.
    expect(wk).toEqual(['S40', 'S41', 'S42', 'S43', 'S44', 'S45']);
    host.querySelectorAll<HTMLButtonElement>('.dz-dg__wk')[3]!.click();
    expect(cal!.kernel.getState().view.type).toBe('timeGridWeek');
    expect(cal!.kernel.getState().range.start.toString()).toBe('2026-10-19');
  });

  it('1 January 2027 is week 53 in France, week 1 in the United States', () => {
    const host = mount([], { initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2027-01-01'), weekNumbers: true });
    expect(host.querySelector('.dz-tg__corner')!.textContent).toBe('S53');
    cal!.update({ locale: 'en-US' });
    expect(host.querySelector('.dz-tg__corner')!.textContent).toBe('W1');
  });

  it('turned on and off by update()', () => {
    const host = mount([], { initialView: 'dayGridMonth' });
    expect(host.querySelectorAll('.dz-dg__wk')).toHaveLength(0);
    cal!.update({ weekNumbers: true });
    expect(host.querySelectorAll('.dz-dg__wk')).toHaveLength(6);
    cal!.update({ weekNumbers: false });
    expect(host.querySelectorAll('.dz-dg__wk')).toHaveLength(0);
  });
});

describe('weekends and hidden days', () => {
  it('weekends: false leaves out Saturday and Sunday everywhere; update() brings them back', () => {
    const host = mount([], { initialView: 'dayGridMonth', weekends: false });
    expect(host.querySelectorAll('.dz-dg__weekday')).toHaveLength(5);
    cal!.update({ view: 'timeGridWeek' });
    expect(cal!.kernel.getState().range.dates).toHaveLength(5);
    cal!.update({ weekends: true });
    expect(cal!.kernel.getState().range.dates).toHaveLength(7);
    expect(() => cal!.update({ hiddenDays: [1, 2, 3, 4, 5], weekends: false })).toThrow(RangeError);
  });

  it('the keyboard steps over hidden days: Friday → Monday, in the month and in the week', () => {
    const host = mount([], { initialView: 'dayGridMonth', weekends: false });
    host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-23"]')!.focus();
    key('ArrowRight');
    expect(active().dataset['date']).toBe('2026-10-26');
    key('ArrowLeft');
    expect(active().dataset['date']).toBe('2026-10-23');
    cal!.update({ view: 'dayGridWeek' });
    host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-23"]')!.focus();
    key('ArrowRight');
    expect(cal!.kernel.getState().range.start.toString()).toBe('2026-10-26');
    expect(active().dataset['date']).toBe('2026-10-26');
  });
});

describe('custom views', () => {
  it('defineView: the calendar keeps toolbar and navigation; render draws the days and their events', () => {
    const agenda = defineView({
      type: 'agenda3',
      duration: { days: 3 },
      render(el, data, api) {
        el.replaceChildren(
          ...data.days.map((d) => {
            const day = h(document, 'div', 'day', `${d.date}:${d.entries.map((e) => e.instance.event.title).join(',')}`);
            for (const e of d.entries) {
              const b = h(document, 'button', 'ev', e.instance.event.title);
              b.addEventListener('click', () => api.open(e.instance));
              day.append(b);
            }
            return day;
          }),
        );
      },
    });
    const clicked: string[] = [];
    const host = mount([{ id: 'a', title: 'A', start: '2026-10-22T09:00[Europe/Paris]' }], {
      initialView: 'agenda3',
      views: { agenda3: agenda },
      headerViews: ['agenda3', 'dayGridMonth'],
      onEventClick: (i: { event: { id: string } }) => clicked.push(i.event.id),
    });
    expect([...host.querySelectorAll('.dz-custom .day')].map((x) => x.firstChild!.textContent)).toEqual(['2026-10-21:', '2026-10-22:A', '2026-10-23:']);
    host.querySelector<HTMLButtonElement>('.dz-custom .ev')!.click();
    expect(clicked).toEqual(['a']);
    cal!.navigate('next');
    expect(host.querySelector('.dz-custom .day')!.firstChild!.textContent).toBe('2026-10-24:');
    // A store change redraws it.
    cal!.run({ type: 'event.move', id: 'a', start: '2026-10-25T09:00[Europe/Paris]' });
    expect([...host.querySelectorAll('.dz-custom .day')].map((x) => x.firstChild!.textContent)).toContain('2026-10-25:A');
  });

  it('registerView: a family of one’s own, with the kernel’s model family', async () => {
    const { registerModelFamily } = await import('@dzcalendar/core');
    registerModelFamily('testFamily', { build: (range) => ({ n: range.dates.length }) });
    registerView('testFamily', (ctx) => {
      const el = h(ctx.doc, 'div', 'dz-test');
      return { element: el, body: el, render: (m) => ((el.textContent = `days: ${(m as { n: number }).n}`), []), tick() {}, destroy: () => el.remove() };
    });
    const host = mount([], { initialView: 'myView', views: { myView: { type: 'myView', family: 'testFamily', duration: { days: 4 }, alignment: 'day', fixedWeekCount: true, hiddenDays: [], showNonCurrentDates: true } } });
    expect(host.querySelector('.dz-test')!.textContent).toBe('days: 4');
  });
});

describe('review fixes', () => {
  it('a timed event in a multi-month view is not offered "Change duration…"', () => {
    const host = mount([{ id: 'm', title: 'M', start: '2026-10-21T09:00[Europe/Paris]' }], { editable: true });
    host.querySelector<HTMLElement>('.dz-dg__item[data-event-id="m"]')!.focus();
    key('F10', { shiftKey: true });
    const ids = [...host.querySelectorAll<HTMLElement>('.dz-menu [role="menuitem"]')].map((b) => b.dataset['action']);
    expect(ids).toContain('event.move');
    expect(ids).not.toContain('event.resize');
  });

  it('injectStyles: false injects no view CSS either; the entries export it', async () => {
    const { MULTIMONTH_CSS } = await import('../src/multimonth.js');
    document.head.querySelectorAll('style[data-dzcalendar]').forEach((s) => s.remove());
    mount([], { injectStyles: false });
    expect(document.head.querySelectorAll('style[data-dzcalendar]')).toHaveLength(0);
    expect(MULTIMONTH_CSS).toContain('.dz-mm__grid');
  });

  it('a missing entry is named in the error', () => {
    const host = document.createElement('div');
    document.body.append(host);
    expect(() => createCalendar(host, { timeZone: 'UTC', initialView: 'myList', views: { myList: { type: 'myList', family: 'list', duration: { days: 1 }, alignment: 'day', fixedWeekCount: true, hiddenDays: [], showNonCurrentDates: true } } })).toThrow(/import '@dzcalendar\/dom\/list'/);
  });

  it('three months: the title names the stretch', () => {
    mount([], { initialView: 'q', views: { q: { type: 'q', family: 'multiMonth', duration: { months: 3 }, alignment: 'month', fixedWeekCount: true, hiddenDays: [], showNonCurrentDates: true } } });
    expect(cal!.kernel.getState().title).toMatch(/oct\.?.*déc\.? 2026/);
  });

  it('defineView: a built-in family name is refused; a second definition replaces the first; a throwing render keeps what was drawn', async () => {
    const { defineView: dv } = await import('../src/custom.js');
    expect(() => dv({ type: 'list', duration: { days: 1 }, render() {} })).toThrow(RangeError);
    dv({ type: 'twice', duration: { days: 1 }, render: (el) => (el.textContent = 'first') });
    let boom = false;
    const spec = dv({ type: 'twice', duration: { days: 1 }, render: (el) => { if (boom) throw new Error('x'); el.textContent = 'second'; } });
    const host = mount([], { initialView: 'twice', views: { twice: spec } });
    expect(host.querySelector('.dz-custom')!.textContent).toBe('second');
    boom = true;
    const reported: unknown[] = [];
    const onRej = (e: PromiseRejectionEvent | unknown) => reported.push(e);
    process.on('unhandledRejection', onRej);
    cal!.navigate('next');
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', onRej);
    expect(host.querySelector('.dz-custom')!.textContent).toBe('second');
    expect(reported).toHaveLength(1);
  });
});

describe('code review fixes', () => {
  it('a day view without the weekend: ArrowRight on Friday goes to Monday, the cursor with it', async () => {
    for (const view of ['timeGridDay', 'dayGridDay']) {
      const host = mount([], { initialView: view, weekends: false, initialDate: Temporal.PlainDate.from('2026-10-23') });
      const start = view === 'timeGridDay' ? host.querySelector<HTMLElement>('.dz-cursor')! : host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-23"]')!;
      start.focus();
      key('ArrowRight');
      expect(cal!.kernel.getState().range.start.toString()).toBe('2026-10-26');
      const where = active().dataset['date'] ?? active().closest<HTMLElement>('[data-date]')?.dataset['date'] ?? active().getAttribute('aria-label');
      expect(String(where)).toMatch(/2026-10-26|26 octobre/);
      key('ArrowLeft');
      expect(cal!.kernel.getState().range.start.toString()).toBe('2026-10-23');
      cal!.destroy();
      cal = null;
      document.body.innerHTML = '';
    }
  });

  it('hiding the focused day moves the focus to the cursor’s day, not the page', () => {
    const host = mount([], { initialView: 'dayGridMonth' });
    host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-24"]')!.focus();
    cal!.update({ hiddenDays: [6, 7] });
    expect(host.contains(document.activeElement)).toBe(true);
    expect(active().matches('.dz-dg__cell')).toBe(true);
  });

  it('hiddenDays outside 1–7 are refused (FullCalendar’s 0 for Sunday is a trap)', () => {
    mount([], { initialView: 'dayGridMonth' });
    expect(() => cal!.update({ hiddenDays: [0 as never] })).toThrow(RangeError);
    expect(cal!.kernel.getState().range.weeks[0]).toHaveLength(7);
  });
});
