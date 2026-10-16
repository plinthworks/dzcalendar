import { describe, it, expect } from 'vitest';
import {
  Temporal,
  buildColumnAxis,
  commandFor,
  createEventStore,
  createIdGenerator,
  dayInfo,
  normalizeEvent,
  itemEvent,
  proposeMove,
  proposeResize,
  resolveWall,
  selectionBetween,
} from '../src/index.js';
import type { CalEvent, EventInput, Hit, InteractionContext, ZonedDateTime } from '../src/index.js';

const P = '[Europe/Paris]';
const d = (s: string) => Temporal.PlainDate.from(s);
const i = (s: string) => Temporal.Instant.from(s);
const ev = (input: EventInput): CalEvent => {
  const r = normalizeEvent(input, { displayZone: 'Europe/Paris', newId: createIdGenerator('t') });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return itemEvent(r.value);
};
const ctx = (over: Partial<InteractionContext> = {}): InteractionContext => ({ snap: createEventStore().snapshot, displayZone: 'Europe/Paris', snapMinutes: 15, ...over });
const slot = (iso: string): Hit => {
  const z = Temporal.ZonedDateTime.from(iso);
  return { kind: 'slot', date: z.toPlainDate(), instant: z.toInstant() };
};
const s = (p: { start: { toString(): string }; end: { toString(): string } }) => [String(p.start), String(p.end)];

describe('proposeMove', () => {
  it('keeps the grab offset and the length; snaps the start on the wall clock', () => {
    const e = ev({ start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` });
    // Grabbed 30 min after its start, dropped at 14:10 the next day: 13:40, snapped to 13:45.
    const p = proposeMove(ctx(), e, slot(`2026-10-21T09:30${P}`), slot(`2026-10-22T14:10${P}`));
    expect([...s(p), p.valid, p.allDay]).toEqual([`2026-10-22T13:45:00+02:00${P}`, `2026-10-22T14:45:00+02:00${P}`, true, false]);
  });

  it('dropped in the second 02:30 of the fall-back night: that pass, with the first as the alternative', () => {
    const e = ev({ start: `2026-10-24T01:00${P}`, end: `2026-10-24T01:30${P}` });
    const p = proposeMove(ctx(), e, slot(`2026-10-24T01:00${P}`), slot(`2026-10-25T02:30+01:00${P}`));
    expect([String(p.start), String(p.ambiguity?.chosen), String(p.ambiguity?.alternative)]).toEqual([
      `2026-10-25T02:30:00+01:00${P}`,
      '2026-10-25T01:30:00Z',
      '2026-10-25T00:30:00Z',
    ]);
  });

  it('snapped into the spring-forward gap: moved to 03:00, flagged to be announced', () => {
    const e = ev({ start: `2026-03-28T01:00${P}`, end: `2026-03-28T02:00${P}` });
    const p = proposeMove(ctx({ snapMinutes: 60 }), e, slot(`2026-03-28T01:00${P}`), slot(`2026-03-29T01:40+01:00${P}`));
    expect([String(p.start), p.skipped]).toEqual([`2026-03-29T03:00:00+02:00${P}`, true]);
  });

  it('keeps the event’s own zone (a Tokyo call stays in Tokyo)', () => {
    const e = ev({ start: '2026-10-22T09:00[Asia/Tokyo]', end: '2026-10-22T10:00[Asia/Tokyo]' });
    const p = proposeMove(ctx(), e, slot('2026-10-22T02:00+02:00[Europe/Paris]'), slot(`2026-10-22T03:00${P}`));
    expect(s(p)).toEqual(['2026-10-22T10:00:00+09:00[Asia/Tokyo]', '2026-10-22T11:00:00+09:00[Asia/Tokyo]']);
  });

  it('days: a day event by whole days; a timed one keeps its wall time across the clock change', () => {
    const a = ev({ start: '2026-10-05', end: '2026-10-07' });
    expect(s(proposeMove(ctx(), a, { kind: 'day', date: d('2026-10-06') }, { kind: 'day', date: d('2026-10-09') }))).toEqual(['2026-10-08', '2026-10-10']);
    const t = ev({ start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` });
    expect(s(proposeMove(ctx(), t, { kind: 'day', date: d('2026-10-21') }, { kind: 'day', date: d('2026-10-26') }))).toEqual([`2026-10-26T09:00:00+01:00${P}`, `2026-10-26T10:00:00+01:00${P}`]);
  });

  it('between the all-day row and the grid: a timed event becomes a day, a day becomes one timed hour', () => {
    const t = ev({ start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` });
    const a = proposeMove(ctx(), t, slot(`2026-10-21T09:00${P}`), { kind: 'day', date: d('2026-10-23'), allDayRow: true });
    expect([...s(a), a.allDay]).toEqual(['2026-10-23', '2026-10-24', true]);
    const day = ev({ start: '2026-10-21' });
    const b = proposeMove(ctx(), day, { kind: 'day', date: d('2026-10-21'), allDayRow: true }, slot(`2026-10-22T10:07${P}`));
    expect([...s(b), b.allDay]).toEqual([`2026-10-22T10:00:00+02:00${P}`, `2026-10-22T11:00:00+02:00${P}`, false]);
  });

  it('validates against the rules: overlap refused, the violation given', () => {
    const store = createEventStore();
    const other = ev({ id: 'b', start: `2026-10-21T11:00${P}`, end: `2026-10-21T12:00${P}` });
    store.apply([{ kind: 'event', after: other }], 'api');
    const e = ev({ id: 'a', start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` });
    const p = proposeMove(ctx({ snap: store.snapshot, rules: { displayZone: 'Europe/Paris', overlap: false } }), e, slot(`2026-10-21T09:00${P}`), slot(`2026-10-21T11:30${P}`));
    expect([p.valid, p.violations.map((v) => v.code)]).toEqual([false, ['overlap']]);
  });
});

