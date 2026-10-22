import { describe, it, expect } from 'vitest';
import { Temporal, createEventStore, createKernel, createHistory, createIdGenerator } from '../src/index.js';
import type { KernelEvent, TimeGridModel } from '../src/index.js';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');

describe('kernel', () => {
  it('starts on today in its zone, with the locale’s week and a title', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now });
    const s = k.getState();
    expect([s.today.toString(), s.firstDay, s.range.start.toString(), s.title]).toEqual(['2026-10-21', 1, '2026-10-19', '19–25 oct. 2026']);
  });

  it('navigates, changes view, and retitles', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'en-US', now, initialView: 'dayGridMonth' });
    expect(k.getState().title).toBe('October 2026');
    k.navigate('next');
    expect(k.getState().title).toBe('November 2026');
    k.setView('timeGridDay', Temporal.PlainDate.from('2026-10-25'));
    expect(k.getState().title).toBe('Sunday, October 25, 2026');
  });

  it('memoizes the model, and after a store change rebuilds only what changed', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, events: [{ id: 'a', start: '2026-10-21T09:00[Europe/Paris]' }] });
    const m1 = k.viewModel();
    expect(k.viewModel()).toBe(m1);
    const events: KernelEvent[] = [];
    k.subscribe((e) => events.push(e));
    createHistory(k.store, { normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('x') } }).run({
      type: 'event.create',
      event: { id: 'b', start: '2026-10-23T09:00[Europe/Paris]' },
    });
    const m2 = k.viewModel();
    expect(m2).not.toBe(m1);
    expect([m1.family, m2.family]).toEqual(['timeGrid', 'timeGrid']);
    const [a, b] = [m1.model as TimeGridModel, m2.model as TimeGridModel];
    expect(b.columns.map((c, i) => c === a.columns[i])).toEqual([true, true, true, true, false, true, true]);
    expect(events.map((e) => e.type)).toEqual(['store']);
  });

  it('four kernels on one store show the same instant on each zone’s own day', () => {
    const store = createEventStore();
    const kernels = ['Europe/Paris', 'America/Chicago', 'Australia/Lord_Howe', 'Australia/Sydney'].map((tz) =>
      createKernel({ timeZone: tz, locale: 'en-GB', now, store, initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21') }),
    );
    createHistory(store, { normalize: { displayZone: 'UTC', newId: createIdGenerator('s') } }).run({
      type: 'event.create',
      event: { id: 'call', start: '2026-10-21T23:30[UTC]' },
    });
    const dayOfCall = kernels.map((k) => {
      const vm = k.viewModel().model as TimeGridModel;
      return vm.columns.find((c) => c.events.length > 0)!.key;
    });
    expect(dayOfCall).toEqual(['2026-10-22', '2026-10-21', '2026-10-22', '2026-10-22']);
  });

  it('reports what loading events found, and refuses a bad zone at once', () => {
    const k = createKernel({ timeZone: 'UTC', locale: 'en', now, events: [{ start: 'nope' }] });
    expect(k.getProblems()!.rejected).toBe(1);
    expect(() => createKernel({ timeZone: 'Mars/Olympus', locale: 'en', now })).toThrow(RangeError);
    expect(() => k.setTimeZone('Nowhere')).toThrow(RangeError);
  });

  it('setTimeZone rebuilds the model from scratch: every day is another day', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'en', now });
    const m1 = k.viewModel();
    k.setTimeZone('Asia/Tokyo');
    expect(k.viewModel()).not.toBe(m1);
    expect(k.getState().timeZone).toBe('Asia/Tokyo');
  });
});

