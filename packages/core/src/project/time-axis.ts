import { Temporal } from '../temporal.js';
import type { DurationLike, Instant, PlainDate, PlainDateTime, PlainTime, ZoneId } from '../temporal.js';
import { dayInfo, resolveWall } from '../zone.js';
import type { DayInfo, Transition, WallPolicy } from '../zone.js';

/**
 * The vertical axis of one day column in a time grid (ARCHITECTURE.md C).
 *
 * - `wall` (default): positions are clock minutes since midnight, shared by
 *   every column so rows line up. A skipped hour is a band nobody can land
 *   in; a repeated hour is a band where two readings share positions.
 * - `elapsed`: positions are real minutes since the column's first instant.
 *   A 25-hour Sunday is 25 hours tall; durations are always true.
 */
export type AxisMode = 'wall' | 'elapsed';

export interface AxisTick {
  /** Axis minutes from the top. */
  readonly position: number;
  readonly label: PlainTime;
  /** Null where the wall time does not exist. In wall mode, a repeated time gives its first reading. */
  readonly instant: Instant | null;
  readonly note?: 'first-pass' | 'second-pass' | 'skipped';
  readonly major: boolean;
}

export interface AxisBand {
  readonly kind: 'gap' | 'repeat';
  readonly from: number;
  readonly to: number;
  readonly transition: Transition;
}

export interface FromPosition {
  readonly instant: Instant;
  readonly exists: boolean;
  readonly ambiguous: boolean;
  /** The other reading of a repeated wall time. */
  readonly alternative: Instant | null;
}

export interface ColumnAxis {
  readonly mode: AxisMode;
  readonly day: DayInfo;
  /** In axis minutes. 0 for a day the zone skipped. */
  readonly length: number;
  /** The stretch of time the axis shows, `[start, end)`: what lies outside is not drawn. */
  readonly start: Instant;
  readonly end: Instant;
  readonly bands: readonly AxisBand[];
  /** Clamped to [0, length]. */
  toPosition(i: Instant): number;
  /**
   * Where something that *ends* at `i` stops. Differs from `toPosition` only
   * at a fall-back: an event ending at the change ends at 03:00 of the first
   * pass, not at 02:00 of the second. Also gives 24:00, not 00:00, at midnight.
   */
  toEndPosition(i: Instant): number;
  /**
   * The instant at a position. In a gap, the time moves forward (or back,
   * `prefer: 'earlier'`); in a repeat, the first reading unless told otherwise.
   */
  fromPosition(p: number, hint?: { readonly prefer?: 'earlier' | 'later' | { readonly offset: string } }): FromPosition;
  ticks(stepMinutes: number): AxisTick[];
}

export interface ColumnAxisOptions {
  readonly mode?: AxisMode;
  /** First time shown. Default PT0H. */
  readonly slotMin?: DurationLike;
  /**
   * Last time shown, at most PT24H (the default). Columns are cut at the
   * zone's real midnight, so a column running to 06:00 next morning would need
   * its own segmentation — deferred, and refused rather than drawn half-right.
   */
  readonly slotMax?: DurationLike;
}

const minutesOf = (d: DurationLike | undefined, fallback: number) =>
  d === undefined ? fallback : Temporal.Duration.from(d).total({ unit: 'minutes' });

/** Clock milliseconds from midnight of `date` to `wall`, crossing midnight if needed. An integer. */
function wallMs(date: PlainDate, wall: PlainDateTime): number {
  const days = wall.toPlainDate().since(date, { largestUnit: 'days' }).days;
  return ((days * 24 + wall.hour) * 60 + wall.minute) * 60000 + wall.second * 1000 + wall.millisecond;
}
const wallMinutes = (date: PlainDate, wall: PlainDateTime): number => wallMs(date, wall) / 60000;

const wallAt = (date: PlainDate, minutes: number): PlainDateTime =>
  date.toPlainDateTime(Temporal.PlainTime.from('00:00')).add({ milliseconds: Math.round(minutes * 60000) });

/** A step of zero would never end: a configuration error, said at once. */
function assertStep(step: number): void {
  if (!(step > 0) || !Number.isFinite(step)) throw new RangeError(`tick step must be a positive number of minutes (got ${step})`);
}