describe('proposeResize', () => {
  it('timed: the end snaps; never shorter than one step', () => {
    const e = ev({ start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` });
    expect(s(proposeResize(ctx(), e, 'end', slot(`2026-10-21T11:20${P}`)))).toEqual([`2026-10-21T09:00:00+02:00${P}`, `2026-10-21T11:15:00+02:00${P}`]);
    expect(s(proposeResize(ctx(), e, 'end', slot(`2026-10-21T08:00${P}`)))).toEqual([`2026-10-21T09:00:00+02:00${P}`, `2026-10-21T09:15:00+02:00${P}`]);
    expect(s(proposeResize(ctx(), e, 'start', slot(`2026-10-21T07:50${P}`)))).toEqual([`2026-10-21T07:45:00+02:00${P}`, `2026-10-21T10:00:00+02:00${P}`]);
  });
  it('days: the cell under the pointer is the last day', () => {
    const a = ev({ start: '2026-10-05', end: '2026-10-07' });
    expect(s(proposeResize(ctx(), a, 'end', { kind: 'day', date: d('2026-10-09') }))).toEqual(['2026-10-05', '2026-10-10']);
    expect(s(proposeResize(ctx(), a, 'end', { kind: 'day', date: d('2026-10-01') }))).toEqual(['2026-10-05', '2026-10-06']);
  });
});

describe('selection and commands', () => {
  it('a selection covers whole slots in either direction; over days, whole days', () => {
    expect(s(selectionBetween(ctx(), slot(`2026-10-21T11:10${P}`), slot(`2026-10-21T09:05${P}`)))).toEqual([`2026-10-21T09:00:00+02:00${P}`, `2026-10-21T11:15:00+02:00${P}`]);
    expect(s(selectionBetween(ctx(), { kind: 'day', date: d('2026-10-23') }, { kind: 'day', date: d('2026-10-21') }))).toEqual(['2026-10-21', '2026-10-24']);
  });

  it('commandFor: a move, an update when the kind changes, a series occurrence through its series', () => {
    const t = ev({ id: 'a', start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` });
    const p = proposeMove(ctx(), t, slot(`2026-10-21T09:00${P}`), slot(`2026-10-21T11:00${P}`));
    expect(commandFor({ key: 'a', event: t, origin: 'single' }, p)).toMatchObject({ type: 'event.move', id: 'a' });
    const q = proposeMove(ctx(), t, slot(`2026-10-21T09:00${P}`), { kind: 'day', date: d('2026-10-21'), allDayRow: true });
    expect(commandFor({ key: 'a', event: t, origin: 'single' }, q)).toMatchObject({ type: 'event.update', id: 'a', patch: { allDay: true } });
    const key = `2026-10-21T09:00:00+02:00${P}`;
    const occ = { ...t, id: `s@${key}`, ref: { seriesId: 's', key } };
    expect(commandFor({ key: `s@${key}`, event: occ, origin: 'occurrence' }, p, 'following')).toMatchObject({ type: 'event.move', id: 's', key, scope: 'following' });
  });
});

