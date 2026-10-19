import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { gsap } from 'gsap';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance } from '@dzcalendar/dom';
import { createGsapMotion, EXPRESSIVE, SOBER } from '../src/index.js';

// jsdom has no matchMedia: what the page says about reduced motion is set per test.
let reduce = false;
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: q.includes(': reduce') ? reduce : !reduce, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
});
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
  gsap.globalTimeline.clear();
});
const mount = (o = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'en-GB', now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'), initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), events: [{ id: 'a', start: '2026-10-21T09:00[Europe/Paris]' }], motion: createGsapMotion(o) });
  return cal;
};

describe('the GSAP adapter (Phase 17a)', () => {
  it('presets: sober by default, expressive on demand, a value laid over either', () => {
    expect([SOBER.ease, EXPRESSIVE.settle, SOBER.view < EXPRESSIVE.view]).toEqual(['power2.out', 'elastic.out(1, 0.6)', true]);
  });

  it('the odometer rolls a copy (hidden from assistive tech); the real title already says the new words', () => {
    reduce = false;
    const c = mount();
    c.navigate('next');
    const title = c.element.querySelector('.dz-toolbar__title')!;
    const roll = title.parentElement!.querySelector('[aria-hidden="true"]');
    expect([title.textContent, roll?.textContent?.includes('2026'), gsap.getTweensOf(title).length + gsap.globalTimeline.getChildren().length > 0]).toEqual([c.kernel.getState().title, true, true]);
  });

  it('reduced motion: nothing moves, nothing is added', () => {
    reduce = true;
    const c = mount({ preset: 'expressive' });
    c.navigate('next');
    c.update({ timeZone: 'Asia/Tokyo' });
    expect([gsap.globalTimeline.getChildren().length, c.element.querySelectorAll('.dz-toolbar [aria-hidden="true"]').length]).toEqual([0, 0]);
    reduce = false;
  });

  it('effects can be turned off one by one', () => {
    reduce = false;
    const c = mount({ effects: { odometer: false } });
    c.navigate('next');
    expect(c.element.querySelector('.dz-toolbar [aria-hidden="true"]')).toBeNull();
  });
});

describe('after the 17a review', () => {
  it('destroyed mid-roll: nothing left (copy gone, title shown); one adapter serves calendar after calendar', () => {
    reduce = false;
    const motion = createGsapMotion();
    for (let i = 0; i < 2; i++) {
      const host = document.createElement('div');
      document.body.append(host);
      const c = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'en-GB', now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'), initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), motion });
      c.navigate('next');
      const title = c.element.querySelector<HTMLElement>('.dz-toolbar__title')!;
      expect(title.parentElement!.querySelector('[data-dz-roll]')).not.toBeNull();
      c.destroy();
      expect([title.parentElement!.querySelector('[data-dz-roll]'), title.style.opacity]).toEqual([null, '']);
    }
  });

  it('two quick navigations: one copy rolls, not two; a locale change does not roll', () => {
    reduce = false;
    const c = mount();
    c.navigate('next');
    c.navigate('next');
    expect(c.element.querySelectorAll('[data-dz-roll]').length).toBe(1);
    gsap.globalTimeline.progress(1);
    c.update({ locale: 'fr-FR' });
    expect(c.element.querySelectorAll('[data-dz-roll]').length).toBe(0);
  });

  it('week → month is not a morph (only a grid of days → one day is)', () => {
    reduce = false;
    const seen: boolean[] = [];
    const m = createGsapMotion();
    const host = document.createElement('div');
    document.body.append(host);
    cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'en-GB', initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), motion: { ...m, beforeChange: (ch) => (seen.push(m.beforeChange!(ch) !== undefined), undefined) } });
    cal.update({ view: 'dayGridMonth' });
    expect(seen).toEqual([false]);
  });
});

describe('17b', () => {
  it('a delete dissolves its copy (a promise the calendar removes it on); undone, it gathers back (not the wave)', async () => {
    reduce = false;
    const c = mount();
    c.run({ type: 'event.delete', id: 'a' });
    const copies = [...c.element.querySelectorAll<HTMLElement>('.dz-leaving')];
    expect(copies.length).toBe(1);
    gsap.globalTimeline.progress(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(c.element.querySelectorAll('.dz-leaving').length).toBe(0);
    c.undo();
    const back = c.element.querySelector<HTMLElement>('[data-event-id="a"]')!;
    expect(gsap.getProperty(back, 'scale')).toBeCloseTo(0.86, 2);
  });

  it('reduced motion: no copy; the scroll is not eased (the view sets it itself)', () => {
    reduce = true;
    const m = createGsapMotion();
    const c = mount();
    c.run({ type: 'event.delete', id: 'a' });
    expect([c.element.querySelectorAll('.dz-leaving').length, m.wantsLeave?.(), m.scroll?.(document.createElement('div'), { top: 10, left: 0 })]).toEqual([0, false, false]);
    reduce = false;
  });
});
