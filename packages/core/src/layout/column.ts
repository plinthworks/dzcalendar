/**
 * Side-by-side placement of overlapping events in one time column.
 *
 * Positions are axis units (minutes on the column's axis), never pixels: the
 * DOM turns fractions into CSS, and this stays testable without a browser.
 */
export interface ColItem {
  readonly key: string;
  readonly start: number;
  readonly end: number;
  /** Tie-breaker after start and length: the calendar's event order. */
  readonly order: number;
}

export interface ColPlacement {
  readonly key: string;
  readonly lane: number;
  /** Lanes in this item's cluster of overlapping events. */
  readonly lanes: number;
  /** Fractions of the column width, 0..1. */
  readonly left: number;
  readonly width: number;
  readonly z: number;
}

export interface ColumnLayoutOptions {
  /**
   * The smallest height an event is drawn at, in axis units. A ten-minute
   * event drawn as thirty must be laid out as thirty, or it is drawn on top
   * of its neighbour.
   */
  readonly minVisual: number;
  readonly mode?: 'side-by-side' | 'cascade';
  /** Cascade only: the offset of each level, as a fraction. */
  readonly indent?: number;
}

interface Item {
  readonly key: string;
  readonly start: number;
  readonly end: number;
  readonly order: number;
  lane: number;
  span: number;
}

/**
 * Sweep, then greedy interval colouring: sorted by start, each item takes the
 * first lane whose last item has ended. For intervals this is optimal — the
 * lane count of a cluster equals its largest set of mutually overlapping
 * items. Then each item widens rightwards over lanes that stay free for its
 * whole span. O(n log n) to sort, O(n · lanes) at worst to widen.
 */
export function layoutColumn(items: readonly ColItem[], o: ColumnLayoutOptions): ColPlacement[] {
  const sorted: Item[] = items
    .map((x) => ({ key: x.key, start: x.start, end: Math.max(x.end, x.start + o.minVisual), order: x.order, lane: 0, span: 1 }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const out: ColPlacement[] = [];
  let i = 0;
  while (i < sorted.length) {
    // One cluster: items connected by overlap.
    const cluster: Item[] = [];
    let clusterEnd = -Infinity;
    while (i < sorted.length && (cluster.length === 0 || sorted[i]!.start < clusterEnd)) {
      const it = sorted[i++]!;
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.end);
    }

    const laneEnds: number[] = [];
    const byLane: Item[][] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = it.end;
      (byLane[lane] ??= []).push(it);
      it.lane = lane;
    }
    const lanes = laneEnds.length;

    if (o.mode === 'cascade') {
      const indent = o.indent ?? 0.1;
      cluster.forEach((it, z) => {
        const left = Math.min(it.lane * indent, 1 - indent);
        out.push({ key: it.key, lane: it.lane, lanes, left, width: 1 - left, z });
      });
      continue;
    }

    for (const it of cluster) {
      let span = 1;
      for (let l = it.lane + 1; l < lanes && !overlapsLane(byLane[l]!, it.start, it.end); l++) span++;
      it.span = span;
      out.push({ key: it.key, lane: it.lane, lanes, left: it.lane / lanes, width: span / lanes, z: it.lane });
    }
  }
  return out;
}

/** Items of one lane are sorted by start and disjoint: the last one starting before `end` is the only candidate. */
function overlapsLane(lane: readonly Item[], start: number, end: number): boolean {
  let lo = 0;
  let hi = lane.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lane[mid]!.start < end) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 && lane[found]!.end > start;
}
