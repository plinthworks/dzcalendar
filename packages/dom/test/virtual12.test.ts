import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, EventInstance } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';
import '../src/multimonth.js';

// Phase 12 in jsdom: sizes are stubbed where windowing needs a layout.

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
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, events, initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), ...over });
  return host;
};
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const mounted = (host: HTMLElement) => host.querySelectorAll('.dz-tg__col .dz-ev:not(.dz-ev--bg)').length;

/** 100 events a day, 14 minutes apart: no two overlap, nothing stacks. */
const spread = (): EventInput[] =>
  Array.from({ length: 700 }, (_, i) => {
    const day = 19 + Math.floor(i / 100);
    const m = (i % 100) * 14;
    const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { id: `e${i}`, title: `E${i}`, start: `2026-10-${day}T${t}[Europe/Paris]`, duration: { minutes: 10 } };
  });

/** One pixel a minute, a 300 px view scrolled to `top`. */
function layout(host: HTMLElement, top: number): void {
  const body = host.querySelector<HTMLElement>('.dz-tg__body')!;
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: 300 });
  body.scrollTop = top;
  for (const col of host.querySelectorAll<HTMLElement>('.dz-tg__col')) {
    col.getBoundingClientRect = () => ({ height: 1440, width: 100, top: 0, left: 0, bottom: 1440, right: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
  }
  body.dispatchEvent(new Event('scroll'));
}

describe('time grid windowing above virtualizeAbove', () => {
  it('only the scrolled hours and a screen around them are mounted; scrolling mounts the rest', async () => {
    const host = mount(spread(), { virtualizeAbove: 100, eventMaxStack: null });
    expect(mounted(host)).toBe(700); // no layout yet: everything
    layout(host, 600);
    await frame();
    const n = mounted(host);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(700);
    // 00:00 is a screen and more above the view (600 px): not mounted; 10:00 (600) is.
    const ids = [...host.querySelectorAll<HTMLElement>('.dz-tg__col .dz-ev')].map((e) => e.dataset['eventId']);
    expect(ids).not.toContain('e0');
    expect(ids).toContain('e43'); // 43 × 14 = 602 minutes
    layout(host, 0);
    await frame();
    expect([...host.querySelectorAll<HTMLElement>('.dz-tg__col .dz-ev')].map((e) => e.dataset['eventId'])).toContain('e0');
  });

  it('below the threshold everything stays mounted', async () => {
    const host = mount(spread(), { virtualizeAbove: 5000, eventMaxStack: null });
    layout(host, 600);
    await frame();
    expect(mounted(host)).toBe(700);
  });

  it('preparePrint mounts everything; its restore windows again', async () => {
    const host = mount(spread(), { virtualizeAbove: 100, eventMaxStack: null });
    layout(host, 600);
    await frame();
    const windowed = mounted(host);
    const restore = cal!.preparePrint();
    expect(mounted(host)).toBe(700);
    restore();
    layout(host, 600);
    await frame();
    expect(mounted(host)).toBe(windowed);
  });
});

describe('eventMaxStack: "+N" in a time grid', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, title: id.toUpperCase(), start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }));

  it('three at most side by side: two drawn and "+4", whose panel lists them and opens them', () => {
    const clicked: EventInstance[] = [];
    const host = mount(six, { eventMaxStack: 3, onEventClick: (i: EventInstance) => clicked.push(i) });
    expect(mounted(host)).toBe(2);
    const more = host.querySelector<HTMLButtonElement>('.dz-more--tg')!;
    expect(more.textContent).toBe('+4 autres');
    expect(more.getAttribute('aria-label')).toContain('mercredi 21 octobre, 09:00');
    more.click();
    const items = [...document.querySelectorAll<HTMLElement>('.dz-pop .dz-bar')];
    expect(items.map((i) => i.textContent?.trim().slice(-1))).toEqual(['C', 'D', 'E', 'F']);
    items[0]!.click();
    expect(clicked.map((i) => i.event.id)).toEqual(['c']);
  });

  it('null shows them all', () => {
    const host = mount(six, { eventMaxStack: null });
    expect(mounted(host)).toBe(6);
    expect(host.querySelector('.dz-more--tg')).toBeNull();
  });
});


/** Months 800 px tall one under the other; a 600 px view scrolled to October (the tenth). */
async function yearLayout(host: HTMLElement): Promise<void> {
  const body = host.querySelector<HTMLElement>('.dz-mm > .dz-dg__body')!;
  const rect = (top: number, height: number) => () => ({ top, bottom: top + height, height, width: 400, left: 0, right: 400, x: 0, y: top, toJSON() {} }) as DOMRect;
  body.getBoundingClientRect = rect(0, 600);
  [...host.querySelectorAll<HTMLElement>('.dz-mm__month')].forEach((m, i) => (m.getBoundingClientRect = rect((i - 9) * 800, 800)));
  body.dispatchEvent(new Event('scroll'));
  await frame();
  await frame();
}

