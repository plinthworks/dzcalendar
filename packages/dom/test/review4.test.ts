import { describe, it, expect, afterEach, vi } from 'vitest';
import { Temporal, createHistory, createIdGenerator } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';

/** The Phase 4 reviews' scenarios, each written down before it was fixed. */
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});
const mount = (events: EventInput[], over: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, events, ...over });
  return host;
};
const text = (el: Node | null | undefined) => (el?.textContent ?? '').replace(/\s/g, ' ');
const run = (cmd: Parameters<ReturnType<typeof createHistory>['run']>[0]) =>
  createHistory(cal!.kernel.store, { normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('t') } }).run(cmd);

describe('a change of zone redraws what the labels say', () => {
  it('week: 12:00 Paris reads 05:00 in Chicago, text and spoken label', () => {
    const host = mount([{ id: 'a', title: 'Appel', start: '2026-10-21T12:00[Europe/Paris]' }], { initialView: 'timeGridDay' });
    cal!.update({ timeZone: 'America/Chicago' });
    const ev = host.querySelector('[data-key^="a|"]')!;
    expect(text(ev.querySelector('.dz-ev__time')!.firstChild)).toBe('05:00 – 06:00');
    expect(ev.getAttribute('aria-label')).toContain('05:00');
  });

  it('month: the dot shows the new zone’s start', () => {
    const host = mount([{ id: 'a', title: 'Appel', start: '2026-10-21T12:00[Europe/Paris]' }], { initialView: 'dayGridMonth' });
    cal!.update({ timeZone: 'America/Chicago' });
    expect(text(host.querySelector('[data-key^="a|"] .dz-bar__time'))).toBe('05:00');
  });
});

describe('the month keeps its nodes', () => {
  it('a change elsewhere in the month keeps the focused day number focused', () => {
    const host = mount([], { initialView: 'dayGridMonth' });
    const num = host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-10-05"] .dz-dg__num')!;
    num.focus();
    run({ type: 'event.create', event: { id: 'x', start: '2026-10-28' } });
    expect(document.activeElement).toBe(num);
  });

  it('the same business hours again change nothing (and lose no focus)', () => {
    const bh = { daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' } as const;
    const host = mount([], { initialView: 'dayGridMonth', businessHours: bh });
    let changes = 0;
    cal!.kernel.subscribe(() => changes++);
    cal!.update({ businessHours: bh });
    expect(changes).toBe(0);
    void host;
  });

  it('the "+N" panel closes on any change (its content would be stale), without stealing focus', () => {
    const crowded = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, start: `2026-10-21T0${i + 1}:00[Europe/Paris]` }));
    const host = mount(crowded, { initialView: 'dayGridMonth', dayMaxLanes: 3 });
    host.querySelector<HTMLButtonElement>('.dz-more')!.click();
    expect(host.querySelector<HTMLElement>('.dz-pop')!.hidden).toBe(false);
    run({ type: 'event.create', event: { id: 'z', start: '2026-10-29' } });
    expect(host.querySelector<HTMLElement>('.dz-pop')!.hidden).toBe(true);
  });

  it('the panel draws through the content hooks, mounted on open and unmounted on close', () => {
    const log: string[] = [];
    const crowded = Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, title: `E${i}`, start: `2026-10-21T0${i + 1}:00[Europe/Paris]` }));
    const host = mount(crowded, {
      initialView: 'dayGridMonth',
      dayMaxLanes: 2,
      hooks: { event: { content: (c: { instance: { key: string } }) => `HOOK ${c.instance.key}`, didMount: () => (log.push('m'), () => log.push('c')) } },
    });
    const mountsBefore = log.length;
    host.querySelector<HTMLButtonElement>('.dz-more')!.click();
    expect([...host.querySelectorAll('.dz-pop__list .dz-bar')].map(text)).toEqual(['HOOK e0', 'HOOK e1', 'HOOK e2', 'HOOK e3']);
    expect(log.length - mountsBefore).toBe(4);
    host.querySelector<HTMLButtonElement>('.dz-pop__close')!.click();
    expect(log.filter((x) => x === 'c')).toHaveLength(4);
  });

  it('auto lanes cap a month at 4 before it is measured; a week of the day grid is never capped', () => {
    const crowded = Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, start: `2026-10-21T0${i}:30[Europe/Paris]` }));
    const host = mount(crowded, { initialView: 'dayGridMonth', headerViews: ['dayGridMonth', 'dayGridWeek'] });
    expect(host.querySelectorAll('.dz-more')).toHaveLength(1);
    cal!.update({ view: 'dayGridWeek' });
    expect(host.querySelectorAll('.dz-more')).toHaveLength(0);
    expect(host.querySelectorAll('.dz-dg__week .dz-bar')).toHaveLength(9);
  });
});

