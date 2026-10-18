import { epochDay as epochDayOf } from '../days.js';
import { subtractSpans } from '../intervals.js';
import { businessIntervals } from '../rules/business-hours.js';
import type { BusinessHoursInput } from '../rules/business-hours.js';
import { Temporal } from '../temporal.js';
import { layoutColumn } from '../layout/column.js';
import { packLanes } from '../layout/rows.js';
import { buildColumnAxis } from '../project/time-axis.js';
import type { AxisMode, AxisTick, ColumnAxis } from '../project/time-axis.js';
import { dateIndex, segmentAllDay, segmentTimed } from '../project/segment.js';
import type { Segment, TimedSegment } from '../project/segment.js';
import type { StoreChange } from '../store/changes.js';
import { viewWindow } from '../store/store.js';
import type { StoreSnapshot } from '../store/store.js';
import type { DurationLike, Instant, PlainDate, ZoneId, ZonedDateTime } from '../temporal.js';
import type { Transition } from '../zone.js';
import { isBackground } from './daygrid.js';
import type { ViewRange } from './spec.js';

export interface TimeGridOptions {
  readonly displayZone: ZoneId;
  readonly axis?: AxisMode;
  readonly slotMin?: DurationLike;
  readonly slotMax?: DurationLike;
  /** The shortest an event is drawn, in minutes. Default 15. */
  readonly minEventMinutes?: number;
  /** Gutter tick step, in minutes. Default 60. */
  readonly slotMinutes?: number;
  readonly resourceId?: string;
  /**
   * Bookable slots to draw (what @dzcalendar/slots' findSlots gives, or any
   * start/end pairs): each column gets the ones starting in its hours.
   */
  readonly availableSlots?: readonly AvailableSlot[];
  /** Hours outside are shaded (`offHours` on each column). */
  readonly businessHours?: BusinessHoursInput;
  /**
   * Overlapping events side by side, at most: a cluster wider than this keeps
   * `maxStack - 1` lanes and puts the rest behind "+N" links in the last one
   * (1: all of a crowded cluster behind one link). Absent, null or not a whole
   * number ≥ 1: no limit.
   */
  readonly maxStack?: number | null;
}

/** Events a crowded cluster does not draw, standing in its last lane: one "+N" per stretch of time. */
export interface MoreTimed {
  readonly key: string;
  readonly top: number;
  readonly height: number;
  /** The lane it stands in and the cluster's drawn lane count (its fraction of the column). */
  readonly left: number;
  readonly width: number;
  /** The hidden events, in order. */
  readonly events: readonly PlacedTimed[];
}

/**
 * How a moment reads on a day the clocks change: its offset in the display
 * zone, and which pass of a repeated hour it belongs to. What tells the two
 * 02:30s apart on screen ("02:30", "02:30*").
 */
export interface Reading {
  readonly offset: string;
  readonly pass: 'first' | 'second' | null;
}

/** A timed piece placed in its column. Vertical in axis minutes, horizontal in fractions. */
export interface PlacedTimed {
  readonly segment: TimedSegment;
  readonly top: number;
  /** True height on the axis; may be 0 (a milestone). */
  readonly height: number;
  /** What is drawn: at least the minimum event height, never past the column. */
  readonly visualHeight: number;
  readonly left: number;
  readonly width: number;
  readonly lane: number;
  readonly lanes: number;
  readonly z: number;
  /**
   * How the *event's* start and end read — not this piece's, which may be cut
   * at a fall-back. Present only on days with a clock change (cost nothing on
   * ordinary days). The end is read as an end: one at 03:00 of the first pass
   * belongs to the first pass, not to the second pass's 02:00.
   */
  readonly startReading?: Reading;
  readonly endReading?: Reading;
  /** Real elapsed minutes of the whole event, when they differ from what the wall axis shows. */
  readonly realMinutes?: number;
}

/** A slot that can be booked: anything with a start and an end, kept as given for the click. */
export interface AvailableSlot {
  readonly start: Instant | ZonedDateTime;
  readonly end: Instant | ZonedDateTime;
}

/** A slot placed in a column, in axis minutes. */
export interface PlacedSlot {
  /** The start's epoch ms: what the DOM keys the slot on. */
  readonly key: string;
  readonly top: number;
  readonly height: number;
  readonly start: Instant;
  readonly end: Instant;
  /** The slot as given. */
  readonly slot: AvailableSlot;
}

