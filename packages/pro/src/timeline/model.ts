import { Temporal, businessIntervals, instancesOf, packLanes, subtractSpans, viewWindow, UNASSIGNED } from '@dzcalendar/core';
import type { BusinessHoursInput, EventInstance, Instant, Resource, ResourceRow, Segment, StoreChange, StoreSnapshot, ViewRange, ZoneId } from '@dzcalendar/core';
import { buildTimelineAxis } from './axis.js';
import type { TimelineAxis } from './axis.js';

export interface TimelineOptions {
  readonly displayZone: ZoneId;
  /** Minutes per slot (dividing a day) or 'day'. Default: 30 for a day, 60 up to a week, days beyond. */
  readonly slot?: number | 'day';
  /**
   * The rows of a resource timeline, in order: resources (with their depth
   * and state), group heads, "Unassigned" (`flattenRows`). Absent: one row
   * of every event.
   */
  readonly rows?: readonly ResourceRow[];
  /** Every resource the calendar knows: what "Unassigned" is the complement of. */
  readonly resources?: readonly Resource[];
  /** Lanes a resource row shows; past them, "+N" (owner's decision: rows of a fixed height). Default 3. */
  readonly maxLanes?: number;
  /** Lanes of the one row of a timeline without resources (it fills the view). Default 12. */
  readonly fillLanes?: number;
  /** Shaded outside, per row: a resource's own hours (read in its zone), else these. */
  readonly businessHours?: BusinessHoursInput;
}

/** An event placed in its row, in axis positions (nominal slots from the start). */
export interface TimelineBar {
  readonly segment: Segment;
  readonly from: number;
  readonly to: number;
  readonly lane: number;
}

/** Events a full row does not draw, standing in its last lane: one "+N" per stretch where they run into one another. */
export interface TimelineMore {
  readonly key: string;
  readonly from: number;
  readonly to: number;
  readonly events: readonly TimelineBar[];
}

interface RowBody {
  readonly key: string;
  readonly events: readonly TimelineBar[];
  /** `display: 'background'` events: the row's whole height, under the others. */
  readonly background: readonly TimelineBar[];
  readonly more: readonly TimelineMore[];
  /** Stretches outside business hours, in positions. */
  readonly offHours: readonly { readonly from: number; readonly to: number }[];
  /** Lanes drawn (at most `maxLanes`). */
  readonly lanes: number;
}

export type TimelineRow =
  | (RowBody & { readonly kind: 'resource'; readonly resource: Resource; readonly depth: number; readonly expanded: boolean | null })
  | { readonly kind: 'group'; readonly key: string; readonly value: string; readonly count: number; readonly expanded: boolean }
  /** A timeline without resources: one row of every event. */
  | (RowBody & { readonly kind: 'all' });

export interface TimelineModel {
  readonly version: number;
  readonly range: ViewRange;
  readonly options: TimelineOptions;
  readonly axis: TimelineAxis;
  readonly rows: readonly TimelineRow[];
  readonly maxLanes: number;
}

const isBackground = (e: EventInstance) => e.event.display === 'background' || e.event.display === 'inverse-background';
const whole = (n: number | undefined, d: number) => (n !== undefined && Number.isInteger(n) && n >= 1 ? n : d);
const lanesOf = (o: TimelineOptions) => whole(o.maxLanes, 3);

/** An event's span in instants: an all-day one covers its dates in the calendar's zone. */
function spanOf(inst: EventInstance, zone: ZoneId): [number, number] {
  const ev = inst.event;
  if (ev.allDay) {
    const s = ev.start.toZonedDateTime({ timeZone: zone }).epochMilliseconds;
    return [s, Math.max(s, ev.end.toZonedDateTime({ timeZone: zone }).epochMilliseconds)];
  }
  return [ev.start.epochMilliseconds, ev.end.epochMilliseconds];
}

