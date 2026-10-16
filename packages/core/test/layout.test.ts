import { describe, it, expect } from 'vitest';
import { layoutColumn, packLanes, computeOverflow, PrefixSums, visibleRange } from '../src/index.js';
import type { ColItem, RowItem } from '../src/index.js';

const rng = (seed: number) => () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

/** The largest number of intervals sharing one point: the fewest lanes possible. */
function maxClique(xs: { start: number; end: number }[]): number {
  const ev = xs.flatMap((x) => [[x.start, 1], [x.end, -1]] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let best = 0;
  for (const [, d] of ev) best = Math.max(best, (cur += d));
  return best;
}

describe('layoutColumn', () => {
  it('on 1000 random columns: lanes = largest overlap, no two items in one lane overlap, widening hits nobody', () => {
    const r = rng(3);
    for (let k = 0; k < 1000; k++) {
      const items: ColItem[] = Array.from({ length: 1 + Math.floor(r() * 25) }, (_, i) => {
        const start = Math.floor(r() * 1400);
        return { key: `e${i}`, start, end: start + 15 + Math.floor(r() * 180), order: i };
      });
      const placed = layoutColumn(items, { minVisual: 15 });
      expect(placed).toHaveLength(items.length);
      const byKey = new Map(items.map((x) => [x.key, x]));
      // Clusters: each lanes value equals the max overlap of its cluster; overall max equals overall clique.
      expect(Math.max(...placed.map((p) => p.lanes))).toBe(maxClique(items));
      for (const a of placed) {
        expect(a.left + a.width).toBeLessThanOrEqual(1 + 1e-9);
        for (const b of placed) {
          if (a === b) continue;
          const x = byKey.get(a.key)!;
          const y = byKey.get(b.key)!;
          const overlap = x.start < y.end && y.start < x.end;
          const horizontally = a.left < b.left + b.width - 1e-9 && b.left < a.left + a.width - 1e-9;
          if (overlap) expect([a.key, b.key, horizontally]).toEqual([a.key, b.key, false]);
        }
      }
    }
  });

  it('a short event is laid out as tall as it is drawn', () => {
    const placed = layoutColumn([{ key: 'a', start: 0, end: 5, order: 0 }, { key: 'b', start: 10, end: 60, order: 1 }], { minVisual: 30 });
    expect(placed.map((p) => p.lanes)).toEqual([2, 2]);
  });

  it('an item widens over lanes that stay free', () => {
    const placed = layoutColumn(
      [
        { key: 'long', start: 0, end: 120, order: 0 },
        { key: 'a', start: 0, end: 30, order: 1 },
        { key: 'b', start: 0, end: 30, order: 2 },
        { key: 'late', start: 60, end: 90, order: 3 },
      ],
      { minVisual: 15 },
    );
    const late = placed.find((p) => p.key === 'late')!;
    expect([late.lane, late.lanes, late.width]).toEqual([1, 3, 2 / 3]);
  });

  it('cascade offsets each level and keeps them in order', () => {
    const placed = layoutColumn([{ key: 'a', start: 0, end: 60, order: 0 }, { key: 'b', start: 10, end: 60, order: 1 }], { minVisual: 15, mode: 'cascade', indent: 0.2 });
    expect(placed.map((p) => [p.left, p.width, p.z])).toEqual([[0, 1, 0], [0.2, 0.8, 1]]);
  });
});

describe('packLanes and computeOverflow', () => {
  it('packs random bars without overlap, in as many lanes as the largest overlap', () => {
    const r = rng(5);
    for (let k = 0; k < 500; k++) {
      const items: RowItem[] = Array.from({ length: Math.floor(r() * 30) }, (_, i) => {
        const start = Math.floor(r() * 7);
        return { key: `b${i}`, start, end: start + 1 + Math.floor(r() * 3), rank: [i] };
      });
      const { lanes, laneCount } = packLanes(items);
      expect(laneCount).toBe(maxClique(items));
      for (const a of items) for (const b of items) {
        if (a !== b && lanes.get(a.key) === lanes.get(b.key)) expect(a.start < b.end && b.start < a.end).toBe(false);
      }
    }
  });

  it('every bar on every day is either drawn or counted in +N, never both', () => {
    const r = rng(8);
    for (let k = 0; k < 500; k++) {
      const items: RowItem[] = Array.from({ length: Math.floor(r() * 25) }, (_, i) => {
        const start = Math.floor(r() * 7);
        return { key: `b${i}`, start, end: Math.min(7, start + 1 + Math.floor(r() * 4)), rank: [i] };
      });
      const { lanes } = packLanes(items);
      const max = 1 + Math.floor(r() * 4);
      const over = computeOverflow(lanes, items, 7, max);
      for (let d = 0; d < 7; d++) {
        const covering = items.filter((it) => it.start <= d && d < it.end).map((it) => it.key).sort();
        const drawn = over.pieces.filter((p) => p.from <= d && d < p.to).map((p) => p.key);
        const hidden = over.hiddenKeysPerDay[d]!;
        expect([...drawn, ...hidden].sort()).toEqual(covering);
        expect(over.hiddenPerDay[d]).toBe(hidden.length);
        // Drawn bars never reach past the lanes left once "+N" takes one.
        const limit = hidden.length > 0 ? max - 1 : max;
        for (const p of over.pieces.filter((p) => p.from <= d && d < p.to)) expect(p.lane).toBeLessThan(limit);
      }
    }
  });
});

it('computeOverflow: maxLanes 1 leaves only "+N" on a crowded day; 0 or a fraction is refused', () => {
  const items = [{ key: 'a', start: 0, end: 1, rank: [0] }, { key: 'b', start: 0, end: 1, rank: [1] }];
  const { lanes } = packLanes(items);
  const over = computeOverflow(lanes, items, 1, 1);
  expect([over.pieces, over.hiddenPerDay]).toEqual([[], [2]]);
  expect(() => computeOverflow(lanes, items, 1, 0)).toThrow(RangeError);
  expect(() => computeOverflow(lanes, items, 1, 1.5)).toThrow(RangeError);
});

describe('PrefixSums and visibleRange', () => {
  it('agrees with a naive sum after random updates', () => {
    const r = rng(11);
    const sizes = Array.from({ length: 200 }, () => Math.floor(r() * 50));
    const ps = new PrefixSums(sizes);
    for (let k = 0; k < 300; k++) {
      const i = Math.floor(r() * 200);
      sizes[i] = Math.floor(r() * 50);
      ps.set(i, sizes[i]!);
      const j = Math.floor(r() * 201);
      expect(ps.offsetOf(j)).toBe(sizes.slice(0, j).reduce((a, b) => a + b, 0));
    }
    expect(ps.total).toBe(sizes.reduce((a, b) => a + b, 0));
  });

  it('indexAt finds the item under an offset, skipping zero-size items', () => {
    const ps = new PrefixSums([10, 0, 10, 30]);
    expect([0, 9, 10, 19, 20, 49, 999].map((o) => ps.indexAt(o))).toEqual([0, 0, 2, 2, 3, 3, 3]);
    expect([0, 1, 2, -5].map((o) => new PrefixSums([0, 2, 3]).indexAt(o))).toEqual([1, 1, 2, 1]);
  });

  it('visibleRange with overscan, uniform and variable', () => {
    expect(visibleRange({ uniform: 20, count: 100 }, 200, 100, 2)).toEqual({ first: 8, last: 16 });
    expect(visibleRange(new PrefixSums([50, 50, 50, 50]), 60, 50, 0)).toEqual({ first: 1, last: 2 });
    expect(visibleRange({ uniform: 20, count: 0 }, 0, 100, 2)).toEqual({ first: 0, last: -1 });
    expect(() => visibleRange({ uniform: 0, count: 10 }, 0, 100, 2)).toThrow(RangeError);
  });
});
