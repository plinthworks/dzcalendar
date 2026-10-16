import { describe, it, expect } from 'vitest';
import { createEventStore, createHistory, createIdGenerator, normalizeMany, itemEvent } from '../src/index.js';
import type { CommandContext, EventInput } from '../src/index.js';

/** Scenarios from the Phase 1 code review, each reproduced before it was fixed. */
const ctx = (): CommandContext => ({ normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('r') } });
const from = (inputs: EventInput[]) => normalizeMany(inputs, ctx().normalize, 'src').items;

describe('a source never touches what it does not own', () => {
  it('a refresh keeps a user event that took over the id of a deleted source event', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    store.replaceSourceChunk('src', 'A', from([{ id: 'X', start: '2026-05-01' }]));
    h.run({ type: 'event.delete', id: 'X' });
    h.run({ type: 'event.create', event: { id: 'X', title: 'mine', start: '2026-05-02' } });
    expect(store.replaceSourceChunk('src', 'A', []).removed).toEqual([]);
    expect(store.snapshot.getEvent('X')!.title).toBe('mine');
  });

  it('…and when the server still sends that id: refused, reported, and the user event stays', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    store.replaceSourceChunk('src', 'A', from([{ id: 'X', start: '2026-05-01' }]));
    h.run({ type: 'event.delete', id: 'X' });
    h.run({ type: 'event.create', event: { id: 'X', title: 'mine', start: '2026-05-02' } });
    const change = store.replaceSourceChunk('src', 'A', from([{ id: 'X', start: '2026-05-01' }]));
    expect(change.problems.map((p) => p.code)).toEqual(['duplicate-id']);
    expect(change.removed).toEqual([]);
    expect(store.snapshot.getEvent('X')!.title).toBe('mine');
  });

  it('undo does not bring back a source event the source has since withdrawn', () => {
    const store = createEventStore();
    const dropped: string[][] = [];
    const h = createHistory(store, ctx(), { onDropped: (l) => dropped.push([...l]) });
    store.replaceSourceChunk('src', 'A', from([{ id: 's1', start: '2026-05-01' }]));
    h.run({ type: 'event.delete', id: 's1' });
    store.replaceSourceChunk('src', 'A', []);
    expect(h.undo()).toBe(false);
    expect(store.snapshot.getEvent('s1')).toBeUndefined();
    expect(dropped).toEqual([['event.delete']]);
  });

  it('undo of a local delete of a source event still owned brings it back', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    store.replaceSourceChunk('src', 'A', from([{ id: 's1', start: '2026-05-01' }]));
    h.run({ type: 'event.delete', id: 's1' });
    expect(h.undo()).toBe(true);
    expect(store.snapshot.getEvent('s1')!.sourceId).toBe('src');
  });
});

describe('event.update: each field does what a create would do', () => {
  const setup = (event: EventInput) => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', ...event } });
    return { store, h, get: () => store.snapshot.getEvent('a')! };
  };

  it('editable: false turns every permission off', () => {
    const { h, get } = setup({ start: '2026-05-01' });
    h.run({ type: 'event.update', id: 'a', patch: { editable: false } });
    expect(get().perms).toEqual({ start: false, duration: false, resource: false });
  });

  it('a new resourceId moves the event, it does not add a resource', () => {
    const { h, get } = setup({ start: '2026-05-01', resourceId: 'r1' });
    h.run({ type: 'event.update', id: 'a', patch: { resourceId: 'r2' } });
    expect(get().resourceIds).toEqual(['r2']);
  });

  it('cancelled frees the time, unless busy was set on purpose', () => {
    const plain = setup({ start: '2026-05-01' });
    plain.h.run({ type: 'event.update', id: 'a', patch: { status: 'cancelled' } });
    expect(plain.get().busy).toBe(false);
    const pinned = setup({ start: '2026-05-01', busy: false });
    pinned.h.run({ type: 'event.update', id: 'a', patch: { status: 'tentative' } });
    expect(pinned.get().busy).toBe(false);
  });

  it('a new timeZone keeps the wall times and moves the event to that zone', () => {
    const { h, get } = setup({ start: '2026-05-01T09:00[Europe/Paris]', end: '2026-05-01T10:30[Europe/Paris]' });
    h.run({ type: 'event.update', id: 'a', patch: { timeZone: 'America/Chicago' } });
    expect(get().start.toString()).toBe('2026-05-01T09:00:00-05:00[America/Chicago]');
    expect(get().end.toString()).toBe('2026-05-01T10:30:00-05:00[America/Chicago]');
  });

  it('allDay: true turns a timed event into the days it touches', () => {
    const { h, get } = setup({ start: '2026-05-01T22:00[Europe/Paris]', end: '2026-05-02T01:00[Europe/Paris]' });
    const r = h.run({ type: 'event.update', id: 'a', patch: { allDay: true } });
    expect(r.ok).toBe(true);
    expect([get().allDay, get().start.toString(), get().end.toString()]).toEqual([true, '2026-05-01', '2026-05-03']);
  });

  it('allDay: false gives an all-day event the default timed length, at midnight in its zone', () => {
    const { h, get } = setup({ start: '2026-05-01', end: '2026-05-03' });
    h.run({ type: 'event.update', id: 'a', patch: { allDay: false, timeZone: 'UTC' } });
    expect([get().allDay, get().start.toString(), get().end.toString()]).toEqual([false, '2026-05-01T00:00:00+00:00[UTC]', '2026-05-01T01:00:00+00:00[UTC]']);
  });
});

it('derived ids of different events of one source do not collide across chunks', () => {
  // These two titles shared a 32-bit FNV id; the id is now ~106 bits.
  const a = itemEvent(from([{ title: 'Meeting 571589', start: '2026-05-01T09:00[UTC]' }])[0]!).id;
  const b = itemEvent(from([{ title: 'Meeting 1138190', start: '2026-05-01T09:00[UTC]' }])[0]!).id;
  expect(a).not.toBe(b);
  expect(a.length).toBeGreaterThan(18);
});
