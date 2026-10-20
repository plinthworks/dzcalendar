import { describe, it, expect, afterEach, vi } from 'vitest';
import { Temporal, viewWindow } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { applyFullCalendar, createFromFullCalendar, fromFullCalendar } from '../src/index.js';

// Expectations by hand, from the published zone rules: Paris +02:00 until 25 October 2026 03:00, +01:00 after.
const P = 'Europe/Paris';
const d = (s: string) => Temporal.PlainDate.from(s);
afterEach(() => (document.body.innerHTML = ''));
const codes = (ps: readonly { code: string; path: string; detail?: string }[]) => ps.map((p) => `${p.code} ${p.path} ${p.detail ?? ''}`.trim());

describe('options', () => {
  it('days counted Monday = 1; hours, snap, scroll; business hours; the toolbar’s views; the rules', () => {
    const t = fromFullCalendar({
      timeZone: P,
      initialView: 'timeGridWeek',
      initialDate: '2026-10-21',
      firstDay: 0,
      hiddenDays: [0, 6],
      slotMinTime: '06:00:00',
      slotMaxTime: '20:30',
      slotDuration: '00:15:00',
      snapDuration: { minutes: 10 },
      scrollTime: '08:00',
      businessHours: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '18:00' },
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek listWeek' },
      eventOverlap: false,
      eventConstraint: 'businessHours',
      dayMaxEvents: true,
    });
    const o = t.options as Record<string, unknown>;
    expect([o['timeZone'], o['initialView'], String(o['initialDate']), o['firstDay'], o['hiddenDays'], o['timeGrid'], o['snapMinutes'], o['scrollTime'], o['businessHours'], o['headerViews'], o['rules'], o['dayMaxLanes']]).toEqual([
      P,
      'timeGridWeek',
      '2026-10-21',
      7,
      [7, 6],
      { slotMin: { minutes: 360 }, slotMax: { minutes: 1230 }, slotMinutes: 15 },
      10,
      { minutes: 480 },
      { daysOfWeek: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
      ['dayGridMonth', 'timeGridWeek', 'listWeek'],
      { constraint: 'businessHours', overlap: false },
      'auto',
    ]);
    expect(t.problems).toEqual([]);
  });

  it('every guess and every option without an equivalent is said; what is built in is not', () => {
    const t = fromFullCalendar({ height: 600, plugins: [], schedulerLicenseKey: 'x', dayCellContent: () => '', timeZone: 'local' });
    expect(codes(t.problems).map((c) => c.replace(/local:.*/, 'local:…'))).toEqual(['zone-guessed timeZone local:…', 'compat-unsupported height css', 'compat-unsupported dayCellContent none']);
    expect(t.problems.map((p) => p.code)).toContain('compat-unsupported');
    expect(codes(fromFullCalendar({}).problems)[0]).toMatch(/^zone-guessed timeZone browser:/);
    expect(codes(fromFullCalendar({ timeZone: 'Mars/Olympus' }).problems)[0]).toBe('unknown-zone timeZone Mars/Olympus');
  });
});

