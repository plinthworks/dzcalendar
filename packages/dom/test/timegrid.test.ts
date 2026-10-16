import { describe, it, expect, afterEach } from 'vitest';
import { Temporal, createHistory, createIdGenerator, createKernel } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { createCalendar, EN } from '../src/index.js';
import type { CalendarInstance, MotionAdapter } from '../src/index.js';

/**
 * Behaviour only: jsdom computes no layout, so positions are checked as the
 * custom properties the CSS reads, never as pixels.
 */
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-dzcalendar]').forEach((s) => s.remove());
});

const mount = (events: EventInput[], over: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, events, nowIndicator: true, ...over });
  return host;
};
const cols = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.dz-tg__col')];
const prop = (el: Element, name: string) => (el as HTMLElement).style.getPropertyValue(name);

describe('time grid, read-only', () => {
  it('draws the week: seven columns keyed by date, a title, the styles once', () => {
    const host = mount([]);
    expect(cols(host).map((c) => c.dataset['date'])).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(host.querySelector('.dz-toolbar__title')!.textContent).toBe('19–25 oct. 2026');
    expect(document.head.querySelectorAll('style[data-dzcalendar="core"]')).toHaveLength(1);
    expect(host.querySelector('.dz-tg__col--today')!.getAttribute('data-date')).toBe('2026-10-21');
  });

  it('the gutter comes first in the grid, then the columns in date order', () => {
    const host = mount([]);
    const grid = host.querySelector('.dz-tg__grid')!;
    expect(grid.firstElementChild!.classList.contains('dz-tg__gutter')).toBe(true);
    const order = [...grid.querySelectorAll('.dz-tg__gutter, .dz-tg__col')].map((e) => (e as HTMLElement).dataset['date'] ?? 'gutter');
    expect(order).toEqual(['gutter', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });

  it('places an event by axis minutes, not pixels', () => {
    const host = mount([{ id: 'a', title: 'Réunion', start: '2026-10-21T09:30[Europe/Paris]', end: '2026-10-21T11:00[Europe/Paris]' }]);
    const ev = host.querySelector<HTMLElement>('.dz-ev')!;
    expect([prop(ev, '--t'), prop(ev, '--h'), prop(ev, '--l'), prop(ev, '--w')]).toEqual(['570', '90', '0', '1']);
    expect(ev.closest('.dz-tg__col')!.getAttribute('data-date')).toBe('2026-10-21');
    expect(ev.querySelector('.dz-ev__time')!.textContent).toBe('09:30 – 11:00');
    expect(ev.getAttribute('aria-label')).toBe('Réunion, 09:30 – 11:00');
  });

  it('the 25-hour Sunday: a repeat band, the two 02:30s side by side, the second marked with its offset', () => {
    const host = mount(
      [
        { id: 'first', title: 'A', start: '2026-10-25T02:30+02:00[Europe/Paris]', duration: { minutes: 30 } },
        { id: 'second', title: 'B', start: '2026-10-25T02:30+01:00[Europe/Paris]', duration: { minutes: 30 } },
      ],
      { initialDate: Temporal.PlainDate.from('2026-10-25') },
    );
    const sunday = cols(host).find((c) => c.dataset['date'] === '2026-10-25')!;
    const band = sunday.querySelector('.dz-band--repeat')!;
    expect(band.textContent).toBe('02:00–03:00 a lieu deux fois');
    const [a, b] = [...sunday.querySelectorAll<HTMLElement>('.dz-ev')];
    expect([prop(a!, '--t'), prop(a!, '--w'), prop(b!, '--t'), prop(b!, '--l')]).toEqual(['150', '0.5', '150', '0.5']);
    expect(a!.querySelector('.dz-ev__offset')!.textContent).toBe('+02:00');
    // 03:00 comes once, after the repeat: no mark.
    expect(b!.querySelector('.dz-ev__time')!.firstChild!.textContent).toBe('02:30* – 03:00');
    expect(b!.querySelector('.dz-ev__offset')!.textContent).toBe('+01:00');
    expect(host.querySelector('.dz-tg__dayhead:last-of-type .dz-tg__dayhead-note, .dz-tg__dayhead .dz-tg__dayhead-note')!.textContent).toMatch(/25/);
  });

  it('the 23-hour Sunday: a hatched gap band that names the hour that never happens', () => {
    const host = mount([], { initialDate: Temporal.PlainDate.from('2026-03-29') });
    const band = cols(host).find((c) => c.dataset['date'] === '2026-03-29')!.querySelector<HTMLElement>('.dz-band--gap')!;
    expect([prop(band, '--t'), prop(band, '--h'), band.textContent]).toEqual(['120', '60', "02:00–03:00 n'existe pas"]);
  });

  it('an event across the fall-back shows its real length', () => {
    const host = mount([{ id: 'x', title: 'Garde', start: '2026-10-25T01:30+02:00[Europe/Paris]', end: '2026-10-25T02:30+01:00[Europe/Paris]' }], {
      initialDate: Temporal.PlainDate.from('2026-10-25'),
    });
    const parts = [...host.querySelectorAll<HTMLElement>('.dz-ev')];
    expect(parts).toHaveLength(2);
    expect(parts[0]!.querySelector('.dz-ev__real')!.textContent!.replace(/\s/g, ' ')).toBe('2 h réelles');
  });

  it('Apia, 30 December 2011: a folded column that says the day does not exist', () => {
    const host = mount([], { timeZone: 'Pacific/Apia', initialDate: Temporal.PlainDate.from('2011-12-30'), locale: 'en-US', messages: EN });
    const folded = cols(host).find((c) => c.dataset['date'] === '2011-12-30')!;
    expect(folded.classList.contains('dz-tg__col--folded')).toBe(true);
    expect(folded.textContent).toBe('This day does not exist in this time zone');
  });

  it('changing one event redraws only its column; the other columns keep their nodes and children', () => {
    const host = mount([
      { id: 'mon', start: '2026-10-19T09:00[Europe/Paris]' },
      { id: 'wed', start: '2026-10-21T09:00[Europe/Paris]' },
    ]);
    const monEv = host.querySelector('[data-key^="mon|"]')!;
    const before = cols(host);
    createHistory(cal!.kernel.store, { normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('t') } }).run({
      type: 'event.update',
      id: 'wed',
      patch: { start: '2026-10-21T15:00[Europe/Paris]' },
    });
    expect(cols(host)).toEqual(before);
    expect(host.querySelector('[data-key^="mon|"]')).toBe(monEv);
    expect(prop(host.querySelector('[data-key^="wed|"]')!, '--t')).toBe('900');
  });

  it('navigates with the toolbar, retitles, and tells the motion adapter which way', () => {
    const seen: string[] = [];
    const motion: MotionAdapter = { viewChange: (_el, dir) => seen.push(dir) };
    const host = mount([], { motion });
    host.querySelector<HTMLButtonElement>('.dz-toolbar__next')!.click();
    // Intl puts narrow no-break spaces around the dash: compare on plain spaces.
    expect(host.querySelector('.dz-toolbar__title')!.textContent!.replace(/\s/g, ' ')).toBe('26 oct. – 1 nov. 2026');
    host.querySelector<HTMLButtonElement>('.dz-toolbar__next')!.click();
    host.querySelector<HTMLButtonElement>('.dz-toolbar__today')!.click();
    // Today from the current week would be a no-op: nothing moves, nothing animates.
    host.querySelector<HTMLButtonElement>('.dz-toolbar__today')!.click();
    expect(seen).toEqual(['next', 'next', 'other']);
  });

  it('update() changes only what it is asked: the scroll position survives a relabel', () => {
    const host = mount([{ id: 'a', start: '2026-10-21T09:00[Europe/Paris]' }]);
    const body = host.querySelector<HTMLElement>('.dz-tg__body')!;
    body.scrollTop = 333;
    cal!.update({ messages: EN, locale: 'en-US' });
    expect(host.querySelector('.dz-toolbar__today')!.textContent).toBe('Today');
    expect(host.querySelector('.dz-tg__allday-label')!.textContent).toBe('All day');
    expect(body.scrollTop).toBe(333);
    expect(cols(host)).toHaveLength(7);
  });

  it('the now line sits in today’s column at the current minute', () => {
    const host = mount([]);
    const line = host.querySelector<HTMLElement>('.dz-now')!;
    expect(line.closest('.dz-tg__col')!.getAttribute('data-date')).toBe('2026-10-21');
    expect(prop(line, '--t')).toBe('600'); // 08:00Z is 10:00 in Paris
  });

  it('a shared kernel: the calendar draws it and leaves it alive on destroy', () => {
    const kernel = createKernel({ timeZone: 'Asia/Tokyo', locale: 'en', now });
    const host = document.createElement('div');
    document.body.append(host);
    const c = createCalendar(host, { kernel, messages: EN });
    c.destroy();
    expect(host.children).toHaveLength(0);
    expect(() => kernel.viewModel()).not.toThrow();
  });

  it('all-day events sit in the row above the grid', () => {
    const host = mount([{ id: 'trip', title: 'Voyage', start: '2026-10-20', end: '2026-10-23' }]);
    const bar = host.querySelector<HTMLElement>('.dz-bar')!;
    expect([prop(bar, '--col'), prop(bar, '--span'), prop(bar, '--lane'), bar.textContent]).toEqual(['1', '3', '0', 'Voyage']);
  });
});
