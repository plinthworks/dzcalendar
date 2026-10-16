import { describe, it, expect } from 'vitest';
import {
  Temporal,
  applyCommand,
  createEventStore,
  createHistory,
  createIdGenerator,
  normalizeMany,
  parseRRule,
  rebaseRule,
  serializeRRule,
  viewWindow,
} from '../src/index.js';
import type { Command, CommandContext, EventStore, StoreChange, StoreSnapshot } from '../src/index.js';

const P = '[Europe/Paris]';
const ctx = (extra: Partial<CommandContext> = {}): CommandContext => ({ normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('n') }, ...extra });
const d = (s: string) => Temporal.PlainDate.from(s);
const win = (from: string, to: string) => viewWindow(d(from), d(to), 'Europe/Paris');

/** Six Mondays at 09:00–10:00 Paris from 5 October 2026: 5, 12, 19, 26 October (after the clocks change), 2, 9 November. */
function weekly(rrule = 'FREQ=WEEKLY;COUNT=6', extra: Record<string, unknown> = {}) {
  const store = createEventStore();
  const c = ctx();
  const h = createHistory(store, c);
  const r = h.run({ type: 'event.create', event: { id: 'w', title: 'Weekly', start: `2026-10-05T09:00${P}`, end: `2026-10-05T10:00${P}`, rrule, ...extra } });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return { store, h, c };
}

const K = (date: string, off = '+02:00') => `${date}T09:00:00${off}${P}`;
const shownIn = (store: EventStore, from: string, to: string) =>
  store.snapshot.queryInstances(win(from, to)).map((i) => `${i.origin}:${i.event.title}:${i.event.start}`);
/** The original series and the one cut from it. */
const split = (store: EventStore) => {
  const xs = [...store.snapshot.allSeries()];
  return [xs.find((s) => s.id === 'w')!, xs.find((s) => s.id !== 'w')!] as const;
};
const all = (store: EventStore) => shownIn(store, '2026-09-28', '2026-12-31');
/** Everything in the store, as strings (Temporal objects cannot be compared with toEqual). */
const dump = (snap: StoreSnapshot) => [
  ...[...snap.allEvents()].map((e) => `E ${e.id} ${e.title} ${e.start} ${e.end} ${e.ref ? `${e.ref.seriesId}@${e.ref.key}` : ''}`),
  ...[...snap.allSeries()].map((s) => `S ${s.id} ${s.base.start} ${s.set.rules.map(serializeRRule).join('|')} ex:${s.set.exdates.join(',')} ov:${[...s.overrides].join(',')} ${s.splitFrom ? `from:${s.splitFrom.seriesId}@${s.splitFrom.at}` : ''}`),
];