describe('events', () => {
  const events = (list: unknown[], zone = P) => {
    const t = fromFullCalendar({ timeZone: zone, events: list });
    return { events: (t.options as { events: EventInput[] }).events, problems: codes(t.problems) };
  };

  it('a wall time is read in the calendar’s zone (said); an offset or Z is the instant; a Date too; a date alone is all-day', () => {
    const r = events([
      { id: 1, title: 'A', start: '2026-10-21T09:00' },
      { id: 'b', start: '2026-10-21T07:00:00Z', end: '2026-10-21T08:00:00Z' },
      { id: 'c', start: new Date(Date.UTC(2026, 9, 26, 8, 0)) },
      { id: 'd', start: '2026-10-22', end: '2026-10-24' },
    ]);
    expect(r.events.map((e) => [e.id, e.start, e.end ?? null])).toEqual([
      ['1', '2026-10-21T09:00:00[Europe/Paris]', null],
      ['b', '2026-10-21T09:00:00+02:00[Europe/Paris]', '2026-10-21T10:00:00+02:00[Europe/Paris]'],
      // 26 October, after the change: 08:00 UTC is 09:00 in Paris (+01:00).
      ['c', '2026-10-26T09:00:00+01:00[Europe/Paris]', null],
      ['d', '2026-10-22', '2026-10-24'],
    ]);
    expect(r.problems).toEqual(['zone-guessed events[0].start Europe/Paris']);
  });

  it('a colour is kept in extendedProps and said (tones, not colours); display "block" is the default', () => {
    const r = events([{ id: 'x', start: '2026-10-21', color: '#c00', display: 'block', extendedProps: { room: 'B12' } }]);
    expect([r.events[0]!.extendedProps, r.events[0]!.display, r.problems]).toEqual([{ room: 'B12', color: '#c00' }, 'auto', ['compat-unsupported events[*].color tone']]);
  });

  it('simple recurrence: Monday and Wednesday 09:00–10:30 from 19 October until (excluded) 2 November — four occurrences', () => {
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), {
      timeZone: P,
      initialDate: '2026-10-19',
      events: [{ id: 's', title: 'Cours', daysOfWeek: [1, 3], startTime: '09:00', endTime: '10:30', startRecur: '2026-10-19', endRecur: '2026-11-02' }],
    });
    const got = calendar.kernel.store.snapshot.queryInstances(viewWindow(d('2026-10-01'), d('2026-12-01'), P)).map((i) => `${String(i.event.start).slice(0, 16)}→${String(i.event.end).slice(11, 16)}`);
    expect(got).toEqual(['2026-10-19T09:00→10:30', '2026-10-21T09:00→10:30', '2026-10-26T09:00→10:30', '2026-10-28T09:00→10:30']);
  });

  it('the rrule plugin, as an object and as text with its DTSTART and EXDATE', () => {
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), {
      timeZone: P,
      initialDate: '2026-10-19',
      events: [
        { id: 'o', rrule: { freq: 'weekly', byweekday: ['mo', 'fr'], dtstart: '2026-10-19T10:00:00', count: 4 }, duration: '01:00' },
        { id: 't', rrule: 'DTSTART;TZID=Europe/Paris:20261020T140000\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE;TZID=Europe/Paris:20261021T140000', duration: { minutes: 30 } },
      ],
    });
    const at = (id: string) => calendar.kernel.store.snapshot.queryInstances(viewWindow(d('2026-10-01'), d('2026-12-01'), P)).filter((i) => i.event.id.startsWith(id)).map((i) => String(i.event.start).slice(5, 16));
    expect([at('o'), at('t')]).toEqual([
      ['10-19T10:00', '10-23T10:00', '10-26T10:00', '10-30T10:00'],
      ['10-20T14:00', '10-22T14:00'],
    ]);
  });
});

describe('callbacks and resources, on a calendar', () => {
  it('eventClick gets a plain event (its Date, its props); a person’s move calls eventDrop with revert (an undo)', () => {
    const clicked: unknown[] = [];
    const dropped: { event: { start: Date }; oldEvent: { start: Date }; revert(): void }[] = [];
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), {
      timeZone: P,
      initialView: 'timeGridWeek',
      initialDate: '2026-10-21',
      editable: true,
      events: [{ id: 'a', title: 'A', start: '2026-10-21T09:00:00+02:00', end: '2026-10-21T10:00:00+02:00', extendedProps: { room: 'B12' } }],
      eventClick: (info: { event: { id: string; start: Date; extendedProps: object } }) => clicked.push([info.event.id, info.event.start.toISOString(), info.event.extendedProps]),
      eventDrop: (info: never) => dropped.push(info),
    });
    calendar.element.querySelector<HTMLElement>('[data-event-id="a"]')!.click();
    calendar.run({ type: 'event.update', id: 'a', patch: { start: '2026-10-22T09:00[Europe/Paris]', end: '2026-10-22T10:00[Europe/Paris]' } });
    expect([clicked, dropped.map((x) => [x.oldEvent.start.toISOString(), x.event.start.toISOString()])]).toEqual([[['a', '2026-10-21T07:00:00.000Z', { room: 'B12' }]], [['2026-10-21T07:00:00.000Z', '2026-10-22T07:00:00.000Z']]]);
    dropped[0]!.revert();
    expect(String(calendar.kernel.store.snapshot.getEvent('a')!.start)).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
  });

  it('nested resources are flattened with their parent; their columns become the timeline area’s', () => {
    const t = fromFullCalendar({ timeZone: P, resources: [{ id: 'card', title: 'Cardiologie', children: [{ id: 'b', title: 'Dre Benali' }] }], resourceAreaColumns: [{ field: 'title', headerContent: 'Médecin' }] });
    const o = t.options as Record<string, unknown>;
    expect([o['resources'], o['viewOptions']]).toEqual([[{ id: 'card', title: 'Cardiologie' }, { id: 'b', title: 'Dre Benali', parentId: 'card' }], { timeline: { areaColumns: [{ field: 'title', header: 'Médecin' }] } }]);
  });

  it('a function source gets the dates as the other library does, and answers by callback', async () => {
    const asked: string[] = [];
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), {
      timeZone: P,
      initialView: 'dayGridMonth',
      initialDate: '2026-10-21',
      events: (info: { startStr: string; timeZone: string }, ok: (e: unknown[]) => void) => {
        asked.push(info.timeZone);
        ok([{ id: 'f', title: 'Fetched', start: '2026-10-21' }]);
      },
    });
    await calendar.kernel.sources.idle();
    expect([asked[0], calendar.kernel.store.snapshot.getEvent('f')?.title]).toEqual([P, 'Fetched']);
  });

  it('applied to a calendar that exists: the view, the events, the callbacks', () => {
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), { timeZone: P });
    const r = applyFullCalendar(calendar, { timeZone: P, initialView: 'dayGridMonth', initialDate: '2026-10-21', events: [{ id: 'z', title: 'Z', start: '2026-10-21' }] });
    expect([calendar.kernel.getState().view.type, calendar.kernel.store.snapshot.getEvent('z')?.title, r.problems]).toEqual(['dayGridMonth', 'Z', []]);
  });
});

