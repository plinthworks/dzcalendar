import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, EventInstance, Selection } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';

// The keyboard's whole path through each view, in jsdom: focus, keys, what is said, what changes.
// (Layout is jsdom's: zero sizes, so a time grid's "hour in view" is its first slot.)

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
const key = (el: Element | null, k: string, mods: KeyboardEventInit = {}) => {
  (el ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
};
const press = (k: string, mods: KeyboardEventInit = {}) => key(document.activeElement, k, mods);
const active = () => document.activeElement as HTMLElement;
const said = async () => {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  return document.querySelector('.dz-live')!.textContent ?? '';
};
const startOf = (id: string) => String(cal!.kernel.store.snapshot.getEvent(id)?.start);

describe('month: one tab stop, arrows between days, Enter into a day', () => {
  it('only the cursor’s cell is a tab stop; it starts on today', () => {
    const host = mount([]);
    const stops = [...host.querySelectorAll<HTMLElement>('.dz-dg__cell')].filter((c) => c.tabIndex === 0);
    expect(stops.map((c) => c.dataset['date'])).toEqual(['2026-10-21']);
    // Nothing else in the grid is reached by Tab.
    expect(host.querySelectorAll('.dz-dg [tabindex="0"]')).toHaveLength(1);
  });

  it('arrows move by a day and a week, Home/End to the week’s ends; the tab stop follows', () => {
    const host = mount([]);
    host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-21"]')!.focus();
    press('ArrowRight');
    expect(active().dataset['date']).toBe('2026-10-22');
    press('ArrowDown');
    expect(active().dataset['date']).toBe('2026-10-29');
    press('Home');
    expect(active().dataset['date']).toBe('2026-10-26');
    press('End');
    expect(active().dataset['date']).toBe('2026-11-01');
    expect([...host.querySelectorAll<HTMLElement>('.dz-dg__cell')].filter((c) => c.tabIndex === 0).map((c) => c.dataset['date'])).toEqual(['2026-11-01']);
  });

  it('past the last shown day the month changes, and the cursor goes on from there', () => {
    const host = mount([]);
    host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-11-08"]')!.focus();
    press('ArrowDown');
    expect(cal!.kernel.getState().title).toBe('novembre 2026');
    expect(active().dataset['date']).toBe('2026-11-15');
  });

  it('PageDown: the next month, on the same date (the 31st on the 30th)', () => {
    mount([]);
    document.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-21"]')!.focus();
    press('PageDown');
    expect(cal!.kernel.getState().title).toBe('novembre 2026');
    expect(active().dataset['date']).toBe('2026-11-21');
    press('PageDown');
    document.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-12-31"]')!.focus();
    press('PageUp');
    expect(active().dataset['date']).toBe('2026-11-30');
  });

  it('right to left: the left arrow is the next day', () => {
    mount([], { locale: 'he-IL' });
    document.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-21"]')!.focus();
    press('ArrowLeft');
    expect(active().dataset['date']).toBe('2026-10-22');
  });

  it('Enter on a day with events goes to them; arrows go through them; Escape comes back; Enter on one is a click', () => {
    const clicked: string[] = [];
    mount(
      [
        { id: 'a', title: 'Alpha', start: '2026-10-21T09:00[Europe/Paris]' },
        { id: 'b', title: 'Bravo', start: '2026-10-21T11:00[Europe/Paris]' },
      ],
      { onEventClick: (i: EventInstance) => clicked.push(i.event.id) },
    );
    const cell = document.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-21"]')!;
    expect(cell.getAttribute('aria-label')).toContain('2 événements');
    cell.focus();
    press('Enter');
    expect(active().getAttribute('aria-label')).toContain('Alpha');
    // The focus ring is drawn on the bar the item stands for.
    expect(document.querySelector('.dz-bar[data-event-id="a"]')!.classList.contains('dz-focus')).toBe(true);
    press('ArrowDown');
    expect(active().getAttribute('aria-label')).toContain('Bravo');
    press('Enter');
    expect(clicked).toEqual(['b']);
    press('Escape');
    expect(active()).toBe(cell);
  });

  it('a crowded day lists its drawn events; entered (Enter), every one behind "+N" too, their ring on the link', () => {
    mount(
      Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, title: `E${i}`, start: `2026-10-21T0${i + 1}:00[Europe/Paris]` })),
      { dayMaxLanes: 3 },
    );
    const cell = document.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-21"]')!;
    // Two bars and "+3" in the third lane: two buttons until the day is entered (Phase 12, owner's choice).
    expect(cell.querySelectorAll('.dz-dg__item')).toHaveLength(2);
    expect(cell.getAttribute('aria-label')).toContain('5 événements');
    cell.focus();
    press('Enter');
    const items = [...cell.querySelectorAll<HTMLElement>('.dz-dg__item')];
    expect(items).toHaveLength(5);
    items[4]!.focus();
    expect(document.querySelector('.dz-more.dz-focus')).not.toBeNull();
    // Leaving the day: back to its drawn ones.
    press('Escape');
    press('ArrowRight');
    expect(cell.querySelectorAll('.dz-dg__item')).toHaveLength(2);
  });
});

