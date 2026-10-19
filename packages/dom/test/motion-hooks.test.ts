import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance, MotionAdapter, MotionChange } from '../src/index.js';

let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const mount = (motion?: MotionAdapter) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'en-GB', now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'), initialView: 'dayGridMonth', initialDate: Temporal.PlainDate.from('2026-10-21'), events: [{ id: 'a', start: '2026-10-14T09:00[Europe/Paris]' }], ...(motion && { motion }) });
  return cal;
};

describe('motion hooks (Phase 17a)', () => {
  it('a change: beforeChange sees the old screen, afterChange the new; handled, the plain hooks stay quiet; the title rolls', () => {
    const log: string[] = [];
    mount({
      beforeChange: (c: MotionChange) => (log.push(`before ${c.from.view}→${c.to.view} ${c.causes.join('+')} cell:${Boolean(c.root.querySelector('[data-date="2026-10-14"]'))}`), 'token'),
      afterChange: (t, c, body) => (log.push(`after ${String(t)} ${c.to.family} ${body.isConnected}`), true),
      viewChange: () => void log.push('viewChange'),
      titleChange: (el, from, to) => void log.push(`title ${from} → ${to} (${el.textContent})`),
    });
    cal!.update({ view: 'timeGridDay', date: Temporal.PlainDate.from('2026-10-14') });
    expect(log).toEqual(['before dayGridMonth→timeGridDay view cell:true', 'after token timeGrid true', 'title October 2026 → Wednesday, 14 October 2026 (Wednesday, 14 October 2026)']);
  });

  it('not handled: viewChange in the dates’ direction; the first paint animates nothing; a zone change says so', () => {
    const log: string[] = [];
    const c = mount({ afterChange: () => false, viewChange: (_b, dir) => void log.push(`view ${dir}`), beforeChange: (ch) => void log.push(`before ${ch.causes.join('+')} ${ch.from.zone}→${ch.to.zone}`) });
    expect(log).toEqual([]);
    c.navigate('next');
    c.update({ timeZone: 'Asia/Tokyo' });
    expect(log).toEqual(['before navigate Europe/Paris→Europe/Paris', 'view next', 'before zone Europe/Paris→Asia/Tokyo']);
  });

  it('the default (WAAPI) moves nothing where Element.animate is missing (jsdom), and throws nothing', () => {
    const c = mount();
    expect(() => (c.navigate('next'), c.update({ view: 'timeGridWeek' }))).not.toThrow();
  });
});