describe('after review: bad input is said, never thrown', () => {
  const el = () => document.body.appendChild(document.createElement('div'));
  it.each([
    ['initialDate', { initialDate: 'garbage' }, 'invalid-option initialDate unreadable'],
    ['an impossible date', { initialDate: '2026-13-45' }, 'invalid-option initialDate unreadable'],
    ['validRange', { validRange: { start: 'nope' } }, 'invalid-option validRange.start unreadable'],
    ['endRecur', { events: [{ id: 'x', daysOfWeek: [1], endRecur: 'nope' }] }, 'invalid-option events[0].endRecur unreadable'],
    ['rrule until', { events: [{ id: 'x', rrule: { freq: 'daily', until: 'nope', dtstart: '2026-10-19' } }] }, null],
    ['a zone that is not', { events: [{ id: 'x', start: '2026-10-01T00:00[Mars/X]' }] }, 'invalid-start events[0].start unreadable'],
    ['resource columns', { resourceAreaColumns: [null, 3] }, null],
    ['business days', { businessHours: { daysOfWeek: 'x' } }, null],
    ['a view that is not', { initialView: 'nope' }, 'invalid-option initialView nope:no-renderer'],
    ['a list view not imported', { initialView: 'listWeek' }, 'invalid-option initialView listWeek:no-renderer'],
    ['a slot of zero', { slotDuration: '00:00' }, 'invalid-option slotDuration rounded:1'],
    ['a snap of half a minute', { snapDuration: '00:00:30' }, 'invalid-option snapDuration rounded:1'],
    ['not an object', 42, 'invalid-option options number'],
  ])('%s', (_, options, said) => {
    let r!: ReturnType<typeof createFromFullCalendar>;
    expect(() => (r = createFromFullCalendar(el(), typeof options === 'object' ? { timeZone: P, ...options } : options, { warn: false }))).not.toThrow();
    if (said) expect(codes(r.problems)).toContain(said);
  });

  it('a toolbar view that cannot be drawn is said with the import that draws it', () => {
    const r = createFromFullCalendar(el(), { timeZone: P, headerToolbar: { right: 'dayGridMonth,listWeek,resourceTimelineDay,myView' } }, { warn: false });
    expect(codes(r.problems)).toEqual(['compat-unsupported headerToolbar listWeek:@dzcalendar/dom/list', 'compat-unsupported headerToolbar resourceTimelineDay:@dzcalendar/pro', 'compat-unsupported headerToolbar myView:unknown-view']);
  });
});

