import { layoutColumn } from '../layout/column.js';
import { packLanes } from '../layout/rows.js';
import { buildColumnAxis } from '../project/time-axis.js';
import type { AxisMode, ColumnAxis } from '../project/time-axis.js';
import { dateIndex, segmentAllDay, segmentTimed } from '../project/segment.js';
import type { Segment, TimedSegment } from '../project/segment.js';
import { viewWindow } from '../store/store.js';
import type { StoreSnapshot } from '../store/store.js';
import type { DurationLike, PlainDate, ZoneId } from '../temporal.js';
import type { ViewRange } from './spec.js';
import { isBackground } from './daygrid.js';

export interface TimeGridOptions {
  readonly displayZone: ZoneId;
  readonly axis?: AxisMode;
  readonly slotMin?: DurationLike;
  readonly slotMax?: DurationLike;
  /** The shortest an event is drawn, in minutes. Default 15. */
  readonly minEventMinutes?: number;
  readonly resourceId?: string;
}

/** A timed piece placed in its column. Vertical in axis minutes, horizontal in fractions. */
export interface PlacedTimed {
  readonly segment: TimedSegment;
  readonly top: number;
  readonly height: number;
  readonly left: number;
  readonly width: number;
  readonly lane: number;
  readonly lanes: number;
  readonly z: number;
}

export interface TimeGridColumn {
  readonly date: PlainDate;
  readonly axis: ColumnAxis;
  readonly events: readonly PlacedTimed[];
  /** `display: 'background'` events: full width, under the others. */
  readonly background: readonly PlacedTimed[];
}

export interface AllDayBar {
  readonly segment: Segment;
  readonly lane: number;
}

export interface TimeGridModel {
  readonly range: ViewRange;
  readonly columns: readonly TimeGridColumn[];
  readonly allDay: { readonly bars: readonly AllDayBar[]; readonly lanes: number; readonly background: readonly Segment[] };
}

/**
 * Everything a time grid draws, as data: per shown day, its axis (with DST
 * bands), its events placed side by side; above, the all-day row. Pure —
 * the same snapshot and options give the same model, testable without a DOM.
 */
export function buildTimeGridModel(range: ViewRange, snap: StoreSnapshot, o: TimeGridOptions): TimeGridModel {
  const mode = o.axis ?? 'wall';
  const axes = range.dates.map((date) =>
    buildColumnAxis(date, o.displayZone, { mode, ...(o.slotMin !== undefined && { slotMin: o.slotMin }), ...(o.slotMax !== undefined && { slotMax: o.slotMax }) }),
  );
  const days = axes.map((a) => a.day);
  const instances = snap.queryInstances(viewWindow(range.start, range.end, o.displayZone), o.resourceId !== undefined ? { resourceId: o.resourceId } : {});

  const perColumn: TimedSegment[][] = axes.map(() => []);
  const allDaySegs: Segment[] = [];
  const allDayBg: Segment[] = [];
  const view = dateIndex(range.dates);
  instances.forEach((inst) => {
    if (inst.event.allDay) (isBackground(inst.event.display) ? allDayBg : allDaySegs).push(...segmentAllDay(inst, view));
    else for (const seg of segmentTimed(inst, days, { cutAtRepeat: mode === 'wall' })) perColumn[seg.dayIndex]!.push(seg);
  });

  const minVisual = o.minEventMinutes ?? 15;
  const order = new Map(instances.map((inst, i) => [inst.key, i]));
  const columns = axes.map((axis, c): TimeGridColumn => {
    // Only what falls inside the axis's hours: an event at 22:00 in an
    // 08:00–20:00 grid is not drawn as a sliver at the bottom. A piece cut by
    // the axis loses its rounded end, like one cut by midnight.
    const aStart = axis.start.epochMilliseconds;
    const aEnd = axis.end.epochMilliseconds;
    const segs = perColumn[c]!.flatMap((seg): TimedSegment[] => {
      const f = seg.from.epochMilliseconds;
      const t = seg.to.epochMilliseconds;
      const inside = f === t ? f >= aStart && f < aEnd : t > aStart && f < aEnd;
      if (!inside) return [];
      if (f >= aStart && t <= aEnd) return [seg];
      return [{ ...seg, startsHere: seg.startsHere && f >= aStart, endsHere: seg.endsHere && t <= aEnd }];
    });
    const vertical = new Map(
      segs.map((seg) => {
        const top = axis.toPosition(seg.from);
        return [seg.key, { seg, top, height: Math.max(0, axis.toEndPosition(seg.to) - top) }] as const;
      }),
    );
    const isBg = (seg: TimedSegment) => isBackground(seg.instance.event.display);
    const fg = segs.filter((s) => !isBg(s));
    const placements = layoutColumn(
      fg.map((seg) => {
        const v = vertical.get(seg.key)!;
        return { key: seg.key, start: v.top, end: v.top + v.height, order: order.get(seg.instance.key) ?? 0 };
      }),
      { minVisual },
    );
    const events = placements.map((p): PlacedTimed => {
      const v = vertical.get(p.key)!;
      return { segment: v.seg, top: v.top, height: v.height, left: p.left, width: p.width, lane: p.lane, lanes: p.lanes, z: p.z };
    });
    const background = segs.filter(isBg).map((seg): PlacedTimed => {
      const v = vertical.get(seg.key)!;
      return { segment: seg, top: v.top, height: v.height, left: 0, width: 1, lane: 0, lanes: 1, z: -1 };
    });
    return { date: axis.day.date, axis, events, background };
  });

  const packed = packLanes(allDaySegs.map((s) => ({ key: s.key, start: s.dayIndex, end: s.dayIndex + s.dayCount, rank: [order.get(s.instance.key) ?? 0] })));
  return {
    range,
    columns,
    allDay: { bars: allDaySegs.map((segment) => ({ segment, lane: packed.lanes.get(segment.key)! })), lanes: packed.laneCount, background: allDayBg },
  };
}
