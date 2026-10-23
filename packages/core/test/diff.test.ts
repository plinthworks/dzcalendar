import { describe, it, expect } from 'vitest';
import { createIdGenerator, eventEquals, normalizeEvent, sameValue, applyCommand, createEventStore, Temporal, itemEvent } from '../src/index.js';
import type { CalEvent, EventInput } from '../src/index.js';

const ctx = () => ({ displayZone: 'Europe/Paris', newId: createIdGenerator('d') });
const ev = (input: EventInput): CalEvent => {
  const r = normalizeEvent(input, ctx());
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return itemEvent(r.value);
};

const FULL: EventInput = {
  id: 'full',
  groupId: 'g',
  title: 't',
  start: '2026-05-01T09:00[Europe/Paris]',
  end: '2026-05-01T10:00[Europe/Paris]',
  resourceIds: ['r1'],
  display: 'block',
  status: 'tentative',
  busy: true,
  startEditable: true,
  durationEditable: false,
  resourceEditable: true,
  classNames: ['a'],
  tone: 'blue',
  url: 'https://example.com',
  extendedProps: { room: { floor: 2 } },
};

describe('eventEquals', () => {
  it('is false when any one field of CalEvent differs — a field added and forgotten fails here', () => {
    const base = ev(FULL);
    const variants: Record<string, unknown> = {
      id: 'other',
      groupId: 'h',
      title: 'u',
      allDay: true,
      start: Temporal.ZonedDateTime.from('2026-05-01T09:30+02:00[Europe/Paris]'),
      end: Temporal.ZonedDateTime.from('2026-05-01T11:00+02:00[Europe/Paris]'),
      resourceIds: ['r2'],
      display: 'auto',
      status: 'confirmed',
      busy: false,
      perms: { start: false, duration: false, resource: true },
      classNames: ['b'],
      tone: 'red',
      url: 'https://example.org',
      props: { room: { floor: 3 } },
      sourceId: 'api',
      zoneGuessed: true,
    };
    const ignored = new Set(['revision']);
    const keys = Object.keys(base).filter((k) => !ignored.has(k));
    // Every key of a fully populated event has a variant: the list above must grow with CalEvent.
    expect(keys.filter((k) => !(k in variants))).toEqual([]);
    for (const k of keys) {
      const changed = { ...base, [k]: variants[k] } as CalEvent;
      expect([k, eventEquals(base, changed)]).toEqual([k, false]);
    }
    expect(eventEquals(base, { ...base, revision: 99 })).toBe(true);
  });

  it('nested props from a fresh JSON fetch are equal, so a refetch changes nothing', () => {
    const a = ev({ ...FULL, extendedProps: JSON.parse('{"room":{"floor":2,"tags":["x"]}}') });
    const b = ev({ ...FULL, extendedProps: JSON.parse('{"room":{"floor":2,"tags":["x"]}}') });
    expect(a.props).not.toBe(b.props);
    expect(eventEquals(a, b)).toBe(true);
  });

  it('sameValue: structure for plain data, identity for anything else', () => {
    expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    class Box { constructor(readonly v: number) {} }
    expect(sameValue(new Box(1), new Box(1))).toBe(false);
    const f = () => 1;
    expect(sameValue(f, f)).toBe(true);
    expect(sameValue(NaN, NaN)).toBe(true);
  });

  it('an update that restates every field of a full event changes nothing (toInput loses nothing)', () => {
    const store = createEventStore();
    store.apply([{ kind: 'event', after: ev(FULL) }], 'api');
    const r = applyCommand(store.snapshot, { type: 'event.update', id: 'full', patch: {} }, { normalize: ctx() });
    expect(r.ok && r.mutations).toEqual([]);
  });
});

describe('an event editable by its own say (18k review)', () => {
  it('gaining or losing its own true is a change; a no-op patch keeps it; revoking one keeps the other', () => {
    const store = createEventStore();
    const n = (input: Parameters<typeof normalizeEvent>[0]) => {
      const r = normalizeEvent(input, ctx());
      if (!r.ok || r.value.kind !== 'event') throw new Error('bad');
      return r.value.event;
    };
    store.apply([{ kind: 'event', after: n({ id: 'a', start: '2026-05-01T09:00Z', duration: { minutes: 30 } }) }], 'api');
    const c = { normalize: ctx() };
    let r = applyCommand(store.snapshot, { type: 'event.update', id: 'a', patch: { durationEditable: true } }, c);
    expect(r.ok && r.mutations.length).toBe(1);
    store.apply(r.ok ? r.mutations : [], 'command');
    expect(store.snapshot.getEvent('a')!.perms.own).toEqual({ start: false, duration: true });
    r = applyCommand(store.snapshot, { type: 'event.update', id: 'a', patch: {} }, c);
    expect(r.ok && r.mutations).toEqual([]);
    r = applyCommand(store.snapshot, { type: 'event.update', id: 'a', patch: { durationEditable: false } }, c);
    store.apply(r.ok ? r.mutations : [], 'command');
    expect(store.snapshot.getEvent('a')!.perms.own).toBeUndefined();
  });
});