describe('this', () => {
  it('moves one occurrence; the override is found at its new place, even in another week', () => {
    const { store, h } = weekly();
    const r = h.run({ type: 'event.move', id: 'w', key: K('2026-10-19'), scope: 'this', start: `2026-10-28T14:00${P}` });
    expect(r.ok).toBe(true);
    expect(shownIn(store, '2026-10-19', '2026-10-26')).toEqual([]);
    expect(shownIn(store, '2026-10-26', '2026-11-02')).toEqual([
      `occurrence:Weekly:2026-10-26T09:00:00+01:00${P}`,
      `override:Weekly:2026-10-28T14:00:00+01:00${P}`,
    ]);
    const ov = store.snapshot.queryInstances(win('2026-10-28', '2026-10-29'))[0]!.event;
    expect([String(ov.end), ov.ref]).toEqual([`2026-10-28T15:00:00+01:00${P}`, { seriesId: 'w', key: K('2026-10-19') }]);
  });

  it('an occurrence key as id means "this"; editing it again edits the override, no second one', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.update', id: `w@${K('2026-10-12')}`, patch: { title: 'Moved' } });
    h.run({ type: 'event.update', id: `w@${K('2026-10-12')}`, patch: { title: 'Renamed' } });
    const sr = store.snapshot.getSeries('w')!;
    expect([sr.overrides.size, store.snapshot.counts.events]).toEqual([1, 1]);
    expect(shownIn(store, '2026-10-12', '2026-10-13')).toEqual([`override:Renamed:${K('2026-10-12')}`]);
  });

  it('deleting one occurrence is an EXDATE; COUNT still counts it', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.delete', id: 'w', key: K('2026-10-12'), scope: 'this' });
    expect(all(store)).toHaveLength(5);
    expect(store.snapshot.getSeries('w')!.set.exdates.map(String)).toEqual(['2026-10-12T07:00:00Z']);
  });

  it('deleting an override deletes the occurrence: event gone, EXDATE added', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.update', id: 'w', key: K('2026-10-12'), scope: 'this', patch: { title: 'x' } });
    const ovId = store.snapshot.getSeries('w')!.overrides.get(K('2026-10-12'))!;
    h.run({ type: 'event.delete', id: ovId });
    expect([store.snapshot.counts.events, store.snapshot.getSeries('w')!.overrides.size, all(store).length]).toEqual([0, 0, 5]);
  });

  it('a key that is not an occurrence is refused', () => {
    const { store, c } = weekly();
    const r = applyCommand(store.snapshot, { type: 'event.update', id: 'w', key: K('2026-10-13'), scope: 'this', patch: { title: 'x' } }, c);
    expect(r.problems.map((p) => p.code)).toContain('unknown-occurrence');
  });

  it('an override changes only its own place: the series is not touched, the other occurrences are the same objects', () => {
    const { store, h } = weekly();
    const before = store.snapshot.queryInstances(win('2026-11-02', '2026-11-03'))[0]!.event;
    const changes: StoreChange[] = [];
    store.subscribe((ch) => changes.push(ch));
    h.run({ type: 'event.update', id: 'w', key: K('2026-10-12'), scope: 'this', patch: { title: 'x' } });
    expect([changes[0]!.seriesTouched, changes[0]!.seriesChanged, changes[0]!.dirtySpans.length > 0]).toEqual([[], ['w'], true]);
    expect(store.snapshot.queryInstances(win('2026-11-02', '2026-11-03'))[0]!.event).toBe(before);
  });
});

describe('all', () => {
  it('moving one occurrence a day later and an hour later moves them all, COUNT kept, wall time across the clock change', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.move', id: 'w', key: K('2026-10-19'), scope: 'all', start: `2026-10-20T10:00${P}` });
    expect(all(store)).toEqual([
      `occurrence:Weekly:2026-10-06T10:00:00+02:00${P}`,
      `occurrence:Weekly:2026-10-13T10:00:00+02:00${P}`,
      `occurrence:Weekly:2026-10-20T10:00:00+02:00${P}`,
      `occurrence:Weekly:2026-10-27T10:00:00+01:00${P}`,
      `occurrence:Weekly:2026-11-03T10:00:00+01:00${P}`,
      `occurrence:Weekly:2026-11-10T10:00:00+01:00${P}`,
    ]);
  });

  it('a weekly Monday/Wednesday rule moved from a Monday to a Tuesday becomes Tuesday/Thursday', () => {
    const { store, h } = weekly('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4');
    h.run({ type: 'event.move', id: 'w', key: K('2026-10-05'), scope: 'all', start: `2026-10-06T09:00${P}` });
    expect(serializeRRule(store.snapshot.getSeries('w')!.set.rules[0]!)).toBe('FREQ=WEEKLY;COUNT=4;BYDAY=TU,TH');
    expect(all(store).map((x) => /:(\d{4}-\d{2}-\d{2})T/.exec(x)![1])).toEqual(['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15']);
  });

  it('keys follow the series: an override and an EXDATE move with it', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.update', id: 'w', key: K('2026-10-12'), scope: 'this', patch: { title: 'Special' } });
    h.run({ type: 'event.delete', id: 'w', key: K('2026-11-02', '+01:00'), scope: 'this' });
    h.run({ type: 'event.move', id: 'w', key: K('2026-10-05'), scope: 'all', start: `2026-10-05T11:00${P}` });
    const sr = store.snapshot.getSeries('w')!;
    expect([...sr.overrides.keys()]).toEqual([`2026-10-12T11:00:00+02:00${P}`]);
    expect(sr.set.exdates.map(String)).toEqual(['2026-11-02T10:00:00Z']);
    const ov = store.snapshot.getEvent(sr.overrides.get(`2026-10-12T11:00:00+02:00${P}`)!)!;
    expect(ov.ref!.key).toBe(`2026-10-12T11:00:00+02:00${P}`);
    // The override keeps its own time (it was only renamed); the series moved around it.
    expect(all(store).filter((x) => x.includes('Special'))).toEqual([`override:Special:${K('2026-10-12')}`]);
    expect(all(store)).toHaveLength(5);
  });

  it('a title for all keeps every occurrence where it is', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.update', id: 'w', patch: { title: 'Renamed' } });
    expect(all(store).every((x) => x.includes(':Renamed:'))).toBe(true);
    expect(all(store)).toHaveLength(6);
  });

  it('switching every occurrence to all-day is refused (invalid-edit)', () => {
    const { store, c } = weekly();
    const r = applyCommand(store.snapshot, { type: 'event.update', id: 'w', scope: 'all', patch: { allDay: true } }, c);
    expect(r.problems.map((p) => p.code)).toContain('invalid-edit');
  });
});

