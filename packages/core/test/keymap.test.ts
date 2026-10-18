import { describe, it, expect } from 'vitest';
import { Temporal, createEventStore, createIdGenerator, eventHit, grabStep, heldEvent, intentFor, itemEvent, normalizeEvent, proposeMove, proposeResize, stepHit } from '../src/index.js';
import type { CalEvent, EventInput, Hit, InteractionContext, KeyContext, PlainDate, Proposal } from '../src/index.js';

const P = '[Europe/Paris]';
const ev = (input: EventInput): CalEvent => {
  const r = normalizeEvent(input, { displayZone: 'Europe/Paris', newId: createIdGenerator('k') });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return itemEvent(r.value);
};
const ctx = (over: Partial<InteractionContext> = {}): InteractionContext => ({ snap: createEventStore().snapshot, displayZone: 'Europe/Paris', snapMinutes: 15, ...over });
const slot = (iso: string): Hit => {
  const z = Temporal.ZonedDateTime.from(iso);
  return { kind: 'slot', date: z.toPlainDate(), instant: z.toInstant() };
};
const at = (h: Hit) => (h.kind === 'slot' ? h.instant.toZonedDateTimeISO('Europe/Paris').toString() : h.date.toString());
const span = (p: Proposal | null) => (p ? [String(p.start), String(p.end)] : null);

describe('intentFor', () => {
  const time: KeyContext = { mode: 'cursor', rtl: false, grid: 'time' };
  const k = (key: string, mods: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) => ({ key, ...mods });

  it('Alt+left/right: to the next or previous resource (reading direction applied), cursor and grab; Alt+up/down are not ours', () => {
    expect(intentFor(k('ArrowRight', { altKey: true }), time)).toEqual({ kind: 'across', delta: 1 });
    expect(intentFor(k('ArrowRight', { altKey: true }), { ...time, rtl: true })).toEqual({ kind: 'across', delta: -1 });
    expect(intentFor(k('ArrowLeft', { altKey: true }), { ...time, mode: 'grab' })).toEqual({ kind: 'across', delta: -1 });
    expect(intentFor(k('ArrowUp', { altKey: true }), time)).toBeNull();
    // Alt+Shift in grab mode is still the start's edge; on an event, Alt+arrows stay the page's.
    expect(intentFor(k('ArrowRight', { altKey: true, shiftKey: true }), { ...time, mode: 'grab' })).toEqual({ kind: 'resize', edge: 'start', step: { days: 1, slots: 0 } });
    expect(intentFor(k('ArrowRight', { altKey: true }), { ...time, mode: 'event' })).toBeNull();
  });

  it('cursor in a time grid: left/right are days, up/down are slots, Shift extends', () => {
    expect(intentFor(k('ArrowRight'), time)).toEqual({ kind: 'move', step: { days: 1, slots: 0 }, extend: false });
    expect(intentFor(k('ArrowUp'), time)).toEqual({ kind: 'move', step: { days: 0, slots: -1 }, extend: false });
    expect(intentFor(k('ArrowDown', { shiftKey: true }), time)).toEqual({ kind: 'move', step: { days: 0, slots: 1 }, extend: true });
  });

  it('cursor in a month: up/down are weeks; Home/End the line; PageUp/PageDown the period', () => {
    const month: KeyContext = { mode: 'cursor', rtl: false, grid: 'day' };
    expect(intentFor(k('ArrowDown'), month)).toEqual({ kind: 'move', step: { days: 7, slots: 0 }, extend: false });
    expect(intentFor(k('End'), month)).toEqual({ kind: 'line', edge: 'end', extend: false });
    expect(intentFor(k('PageUp'), month)).toEqual({ kind: 'period', dir: 'prev' });
    expect(intentFor(k('Enter'), month)).toEqual({ kind: 'enter' });
    expect(intentFor(k(' '), month)).toEqual({ kind: 'activate' });
  });

  it('right to left: the left arrow goes to the next day', () => {
    expect(intentFor(k('ArrowLeft'), { ...time, rtl: true })).toEqual({ kind: 'move', step: { days: 1, slots: 0 }, extend: false });
    expect(intentFor(k('ArrowRight'), { mode: 'grab', rtl: true, grid: 'day' })).toEqual({ kind: 'move', step: { days: -1, slots: 0 }, extend: false });
  });

  it('on an event: Enter opens, M or Alt+Enter grabs, Delete deletes, arrows go through the day', () => {
    const e: KeyContext = { mode: 'event', rtl: false, grid: 'day' };
    expect(intentFor(k('Enter'), e)).toEqual({ kind: 'open' });
    expect(intentFor(k('M', { shiftKey: false }), e)).toEqual({ kind: 'grab' });
    expect(intentFor(k('Enter', { altKey: true }), e)).toEqual({ kind: 'grab' });
    expect(intentFor(k('Backspace'), e)).toEqual({ kind: 'delete' });
    expect(intentFor(k('ArrowDown'), e)).toEqual({ kind: 'item', delta: 1 });
    expect(intentFor(k('ArrowUp'), e)).toEqual({ kind: 'item', delta: -1 });
  });

  it('grab mode: arrows move, Shift resizes the end, Alt+Shift the start, PageUp a week back, Enter commits, Escape or Tab lets go', () => {
    const g: KeyContext = { mode: 'grab', rtl: false, grid: 'time' };
    expect(intentFor(k('ArrowDown'), g)).toEqual({ kind: 'move', step: { days: 0, slots: 1 }, extend: false });
    expect(intentFor(k('ArrowDown', { shiftKey: true }), g)).toEqual({ kind: 'resize', edge: 'end', step: { days: 0, slots: 1 } });
    expect(intentFor(k('ArrowUp', { shiftKey: true, altKey: true }), g)).toEqual({ kind: 'resize', edge: 'start', step: { days: 0, slots: -1 } });
    expect(intentFor(k('PageUp'), g)).toEqual({ kind: 'move', step: { days: -7, slots: 0 }, extend: false });
    expect(intentFor(k(' '), g)).toEqual({ kind: 'commit' });
    expect(intentFor(k('Tab'), g)).toEqual({ kind: 'cancel' });
    // No undo while holding an event: Ctrl+Z is not the calendar's then.
    expect(intentFor(k('z', { ctrlKey: true }), g)).toBeNull();
  });

  it('undo and redo: Ctrl or Cmd with Z, Shift for redo, Ctrl+Y too; other keys are the page’s', () => {
    expect(intentFor(k('z', { metaKey: true }), time)).toEqual({ kind: 'undo' });
    expect(intentFor(k('Z', { ctrlKey: true, shiftKey: true }), time)).toEqual({ kind: 'redo' });
    expect(intentFor(k('y', { ctrlKey: true }), { ...time, mode: 'event' })).toEqual({ kind: 'redo' });
    expect(intentFor(k('a'), time)).toBeNull();
    expect(intentFor(k('c', { ctrlKey: true }), time)).toBeNull();
    expect(intentFor(k('ArrowDown', { altKey: true }), time)).toBeNull();
  });
});

