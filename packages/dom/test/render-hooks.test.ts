import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, PlainTime, ZonedDateTime } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';
import '../src/list.js';
import '../src/multimonth.js';

// Render hooks on every element (docs/behaviors/render-hooks.md). Paris, the week of 19 – 25 October 2026:
// the clocks fall back on Sunday 25 (03:00 → 02:00), a day of 25 hours.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const make = (o: Record<string, unknown> = {}) =>
  (cal = createCalendar(document.body.appendChild(document.createElement('div')), {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    initialView: 'timeGridWeek',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    now,
    ...o,
  }));
const allDay = (id: string, date: string): EventInput => ({ id, title: id, start: date, allDay: true });

describe('the four members', () => {
  it('class: a string, a list, a function; what the function stops giving is taken off, ours stay', () => {
    let on = true;
    const c = make({ hooks: { dayLane: { class: (x: { today: boolean }) => (x.today && on ? ['is-today', 'mine'] : null) }, allDayLabel: { class: 'a b' }, slotLabel: { class: ['tick'] } } });
    const today = () => c.element.querySelector<HTMLElement>('.dz-tg__col[data-date="2026-10-21"]')!;
    const first = [today().classList.contains('mine'), today().classList.contains('dz-tg__col--today')];
    on = false;
    c.update({ hooks: { dayLane: { class: (x: { today: boolean }) => (x.today && on ? 'mine' : null) }, allDayLabel: { class: 'a b' }, slotLabel: { class: ['tick'] } } });
    expect([...first, today().classList.contains('mine'), today().classList.contains('dz-tg__col--today')]).toEqual([true, true, false, true]);
    expect(c.element.querySelector('.dz-tg__allday-label')!.className.split(' ').sort()).toEqual(['a', 'b', 'dz-tg__allday-label']);
    expect(c.element.querySelectorAll('.dz-tick.tick').length).toBe(c.element.querySelectorAll('.dz-tick').length);
  });

  it('content: text in place of ours, null keeps ours; a fragment too', () => {
    make({
      hooks: {
        allDayLabel: { content: () => 'Journée' },
        slotLabel: { content: (x: { time: PlainTime }) => (x.time.hour === 9 ? '9 h' : null) },
      },
    });
    const ticks = [...document.querySelectorAll('.dz-tick')].map((t) => t.textContent);
    expect([document.querySelector('.dz-tg__allday-label')!.textContent, ticks.includes('9 h'), ticks.includes('10:00')]).toEqual(['Journée', true, true]);
  });

  it('didMount once per element, its clean-up and willUnmount when the week goes', () => {
    const log: string[] = [];
    const c = make({
      hooks: {
        dayLane: {
          didMount: ({ ctx }: { ctx: { date: PlainDate } }) => {
            log.push(`mount ${ctx.date}`);
            return () => log.push(`clean ${ctx.date}`);
          },
          willUnmount: ({ ctx }: { ctx: { date: PlainDate } }) => void log.push(`unmount ${ctx.date}`),
        },
      },
    });
    const mounted = log.filter((l) => l.startsWith('mount')).length;
    c.update({ nowIndicator: false });
    const still = log.length;
    c.navigate('next');
    // Monday 19's column leaves: its clean-up first, then willUnmount; Monday 26's comes.
    expect([mounted, still, log.indexOf('clean 2026-10-19') < log.indexOf('unmount 2026-10-19'), log.includes('mount 2026-10-26')]).toEqual([7, 7, true, true]);
  });

  it('a hook that throws is reported, the element drawn as ours', async () => {
    const reported: unknown[] = [];
    const on = (e: { reason: unknown }) => void reported.push(e);
    process.on('unhandledRejection', on as never);
    make({ hooks: { allDayLabel: { content: () => { throw new Error('app bug'); }, class: () => { throw new Error('bug 2'); } } } });
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', on as never);
    expect([document.querySelector('.dz-tg__allday-label')!.textContent, reported.length]).toEqual(['Journée', 2]);
  });

  it('the same functions given again (a new object) redraw nothing', () => {
    let calls = 0;
    const content = () => (calls++, null);
    const c = make({ hooks: { slotLabel: { content } } });
    const first = calls;
    c.update({ hooks: { slotLabel: { content } } });
    c.update({ hooks: { slotLabel: { content }, allDayLabel: {} } });
    expect([first > 0, calls]).toEqual([true, first]);
  });
});