describe('parity: the pointer and the keyboard propose the same thing', () => {
  it('a hit from a position on the axis equals a hit from a date and a time', () => {
    const date = d('2026-10-25');
    const axis = buildColumnAxis(date, 'Europe/Paris', { mode: 'wall' });
    const e = ev({ start: `2026-10-25T05:00${P}`, end: `2026-10-25T06:00${P}` });
    for (const minutes of [0, 150, 210, 600, 1425]) {
      // The pointer: a position on the drawn axis. The keyboard: a wall time stepped to, read in the zone.
      const fromPointer: Hit = { kind: 'slot', date, instant: axis.fromPosition(minutes).instant };
      const wall = Temporal.PlainTime.from({ hour: Math.floor(minutes / 60), minute: minutes % 60 });
      const fromKeys: Hit = { kind: 'slot', date, instant: resolveWall(date, wall, 'Europe/Paris', 'compatible').instant! };
      const grab: Hit = { kind: 'slot', date, instant: (e.start as ZonedDateTime).toInstant() };
      const a = proposeMove(ctx(), e, grab, fromPointer);
      const b = proposeMove(ctx(), e, grab, fromKeys);
      expect([String(a.start), a.valid]).toEqual([String(b.start), b.valid]);
    }
  });
});

describe('fixed after the Phase 7 reviews (by hand)', () => {
  it('a resize into the repeated hour: the ambiguity is the end’s; clamped to the minimum, none', () => {
    const e = ev({ start: `2026-10-25T00:00${P}`, end: `2026-10-25T00:45${P}` });
    const p = proposeResize(ctx(), e, 'end', slot(`2026-10-25T02:30+01:00${P}`));
    expect([String(p.start), p.ambiguity?.edge, String(p.ambiguity?.chosen)]).toEqual([`2026-10-25T00:00:00+02:00${P}`, 'end', '2026-10-25T01:30:00Z']);
    const late = ev({ start: `2026-10-25T02:30+01:00${P}`, end: `2026-10-25T03:30${P}` });
    const q = proposeResize(ctx(), late, 'end', slot(`2026-10-25T02:20+02:00${P}`));
    expect([String(q.end), q.ambiguity]).toEqual([`2026-10-25T02:45:00+01:00${P}`, undefined]);
  });

  it('a hit in a skipped hour lands on the first moment after it and is flagged', () => {
    const e = ev({ start: `2026-03-27T09:00${P}`, end: `2026-03-27T10:00${P}` });
    const gapHit: Hit = { kind: 'slot', date: d('2026-03-29'), instant: i('2026-03-29T01:00:00Z'), gap: true };
    const p = proposeMove(ctx(), e, slot(`2026-03-27T09:00${P}`), gapHit);
    expect([String(p.start), p.skipped]).toEqual([`2026-03-29T03:00:00+02:00${P}`, true]);
  });

  it('Lord Howe’s half-hour changes: a selection holds the tapped moment and ends on the wall slot', () => {
    const LH = '[Australia/Lord_Howe]';
    const c = ctx({ displayZone: 'Australia/Lord_Howe', snapMinutes: 60 });
    // 1 October… the spring change, 4 October 2026: 02:00 → 02:30.
    const tap = slot(`2026-10-04T02:40+11:00${LH}`);
    const a = selectionBetween(c, tap, tap);
    expect([String(a.start), String(a.end)]).toEqual([`2026-10-04T02:30:00+11:00${LH}`, `2026-10-04T03:00:00+11:00${LH}`]);
    // 5 April 2026, fall back 02:00 → 01:30: 01:45 of the second pass.
    const back = slot(`2026-04-05T01:45+10:30${LH}`);
    const b = selectionBetween(c, back, back);
    const t = Temporal.ZonedDateTime.from(`2026-04-05T01:45+10:30${LH}`).epochMilliseconds;
    expect(Temporal.ZonedDateTime.from(String(b.start)).epochMilliseconds <= t && t < Temporal.ZonedDateTime.from(String(b.end)).epochMilliseconds).toBe(true);
  });
});