describe('a crowded year: far months asleep', () => {
  it('months far from the screen are not mounted, once a month’s height is known; the keyboard wakes the one it goes into', async () => {
    const events: EventInput[] = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, title: `X${i}`, start: `2026-${String((i % 12) + 1).padStart(2, '0')}-10T09:00[Europe/Paris]` }));
    const host = mount(events, { initialView: 'multiMonthYear', virtualizeAbove: 10 });
    // Before any layout every month is drawn: an asleep one would have no height to keep.
    expect(host.querySelectorAll('.dz-mm__grid[aria-hidden]')).toHaveLength(0);
    await yearLayout(host);
    const weeksOf = (m: string) => host.querySelectorAll(`.dz-mm__grid[aria-label="${m}"] .dz-dg__week`).length;
    expect(weeksOf('octobre 2026')).toBe(6);
    expect(weeksOf('août 2026')).toBe(0);
    host.querySelector<HTMLElement>('.dz-dg__cell[data-date="2026-09-03"]:not(.dz-dg__cell--outside)')!.focus();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect((document.activeElement as HTMLElement).dataset['date']).toBe('2026-08-27');
    expect(weeksOf('août 2026')).toBe(6);
  });

  it('preparePrint wakes every month', () => {
    const events: EventInput[] = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, start: `2026-${String((i % 12) + 1).padStart(2, '0')}-10T09:00[Europe/Paris]` }));
    const host = mount(events, { initialView: 'multiMonthYear', virtualizeAbove: 10 });
    cal!.preparePrint();
    expect(host.querySelectorAll('.dz-mm__grid .dz-dg__week').length).toBe(72);
  });
});

describe('review fixes (Phase 12)', () => {
  it('a resize re-windows the time grid (the calendar’s ResizeObserver)', async () => {
    let fire: (() => void) | null = null;
    const RO = globalThis.ResizeObserver;
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
      constructor(cb: () => void) {
        fire = cb;
      }
      observe() {}
      disconnect() {}
    };
    try {
      const host = mount(spread(), { virtualizeAbove: 100, eventMaxStack: null });
      layout(host, 600);
      await frame();
      const small = mounted(host);
      const body = host.querySelector<HTMLElement>('.dz-tg__body')!;
      Object.defineProperty(body, 'clientHeight', { configurable: true, value: 1200 });
      fire!();
      await frame();
      expect(mounted(host)).toBeGreaterThan(small);
    } finally {
      (globalThis as { ResizeObserver: unknown }).ResizeObserver = RO;
    }
  });

  it('bad eventMaxStack or virtualizeAbove are refused at creation', () => {
    expect(() => mount([], { eventMaxStack: 0 })).toThrow(RangeError);
    expect(() => mount([], { virtualizeAbove: Number.NaN })).toThrow(RangeError);
  });

  it('a restore after destroy does nothing', () => {
    mount(spread(), { virtualizeAbove: 100 });
    const restore = cal!.preparePrint();
    cal!.destroy();
    expect(() => restore()).not.toThrow();
    cal = null;
  });

  it('an asleep month is hidden from assistive technology and keeps a whole month’s height', async () => {
    const events: EventInput[] = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, start: `2026-${String((i % 12) + 1).padStart(2, '0')}-10T09:00[Europe/Paris]` }));
    const host = mount(events, { initialView: 'multiMonthYear', virtualizeAbove: 10 });
    await yearLayout(host);
    expect(host.querySelector<HTMLElement>('.dz-mm__month[data-key="2026-01"]')!.style.minHeight).toBe('800px');
    expect(host.querySelector('.dz-mm__grid[aria-label="janvier 2026"]')!.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.dz-mm__grid[aria-label="octobre 2026"]')!.hasAttribute('aria-hidden')).toBe(false);
  });
});

describe('printing shows everything (owner’s choice)', () => {
  it('no "+N" on paper, in the month or a crowded week; restored after', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }));
    const host = mount(many, { eventMaxStack: 3 });
    expect(mounted(host)).toBe(2);
    let restore = cal!.preparePrint();
    expect(mounted(host)).toBe(6);
    expect(host.querySelector('.dz-more--tg')).toBeNull();
    restore();
    expect(mounted(host)).toBe(2);
    cal!.update({ view: 'dayGridMonth' });
    cal!.destroy();
    document.body.innerHTML = '';
    const h2 = mount(many, { initialView: 'dayGridMonth', dayMaxLanes: 3 });
    expect(h2.querySelector('.dz-more')).not.toBeNull();
    restore = cal!.preparePrint();
    expect(h2.querySelector('.dz-more')).toBeNull();
    expect(h2.querySelectorAll('.dz-dg__week .dz-bar:not(.dz-bar--bg)')).toHaveLength(6);
    restore();
    expect(h2.querySelector('.dz-more')).not.toBeNull();
  });
});

describe('the focus survives windowing (code review)', () => {
  it('scrolling past the first rows keeps the focused event focused (nothing kept is moved)', async () => {
    const host = mount(spread(), { virtualizeAbove: 100, eventMaxStack: null });
    layout(host, 300);
    await frame();
    const target = [...host.querySelectorAll<HTMLElement>('.dz-tg__col .dz-ev')].find((e) => e.dataset['eventId'] === 'e30')!; // 07:00
    target.focus();
    const moved: Node[] = [];
    const mo = new MutationObserver((rs) => rs.forEach((r) => r.addedNodes.forEach((n) => moved.push(n))));
    mo.observe(host, { childList: true, subtree: true });
    layout(host, 900);
    await frame();
    await frame();
    mo.disconnect();
    expect(document.activeElement).toBe(target);
    // Only new rows were added: none of the kept ones was re-inserted.
    expect(moved.filter((n) => n instanceof HTMLElement && n.dataset['eventId'] && Number(n.dataset['eventId'].slice(1)) % 100 < 60 && Number(n.dataset['eventId'].slice(1)) % 100 >= 30)).toEqual([]);
  });
});
