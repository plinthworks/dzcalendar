import { describe, it, expect } from 'vitest';
import { normalizeIntervals, unionSpans, intersectSpans, subtractSpans, spansToIntervals } from '../src/index.js';

const s = (pairs: [number, number][]) => pairs.map(([a, b]) => ({ s: a, e: b }));

describe('interval algebra on [start, end)', () => {
  it('normalize sorts, drops empty spans, merges overlapping and touching ones', () => {
    expect(normalizeIntervals(s([[5, 7], [1, 3], [3, 4], [6, 9], [10, 10]]))).toEqual(s([[1, 4], [5, 9]]));
  });

  it('union', () => {
    expect(unionSpans(s([[1, 3], [8, 9]]), s([[2, 5], [9, 12]]))).toEqual(s([[1, 5], [8, 12]]));
  });

  it('intersect keeps only shared stretches; touching is not sharing', () => {
    expect(intersectSpans(s([[1, 5], [8, 12]]), s([[3, 9], [12, 14]]))).toEqual(s([[3, 5], [8, 9]]));
  });

  it('subtract cuts holes and trims edges', () => {
    expect(subtractSpans(s([[0, 10], [20, 30]]), s([[2, 3], [5, 22], [29, 40]]))).toEqual(s([[0, 2], [3, 5], [22, 29]]));
    expect(subtractSpans(s([[0, 10]]), [])).toEqual(s([[0, 10]]));
    expect(subtractSpans(s([[0, 10]]), s([[0, 10]]))).toEqual([]);
  });

  it('agrees with a brute-force minute-by-minute check on random sets', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
    const set = () => normalizeIntervals(Array.from({ length: 6 }, () => { const a = rnd(100); return { s: a, e: a + rnd(20) }; }));
    const has = (xs: { s: number; e: number }[], m: number) => xs.some((x) => m >= x.s && m < x.e);
    for (let k = 0; k < 200; k++) {
      const a = set();
      const b = set();
      const u = unionSpans(a, b), i = intersectSpans(a, b), d = subtractSpans(a, b);
      for (let m = 0; m < 130; m++) {
        expect(has(u, m)).toBe(has(a, m) || has(b, m));
        expect(has(i, m)).toBe(has(a, m) && has(b, m));
        expect(has(d, m)).toBe(has(a, m) && !has(b, m));
      }
    }
  });

  it('spansToIntervals gives instants', () => {
    expect(spansToIntervals(s([[0, 60000]]))[0]!.end.toString()).toBe('1970-01-01T00:01:00Z');
  });
});