describe('after review: dates', () => {
  const series = (zone: string, start: string) => {
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), {
      timeZone: zone,
      initialDate: '2026-10-19',
      events: [{ id: 's', daysOfWeek: [1, 2, 3, 4, 5], startTime: start, endTime: '21:00', startRecur: '2026-10-19', endRecur: '2026-10-22' }],
    }, { warn: false });
    return calendar.kernel.store.snapshot.queryInstances(viewWindow(d('2026-10-01'), d('2026-11-01'), zone)).map((i) => String(i.event.start).slice(8, 10));
  };
  // endRecur 22 October, excluded: the 19th, 20th and 21st, whatever the zone's offset (Chicago -05:00 in October, Lord Howe +11:00).
  it('endRecur excludes its day in the calendar’s zone (Chicago in the evening, Lord Howe in the morning)', () => {
    expect([series('America/Chicago', '20:00'), series('Australia/Lord_Howe', '09:00')]).toEqual([['19', '20', '21'], ['19', '20', '21']]);
  });

  it('daysOfWeek without startRecur repeats in the past too (January 2026)', () => {
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), { timeZone: P, events: [{ id: 'm', daysOfWeek: [1], startTime: '09:00' }] }, { warn: false });
    // Mondays of January 2026: 5, 12, 19, 26.
    expect(calendar.kernel.store.snapshot.queryInstances(viewWindow(d('2026-01-01'), d('2026-02-01'), P)).map((i) => String(i.event.start).slice(0, 10))).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  });

  it('the rule text’s EXDATE and the exdate field together', () => {
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), {
      timeZone: P,
      events: [{ id: 'x', rrule: 'DTSTART:20261030T150000Z\nRRULE:FREQ=DAILY;COUNT=4\nEXDATE:20261031T150000Z', exdate: ['2026-11-01T15:00:00Z'], duration: '01:00' }],
    }, { warn: false });
    // After 25 October Paris is +01:00: 15:00Z is 16:00.
    expect(calendar.kernel.store.snapshot.queryInstances(viewWindow(d('2026-10-01'), d('2026-12-01'), P)).map((i) => String(i.event.start).slice(5, 16))).toEqual(['10-30T16:00', '11-02T16:00']);
  });

  it('datesSet and view: the grid shown (padding days) is active, the month current', () => {
    const got: { startStr: string; endStr: string; view: { currentStart: Date } }[] = [];
    createFromFullCalendar(document.body.appendChild(document.createElement('div')), { timeZone: P, initialView: 'dayGridMonth', initialDate: '2026-10-21', firstDay: 1, datesSet: (i: never) => got.push(i) }, { warn: false });
    // October 2026 starts on a Thursday: the grid runs from Monday 28 September to Sunday 8 November.
    expect([got[0]!.startStr, got[0]!.endStr, got[0]!.view.currentStart.toISOString()]).toEqual(['2026-09-28', '2026-11-09', '2026-09-30T22:00:00.000Z']);
  });
});

describe('after review: callbacks', () => {
  it('an occurrence moved alone is the series’ event dropped (eventDrop, eventChange), not an event added', () => {
    const seen: string[] = [];
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), {
      timeZone: P,
      initialDate: '2026-10-19',
      events: [{ id: 'w', rrule: { freq: 'daily', dtstart: '2026-10-19T14:00:00+02:00', count: 5 }, duration: '01:00' }],
      eventDrop: (i: { event: { id: string; startStr: string }; oldEvent: { startStr: string } }) => seen.push(`drop ${i.event.id} ${i.oldEvent.startStr} → ${i.event.startStr}`),
      eventChange: (i: { event: { id: string } }) => seen.push(`change ${i.event.id}`),
      eventAdd: (i: { event: { id: string } }) => seen.push(`add ${i.event.id}`),
    }, { warn: false });
    calendar.run({ type: 'event.move', id: 'w', key: '2026-10-21T14:00:00+02:00[Europe/Paris]', scope: 'this', start: '2026-10-21T16:00[Europe/Paris]' } as never);
    expect(seen).toEqual(['drop w 2026-10-21T14:00:00+02:00 → 2026-10-21T16:00:00+02:00', 'change w']);
  });

  it('applied again: the view and date stay; sources and events no longer given are gone', async () => {
    const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), { timeZone: P }, { warn: false });
    const one = (id: string) => (_: unknown, ok: (e: unknown[]) => void) => ok([{ id, start: '2026-10-21' }]);
    applyFullCalendar(calendar, { timeZone: P, initialView: 'dayGridMonth', initialDate: '2026-10-21', events: [{ id: 'z', start: '2026-10-21' }], eventSources: [one('a'), one('b')] });
    await calendar.kernel.sources.idle();
    calendar.navigate('next');
    applyFullCalendar(calendar, { timeZone: P, initialView: 'dayGridMonth', initialDate: '2026-10-21', eventSources: [one('c')] }, { initial: false });
    await calendar.kernel.sources.idle();
    expect([calendar.kernel.getState().date.month, [...calendar.kernel.store.snapshot.allEvents()].map((e) => e.id).sort()]).toEqual([11, ['c']]);
  });

  it('a click on an event with a url follows it, unless eventClick prevents it', () => {
    const go: string[] = [];
    const make = (prevent: boolean) => {
      const { calendar } = createFromFullCalendar(document.body.appendChild(document.createElement('div')), {
        timeZone: P,
        initialView: 'timeGridWeek',
        initialDate: '2026-10-21',
        events: [{ id: 'u', title: 'U', start: '2026-10-21T09:00:00+02:00', url: 'https://example.org/u' }],
        eventClick: (i: { jsEvent: { preventDefault(): void } }) => {
          if (prevent) i.jsEvent.preventDefault();
        },
      }, { warn: false });
      const open = vi.spyOn(window, 'open').mockImplementation((u) => (go.push(String(u)), null));
      calendar.element.querySelector<HTMLElement>('[data-event-id="u"]')!.click();
      open.mockRestore();
    };
    make(true);
    make(false);
    expect(go).toEqual(['https://example.org/u']);
  });
});

