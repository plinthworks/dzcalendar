import { describe, it, expect } from 'vitest';
import { BUILTIN_VIEWS, Temporal, computeViewRange, createEventStore, createIdGenerator, normalizeMany } from '../src/index.js';
import type { EventInput, ViewSpec } from '../src/index.js';
import { buildListModel } from '../src/views.js';
import type { ListModel } from '../src/views.js';

// Expectations from the zones' published rules (Paris falls back on 25 Oct 2026 at
// 03:00 → 02:00; Lord Howe springs from 02:00 to 02:30 on 4 Oct 2026; Apia skipped
// 30 Dec 2011), never from this code's output.

const d = (s: string) => Temporal.PlainDate.from(s);
const nav = { firstDay: 1 as const, today: d('2026-10-21') };

function model(zone: string, events: EventInput[], view: string, at: string, opts: { includeEmpty?: boolean; spec?: Partial<ViewSpec> } = {}): ListModel {
  const store = createEventStore();
  store.replaceSourceChunk('t', '*', normalizeMany(events, { displayZone: zone, newId: createIdGenerator('x') }, 't').items);
  const spec = { ...BUILTIN_VIEWS[view]!, ...opts.spec };
  return buildListModel(computeViewRange(d(at), spec, nav), store.snapshot, { displayZone: zone, ...(opts.includeEmpty && { includeEmpty: true }) });
}
const rows = (m: ListModel) =>
  m.days.map((day) => [String(day.date), day.entries.map((e) => `${e.instance.event.id}${e.allDay ? ' all-day' : ` ${e.start!.toString().slice(11, 22)}–${e.end!.toString().slice(11, 22)}`}${e.startsHere ? '' : ' <'}${e.endsHere ? '' : ' >'}`)]);

describe('buildListModel', () => {
  it('the 25-hour Sunday in Paris: both 02:30s, in the order they happen', () => {
    const m = model(
      'Europe/Paris',
      [
        { id: 'second', start: '2026-10-25T02:30:00+01:00[Europe/Paris]', duration: { minutes: 15 } },
        { id: 'first', start: '2026-10-25T02:30:00+02:00[Europe/Paris]', duration: { minutes: 15 } },
      ],
      'listDay',
      '2026-10-25',
    );
    expect(m.days.map((x) => x.lengthMinutes)).toEqual([1500]);
    expect(rows(m)).toEqual([['2026-10-25', ['first 02:30:00+02–02:45:00+02', 'second 02:30:00+01–02:45:00+01']]]);
  });

  it('Lord Howe’s spring day is 23 h 30', () => {
    const m = model('Australia/Lord_Howe', [{ id: 'a', start: '2026-10-04T09:00[Australia/Lord_Howe]' }], 'listDay', '2026-10-04');
    expect(m.days[0]!.lengthMinutes).toBe(1410);
  });

  it('Apia, December 2011: the 30th does not exist, an event over it shows on the 29th and the 31st', () => {
    // 29 Dec 23:00 at −10:00 plus two hours is 31 Dec 01:00 at +14:00.
    const m = model('Pacific/Apia', [{ id: 'jump', start: '2011-12-29T23:00[Pacific/Apia]', duration: { hours: 2 } }], 'listWeek', '2011-12-28');
    expect(rows(m)).toEqual([
      ['2011-12-29', ['jump 23:00:00-10–00:00:00+14 >']],
      ['2011-12-31', ['jump 00:00:00+14–01:00:00+14 <']],
    ]);
  });

  it('a night over midnight is two entries; an end at midnight does not touch the next day', () => {
    const m = model(
      'Europe/Paris',
      [
        { id: 'night', start: '2026-10-20T22:00[Europe/Paris]', end: '2026-10-21T02:00[Europe/Paris]' },
        { id: 'late', start: '2026-10-20T23:00[Europe/Paris]', end: '2026-10-21T00:00[Europe/Paris]' },
      ],
      'listWeek',
      '2026-10-20',
    );
    expect(rows(m)).toEqual([
      ['2026-10-20', ['night 22:00:00+02–00:00:00+02 >', 'late 23:00:00+02–00:00:00+02']],
      ['2026-10-21', ['night 00:00:00+02–02:00:00+02 <']],
    ]);
  });

  it('all-day first; a multi-day event on each of its days; a timed event covering a day counts as all-day there', () => {
    const m = model(
      'Europe/Paris',
      [
        { id: 'trip', start: '2026-10-19', end: '2026-10-22' },
        { id: 'early', start: '2026-10-20T08:00[Europe/Paris]' },
        { id: 'long', start: '2026-10-20T00:00[Europe/Paris]', end: '2026-10-22T00:00[Europe/Paris]' },
      ],
      'listWeek',
      '2026-10-19',
    );
    expect(rows(m)).toEqual([
      ['2026-10-19', ['trip all-day >']],
      ['2026-10-20', ['trip all-day < >', 'long all-day >', 'early 08:00:00+02–09:00:00+02']],
      ['2026-10-21', ['trip all-day <', 'long all-day <']],
    ]);
  });

  it('same start: longer first, then by title', () => {
    const m = model(
      'UTC',
      [
        { id: 'b', title: 'Beta', start: '2026-10-20T09:00Z[UTC]', duration: { minutes: 30 } },
        { id: 'a', title: 'Alpha', start: '2026-10-20T09:00Z[UTC]', duration: { minutes: 30 } },
        { id: 'c', title: 'Zed', start: '2026-10-20T09:00Z[UTC]', duration: { hours: 2 } },
      ],
      'listDay',
      '2026-10-20',
    );
    expect(m.days[0]!.entries.map((e) => e.instance.event.id)).toEqual(['c', 'a', 'b']);
  });

  it('background events are not listed; a zero-length event is', () => {
    const m = model(
      'Europe/Paris',
      [
        { id: 'bg', start: '2026-10-20T08:00[Europe/Paris]', display: 'background' },
        { id: 'pin', start: '2026-10-20T10:00[Europe/Paris]', end: '2026-10-20T10:00[Europe/Paris]' },
      ],
      'listDay',
      '2026-10-20',
    );
    expect(rows(m)).toEqual([['2026-10-20', ['pin 10:00:00+02–10:00:00+02']]]);
  });

  it('listYear covers the year; only days with events unless includeEmpty', () => {
    const events: EventInput[] = [
      { id: 'jan', start: '2026-01-02T09:00[Europe/Paris]' },
      { id: 'dec', start: '2026-12-31T09:00[Europe/Paris]' },
    ];
    expect(model('Europe/Paris', events, 'listYear', '2026-06-15').days.map((x) => String(x.date))).toEqual(['2026-01-02', '2026-12-31']);
    expect(model('Europe/Paris', events, 'listYear', '2026-06-15', { includeEmpty: true }).days).toHaveLength(365);
    // Hidden days are not days of the list.
    const weekdays = model('Europe/Paris', [], 'listWeek', '2026-10-20', { includeEmpty: true, spec: { hiddenDays: [6, 7] } });
    expect(weekdays.days.map((x) => String(x.date))).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
  });

  it('listMonth is the month, nothing of its neighbours', () => {
    const m = model(
      'Europe/Paris',
      [
        { id: 'sep', start: '2026-09-30T09:00[Europe/Paris]' },
        { id: 'oct', start: '2026-10-01T09:00[Europe/Paris]' },
        { id: 'nov', start: '2026-11-01T09:00[Europe/Paris]' },
      ],
      'listMonth',
      '2026-10-15',
    );
    expect(m.days.map((x) => x.entries.map((e) => e.instance.event.id)).flat()).toEqual(['oct']);
  });
});
