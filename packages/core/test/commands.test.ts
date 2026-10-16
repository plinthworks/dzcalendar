import { describe, it, expect } from 'vitest';
import { applyCommand, createEventStore, createHistory, createIdGenerator, normalizeMany } from '../src/index.js';
import type { CommandContext, Command, StoreSnapshot } from '../src/index.js';

const ctx = (): CommandContext => ({ normalize: { displayZone: 'Europe/Paris', newId: createIdGenerator('c') } });
const codes = (r: { problems: readonly { code: string; severity: string }[] }) => r.problems.filter((p) => p.severity === 'error').map((p) => p.code);

/** The whole store as strings: Temporal objects cannot be compared with toEqual. */
const dump = (snap: StoreSnapshot) =>
  [...snap.allEvents()].map((e) => `${e.id}|${e.title}|${e.start}|${e.end}|${e.revision}|${e.resourceIds.join(',')}`);

describe('applyCommand', () => {
  it('create, then update, then delete', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    expect(h.run({ type: 'event.create', event: { id: 'a', title: 'x', start: '2026-05-01T09:00[UTC]' } }).ok).toBe(true);
    expect(store.snapshot.getEvent('a')!.revision).toBe(1);
    h.run({ type: 'event.update', id: 'a', patch: { title: 'y' } });
    expect(store.snapshot.getEvent('a')).toMatchObject({ title: 'y', revision: 2 });
    expect(store.snapshot.getEvent('a')!.end.toString()).toBe('2026-05-01T10:00:00+00:00[UTC]');
    h.run({ type: 'event.delete', id: 'a' });
    expect(store.snapshot.getEvent('a')).toBeUndefined();
  });

  it('is pure: the snapshot it reads is not touched', () => {
    const store = createEventStore();
    const r = applyCommand(store.snapshot, { type: 'event.create', event: { id: 'a', start: '2026-05-01' } }, ctx());
    expect(r.ok).toBe(true);
    expect(store.snapshot.counts.events).toBe(0);
  });

  it('unknown-event for update and delete of a missing id', () => {
    const snap = createEventStore().snapshot;
    expect(codes(applyCommand(snap, { type: 'event.update', id: 'zz', patch: {} }, ctx()))).toEqual(['unknown-event']);
    expect(codes(applyCommand(snap, { type: 'event.delete', id: 'zz' }, ctx()))).toEqual(['unknown-event']);
  });

  it('duplicate-id on create of an existing id', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01' } });
    expect(codes(h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-02' } }))).toEqual(['duplicate-id']);
  });

  it('an update that changes nothing produces no mutation and keeps the object', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', title: 'x', start: '2026-05-01' } });
    const before = store.snapshot.getEvent('a');
    const r = h.run({ type: 'event.update', id: 'a', patch: { title: 'x' } });
    expect(r.ok && r.mutations).toEqual([]);
    expect(store.snapshot.getEvent('a')).toBe(before);
    expect(h.canUndo).toBe(true); // only the create
    h.undo();
    expect(h.canUndo).toBe(false);
  });

  it('an update keeps a guessed zone guessed, unless it moves the event', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01T09:00' } });
    h.run({ type: 'event.update', id: 'a', patch: { title: 'renamed' } });
    expect(store.snapshot.getEvent('a')).toMatchObject({ zoneGuessed: true });
    h.run({ type: 'event.update', id: 'a', patch: { start: '2026-05-01T10:00[Europe/Paris]', end: '2026-05-01T11:00[Europe/Paris]' } });
    expect(store.snapshot.getEvent('a')).toMatchObject({ zoneGuessed: false });
  });

  it('a batch is all or nothing, and each step sees the previous ones', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    const ok = h.run({
      type: 'batch',
      commands: [
        { type: 'event.create', event: { id: 'a', start: '2026-05-01' } },
        { type: 'event.update', id: 'a', patch: { title: 'made in the same batch' } },
      ],
    });
    expect(ok.ok).toBe(true);
    expect(store.snapshot.getEvent('a')!.title).toBe('made in the same batch');

    const bad = h.run({
      type: 'batch',
      commands: [
        { type: 'event.create', event: { id: 'b', start: '2026-05-01' } },
        { type: 'event.delete', id: 'nope' },
      ],
    });
    expect(codes(bad)).toEqual(['unknown-event']);
    expect(store.snapshot.getEvent('b')).toBeUndefined();
  });

  it('a source event edited by a command keeps its source', () => {
    const store = createEventStore();
    store.replaceSourceChunk('api', 'c', normalizeMany([{ id: 's', start: '2026-05-01' }], ctx().normalize, 'api').items);
    createHistory(store, ctx()).run({ type: 'event.update', id: 's', patch: { title: 't' } });
    expect(store.snapshot.getEvent('s')!.sourceId).toBe('api');
  });
});

