import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { DzCalendarElement, defineDzCalendar } from '../src/index.js';

defineDzCalendar('dz-calendar-test');
afterEach(() => (document.body.innerHTML = ''));
const make = (html: string) => {
  document.body.insertAdjacentHTML('beforeend', html);
  return document.body.lastElementChild as DzCalendarElement;
};

describe('<dz-calendar> (the Web Component)', () => {
  it('in the page by default: its attributes are the options; it says what it shows (dz-dates-set)', () => {
    const seen: string[] = [];
    document.addEventListener('dz-dates-set', (e) => seen.push((e as CustomEvent).detail.title), { once: true });
    const el = make('<dz-calendar-test view="timeGridDay" date="2026-10-25" time-zone="Europe/Paris" locale="en-GB"></dz-calendar-test>');
    expect([el.shadowRoot, el.querySelector('.dz-cal') !== null, el.calendar!.kernel.getState().view.type, seen]).toEqual([null, true, 'timeGridDay', ['Sunday, 25 October 2026']]);
  });

  it('an attribute changed is an update; a bad one is a dz-problem event, never a throw', async () => {
    const el = make('<dz-calendar-test view="timeGridWeek" date="2026-10-21" time-zone="Europe/Paris" locale="en-GB"></dz-calendar-test>');
    const problems: string[] = [];
    const codes: string[] = [];
    el.addEventListener('dz-problem', (e) => {
      for (const p of (e as CustomEvent).detail as { code: string; path: string }[]) (codes.push(p.code), problems.push(p.path));
    });
    el.setAttribute('view', 'dayGridMonth');
    el.setAttribute('time-zone', 'Mars/Olympus');
    el.setAttribute('date', 'not a date');
    await Promise.resolve();
    expect([el.calendar!.kernel.getState().view.type, el.calendar!.kernel.getState().timeZone, problems]).toEqual(['dayGridMonth', 'Europe/Paris', ['attribute:time-zone', 'attribute:date']]);
    expect([...new Set(codes)]).toEqual(['invalid-option']);
  });

  it('properties set before the element is defined are taken; events are a property; callbacks are composed DOM events', () => {
    const el = document.createElement('dz-calendar-later') as DzCalendarElement & { events?: unknown };
    el.events = [{ id: 'a', title: 'Garde', start: '2026-10-21T09:00[Europe/Paris]' }];
    el.setAttribute('date', '2026-10-21');
    el.setAttribute('time-zone', 'Europe/Paris');
    document.body.append(el);
    defineDzCalendar('dz-calendar-later');
    const clicks: string[] = [];
    el.addEventListener('dz-event-click', (e) => clicks.push((e as CustomEvent).detail.event.id));
    el.querySelector<HTMLElement>('[data-event-id="a"]')!.click();
    expect([el.calendar!.kernel.store.snapshot.getEvent('a')?.title, clicks]).toEqual(['Garde', ['a']]);
  });

  it('shadow: inside a shadow root, its own styles there, a stylesheet linked in, parts named', () => {
    const el = make('<dz-calendar-test shadow stylesheet="/theme.css" date="2026-10-21" time-zone="Europe/Paris"></dz-calendar-test>');
    const root = el.shadowRoot!;
    expect([el.querySelector('.dz-cal'), root.querySelector('.dz-cal')?.getAttribute('part'), root.querySelector('link')?.getAttribute('href'), root.querySelector('style[data-dzcalendar="core"]') !== null]).toEqual([null, 'calendar', '/theme.css', true]);
  });

  it('removed: destroyed; put back: made again', async () => {
    const el = make('<dz-calendar-test date="2026-10-21"></dz-calendar-test>');
    el.remove();
    await Promise.resolve();
    expect(el.calendar).toBeNull();
    document.body.append(el);
    expect(el.calendar).not.toBeNull();
    expect(Temporal.PlainDate.compare(el.calendar!.kernel.getState().date, Temporal.PlainDate.from('2026-10-21'))).toBe(0);
  });
});

