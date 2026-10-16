import type { EpochMs, Instant } from './temporal.js';
import { Temporal } from './temporal.js';

/**
 * Half-open intervals `[start, end)` and the set algebra over them.
 *
 * Business hours, constraints and the free-slot engine all reduce to "these
 * stretches of time, minus those". Doing it on epoch milliseconds keeps every
 * operation a linear sweep; the Temporal objects are rebuilt only at the edge.
 *
 * Invariant of every function taking a list: the input is sorted and disjoint
 * (what `normalizeIntervals` produces), and so is the output. Empty spans are
 * dropped, never returned.
 */
export interface Interval {
  readonly start: Instant;
  readonly end: Instant;
}

export interface MsSpan {
  readonly s: EpochMs;
  readonly e: EpochMs;
}

/** Sorts, drops empty spans, and merges the ones that overlap or touch. O(n log n). */
export function normalizeIntervals(xs: readonly MsSpan[]): MsSpan[] {
  const sorted = xs.filter((x) => x.e > x.s).sort((a, b) => a.s - b.s || a.e - b.e);
  const out: MsSpan[] = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.s <= last.e) {
      if (x.e > last.e) out[out.length - 1] = { s: last.s, e: x.e };
    } else {
      out.push(x);
    }
  }
  return out;
}

/** O(a + b). */
export function unionSpans(a: readonly MsSpan[], b: readonly MsSpan[]): MsSpan[] {
  const merged: MsSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const x = j >= b.length || (i < a.length && a[i]!.s <= b[j]!.s) ? a[i++]! : b[j++]!;
    const last = merged[merged.length - 1];
    if (last && x.s <= last.e) {
      if (x.e > last.e) merged[merged.length - 1] = { s: last.s, e: x.e };
    } else {
      merged.push(x);
    }
  }
  return merged;
}

/** O(a + b). */
export function intersectSpans(a: readonly MsSpan[], b: readonly MsSpan[]): MsSpan[] {
  const out: MsSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i]!;
    const y = b[j]!;
    const s = Math.max(x.s, y.s);
    const e = Math.min(x.e, y.e);
    if (e > s) out.push({ s, e });
    if (x.e < y.e) i++;
    else j++;
  }
  return out;
}

/** What of `a` is not covered by `b`. O(a + b). */
export function subtractSpans(a: readonly MsSpan[], b: readonly MsSpan[]): MsSpan[] {
  const out: MsSpan[] = [];
  let j = 0;
  for (const x of a) {
    let s = x.s;
    while (j < b.length && b[j]!.e <= s) j++;
    let k = j;
    while (k < b.length && b[k]!.s < x.e) {
      const y = b[k]!;
      if (y.s > s) out.push({ s, e: y.s });
      s = Math.max(s, y.e);
      k++;
    }
    if (x.e > s) out.push({ s, e: x.e });
  }
  return out;
}

export function spansToIntervals(xs: readonly MsSpan[]): Interval[] {
  return xs.map((x) => ({
    start: Temporal.Instant.fromEpochMilliseconds(x.s),
    end: Temporal.Instant.fromEpochMilliseconds(x.e),
  }));
}