export interface TimeGridColumn {
  /** The date, ISO: what the DOM keys the column on. */
  readonly key: string;
  readonly date: PlainDate;
  readonly axis: ColumnAxis;
  /** A day the zone skipped: drawn folded, with nothing in it. */
  readonly folded: boolean;
  readonly events: readonly PlacedTimed[];
  /** `display: 'background'` events: full width, under the others. */
  readonly background: readonly PlacedTimed[];
  /** "+N" links of clusters wider than `maxStack` (empty without it). */
  readonly more: readonly MoreTimed[];
  /** Stretches outside business hours, in axis minutes. Empty without `businessHours`. */
  readonly offHours: readonly { readonly top: number; readonly height: number }[];
  /** Bookable slots starting in this column's hours. Empty without `availableSlots`. */
  readonly slots: readonly PlacedSlot[];
}

export interface AllDayBar {
  readonly segment: Segment;
  readonly lane: number;
}

export interface TimeGridModel {
  /** The store version the model reflects. */
  readonly version: number;
  readonly range: ViewRange;
  readonly options: TimeGridOptions;
  readonly columns: readonly TimeGridColumn[];
  /** Graduations for the left gutter, from an ordinary column when there is one. */
  readonly gutter: readonly AxisTick[];
  readonly allDay: { readonly bars: readonly AllDayBar[]; readonly lanes: number; readonly background: readonly Segment[] };
}

function axisFor(date: PlainDate, o: TimeGridOptions): ColumnAxis {
  return buildColumnAxis(date, o.displayZone, {
    mode: o.axis ?? 'wall',
    ...(o.slotMin !== undefined && { slotMin: o.slotMin }),
    ...(o.slotMax !== undefined && { slotMax: o.slotMax }),
  });
}

function queryOpts(o: TimeGridOptions) {
  return o.resourceId !== undefined ? { resourceId: o.resourceId } : {};
}

/** Which pass of a repeated hour an instant belongs to, given the day's fall-backs. */
function readingOf(i: Instant, zone: ZoneId, repeats: readonly Transition[]): Reading {
  const ms = i.epochMilliseconds;
  let pass: Reading['pass'] = null;
  for (const t of repeats) {
    const at = t.at.epochMilliseconds;
    const span = -t.deltaMinutes * 60000;
    if (ms >= at && ms < at + span) pass = 'second';
    else if (ms >= at - span && ms < at) pass = 'first';
  }
  return { offset: i.toZonedDateTimeISO(zone).offset, pass };
}

/**
 * How an end reads. Its clock face is that of the moment just before it (an
 * end at the fall-back closes the first pass at 03:00), but it is marked as
 * the second pass only when it lies *inside* that pass: an end at 03:00 after
 * the repeat is a time that happens once, and carries no mark.
 */
function endReadingOf(start: Instant, end: Instant, zone: ZoneId, repeats: readonly Transition[]): Reading {
  if (end.equals(start)) return readingOf(end, zone, repeats);
  const before = readingOf(end.subtract({ milliseconds: 1 }), zone, repeats);
  const at = readingOf(end, zone, repeats);
  const pass = before.pass === at.pass ? before.pass : before.pass === 'first' ? 'first' : null;
  return { offset: before.offset, pass };
}

/**
 * One day column: its axis, its events placed side by side. Queries only that
 * day, so `updateTimeGridModel` can rebuild one column and keep the others.
 */
