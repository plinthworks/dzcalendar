import { describe, it, expect, afterEach, vi } from 'vitest';
import { Temporal, createKernel, createEventStore, createHistory, createIdGenerator } from '@dzcalendar/core';
import { createCalendar, DZ_CSS, EN } from '../src/index.js';
import type { CalendarInstance, MotionAdapter } from '../src/index.js';
import { KeyedList } from '../src/render/reconcile.js';

/** The Phase 3 reviews' scenarios, each written down before it was fixed. */
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});
const at = (iso: string) => () => Temporal.Instant.from(iso);
const mount = (over: Record<string, unknown>) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now: at('2026-10-21T08:00:00Z'), ...over });
  return host;
};
const text = (el: Node | null) => (el?.textContent ?? '').replace(/\s/g, ' ');

describe('labels across the fall-back', () => {
  it('a night across the repeat: no false mark on either part, its real length said', () => {
    const host = mount({
      initialDate: Temporal.PlainDate.from('2026-10-25'),
      events: [{ id: 'night', title: 'Garde', start: '2026-10-25T00:00+02:00[Europe/Paris]', end: '2026-10-25T06:00+01:00[Europe/Paris]' }],
    });
    const parts = [...host.querySelectorAll('[data-key^="night|"]')];
    expect(text(parts[0]!.querySelector('.dz-ev__time')!.firstChild)).toBe('00:00 – 06:00');
    expect(text(parts[0]!.querySelector('.dz-ev__real'))).toBe('7 h réelles');
    for (const p of parts) expect(p.getAttribute('aria-label')).not.toContain('*');
  });

  it('an event ending at the fall-back ends at 03:00 of the first pass, not 02:00*', () => {
    const host = mount({
      initialDate: Temporal.PlainDate.from('2026-10-25'),
      // Thirty real minutes: the end is the fall-back instant itself. ("03:00+02:00"
      // would not be it: Paris reads 03:00 only at +01:00 that day, and the zone wins.)
      events: [{ id: 'f', title: 'A', start: '2026-10-25T02:30+02:00[Europe/Paris]', duration: { minutes: 30 } }],
    });
    const ev = host.querySelector('[data-key^="f|"]')!;
    expect(text(ev.querySelector('.dz-ev__time')!.firstChild)).toBe('02:30 – 03:00');
    expect(ev.querySelector('.dz-ev__real')).toBeNull();
  });

  it('a screen reader hears the offsets, not a star', () => {
    const host = mount({
      initialDate: Temporal.PlainDate.from('2026-10-25'),
      events: [{ id: 's', title: 'B', start: '2026-10-25T02:30+01:00[Europe/Paris]', duration: { minutes: 15 } }],
    });
    expect(host.querySelector('[data-key^="s|"]')!.getAttribute('aria-label')).toBe('B, 02:30 (+01:00) – 02:45 (+01:00)');
  });

  it('an event from another zone names its zone to a screen reader', () => {
    const host = mount({ events: [{ id: 'ny', title: 'NY', start: '2026-10-21T10:00[America/New_York]' }] });
    expect(host.querySelector('[data-key^="ny|"]')!.getAttribute('aria-label')).toBe('NY, 16:00 – 17:00, America/New_York');
  });
});

describe('time passes', () => {
  it('past midnight, today moves with the now line', () => {
    vi.useFakeTimers();
    let t = Temporal.Instant.from('2026-10-21T21:59:30Z'); // 23:59:30 in Paris
    const host = mount({ now: () => t });
    expect(host.querySelector('.dz-tg__col--today')!.getAttribute('data-date')).toBe('2026-10-21');
    t = t.add({ seconds: 31 });
    vi.advanceTimersByTime(31_000);
    expect(host.querySelector('.dz-tg__col--today')!.getAttribute('data-date')).toBe('2026-10-22');
    expect(host.querySelector('.dz-now')!.closest('.dz-tg__col')!.getAttribute('data-date')).toBe('2026-10-22');
    expect(host.querySelector('[aria-current="date"]')!.textContent).toContain('22');
  });
});