describe('time grid: a cursor on the slots', () => {
  const week = { initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21') };

  it('tabbing in puts the cursor on today at the hour in view; arrows go by slot and by day', async () => {
    const host = mount([], week);
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    expect(active().getAttribute('aria-label')).toBe('mercredi 21 octobre, 00:00');
    press('ArrowDown');
    expect(active().getAttribute('aria-label')).toBe('mercredi 21 octobre, 00:15');
    press('ArrowRight');
    expect(active().getAttribute('aria-label')).toBe('jeudi 22 octobre, 00:15');
    // One cursor node at a time: the old one is gone.
    expect(host.querySelectorAll('.dz-cursor')).toHaveLength(1);
  });

  it('up from the first slot is the all-day row; down from it, the hours', () => {
    const host = mount([], week);
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowUp');
    expect(active().getAttribute('aria-label')).toBe('mercredi 21 octobre, journée');
    expect(active().parentElement!.classList.contains('dz-tg__allday')).toBe(true);
    press('ArrowDown');
    expect(active().getAttribute('aria-label')).toBe('mercredi 21 octobre, 00:00');
  });

  it('the cursor visits both 02:00–03:00 passes of the 25-hour Sunday, told apart by offset', () => {
    const host = mount([], { initialView: 'timeGridDay', initialDate: Temporal.PlainDate.from('2026-10-25') });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    for (let n = 0; n < 8; n++) press('ArrowDown'); // 00:00 → 02:00
    expect(active().getAttribute('aria-label')).toBe('dimanche 25 octobre, 02:00 (+02:00)');
    for (let n = 0; n < 4; n++) press('ArrowDown');
    expect(active().getAttribute('aria-label')).toBe('dimanche 25 octobre, 02:00 (+01:00)');
  });

  it('Shift+arrows select from where Shift started; Enter gives the selection to the application', async () => {
    const got: Selection[] = [];
    const host = mount([], { ...week, selectable: true, onSelect: (s: Selection) => got.push(s) });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    expect(await said()).toBe('Sélection : mercredi 21 octobre, 00:00 à 00:45');
    press('Enter');
    expect(got.map((s) => [String(s.start), String(s.end)])).toEqual([['2026-10-21T00:00:00+02:00[Europe/Paris]', '2026-10-21T00:45:00+02:00[Europe/Paris]']]);
    // Escape clears it (and says so: the region does not keep "Sélection : …"); a plain arrow too.
    press('Escape');
    expect(host.querySelector('.dz-ghost--select')).toBeNull();
    expect(await said()).toBe('Sélection effacée');
  });

  it('Enter on an empty slot is a date click', () => {
    const clicks: unknown[] = [];
    const host = mount([], { ...week, onDateClick: (c: unknown) => clicks.push(c) });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('Enter');
    expect(clicks).toHaveLength(1);
  });

  it('Escape on an event comes back to the grid, at its start', () => {
    const host = mount([{ id: 'm', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' }], week);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('Escape');
    expect(active().getAttribute('aria-label')).toBe('mercredi 21 octobre, 09:00');
  });
});

describe('grab mode: every drag, by keyboard', () => {
  const week = { initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), editable: true };
  const meeting: EventInput = { id: 'm', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' };

  it('M holds the event, arrows move it a slot and a day, each step said; Enter puts it down', async () => {
    const host = mount([meeting], week);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    expect(await said()).toContain('« Réunion » saisi.');
    // (The preview's boxes need a layout: checked in Chrome, scripts/browser.mjs.)
    expect(host.querySelector('.dz-ev[data-event-id="m"]')!.classList.contains('dz-ev--source')).toBe(true);
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowRight');
    expect(await said()).toBe('jeudi 22 octobre, 09:30 à 10:30');
    press('Enter');
    expect(startOf('m')).toBe('2026-10-22T09:30:00+02:00[Europe/Paris]');
    expect(await said()).toBe('« Réunion » déplacé à 09:30');
    // The focus is on the event where it now is.
    expect(active().dataset['eventId']).toBe('m');
    expect(active().closest<HTMLElement>('.dz-tg__col')!.dataset['date']).toBe('2026-10-22');
    expect(host.querySelector('.dz-ev--source')).toBeNull();
  });

  it('Shift+↓ pulls the end; Alt+Enter grabs too; Ctrl+Z undoes the result', async () => {
    const host = mount([meeting], week);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('Enter', { altKey: true });
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    press('Enter');
    expect(String(cal!.kernel.store.snapshot.getEvent('m')?.end)).toBe('2026-10-21T10:30:00+02:00[Europe/Paris]');
    expect(await said()).toBe('« Réunion » finit maintenant à 10:30');
    press('z', { ctrlKey: true });
    expect(String(cal!.kernel.store.snapshot.getEvent('m')?.end)).toBe('2026-10-21T10:00:00+02:00[Europe/Paris]');
    expect(await said()).toBe('Annulé');
  });

  it('Escape lets go: nothing changes, it is said, the focus stays on the event', async () => {
    const host = mount([meeting], week);
    const node = host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!;
    node.focus();
    press('m');
    press('ArrowDown');
    press('Escape');
    expect(startOf('m')).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
    expect(await said()).toBe('Déplacement annulé');
    expect(active().dataset['eventId']).toBe('m');
  });

  it('past the week’s last day the view goes on to the next week, holding the event', () => {
    const host = mount([{ ...meeting, start: '2026-10-25T09:00[Europe/Paris]', end: '2026-10-25T10:00[Europe/Paris]' }], week);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowRight');
    expect(cal!.kernel.getState().range.start.toString()).toBe('2026-10-26');
    press('Enter');
    expect(startOf('m')).toBe('2026-10-26T09:00:00+01:00[Europe/Paris]');
  });

  it('a refused place is said with its reason, and Enter there changes nothing', async () => {
    const host = mount([meeting, { id: 'o', title: 'Autre', start: '2026-10-21T10:00[Europe/Paris]', end: '2026-10-21T11:00[Europe/Paris]' }], {
      ...week,
      rules: { overlap: false },
    });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowDown');
    expect(await said()).toBe('mercredi 21 octobre, 09:15 à 10:15. Impossible ici : chevauche un autre événement');
    press('Enter');
    expect(startOf('m')).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
  });

  it('up from the first slot puts a timed event on the all-day row (it becomes a day)', () => {
    const host = mount([{ id: 'n', title: 'Nuit', start: '2026-10-21T00:00[Europe/Paris]', end: '2026-10-21T01:00[Europe/Paris]' }], week);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="n"]')!.focus();
    press('m');
    press('ArrowUp');
    press('Enter');
    const ev = cal!.kernel.store.snapshot.getEvent('n')!;
    expect([ev.allDay, String(ev.start)]).toEqual([true, '2026-10-21']);
  });

  it('in a month: a day event moves a week down and grows a day with Shift+→', async () => {
    mount([{ id: 't', title: 'Lyon', start: '2026-10-21', end: '2026-10-23' }], { editable: true });
    document.querySelector<HTMLElement>('.dz-dg__item[data-event-id="t"]')!.focus();
    press('m');
    press('ArrowDown');
    press('ArrowRight', { shiftKey: true });
    press('Enter');
    await said(); // the focus is given back once the drop has settled
    const ev = cal!.kernel.store.snapshot.getEvent('t')!;
    expect([String(ev.start), String(ev.end)]).toEqual(['2026-10-28', '2026-10-31']);
    expect(active().closest<HTMLElement>('.dz-dg__cell')!.dataset['date']).toBe('2026-10-28');
  });

  it('an occurrence held and put down asks how far, as a drop does', () => {
    const host = mount([{ id: 's', title: 'Stand-up', start: '2026-10-19T09:00[Europe/Paris]', duration: { minutes: 15 }, rrule: 'FREQ=DAILY;COUNT=5' }], week);
    host.querySelector<HTMLElement>('.dz-ev[data-series-id="s"]')!.focus();
    press('m');
    press('ArrowDown');
    press('Enter');
    expect([...host.querySelectorAll('.dz-menu [role="menuitem"]')].map((b) => b.getAttribute('data-action'))).toEqual(['this', 'following', 'all']);
  });

  it('not editable: M says so and holds nothing', async () => {
    const host = mount([meeting], { ...week, editable: false });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    expect(await said()).toBe('Cet événement ne peut pas être modifié');
    expect(host.querySelector('.dz-ev--source')).toBeNull();
  });

  it('the context menu’s "Move…" enters the same mode', () => {
    const host = mount([meeting], week);
    const node = host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!;
    node.focus();
    press('F10', { shiftKey: true });
    const move = [...host.querySelectorAll<HTMLElement>('.dz-menu [role="menuitem"]')].find((b) => b.dataset['action'] === 'event.move')!;
    expect(move.textContent).toContain('Déplacer…');
    move.click();
    press('ArrowDown');
    press('Enter');
    expect(startOf('m')).toBe('2026-10-21T09:15:00+02:00[Europe/Paris]');
  });
});

describe('Delete, undo, redo', () => {
  it('Delete removes the event, says how to undo it, and the cursor takes the focus; Ctrl+Z brings it back', async () => {
    const host = mount([{ id: 'x', title: 'X', start: '2026-10-21' }], { editable: true });
    host.querySelector<HTMLElement>('.dz-dg__item[data-event-id="x"]')!.focus();
    press('Delete');
    expect(!!cal!.kernel.store.snapshot.getEvent('x')).toBe(false);
    expect(await said()).toBe('« X » supprimé. Ctrl+Z pour annuler.');
    expect(active().dataset['date']).toBe('2026-10-21');
    press('z', { metaKey: true });
    expect(!!cal!.kernel.store.snapshot.getEvent('x')).toBe(true);
    press('z', { metaKey: true, shiftKey: true });
    expect(!!cal!.kernel.store.snapshot.getEvent('x')).toBe(false);
    expect(await said()).toBe('Rétabli');
  });

  it('keyboardUndo: false leaves Ctrl+Z to the page', () => {
    const host = mount([{ id: 'x', title: 'X', start: '2026-10-21' }], { editable: true, keyboardUndo: false });
    host.querySelector<HTMLElement>('.dz-dg__item[data-event-id="x"]')!.focus();
    press('Delete');
    press('z', { ctrlKey: true });
    expect(!!cal!.kernel.store.snapshot.getEvent('x')).toBe(false);
  });
});

describe('the "+N" panel', () => {
  it('Enter on an event there is a click', () => {
    const clicked: string[] = [];
    const host = mount(
      Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, title: `E${i}`, start: `2026-10-21T0${i + 1}:00[Europe/Paris]` })),
      { dayMaxLanes: 3, onEventClick: (i: EventInstance) => clicked.push(i.event.id) },
    );
    host.querySelector<HTMLElement>('.dz-more')!.click();
    const item = host.querySelector<HTMLElement>('.dz-pop .dz-bar')!;
    item.focus();
    press('Enter');
    expect(clicked).toEqual(['e0']);
  });
});