export function buildTimeGridColumn(date: PlainDate, snap: StoreSnapshot, o: TimeGridOptions, axis: ColumnAxis = axisFor(date, o)): TimeGridColumn {
  const key = date.toString();
  if (axis.length === 0) return { key, date, axis, folded: true, events: [], background: [], more: [], offHours: [], slots: [] };

  const day = axis.day;
  const instances = snap.queryInstances(viewWindow(date, date.add({ days: 1 }), o.displayZone), queryOpts(o));
  const order = new Map(instances.map((inst, i) => [inst.key, i]));
  const mode = o.axis ?? 'wall';

  // Only what falls inside the axis's hours: an event at 22:00 in an
  // 08:00–20:00 grid is not drawn as a sliver at the bottom. A piece cut by
  // the axis loses its rounded end, like one cut by midnight.
  const aStart = axis.start.epochMilliseconds;
  const aEnd = axis.end.epochMilliseconds;
  const segs: TimedSegment[] = [];
  for (const inst of instances) {
    if (inst.event.allDay) continue;
    for (const seg of segmentTimed(inst, [day], { cutAtRepeat: mode === 'wall' })) {
      const f = seg.from.epochMilliseconds;
      const t = seg.to.epochMilliseconds;
      const inside = f === t ? f >= aStart && f < aEnd : t > aStart && f < aEnd;
      if (!inside) continue;
      segs.push(f >= aStart && t <= aEnd ? seg : { ...seg, startsHere: seg.startsHere && f >= aStart, endsHere: seg.endsHere && t <= aEnd });
    }
  }

  const minVisual = o.minEventMinutes ?? 15;
  const repeats = day.transitions.filter((t) => t.kind === 'repeat');
  const changeDay = day.transitions.length > 0;
  const place = (seg: TimedSegment, p: { left: number; width: number; lane: number; lanes: number; z: number }): PlacedTimed => {
    const top = axis.toPosition(seg.from);
    const height = Math.max(0, axis.toEndPosition(seg.to) - top);
    const base = { segment: seg, top, height, visualHeight: Math.min(axis.length - top, Math.max(height, minVisual)), ...p };
    if (!changeDay) return base;
    const ev = seg.instance.event;
    const real = ev.allDay ? 0 : (ev.end.epochMilliseconds - ev.start.epochMilliseconds) / 60000;
    if (ev.allDay) return base;
    return {
      ...base,
      startReading: readingOf(ev.start.toInstant(), o.displayZone, repeats),
      endReading: endReadingOf(ev.start.toInstant(), ev.end.toInstant(), o.displayZone, repeats),
      realMinutes: real,
    };
  };

  const fg = segs.filter((s) => !isBackground(s.instance.event.display));
  const placements = layoutColumn(
    fg.map((seg) => {
      const top = axis.toPosition(seg.from);
      return { key: seg.key, start: top, end: Math.max(top, axis.toEndPosition(seg.to)), order: order.get(seg.instance.key) ?? 0 };
    }),
    { minVisual },
  );
  const byKey = new Map(fg.map((s) => [s.key, s]));
  const background = segs.filter((s) => isBackground(s.instance.event.display)).map((s) => place(s, { left: 0, width: 1, lane: 0, lanes: 1, z: -1 }));
  // A bad limit is no limit (a configuration the DOM refuses before it gets here).
  const max = o.maxStack !== undefined && o.maxStack !== null && Number.isInteger(o.maxStack) && o.maxStack >= 1 ? o.maxStack : null;
  if (max === null || !placements.some((p) => p.lanes > max)) {
    const events = placements.map((p) => place(byKey.get(p.key)!, p));
    return { key, date, axis, folded: false, events, background, more: [], offHours: offHoursOf(date, axis, o), slots: slotsOf(axis, o) };
  }
  // A cluster wider than `max`: its first `max - 1` lanes are drawn, as wide as
  // `max` lanes allow; the others go behind "+N" in lane `max - 1`, one link per
  // stretch where hidden events run into one another.
  // One lane: everything behind a single "+N" across the column.
  const keep = max - 1;
  const events: PlacedTimed[] = [];
  const hidden: PlacedTimed[] = [];
  for (const p of placements) {
    if (p.lanes <= max) {
      events.push(place(byKey.get(p.key)!, p));
      continue;
    }
    const seg = byKey.get(p.key)!;
    if (p.lane >= keep) {
      hidden.push(place(seg, { left: keep / max, width: 1 / max, lane: keep, lanes: max, z: p.z }));
      continue;
    }
    const span = Math.round(p.width * p.lanes);
    events.push(place(seg, { left: p.lane / max, width: (Math.min(p.lane + span, keep) - p.lane) / max, lane: p.lane, lanes: max, z: p.z }));
  }
  hidden.sort((a, b) => a.top - b.top || b.visualHeight - a.visualHeight);
  const more: MoreTimed[] = [];
  let run: PlacedTimed[] = [];
  let end = -Infinity;
  const close = () => {
    if (run.length === 0) return;
    const top = run[0]!.top;
    more.push({ key: `more|${key}|${top}|${more.length}`, top, height: Math.max(minVisual, end - top), left: keep / max, width: 1 / max, events: run });
  };
  for (const h of hidden) {
    if (h.top >= end) {
      close();
      run = [];
    }
    run.push(h);
    end = Math.max(end, h.top + h.visualHeight);
  }
  close();
  return { key, date, axis, folded: false, events, background, more, offHours: offHoursOf(date, axis, o), slots: slotsOf(axis, o) };
}

const instantOf = (x: Instant | ZonedDateTime): Instant => ('toInstant' in x ? x.toInstant() : x);

/** The slots starting inside the axis, placed; one running past the axis's end is cut there. */
function slotsOf(axis: ColumnAxis, o: TimeGridOptions): PlacedSlot[] {
  if (!o.availableSlots?.length) return [];
  const a = axis.start.epochMilliseconds;
  const b = axis.end.epochMilliseconds;
  const out: PlacedSlot[] = [];
  for (const slot of o.availableSlots) {
    const start = instantOf(slot.start);
    const end = instantOf(slot.end);
    const ms = start.epochMilliseconds;
    if (ms < a || ms >= b || end.epochMilliseconds <= ms) continue;
    const top = axis.toPosition(start);
    const bottom = end.epochMilliseconds >= b ? axis.length : axis.toEndPosition(end);
    out.push({ key: String(ms), top, height: Math.max(0, bottom - top), start, end, slot });
  }
  return out.sort((x, y) => x.top - y.top);
}

