import { describe, it, expect, afterEach } from 'vitest';
import { Temporal, createHistory, createIdGenerator } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { createCalendar, EN } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';

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
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, events, initialView: 'dayGridMonth', ...over });
  return host;
};
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s/g, ' ');
const prop = (el: Element, n: string) => (el as HTMLElement).style.getPropertyValue(n);
const run = (cmd: Parameters<ReturnType<typeof createHistory>['run']>[0]) =>
  createHistory(cal!.kernel.store, { normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('t') } }).run(cmd);

describe('month view', () => {
  it('six weeks from Monday, padding days marked, today marked, a title', () => {
    const host = mount([]);
    const weeks = host.querySelectorAll('.dz-dg__week');
    expect(weeks).toHaveLength(6);
    expect(host.querySelector('.dz-dg__cell')!.getAttribute('data-date')).toBe('2026-09-28');
    expect(host.querySelector('.dz-dg__cell')!.classList.contains('dz-dg__cell--outside')).toBe(true);
    expect(host.querySelector('.dz-dg__cell--today')!.getAttribute('data-date')).toBe('2026-10-21');
    expect(text(host.querySelector('.dz-toolbar__title'))).toBe('octobre 2026');
  });

  it('an all-day trip is one bar across its days; a timed event a dot with its time', () => {
    const host = mount([
      { id: 'trip', title: 'Lyon', start: '2026-10-21', end: '2026-10-24' },
      { id: 'call', title: 'Appel', start: '2026-10-22T09:30[Europe/Paris]' },
    ]);
    const trip = host.querySelector('[data-key^="trip|"]')!;
    expect([prop(trip, '--col'), prop(trip, '--span'), text(trip)]).toEqual(['2', '3', 'Lyon']);
    const call = host.querySelector('[data-key^="call|"]')!;
    expect(call.classList.contains('dz-bar--timed')).toBe(true);
    expect(text(call)).toBe('09:30 Appel');
  });

  it('the two 02:30s of the 25-hour Sunday are told apart in the month too', () => {
    const host = mount([
      { id: 'f', title: 'A', start: '2026-10-25T02:30+02:00[Europe/Paris]', duration: { minutes: 30 } },
      { id: 's', title: 'B', start: '2026-10-25T02:30+01:00[Europe/Paris]', duration: { minutes: 30 } },
    ]);
    expect(text(host.querySelector('[data-key^="f|"] .dz-bar__time'))).toBe('02:30');
    expect(text(host.querySelector('[data-key^="s|"] .dz-bar__time'))).toBe('02:30*');
    // What is read is the day's item for the event (the bar is drawn, not read).
    expect(host.querySelector('[data-key^="item:s|"]')!.getAttribute('aria-label')).toContain('(+01:00)');
  });

  it('a Tokyo event late at night lands on the Paris day it happens', () => {
    const host = mount([{ id: 'tk', title: 'TK', start: '2026-10-22T05:00[Asia/Tokyo]' }]);
    expect(host.querySelector('[data-key^="tk|"]')!.closest('.dz-dg__week')!.querySelector(`.dz-dg__cell[data-date="2026-10-21"]`)).not.toBeNull();
    expect(prop(host.querySelector('[data-key^="tk|"]')!, '--col')).toBe('2');
  });
});

describe('"+N" and its panel', () => {
  const crowded: EventInput[] = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, title: `E${i}`, start: `2026-10-21T0${i + 1}:00[Europe/Paris]` }));

  it('with 3 lanes, a day of 5 shows 2 and "+3 autres"', () => {
    const host = mount(crowded, { dayMaxLanes: 3 });
    const week = host.querySelector('.dz-dg__cell[data-date="2026-10-21"]')!.closest('.dz-dg__week')!;
    const shown = [...week.querySelectorAll('.dz-bar')].filter((b) => prop(b, '--col') === '2');
    expect(shown).toHaveLength(2);
    const more = week.querySelector<HTMLButtonElement>('.dz-more')!;
    expect([text(more), prop(more, '--col'), prop(more, '--lane')]).toEqual(['+3 autres', '2', '2']);
    expect(more.getAttribute('aria-label')).toBe('3 autres événements, mercredi 21 octobre');
  });

  it('opens a panel with every event of the day, Escape closes it and gives focus back', () => {
    const host = mount(crowded, { dayMaxLanes: 3 });
    const more = host.querySelector<HTMLButtonElement>('.dz-more')!;
    more.focus();
    more.click();
    const pop = host.querySelector<HTMLElement>('.dz-pop')!;
    expect(pop.hidden).toBe(false);
    expect(pop.getAttribute('role')).toBe('dialog');
    expect(text(pop.querySelector('.dz-pop__title'))).toBe('mercredi 21 octobre');
    expect(pop.querySelectorAll('.dz-pop__list .dz-bar')).toHaveLength(5);
    expect(pop.contains(document.activeElement)).toBe(true);
    pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(pop.hidden).toBe(true);
    expect(document.activeElement).toBe(more);
  });

  it('the panel lives inside the calendar, so it carries the theme and direction', () => {
    const host = mount(crowded, { dayMaxLanes: 3 });
    expect(host.querySelector('.dz-cal .dz-pop')).not.toBeNull();
  });
});

