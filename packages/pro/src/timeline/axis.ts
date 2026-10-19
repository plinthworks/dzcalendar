import { Temporal, dayInfos, resolveWall } from '@dzcalendar/core';
import type { DayInfo, Instant, PlainDate, PlainTime, ViewRange, ZoneId } from '@dzcalendar/core';

/** One step of a timeline's scale: a wall-clock slot (time unit) or a day (day unit). */
export interface TimelineSlot {
  readonly start: Instant;
  readonly end: Instant;
  /** The date it belongs to, in the calendar's zone. */
  readonly date: PlainDate;
  /** Its wall time (time unit); null for a day slot. */
  readonly time: PlainTime | null;
  /** On a fall-back night, which of the two readings of this wall time; null when it happens once. */
  readonly pass: 'first' | 'second' | null;
  /** The zone's offset at its start: what tells the two 02:00s apart. */
  readonly offset: string;
}

/** A head above the slots: a day (time unit) or a month (day unit). */
export interface TimelineGroup {
  readonly date: PlainDate;
  readonly start: Instant;
  readonly end: Instant;
  /** Elapsed minutes: 1380, 1440, 1500 for a day; 0 for a day the zone skipped. */
  readonly lengthMinutes: number;
}

/**
 * The timeline's axis: always elapsed (ARCHITECTURE C.3). A position is real
 * time since the axis start, so an event's length on screen is its true
 * length, a 25-hour day is 25 hours wide and a 23-hour one 23. The slots are
 * cut on the wall clock: the 02:00 slot happens twice on a fall-back night
 * (once per offset), not at all on a spring-forward one.
 */
export interface TimelineAxis {
  readonly unit: 'time' | 'day';
  /** A nominal slot, in minutes (the time unit's step; 1440 for days): the scale's unit on screen. */
  readonly slotMinutes: number;
  readonly start: Instant;
  readonly end: Instant;
  readonly slots: readonly TimelineSlot[];
  readonly groups: readonly TimelineGroup[];
  /** Length in nominal slots (a fall-back day of 30-minute slots is 50, not 48). */
  readonly length: number;
  /** An instant's position, in nominal slots from the start, clamped to the axis. */
  toPosition(i: Instant | number): number;
  /** The instant at a position (slots from the start), clamped. */
  fromPosition(x: number): Instant;
  /** The slot holding an instant (its index), or -1 outside. */
  slotAt(i: Instant): number;
}

export interface TimelineAxisOptions {
  /** Minutes per slot, dividing 1440 (5, 10, 15, 20, 30, 60, 120…), or 'day'. Default: 30 for a day, 60 for a week, 'day' beyond. */
  readonly slot?: number | 'day';
}

/** The default scale for a range: 30 minutes for one day, an hour up to a week, days beyond (owner's decision). */
export function defaultSlot(range: ViewRange): number | 'day' {
  const days = range.start.until(range.end, { largestUnit: 'days' }).days;
  return days <= 1 ? 30 : days <= 7 ? 60 : 'day';
}

/** A slot length the axis can cut a day into: whole minutes dividing a day. */
export const validSlot = (s: unknown): s is number | 'day' => s === 'day' || (Number.isInteger(s) && (s as number) >= 1 && 1440 % (s as number) === 0);

function wall(m: number): PlainTime {
  return Temporal.PlainTime.from({ hour: Math.floor(m / 60), minute: m % 60 });
}

