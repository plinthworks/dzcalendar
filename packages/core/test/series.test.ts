import { describe, it, expect } from 'vitest';
import { Temporal, createEventStore, createHistory, createIdGenerator, normalizeEvent, normalizeMany, viewWindow, arraySource, loadStaticSource } from '../src/index.js';
import type { CommandContext, EventInput, NormalizeContext, Series, StoreChange } from '../src/index.js';

const nctx = (): NormalizeContext => ({ displayZone: 'Europe/Paris', newId: createIdGenerator('s') });
const cctx = (): CommandContext => ({ normalize: nctx() });
const d = (s: string) => Temporal.PlainDate.from(s);
const week = (from: string, to: string, zone = 'Europe/Paris') => viewWindow(d(from), d(to), zone);

const series = (input: EventInput): Series => {
  const r = normalizeEvent(input, nctx());
  if (!r.ok || r.value.kind !== 'series') throw new Error(JSON.stringify(r.ok ? r.value.kind : r.problems));
  return r.value.series;
};

const storeWith = (...inputs: EventInput[]) => {
  const store = createEventStore();
  store.apply(inputs.map((i) => ({ kind: 'series' as const, after: series(i) })), 'api');
  return store;
};

const starts = (xs: { event: { start: { toString(): string } } }[]) => xs.map((x) => x.event.start.toString());