describe('following', () => {
  it('splits with COUNT shared: three before, three after at the new time, splitFrom set', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.move', id: 'w', key: K('2026-10-26', '+01:00'), scope: 'following', start: `2026-10-26T11:00${P}` });
    expect(all(store)).toEqual([
      `occurrence:Weekly:${K('2026-10-05')}`,
      `occurrence:Weekly:${K('2026-10-12')}`,
      `occurrence:Weekly:${K('2026-10-19')}`,
      `occurrence:Weekly:2026-10-26T11:00:00+01:00${P}`,
      `occurrence:Weekly:2026-11-02T11:00:00+01:00${P}`,
      `occurrence:Weekly:2026-11-09T11:00:00+01:00${P}`,
    ]);
    const [a, b] = split(store);
    expect([a, b].map((s) => serializeRRule(s.set.rules[0]!))).toEqual(['FREQ=WEEKLY;COUNT=3', 'FREQ=WEEKLY;COUNT=3']);
    expect(b.splitFrom).toEqual({ seriesId: 'w', at: K('2026-10-26', '+01:00') });
  });

  it('with UNTIL: the first ends at the last start before the cut, the second keeps UNTIL', () => {
    const { store, h } = weekly('FREQ=WEEKLY;UNTIL=20261110T000000Z');
    h.run({ type: 'event.update', id: 'w', key: K('2026-10-19'), scope: 'following', patch: { title: 'Later' } });
    const [a, b] = split(store);
    expect([serializeRRule(a.set.rules[0]!), serializeRRule(b.set.rules[0]!)]).toEqual(['FREQ=WEEKLY;UNTIL=20261012T070000Z', 'FREQ=WEEKLY;UNTIL=20261110T000000Z']);
    expect(all(store).map((x) => x.split(':')[1])).toEqual(['Weekly', 'Weekly', 'Later', 'Later', 'Later', 'Later']);
  });

  it('on the first occurrence it is "all"', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.update', id: 'w', key: K('2026-10-05'), scope: 'following', patch: { title: 'All' } });
    expect([store.snapshot.counts.series, all(store).every((x) => x.includes(':All:'))]).toEqual([1, true]);
  });

  it('EXDATEs and overrides after the cut go to the new series, moved with it', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.delete', id: 'w', key: K('2026-11-02', '+01:00'), scope: 'this' });
    h.run({ type: 'event.update', id: 'w', key: K('2026-11-09', '+01:00'), scope: 'this', patch: { title: 'Last' } });
    h.run({ type: 'event.move', id: 'w', key: K('2026-10-26', '+01:00'), scope: 'following', start: `2026-10-26T11:00${P}` });
    const [a, b] = split(store);
    expect([a.set.exdates.length, a.overrides.size]).toEqual([0, 0]);
    expect(b.set.exdates.map(String)).toEqual(['2026-11-02T10:00:00Z']);
    expect([...b.overrides.keys()]).toEqual([`2026-11-09T11:00:00+01:00${P}`]);
    const ov = store.snapshot.getEvent(b.overrides.get(`2026-11-09T11:00:00+01:00${P}`)!)!;
    expect(ov.ref).toEqual({ seriesId: b.id, key: `2026-11-09T11:00:00+01:00${P}` });
    expect(all(store).map((x) => x.split(':')[1])).toEqual(['Weekly', 'Weekly', 'Weekly', 'Weekly', 'Last']);
  });

  it('undo restores both series exactly; redo cuts again', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.update', id: 'w', key: K('2026-11-09', '+01:00'), scope: 'this', patch: { title: 'Last' } });
    const before = dump(store.snapshot);
    h.run({ type: 'event.move', id: 'w', key: K('2026-10-26', '+01:00'), scope: 'following', start: `2026-10-26T11:00${P}` });
    const after = dump(store.snapshot);
    h.undo();
    expect(dump(store.snapshot)).toEqual(before);
    h.redo();
    expect(dump(store.snapshot)).toEqual(after);
  });

  it('deleting the following ends the series before the occurrence and drops later overrides', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.update', id: 'w', key: K('2026-11-09', '+01:00'), scope: 'this', patch: { title: 'Last' } });
    h.run({ type: 'event.delete', id: 'w', key: K('2026-10-26', '+01:00'), scope: 'following' });
    expect([all(store).length, store.snapshot.counts.events, serializeRRule(store.snapshot.getSeries('w')!.set.rules[0]!)]).toEqual([3, 0, 'FREQ=WEEKLY;COUNT=3']);
  });

  it('series.split without a patch: two series, the same occurrences', () => {
    const { store, h } = weekly();
    const shown = all(store);
    h.run({ type: 'series.split', id: 'w', at: K('2026-10-19') });
    expect([store.snapshot.counts.series, all(store)]).toEqual([2, shown]);
  });
});