describe('stepHit', () => {
  it('slots step in elapsed time: the fall-back night visits both 02:00–03:00 passes (Paris, 25 Oct 2026)', () => {
    let h = slot(`2026-10-25T02:30+02:00${P}`);
    const seen: string[] = [];
    for (let n = 0; n < 7; n++) {
      h = stepHit(ctx(), h, { days: 0, slots: 1 });
      seen.push(at(h));
    }
    expect(seen).toEqual([
      `2026-10-25T02:45:00+02:00${P}`,
      `2026-10-25T02:00:00+01:00${P}`,
      `2026-10-25T02:15:00+01:00${P}`,
      `2026-10-25T02:30:00+01:00${P}`,
      `2026-10-25T02:45:00+01:00${P}`,
      `2026-10-25T03:00:00+01:00${P}`,
      `2026-10-25T03:15:00+01:00${P}`,
    ]);
    expect(h.date.toString()).toBe('2026-10-25');
  });

  it('a slot step over the spring-forward gap goes from 01:45 straight to 03:00 (Paris, 29 Mar 2026)', () => {
    const h = stepHit(ctx(), slot(`2026-03-29T01:45+01:00${P}`), { days: 0, slots: 1 });
    expect([at(h), h.kind === 'slot' && h.gap]).toEqual([`2026-03-29T03:00:00+02:00${P}`, undefined]);
  });

  it('a day step keeps the wall time and the pass; into a gap it lands on the first moment after it, flagged', () => {
    expect(at(stepHit(ctx(), slot(`2026-10-24T02:30+02:00${P}`), { days: 1, slots: 0 }))).toBe(`2026-10-25T02:30:00+02:00${P}`);
    expect(at(stepHit(ctx(), slot(`2026-10-26T02:30+01:00${P}`), { days: -1, slots: 0 }))).toBe(`2026-10-25T02:30:00+01:00${P}`);
    const g = stepHit(ctx(), slot(`2026-03-28T02:30+01:00${P}`), { days: 1, slots: 0 });
    expect([at(g), g.date.toString(), g.kind === 'slot' && g.gap]).toEqual([`2026-03-29T03:00:00+02:00${P}`, '2026-03-29', true]);
  });

  it('a slot step keeps its column (the view keeps it inside its hours); a day hit moves by days', () => {
    expect(stepHit(ctx(), slot(`2026-10-21T23:45+02:00${P}`), { days: 0, slots: 1 }).date.toString()).toBe('2026-10-21');
    expect(stepHit(ctx(), { kind: 'day', date: Temporal.PlainDate.from('2026-10-28'), allDayRow: true }, { days: 7, slots: 0 })).toMatchObject({ kind: 'day', allDayRow: true });
    expect(at(stepHit(ctx(), { kind: 'day', date: Temporal.PlainDate.from('2026-10-28') }, { days: 7, slots: 0 }))).toBe('2026-11-04');
  });
});

