import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, Selection } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import '../src/list.js';
import type { CalendarInstance } from '../src/index.js';

// Phase 18j-3, batch 3 (drag and drop, selection, keyboard guides): what their review against the code found.

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
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
  (el ?? document.body).dispatchEvent(e);
  return e;
};
const press = (k: string, mods: KeyboardEventInit = {}) => key(document.activeElement, k, mods);
const said = async () => {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  return document.querySelector('.dz-live')!.textContent ?? '';
};
const week = { initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21') };
const meeting: EventInput = { id: 'm', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' };

describe('a Shift-made selection is handed once', () => {
  it('Enter again does not give the same selection a second time', () => {
    const got: Selection[] = [];
    const clicks: unknown[] = [];
    const host = mount([], { ...week, selectable: true, onSelect: (s: Selection) => got.push(s), onDateClick: (c: unknown) => clicks.push(c) });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowDown', { shiftKey: true });
    press('Enter');
    press('Enter');
    press(' ');
    expect(got).toHaveLength(1);
    expect(clicks).toHaveLength(0);
  });

  it('once the application took it (cleared in onSelect), the next Enter is spent, not a new tap', () => {
    const got: Selection[] = [];
    const clicks: unknown[] = [];
    const host = mount([], {
      ...week,
      selectable: true,
      onSelect: (s: Selection) => {
        got.push(s);
        cal!.select(null);
      },
      onDateClick: (c: unknown) => clicks.push(c),
    });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowDown', { shiftKey: true });
    press('Enter');
    press('Enter');
    expect(got).toHaveLength(1);
    expect(clicks).toHaveLength(0);
    // The one after is a tap again: the date click, and the slot selected.
    press('Enter');
    expect(clicks).toHaveLength(1);
    expect(got).toHaveLength(2);
  });
});

describe('a press outside the calendar clears a selection (owner)', () => {
  it('said through onUnselect; the calendar’s own parts and a marked form keep it', () => {
    let unselected = 0;
    const host = mount([], { ...week, selectable: true, onUnselect: () => void unselected++ });
    const outside = document.createElement('button');
    const form = document.createElement('form');
    form.dataset['dzKeepSelection'] = '';
    const field = document.createElement('input');
    form.append(field);
    document.body.append(outside, form);
    const down = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowDown', { shiftKey: true });
    down(field);
    down(host.querySelector('.dz-tg')!);
    expect(unselected).toBe(0);
    down(outside);
    expect(unselected).toBe(1);
    down(outside);
    expect(unselected).toBe(1);
  });
});

describe('what a refusal says', () => {
  it('a refused place names the rule in the calendar’s language', async () => {
    const other: EventInput = { id: 'o', title: 'Autre', start: '2026-10-21T10:00[Europe/Paris]', end: '2026-10-21T11:00[Europe/Paris]' };
    const host = mount([meeting, other], { ...week, editable: true, rules: { overlap: false } });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    for (let n = 0; n < 4; n++) press('ArrowDown');
    expect(await said()).toMatch(/^mercredi 21 octobre, 10:00 à 11:00\. Impossible ici : \S/);
  });

  it('a refused action (a menu entry) is not "not allowed here"', async () => {
    const refused: string[] = [];
    const host = mount([meeting], { ...week, editable: true, onCommandRefused: (_: unknown, c: { type: string }) => refused.push(c.type) });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('F10', { shiftKey: true });
    const del = [...host.querySelectorAll<HTMLElement>('.dz-menu [role="menuitem"]')].find((b) => b.dataset['action'] === 'event.delete');
    expect(del).toBeDefined();
    // Gone meanwhile (a refetch): the menu's delete is refused.
    cal!.kernel.run({ type: 'event.delete', id: 'm' });
    del!.click();
    expect(refused).toEqual(['event.delete']);
    expect(await said()).toBe('Action refusée');
  });
});

describe('a control an application put inside an event keeps its keys', () => {
  const withField = (host: HTMLElement, selector: string) => {
    const field = document.createElement('input');
    host.querySelector(selector)!.append(field);
    field.focus();
    return field;
  };

  it('the Menu key and Shift+F10 in it: no calendar menu, the browser’s own', () => {
    const host = mount([meeting], { ...week, editable: true });
    withField(host, '.dz-ev[data-event-id="m"]');
    const e = press('F10', { shiftKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(host.querySelector('.dz-menu [role="menuitem"]')).toBeNull();
    const c = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(c);
    expect(c.defaultPrevented).toBe(false);
  });

  it('in a list row: Backspace, Space and the arrows stay the field’s', () => {
    const host = mount([meeting, { ...meeting, id: 'n', start: '2026-10-22T09:00[Europe/Paris]', end: '2026-10-22T10:00[Europe/Paris]' }], { initialView: 'listWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), editable: true });
    withField(host, '.dz-list__ev');
    for (const k of ['Backspace', ' ', 'ArrowDown']) expect(press(k).defaultPrevented).toBe(false);
    expect(!!cal!.kernel.store.snapshot.getEvent('m')).toBe(true);
    expect(document.activeElement!.tagName).toBe('INPUT');
  });
});

describe('today, heard in a week', () => {
  it('the column of today carries aria-current (its day head is not read)', () => {
    const host = mount([], week);
    const current = [...host.querySelectorAll<HTMLElement>('.dz-tg__col[aria-current="date"]')].map((c) => c.dataset['date']);
    expect(current).toEqual(['2026-10-21']);
  });
});