/** One row's events, lanes and "+N", and its shading. */
function buildRow(key: string, instances: readonly EventInstance[], axis: TimelineAxis, o: TimelineOptions, resource: Resource | null, max = lanesOf(o), shading: Shading = new Map()): RowBody {
  const a = axis.start.epochMilliseconds;
  const b = axis.end.epochMilliseconds;
  const unit = axis.slotMinutes * 60_000;
  // The shortest drawn: a quarter of a slot (a milestone must still be seen, and take its lane).
  const minMs = unit / 4;
  const bars: { bar: TimelineBar; s: number; e: number; rank: number }[] = [];
  const background: TimelineBar[] = [];
  instances.forEach((inst, i) => {
    const [s, e] = spanOf(inst, o.displayZone);
    if (e < a || s >= b || (e === a && s < e)) return;
    const segment: Segment = {
      key: `${inst.key}|${key}`,
      instance: inst,
      dayIndex: 0,
      dayCount: 1,
      part: 0,
      startsHere: s >= a,
      endsHere: e <= b,
      from: Temporal.Instant.fromEpochMilliseconds(Math.max(s, a)),
      to: Temporal.Instant.fromEpochMilliseconds(Math.min(e, b)),
    };
    const bar = { segment, from: axis.toPosition(s), to: axis.toPosition(e), lane: 0 };
    if (isBackground(inst)) background.push(bar);
    else bars.push({ bar, s: Math.max(s, a), e: Math.max(Math.min(e, b), Math.max(s, a) + minMs), rank: i });
  });
  const packed = packLanes(bars.map((x) => ({ key: x.bar.segment.key, start: x.s, end: x.e, rank: [x.rank] })));
  const placed = bars.map((x) => ({ ...x.bar, lane: packed.lanes.get(x.bar.segment.key)! }));
  let events: TimelineBar[] = placed;
  const more: TimelineMore[] = [];
  if (packed.laneCount > max) {
    // The last lane holds "+N": the events from it down are behind the links, one per stretch.
    const keep = max - 1;
    events = placed.filter((p) => p.lane < keep);
    const hidden = placed.filter((p) => p.lane >= keep).sort((x, y) => x.from - y.from || y.to - x.to);
    let run: TimelineBar[] = [];
    let end = -Infinity;
    const close = () => {
      if (run.length > 0) more.push({ key: `more|${key}|${run[0]!.from}`, from: run[0]!.from, to: end, events: run });
    };
    const minPos = minMs / unit;
    for (const h of hidden) {
      if (h.from >= end) {
        close();
        run = [];
      }
      run.push(h);
      end = Math.max(end, Math.max(h.to, h.from + minPos));
    }
    close();
  }
  return { key, events, background, more, offHours: offHoursOf(axis, o, resource, shading), lanes: Math.min(Math.max(1, packed.laneCount), max) };
}

/** What is not open, as positions: a resource's own hours (in its zone), else the calendar's. */
/** Shading computed once per (hours, zone) in a build: 500 doctors sharing the calendar's hours read the zone once. */
type Shading = Map<unknown, Map<string, RowBody['offHours']>>;

function offHoursOf(axis: TimelineAxis, o: TimelineOptions, resource: Resource | null, shading: Shading): RowBody['offHours'] {
  const hours = resource?.businessHours ?? o.businessHours;
  if (hours === undefined || hours === false || axis.slots.length === 0) return [];
  const zone = resource?.timeZone ?? o.displayZone;
  const byZone = shading.get(hours) ?? shading.set(hours, new Map()).get(hours)!;
  const hit = byZone.get(zone);
  if (hit) return hit;
  const spans = shadeOf(axis, hours, zone);
  byZone.set(zone, spans);
  return spans;
}

function shadeOf(axis: TimelineAxis, hours: BusinessHoursInput, zone: ZoneId): RowBody['offHours'] {
  const first = axis.slots[0]!.date;
  const last = axis.slots[axis.slots.length - 1]!.date;
  const open = businessIntervals(first.subtract({ days: 1 }), last.add({ days: 2 }), hours, zone);
  // Counted in days: a day with no open hour at all is shaded, whole (a day's hours are not drawn there).
  if (axis.unit === 'day') {
    return axis.slots
      .filter((sl) => !open.some((x) => x.s < sl.end.epochMilliseconds && x.e > sl.start.epochMilliseconds))
      .map((sl) => ({ from: axis.toPosition(sl.start), to: axis.toPosition(sl.end) }));
  }
  return subtractSpans([{ s: axis.start.epochMilliseconds, e: axis.end.epochMilliseconds }], open).map((x) => ({ from: axis.toPosition(x.s), to: axis.toPosition(x.e) }));
}

interface Build {
  readonly shading: Shading;
  /** Row bodies of the last build on this snapshot with the same scale and rules: a fold reuses them. */
  readonly reuse: Map<string, RowBody> | null;
  readonly made: Map<string, RowBody>;
}

