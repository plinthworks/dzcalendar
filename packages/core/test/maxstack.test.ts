import { describe, it, expect } from 'vitest';
import { BUILTIN_VIEWS, Temporal, buildTimeGridModel, computeViewRange, createEventStore, createIdGenerator, normalizeMany } from '../src/index.js';
import type { EventInput } from '../src/index.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const nav = { firstDay: 1 as const, today: d('2026-10-21') };
const day = computeViewRange(d('2026-10-21'), BUILTIN_VIEWS.timeGridDay!, nav);
const at = (hh: string, id: string, minutes = 60): EventInput => ({ id, title: id, start: `2026-10-21T${hh}[Europe/Paris]`, duration: { minutes } });

function column(events: EventInput[], maxStack?: number | null) {
  const store = createEventStore();
  store.replaceSourceChunk('s', '*', normalizeMany(events, { displayZone: 'Europe/Paris', newId: createIdGenerator('t') }, 's').items);
  return buildTimeGridModel(day, store.snapshot, { displayZone: 'Europe/Paris', ...(maxStack !== undefined && { maxStack }) }).columns[0]!;
}

describe('maxStack: a crowded cluster behind "+N"', () => {
  // Six events all at 09:00–10:00: six lanes.
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => at('09:00', id));

  it('without it, everything side by side', () => {
    const c = column(six);
    expect(c.events).toHaveLength(6);
    expect(c.more).toEqual([]);
  });

  it('maxStack 3: two lanes drawn a third wide, four behind one "+N" in the third', () => {
    const c = column(six, 3);
    expect(c.events.map((e) => [e.segment.instance.event.id, e.left, e.width])).toEqual([
      ['a', 0, 1 / 3],
      ['b', 1 / 3, 1 / 3],
    ]);
    expect(c.more).toHaveLength(1);
    expect(c.more[0]!.events.map((e) => e.segment.instance.event.id)).toEqual(['c', 'd', 'e', 'f']);
    expect([c.more[0]!.top, c.more[0]!.height, c.more[0]!.left, c.more[0]!.width]).toEqual([540, 60, 2 / 3, 1 / 3]);
  });

  it('a cluster within the limit is untouched; two separate crowded hours give two links', () => {
    const c = column([...six, at('14:00', 'g'), ...['h', 'i', 'j', 'k'].map((id) => at('16:00', id, 30))], 3);
    expect(c.events.find((e) => e.segment.instance.event.id === 'g')!.width).toBe(1);
    expect(c.more.map((m) => [m.top, m.events.length])).toEqual([
      [540, 4],
      [960, 2],
    ]);
  });

  it('an event spanning several lanes is cut to what the drawn lanes allow', () => {
    // A long event at 08:00–12:00 widens over lanes free beside it; with maxStack 2 it keeps one lane.
    const c = column([at('08:00', 'long', 240), at('09:00', 'x'), at('09:00', 'y'), at('11:00', 'z')], 2);
    const long = c.events.find((e) => e.segment.instance.event.id === 'long')!;
    expect([long.left, long.width]).toEqual([0, 1 / 2]);
    expect(c.more.flatMap((m) => m.events.map((e) => e.segment.instance.event.id)).sort()).toEqual(['x', 'y', 'z'].filter((id) => !c.events.some((e) => e.segment.instance.event.id === id)).sort());
  });
});

describe('maxStack edges', () => {
  const three = ['a', 'b', 'c'].map((id) => at('09:00', id));
  it('1: a crowded cluster wholly behind one "+N" across the column', () => {
    const c = column(three, 1);
    expect(c.events).toEqual([]);
    expect(c.more.map((m) => [m.left, m.width, m.events.length])).toEqual([[0, 1, 3]]);
  });
  it('0, negative, fractional: no limit', () => {
    for (const bad of [0, -2, 2.5, Number.NaN]) expect(column(three, bad).events).toHaveLength(3);
  });
});