/** A day's wall slots. Without a transition, arithmetic; with one, every wall time read in the zone. */
function daySlots(day: DayInfo, step: number, zone: ZoneId, out: TimelineSlot[]): void {
  if (day.lengthMinutes === 0) return;
  const s = day.start.epochMilliseconds;
  if (day.transitions.length === 0 && day.lengthMinutes === 1440) {
    const offset = day.start.toZonedDateTimeISO(zone).offset;
    for (let m = 0; m < 1440; m += step) {
      out.push({
        start: Temporal.Instant.fromEpochMilliseconds(s + m * 60_000),
        end: Temporal.Instant.fromEpochMilliseconds(s + (m + step) * 60_000),
        date: day.date,
        time: wall(m),
        pass: null,
        offset,
      });
    }
    return;
  }
  const starts: { at: Instant; time: PlainTime; pass: TimelineSlot['pass'] }[] = [];
  for (let m = 0; m < 1440; m += step) {
    const r = resolveWall(day.date, wall(m), zone, 'earlier');
    if (!r.exists || !r.instant) continue;
    if (r.ambiguous && r.other) {
      starts.push({ at: r.instant, time: wall(m), pass: 'first' }, { at: r.other, time: wall(m), pass: 'second' });
    } else starts.push({ at: r.instant, time: wall(m), pass: null });
  }
  // A day starting after midnight (São Paulo 2018, Havana): its first slot begins at the day's start.
  starts.sort((a, b) => a.at.epochMilliseconds - b.at.epochMilliseconds);
  starts.forEach((x, i) => {
    const at = i === 0 && x.at.epochMilliseconds > s ? day.start : x.at;
    const end = starts[i + 1]?.at ?? day.end;
    if (end.epochMilliseconds <= at.epochMilliseconds) return;
    out.push({ start: at, end, date: day.date, time: x.time, pass: x.pass, offset: at.toZonedDateTimeISO(zone).offset });
  });
}

/**
 * The axis of a timeline over `range` (its whole days, `start` to `end`), in
 * the calendar's zone. Hidden days are not taken out: a timeline is
 * continuous time.
 */
export function buildTimelineAxis(range: ViewRange, zone: ZoneId, o: TimelineAxisOptions = {}): TimelineAxis {
  const slot = o.slot !== undefined && validSlot(o.slot) ? o.slot : defaultSlot(range);
  const count = range.start.until(range.end, { largestUnit: 'days' }).days;
  const days = dayInfos(range.start, count, zone);
  const slots: TimelineSlot[] = [];
  let groups: TimelineGroup[];
  if (slot === 'day') {
    for (const d of days) {
      if (d.lengthMinutes === 0) continue;
      slots.push({ start: d.start, end: d.end, date: d.date, time: null, pass: null, offset: d.start.toZonedDateTimeISO(zone).offset });
    }
    // Months above the days.
    groups = [];
    for (const d of days) {
      const last = groups[groups.length - 1];
      if (last && last.date.month === d.date.month && last.date.year === d.date.year) {
        groups[groups.length - 1] = { ...last, end: d.end, lengthMinutes: last.lengthMinutes + d.lengthMinutes };
      } else groups.push({ date: d.date.with({ day: 1 }), start: d.start, end: d.end, lengthMinutes: d.lengthMinutes });
    }
  } else {
    for (const d of days) daySlots(d, slot, zone, slots);
    groups = days.map((d) => ({ date: d.date, start: d.start, end: d.end, lengthMinutes: d.lengthMinutes }));
  }
  const start = days[0]?.start ?? range.start.toZonedDateTime({ timeZone: zone }).toInstant();
  const end = days[days.length - 1]?.end ?? start;
  const slotMinutes = slot === 'day' ? 1440 : slot;
  const unitMs = slotMinutes * 60_000;
  const s = start.epochMilliseconds;
  const e = end.epochMilliseconds;
  const length = (e - s) / unitMs;
  const starts = slots.map((x) => x.start.epochMilliseconds);
  return {
    unit: slot === 'day' ? 'day' : 'time',
    slotMinutes,
    start,
    end,
    slots,
    groups,
    length,
    toPosition(i) {
      const ms = typeof i === 'number' ? i : i.epochMilliseconds;
      return (Math.max(s, Math.min(e, ms)) - s) / unitMs;
    },
    fromPosition(x) {
      return Temporal.Instant.fromEpochMilliseconds(Math.round(s + Math.max(0, Math.min(length, x)) * unitMs));
    },
    slotAt(i) {
      const ms = i.epochMilliseconds;
      if (ms < s || ms >= e) return -1;
      // The last slot starting at or before it.
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid]! <= ms) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    },
  };
}