describe('the time grid’s whole path (acceptance: every view by keyboard)', () => {
  const week = { initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21') };
  const label = () => active().getAttribute('aria-label');

  it('Home/End go to the day’s first and last slot; PageDown goes a week on, same day and time', () => {
    const host = mount([], week);
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('End');
    expect(label()).toBe('mercredi 21 octobre, 23:45');
    press('Home');
    expect(label()).toBe('mercredi 21 octobre, 00:00');
    press('ArrowDown');
    press('PageDown');
    expect(cal!.kernel.getState().range.start.toString()).toBe('2026-10-26');
    expect(label()).toBe('mercredi 28 octobre, 00:15');
  });

  it('the day view: right goes to the next day', () => {
    const host = mount([], { initialView: 'timeGridDay', initialDate: Temporal.PlainDate.from('2026-10-21') });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowRight');
    expect(cal!.kernel.getState().range.start.toString()).toBe('2026-10-22');
    expect(label()).toBe('jeudi 22 octobre, 00:00');
  });

  it('right to left: ← is the next day, for the cursor and for a held event', () => {
    const host = mount([{ id: 'm', title: 'M', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' }], { ...week, locale: 'he-IL', editable: true });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowLeft');
    expect(label()).toContain('22');
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowLeft');
    press('Enter');
    expect(startOf('m')).toBe('2026-10-22T09:00:00+02:00[Europe/Paris]');
  });

  it('Space on a slot is a date click; Space on an event is a click', () => {
    const clicks: unknown[] = [];
    const host = mount([{ id: 'm', title: 'M', start: '2026-10-21T09:00[Europe/Paris]' }], { ...week, onDateClick: (c: unknown) => clicks.push(c), onEventClick: (i: EventInstance) => clicks.push(i.event.id) });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press(' ');
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press(' ');
    expect(clicks).toHaveLength(2);
    expect(clicks[1]).toBe('m');
  });

  it('Shift+F10 on the cursor: the menu of that very slot — both readings in the repeated hour', () => {
    const host = mount([], { initialView: 'timeGridDay', initialDate: Temporal.PlainDate.from('2026-10-25'), onCreateRequest: () => {} });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    for (let n = 0; n < 10; n++) press('ArrowDown'); // 02:30, first pass
    press('F10', { shiftKey: true });
    const labels = [...host.querySelectorAll('.dz-menu [role="menuitem"] .dz-menu__label')].map((b) => b.textContent);
    expect(labels.slice(0, 2)).toEqual(['Nouvel événement à 02:30 (+02:00)', 'Nouvel événement à 02:30 (+01:00)']);
  });

  it('a screen reader’s bare click on the cursor or an event does what Enter does', () => {
    const clicks: unknown[] = [];
    const host = mount([{ id: 'm', title: 'M', start: '2026-10-21T09:00[Europe/Paris]' }], { ...week, onDateClick: (c: unknown) => clicks.push(c), onEventClick: (i: EventInstance) => clicks.push(i.event.id) });
    const cursor = host.querySelector<HTMLElement>('.dz-cursor')!;
    cursor.focus();
    active().click();
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.click();
    expect(clicks).toHaveLength(2);
    expect(clicks[1]).toBe('m');
  });
});

describe('grab mode covers every drag (acceptance)', () => {
  const week = { initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), editable: true };
  const meeting: EventInput = { id: 'm', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' };
  const endOf = (id: string) => String(cal!.kernel.store.snapshot.getEvent(id)?.end);

  it('Alt+Shift pulls the start when eventResizableFromStart; otherwise it is said that it cannot', async () => {
    let host = mount([meeting], { ...week, eventResizableFromStart: true });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowUp', { shiftKey: true, altKey: true });
    press('Enter');
    expect([startOf('m'), endOf('m')]).toEqual(['2026-10-21T08:45:00+02:00[Europe/Paris]', '2026-10-21T10:00:00+02:00[Europe/Paris]']);
    expect(await said()).toBe('« Réunion » commence maintenant à 08:45');
    cal!.destroy();
    document.body.innerHTML = '';
    host = mount([meeting], week);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowUp', { shiftKey: true, altKey: true });
    expect(await said()).toBe('Cette durée ne peut pas être changée ici');
  });

  it('down from the all-day row a day event goes into the hours, timed, and it is said', async () => {
    const host = mount([{ id: 'd', title: 'Jour', start: '2026-10-21', end: '2026-10-22' }], week);
    host.querySelector<HTMLElement>('.dz-bar[data-event-id="d"]')!.focus();
    press('m');
    press('ArrowDown');
    expect(await said()).toContain('Il devient un événement horaire de');
    press('Enter');
    const ev = cal!.kernel.store.snapshot.getEvent('d')!;
    expect([ev.allDay, String(ev.start)]).toEqual([false, '2026-10-21T00:00:00+02:00[Europe/Paris]']);
    expect(await said()).toContain('Il devient un événement horaire de');
  });

  it('a timed event in a month moves by days but its length cannot change there (and the menu does not offer it)', async () => {
    const host = mount([meeting], { editable: true });
    host.querySelector<HTMLElement>('.dz-dg__item[data-event-id="m"]')!.focus();
    press('F10', { shiftKey: true });
    const ids = [...host.querySelectorAll<HTMLElement>('.dz-menu [role="menuitem"]')].map((b) => b.dataset['action']);
    expect(ids).toContain('event.move');
    expect(ids).not.toContain('event.resize');
    press('Escape');
    press('m');
    press('ArrowRight', { shiftKey: true });
    expect(await said()).toBe('Cette durée ne peut pas être changée ici');
    press('ArrowRight');
    press('Enter');
    expect(startOf('m')).toBe('2026-10-22T09:00:00+02:00[Europe/Paris]');
  });

  it('in a month, holding an event past the last week goes on to the next month', () => {
    mount([{ id: 't', title: 'T', start: '2026-11-04', end: '2026-11-05' }], { editable: true });
    document.querySelector<HTMLElement>('.dz-dg__item[data-event-id="t"]')!.focus();
    press('m');
    press('ArrowDown');
    expect(cal!.kernel.getState().title).toBe('novembre 2026');
    press('Enter');
    expect(startOf('t')).toBe('2026-11-11');
  });

  it('an occurrence: "All events" chosen by keyboard moves the whole series', async () => {
    const host = mount([{ id: 's', title: 'Stand-up', start: '2026-10-19T09:00[Europe/Paris]', duration: { minutes: 15 }, rrule: 'FREQ=DAILY;COUNT=5' }], week);
    host.querySelectorAll<HTMLElement>('.dz-ev[data-series-id="s"]')[2]!.focus();
    press('m');
    press('ArrowDown');
    press('Enter');
    press('End'); // in the menu: the last entry, "All events"
    active().click();
    await said();
    const starts = [...host.querySelectorAll<HTMLElement>('.dz-ev[data-series-id="s"]')].map((n) => n.getAttribute('aria-label'));
    expect(starts).toHaveLength(5);
    expect(starts.every((l) => l!.includes('09:15'))).toBe(true);
  });

  it('into the repeated hour by keyboard: Enter asks which 02:30', () => {
    const host = mount([{ id: 'r', title: 'R', start: '2026-10-25T01:00[Europe/Paris]', end: '2026-10-25T01:30[Europe/Paris]' }], { ...week, initialDate: Temporal.PlainDate.from('2026-10-25') });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="r"]')!.focus();
    press('m');
    for (let n = 0; n < 6; n++) press('ArrowDown'); // 02:30, first pass
    press('Enter');
    expect([...host.querySelectorAll<HTMLElement>('.dz-menu [role="menuitem"]')].map((b) => b.dataset['action'])).toEqual(['first', 'second']);
  });

  it('Delete on an occurrence asks how far', () => {
    const host = mount([{ id: 's', title: 'S', start: '2026-10-19T09:00[Europe/Paris]', duration: { minutes: 15 }, rrule: 'FREQ=DAILY;COUNT=5' }], week);
    host.querySelector<HTMLElement>('.dz-ev[data-series-id="s"]')!.focus();
    press('Delete');
    expect(host.querySelector('.dz-menu')!.getAttribute('aria-label')).toBe('Supprimer quels événements ?');
  });

  it('Shift+arrows in a month select days', () => {
    const got: Selection[] = [];
    mount([], { selectable: true, onSelect: (s: Selection) => got.push(s) });
    document.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-21"]')!.focus();
    press('ArrowRight', { shiftKey: true });
    press('ArrowRight', { shiftKey: true });
    press(' ');
    expect(got.map((s) => [String(s.start), String(s.end)])).toEqual([['2026-10-21', '2026-10-24']]);
  });

  it('the focus leaving the calendar lets go of a held event', () => {
    const host = mount([meeting], week);
    const outside = document.createElement('button');
    document.body.append(outside);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    outside.focus();
    expect(host.querySelector('.dz-ev--source')).toBeNull();
    press('ArrowDown');
    expect(startOf('m')).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
  });
});

describe('review fixes', () => {
  const week = { initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), editable: true };
  const meeting: EventInput = { id: 'm', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' };

  it('a field or a link an application puts inside an event keeps its keys', () => {
    const content = () => {
      const box = document.createElement('span');
      box.innerHTML = '<input class="note"><a class="lnk" href="#x">lien</a>';
      return box;
    };
    const host = mount([meeting], { ...week, hooks: { event: { content } } });
    const input = host.querySelector<HTMLInputElement>('.dz-ev[data-event-id="m"] .note')!;
    input.focus();
    press('m');
    press('ArrowDown');
    expect(host.querySelector('.dz-ev--source')).toBeNull();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    host.querySelector('.dz-ev[data-event-id="m"] .lnk')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('the period changed under a focused cursor: the next arrow puts it back in view, without changing period again', () => {
    const host = mount([], week);
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowRight');
    cal!.update({ date: Temporal.PlainDate.from('2026-03-28') });
    press('ArrowRight');
    expect(cal!.kernel.getState().range.start.toString()).toBe('2026-03-23');
    expect(active().getAttribute('aria-label')).toMatch(/mars/);
  });

  it('Ctrl+Z after a keyboard move: the focus stays on the event, where it is back', async () => {
    const host = mount([meeting], week);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowRight');
    press('Enter');
    await said();
    press('z', { ctrlKey: true });
    expect(startOf('m')).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
    expect(active().dataset['eventId']).toBe('m');
    expect(active().closest<HTMLElement>('.dz-tg__col')!.dataset['date']).toBe('2026-10-21');
  });

  it('Apia, 29 December 2011 08:00 held one day on: Saturday 31 at 08:00 (the 30th never happened)', async () => {
    const host = mount([{ id: 'a', title: 'A', start: '2011-12-29T08:00[Pacific/Apia]', end: '2011-12-29T09:00[Pacific/Apia]' }], {
      ...week,
      timeZone: 'Pacific/Apia',
      initialDate: Temporal.PlainDate.from('2011-12-29'),
    });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="a"]')!.focus();
    press('m');
    press('ArrowRight');
    press('Enter');
    await said();
    expect(startOf('a')).toBe('2011-12-31T08:00:00+14:00[Pacific/Apia]');
  });

  it('"Change duration…": plain arrows pull the end, as its help says', async () => {
    const host = mount([meeting], week);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('F10', { shiftKey: true });
    [...host.querySelectorAll<HTMLElement>('.dz-menu [role="menuitem"]')].find((b) => b.dataset['action'] === 'event.resize')!.click();
    expect(await said()).toContain('Flèches pour sa fin');
    press('ArrowDown');
    press('Enter');
    expect(startOf('m')).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
    expect(String(cal!.kernel.store.snapshot.getEvent('m')?.end)).toBe('2026-10-21T10:15:00+02:00[Europe/Paris]');
  });
});
