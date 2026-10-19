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

describe('motion hooks (Phase 17b)', () => {
  const week = (motion: MotionAdapter) => {
    const host = document.createElement('div');
    document.body.append(host);
    cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'en-GB', now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'), initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), events: [{ id: 'a', title: 'Garde', start: '2026-10-21T09:00[Europe/Paris]' }, { id: 'b', title: 'Autre', start: '2026-10-22T09:00[Europe/Paris]' }], motion });
    return cal;
  };

  it('a delete: a copy of the event as it was (its title), without ids, in the leave layer; undone, it enters with cause "undo"', () => {
    const seen: string[] = [];
    const c = week({
      eventsLeave: (copies, info) => void seen.push(`leave ${info.cause} ${copies.map((x) => `${x.dataset['dzGone']}:${x.textContent?.includes('Garde')}:${x.hasAttribute('data-event-id')}:${x.parentElement?.className}`).join()}`),
      eventsEnter: (nodes, info) => void seen.push(`enter ${info?.cause} ${nodes.length}`),
    });
    c.run({ type: 'event.delete', id: 'a' });
    c.undo();
    expect(seen).toEqual(['leave command a:true:false:dz-leave', 'enter undo 1']);
  });

  it('a move is not a leave; no hook, or wantsLeave() false: no copy is made', () => {
    const seen: string[] = [];
    const c = week({ wantsLeave: () => false, eventsLeave: () => void seen.push('leave') });
    c.run({ type: 'event.delete', id: 'a' });
    expect([seen, document.querySelectorAll('.dz-leaving').length]).toEqual([[], 0]);
    cal!.destroy();
    const d = week({ eventsLeave: () => void seen.push('leave') });
    d.run({ type: 'event.update', id: 'b', patch: { start: '2026-10-22T11:00[Europe/Paris]' } });
    expect(seen).toEqual([]);
  });

  it('an eased scroll: the place is set as the view would, then handed to the adapter (or set when it declines)', async () => {
    const { scrollEased } = await import('../src/host.js');
    const el = document.createElement('div');
    const asked: number[] = [];
    scrollEased({ easeScroll: true, motion: { scroll: (_e, to) => (asked.push(to.top), true) } }, el, () => (el.scrollTop = 0));
    scrollEased({ easeScroll: false, motion: { scroll: () => true } }, el, () => (el.scrollTop = 0));
    expect(asked).toEqual([]);
  });
});