function rowOf(row: ResourceRow, snap: StoreSnapshot, axis: TimelineAxis, range: ViewRange, o: TimelineOptions, b: Build): TimelineRow {
  if (row.kind === 'group') return { kind: 'group', key: row.rowKey, value: row.value, count: row.count, expanded: row.expanded };
  const ready = b.reuse?.get(row.rowKey);
  const body = ready ?? buildRow(row.rowKey, instancesOf(snap, viewWindow(range.start, range.end, o.displayZone), row.resource, o.resources ?? []), axis, o, row.resource, lanesOf(o), b.shading);
  b.made.set(row.rowKey, body);
  return { kind: 'resource', resource: row.resource, depth: row.depth, expanded: row.expanded, ...body };
}

/** The last build per snapshot: what its rows were made from, and the rows. */
const LAST = new WeakMap<StoreSnapshot, { readonly key: string; readonly bodies: Map<string, RowBody> }>();
const ids = new WeakMap<object, number>();
let nextId = 0;
const idOf = (x: unknown) => {
  if (typeof x !== 'object' || x === null) return String(x);
  let id = ids.get(x);
  if (id === undefined) ids.set(x, (id = ++nextId));
  return `#${id}`;
};
/** Everything a row's body depends on besides its resource and the snapshot. */
const buildKey = (axis: TimelineAxis, o: TimelineOptions) =>
  [axis.start.epochMilliseconds, axis.end.epochMilliseconds, axis.slotMinutes, o.displayZone, lanesOf(o), idOf(o.businessHours), idOf(o.resources)].join('|');

/**
 * Everything a timeline draws, as data: the elapsed axis, and per row its
 * events on lanes (at most `maxLanes`, the rest behind "+N"), its shading.
 * Pure — the same snapshot and options give the same model.
 */
export function buildTimelineModel(range: ViewRange, snap: StoreSnapshot, o: TimelineOptions): TimelineModel {
  const axis = buildTimelineAxis(range, o.displayZone, o.slot !== undefined ? { slot: o.slot } : {});
  const key = buildKey(axis, o);
  const last = LAST.get(snap);
  const b: Build = { shading: new Map(), reuse: last && last.key === key ? last.bodies : null, made: new Map() };
  const rows: TimelineRow[] = o.rows
    ? o.rows.map((r) => rowOf(r, snap, axis, range, o, b))
    : [{ kind: 'all', ...buildRow('all', snap.queryInstances(viewWindow(range.start, range.end, o.displayZone)), axis, o, null, whole(o.fillLanes, 12)) }];
  if (o.rows) LAST.set(snap, { key, bodies: new Map([...(b.reuse ?? []), ...b.made]) });
  return { version: snap.version, range, options: o, axis, rows, maxLanes: o.rows ? lanesOf(o) : whole(o.fillLanes, 12) };
}

/**
 * The model after a store change: only the rows of the resources an event
 * left or joined are rebuilt ("Unassigned" when an event is on no known
 * resource); the others keep their identity, so the DOM skips them. A
 * touched series may be anywhere: every row is rebuilt.
 */
export function updateTimelineModel(prev: TimelineModel, snap: StoreSnapshot, change: StoreChange): TimelineModel {
  if (change.version === prev.version || change.added.length + change.updated.length + change.removed.length + change.seriesChanged.length === 0) return prev;
  const o = prev.options;
  const a = prev.axis.start.epochMilliseconds;
  const b = prev.axis.end.epochMilliseconds;
  if (!change.dirtySpans.some((x) => x.s < b && x.e > a) && change.dirtyDays.length === 0 && change.seriesTouched.length === 0) return prev;
  if (!o.rows || change.seriesTouched.length > 0) return { ...buildTimelineModel(prev.range, snap, o), axis: prev.axis };
  const known = new Set((o.resources ?? []).map((r) => r.id));
  const touched = new Set<string>();
  for (const m of change.applied) {
    if (m.kind !== 'event') continue;
    for (const ev of [m.before, m.after]) {
      if (!ev) continue;
      for (const r of ev.resourceIds) touched.add(r);
      if (!ev.resourceIds.some((r) => known.has(r))) touched.add(UNASSIGNED);
    }
  }
  let changed = false;
  const rows = prev.rows.map((row, i) => {
    if (row.kind !== 'resource' || !touched.has(row.resource.id)) return row;
    changed = true;
    return rowOf(o.rows![i]!, snap, prev.axis, prev.range, o, { shading: new Map(), reuse: null, made: new Map() });
  });
  return changed ? { ...prev, version: snap.version, rows } : prev;
}

/** Where "now" is on the axis, or null outside it. Kept out of the memoized model: it moves every minute. */
export function timelineNow(model: TimelineModel, now: Instant): number | null {
  const t = now.epochMilliseconds;
  return t >= model.axis.start.epochMilliseconds && t < model.axis.end.epochMilliseconds ? model.axis.toPosition(now) : null;
}
