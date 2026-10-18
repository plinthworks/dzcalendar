import { computeOverflow, packLanes } from '../layout/rows.js';
import type { RowItem } from '../layout/rows.js';
import { dateIndex, segmentAllDay, segmentTimed, splitByWeek } from '../project/segment.js';
import type { Segment } from '../project/segment.js';
import { viewWindow } from '../store/store.js';
import type { StoreChange } from '../store/changes.js';
import { epochDay } from '../days.js';
import type { StoreSnapshot } from '../store/store.js';
import { Temporal } from '../temporal.js';
import type { PlainDate, ZoneId } from '../temporal.js';
import { businessIntervals } from '../rules/business-hours.js';
import type { BusinessHoursInput } from '../rules/business-hours.js';
import { dayInfo } from '../zone.js';
import type { ViewRange } from './spec.js';
import type { EventDisplay } from '../event/types.js';
import type { Resource } from '../resource/types.js';
import type { ResourceGroupHead, ResourceHead } from './timegrid.js';

/** Inverse background is drawn by the DOM as the complement; neither takes a lane. */
export const isBackground = (d: EventDisplay): boolean => d === 'background' || d === 'inverse-background';

export interface DayGridOptions {
  readonly displayZone: ZoneId;
  /** Rows of bars per day before "+N". Unlimited when absent or null. */
  readonly maxLanes?: number | null;
  readonly resourceId?: string;
  /**
   * A resource view: in each row, every resource's days side by side
   * (resources first). Each resource's cells show its events, and are
   * `closed` by its own business hours, read in its zone.
   */
  readonly resources?: readonly Resource[];
  readonly resourceGroups?: readonly ResourceGroupHead[];
  /** Days without any open hour are marked `closed`. */
  readonly businessHours?: BusinessHoursInput;
  /** False: padding days outside the month are left empty — no events drawn there. Default true. */
  readonly showNonCurrentDates?: boolean;
}

export interface DayGridBar {
  readonly segment: Segment;
  readonly lane: number;
  /** Week-row columns this bar is drawn over, `to` exclusive; several pieces when "+N" cuts it. */
  readonly pieces: readonly { readonly from: number; readonly to: number }[];
}

export interface DayGridWeek {
  /** One per cell: in a resource view, the week's dates once per resource. */
  readonly dates: readonly PlainDate[];
  /** Per cell, whose it is (null outside a resource view). */
  readonly resources: readonly (Resource | null)[];
  /** `display: 'background'` events: tint whole days, take no lane, never hide anything behind "+N". */
  readonly background: readonly Segment[];
  /** Index of this row's first cell among all the rows' cells (`range.dates` outside a resource view): `dayIndex - firstColumn` is a cell. */
  readonly firstColumn: number;
  readonly bars: readonly DayGridBar[];
  readonly laneCount: number;
  /** Per day of the row: how many events the "+N" link stands for, and which. */
  readonly hiddenPerDay: readonly number[];
  readonly hiddenKeysPerDay: readonly (readonly string[])[];
  /** Every bar of the row, drawn or not: what the "+N" popover lists. */
  readonly segments: readonly Segment[];
  /** Per day: outside the active period (a padding day of a month grid). */
  readonly outside: readonly boolean[];
  /** Per day: no business hour at all (always false without `businessHours`). */
  readonly closed: readonly boolean[];
}

export interface DayGridModel {
  /** The store version the model reflects. */
  readonly version: number;
  readonly range: ViewRange;
  readonly options: DayGridOptions;
  readonly weeks: readonly DayGridWeek[];
  /** The lanes a day shows before "+N"; null: as many as needed. */
  readonly maxLanes: number | null;
  /** A resource view's heads, over a row's cells. Empty otherwise. */
  readonly resourceHeads: readonly ResourceHead[];
  readonly groupHeads: readonly ResourceGroupHead[];
}