describe('normalize: an event with a rule is a series', () => {
  it('keeps the first occurrence as its base and the rules as given', () => {
    const s = series({ id: 'standup', title: 'Standup', start: '2026-10-19T09:00[Europe/Paris]', end: '2026-10-19T09:15[Europe/Paris]', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' });
    expect([s.id, s.base.title, s.set.rules.length, String(s.base.start)]).toEqual(['standup', 'Standup', 1, '2026-10-19T09:00:00+02:00[Europe/Paris]']);
  });

  it('reads EXDATE as a date or a moment, RDATE in the series zone', () => {
    const s = series({ id: 'x', start: '2026-10-19T09:00[America/Chicago]', rrule: 'FREQ=DAILY', exdate: ['2026-10-20', '2026-10-21T09:00'], rdate: ['2026-10-25T18:00'] });
    expect(s.set.exdates.map(String)).toEqual(['2026-10-20', '2026-10-21T14:00:00Z']);
    expect(s.set.rdates.map(String)).toEqual(['2026-10-25T18:00:00-05:00[America/Chicago]']);
  });
});

describe('queryInstances expands series in the window only', () => {
  it('a weekly rule: occurrences keyed seriesId@originalStart, same objects on the next query', () => {
    const store = storeWith({ id: 'standup', start: '2026-10-19T09:00[Europe/Paris]', end: '2026-10-19T09:15[Europe/Paris]', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' });
    const w = week('2026-10-26', '2026-11-02');
    const a = store.snapshot.queryInstances(w);
    expect(a.map((x) => [x.key, x.origin])).toEqual([
      ['standup@2026-10-26T09:00:00+01:00[Europe/Paris]', 'occurrence'],
      ['standup@2026-10-28T09:00:00+01:00[Europe/Paris]', 'occurrence'],
    ]);
    expect(a[0]!.event.ref).toEqual({ seriesId: 'standup', key: '2026-10-26T09:00:00+01:00[Europe/Paris]' });
    const b = store.snapshot.queryInstances(w);
    expect(b[0]!.event).toBe(a[0]!.event);
  });

  it('09:00 in Paris stays 09:00 on the wall across the clock change (FC#6729)', () => {
    const store = storeWith({ id: 'w', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY' });
    const got = store.snapshot.queryInstances(week('2026-10-24', '2026-10-27'));
    expect(starts(got)).toEqual(['2026-10-24T09:00:00+02:00[Europe/Paris]', '2026-10-25T09:00:00+01:00[Europe/Paris]', '2026-10-26T09:00:00+01:00[Europe/Paris]']);
  });

  it('an occurrence that began before the window and runs into it is shown', () => {
    const store = storeWith({ id: 'night', start: '2026-10-19T22:00[Europe/Paris]', end: '2026-10-20T06:00[Europe/Paris]', rrule: 'FREQ=WEEKLY' });
    const got = store.snapshot.queryInstances(week('2026-10-27', '2026-10-28'));
    expect(starts(got)).toEqual(['2026-10-26T22:00:00+01:00[Europe/Paris]']);
  });

  it('an endless rule is found centuries later; a finished one is not', () => {
    const store = storeWith(
      { id: 'forever', start: '2026-01-05T09:00[Europe/Paris]', rrule: 'FREQ=WEEKLY' },
      { id: 'done', start: '2026-01-05T10:00[Europe/Paris]', rrule: 'FREQ=WEEKLY;COUNT=3' },
    );
    expect(store.snapshot.queryInstances(week('2226-01-01', '2226-01-08')).map((x) => x.event.ref!.seriesId)).toEqual(['forever']);
  });

  it('all-day series: dates, a multi-day occurrence reaching into the window', () => {
    const store = storeWith({ id: 'trip', start: '2026-10-01', end: '2026-10-04', rrule: 'FREQ=MONTHLY' });
    const got = store.snapshot.queryInstances(week('2026-11-03', '2026-11-04'));
    expect(got.map((x) => `${x.event.start}/${x.event.end}`)).toEqual(['2026-11-01/2026-11-04']);
  });

  it('EXDATE as a date removes that day of a timed series (FC#6105)', () => {
    const store = storeWith({ id: 'x', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=3', exdate: ['2026-10-20'] });
    expect(starts(store.snapshot.queryInstances(week('2026-10-19', '2026-10-26')))).toEqual(['2026-10-19T09:00:00+02:00[Europe/Paris]', '2026-10-21T09:00:00+02:00[Europe/Paris]']);
  });

  it('resource filter and display: none apply to series too', () => {
    const store = storeWith(
      { id: 'a', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY', resourceIds: ['room1'] },
      { id: 'hidden', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY', display: 'none' },
    );
    const w = week('2026-10-19', '2026-10-20');
    expect(store.snapshot.queryInstances(w, { resourceId: 'room1' }).map((x) => x.event.ref!.seriesId)).toEqual(['a']);
    expect(store.snapshot.queryInstances(w, { resourceId: 'room2' })).toEqual([]);
    expect(store.snapshot.queryInstances(w).map((x) => x.event.ref!.seriesId)).toEqual(['a']);
  });

  it('ids are escaped in keys: an id with @ or | cannot pass for another', () => {
    const store = storeWith({ id: 'a@b|c', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=1' });
    expect(store.snapshot.queryInstances(week('2026-10-19', '2026-10-20'))[0]!.key).toBe('a%40b%7Cc@2026-10-19T09:00:00+02:00[Europe/Paris]');
  });
});

describe('store, commands and history', () => {
  it('seriesTouched reports the series; the version moves; equal series keep their object', () => {
    const store = createEventStore();
    const changes: StoreChange[] = [];
    store.subscribe((c) => changes.push(c));
    const s = series({ id: 'x', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY' });
    store.apply([{ kind: 'series', after: s }], 'api');
    const stored = store.snapshot.getSeries('x')!;
    expect([changes.length, changes[0]!.seriesTouched, stored.revision]).toEqual([1, ['x'], 1]);
    store.apply([{ kind: 'series', before: stored, after: series({ id: 'x', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY' }) }], 'api');
    expect([changes.length, store.snapshot.getSeries('x')]).toEqual([1, stored]);
  });

  it('create with a rule, delete the series, undo brings every occurrence back', () => {
    const store = createEventStore();
    const h = createHistory(store, cctx());
    expect(h.run({ type: 'event.create', event: { id: 's', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY' } }).ok).toBe(true);
    const w = week('2026-10-19', '2026-10-22');
    expect(store.snapshot.queryInstances(w)).toHaveLength(3);
    h.run({ type: 'series.delete', id: 's' });
    expect(store.snapshot.queryInstances(w)).toHaveLength(0);
    h.undo();
    expect(store.snapshot.queryInstances(w)).toHaveLength(3);
    expect(h.run({ type: 'event.create', event: { id: 's', start: '2026-10-19' } }).problems.map((p) => p.code)).toContain('duplicate-id');
  });

  it('a source delivers series and takes them back', () => {
    const store = createEventStore();
    const src = arraySource('feed', [{ id: 'r', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=WEEKLY' }]);
    loadStaticSource(store, src, nctx());
    expect([store.snapshot.counts.series, store.snapshot.getSeries('r')?.sourceId]).toEqual([1, 'feed']);
    const items = normalizeMany([], nctx(), 'feed').items;
    store.replaceSourceChunk('feed', '*', items);
    expect(store.snapshot.counts.series).toBe(0);
  });
});

describe('performance', () => {
  it('a year of a daily series expands quickly', () => {
    const store = storeWith({ id: 'd', start: '2026-01-01T09:00[Europe/Paris]', rrule: 'FREQ=DAILY' });
    const w = week('2026-01-01', '2027-01-01');
    store.snapshot.queryInstances(w);
    const fresh = storeWith({ id: 'd2', start: '2026-01-01T09:00[Europe/Paris]', rrule: 'FREQ=DAILY' });
    const t0 = performance.now();
    const got = fresh.snapshot.queryInstances(w);
    // Unminified polyfill under vitest; the 5 ms budget is held by `npm run bench` on the bundle.
    expect([got.length, performance.now() - t0 < 200]).toEqual([365, true]);
  });
});

describe('view models follow series changes', () => {
  it('time grid and day grid rebuild when a series is added', async () => {
    const { buildTimeGridModel, updateTimeGridModel, buildDayGridModel, updateDayGridModel, computeViewRange, BUILTIN_VIEWS } = await import('../src/index.js');
    const nav = { firstDay: 1 as const, today: d('2026-10-21') };
    const opts = { displayZone: 'Europe/Paris' };
    const store = createEventStore();
    const tg0 = buildTimeGridModel(computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.timeGridWeek!, nav), store.snapshot, opts);
    const dg0 = buildDayGridModel(computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.dayGridMonth!, nav), store.snapshot, opts);
    const change = store.apply([{ kind: 'series', after: series({ id: 's', start: '2026-01-05T09:00[Europe/Paris]', rrule: 'FREQ=DAILY' }) }], 'api');
    const tg1 = updateTimeGridModel(tg0, store.snapshot, change);
    const dg1 = updateDayGridModel(dg0, store.snapshot, change);
    expect(tg1.columns.map((c) => c.events.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(dg1.weeks.map((w) => w.bars.length)).toEqual(dg1.weeks.map(() => 7));
  });
});

describe('fixed after the architect review', () => {
  const w = (from: string, to: string) => week(from, to);

  it('a DTSTART on the second 02:30 is itself the first occurrence', () => {
    const store = storeWith({ id: 'x', start: '2026-10-25T02:30+01:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=2' });
    const got = store.snapshot.queryInstances(w('2026-10-25', '2026-10-27'));
    expect(starts(got)).toEqual(['2026-10-25T02:30:00+01:00[Europe/Paris]', '2026-10-26T02:30:00+01:00[Europe/Paris]']);
    expect(got[0]!.event.ref!.key).toBe(String(store.snapshot.getSeries('x')!.base.start));
  });

  it('an all-day EXDATE given as a moment excludes the day it names, not the UTC day', () => {
    const store = storeWith({ id: 'x', start: '2026-03-09', rrule: 'FREQ=DAILY;COUNT=3', exdate: ['2026-03-10T00:00+01:00[Europe/Paris]'] });
    expect(store.snapshot.queryInstances(w('2026-03-09', '2026-03-12')).map((x) => String(x.event.start))).toEqual(['2026-03-09', '2026-03-11']);
  });

  // 13 real hours (10:00Z → 23:00Z). After Paris falls back, leaving at 12:00 (11:00Z) lands at 00:00Z: 09:00 in Tokyo.
  it('an occurrence keeps the end zone of the series (a Paris → Tokyo flight)', () => {
    const store = storeWith({ id: 'f', start: '2026-10-19T12:00[Europe/Paris]', end: '2026-10-20T08:00[Asia/Tokyo]', rrule: 'FREQ=WEEKLY' });
    const occ = store.snapshot.queryInstances(w('2026-10-26', '2026-10-27'))[0]!.event;
    expect([String(occ.start), String(occ.end)]).toEqual(['2026-10-26T12:00:00+01:00[Europe/Paris]', '2026-10-27T09:00:00+09:00[Asia/Tokyo]']);
  });

  it('a one-day timed occurrence over the 25-hour day still reaches the next window', () => {
    const store = storeWith({ id: 'x', start: '2026-10-19T00:30[Europe/Paris]', end: '2026-10-20T00:30[Europe/Paris]', rrule: 'FREQ=DAILY' });
    expect(starts(store.snapshot.queryInstances(w('2026-10-26', '2026-10-27')))).toEqual(['2026-10-25T00:30:00+02:00[Europe/Paris]', '2026-10-26T00:30:00+01:00[Europe/Paris]']);
  });

  it('an RDATE before DTSTART is found', () => {
    const store = storeWith({ id: 'x', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=WEEKLY;COUNT=2', rdate: ['2026-10-12T09:00'] });
    expect(starts(store.snapshot.queryInstances(w('2026-10-12', '2026-10-13')))).toEqual(['2026-10-12T09:00:00+02:00[Europe/Paris]']);
  });

  it('too-many-occurrences reaches whoever asks', () => {
    const store = storeWith({ id: 'x', start: '2026-10-19T00:00[Europe/Paris]', rrule: 'FREQ=MINUTELY' });
    const seen: string[] = [];
    const got = store.snapshot.queryInstances(w('2026-10-19', '2026-10-26'), { onProblem: (p) => seen.push(p.code) });
    expect([got.length, seen]).toEqual([2000, ['too-many-occurrences']]);
  });

  it('no input stalls the store: an enormous COUNT, a sub-daily rule that never happens', () => {
    const t0 = performance.now();
    const store = storeWith(
      { id: 'a', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=SECONDLY;COUNT=999999999' },
      { id: 'b', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=999999' },
      { id: 'c', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=MINUTELY;BYMONTH=2;BYMONTHDAY=30' },
    );
    store.snapshot.queryInstances(w('2030-01-01', '2030-01-02'), { onProblem: () => {} });
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it('update or delete of a series or an occurrence id says which it is', async () => {
    const { applyCommand, occurrenceKey, parseInstanceKey } = await import('../src/index.js');
    const store = storeWith({ id: 's|1', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY' });
    const occ = occurrenceKey('s|1', '2026-10-19T09:00:00+02:00[Europe/Paris]');
    const code = (id: string) => {
      const r = applyCommand(store.snapshot, { type: 'event.delete', id }, cctx());
      return r.problems.map((p) => p.code);
    };
    expect([code('s|1'), code(occ), code('nope')]).toEqual([['is-series'], ['is-occurrence'], ['unknown-event']]);
    expect(code(occ)).toContain('is-occurrence');
    expect(parseInstanceKey(occ)).toEqual({ seriesId: 's|1', key: '2026-10-19T09:00:00+02:00[Europe/Paris]' });
    expect(parseInstanceKey('a%40b')).toEqual({ eventId: 'a@b' });
  });
});

describe('fixed after the code review', () => {
  it('a source may not bring a series whose id is an event’s (or the reverse)', () => {
    const store = createEventStore();
    const r = normalizeEvent({ id: 'x', start: '2026-10-19' }, nctx());
    if (!r.ok || r.value.kind !== 'event') throw new Error('event');
    store.apply([{ kind: 'event', after: r.value.event }], 'api');
    const change = store.replaceSourceChunk('feed', '*', normalizeMany([{ id: 'x', start: '2026-10-19', rrule: 'FREQ=DAILY' }], nctx(), 'feed').items);
    expect([change.problems.map((p) => p.code), store.snapshot.counts.series]).toEqual([['duplicate-id'], 0]);
  });
});