export function buildColumnAxis(date: PlainDate, zone: ZoneId, o: ColumnAxisOptions = {}): ColumnAxis {
  const mode = o.mode ?? 'wall';
  const minM = minutesOf(o.slotMin, 0);
  const maxM = minutesOf(o.slotMax, 1440);
  if (!(minM >= 0 && maxM <= 1440 && minM < maxM)) {
    throw new RangeError(`slotMin/slotMax must satisfy 0 ≤ slotMin < slotMax ≤ 24h (got ${minM}–${maxM} minutes)`);
  }
  const day = dayInfo(date, zone);

  const resolveAt = (wallMin: number, prefer: WallPolicy): FromPosition => {
    const wall = wallAt(date, wallMin);
    const r = resolveWall(wall.toPlainDate(), wall.toPlainTime(), zone, prefer);
    return { instant: r.instant!, exists: r.exists, ambiguous: r.ambiguous, alternative: r.other };
  };
  const policyOf = (hint?: { readonly prefer?: 'earlier' | 'later' | { readonly offset: string } }): WallPolicy => {
    const p = hint?.prefer;
    if (p === undefined) return 'compatible';
    return typeof p === 'object' ? { preferOffset: p.offset } : p;
  };

  if (day.lengthMinutes === 0) {
    // Apia, 30 December 2011: nothing to place, nothing to draw but a folded column.
    return {
      mode,
      day,
      length: 0,
      start: day.start,
      end: day.end,
      bands: [],
      toPosition: () => 0,
      toEndPosition: () => 0,
      fromPosition: () => ({ instant: day.start, exists: false, ambiguous: false, alternative: null }),
      ticks: () => [],
    };
  }

  const axisStart = minM === 0 ? day.start : resolveAt(minM, 'compatible').instant;
  const axisEnd = maxM === 1440 ? day.end : resolveAt(maxM, 'compatible').instant;

  if (mode === 'wall') {
    const length = maxM - minM;
    const clamp = (p: number) => Math.min(length, Math.max(0, p));
    const bands: AxisBand[] = [];
    for (const t of day.transitions) {
      const a = clamp(wallMinutes(date, t.wallBefore) - minM);
      const b = clamp(wallMinutes(date, t.wallAfter) - minM);
      const [from, to] = a < b ? [a, b] : [b, a];
      if (to > from) bands.push({ kind: t.kind, from, to, transition: t });
    }
    // A day without a clock change keeps one offset from its midnight to the
    // next: a position is a subtraction, no Temporal object made (ten thousand
    // events in a week spent most of their model there). Instants outside the
    // day clamp to its ends either way.
    const midnight = day.start.epochMilliseconds;
    const quiet = day.transitions.length === 0;
    const fast = (i: Instant) => clamp((i.epochMilliseconds - midnight) / 60000 - minM);
    return {
      mode,
      day,
      length,
      start: axisStart,
      end: axisEnd,
      bands,
      toPosition: quiet ? fast : (i) => clamp(wallMinutes(date, i.toZonedDateTimeISO(zone).toPlainDateTime()) - minM),
      // Read one millisecond earlier, then step that millisecond back.
      toEndPosition: quiet ? fast : (i) => clamp((wallMs(date, i.subtract({ milliseconds: 1 }).toZonedDateTimeISO(zone).toPlainDateTime()) + 1) / 60000 - minM),
      fromPosition: (p, hint) => resolveAt(minM + p, policyOf(hint)),
      ticks(step) {
        assertStep(step);
        const out: AxisTick[] = [];
        // On the clock's multiples of `step`: a grid from 08:30 still labels 09:00.
        const first = (step - (minM % step)) % step;
        for (let p = first; p <= length + 1e-9; p += step) {
          const wall = wallAt(date, minM + p);
          const r = resolveWall(wall.toPlainDate(), wall.toPlainTime(), zone, 'earlier');
          out.push({
            position: p,
            label: wall.toPlainTime(),
            instant: r.exists ? r.instant : null,
            ...(!r.exists ? { note: 'skipped' as const } : r.ambiguous ? { note: 'first-pass' as const } : {}),
            major: wall.minute === 0,
          });
        }
        return out;
      },
    };
  }

  // Elapsed: the origin is the first instant at or after slotMin on this date.
  const origin = axisStart;
  const length = (axisEnd.epochMilliseconds - origin.epochMilliseconds) / 60000;
  const clamp = (p: number) => Math.min(length, Math.max(0, p));
  const raw = (i: Instant) => (i.epochMilliseconds - origin.epochMilliseconds) / 60000;
  const toPosition = (i: Instant) => clamp(raw(i));
  const bands: AxisBand[] = [];
  for (const t of day.transitions) {
    if (t.kind === 'repeat') {
      // The second pass: from the change to where the first pass reached.
      // Clamped only after both ends are known, or a pass entirely before
      // slotMin would come back as a phantom band at the top.
      const from = clamp(raw(t.at));
      const to = clamp(raw(t.at) - t.deltaMinutes);
      if (to > from) bands.push({ kind: 'repeat', from, to, transition: t });
    }
  }
  return {
    mode,
    day,
    length,
    start: axisStart,
    end: axisEnd,
    bands,
    toPosition,
    toEndPosition: toPosition,
    fromPosition(p) {
      const instant = origin.add({ milliseconds: Math.round(clamp(p) * 60000) });
      const wall = instant.toZonedDateTimeISO(zone).toPlainDateTime();
      const r = resolveWall(wall.toPlainDate(), wall.toPlainTime(), zone, 'earlier');
      const alternative = r.ambiguous ? (r.instant!.equals(instant) ? r.other : r.instant) : null;
      return { instant, exists: true, ambiguous: r.ambiguous, alternative };
    },
    ticks(step) {
      assertStep(step);
      // Walk the wall clock, not elapsed minutes: every wall multiple of
      // `step` that happens gets a tick, twice when it happens twice. On Lord
      // Howe's 23 h 30 day the hours after the jump still fall on :00.
      const out: AxisTick[] = [];
      for (let w = Math.ceil(minM / step) * step; w <= maxM + 1e-9; w += step) {
        const wall = wallAt(date, w);
        const r = resolveWall(wall.toPlainDate(), wall.toPlainTime(), zone, 'earlier');
        if (!r.exists || !r.instant) continue;
        const readings: [Instant, AxisTick['note']][] = r.ambiguous && r.other
          ? [[r.instant, 'first-pass'], [r.other, 'second-pass']]
          : [[r.instant, undefined]];
        for (const [instant, note] of readings) {
          const p = raw(instant);
          if (p < -1e-9 || p > length + 1e-9) continue;
          out.push({ position: p, label: wall.toPlainTime(), instant, ...(note ? { note } : {}), major: wall.minute === 0 });
        }
      }
      return out.sort((a, b) => a.position - b.position);
      return out;
    },
  };
}