/** What is not open, inside the axis's hours, as positions. Read with `toEndPosition` at the ends. */
function offHoursOf(date: PlainDate, axis: ColumnAxis, o: TimeGridOptions): TimeGridColumn['offHours'] {
  if (o.businessHours === undefined || o.businessHours === false) return [];
  const open = businessIntervals(date, date.add({ days: 1 }), o.businessHours, o.displayZone);
  const closed = subtractSpans([{ s: axis.start.epochMilliseconds, e: axis.end.epochMilliseconds }], open);
  return closed.map((x) => {
    const top = axis.toPosition(Temporal.Instant.fromEpochMilliseconds(x.s));
    return { top, height: Math.max(0, axis.toEndPosition(Temporal.Instant.fromEpochMilliseconds(x.e)) - top) };
  });
}

function buildAllDay(range: ViewRange, snap: StoreSnapshot, o: TimeGridOptions): TimeGridModel['allDay'] {
  const instances = snap.queryInstances(viewWindow(range.start, range.end, o.displayZone), queryOpts(o)).filter((i) => i.event.allDay);
  const view = dateIndex(range.dates);
  const order = new Map(instances.map((inst, i) => [inst.key, i]));
  const bars: Segment[] = [];
  const background: Segment[] = [];
  for (const inst of instances) (isBackground(inst.event.display) ? background : bars).push(...segmentAllDay(inst, view));
  const packed = packLanes(bars.map((s) => ({ key: s.key, start: s.dayIndex, end: s.dayIndex + s.dayCount, rank: [order.get(s.instance.key) ?? 0] })));
  return { bars: bars.map((segment) => ({ segment, lane: packed.lanes.get(segment.key)! })), lanes: packed.laneCount, background };
}

function gutterOf(columns: readonly TimeGridColumn[], o: TimeGridOptions): AxisTick[] {
  const step = o.slotMinutes ?? 60;
  const ordinary = columns.find((c) => !c.folded && c.axis.day.transitions.length === 0) ?? columns.find((c) => !c.folded);
  return ordinary ? ordinary.axis.ticks(step) : [];
}

/**
 * Everything a time grid draws, as data: per shown day, its axis (with DST
 * bands), its events placed side by side; above, the all-day row; at the
 * left, the gutter. Pure — the same snapshot and options give the same model.
 */
export function buildTimeGridModel(range: ViewRange, snap: StoreSnapshot, o: TimeGridOptions): TimeGridModel {
  const columns = range.dates.map((date) => buildTimeGridColumn(date, snap, o));
  return { version: snap.version, range, options: o, columns, gutter: gutterOf(columns, o), allDay: buildAllDay(range, snap, o) };
}

const overlaps = (s: number, e: number, spans: readonly { s: number; e: number }[]) => spans.some((x) => x.s < e && x.e > s);

/**
 * The model after a store change, rebuilding only what the change touched:
 * columns whose day overlaps a dirty span, and the all-day row if an all-day
 * event moved. Untouched columns keep their identity, so the DOM can skip
 * them with `===`. Returns `prev` itself when nothing it shows changed.
 */
export function updateTimeGridModel(prev: TimeGridModel, snap: StoreSnapshot, change: StoreChange): TimeGridModel {
  if (change.version === prev.version || change.added.length + change.updated.length + change.removed.length + change.seriesChanged.length === 0) return prev;
  const o = prev.options;
  // A series' occurrences may fall in any column: a touched series rebuilds them all.
  const everything = change.seriesTouched.length > 0;
  let touched = false;
  const columns = prev.columns.map((col) => {
    if (col.folded || (!everything && !overlaps(col.axis.start.epochMilliseconds, col.axis.end.epochMilliseconds, change.dirtySpans))) return col;
    touched = true;
    return buildTimeGridColumn(col.date, snap, o, col.axis);
  });
  const first = prev.range.dates[0];
  const last = prev.range.dates[prev.range.dates.length - 1];
  const dayLo = first ? epochDayOf(first) : 0;
  const dayHi = last ? epochDayOf(last) + 1 : 0;
  const allDayDirty = everything || overlaps(dayLo, dayHi, change.dirtyDays);
  const allDay = allDayDirty ? buildAllDay(prev.range, snap, o) : prev.allDay;
  // Nothing it shows changed: the same object, so nothing downstream redraws.
  if (!touched && !allDayDirty) return prev;
  return { ...prev, version: snap.version, columns, allDay };
}

/** Where "now" falls: which column, how far down. Kept out of the memoized model — it moves every minute. */
export function locateNow(model: TimeGridModel, now: Instant): { readonly column: number; readonly position: number } | null {
  const t = now.epochMilliseconds;
  const column = model.columns.findIndex((c) => !c.folded && c.axis.start.epochMilliseconds <= t && t < c.axis.end.epochMilliseconds);
  if (column === -1) return null;
  return { column, position: model.columns[column]!.axis.toPosition(now) };
}
