import { computeOverflow, packLanes } from '../layout/rows.js';
import type { RowItem } from '../layout/rows.js';
import { dateIndex, segmentAllDay, segmentTimed, splitByWeek } from '../project/segment.js';
import type { Segment } from '../project/segment.js';
import { viewWindow } from '../store/store.js';
import type { StoreSnapshot } from '../store/store.js';
import type { PlainDate, ZoneId } from '../temporal.js';
import { dayInfo } from '../zone.js';
import type { ViewRange } from './spec.js';
import type { EventDisplay } from '../event/types.js';

/** Inverse background is drawn by the DOM as the complement; neither takes a lane. */
export const isBackground = (d: EventDisplay): boolean => d === 'background' || d === 'inverse-background';

export interface DayGridOptions {
  readonly displayZone: ZoneId;
  /** Rows of bars per day before "+N". Unlimited when absent. */
  readonly maxLanes?: number;
  readonly resourceId?: string;
}

export interface DayGridBar {
  readonly segment: Segment;
  readonly lane: number;
  /** Week-row columns this bar is drawn over, `to` exclusive; several pieces when "+N" cuts it. */
  readonly pieces: readonly { readonly from: number; readonly to: number }[];
}

export interface DayGridWeek {
  readonly dates: readonly PlainDate[];
  /** `display: 'background'` events: tint whole days, take no lane, never hide anything behind "+N". */
  readonly background: readonly Segment[];
  /** Index of this row's first date in `range.dates`. */
  readonly firstColumn: number;
  readonly bars: readonly DayGridBar[];
  readonly laneCount: number;
  /** Per day of the row: how many events the "+N" link stands for, and which. */
  readonly hiddenPerDay: readonly number[];
  readonly hiddenKeysPerDay: readonly (readonly string[])[];
}

export interface DayGridModel {
  readonly range: ViewRange;
  readonly weeks: readonly DayGridWeek[];
}

/**
 * A month (or week, or day) as rows of bars. All-day events span their
 * days; a timed event sits on each display-zone day it touches, so a
 * late-night event in Tokyo lands on the right day in Paris. All-day first,
 * then by start: the order of `queryInstances`.
 */
export function buildDayGridModel(range: ViewRange, snap: StoreSnapshot, o: DayGridOptions): DayGridModel {
  const view = dateIndex(range.dates);
  const days = range.dates.map((d) => dayInfo(d, o.displayZone));
  const instances = snap.queryInstances(viewWindow(range.start, range.end, o.displayZone), o.resourceId !== undefined ? { resourceId: o.resourceId } : {});

  const segs: Segment[] = [];
  const rank = new Map<string, readonly number[]>();
  const bgSegs: Segment[] = [];
  instances.forEach((inst, i) => {
    rank.set(inst.key, [inst.event.allDay ? 0 : 1, i]);
    const out = isBackground(inst.event.display) ? bgSegs : segs;
    if (inst.event.allDay) out.push(...segmentAllDay(inst, view));
    else out.push(...segmentTimed(inst, days));
  });

  let col = 0;
  const weekCols = range.weeks.map((w) => w.map(() => col++));
  const rows = splitByWeek(segs, weekCols);
  const bgRows = splitByWeek(bgSegs, weekCols);

  const weeks = range.weeks.map((dates, r): DayGridWeek => {
    const first = weekCols[r]![0] ?? 0;
    const items: RowItem[] = rows[r]!.map((s) => ({ key: s.key, start: s.dayIndex - first, end: s.dayIndex - first + s.dayCount, rank: rank.get(s.instance.key)! }));
    const { lanes, laneCount } = packLanes(items);
    const bySeg = new Map(rows[r]!.map((s) => [s.key, s]));
    if (o.maxLanes === undefined || laneCount <= o.maxLanes) {
      const bars = items.map((it) => ({ segment: bySeg.get(it.key)!, lane: lanes.get(it.key)!, pieces: [{ from: it.start, to: it.end }] }));
      return { dates, firstColumn: first, background: bgRows[r]!, bars, laneCount, hiddenPerDay: dates.map(() => 0), hiddenKeysPerDay: dates.map(() => []) };
    }
    const over = computeOverflow(lanes, items, dates.length, o.maxLanes);
    const piecesOf = new Map<string, { from: number; to: number }[]>();
    for (const p of over.pieces) (piecesOf.get(p.key) ?? piecesOf.set(p.key, []).get(p.key)!).push({ from: p.from, to: p.to });
    const bars = items
      .filter((it) => piecesOf.has(it.key))
      .map((it) => ({ segment: bySeg.get(it.key)!, lane: lanes.get(it.key)!, pieces: piecesOf.get(it.key)! }));
    return { dates, firstColumn: first, background: bgRows[r]!, bars, laneCount, hiddenPerDay: over.hiddenPerDay, hiddenKeysPerDay: over.hiddenKeysPerDay };
  });
  return { range, weeks };
}