/**
 * A month (or week, or day) as rows of bars. All-day events span their
 * days; a timed event sits on each display-zone day it touches, so a
 * late-night event in Tokyo lands on the right day in Paris. All-day first,
 * then by start: the order of `queryInstances`.
 */
export function buildDayGridModel(range: ViewRange, snap: StoreSnapshot, o: DayGridOptions): DayGridModel {
  const inActive = (d: PlainDate) =>
    Temporal.PlainDate.compare(d, range.activeStart) >= 0 && Temporal.PlainDate.compare(d, range.activeEnd) < 0;
  const hideOutside = o.showNonCurrentDates === false;
  // Hidden padding days keep their columns but take no segment.
  const full = dateIndex(range.dates);
  const view = hideOutside ? { dates: range.dates, colOf: (d: PlainDate) => (inActive(d) ? full.colOf(d) : -1) } : full;
  const days = range.dates.map((d) => dayInfo(d, o.displayZone));

  let col = 0;
  const weekCols = range.weeks.map((w) => w.map(() => col++));
  const owners: (Resource | null)[] = o.resources ? [...o.resources] : [null];
  const per = owners.length;
  // Cells: each row holds every owner's days; `cellStart[r]` is the row's first cell among all rows.
  const cellStart: number[] = [];
  let cells = 0;
  for (const w of range.weeks) {
    cellStart.push(cells);
    cells += w.length * per;
  }
  // A real day's index (in range.dates) to its cell for owner `k`.
  const rowOf: number[] = [];
  weekCols.forEach((cs, r) => cs.forEach(() => rowOf.push(r)));
  const cellOf = (dayIndex: number, k: number) => {
    const r = rowOf[dayIndex]!;
    return cellStart[r]! + k * range.weeks[r]!.length + (dayIndex - weekCols[r]![0]!);
  };

  const rows: Segment[][] = range.weeks.map(() => []);
  const bgRows: Segment[][] = range.weeks.map(() => []);
  const rank = new Map<string, readonly number[]>();
  owners.forEach((resource, k) => {
    const filter = resource ? { resourceId: resource.id } : o.resourceId !== undefined ? { resourceId: o.resourceId } : {};
    const instances = snap.queryInstances(viewWindow(range.start, range.end, o.displayZone), filter);
    const segs: Segment[] = [];
    const bgSegs: Segment[] = [];
    instances.forEach((inst, i) => {
      rank.set(inst.key, [inst.event.allDay ? 0 : 1, i]);
      const out = isBackground(inst.event.display) ? bgSegs : segs;
      if (inst.event.allDay) out.push(...segmentAllDay(inst, view));
      else out.push(...segmentTimed(inst, days).filter((sg) => !hideOutside || inActive(range.dates[sg.dayIndex]!)));
    });
    // Split by real weeks, then each piece moved to the owner's cells; its own key per owner.
    const place = (into: Segment[][], split: Segment[][]) =>
      split.forEach((row, r) => {
        for (const sg of row) into[r]!.push(resource ? { ...sg, key: `${sg.key}|${resource.id}`, dayIndex: cellOf(sg.dayIndex, k) } : sg);
      });
    place(rows, splitByWeek(segs, weekCols));
    place(bgRows, splitByWeek(bgSegs, weekCols));
  });

  // Business hours per owner: its own (else the calendar's), read in its zone.
  const closedFor = owners.map((resource) => {
    const hours = resource?.businessHours ?? o.businessHours;
    if (hours === undefined || hours === false) return () => false;
    const zone = resource?.timeZone ?? o.displayZone;
    const open = businessIntervals(range.start.subtract({ days: 1 }), range.end.add({ days: 1 }), hours, zone);
    return (d: PlainDate) => {
      const s = d.toZonedDateTime({ timeZone: o.displayZone }).epochMilliseconds;
      const e = d.add({ days: 1 }).toZonedDateTime({ timeZone: o.displayZone }).epochMilliseconds;
      return !open.some((x) => x.s < e && x.e > s);
    };
  });

  const weeks = range.weeks.map((week, r): DayGridWeek => {
    const first = cellStart[r]!;
    const dates = owners.length === 1 ? week : owners.flatMap(() => week);
    const resources = owners.flatMap((res) => week.map(() => res));
    const outside = dates.map((d) => !inActive(d));
    const closed = owners.flatMap((_, k) => week.map((d) => closedFor[k]!(d)));
    const items: RowItem[] = rows[r]!.map((s) => ({ key: s.key, start: s.dayIndex - first, end: s.dayIndex - first + s.dayCount, rank: rank.get(s.instance.key)! }));
    const { lanes, laneCount } = packLanes(items);
    const bySeg = new Map(rows[r]!.map((s) => [s.key, s]));
    const base = { dates, resources, firstColumn: first, background: bgRows[r]!, laneCount, outside, closed, segments: rows[r]! };
    if (o.maxLanes === undefined || o.maxLanes === null || laneCount <= o.maxLanes) {
      const bars = items.map((it) => ({ segment: bySeg.get(it.key)!, lane: lanes.get(it.key)!, pieces: [{ from: it.start, to: it.end }] }));
      return { ...base, bars, hiddenPerDay: dates.map(() => 0), hiddenKeysPerDay: dates.map(() => []) };
    }
    const over = computeOverflow(lanes, items, dates.length, o.maxLanes);
    const piecesOf = new Map<string, { from: number; to: number }[]>();
    for (const p of over.pieces) (piecesOf.get(p.key) ?? piecesOf.set(p.key, []).get(p.key)!).push({ from: p.from, to: p.to });
    const bars = items
      .filter((it) => piecesOf.has(it.key))
      .map((it) => ({ segment: bySeg.get(it.key)!, lane: lanes.get(it.key)!, pieces: piecesOf.get(it.key)! }));
    return { ...base, bars, hiddenPerDay: over.hiddenPerDay, hiddenKeysPerDay: over.hiddenKeysPerDay };
  });
  const w = range.weeks[0]?.length ?? 0;
  const resourceHeads = (o.resources ?? []).map((resource, k) => ({ resource, from: k * w, count: w }));
  return { version: snap.version, range, options: o, weeks, maxLanes: o.maxLanes ?? null, resourceHeads, groupHeads: o.resourceGroups ?? [] };
}

