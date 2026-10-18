import { describe, it, expect } from 'vitest';
import {
  BUILTIN_VIEWS,
  Temporal,
  buildDayGridModel,
  buildTimeGridModel,
  computeViewRange,
  createEventStore,
  createIdGenerator,
  formatRangeTitle,
  formatTemporal,
  monthNames,
  navigate,
  normalizeMany,
  weekNumber,
  weekRulesFor,
  weekdayNames,
} from '../src/index.js';
import type { EventInput, NavContext, ViewSpec } from '../src/index.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const mon: NavContext = { firstDay: 1, today: d('2026-10-16') };
const sun: NavContext = { firstDay: 7, today: d('2026-10-16') };
const str = (xs: readonly { toString(): string }[]) => xs.map((x) => x.toString());

describe('computeViewRange', () => {
  it('a month grid: six weeks from the locale’s first weekday', () => {
    const r = computeViewRange(d('2026-02-14'), BUILTIN_VIEWS.dayGridMonth!, mon);
    expect([r.start.toString(), r.end.toString(), r.weeks.length]).toEqual(['2026-01-26', '2026-03-09', 6]);
    expect([r.activeStart.toString(), r.activeEnd.toString()]).toEqual(['2026-02-01', '2026-03-01']);
    expect(computeViewRange(d('2026-02-14'), BUILTIN_VIEWS.dayGridMonth!, sun).start.toString()).toBe('2026-02-01');
  });

  it('fixedWeekCount: false keeps only the weeks the month touches (February 2026 from Sunday: four)', () => {
    const spec: ViewSpec = { ...BUILTIN_VIEWS.dayGridMonth!, fixedWeekCount: false };
    expect(computeViewRange(d('2026-02-14'), spec, sun).weeks.length).toBe(4);
  });

  it('a week starts on the first weekday; hidden days are left out', () => {
    const spec: ViewSpec = { ...BUILTIN_VIEWS.timeGridWeek!, hiddenDays: [6, 7] };
    const r = computeViewRange(d('2026-10-25'), spec, mon);
    expect(str(r.dates)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    expect(computeViewRange(d('2026-10-25'), BUILTIN_VIEWS.timeGridWeek!, sun).start.toString()).toBe('2026-10-25');
  });

  it('dayCount counts shown days', () => {
    const spec: ViewSpec = { ...BUILTIN_VIEWS.timeGridDay!, type: 'fourWorkDays', duration: { days: 4 }, dayCount: 4, hiddenDays: [6, 7] };
    expect(str(computeViewRange(d('2026-10-15'), spec, mon).dates)).toEqual(['2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20']);
  });

  it('every day hidden is a configuration error, said once', () => {
    expect(() => computeViewRange(d('2026-10-15'), { ...BUILTIN_VIEWS.timeGridWeek!, hiddenDays: [1, 2, 3, 4, 5, 6, 7] }, mon)).toThrow(RangeError);
  });
});

describe('navigate', () => {
  it('months step from the 1st: 31 January → February', () => {
    expect(navigate(d('2026-01-31'), BUILTIN_VIEWS.dayGridMonth!, 'next', mon).toString()).toBe('2026-02-01');
    expect(navigate(d('2026-03-31'), BUILTIN_VIEWS.dayGridMonth!, 'prev', mon).toString()).toBe('2026-02-01');
  });

  it('weeks, days, today, to', () => {
    expect(navigate(d('2026-10-21'), BUILTIN_VIEWS.timeGridWeek!, 'next', mon).toString()).toBe('2026-10-28');
    expect(navigate(d('2026-10-21'), BUILTIN_VIEWS.timeGridDay!, 'prev', mon).toString()).toBe('2026-10-20');
    expect(navigate(d('2020-01-01'), BUILTIN_VIEWS.timeGridDay!, 'today', mon).toString()).toBe('2026-10-16');
    expect(navigate(d('2020-01-01'), BUILTIN_VIEWS.timeGridDay!, { to: d('2026-12-25') }, mon).toString()).toBe('2026-12-25');
  });

  it('a one-day view steps over hidden days both ways', () => {
    const spec: ViewSpec = { ...BUILTIN_VIEWS.timeGridDay!, hiddenDays: [6, 7] };
    expect(navigate(d('2026-10-19'), spec, 'prev', mon).toString()).toBe('2026-10-16'); // Monday → Friday
    expect(navigate(d('2026-10-16'), spec, 'next', mon).toString()).toBe('2026-10-19'); // Friday → Monday
  });

  it('a dayCount view steps by shown days, both ways', () => {
    const spec: ViewSpec = { ...BUILTIN_VIEWS.timeGridDay!, duration: { days: 4 }, dayCount: 4, hiddenDays: [6, 7] };
    const next = navigate(d('2026-10-15'), spec, 'next', mon);
    expect(next.toString()).toBe('2026-10-21');
    expect(navigate(next, spec, 'prev', mon).toString()).toBe('2026-10-15');
  });
});

describe('view models', () => {
  const store = (inputs: EventInput[]) => {
    const s = createEventStore();
    s.replaceSourceChunk('t', 'all', normalizeMany(inputs, { displayZone: 'Europe/Paris', newId: createIdGenerator('v') }, 't').items);
    return s.snapshot;
  };

  it('time grid, the 25-hour Sunday: the two 02:30s sit side by side, each with its offset', () => {
    const snap = store([
      { id: 'first', start: '2026-10-25T02:30+02:00[Europe/Paris]', duration: { minutes: 30 } },
      { id: 'second', start: '2026-10-25T02:30+01:00[Europe/Paris]', duration: { minutes: 30 } },
    ]);
    const model = buildTimeGridModel(computeViewRange(d('2026-10-25'), BUILTIN_VIEWS.timeGridDay!, mon), snap, { displayZone: 'Europe/Paris' });
    const [col] = model.columns;
    expect(col!.axis.bands.map((b) => b.kind)).toEqual(['repeat']);
    const placed = col!.events.map((e) => [e.segment.instance.key, e.top, e.height, e.left, e.width, e.segment.instance.event.allDay ? '' : e.segment.instance.event.start.offset]);
    expect(placed).toEqual([
      ['first', 150, 30, 0, 0.5, '+02:00'],
      ['second', 150, 30, 0.5, 0.5, '+01:00'],
    ]);
  });

  it('time grid, elapsed axis: the same two events do not overlap', () => {
    const snap = store([
      { id: 'first', start: '2026-10-25T02:30+02:00[Europe/Paris]', duration: { minutes: 30 } },
      { id: 'second', start: '2026-10-25T02:30+01:00[Europe/Paris]', duration: { minutes: 30 } },
    ]);
    const model = buildTimeGridModel(computeViewRange(d('2026-10-25'), BUILTIN_VIEWS.timeGridDay!, mon), snap, { displayZone: 'Europe/Paris', axis: 'elapsed' });
    expect(model.columns[0]!.events.map((e) => [e.top, e.width])).toEqual([[150, 1], [210, 1]]);
  });

  it('time grid: an event across the fall-back is drawn in two parts, both the right way up', () => {
    const snap = store([{ id: 'x', start: '2026-10-25T02:50+02:00[Europe/Paris]', end: '2026-10-25T02:10+01:00[Europe/Paris]' }]);
    const model = buildTimeGridModel(computeViewRange(d('2026-10-25'), BUILTIN_VIEWS.timeGridDay!, mon), snap, { displayZone: 'Europe/Paris', minEventMinutes: 0 });
    expect(model.columns[0]!.events.map((e) => [e.top, e.height])).toEqual([[120, 10], [170, 10]]);
  });

  it('time grid 08:00–20:00: events outside are not drawn; one cut by the edge loses that rounded end', () => {
    const snap = store([
      { id: 'night', start: '2026-05-04T22:00[Europe/Paris]' },
      { id: 'early', start: '2026-05-04T07:00[Europe/Paris]', end: '2026-05-04T09:00[Europe/Paris]' },
      { id: 'edge', start: '2026-05-04T08:00[Europe/Paris]', end: '2026-05-04T08:00[Europe/Paris]' },
    ]);
    const model = buildTimeGridModel(computeViewRange(d('2026-05-04'), BUILTIN_VIEWS.timeGridDay!, mon), snap, { displayZone: 'Europe/Paris', slotMin: 'PT8H', slotMax: 'PT20H' });
    const ev = model.columns[0]!.events.map((e) => [e.segment.instance.key, e.top, e.height, e.segment.startsHere, e.segment.endsHere]);
    expect(ev).toEqual([
      ['early', 0, 60, false, true],
      ['edge', 0, 0, true, true],
    ]);
  });

  it('background events take no lane and never push a real event behind "+N"', () => {
    const snap = store([
      { id: 'bgAllDay', start: '2026-10-20', end: '2026-10-23', display: 'background' },
      { id: 'bgTimed', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T11:00[Europe/Paris]', display: 'background' },
      { id: 'normal', start: '2026-10-21' },
    ]);
    const range = computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.dayGridWeek!, mon);
    const week = buildDayGridModel(range, snap, { displayZone: 'Europe/Paris', maxLanes: 2 }).weeks[0]!;
    expect(week.bars.map((b) => [b.segment.instance.key, b.lane])).toEqual([['normal', 0]]);
    expect(week.hiddenPerDay.every((n) => n === 0)).toBe(true);
    expect(week.background.map((s) => s.instance.key).sort()).toEqual(['bgAllDay', 'bgTimed']);
    const tg = buildTimeGridModel(computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.timeGridWeek!, mon), snap, { displayZone: 'Europe/Paris' });
    expect([tg.allDay.lanes, tg.allDay.bars.map((b) => b.segment.instance.key), tg.allDay.background.map((b) => b.segment.instance.key)]).toEqual([1, ['normal'], ['bgAllDay']]);
  });

  it('time grid: all-day events go to the row above, packed in lanes', () => {
    const snap = store([{ id: 'a', start: '2026-10-19', end: '2026-10-22' }, { id: 'b', start: '2026-10-20' }]);
    const model = buildTimeGridModel(computeViewRange(d('2026-10-20'), BUILTIN_VIEWS.timeGridWeek!, mon), snap, { displayZone: 'Europe/Paris' });
    expect([model.allDay.lanes, model.allDay.bars.map((b) => [b.segment.instance.key, b.segment.dayIndex, b.segment.dayCount, b.lane])]).toEqual([2, [['a', 0, 3, 0], ['b', 1, 1, 1]]]);
  });

  it('day grid with +N: what does not fit is counted per day, nothing lost', () => {
    const inputs: EventInput[] = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, title: `${i}`, start: `2026-10-21T0${i + 1}:00[Europe/Paris]` }));
    const model = buildDayGridModel(computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.dayGridMonth!, mon), store(inputs), { displayZone: 'Europe/Paris', maxLanes: 3 });
    const week = model.weeks.find((w) => w.dates.some((x) => x.toString() === '2026-10-21'))!;
    const col = week.dates.findIndex((x) => x.toString() === '2026-10-21');
    expect(week.hiddenPerDay[col]).toBe(3); // lanes 0,1 drawn; the 3rd lane gives way to "+3"
    expect(week.bars.filter((b) => b.pieces.some((p) => p.from <= col && col < p.to))).toHaveLength(2);
  });
});