describe('a time grid', () => {
  it('dayLane: each day’s real length — 1 500 minutes on Sunday 25', () => {
    const seen: string[] = [];
    make({ hooks: { dayLane: { didMount: ({ ctx }: { ctx: { date: PlainDate; lengthMinutes: number; today: boolean } }) => void seen.push(`${ctx.date} ${ctx.lengthMinutes}${ctx.today ? ' today' : ''}`) } } });
    expect(seen).toEqual(['2026-10-19 1440', '2026-10-20 1440', '2026-10-21 1440 today', '2026-10-22 1440', '2026-10-23 1440', '2026-10-24 1440', '2026-10-25 1500']);
  });

  it('slotLabel: 09:00 is 540 minutes down, written 09:00', () => {
    const seen: string[] = [];
    make({ hooks: { slotLabel: { class: (x: { time: PlainTime; position: number; text: string; pass: number }) => (x.time.hour === 9 && x.time.minute === 0 && seen.push(`${x.position} ${x.text} ${x.pass}`), null) } } });
    expect(seen).toEqual(['540 09:00 1']);
  });

  it('slotLane: drawn only when asked, one per tick, under the events', () => {
    const none = make().element.querySelectorAll('.dz-tg__slotlane').length;
    cal!.destroy();
    const c = make({ hooks: { slotLane: { class: 'lane' } } });
    // One per tick but the last (24:00 ends the axis, it starts no slot).
    expect([none, c.element.querySelectorAll('.dz-tg__slotlane.lane').length]).toEqual([0, c.element.querySelectorAll('.dz-tick').length - 1]);
  });

  it('nowIndicator: told the current time in the calendar’s zone', () => {
    const seen: string[] = [];
    make({ hooks: { nowIndicator: { didMount: ({ ctx }: { ctx: { now: ZonedDateTime } }) => void seen.push(ctx.now.toString()) } } });
    expect(seen).toEqual(['2026-10-21T10:00:00+02:00[Europe/Paris]']);
  });

  it('weekNumber: week 43 in the corner', () => {
    const seen: string[] = [];
    make({ weekNumbers: true, hooks: { weekNumber: { content: (x: { week: number; date: PlainDate }) => (seen.push(`${x.week} ${x.date}`), `S${x.week}`) } } });
    expect([seen[0], document.querySelector('.dz-tg__corner')?.textContent]).toEqual(['43 2026-10-19', 'S43']);
  });

  it('view: classes on the view’s root, told its type and range', () => {
    const seen: string[] = [];
    const c = make({ hooks: { view: { class: (x: { view: string; family: string; range: { start: PlainDate; end: PlainDate } }) => (seen.push(`${x.view} ${x.family} ${x.range.start}..${x.range.end}`), 'agenda') } } });
    expect([seen[0], c.element.querySelector('.dz-tg')!.classList.contains('agenda')]).toEqual(['timeGridWeek timeGrid 2026-10-19..2026-10-26', true]);
  });
});

describe('a month', () => {
  it('dayCell: the grid starts on Monday 28 September (another month); Sunday 25 is 1 500 minutes long', () => {
    const seen = new Map<string, string>();
    make({ initialView: 'dayGridMonth', hooks: { dayCell: { class: (x: { date: PlainDate; outside: boolean; lengthMinutes: number }) => (seen.set(String(x.date), `${x.outside} ${x.lengthMinutes}`), null) } } });
    expect([[...seen.keys()][0], seen.get('2026-09-28'), seen.get('2026-10-25'), seen.get('2026-10-21')]).toEqual(['2026-09-28', 'true 1440', 'false 1500', 'false 1440']);
  });

  it('dayCell content goes in place of the day’s number, the events kept', () => {
    make({ initialView: 'dayGridMonth', events: [allDay('x', '2026-10-21')], hooks: { dayCell: { content: (x: { date: PlainDate }) => `j${x.date.day}` } } });
    const cell = document.querySelector('.dz-dg__cell[data-date="2026-10-21"]')!;
    expect([cell.querySelector('.dz-dg__num')!.textContent, cell.querySelectorAll('.dz-dg__item').length]).toEqual(['j21', 1]);
  });

  it('moreLink and morePopover: four events on Wednesday 21 with two lanes', () => {
    const seen: string[] = [];
    const c = make({
      initialView: 'dayGridMonth',
      dayMaxLanes: 2,
      events: ['a', 'b', 'c', 'd'].map((id) => allDay(id, '2026-10-21')),
      hooks: {
        moreLink: { class: 'plus', content: (x: { count: number; date: PlainDate }) => (seen.push(`link ${x.date} ${x.count}`), `et ${x.count}`) },
        morePopover: { class: 'panel', didMount: ({ ctx }: { ctx: { date: PlainDate } }) => void seen.push(`open ${ctx.date}`), willUnmount: () => void seen.push('closed') },
      },
    });
    const link = c.element.querySelector<HTMLElement>('.dz-more.plus')!;
    const n = Number(link.textContent!.slice(3));
    // What the link stands for and what the cell's lanes show make the day's four.
    expect([link.textContent!.startsWith('et '), n + c.element.querySelectorAll('.dz-dg__week .dz-dg__bars [data-segment]').length >= 4, seen[0]]).toEqual([true, true, `link 2026-10-21 ${n}`]);
    link.click();
    const panel = document.querySelector('.dz-pop')!;
    const open = panel.classList.contains('panel');
    panel.querySelector<HTMLElement>('.dz-pop__close')!.click();
    expect([open, seen.slice(1), panel.classList.contains('panel')]).toEqual([true, ['open 2026-10-21', 'closed'], false]);
  });

  it('monthHeader: each month’s title in a year', () => {
    const seen: string[] = [];
    make({ initialView: 'multiMonthYear', hooks: { monthHeader: { content: (x: { month: PlainDate }) => (seen.push(String(x.month)), null) } } });
    expect([seen.length, seen[0], seen[11]]).toEqual([12, '2026-01-01', '2026-12-01']);
  });
});