describe('update keeps what it was not asked to change', () => {
  it('a new start alone keeps the length, in elapsed time across a clock change', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-10-24T09:00[Europe/Paris]', end: '2026-10-24T11:00[Europe/Paris]' } });
    h.run({ type: 'event.update', id: 'a', patch: { start: '2026-10-25T01:30[Europe/Paris]' } });
    const e = store.snapshot.getEvent('a')!;
    expect(e.start.toString()).toBe('2026-10-25T01:30:00+02:00[Europe/Paris]');
    // Two real hours: past the repeated hour, the clock reads 02:30 the second time.
    expect(e.end.toString()).toBe('2026-10-25T02:30:00+01:00[Europe/Paris]');
  });

  it('an all-day event keeps its number of days', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01', end: '2026-05-04' } });
    h.run({ type: 'event.update', id: 'a', patch: { start: '2026-05-10' } });
    expect(store.snapshot.getEvent('a')!.end.toString()).toBe('2026-05-13');
  });

  it('a wall time without zone is read in the event’s zone, not the calendar’s', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01T09:00[Asia/Tokyo]' } });
    const r = h.run({ type: 'event.update', id: 'a', patch: { start: '2026-05-01T10:00' } });
    expect(store.snapshot.getEvent('a')!.start.toString()).toBe('2026-05-01T10:00:00+09:00[Asia/Tokyo]');
    expect(r.problems).toEqual([]);
  });

  it('a duration alone moves the end', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01T09:00[UTC]' } });
    h.run({ type: 'event.update', id: 'a', patch: { duration: { minutes: 15 } } });
    expect(store.snapshot.getEvent('a')!.end.toString()).toBe('2026-05-01T09:15:00+00:00[UTC]');
  });
});