describe('another view or date, without changing what is shown (printing, exports)', () => {
  it('stateAt / modelAt: 25 October 2026 in Paris (25 h: 02:00–03:00 twice, a repeat band on the wall axis); the shown week stays', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'en-US', now, events: [{ id: 'a', start: '2026-10-25T09:00[Europe/Paris]' }, { id: 'b', start: '2026-12-01T09:00[Europe/Paris]' }] });
    const shown = k.viewModel();
    const s = k.stateAt('timeGridDay', Temporal.PlainDate.from('2026-10-25'))!;
    const m = k.modelAt('timeGridDay', Temporal.PlainDate.from('2026-10-25'))!.model as TimeGridModel;
    const month = k.modelAt('dayGridMonth', Temporal.PlainDate.from('2026-12-10'))!;
    const ax = m.columns[0]!.axis;
    expect([s.title, m.columns.length, ax.day.kind, ax.bands.map((b) => [b.kind, b.from, b.to]), m.columns[0]!.events.map((e) => e.segment.instance.event.id)]).toEqual(['Sunday, October 25, 2026', 1, 'long', [['repeat', 120, 180]], ['a']]);
    expect([month.family, k.stateAt('dayGridMonth', Temporal.PlainDate.from('2026-12-10'))!.title]).toEqual(['dayGrid', 'December 2026']);
    expect([k.getState().title, k.viewModel() === shown, k.modelAt('nope', Temporal.PlainDate.from('2026-10-25'))]).toEqual(['Oct 18\u2009–\u200924, 2026', true, null]);
  });
});

describe('modelAt after the 16b review: the view as shown, and the caps paper lifts', () => {
  it('weekends hidden: the week has five columns there too; `over` lifts the month’s cap, the shown one keeps it', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, start: '2026-10-21', allDay: true }));
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now, events: many, hiddenDays: [6, 7], dayGrid: { maxLanes: 2 } } as never);
    const week = k.modelAt('timeGridWeek', Temporal.PlainDate.from('2026-10-21'))!.model as TimeGridModel;
    expect(week.columns.map((c) => c.date.day)).toEqual([19, 20, 21, 22, 23]);
    const capped = k.modelAt('dayGridMonth', Temporal.PlainDate.from('2026-10-21'))!.model as { maxLanes: number | null };
    const lifted = k.modelAt('dayGridMonth', Temporal.PlainDate.from('2026-10-21'), { dayGrid: { maxLanes: null } })!.model as { maxLanes: number | null };
    expect([capped.maxLanes, lifted.maxLanes, k.getOptions().dayGrid?.maxLanes]).toEqual([2, null, 2]);
  });
});

describe('titleFormat (18f-3)', () => {
  const at = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
  it('a function is given the first and last days shown; options write a range; one that throws leaves the default', async () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, initialView: 'timeGridWeek', titleFormat: (t) => `${t.start}/${t.end}/${t.view}` });
    const fn = k.getState().title;
    k.setTitleFormat({ day: 'numeric', month: 'numeric' });
    const opts = k.getState().title;
    k.setTitleFormat(null);
    const byDefault = k.getState().title;
    const seen: unknown[] = [];
    const on = (e: unknown) => void seen.push(e);
    process.on('unhandledRejection', on as never);
    k.setTitleFormat(() => {
      throw new Error('app bug');
    });
    const kept = k.getState().title;
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', on as never);
    // Monday 19 to Sunday 25 October 2026; fr-FR writes day/month "19/10".
    expect([fn, opts.includes('19/10'), opts.includes('25/10'), kept === byDefault, seen.length]).toEqual(['2026-10-19/2026-10-25/timeGridWeek', true, true, true, 1]);
  });
});