describe('formatting', () => {
  it('titles use Intl range formatting, from numbers', () => {
    expect(formatRangeTitle(d('2026-03-15'), d('2026-03-21'), { day: 'numeric', month: 'long', year: 'numeric' }, 'fr-FR')).toBe('15–21 mars 2026');
    // ICU puts thin spaces (U+2009) around the dash in English.
    expect(formatRangeTitle(d('2026-03-30'), d('2026-04-05'), { day: 'numeric', month: 'short', year: 'numeric' }, 'en-US').replace(/\u2009/g, ' ')).toBe('Mar 30 – Apr 5, 2026');
  });

  it('ends given the wrong way round still make the right title', () => {
    expect(formatRangeTitle(d('2026-03-21'), d('2026-03-15'), { day: 'numeric', month: 'long', year: 'numeric' }, 'fr-FR')).toBe('15–21 mars 2026');
  });

  it('a zoned time prints in its own zone, a plain date never shifts', () => {
    expect(formatTemporal(Temporal.ZonedDateTime.from('2026-10-25T02:30+01:00[Europe/Paris]'), { hour: '2-digit', minute: '2-digit' }, 'fr-FR')).toBe('02:30');
    expect(formatTemporal(d('2026-01-01'), { day: 'numeric', month: 'long' }, 'en-US')).toBe('January 1');
    expect(formatTemporal(Temporal.PlainTime.from('09:05'), { hour: '2-digit', minute: '2-digit', hour12: false }, 'en-GB')).toBe('09:05');
  });

  it('weekday and month names follow the locale and the first day', () => {
    expect(weekdayNames('en-US', 'short', 7)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(monthNames('fr-FR', 'long')[0]).toBe('janvier');
  });

  it('week numbers: 1 January 2027 is ISO week 53 of 2026, but week 1 in the US', () => {
    const fri = d('2027-01-01');
    expect(weekNumber(fri, weekRulesFor('fr-FR'))).toBe(fri.weekOfYear);
    expect(weekNumber(fri, weekRulesFor('fr-FR'))).toBe(53);
    expect(weekNumber(fri, weekRulesFor('en-US'))).toBe(1);
    // US: the week holding 1 January is week 1, and it starts Sunday 27 December.
    expect(weekNumber(d('2026-12-27'), weekRulesFor('en-US'))).toBe(1);
    expect(weekNumber(d('2026-12-26'), weekRulesFor('en-US'))).toBe(52);
  });

  it('week numbers agree with Temporal’s ISO weeks over ten years', () => {
    const iso = { firstDay: 1 as const, minimalDays: 4 };
    for (let x = d('2020-01-01'); Temporal.PlainDate.compare(x, d('2030-01-01')) < 0; x = x.add({ days: 1 })) {
      expect(weekNumber(x, iso)).toBe(x.weekOfYear);
    }
  });
});