/**
 * The model after a store change. Rebuilt from the snapshot (a month is a
 * few milliseconds), then every row the change did not touch — no dirty day,
 * no dirty instant in its span — takes back its previous object, so the DOM
 * skips it with `===`: its cells, links and focus stay as they were.
 */
export function updateDayGridModel(prev: DayGridModel, snap: StoreSnapshot, change: StoreChange): DayGridModel {
  if (change.added.length + change.updated.length + change.removed.length + change.seriesChanged.length === 0) return prev;
  const next = buildDayGridModel(prev.range, snap, prev.options);
  // A series' occurrences may be in any week: no week can be kept on the strength of its spans.
  if (next.weeks.length !== prev.weeks.length || change.seriesTouched.length > 0) return next;
  let reused = 0;
  const weeks = next.weeks.map((week, i) => {
    const old = prev.weeks[i]!;
    const first = week.dates[0];
    const last = week.dates[week.dates.length - 1];
    if (!first || !last || !old.dates[0]?.equals(first)) return week;
    const d0 = epochDay(first);
    const d1 = epochDay(last) + 1;
    const s0 = first.toZonedDateTime({ timeZone: prev.options.displayZone }).epochMilliseconds;
    const s1 = last.add({ days: 1 }).toZonedDateTime({ timeZone: prev.options.displayZone }).epochMilliseconds;
    const touched = change.dirtyDays.some((x) => x.s < d1 && x.e > d0) || change.dirtySpans.some((x) => x.s < s1 && x.e > s0);
    if (touched) return week;
    reused++;
    return old;
  });
  return reused === 0 ? next : { ...next, weeks };
}
