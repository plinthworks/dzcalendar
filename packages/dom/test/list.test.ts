import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, EventInstance } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';
import '../src/list.js';

// The list views in jsdom: order, words, the one tab stop, what keys and clicks do.

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const EVENTS: EventInput[] = [
  { id: 'lunch', title: 'Déjeuner', start: '2026-10-21T12:00[Europe/Paris]', end: '2026-10-21T13:00[Europe/Paris]' },
  { id: 'trip', title: 'Voyage', start: '2026-10-20', end: '2026-10-22' },
  { id: 'stand', title: 'Point', start: '2026-10-20T09:00[Europe/Paris]', duration: { minutes: 15 } },
  { id: 'fri', title: 'Revue', start: '2026-10-23T16:00[Europe/Paris]', duration: { hours: 1 } },
];
const mount = (over: Record<string, unknown> = {}, events = EVENTS) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, events, initialView: 'listWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), ...over });
  return host;
};
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const items = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.dz-list__ev')];
const said = async () => {
  await frame();
  return document.querySelector('.dz-live')!.textContent ?? '';
};
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('list views', () => {
  it('days in order, each with its events: all-day first, then by start', () => {
    const host = mount();
    const days = [...host.querySelectorAll<HTMLElement>('.dz-list__day')].map((d) => [d.dataset['date'], [...d.querySelectorAll<HTMLElement>('.dz-list__ev')].map((e) => e.dataset['eventId'])]);
    expect(days).toEqual([
      ['2026-10-20', ['trip', 'stand']],
      ['2026-10-21', ['trip', 'lunch']],
      ['2026-10-23', ['fri']],
    ]);
    const lunch = items(host).find((e) => e.dataset['eventId'] === 'lunch')!;
    expect(lunch.getAttribute('role')).toBe('button');
    expect(lunch.querySelector('.dz-list__time')!.textContent).toBe('12:00 – 13:00');
    expect(items(host)[0]!.querySelector('.dz-list__time')!.textContent).toBe('Journée');
    expect(host.querySelector('h3.dz-list__head')!.textContent).toContain('mardi 20 octobre 2026');
  });

  it('a period without events says so', () => {
    const host = mount({}, []);
    expect(host.querySelector('.dz-list__empty')!.textContent).toBe('Aucun événement à afficher');
  });

  it('one tab stop; arrows, Home/End and PageDown move it', () => {
    const host = mount();
    expect(items(host).filter((e) => e.tabIndex === 0).map((e) => e.dataset['segment'])).toHaveLength(1);
    items(host)[0]!.focus();
    key(document.activeElement!, 'ArrowDown');
    expect((document.activeElement as HTMLElement).dataset['eventId']).toBe('stand');
    key(document.activeElement!, 'PageDown');
    expect((document.activeElement as HTMLElement).closest<HTMLElement>('.dz-list__day')!.dataset['date']).toBe('2026-10-21');
    key(document.activeElement!, 'End');
    expect((document.activeElement as HTMLElement).dataset['eventId']).toBe('fri');
    key(document.activeElement!, 'Home');
    expect((document.activeElement as HTMLElement).dataset['eventId']).toBe('trip');
    expect(items(host).filter((e) => e.tabIndex === 0)).toHaveLength(1);
  });

  it('Enter and a click call onEventClick with the instance', () => {
    const clicked: string[] = [];
    const host = mount({ onEventClick: (i: EventInstance) => clicked.push(i.event.id) });
    const lunch = items(host).find((e) => e.dataset['eventId'] === 'lunch')!;
    lunch.focus();
    key(lunch, 'Enter');
    items(host).find((e) => e.dataset['eventId'] === 'fri')!.click();
    expect(clicked).toEqual(['lunch', 'fri']);
  });

  it('the focus stays on its event when the store changes', async () => {
    const host = mount();
    const lunch = items(host).find((e) => e.dataset['eventId'] === 'lunch')!;
    lunch.focus();
    cal!.run({ type: 'event.update', id: 'fri', patch: { title: 'Revue finale' } });
    await frame();
    expect(document.activeElement).toBe(lunch);
    expect(host.textContent).toContain('Revue finale');
  });

  it('the context menu opens on an event and on a day heading', () => {
    const host = mount({ editable: true });
    items(host)[1]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = host.querySelector<HTMLElement>('.dz-menu')!;
    expect(menu.hidden).toBe(false);
    key(menu, 'Escape');
    host.querySelector('.dz-list__head')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(menu.hidden).toBe(false);
  });

  it('the date in a heading goes to that day', () => {
    const host = mount();
    host.querySelector<HTMLButtonElement>('.dz-list__day[data-date="2026-10-21"] .dz-list__date')!.click();
    expect(cal!.kernel.getState().view.type).toBe('timeGridDay');
    expect(String(cal!.kernel.getState().date)).toBe('2026-10-21');
  });

  it('Delete removes the event, says how to undo, and the focus goes on', async () => {
    const host = mount({ editable: true });
    const lunch = items(host).find((e) => e.dataset['eventId'] === 'lunch')!;
    lunch.focus();
    key(lunch, 'Delete');
    expect(cal!.kernel.store.snapshot.getEvent('lunch')).toBeUndefined();
    expect(await said()).toMatch(/^« Déjeuner » supprimé\. (Ctrl\+Z|⌘Z) pour annuler\.$/);
    expect((document.activeElement as HTMLElement).dataset['eventId']).toBe('fri');
  });

  it('Delete in a read-only calendar changes nothing and says why', async () => {
    const host = mount();
    const lunch = items(host).find((e) => e.dataset['eventId'] === 'lunch')!;
    key(lunch, 'Delete');
    expect(cal!.kernel.store.snapshot.getEvent('lunch')).toBeDefined();
    expect(await said()).not.toBe('');
  });

  it('content hooks run, and didMount / willUnmount around the node’s life', async () => {
    const log: string[] = [];
    const host = mount({
      hooks: {
        event: {
          content: (c: { instance: { event: { id: string } }; family: string }) => `${c.family}:${c.instance.event.id}`,
          didMount: ({ ctx }: { ctx: { instance: { event: { id: string } } } }) => void log.push(`mount ${ctx.instance.event.id}`),
          willUnmount: ({ ctx }: { ctx: { instance: { event: { id: string } } } }) => void log.push(`unmount ${ctx.instance.event.id}`),
        },
      },
    });
    expect(items(host).find((e) => e.dataset['eventId'] === 'fri')!.textContent).toBe('list:fri');
    expect(log).toContain('mount fri');
    cal!.run({ type: 'event.delete', id: 'fri' });
    await frame();
    expect(log).toContain('unmount fri');
  });

  it('listDay, listMonth and listYear cover their periods', () => {
    const host = mount({ initialView: 'listMonth' });
    expect(host.querySelectorAll('.dz-list__day')).toHaveLength(3);
    cal!.update({ view: 'listYear' });
    expect(host.querySelectorAll('.dz-list__day')).toHaveLength(3);
    cal!.update({ view: 'listDay' });
    expect([...host.querySelectorAll<HTMLElement>('.dz-list__day')].map((d) => d.dataset['date'])).toEqual(['2026-10-21']);
  });
});

