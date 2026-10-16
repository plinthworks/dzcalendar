import { epochDay } from '../days.js';
import type { EventInstance } from '../store/store.js';
import type { Instant, PlainDate } from '../temporal.js';
import { Temporal } from '../temporal.js';
import type { DayInfo } from '../zone.js';

/**
 * One event's piece on one day column — what the DOM draws and reconciles.
 *
 * `key` is stable across renders (`instance|day|part`), so the reconciler
 * moves or updates the same node rather than rebuilding it.
 */
export interface Segment {
  readonly key: string;
  readonly instance: EventInstance;
  /** The first column this piece sits in (hidden days excluded). */
  readonly dayIndex: number;
  /** Columns covered: 1 for a timed slice, n for an all-day bar. */
  readonly dayCount: number;
  /** Several pieces on one day: a timed event cut at a repeated hour (wall axis). */
  readonly part: number;
  /** Rounded corners, continuation arrows. */
  readonly startsHere: boolean;
  readonly endsHere: boolean;
  readonly from: Instant | PlainDate;
  readonly to: Instant | PlainDate;
}

export interface TimedSegment extends Segment {
  readonly from: Instant;
  readonly to: Instant;
}

export interface SegmentTimedOptions {
  /**
   * Cut each slice where clocks fall back. On the wall axis the second pass
   * reuses the positions of the first: a slice 02:50 (first) → 02:10 (second)
   * would end above where it starts. Cut there, each part is drawn the right
   * way up. The elapsed axis needs no cut.
   */
  readonly cutAtRepeat?: boolean;
}

const ms = (i: Instant) => i.epochMilliseconds;

/** First day whose end is after `t` (binary search over sorted days). */
function firstDayEndingAfter(days: readonly DayInfo[], t: number): number {
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ms(days[mid]!.end) > t) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * A timed event cut into the display zone's real days — 23, 24 or 25 hours
 * long, or none for a day the zone skipped. O(log D + days covered).
 *
 * Each slice is `[max(start, day.start), min(end, day.end))`. An event ending
 * exactly at a day's start is not on that day; a zero-length event at a
 * day's start is.
 */
export function segmentTimed(instance: EventInstance, days: readonly DayInfo[], o: SegmentTimedOptions = {}): TimedSegment[] {
  const ev = instance.event;
  if (ev.allDay) throw new TypeError('segmentTimed takes a timed event');
  const s = ev.start.toInstant();
  const e = ev.end.toInstant();
  const sMs = ms(s);
  const eMs = ms(e);
  const out: TimedSegment[] = [];
  for (let d = firstDayEndingAfter(days, sMs); d < days.length; d++) {
    const day = days[d]!;
    if (day.lengthMinutes === 0) continue;
    const dayStart = ms(day.start);
    if (dayStart >= eMs && !(eMs === sMs && dayStart === sMs)) break;
    const from = sMs > dayStart ? s : day.start;
    const to = eMs < ms(day.end) ? e : day.end;

    const cuts = o.cutAtRepeat
      ? day.transitions.filter((t) => t.kind === 'repeat' && ms(t.at) > ms(from) && ms(t.at) < ms(to)).map((t) => t.at)
      : [];
    const bounds = [from, ...cuts, to];
    for (let p = 0; p < bounds.length - 1; p++) {
      out.push({
        key: `${instance.key}|${d}|${p}`,
        instance,
        dayIndex: d,
        dayCount: 1,
        part: p,
        startsHere: p === 0 && ms(from) === sMs,
        endsHere: p === bounds.length - 2 && ms(to) === eMs,
        from: bounds[p]!,
        to: bounds[p + 1]!,
      });
    }
  }
  return out;
}

/** The dates a view shows, in order, with hidden days already removed. */
export interface DateIndex {
  readonly dates: readonly PlainDate[];
  /** Column of a date, -1 when it is not shown. */
  colOf(date: PlainDate): number;
}

export function dateIndex(dates: readonly PlainDate[]): DateIndex {
  const cols = new Map<number, number>();
  dates.forEach((d, i) => cols.set(epochDay(d), i));
  return { dates, colOf: (date) => cols.get(epochDay(date)) ?? -1 };
}

/**
 * An all-day event as bars over consecutive shown columns. A hidden day (a
 * weekend switched off) breaks the bar in two; the event's own first and last
 * days decide the rounded ends. O(days covered).
 */
export function segmentAllDay(instance: EventInstance, view: DateIndex): Segment[] {
  const ev = instance.event;
  if (!ev.allDay) throw new TypeError('segmentAllDay takes an all-day event');
  const first = view.dates[0];
  const last = view.dates[view.dates.length - 1];
  if (!first || !last) return [];
  const startN = Math.max(epochDay(ev.start), epochDay(first));
  const endN = Math.min(epochDay(ev.end), epochDay(last) + 1);
  const evStart = epochDay(ev.start);
  const evLast = epochDay(ev.end) - 1;

  const out: Segment[] = [];
  let runStart = -1;
  let runFirstDay = 0;
  let part = 0;
  const flush = (lastDay: number) => {
    const col = runStart;
    const count = view.colOf(dayFrom(lastDay)) - col + 1;
    out.push({
      key: `${instance.key}|${col}|${part++}`,
      instance,
      dayIndex: col,
      dayCount: count,
      part: part - 1,
      startsHere: runFirstDay === evStart,
      endsHere: lastDay === evLast,
      from: dayFrom(runFirstDay),
      to: dayFrom(lastDay + 1),
    });
    runStart = -1;
  };
  let prevShown = -1;
  for (let n = startN; n < endN; n++) {
    const col = view.colOf(dayFrom(n));
    if (col === -1) {
      if (runStart !== -1) flush(prevShown);
      continue;
    }
    if (runStart !== -1 && col !== view.colOf(dayFrom(prevShown)) + 1) flush(prevShown);
    if (runStart === -1) {
      runStart = col;
      runFirstDay = n;
    }
    prevShown = n;
  }
  if (runStart !== -1) flush(prevShown);
  return out;
}

const EPOCH = Temporal.PlainDate.from('1970-01-01');
const dayFrom = (n: number): PlainDate => EPOCH.add({ days: n });

/**
 * Bars cut at the end of each displayed week, for a grid drawn one week per
 * row. `weeks` lists the columns of each row. Each piece keeps the bar's
 * `from`/`to` (the event's stretch in view); its place is `dayIndex`/`dayCount`.
 */
export function splitByWeek(segs: readonly Segment[], weeks: readonly (readonly number[])[]): Segment[][] {
  const rowOf = new Map<number, number>();
  weeks.forEach((cols, r) => cols.forEach((c) => rowOf.set(c, r)));
  const rows: Segment[][] = weeks.map(() => []);
  for (const seg of segs) {
    let col = seg.dayIndex;
    const end = seg.dayIndex + seg.dayCount;
    let piece = 0;
    while (col < end) {
      const row = rowOf.get(col);
      if (row === undefined) break;
      const rowCols = weeks[row]!;
      const rowEnd = Math.min(end, rowCols[rowCols.length - 1]! + 1);
      rows[row]!.push({
        ...seg,
        key: `${seg.key}|w${piece}`,
        dayIndex: col,
        dayCount: rowEnd - col,
        startsHere: seg.startsHere && col === seg.dayIndex,
        endsHere: seg.endsHere && rowEnd === end,
      });
      piece++;
      col = rowEnd;
    }
  }
  return rows;
}