describe('visibleRange and views by settings (18f-3)', () => {
  const at = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
  const congress = { start: Temporal.PlainDate.from('2026-11-03'), end: Temporal.PlainDate.from('2026-11-13') };
  it('a congress, 3 to 12 November 2026: ten days whatever the date; previous, next and today stay on it', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, initialView: 'congres', views: { congres: { family: 'timeGrid', visibleRange: congress } } });
    const r = () => k.getState().range;
    const first = [String(r().start), String(r().end), r().dates.length, k.getState().view.type];
    k.navigate('next');
    k.navigate('today');
    k.navigate('prev');
    expect([...first, String(r().start), String(r().end)]).toEqual(['2026-11-03', '2026-11-13', 10, 'congres', '2026-11-03', '2026-11-13']);
  });

  it('in a day grid its rows are whole weeks: Monday 2 to Sunday 8, Monday 9 to Sunday 15; the period itself 3 to 12', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, initialView: 'c', views: { c: { family: 'dayGrid', visibleRange: congress } } });
    const r = k.getState().range;
    expect([r.weeks.map((w) => `${w[0]}..${w[w.length - 1]}`), String(r.activeStart), String(r.activeEnd)]).toEqual([['2026-11-02..2026-11-08', '2026-11-09..2026-11-15'], '2026-11-03', '2026-11-13']);
  });

  it('a range that ends before it starts is refused', () => {
    expect(() => createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, initialView: 'c', views: { c: { family: 'timeGrid', visibleRange: { start: congress.end, end: congress.start } } } })).toThrow(RangeError);
  });

  it('settings are filled in: the type is the key, three days from the date given', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, initialView: 'trois', views: { trois: { family: 'timeGrid', duration: { days: 3 } } } });
    expect([k.getState().view.type, k.getState().range.dates.map(String)]).toEqual(['trois', ['2026-10-21', '2026-10-22', '2026-10-23']]);
  });
});

describe('after the 18f-3 review (kernel)', () => {
  const at = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
  it('a month title in options is the month, not the grid’s padding days (28 September – 8 November)', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, initialView: 'dayGridMonth', titleFormat: { month: 'long', year: 'numeric' } });
    const seen: string[] = [];
    k.setTitleFormat((t) => (seen.push(`${t.start}..${t.end}`), 'x'));
    expect([seen[0]]).toEqual(['2026-10-01..2026-10-31']);
    k.setTitleFormat({ month: 'long', year: 'numeric' });
    expect(k.getState().title).toBe('octobre 2026');
  });

  it('a day grid of two months shows both: 28 September to 6 December, aligned on the weeks', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, initialView: 'deux', views: { deux: { family: 'dayGrid', duration: { months: 2 }, alignment: 'month' } } });
    const r = k.getState().range;
    expect([String(r.start), String(r.end), String(r.activeStart), String(r.activeEnd)]).toEqual(['2026-09-28', '2026-12-07', '2026-10-01', '2026-12-01']);
  });

  it('a view that cannot be made is refused whole: the kernel stays on the one it showed', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, initialView: 'timeGridWeek', views: { weekend: { family: 'timeGrid', visibleRange: { start: Temporal.PlainDate.from('2026-10-24'), end: Temporal.PlainDate.from('2026-10-26') } } } });
    k.setView('weekend');
    // Saturday 24 and Sunday 25 hidden: the fixed period has no day left.
    expect(() => k.setOptions({ hiddenDays: [6, 7] })).toThrow(RangeError);
    k.navigate('next');
    expect([k.getState().view.type, String(k.getState().range.start), k.getOptions().hiddenDays ?? []]).toEqual(['weekend', '2026-10-24', []]);
  });

  it('bad settings are refused when the kernel is made: a day count of 0, a duration of nothing, a range of strings', () => {
    const make = (v: object) => () => createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, views: { v: { family: 'timeGrid', ...v } as never } });
    expect([make({ dayCount: 0 }), make({ duration: { days: 0 } }), make({ visibleRange: { start: '2026-11-03', end: '2026-11-13' } })].map((f) => { try { f(); return 'made'; } catch (e) { return e instanceof RangeError ? 'refused' : 'threw'; } })).toEqual(['refused', 'refused', 'refused']);
  });

  it('a setting left undefined (a framework’s unset input) keeps the default', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now: at, initialView: 'v', views: { v: { family: 'timeGrid', duration: { days: 2 }, hiddenDays: undefined } as never } });
    expect(k.getState().range.dates.length).toBe(2);
  });
});
