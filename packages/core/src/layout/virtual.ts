/**
 * Window maths for virtual scrolling: which rows or columns are on screen.
 * Pure numbers; the DOM measures, this decides.
 */

/** Offsets of items of varying size, updatable in O(log n) (a Fenwick tree). */
export class PrefixSums {
  private readonly tree: Float64Array;
  private readonly sizes: Float64Array;

  constructor(sizes: ArrayLike<number>) {
    const n = sizes.length;
    this.sizes = Float64Array.from(sizes);
    this.tree = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      this.tree[i + 1]! += this.sizes[i]!;
      const parent = i + 1 + ((i + 1) & -(i + 1));
      if (parent <= n) this.tree[parent]! += this.tree[i + 1]!;
    }
  }

  get count(): number {
    return this.sizes.length;
  }

  get total(): number {
    return this.offsetOf(this.sizes.length);
  }

  set(i: number, size: number): void {
    const delta = size - this.sizes[i]!;
    this.sizes[i] = size;
    for (let j = i + 1; j < this.tree.length; j += j & -j) this.tree[j]! += delta;
  }

  /** Where item `i` starts: the sum of the sizes before it. */
  offsetOf(i: number): number {
    let sum = 0;
    for (let j = i; j > 0; j -= j & -j) sum += this.tree[j]!;
    return sum;
  }

  /** The item covering `offset` (clamped to the first and last). O(log n). */
  indexAt(offset: number): number {
    const n = this.sizes.length;
    if (n === 0) return 0;
    // Descend to the last position whose prefix is ≤ offset: leading items of
    // size zero are passed over, so offset 0 lands on the first real item.
    let pos = 0;
    let rest = Math.max(0, offset);
    for (let step = 1 << Math.floor(Math.log2(n)); step > 0; step >>= 1) {
      const next = pos + step;
      if (next <= n && this.tree[next]! <= rest) {
        pos = next;
        rest -= this.tree[next]!;
      }
    }
    return Math.min(pos, n - 1);
  }
}

/** Inclusive. Empty when `last < first`. */
export interface VRange {
  readonly first: number;
  readonly last: number;
}

export type Sizes = PrefixSums | { readonly uniform: number; readonly count: number };

export function visibleRange(sizes: Sizes, scroll: number, viewport: number, overscan: number): VRange {
  const count = sizes instanceof PrefixSums ? sizes.count : sizes.count;
  if (count === 0) return { first: 0, last: -1 };
  if (!(sizes instanceof PrefixSums) && !(sizes.uniform > 0)) throw new RangeError(`uniform size must be > 0 (got ${sizes.uniform})`);
  let first: number;
  let last: number;
  if (sizes instanceof PrefixSums) {
    first = sizes.indexAt(scroll);
    last = sizes.indexAt(Math.max(scroll, scroll + viewport - 1e-9));
  } else {
    first = Math.floor(Math.max(0, scroll) / sizes.uniform);
    last = Math.floor(Math.max(0, scroll + viewport - 1e-9) / sizes.uniform);
  }
  return { first: Math.max(0, Math.min(count - 1, first) - overscan), last: Math.min(count - 1, last + overscan) };
}

export function visible2D(
  rows: Sizes,
  cols: Sizes,
  scrollTop: number,
  scrollLeft: number,
  width: number,
  height: number,
  overscan: number,
): { rows: VRange; cols: VRange } {
  return { rows: visibleRange(rows, scrollTop, height, overscan), cols: visibleRange(cols, scrollLeft, width, overscan) };
}