describe('options and update()', () => {
  it('undefined options and an empty locale fall back to the defaults', () => {
    expect(() => mount({ timeZone: undefined, locale: undefined })).not.toThrow();
    cal!.destroy();
    cal = null;
    expect(() => mount({ locale: '' })).not.toThrow();
  });

  it('update({ locale }) retitles and re-weeks', () => {
    const host = mount({});
    cal!.update({ locale: 'en-US' });
    expect(text(host.querySelector('.dz-toolbar__title'))).toBe('Oct 18 – 24, 2026');
    expect(host.querySelector('.dz-toolbar__today')!.textContent).toBe('Today');
  });

  it('an echo of the current values changes nothing: same nodes, no animation, no announcement', () => {
    const seen: string[] = [];
    const motion: MotionAdapter = { viewChange: (_b, d) => seen.push(d) };
    const host = mount({ motion });
    const ev0 = host.querySelector('.dz-tg__col')!;
    const title = host.querySelector('.dz-toolbar__title')!;
    const titleNode = title.firstChild;
    const s = cal!.kernel.getState();
    cal!.update({ view: s.view.type, date: s.date, locale: s.locale, timeZone: s.timeZone, motion });
    expect(host.querySelector('.dz-tg__col')).toBe(ev0);
    expect(title.firstChild).toBe(titleNode);
    expect(seen).toEqual([]);
  });

  it('several changes in one update draw once', () => {
    const host = mount({});
    let paints = 0;
    const obs = new MutationObserver(() => paints++);
    obs.observe(host.querySelector('.dz-toolbar__title')!, { childList: true, characterData: true, subtree: true });
    cal!.update({ timeZone: 'Asia/Tokyo', date: Temporal.PlainDate.from('2026-11-04') });
    return Promise.resolve().then(() => {
      expect(paints).toBe(1);
      obs.disconnect();
    });
  });

  it('a view this renderer cannot draw is refused before anything changes', () => {
    mount({});
    const before = cal!.kernel.getState();
    expect(() => cal!.update({ view: 'dayGridMonth' })).toThrow(RangeError);
    expect(() => cal!.update({ view: 'nope' })).toThrow(RangeError);
    expect(cal!.kernel.getState()).toBe(before);
  });

  it('a replaced motion adapter is destroyed; the same one is not', () => {
    let destroyed = 0;
    const a: MotionAdapter = { destroy: () => destroyed++ };
    mount({ motion: a });
    cal!.update({ motion: a });
    expect(destroyed).toBe(0);
    cal!.update({ motion: {} });
    expect(destroyed).toBe(1);
  });

  it('a handed-in kernel with slotMin scrolls the same as options would', () => {
    const kernel = createKernel({ timeZone: 'UTC', locale: 'en', now: at('2026-10-21T08:00:00Z'), timeGrid: { slotMin: 'PT6H' } });
    const host = document.createElement('div');
    document.body.append(host);
    // jsdom has no layout: give columns a height so the measured scale is 1 px/min.
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 1080 } as DOMRect);
    cal = createCalendar(host, { kernel, messages: EN, scrollTime: 'PT8H' });
    expect(host.querySelector<HTMLElement>('.dz-tg__body')!.scrollTop).toBe(120);
    spy.mockRestore();
  });

  it('class names with spaces or empty strings are tokens, and never throw', () => {
    const host = mount({ events: [{ id: 'c', start: '2026-10-21T09:00[Europe/Paris]', classNames: ['a b', '', 'c'], tone: 'bad tone' }] });
    const ev = host.querySelector('[data-key^="c|"]')!;
    expect(['a', 'b', 'c'].every((x) => ev.classList.contains(x))).toBe(true);
    expect((ev as HTMLElement).style.getPropertyValue('--dz-event-accent')).toBe('');
  });

  it('an event loses the classes it no longer has', () => {
    const host = mount({ events: [{ id: 'c', start: '2026-10-21T09:00[Europe/Paris]', classNames: ['old'] }] });
    createHistory(cal!.kernel.store, { normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('x') } }).run({ type: 'event.update', id: 'c', patch: { classNames: ['new'] } });
    const ev = host.querySelector('[data-key^="c|"]')!;
    expect([ev.classList.contains('old'), ev.classList.contains('new'), ev.classList.contains('dz-ev')]).toEqual([false, true, true]);
  });

  it('right-to-left locales set dir; times inside stay left to right', () => {
    const host = mount({ locale: 'ar-EG', events: [{ id: 'r', start: '2026-10-21T09:00[Europe/Paris]' }] });
    expect(host.querySelector<HTMLElement>('.dz-cal')!.dir).toBe('rtl');
    expect(host.querySelector<HTMLElement>('.dz-ev__time')!.dir).toBe('ltr');
  });
});