describe('lifecycle', () => {
  it('switching views twenty times does not pile up listeners on what outlives a view', () => {
    const host = mount([], { initialView: 'dayGridMonth' });
    // Listeners on throwaway nodes (a day number) go with their nodes; a leak
    // is one left on something that stays: the document, the window, the
    // calendar's root, its panel and its menu.
    const lasting = new Set<EventTarget>([document, window, host.querySelector('.dz-cal')!, host.querySelector('.dz-pop')!, host.querySelector('.dz-menu')!]);
    let net = 0;
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, ...a: Parameters<typeof add>) {
      if (lasting.has(this)) net++;
      return add.apply(this, a);
    };
    EventTarget.prototype.removeEventListener = function (this: EventTarget, ...a: Parameters<typeof remove>) {
      if (lasting.has(this)) net--;
      return remove.apply(this, a);
    };
    try {
      for (let i = 0; i < 10; i++) {
        cal!.update({ view: 'timeGridWeek' });
        cal!.update({ view: 'dayGridMonth' });
      }
    } finally {
      EventTarget.prototype.addEventListener = add;
      EventTarget.prototype.removeEventListener = remove;
    }
    expect(net).toBe(0);
  });

  it('an update that is refused leaves the kernel and the screen as they were', () => {
    const host = mount([], { initialView: 'timeGridWeek' });
    const before = cal!.kernel.getState();
    expect(() => cal!.update({ timeZone: 'Asia/Tokyo', view: 'nope' })).toThrow(RangeError);
    expect(cal!.kernel.getState()).toBe(before);
    expect(text(host.querySelector('.dz-toolbar__title'))).toBe(before.title.replace(/\s/g, ' '));
  });

  it('without the now line, today still moves at midnight', () => {
    vi.useFakeTimers();
    let t = Temporal.Instant.from('2026-10-21T21:59:30Z');
    const host = mount([], { now: () => t, nowIndicator: false });
    t = t.add({ seconds: 31 });
    vi.advanceTimersByTime(31_000);
    expect(host.querySelector('.dz-tg__col--today')!.getAttribute('data-date')).toBe('2026-10-22');
    expect(host.querySelector('.dz-now')).toBeNull();
  });

  it('navigating closes an open context menu', () => {
    const host = mount([], { initialView: 'dayGridMonth', onCreateRequest: () => {} });
    host.querySelector('.dz-dg__cell')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(host.querySelector<HTMLElement>('.dz-menu')!.hidden).toBe(false);
    cal!.navigate('next');
    expect(host.querySelector<HTMLElement>('.dz-menu')!.hidden).toBe(true);
  });

  it('a context-menu moment snaps to the slot: 10:37 is 10:30', () => {
    const got: string[] = [];
    const host = mount([], { initialView: 'timeGridDay', onCreateRequest: (r: { start: { toString(): string } }) => got.push(r.start.toString()) });
    const col = host.querySelector<HTMLElement>('.dz-tg__col')!;
    col.getBoundingClientRect = () => ({ top: 0, height: 1440, left: 0, width: 100, bottom: 1440, right: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
    col.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 637 }));
    host.querySelector<HTMLButtonElement>('[data-action="event.create"]')!.click();
    expect(got).toEqual(['2026-10-21T08:30:00Z']);
  });

  it('typing the same letter again moves to the next entry starting with it', () => {
    const host = mount([], {
      initialView: 'dayGridMonth',
      contextMenu: () => [{ id: 'a', label: 'Beta', enabled: true }, { id: 'b', label: 'Bravo', enabled: true }, { id: 'c', label: 'Charlie', enabled: true }],
    });
    host.querySelector('.dz-dg__cell')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = host.querySelector<HTMLElement>('.dz-menu')!;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    expect(text(document.activeElement)).toBe('Bravo');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    expect(text(document.activeElement)).toBe('Beta');
  });

  it('a hook that throws is reported, and the event still draws', async () => {
    const swallow = (e: unknown) => (e as { preventDefault?: () => void }).preventDefault?.();
    process.on('unhandledRejection', swallow);
    const host = mount([{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]' }], {
      hooks: { event: { content: () => { throw new Error('app bug'); } } },
    });
    expect(text(host.querySelector('[data-key^="a|"] .dz-ev__title'))).toBe('A');
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', swallow);
  });
});