describe('context menu', () => {
  it('right-click on a day offers to create there and to go to that day', () => {
    const created: string[] = [];
    const host = mount([], { onCreateRequest: (r: { allDay: boolean; start: { toString(): string } }) => created.push(`${r.allDay}|${r.start}`) });
    const cell = host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-23"]')!;
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    cell.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    const menu = host.querySelector<HTMLElement>('.dz-menu')!;
    expect(menu.hidden).toBe(false);
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((x) => (x as HTMLElement).dataset['action'])).toEqual(['event.create', 'view.goToDay']);
    menu.querySelector<HTMLButtonElement>('[data-action="event.create"]')!.click();
    expect(created).toEqual(['true|2026-10-23']);
    expect(menu.hidden).toBe(true);
  });

  it('Shift+F10 on a focused event opens its menu; Escape returns focus to it', () => {
    const opened: string[] = [];
    const host = mount([{ id: 'x', title: 'X', start: '2026-10-21' }], { onEventOpen: (i: { key: string }) => opened.push(i.key) });
    // In a month the focus is on the event's item in its cell.
    const bar = host.querySelector<HTMLElement>('[data-key^="item:x|"]')!;
    bar.focus();
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    const menu = host.querySelector<HTMLElement>('.dz-menu')!;
    expect(document.activeElement!.getAttribute('data-action')).toBe('event.open');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(bar);
  });

  it('on the repeated 02:30 the time grid offers both readings', () => {
    const host = mount([], { initialView: 'timeGridDay', initialDate: Temporal.PlainDate.from('2026-10-25'), onCreateRequest: () => {} });
    const col = host.querySelector<HTMLElement>('.dz-tg__col')!;
    // jsdom has no layout: one pixel per minute, so y = 150 is 02:30.
    col.getBoundingClientRect = () => ({ top: 0, height: 1440, left: 0, width: 100, bottom: 1440, right: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
    col.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 150 }));
    const labels = [...host.querySelectorAll('.dz-menu [role="menuitem"] .dz-menu__label')].map(text);
    expect(labels.slice(0, 2)).toEqual(['Nouvel événement à 02:30 (+02:00)', 'Nouvel événement à 02:30 (+01:00)']);
  });

  it('the application can replace the entries, or keep the browser’s menu', () => {
    const host = mount([], {
      contextMenu: (ctx: { target: { kind: string } }) => (ctx.target.kind === 'day' ? [{ id: 'book', label: 'Réserver', enabled: true }] : null),
    });
    const cell = host.querySelector<HTMLElement>('.dz-dg__cell')!;
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect([...host.querySelectorAll('.dz-menu [role="menuitem"]')].map(text)).toEqual(['Réserver']);
  });
});

