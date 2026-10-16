import { describe, it, expect } from 'vitest';
import { PersistentOrderedMap, PersistentIntervalTree, epochDay, fromEpochDay, Temporal } from '../src/index.js';

/** A small deterministic generator, so a failing case can be replayed. */
const rng = (seed: number) => () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

describe('PersistentOrderedMap', () => {
  it('matches a plain Map over random operations, in key order', () => {
    const r = rng(1);
    let m = PersistentOrderedMap.emptyStrings<number>();
    const ref = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      const k = `k${Math.floor(r() * 400)}`;
      if (r() < 0.65) {
        m = m.set(k, i);
        ref.set(k, i);
      } else {
        m = m.delete(k);
        ref.delete(k);
      }
    }
    expect(m.size).toBe(ref.size);
    expect([...m.entries()]).toEqual([...ref.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  });

  it('never changes an old version', () => {
    const a = PersistentOrderedMap.emptyStrings<number>().set('x', 1).set('y', 2);
    const b = a.set('x', 10).delete('y').set('z', 3);
    expect([...a.entries()]).toEqual([['x', 1], ['y', 2]]);
    expect([...b.entries()]).toEqual([['x', 10], ['z', 3]]);
  });

  it('deleting a missing key returns the same map', () => {
    const a = PersistentOrderedMap.emptyStrings<number>().set('x', 1);
    expect(a.delete('nope')).toBe(a);
  });

  it('stays balanced: 100 000 sorted inserts iterate without blowing the stack', () => {
    let m = PersistentOrderedMap.empty<number, number>((a, b) => a - b);
    for (let i = 0; i < 100_000; i++) m = m.set(i, i);
    let n = 0;
    for (const _ of m.entries()) n++;
    expect(n).toBe(100_000);
  });
});

describe('PersistentIntervalTree', () => {
  it('overlapping() agrees with a linear scan on random intervals', () => {
    const r = rng(2);
    let t = PersistentIntervalTree.EMPTY;
    const ref = new Map<string, [number, number]>();
    for (let i = 0; i < 2000; i++) {
      const id = `e${Math.floor(r() * 600)}`;
      const old = ref.get(id);
      if (old) {
        t = t.remove(old[0], id);
        ref.delete(id);
      }
      if (r() < 0.8) {
        const s = Math.floor(r() * 10_000);
        const e = s + 1 + Math.floor(r() * 500);
        t = t.insert(s, e, id);
        ref.set(id, [s, e]);
      }
    }
    expect(t.size).toBe(ref.size);
    for (let q = 0; q < 300; q++) {
      const qs = Math.floor(r() * 10_500) - 200;
      const qe = qs + Math.floor(r() * 800);
      const got: string[] = [];
      t.overlapping(qs, qe, (id) => got.push(id));
      const want = [...ref].filter(([, [s, e]]) => s < qe && e > qs).map(([id]) => id);
      expect(got.sort()).toEqual(want.sort());
    }
  });

  it('is half-open: touching is not overlapping', () => {
    const t = PersistentIntervalTree.EMPTY.insert(10, 20, 'a');
    const hit = (qs: number, qe: number) => {
      const out: string[] = [];
      t.overlapping(qs, qe, (id) => out.push(id));
      return out;
    };
    expect(hit(20, 30)).toEqual([]);
    expect(hit(0, 10)).toEqual([]);
    expect(hit(19, 20)).toEqual(['a']);
  });

  it('two entries with the same start but different ids coexist', () => {
    const t = PersistentIntervalTree.EMPTY.insert(5, 6, 'a').insert(5, 9, 'b');
    expect(t.size).toBe(2);
    expect(t.remove(5, 'a').size).toBe(1);
  });
});

describe('epochDay', () => {
  it('agrees with Temporal on dates across eras, leap days and centuries', () => {
    const epoch = Temporal.PlainDate.from('1970-01-01');
    for (const s of ['1970-01-01', '1969-12-31', '2000-02-29', '1900-03-01', '2026-10-25', '0001-01-01', '-000400-03-01', '+275760-09-13', '-271821-04-19']) {
      const d = Temporal.PlainDate.from(s);
      expect(epochDay(d)).toBe(epoch.until(d, { largestUnit: 'days' }).days);
      expect(fromEpochDay(epochDay(d)).toString()).toBe(d.toString());
    }
  });
});
