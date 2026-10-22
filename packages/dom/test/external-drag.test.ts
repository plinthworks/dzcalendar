import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, ZonedDateTime } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import { makeDraggable } from '../src/drag.js';
import type { CalendarInstance, EventChange } from '../src/index.js';

// Dragging in from the page with the keyboard (docs/behaviors/external-drag.md). Paris, Wednesday 21 October 2026, 10:00.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cals: CalendarInstance[] = [];
afterEach(() => {
  for (const c of cals) c.destroy();
  cals = [];
  document.body.innerHTML = '';
});
const make = (o: Record<string, unknown> = {}) => {
  const c = createCalendar(document.body.appendChild(document.createElement('div')), {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    initialView: 'timeGridWeek',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    now,
    editable: true,
    droppable: true,
    ...o,
  });
  cals.push(c);
  return c;
};
const card = (event: EventInput, data: unknown = { patient: 42 }) => {
  const el = document.body.appendChild(document.createElement('div'));
  el.textContent = event.title ?? '';
  return { el, off: makeDraggable(el, { event, data }) };
};
const key = (k: string, o: KeyboardEventInit = {}) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
/** The card taken with Enter, then the calendar's grid focused (as Tab would). */
const carryInto = (el: HTMLElement, c: CalendarInstance) => {
  el.focus();
  key('Enter');
  c.element.querySelector<HTMLElement>('.dz-cursor')!.focus();
};

describe('dragging in with the keyboard', () => {
  it('Enter takes the card; in the calendar the arrows place it, Enter puts it down: an event of its 30 minutes, told to onDrop and onEventReceive', async () => {
    const drops: unknown[] = [];
    const received: EventChange[] = [];
    const c = make({ onDrop: (d: unknown) => void drops.push(d), onEventReceive: (ch: EventChange) => void received.push(ch) });
    const { el } = card({ title: 'Consultation', duration: { minutes: 30 } });
    carryInto(el, c);
    const pressed = el.getAttribute('aria-pressed');
    key('ArrowDown');
    key('Enter');
    // The drop settles in a microtask (a chooser may be asked first).
    await Promise.resolve();
    const made = [...c.kernel.store.snapshot.allEvents()].find((e) => e.title === 'Consultation')!;
    const ms = (made.end as ZonedDateTime).epochMilliseconds - (made.start as ZonedDateTime).epochMilliseconds;
    expect([pressed, ms / 60000, drops.length, (drops[0] as { data: unknown }).data, received.length, received[0]!.after?.title, el.hasAttribute('aria-pressed')]).toEqual(['true', 30, 1, { patient: 42 }, 1, 'Consultation', false]);
  });

  it('onEventReceive’s revert takes it away; one undo does too', () => {
    let change: EventChange | null = null;
    const c = make({ onEventReceive: (ch: EventChange) => void (change = ch) });
    const { el } = card({ title: 'A', duration: { minutes: 30 } });
    carryInto(el, c);
    key('Enter');
    const before = [...c.kernel.store.snapshot.allEvents()].length;
    change!.revert();
    const after = [...c.kernel.store.snapshot.allEvents()].length;
    carryInto(el, c);
    key('Enter');
    c.undo();
    expect([before, after, [...c.kernel.store.snapshot.allEvents()].length]).toEqual([1, 0, 0]);
  });

  it('the rules decide: outside validRange nothing is made, it is still held; Escape gives it back to its card', () => {
    const c = make({ rules: { validRange: { start: Temporal.PlainDate.from('2026-11-01') } } });
    const { el } = card({ title: 'A' });
    carryInto(el, c);
    key('Enter');
    const made = [...c.kernel.store.snapshot.allEvents()].length;
    key('Escape');
    expect([made, document.activeElement, el.hasAttribute('aria-pressed')]).toEqual([0, el, false]);
  });

  it('eventAllow is told it comes from outside', () => {
    const seen: unknown[] = [];
    const c = make({ rules: { allow: (p: { external?: boolean }) => (seen.push(p.external), true) } });
    const { el } = card({ title: 'A' });
    carryInto(el, c);
    key('Enter');
    expect([seen.length > 0, seen.every((x) => x === true)]).toEqual([true, true]);
  });

  it('a calendar not droppable takes nothing; a filter takes what it says', () => {
    const no = make({ droppable: false });
    const { el } = card({ title: 'A' }, { kind: 'x' });
    carryInto(el, no);
    key('Enter');
    const none = [...no.kernel.store.snapshot.allEvents()].length;
    // Still held by the page: given back to its card first.
    el.focus();
    key('Escape');
    const picky = make({ droppable: (d: { kind: string }) => d.kind === 'x' });
    carryInto(el, picky);
    key('Enter');
    expect([none, [...picky.kernel.store.snapshot.allEvents()].length]).toEqual([0, 1]);
  });

  it('dropped on the all-day row: an all-day event of one day', () => {
    const c = make();
    const { el } = card({ title: 'Congé', duration: { minutes: 30 } });
    carryInto(el, c);
    // Up from the hours to the all-day row (as an event held with the keyboard goes).
    for (let i = 0; i < 60; i++) key('ArrowUp');
    key('Enter');
    const made = [...c.kernel.store.snapshot.allEvents()][0];
    expect([made?.allDay, made && String((made.end as PlainDate).since(made.start as PlainDate))]).toEqual([true, 'P1D']);
  });

  it('the clean-up leaves nothing on the card', () => {
    const el = document.body.appendChild(document.createElement('div'));
    const off = makeDraggable(el, { event: { title: 'A' } });
    const during = [el.getAttribute('role'), el.tabIndex, el.classList.contains('dz-draggable')];
    off();
    expect([during, el.getAttribute('role'), el.hasAttribute('tabindex'), el.className]).toEqual([['button', 0, true], null, false, '']);
  });
});