describe('history', () => {
  it('a revision never names two contents, even after undo', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', title: 'A', start: '2026-05-01' } });
    h.run({ type: 'event.update', id: 'a', patch: { title: 'B' } });
    const b = store.snapshot.getEvent('a')!;
    h.undo();
    h.run({ type: 'event.update', id: 'a', patch: { title: 'C' } });
    const c = store.snapshot.getEvent('a')!;
    expect(c.revision).not.toBe(b.revision);
  });

  it('a source refresh drops, at once, every entry touching what it changed — and says so', () => {
    const store = createEventStore();
    const n = ctx().normalize;
    store.replaceSourceChunk('api', 'c', normalizeMany([{ id: 's', title: 'v1', start: '2026-05-01' }], n, 'api').items);
    const dropped: string[][] = [];
    const h = createHistory(store, ctx(), { onDropped: (labels) => dropped.push([...labels]) });
    h.run({ type: 'event.create', event: { id: 'mine', start: '2026-05-02' } });
    h.run({ type: 'event.update', id: 's', patch: { title: 'edit 1' } });
    h.run({ type: 'event.update', id: 's', patch: { title: 'edit 2' } });
    store.replaceSourceChunk('api', 'c', normalizeMany([{ id: 's', title: 'server', start: '2026-05-01' }], n, 'api').items);
    expect(dropped).toEqual([['event.update', 'event.update']]);
    expect(h.undo()).toBe(true); // the create, untouched by the refresh
    expect(store.snapshot.getEvent('mine')).toBeUndefined();
    expect(store.snapshot.getEvent('s')!.title).toBe('server');
  });

  it('a merged drag is stored as one mutation per event', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx(), { mergeKey: (c) => (c.type === 'event.update' ? `drag:${c.id}` : null) });
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01T09:00[UTC]' } });
    for (let m = 1; m <= 40; m++) h.run({ type: 'event.update', id: 'a', patch: { start: `2026-05-01T09:${String(m).padStart(2, '0')}[UTC]` } });
    h.undo();
    expect(store.snapshot.getEvent('a')!.start.toString()).toBe('2026-05-01T09:00:00+00:00[UTC]');
    h.redo();
    expect(store.snapshot.getEvent('a')!.start.toString()).toBe('2026-05-01T09:40:00+00:00[UTC]');
  });

  it('create then delete inside one transaction leaves nothing to undo', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.transaction('noop', () => {
      h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01' } });
      h.run({ type: 'event.delete', id: 'a' });
    });
    expect(h.canUndo).toBe(false);
  });

  it('100 random commands, undone to the start and redone to the end, byte for byte', () => {
    let seed = 42;
    const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const store = createEventStore();
    const h = createHistory(store, ctx(), { limit: 1000 });
    const initial = dump(store.snapshot);
    const live: string[] = [];
    let ran = 0;
    let n = 0;
    while (ran < 100) {
      const pick = r();
      let cmd: Command;
      if (live.length === 0 || pick < 0.45) {
        const id = `e${n++}`;
        const day = 1 + Math.floor(r() * 28);
        cmd = { type: 'event.create', event: { id, title: `t${n}`, start: `2026-05-${String(day).padStart(2, '0')}T${String(Math.floor(r() * 23)).padStart(2, '0')}:00[Europe/Paris]` } };
        live.push(id);
      } else if (pick < 0.8) {
        const id = live[Math.floor(r() * live.length)]!;
        cmd = { type: 'event.update', id, patch: { title: `u${n++}`, resourceIds: r() < 0.5 ? ['r1'] : [] } };
      } else {
        const id = live.splice(Math.floor(r() * live.length), 1)[0]!;
        cmd = { type: 'event.delete', id };
      }
      expect(h.run(cmd).ok).toBe(true);
      ran++;
    }
    const final = dump(store.snapshot);
    while (h.undo());
    expect(dump(store.snapshot)).toEqual(initial);
    while (h.redo());
    expect(dump(store.snapshot)).toEqual(final);
  });

  it('undo restores the very same objects, so nothing re-renders for nothing', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01' } });
    const original = store.snapshot.getEvent('a');
    h.run({ type: 'event.update', id: 'a', patch: { title: 'x' } });
    h.undo();
    expect(store.snapshot.getEvent('a')).toBe(original);
  });

  it('a new command clears the redo stack', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01' } });
    h.undo();
    expect(h.canRedo).toBe(true);
    h.run({ type: 'event.create', event: { id: 'b', start: '2026-05-01' } });
    expect(h.canRedo).toBe(false);
  });

  it('an entry overtaken by a source refresh is dropped, not replayed over it', () => {
    const store = createEventStore();
    const n = ctx().normalize;
    store.replaceSourceChunk('api', 'c', normalizeMany([{ id: 's', title: 'v1', start: '2026-05-01' }], n, 'api').items);
    const h = createHistory(store, ctx());
    h.run({ type: 'event.update', id: 's', patch: { title: 'mine' } });
    store.replaceSourceChunk('api', 'c', normalizeMany([{ id: 's', title: 'server', start: '2026-05-01' }], n, 'api').items);
    expect(h.undo()).toBe(false);
    expect(store.snapshot.getEvent('s')!.title).toBe('server');
    expect(h.canUndo).toBe(false);
  });

  it('transaction: several commands, one undo', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx());
    h.transaction('import', () => {
      h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01' } });
      h.run({ type: 'event.create', event: { id: 'b', start: '2026-05-02' } });
    });
    h.undo();
    expect(store.snapshot.counts.events).toBe(0);
    expect(h.canUndo).toBe(false);
  });

  it('mergeKey: a drag of many steps undoes in one, back to where it started', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx(), { mergeKey: (c) => (c.type === 'event.update' && c.patch.start ? `move:${c.id}` : null) });
    h.run({ type: 'event.create', event: { id: 'a', start: '2026-05-01T09:00[UTC]' } });
    for (let hour = 10; hour < 15; hour++) {
      h.run({ type: 'event.update', id: 'a', patch: { start: `2026-05-01T${hour}:00[UTC]`, end: `2026-05-01T${hour + 1}:00[UTC]` } });
    }
    h.undo();
    expect(store.snapshot.getEvent('a')!.start.toString()).toBe('2026-05-01T09:00:00+00:00[UTC]');
    h.undo();
    expect(store.snapshot.counts.events).toBe(0);
  });

  it('limit drops the oldest entries', () => {
    const store = createEventStore();
    const h = createHistory(store, ctx(), { limit: 2 });
    for (const id of ['a', 'b', 'c']) h.run({ type: 'event.create', event: { id, start: '2026-05-01' } });
    let undos = 0;
    while (h.undo()) undos++;
    expect(undos).toBe(2);
    expect(store.snapshot.getEvent('a')).toBeDefined();
  });
});