describe('after the 18a review', () => {
  it('a bad zone or view at mount: the calendar is drawn all the same, and the problems can be read later', () => {
    const el = make('<dz-calendar-test view="nope" time-zone="Mars/X" date="2026-10-21"></dz-calendar-test>');
    expect([el.calendar !== null, el.problems.map((p) => `${p.path}:${p.detail}`)]).toEqual([true, ['attribute:time-zone:unknown-zone', 'attribute:view:unknown-view']]);
  });

  it('options with the same values: nothing remade; a live key changed in place, on the week shown', () => {
    const el = make('<dz-calendar-test view="timeGridWeek" date="2026-10-21" time-zone="Europe/Paris"></dz-calendar-test>');
    const hooks = {};
    el.options = { hooks };
    const first = el.calendar;
    el.options = { hooks };
    expect(el.calendar).toBe(first);
    el.navigate('next');
    // A live key: changed in place (the same calendar, still on the week it showed).
    el.options = { hooks, weekNumbers: true };
    expect([el.calendar === first, String(el.calendar!.kernel.getState().date)]).toEqual([true, '2026-10-28']);
  });

  it('weekends taken away after the start: shown again (the default), not hidden', () => {
    const el = make('<dz-calendar-test view="timeGridWeek" date="2026-10-21" weekends="false"></dz-calendar-test>');
    expect(el.calendar!.kernel.getState().range.dates.length).toBe(5);
    el.removeAttribute('weekends');
    expect(el.calendar!.kernel.getState().range.dates.length).toBe(7);
  });
});


describe('after the 18a code review', () => {
  it('options changed live keep the edits and the undo history; a key that is not live remakes it on its store (dz-remade)', () => {
    const el = make('<dz-calendar-test view="timeGridWeek" date="2026-10-21" time-zone="Europe/Paris"></dz-calendar-test>');
    el.events = [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]' }];
    el.calendar!.run({ type: 'event.update', id: 'a', patch: { start: '2026-10-21T10:00[Europe/Paris]' } });
    const first = el.calendar;
    el.options = { weekNumbers: true };
    expect([el.calendar, String(el.calendar!.kernel.store.snapshot.getEvent('a')!.start).slice(11, 16), el.calendar!.undo()]).toEqual([first, '10:00', true]);
    const remade: unknown[] = [];
    el.addEventListener('dz-remade', (e) => remade.push((e as CustomEvent).detail.calendar));
    el.calendar!.run({ type: 'event.update', id: 'a', patch: { start: '2026-10-21T11:00[Europe/Paris]' } });
    el.options = { weekNumbers: true, firstDay: 7 } as never;
    expect([el.calendar !== first, remade.length, String(el.calendar!.kernel.store.snapshot.getEvent('a')!.start).slice(11, 16)]).toEqual([true, 1, '11:00']);
  });

  it('events, sources, resources not lists, bad events, a bad source: problems, never a throw; the calendar stays', async () => {
    const el = make('<dz-calendar-test date="2026-10-21" time-zone="Europe/Paris"></dz-calendar-test>');
    expect(() => {
      el.events = 'x' as never;
      el.events = [{ id: 'b', start: 'garbage' }];
      el.sources = [{ id: 'x', kind: 'nope' } as never];
      el.resources = 5 as never;
    }).not.toThrow();
    expect([el.calendar !== null, el.problems.map((p) => p.path).filter((x) => x.startsWith('property:') || x.startsWith('events'))]).toEqual([true, ['property:events', 'events[0].start', 'property:sources[0]', 'property:resources']]);
  });

  it('"Open" and slots as buttons only when the page listens (or gives the callback)', () => {
    const el = make('<dz-calendar-test view="timeGridWeek" date="2026-10-21" time-zone="Europe/Paris"></dz-calendar-test>');
    const open = () => Boolean(el.calendar!.getOptions().onEventOpen);
    const before = open();
    el.addEventListener('dz-event-open', () => {});
    expect([before, open()]).toEqual([false, true]);
  });
});