describe('a list', () => {
  it('listDayHeader: Sunday 25 told its 1 500 minutes; noEvents in place of the calendar’s words', () => {
    const seen: string[] = [];
    const c = make({
      initialView: 'listWeek',
      events: [{ id: 's', title: 'S', start: '2026-10-25T10:00[Europe/Paris]', duration: { hours: 1 } }],
      hooks: { listDayHeader: { class: 'head', didMount: ({ ctx }: { ctx: { date: PlainDate; lengthMinutes: number } }) => void seen.push(`${ctx.date} ${ctx.lengthMinutes}`) }, noEvents: { content: () => 'Rien' } },
    });
    const head = c.element.querySelector('.dz-list__head.head') !== null;
    c.navigate('next');
    expect([seen, head, c.element.querySelector('.dz-list__empty, .dz-list > :last-child')?.textContent]).toEqual([['2026-10-25 1500'], true, 'Rien']);
  });
});

describe('resources in a time grid', () => {
  it('resource and resourceGroupHeader: classes and content; read once the application fills them', () => {
    const c = make({
      initialView: 'resourceTimeGridDay',
      resources: [
        { id: 'a', title: 'Dre A', service: 'Médecine' },
        { id: 'b', title: 'Dr B', service: 'Chirurgie' },
      ],
      resourceGroupField: 'service',
      hooks: { resource: { class: (x: { resource: { id: string } }) => `r-${x.resource.id}`, content: (x: { resource: { title: string } }) => x.resource.title.toUpperCase() }, resourceGroupHeader: { class: 'grp' } },
    });
    const heads = [...c.element.querySelectorAll<HTMLElement>('.dz-tg__resource')];
    expect(heads.map((h) => `${h.classList.contains(`r-${h.dataset['resource']}`)} ${h.textContent} ${h.getAttribute('aria-hidden')}`)).toEqual(['true DRE A null', 'true DR B null']);
    expect(c.element.querySelectorAll('.grp').length).toBe(2);
  });
});

describe('events', () => {
  it('class: beside the event’s own classNames, re-read when the event changes', () => {
    const c = make({
      events: [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 }, classNames: ['own'] }],
      hooks: { event: { class: (x: { instance: { event: { title: string } } }) => (x.instance.event.title === 'A' ? 'is-a' : 'not-a') } },
    });
    const node = () => c.element.querySelector<HTMLElement>('.dz-tg__events .dz-ev')!;
    const first = [node().classList.contains('own'), node().classList.contains('is-a')];
    c.run({ type: 'event.update', id: 'a', patch: { title: 'B' } });
    expect([...first, node().classList.contains('own'), node().classList.contains('is-a'), node().classList.contains('not-a')]).toEqual([true, true, true, false, true]);
  });
});