describe('after the 18f-4 review', () => {
  it('a drop is told once: to onEventReceive, not to onEventChange as well', async () => {
    const said: string[] = [];
    const c = make({ onEventChange: () => void said.push('change'), onEventReceive: () => void said.push('receive') });
    const { el } = card({ title: 'A' });
    carryInto(el, c);
    key('Enter');
    await Promise.resolve();
    expect(said).toEqual(['receive']);
  });

  it('Escape anywhere on the page gives the card back', () => {
    const { el } = card({ title: 'A' });
    el.focus();
    key('Enter');
    const other = document.body.appendChild(document.createElement('button'));
    other.focus();
    key('Escape');
    expect(el.hasAttribute('aria-pressed')).toBe(false);
  });

  it('a card taken out of the page while held is let go when a calendar is reached', () => {
    const c = make();
    const { el } = card({ title: 'A' });
    el.focus();
    key('Enter');
    el.remove();
    c.element.querySelector<HTMLElement>('.dz-cursor')!.focus();
    key('Enter');
    expect([[...c.kernel.store.snapshot.allEvents()].length, el.hasAttribute('aria-pressed'), c.element.querySelector('.dz-grabbing')]).toEqual([0, false, null]);
  });

  it('the clean-up gives the card its own styles back', () => {
    const el = document.body.appendChild(document.createElement('div'));
    el.style.userSelect = 'text';
    const off = makeDraggable(el, { event: { title: 'A' } });
    const during = el.style.userSelect;
    off();
    expect([during, el.style.userSelect]).toEqual(['none', 'text']);
  });
});

describe('after the 18f-4 execution review', () => {
  it('a Tab inside the calendar keeps the place chosen: the same keys with and without it put it down at the same time', async () => {
    const place = async (tab: boolean) => {
      const c = make({ events: [{ id: 'x', title: 'X', start: '2026-10-21T15:00[Europe/Paris]', duration: { hours: 1 } }] });
      const { el } = card({ title: 'A', duration: { minutes: 30 } });
      carryInto(el, c);
      key('ArrowDown');
      key('ArrowDown');
      if (tab) {
        key('Tab');
        // The focus reaches an event of the same calendar (as Tab would).
        c.element.querySelector<HTMLElement>('[data-event-id="x"]')!.focus();
      }
      key('Enter');
      await Promise.resolve();
      return String([...c.kernel.store.snapshot.allEvents()].find((e) => e.title === 'A')?.start);
    };
    const plain = await place(false);
    for (const c of cals) c.destroy();
    cals = [];
    document.body.innerHTML = '';
    expect(await place(true)).toBe(plain);
  });

  it('onDrop is told the moment it was put at, the event’s start', async () => {
    let date = '';
    const c = make({ onDrop: (d: { date: unknown }) => void (date = String(d.date)) });
    const { el } = card({ title: 'A' });
    carryInto(el, c);
    key('ArrowDown');
    key('Enter');
    await Promise.resolve();
    expect(date).toBe(String([...c.kernel.store.snapshot.allEvents()][0]!.start));
  });
});