describe('business hours, views, updates', () => {
  it('time grid: hours outside 09:00–18:00 are shaded; month: a closed Sunday is marked', () => {
    const bh = { daysOfWeek: [1, 2, 3, 4, 5, 6], start: '09:00', end: '18:00' } as const;
    const host = mount([], { initialView: 'timeGridDay', businessHours: bh });
    const off = [...host.querySelectorAll('.dz-tg__col .dz-off')].map((o) => [prop(o, '--t'), prop(o, '--h')]);
    expect(off).toEqual([['0', '540'], ['1080', '360']]);
    cal!.update({ view: 'dayGridMonth' });
    expect(host.querySelector('.dz-dg__cell[data-date="2026-10-25"]')!.classList.contains('dz-dg__cell--closed')).toBe(true);
    expect(host.querySelector('.dz-dg__cell[data-date="2026-10-24"]')!.classList.contains('dz-dg__cell--closed')).toBe(false);
  });

  it('the view switcher shows month, week, day; the current one pressed', () => {
    const host = mount([]);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.dz-toolbar__view')];
    expect(buttons.map((b) => [b.dataset['view'], b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['dayGridMonth', 'Mois', 'true'],
      ['timeGridWeek', 'Semaine', 'false'],
      ['timeGridDay', 'Jour', 'false'],
    ]);
    buttons[1]!.click();
    expect(host.querySelector('.dz-tg')).not.toBeNull();
    expect(host.querySelector('.dz-dg')).toBeNull();
  });

  it('the day number leads to that day', () => {
    const host = mount([]);
    host.querySelector<HTMLButtonElement>('.dz-dg__cell[data-date="2026-10-23"] .dz-dg__num')!.click();
    expect(cal!.kernel.getState().view.type).toBe('timeGridDay');
    expect(cal!.kernel.getState().date.toString()).toBe('2026-10-23');
  });

  it('update({ events }) with the same content redraws nothing', () => {
    const events = [{ id: 'a', title: 'A', start: '2026-10-21' }];
    const host = mount(events);
    const bar = host.querySelector('[data-key^="a|"]');
    let changes = 0;
    cal!.kernel.subscribe(() => changes++);
    cal!.update({ events: JSON.parse(JSON.stringify(events)) });
    expect(changes).toBe(0);
    expect(host.querySelector('[data-key^="a|"]')).toBe(bar);
  });
});

describe('content hooks', () => {
  it('a neighbour moving does not re-run another event’s content hook (FullCalendar #5594)', () => {
    const calls: Record<string, number> = {};
    const host = mount(
      [
        { id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T11:00[Europe/Paris]' },
        { id: 'b', title: 'B', start: '2026-10-21T13:00[Europe/Paris]' },
      ],
      {
        initialView: 'timeGridDay',
        hooks: { event: { content: (c: { instance: { key: string } }) => ((calls[c.instance.key] = (calls[c.instance.key] ?? 0) + 1), null) } },
      },
    );
    expect(calls).toEqual({ a: 1, b: 1 });
    // B moves under A: A's position changes (side by side), its content does not.
    run({ type: 'event.update', id: 'b', patch: { start: '2026-10-21T10:00[Europe/Paris]' } });
    expect(calls).toEqual({ a: 1, b: 2 });
    expect(prop(host.querySelector('[data-key^="a|"]')!, '--w')).toBe('0.5');
  });

  it('didMount gets the node, its cleanup and willUnmount run when it goes', () => {
    const log: string[] = [];
    mount([{ id: 'a', title: 'A', start: '2026-10-21' }], {
      hooks: { event: { didMount: () => (log.push('mount'), () => log.push('cleanup')), willUnmount: () => log.push('unmount') } },
    });
    run({ type: 'event.delete', id: 'a' });
    expect(log).toEqual(['mount', 'cleanup', 'unmount']);
  });

  it('a hook may return its own content', () => {
    const host = mount([{ id: 'a', title: 'A', start: '2026-10-21' }], { hooks: { event: { content: () => '★ custom' } } });
    expect(text(host.querySelector('[data-key^="a|"]'))).toBe('★ custom');
  });
});

describe('robust lifecycle', () => {
  it('destroy removes every listener it added to the document', () => {
    const added = new Map<string, number>();
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = ((t: string, f: EventListener, o?: unknown) => (added.set(t, (added.get(t) ?? 0) + 1), add(t, f, o as boolean))) as typeof document.addEventListener;
    document.removeEventListener = ((t: string, f: EventListener, o?: unknown) => (added.set(t, (added.get(t) ?? 0) - 1), remove(t, f, o as boolean))) as typeof document.removeEventListener;
    try {
      mount([], { messages: EN });
      cal!.destroy();
      cal = null;
      expect([...added.values()].every((n) => n === 0)).toBe(true);
    } finally {
      document.addEventListener = add;
      document.removeEventListener = remove;
    }
  });
});