describe('eventHit', () => {
  const o = { displayZone: 'Europe/Paris', grid: 'time' as const };
  it('a timed event ending at midnight ends in the column of its last minute', () => {
    const e = ev({ start: `2026-10-21T22:00${P}`, end: `2026-10-22T00:00${P}` });
    const end = eventHit(e, 'end', o);
    expect([end.date.toString(), at(end)]).toEqual(['2026-10-21', `2026-10-22T00:00:00+02:00${P}`]);
    expect(eventHit(e, 'start', { ...o, grid: 'day' })).toMatchObject({ kind: 'day' });
  });

  it('a day event: its first and last day; on the all-day row in a time grid', () => {
    const e = ev({ start: '2026-10-21', end: '2026-10-24', allDay: true });
    expect(at(eventHit(e, 'end', { ...o, grid: 'day' }))).toBe('2026-10-23');
    expect(eventHit(e, 'start', o)).toMatchObject({ kind: 'day', allDayRow: true });
  });
});

describe('keyboard and mouse propose the same thing (sequence parity)', () => {
  it('grab, six slots down and one day on = a drop 1 h 30 later the next day', () => {
    const e = ev({ start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` });
    let held = e;
    let p: Proposal | null = null;
    for (const step of [...Array.from({ length: 6 }, () => ({ days: 0, slots: 1 })), { days: 1, slots: 0 }]) {
      p = grabStep(ctx(), 'time', held, { kind: 'move', step });
      held = heldEvent(p!);
    }
    const mouse = proposeMove(ctx(), e, slot(`2026-10-21T09:00${P}`), slot(`2026-10-22T10:30${P}`));
    expect(span(p)).toEqual(span(mouse));
    expect(span(p)).toEqual([`2026-10-22T10:30:00+02:00${P}`, `2026-10-22T11:30:00+02:00${P}`]);
  });

  it('an unsnapped start: the first step snaps it, as the mouse does', () => {
    const e = ev({ start: `2026-10-21T09:07${P}`, end: `2026-10-21T09:52${P}` });
    let held = e;
    let p: Proposal | null = null;
    for (let n = 0; n < 3; n++) {
      p = grabStep(ctx(), 'time', held, { kind: 'move', step: { days: 0, slots: 1 } });
      held = heldEvent(p!);
    }
    expect(span(p)).toEqual(span(proposeMove(ctx(), e, slot(`2026-10-21T09:07${P}`), slot(`2026-10-21T09:52${P}`))));
  });

  it('Shift+↓ twice = the end pulled 30 minutes; then a move carries the new length', () => {
    const e = ev({ start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` });
    const r1 = grabStep(ctx(), 'time', e, { kind: 'resize', edge: 'end', step: { days: 0, slots: 1 } })!;
    const r2 = grabStep(ctx(), 'time', heldEvent(r1), { kind: 'resize', edge: 'end', step: { days: 0, slots: 1 } })!;
    expect(span(r2)).toEqual(span(proposeResize(ctx(), e, 'end', slot(`2026-10-21T10:30${P}`))));
    const m = grabStep(ctx(), 'time', heldEvent(r2), { kind: 'move', step: { days: 0, slots: 1 } })!;
    expect(span(m)).toEqual([`2026-10-21T09:15:00+02:00${P}`, `2026-10-21T10:45:00+02:00${P}`]);
  });

  it('a day event in a month: one week later, and its end a day longer', () => {
    const e = ev({ start: '2026-10-21', end: '2026-10-23', allDay: true });
    const moved = grabStep(ctx(), 'day', e, { kind: 'move', step: { days: 7, slots: 0 } })!;
    expect(span(moved)).toEqual(span(proposeMove(ctx(), e, { kind: 'day', date: e.start as PlainDate }, { kind: 'day', date: Temporal.PlainDate.from('2026-10-28') })));
    const longer = grabStep(ctx(), 'day', heldEvent(moved), { kind: 'resize', edge: 'end', step: { days: 1, slots: 0 } })!;
    expect(span(longer)).toEqual(['2026-10-28', '2026-10-31']);
  });

  it('the view says where the hit may go: nowhere, and nothing is proposed', () => {
    const e = ev({ start: `2026-10-21T09:00${P}`, end: `2026-10-21T10:00${P}` });
    expect(grabStep(ctx(), 'time', e, { kind: 'move', step: { days: 1, slots: 0 } }, () => null)).toBeNull();
  });

  it('into the repeated hour by keyboard: the pass stepped into, the other offered (as under the pointer)', () => {
    const e = ev({ start: `2026-10-25T01:30+02:00${P}`, end: `2026-10-25T02:00+02:00${P}` });
    let held = e;
    let p: Proposal | null = null;
    // 01:30 +02:00 → six slots of elapsed time → 02:00 +01:00 (the second pass).
    for (let n = 0; n < 6; n++) {
      p = grabStep(ctx(), 'time', held, { kind: 'move', step: { days: 0, slots: 1 } });
      held = heldEvent(p!);
    }
    expect([String(p!.start), String(p!.ambiguity?.alternative)]).toEqual([`2026-10-25T02:00:00+01:00${P}`, '2026-10-25T00:00:00Z']);
  });
});
