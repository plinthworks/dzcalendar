/**
 * Stacking bars into rows (lanes) — the month grid and the timeline.
 * Positions are column indexes (days) or any unit; `end` is exclusive.
 */
export interface RowItem {
  readonly key: string;
  readonly start: number;
  readonly end: number;
  /** Compared element by element after start and length: all-day first, then the event order. */
  readonly rank: readonly number[];
}

export interface Packed {
  readonly lanes: ReadonlyMap<string, number>;
  readonly laneCount: number;
}

class MinHeap<T> {
  private readonly xs: T[] = [];
  constructor(private readonly less: (a: T, b: T) => boolean) {}
  get size(): number {
    return this.xs.length;
  }
  peek(): T | undefined {
    return this.xs[0];
  }
  push(x: T): void {
    const xs = this.xs;
    xs.push(x);
    let i = xs.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(xs[i]!, xs[p]!)) break;
      [xs[i], xs[p]] = [xs[p]!, xs[i]!];
      i = p;
    }
  }
  pop(): T | undefined {
    const xs = this.xs;
    const top = xs[0];
    const last = xs.pop();
    if (xs.length > 0 && last !== undefined) {
      xs[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < xs.length && this.less(xs[l]!, xs[m]!)) m = l;
        if (r < xs.length && this.less(xs[r]!, xs[m]!)) m = r;
        if (m === i) break;
        [xs[i], xs[m]] = [xs[m]!, xs[i]!];
        i = m;
      }
    }
    return top;
  }
}

const compareRank = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
};

/**
 * Each bar takes the lowest free lane. Sorted by start, longer first, then
 * rank; a heap of occupied lanes by end frees them as bars finish, a heap of
 * free lanes hands out the lowest. O(n log n).
 */
export function packLanes(items: readonly RowItem[]): Packed {
  const sorted = [...items].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || compareRank(a.rank, b.rank) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const busy = new MinHeap<{ end: number; lane: number }>((a, b) => a.end < b.end || (a.end === b.end && a.lane < b.lane));
  const free = new MinHeap<number>((a, b) => a < b);
  const lanes = new Map<string, number>();
  let laneCount = 0;
  for (const it of sorted) {
    while (busy.size > 0 && busy.peek()!.end <= it.start) free.push(busy.pop()!.lane);
    const lane = free.size > 0 ? free.pop()! : laneCount++;
    lanes.set(it.key, lane);
    busy.push({ end: Math.max(it.end, it.start + 1), lane });
  }
  return { lanes, laneCount };
}

export interface OverflowPiece {
  readonly key: string;
  readonly lane: number;
  /** Day indexes, `to` exclusive: the stretch of the bar that stays visible. */
  readonly from: number;
  readonly to: number;
}

export interface OverflowResult {
  readonly pieces: readonly OverflowPiece[];
  readonly hiddenPerDay: readonly number[];
  readonly hiddenKeysPerDay: readonly (readonly string[])[];
}

/**
 * What fits in `maxLanes` rows, day by day. On a day where anything spills
 * over, the last visible lane gives way to the "+N" link, so its bar is
 * hidden there too and counted in N. A bar that is hidden on some days is
 * cut into the visible stretches either side. O(items × days).
 */
export function computeOverflow(lanes: ReadonlyMap<string, number>, items: readonly RowItem[], dayCount: number, maxLanes: number): OverflowResult {
  // With 1, a day that overflows shows only its "+N" link: the one lane gives way.
  if (!Number.isInteger(maxLanes) || maxLanes < 1) throw new RangeError(`maxLanes must be an integer ≥ 1 (got ${maxLanes})`);
  const spills = new Array<boolean>(dayCount).fill(false);
  for (const it of items) {
    if ((lanes.get(it.key) ?? 0) < maxLanes) continue;
    for (let d = Math.max(0, it.start); d < Math.min(dayCount, it.end); d++) spills[d] = true;
  }
  const limit = (d: number) => (spills[d] ? maxLanes - 1 : maxLanes);

  const hiddenKeysPerDay: string[][] = Array.from({ length: dayCount }, () => []);
  const pieces: OverflowPiece[] = [];
  for (const it of items) {
    const lane = lanes.get(it.key) ?? 0;
    let runStart = -1;
    const from = Math.max(0, it.start);
    const to = Math.min(dayCount, Math.max(it.end, it.start + 1));
    for (let d = from; d <= to; d++) {
      const visible = d < to && lane < limit(d);
      if (d < to && !visible) hiddenKeysPerDay[d]!.push(it.key);
      if (visible && runStart === -1) runStart = d;
      if (!visible && runStart !== -1) {
        pieces.push({ key: it.key, lane, from: runStart, to: d });
        runStart = -1;
      }
    }
  }
  return { pieces, hiddenPerDay: hiddenKeysPerDay.map((k) => k.length), hiddenKeysPerDay };
}