describe('robustness', () => {
  it('one subscriber that throws does not starve the others, nor other kernels on the store', async () => {
    const store = createEventStore();
    const a = createKernel({ timeZone: 'UTC', locale: 'en', store, now: at('2026-10-21T08:00:00Z') });
    const b = createKernel({ timeZone: 'UTC', locale: 'en', store, now: at('2026-10-21T08:00:00Z') });
    a.subscribe(() => {
      throw new Error('boom');
    });
    let reached = 0;
    b.subscribe(() => reached++);
    const swallow = (e: PromiseRejectionEvent | unknown) => (e as { preventDefault?: () => void }).preventDefault?.();
    process.on('unhandledRejection', swallow);
    createHistory(store, { normalize: { displayZone: 'UTC', newId: createIdGenerator('z') } }).run({ type: 'event.create', event: { id: 'e', start: '2026-10-21T09:00[UTC]' } });
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', swallow);
    expect(reached).toBe(1);
  });
});

describe('KeyedList keeps DOM order', () => {
  const make = () => {
    const box = document.createElement('div');
    const list = new KeyedList<{ key: string; sig: string }>(box, () => document.createElement('i'), (el, it) => (el.textContent = it.key));
    const order = () => [...box.children].map((c) => c.textContent).join('');
    return { list, order, box };
  };
  const items = (s: string) => [...s].map((k) => ({ key: k, sig: '1' }));

  it('moves, swaps, removes and inserts, keeping the same nodes', () => {
    const { list, order, box } = make();
    list.sync(items('abcd'));
    const b = box.children[1];
    for (const next of ['dcba', 'bd', 'abcde', 'eabcd', 'ae', '']) {
      list.sync(items(next));
      expect(order()).toBe(next);
    }
    list.sync(items('b'));
    expect(box.children[0]).not.toBe(b); // b was removed in between, so it is a new node
    list.sync(items('xbx'.slice(1)));
    expect(order()).toBe('bx');
  });
});

describe('CSS that jsdom cannot see', () => {
  it('sizes are read with fallbacks and never declared on .dz-cal (a host value reaches it)', () => {
    expect(DZ_CSS).not.toMatch(/\.dz-cal\s*\{[^}]*--dz-minute\s*:/);
    expect(DZ_CSS).toContain('var(--dz-minute, 0.8px)');
    expect(DZ_CSS).toContain('height: var(--dz-height, 40rem)');
  });

  it('header, all-day row and body reserve the same scrollbar gutter', () => {
    expect(DZ_CSS).toMatch(/\.dz-tg__head, \.dz-tg__allday, \.dz-tg__body \{ scrollbar-gutter: stable; \}/);
  });

  it('no custom property refers to itself', () => {
    for (const m of DZ_CSS.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) expect(m[2]!.includes(`var(${m[1]}`)).toBe(false);
  });
});
