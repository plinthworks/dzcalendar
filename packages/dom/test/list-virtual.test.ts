import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';
import '../src/list.js';

// The list windowed above `virtualizeAbove`. jsdom has no layout: the scroller's
// height and scroll offset are stubbed; rows keep their estimated 33 px.

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
const tops = new WeakMap<Element, number>();
const proto = HTMLElement.prototype;
beforeEach(() => {
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { return (this as HTMLElement).classList.contains('dz-list') ? 330 : 0; } });
  Object.defineProperty(proto, 'scrollTop', { configurable: true, get() { return tops.get(this as Element) ?? 0; }, set(v: number) { tops.set(this as Element, v); } });
});
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
  delete (proto as unknown as Record<string, unknown>)['clientHeight'];
  delete (proto as unknown as Record<string, unknown>)['scrollTop'];
});
/** n events over the week of 19 October, 09:00 onwards, ten minutes apart. */
const many = (n: number): EventInput[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i}`, title: `E${i}`, start: Temporal.ZonedDateTime.from('2026-10-19T09:00[Europe/Paris]').add({ minutes: 10 * i }).toString(), duration: { minutes: 5 } }));
const mount = (over: Record<string, unknown> = {}, n = 100) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, events: many(n), initialView: 'listWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), virtualizeAbove: 20, ...over });
  return host;
};
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const items = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.dz-list__ev')];
const posOf = (el: Element | null) => Number(el?.closest('li')?.getAttribute('aria-posinset'));
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('list, windowed', () => {
  it('above the threshold, only the rows near the view are mounted; each says its place and the size', () => {
    const host = mount();
    const shown = items(host);
    expect(shown.length).toBeGreaterThan(5);
    expect(shown.length).toBeLessThan(40);
    expect(shown[0]!.closest('li')!.getAttribute('aria-setsize')).toBe('100');
    expect(shown.map(posOf).slice(0, 3)).toEqual([1, 2, 3]);
    // The rest of the height is still there, as gaps.
    expect(host.querySelectorAll('.dz-list__gap').length).toBeGreaterThan(0);
  });

  it('scrolling mounts what comes into view (the tab stop stays mounted)', async () => {
    const host = mount();
    const scroller = host.querySelector<HTMLElement>('.dz-list')!;
    scroller.scrollTop = 2000;
    scroller.dispatchEvent(new Event('scroll'));
    await frame();
    const pos = items(host).map(posOf);
    expect(pos).toContain(60);
    expect(pos).not.toContain(10);
    expect(pos).toContain(1); // the tab stop
  });

  it('the keyboard goes over the whole period: End and arrows reach unmounted entries', () => {
    const host = mount();
    const first = items(host)[0]!;
    first.focus();
    key(first, 'End');
    expect(posOf(document.activeElement)).toBe(100);
    for (let i = 0; i < 3; i++) key(document.activeElement!, 'ArrowUp');
    expect(posOf(document.activeElement)).toBe(97);
    key(document.activeElement!, 'Home');
    expect(posOf(document.activeElement)).toBe(1);
    for (let i = 0; i < 45; i++) key(document.activeElement!, 'ArrowDown');
    expect(posOf(document.activeElement)).toBe(46);
    expect(items(host).filter((n) => n.tabIndex === 0)).toHaveLength(1);
  });

  it('below the threshold, everything is mounted as before, without set sizes', () => {
    const host = mount({ virtualizeAbove: 500 });
    expect(items(host)).toHaveLength(100);
    expect(host.querySelector('li[aria-setsize]')).toBeNull();
    expect(host.querySelectorAll('.dz-list__gap')).toHaveLength(0);
  });

  it('preparePrint mounts everything; its restore windows again', () => {
    const host = mount();
    const restore = cal!.preparePrint();
    expect(items(host)).toHaveLength(100);
    restore();
    expect(items(host).length).toBeLessThan(40);
  });

  it('hooks: a row leaving the window is unmounted, one coming in is mounted', async () => {
    let mounted = 0;
    let unmounted = 0;
    const host = mount({ hooks: { event: { didMount: () => void mounted++, willUnmount: () => void unmounted++ } } });
    const scroller = host.querySelector<HTMLElement>('.dz-list')!;
    for (const top of [1500, 3000, 0]) {
      scroller.scrollTop = top;
      scroller.dispatchEvent(new Event('scroll'));
      await frame();
    }
    expect(mounted - unmounted).toBe(items(host).length);
    expect(unmounted).toBeGreaterThan(0);
  });
});