describe('after the 18f-1 review', () => {
  type Mounted = { el: HTMLElement; ctx: { date?: PlainDate; month?: PlainDate } };
  it('a month’s cells and week numbers are let go when the month goes; mounted cells were in the page', () => {
    const log = { mounted: 0, connected: 0, gone: 0, weeks: 0, weeksGone: 0 };
    const c = make({
      initialView: 'dayGridMonth',
      weekNumbers: true,
      hooks: {
        dayCell: { didMount: ({ el }: Mounted) => void (log.mounted++, el.isConnected && log.connected++), willUnmount: () => void log.gone++ },
        weekNumber: { didMount: () => void log.weeks++, willUnmount: () => void log.weeksGone++ },
      },
    });
    const first = { ...log };
    c.navigate('next');
    // October's grid (28 September – 8 November) and November's (26 October – 6 December) share two weeks:
    // their 14 cells stay, the other 28 are let go. Week numbers are drawn anew in every cell redrawn.
    expect([first.mounted, first.mounted === first.connected, log.gone]).toEqual([42, true, 28]);
    c.destroy();
    cal = null;
    expect([log.gone, log.weeksGone]).toEqual([log.mounted, log.weeks]);
  });

  it('a year’s month titles let go on destroy', () => {
    const log: string[] = [];
    const c = make({ initialView: 'multiMonthYear', hooks: { monthHeader: { didMount: ({ ctx }: Mounted) => void log.push(`+${ctx.month}`), willUnmount: ({ ctx }: Mounted) => void log.push(`-${ctx.month}`) } } });
    c.destroy();
    cal = null;
    expect([log.filter((l) => l.startsWith('+')).length, log.filter((l) => l.startsWith('-')).length]).toEqual([12, 12]);
  });

  it('the list’s "nothing" message let go when events come, mounted again when they go', () => {
    const log: string[] = [];
    const c = make({ initialView: 'listWeek', hooks: { noEvents: { class: 'none', didMount: () => void log.push('in'), willUnmount: () => void log.push('out') } } });
    c.update({ events: [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }] });
    c.update({ events: [] });
    expect([log, c.element.querySelectorAll('.none').length]).toEqual([['in', 'out', 'in'], 1]);
  });

  it('new didMount / willUnmount through update: the old let go, the new mounted; a hook removed takes its classes away', () => {
    const log: string[] = [];
    const c = make({ hooks: { allDayLabel: { class: 'x', didMount: () => void log.push('a+'), willUnmount: () => void log.push('a-') } } });
    c.update({ hooks: { allDayLabel: { class: 'x', didMount: () => void log.push('b+'), willUnmount: () => void log.push('b-') } } });
    c.update({ hooks: {} });
    expect([log, c.element.querySelector('.dz-tg__allday-label')!.classList.contains('x')]).toEqual([['a+', 'a-', 'b+', 'b-'], false]);
  });

  it('a class with a space in a list is two classes, nothing thrown; one of ours given back is left', () => {
    const c = make({ hooks: { dayLane: { class: (x: { today: boolean }) => (x.today ? ['a b', 'dz-tg__col'] : []) } } });
    const col = () => c.element.querySelector<HTMLElement>('.dz-tg__col[data-date="2026-10-21"]')!;
    const first = ['a', 'b'].every((k) => col().classList.contains(k));
    c.update({ hooks: { dayLane: { class: () => null } } });
    expect([first, col().classList.contains('a'), col().classList.contains('dz-tg__col')]).toEqual([true, false, true]);
  });

  it('a month’s "+N" in a resource view is told whose day it is', () => {
    const seen: string[] = [];
    make({
      initialView: 'resourceDayGridMonth',
      dayMaxLanes: 1,
      resources: [{ id: 'a', title: 'A' }],
      events: ['e1', 'e2', 'e3'].map((id) => ({ ...allDay(id, '2026-10-21'), resourceId: 'a' })),
      hooks: { moreLink: { class: (x: { resource: { id: string } | null; date: PlainDate }) => (seen.push(`${x.date} ${x.resource?.id ?? '-'}`), null) } },
    });
    expect(seen[0]).toBe('2026-10-21 a');
  });

  it('the now line: mounted once in the page, let go when the week leaves today', () => {
    const log: string[] = [];
    const c = make({ hooks: { nowIndicator: { didMount: ({ el }: Mounted) => void log.push(`in ${el.isConnected}`), willUnmount: () => void log.push('out') } } });
    c.navigate('next');
    expect(log).toEqual(['in true', 'out']);
  });
});

describe('events after the 18f-1 review', () => {
  const one = { id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } };
  it('didMount once the node is in the page; willUnmount from the hooks that mounted it, also when they are taken away', () => {
    const log: string[] = [];
    const c = make({ events: [one], hooks: { event: { didMount: ({ el }: { el: HTMLElement }) => void log.push(`A+ ${el.isConnected}`), willUnmount: () => void log.push('A-') } } });
    c.update({ hooks: { event: { didMount: () => void log.push('B+'), willUnmount: () => void log.push('B-') } } });
    c.update({ hooks: {} });
    c.destroy();
    cal = null;
    expect(log).toEqual(['A+ true', 'A-', 'B+', 'B-']);
  });

  it('an open "+N" panel closes when the hooks change, its events let go', () => {
    const log: string[] = [];
    const c = make({
      initialView: 'dayGridMonth',
      dayMaxLanes: 1,
      events: ['a', 'b', 'c'].map((id) => allDay(id, '2026-10-21')),
      hooks: { event: { didMount: ({ el }: { el: HTMLElement }) => void (el.closest('.dz-pop') && log.push('in panel')), willUnmount: ({ el }: { el: HTMLElement }) => void (el.closest('.dz-pop') && log.push('out of panel')) } },
    });
    c.element.querySelector<HTMLElement>('.dz-more')!.click();
    const opened = log.length;
    c.update({ hooks: {} });
    expect([opened > 0, log.filter((l) => l === 'out of panel').length]).toEqual([true, opened]);
  });
});