describe('code review fixes (list)', () => {
  it('a 25-hour day shows and says the real length; the focus follows a moved event; deleting the last keeps the focus in the list', async () => {
    const { createCalendar } = await import('../src/index.js');
    await import('../src/list.js');
    const host = document.createElement('div');
    document.body.append(host);
    const cal = createCalendar(host, {
      timeZone: 'Europe/Paris',
      locale: 'fr-FR',
      initialView: 'listWeek',
      initialDate: Temporal.PlainDate.from('2026-10-25'),
      editable: true,
      now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'),
      events: [
        { id: 'n', title: 'Nuit', start: '2026-10-25T01:30[Europe/Paris]', end: '2026-10-25T03:30[Europe/Paris]' },
        { id: 'a', title: 'A', start: '2026-10-20T09:00[Europe/Paris]' },
      ],
    });
    const night = host.querySelector<HTMLElement>('.dz-list__ev[data-event-id="n"]')!;
    expect(night.querySelector('.dz-ev__real')?.textContent).toContain('3');
    expect(night.getAttribute('aria-label')).toMatch(/3\s?h réelles/);
    host.querySelector<HTMLElement>('.dz-list__ev[data-event-id="a"]')!.focus();
    cal.run({ type: 'event.move', id: 'a', start: '2026-10-22T09:00[Europe/Paris]' });
    expect((document.activeElement as HTMLElement).dataset['eventId']).toBe('a');
    cal.run({ type: 'event.delete', id: 'n' });
    cal.run({ type: 'event.delete', id: 'a' });
    expect(host.contains(document.activeElement)).toBe(true);
    cal.destroy();
  });
});