describe('deleting a whole series takes its overrides with it', () => {
  it('series.delete and event.delete with scope all; undo brings everything back', () => {
    const { store, h } = weekly();
    h.run({ type: 'event.update', id: 'w', key: K('2026-10-12'), scope: 'this', patch: { title: 'x' } });
    const before = dump(store.snapshot);
    h.run({ type: 'event.delete', id: 'w', key: K('2026-10-19'), scope: 'all' });
    expect([store.snapshot.counts.events, store.snapshot.counts.series]).toEqual([0, 0]);
    h.undo();
    expect(dump(store.snapshot)).toEqual(before);
    h.run({ type: 'series.delete', id: 'w' });
    expect([store.snapshot.counts.events, store.snapshot.counts.series]).toEqual([0, 0]);
  });
});

describe('WKST (owner’s decision 2026-10-16)', () => {
  const create = (rrule: string, weekStart?: 1 | 7) => {
    const store = createEventStore();
    createHistory(store, ctx(weekStart === undefined ? {} : { weekStart })).run({ type: 'event.create', event: { id: 's', start: `2026-10-05T09:00${P}`, rrule } });
    return store.snapshot.getSeries('s')!.set.rules[0]!.wkst;
  };
  it('a series created here takes the locale’s first day; a rule that says WKST keeps it', () => {
    expect([create('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU', 7), create('FREQ=WEEKLY;WKST=MO', 7), create('FREQ=WEEKLY', 1)]).toEqual([7, 1, 1]);
  });
  it('a rule read from a source without WKST is Monday, whatever the locale', () => {
    const items = normalizeMany([{ id: 's', start: `2026-10-05T09:00${P}`, rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU' }], ctx().normalize, 'feed').items;
    expect(items[0]!.kind === 'series' && items[0]!.series.set.rules[0]!.wkst).toBe(1);
  });
});

describe('move, resize, and the rules', () => {
  const two = () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', title: 'A', start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` } });
    h.run({ type: 'event.create', event: { id: 'b', title: 'B', start: `2026-10-21T11:00${P}`, end: `2026-10-21T12:00${P}`, startEditable: false } });
    return store;
  };
  const run = (store: EventStore, cmd: Command, extra: Partial<CommandContext> = {}) => applyCommand(store.snapshot, cmd, ctx({ rules: { displayZone: 'Europe/Paris' }, ...extra }));

  it('move keeps the length; resize keeps the other edge', () => {
    const store = two();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.move', id: 'a', start: `2026-10-21T13:30${P}` });
    expect(String(store.snapshot.getEvent('a')!.end)).toBe(`2026-10-21T14:30:00+02:00${P}`);
    h.run({ type: 'event.resize', id: 'a', edge: 'start', to: `2026-10-21T13:00${P}` });
    expect([String(store.snapshot.getEvent('a')!.start), String(store.snapshot.getEvent('a')!.end)]).toEqual([`2026-10-21T13:00:00+02:00${P}`, `2026-10-21T14:30:00+02:00${P}`]);
  });

  it('overlap: false refuses a move onto another event', () => {
    const store = two();
    const r = run(store, { type: 'event.move', id: 'a', start: `2026-10-21T11:30${P}` }, { rules: { displayZone: 'Europe/Paris', overlap: false } });
    expect(r.ok === false && r.violations?.map((v) => [v.code, v.detail])).toEqual([['overlap', 'b']]);
  });

  it('not-editable: an event whose start may not move', () => {
    const store = two();
    const r = run(store, { type: 'event.move', id: 'b', start: `2026-10-21T15:00${P}` });
    expect(r.ok === false && r.violations?.map((v) => v.code)).toEqual(['not-editable']);
  });

  it('constraint: business hours', () => {
    const store = two();
    const rules = { displayZone: 'Europe/Paris', businessHours: { daysOfWeek: [1, 2, 3, 4, 5] as const, start: '09:00', end: '18:00' }, constraint: 'businessHours' as const };
    expect(run(store, { type: 'event.move', id: 'a', start: `2026-10-21T17:30${P}` }, { rules }).ok).toBe(false);
    expect(run(store, { type: 'event.move', id: 'a', start: `2026-10-21T16:30${P}` }, { rules }).ok).toBe(true);
  });

  it('allow has the last word', () => {
    const store = two();
    const r = run(store, { type: 'event.move', id: 'a', start: `2026-10-22T09:00${P}` }, { rules: { displayZone: 'Europe/Paris', allow: (p) => p.start.toString().startsWith('2026-10-21') } });
    expect(r.ok === false && r.violations?.map((v) => v.code)).toEqual(['allow']);
  });
});

describe('rebaseRule', () => {
  const r = (t: string) => {
    const x = parseRRule(t);
    if (!x.ok) throw new Error(t);
    return x.rule;
  };
  const z = (s: string) => Temporal.ZonedDateTime.from(s);
  it('weekly days shift with the start; monthly day, ordinal weekday and last day are recounted', () => {
    expect(serializeRRule(rebaseRule(r('FREQ=WEEKLY;BYDAY=MO,WE,FR'), z(K('2026-10-05')), z(K('2026-10-06'))))).toBe('FREQ=WEEKLY;BYDAY=TU,TH,SA');
    expect(serializeRRule(rebaseRule(r('FREQ=MONTHLY;BYMONTHDAY=10'), z(K('2026-10-10')), z(K('2026-10-12'))))).toBe('FREQ=MONTHLY;BYMONTHDAY=12');
    // 13 October 2026 is the second Tuesday; 15 October the third Thursday.
    expect(serializeRRule(rebaseRule(r('FREQ=MONTHLY;BYDAY=2TU'), z(K('2026-10-13')), z(K('2026-10-15'))))).toBe('FREQ=MONTHLY;BYDAY=3TH');
    // 30 October is the last Friday; moved to Thursday 29th, the last Thursday.
    expect(serializeRRule(rebaseRule(r('FREQ=MONTHLY;BYDAY=-1FR'), z(`2026-10-30T09:00:00+01:00${P}`), z(`2026-10-29T09:00:00+01:00${P}`)))).toBe('FREQ=MONTHLY;BYDAY=-1TH');
    expect(serializeRRule(rebaseRule(r('FREQ=DAILY;BYHOUR=9'), z(K('2026-10-05')), z(`2026-10-05T14:00:00+02:00${P}`)))).toBe('FREQ=DAILY;BYHOUR=14');
  });
});

describe('a source is the authority on its series', () => {
  it('a refetch drops local overrides and the part cut off by "following"', () => {
    const store = createEventStore();
    const c = ctx();
    const feed = () => normalizeMany([{ id: 'w', title: 'Weekly', start: `2026-10-05T09:00${P}`, end: `2026-10-05T10:00${P}`, rrule: 'FREQ=WEEKLY;COUNT=6' }], c.normalize, 'feed').items;
    store.replaceSourceChunk('feed', '*', feed());
    const h = createHistory(store, c);
    h.run({ type: 'event.update', id: 'w', key: K('2026-10-12'), scope: 'this', patch: { title: 'Local' } });
    h.run({ type: 'event.move', id: 'w', key: K('2026-10-26', '+01:00'), scope: 'following', start: `2026-10-26T11:00${P}` });
    expect([store.snapshot.counts.series, store.snapshot.counts.events]).toEqual([2, 1]);
    store.replaceSourceChunk('feed', '*', feed());
    expect([store.snapshot.counts.series, store.snapshot.counts.events, all(store).length]).toEqual([1, 0, 6]);
    expect(all(store).every((x) => x.includes(':Weekly:') && x.includes('T09:00'))).toBe(true);
  });
});

describe('fixed after the Phase 6 reviews (expectations by hand)', () => {
  const series = (event: Record<string, unknown>, c = ctx()) => {
    const store = createEventStore();
    const h = createHistory(store, c);
    const r = h.run({ type: 'event.create', event: { id: 'w', title: 'S', ...event } as never });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return { store, h };
  };
  const rule = (store: EventStore, id = 'w') => store.snapshot.getSeries(id)!.set.rules.map(serializeRRule).join(' + ');
  const dates = (store: EventStore, from = '2026-01-01', to = '2027-01-01') => store.snapshot.queryInstances(win(from, to)).map((i) => `${i.event.title}:${String(i.event.start).slice(0, 10)}`);

  it('following from an RDATE keeps the rule on its own weekday', () => {
    const { store, h } = series({ start: `2026-10-05T09:00${P}`, rrule: 'FREQ=WEEKLY;COUNT=5', rdate: ['2026-10-14T09:00'] });
    expect(h.run({ type: 'event.update', id: 'w', key: K('2026-10-14'), scope: 'following', patch: { title: 'X' } }).ok).toBe(true);
    expect(dates(store, '2026-10-01', '2026-11-30')).toEqual(['S:2026-10-05', 'S:2026-10-12', 'X:2026-10-14', 'X:2026-10-19', 'X:2026-10-26', 'X:2026-11-02']);
  });

  it('following that would break an INTERVAL rule’s phase is refused, nothing changes', () => {
    const { store, h } = series({ start: `2026-10-05T09:00${P}`, rrule: ['FREQ=WEEKLY;BYDAY=MO;COUNT=6', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;COUNT=4'] });
    const before = dump(store.snapshot);
    const r = h.run({ type: 'event.update', id: 'w', key: K('2026-10-12'), scope: 'following', patch: { title: 'X' } });
    expect([r.problems.map((p) => p.code), dump(store.snapshot)]).toEqual([['invalid-edit'], before]);
  });

  it('month days stay valid: 10th & 25th moved by 8 days → 18th & 2nd', () => {
    const { store, h } = series({ start: `2026-01-10T09:00${P}`, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10,25;COUNT=6' });
    h.run({ type: 'event.move', id: 'w', key: `2026-01-25T09:00:00+01:00${P}`, scope: 'all', start: '2026-02-02T09:00' });
    expect(rule(store)).toBe('FREQ=MONTHLY;COUNT=6;BYMONTHDAY=2,18');
    expect(dates(store)).toEqual(['S:2026-01-18', 'S:2026-02-02', 'S:2026-02-18', 'S:2026-03-02', 'S:2026-03-18', 'S:2026-04-02']);
  });

  it('the last day moved a day later is the first of the next month, never BYMONTHDAY=0', () => {
    const { store, h } = series({ start: `2026-01-01T09:00${P}`, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=4' });
    h.run({ type: 'event.move', id: 'w', key: `2026-01-01T09:00:00+01:00${P}`, scope: 'all', start: '2026-01-02T09:00' });
    expect(rule(store)).toBe('FREQ=MONTHLY;COUNT=4;BYMONTHDAY=1,2');
  });

  it('a year day: day 360 (26 December) moved to 2 January is day 2', () => {
    const { store, h } = series({ start: `2026-12-26T09:00${P}`, rrule: 'FREQ=YEARLY;BYYEARDAY=360;COUNT=2' });
    h.run({ type: 'event.move', id: 'w', key: `2026-12-26T09:00:00+01:00${P}`, scope: 'all', start: '2027-01-02T09:00' });
    expect(rule(store)).toBe('FREQ=YEARLY;COUNT=2;BYYEARDAY=2');
  });

  it('two ordinals stay two: first and third Monday moved a day → first and third Tuesday', () => {
    const { store, h } = series({ start: `2026-01-05T09:00${P}`, rrule: 'FREQ=MONTHLY;BYDAY=1MO,3MO;COUNT=6' });
    h.run({ type: 'event.move', id: 'w', key: `2026-01-05T09:00:00+01:00${P}`, scope: 'all', start: '2026-01-06T09:00' });
    expect(rule(store)).toBe('FREQ=MONTHLY;COUNT=6;BYDAY=1TU,3TU');
    expect(dates(store)).toEqual(['S:2026-01-06', 'S:2026-01-20', 'S:2026-02-03', 'S:2026-02-17', 'S:2026-03-03', 'S:2026-03-17']);
  });

  it('a yearly ordinal counts in the year: the 10th Monday (9 March) moved a day is the 10th Tuesday', () => {
    const { store, h } = series({ start: `2026-03-09T09:00${P}`, rrule: 'FREQ=YEARLY;BYDAY=10MO;COUNT=2' });
    h.run({ type: 'event.move', id: 'w', key: `2026-03-09T09:00:00+01:00${P}`, scope: 'all', start: '2026-03-10T09:00' });
    expect(rule(store)).toBe('FREQ=YEARLY;COUNT=2;BYDAY=10TU');
  });

  it('UNTIL moves with the series: four days stay four at 10:00', () => {
    const { store, h } = series({ start: `2026-10-05T09:00${P}`, rrule: 'FREQ=DAILY;UNTIL=20261008T070000Z' });
    h.run({ type: 'event.move', id: 'w', key: K('2026-10-06'), scope: 'all', start: '2026-10-06T10:00' });
    expect(store.snapshot.queryInstances(win('2026-10-01', '2026-10-31')).map((i) => String(i.event.start).slice(0, 16))).toEqual([
      '2026-10-05T10:00', '2026-10-06T10:00', '2026-10-07T10:00', '2026-10-08T10:00',
    ]);
  });

  it('an override keeps its position when the rule is recounted: no duplicate in April', () => {
    const { store, h } = series({ start: `2026-01-13T09:00${P}`, rrule: 'FREQ=MONTHLY;BYDAY=2TU;COUNT=6' });
    h.run({ type: 'event.update', id: 'w', key: `2026-04-14T09:00:00+02:00${P}`, scope: 'this', patch: { title: 'Apr' } });
    h.run({ type: 'event.move', id: 'w', key: `2026-01-13T09:00:00+01:00${P}`, scope: 'all', start: '2026-01-14T09:00' });
    expect(rule(store)).toBe('FREQ=MONTHLY;COUNT=6;BYDAY=2WE');
    expect(dates(store, '2026-04-01', '2026-05-01')).toEqual(['Apr:2026-04-14']);
    expect([...store.snapshot.getSeries('w')!.overrides.keys()]).toEqual([`2026-04-08T09:00:00+02:00${P}`]);
  });

  it('a series id without key works when the first start is excluded or off the rule', () => {
    const a = series({ start: `2026-10-05T09:00${P}`, rrule: 'FREQ=WEEKLY;COUNT=4' });
    a.h.run({ type: 'event.delete', id: 'w', key: K('2026-10-05'), scope: 'this' });
    expect(a.h.run({ type: 'event.update', id: 'w', patch: { title: 'New' } }).ok).toBe(true);
    expect(dates(a.store, '2026-10-01', '2026-11-30')).toEqual(['New:2026-10-12', 'New:2026-10-19', 'New:2026-10-26']);
    expect(a.h.run({ type: 'event.delete', id: 'w' }).ok).toBe(true);
    expect(a.store.snapshot.counts.series).toBe(0);
    const b = series({ start: `2026-10-06T09:00${P}`, rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3' });
    expect(b.h.run({ type: 'event.update', id: 'w', patch: { title: 'New' } }).ok).toBe(true);
    expect(dates(b.store, '2026-10-01', '2026-11-30')).toEqual(['New:2026-10-12', 'New:2026-10-19', 'New:2026-10-26']);
  });

  it('WKST is added after reading the rule: an RRULE: prefix, a trailing space', () => {
    const wk = (rrule: string) => {
      const { store } = series({ start: `2026-10-05T09:00${P}`, rrule }, ctx({ weekStart: 7 }));
      return store.snapshot.getSeries('w')!.set.rules[0]!.wkst;
    };
    expect([wk('RRULE:WKST=MO;FREQ=WEEKLY'), wk('FREQ=WEEKLY '), wk('rrule:freq=weekly;')]).toEqual([1, 7, 7]);
  });

  it('rules: an all-day move onto the 25-hour day is still one day long', () => {
    const store = createEventStore();
    createHistory(store, ctx()).run({ type: 'event.create', event: { id: 'a', start: '2026-10-24', end: '2026-10-25', durationEditable: false } });
    const r = applyCommand(store.snapshot, { type: 'event.move', id: 'a', start: '2026-10-25' }, ctx({ rules: { displayZone: 'Europe/Paris' } }));
    expect(r.ok).toBe(true);
  });

  it('rules: moving a whole series does not collide with its own occurrences', () => {
    const { store } = series({ start: `2026-10-05T09:30${P}`, end: `2026-10-05T10:30${P}`, rrule: 'FREQ=DAILY;COUNT=10' });
    const r = applyCommand(store.snapshot, { type: 'event.move', id: 'w', key: `2026-10-07T09:30:00+02:00${P}`, scope: 'all', start: '2026-10-08T09:30' }, ctx({ rules: { displayZone: 'Europe/Paris', overlap: false } }));
    expect(r.ok).toBe(true);
  });

  it('a source refresh takes back a chain of splits', () => {
    const store = createEventStore();
    const c = ctx();
    const feed = () => normalizeMany([{ id: 'w', title: 'Weekly', start: `2026-10-05T09:00${P}`, end: `2026-10-05T10:00${P}`, rrule: 'FREQ=WEEKLY;COUNT=6' }], c.normalize, 'feed').items;
    store.replaceSourceChunk('feed', '*', feed());
    const h = createHistory(store, c);
    h.run({ type: 'series.split', id: 'w', at: K('2026-10-19') });
    expect(h.run({ type: 'series.split', id: 'n-1', at: K('2026-11-02', '+01:00') }).ok).toBe(true);
    expect(store.snapshot.counts.series).toBe(3);
    store.replaceSourceChunk('feed', '*', feed());
    expect([store.snapshot.counts.series, all(store).length]).toEqual([1, 6]);
  });

  it('the kernel validates gestures only: run(cmd) moves a locked event, run(cmd, { validate: true }) refuses', async () => {
    const { createKernel } = await import('../src/index.js');
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', initialDate: d('2026-10-21') });
    k.run({ type: 'event.create', event: { id: 'a', start: `2026-10-21T09:00${P}`, startEditable: false } });
    expect(k.run({ type: 'event.move', id: 'a', start: `2026-10-21T15:00${P}` }, { validate: true }).ok).toBe(false);
    expect(k.run({ type: 'event.move', id: 'a', start: `2026-10-21T15:00${P}` }).ok).toBe(true);
    k.destroy();
  });
});
