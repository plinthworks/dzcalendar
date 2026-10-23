import { normalizeIntervals } from '../intervals.js';
import type { MsSpan } from '../intervals.js';
import { Temporal } from '../temporal.js';
import type { PlainDate, PlainTime, Weekday, ZoneId } from '../temporal.js';
import { resolveWall } from '../zone.js';

/**
 * Opening hours as people write them: days of the week and wall times, in a
 * zone of their own — a shop in Paris stays open 09:00–18:00 *Paris time*,
 * whatever zone the calendar shows, through both countries' clock changes.
 */
export interface BusinessHoursRule {
  readonly daysOfWeek: readonly Weekday[];
  readonly start: PlainTime | string;
  /** `'24:00'` is the next midnight; an end at or before the start crosses midnight (22:00–06:00). */
  readonly end: PlainTime | string;
  /** Default: the calendar's display zone. */
  readonly timeZone?: ZoneId;
}

/** `true`: Monday to Friday, 09:00–17:00. `false`: none. */
export type BusinessHoursInput = boolean | BusinessHoursRule | readonly BusinessHoursRule[];

const DEFAULT: BusinessHoursRule = { daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };

function rulesOf(input: BusinessHoursInput): readonly BusinessHoursRule[] {
  if (input === true) return [DEFAULT];
  if (input === false) return [];
  return Array.isArray(input) ? input : [input as BusinessHoursRule];
}

// Made on first use, not at import: Temporal may still be loading (18i, `loadTemporal()`).
let _midnight: ReturnType<typeof Temporal.PlainTime.from> | undefined;
const MIDNIGHT = () => (_midnight ??= Temporal.PlainTime.from('00:00'));
const asTime = (t: PlainTime | string): PlainTime | '24:00' =>
  t === '24:00' ? '24:00' : t instanceof Temporal.PlainTime ? t : Temporal.PlainTime.from(t);

/**
 * The open stretches between the start of `from` and the start of `to`
 * (exclusive) in `displayZone`, as epoch-millisecond spans, sorted and merged.
 *
 * Each rule is walked in its own zone's dates, with a day of margin each
 * side, so a rule in another zone or crossing midnight is never cut short;
 * every wall time is resolved (`compatible`), so an interval across a clock
 * change has its true length — a 22:00–06:00 shift on the 25-hour night is 9 h.
 */
export function businessIntervals(from: PlainDate, to: PlainDate, input: BusinessHoursInput, displayZone: ZoneId): MsSpan[] {
  const winStart = from.toZonedDateTime({ timeZone: displayZone }).epochMilliseconds;
  const winEnd = to.toZonedDateTime({ timeZone: displayZone }).epochMilliseconds;
  const spans: MsSpan[] = [];
  for (const rule of rulesOf(input)) {
    const zone = rule.timeZone ?? displayZone;
    const start = asTime(rule.start);
    if (start === '24:00') continue;
    const end = asTime(rule.end);
    for (let d = from.subtract({ days: 2 }); Temporal.PlainDate.compare(d, to.add({ days: 1 })) <= 0; d = d.add({ days: 1 })) {
      if (!rule.daysOfWeek.includes(d.dayOfWeek as Weekday)) continue;
      const s = resolveWall(d, start, zone, 'compatible').instant!.epochMilliseconds;
      const crosses = end === '24:00' || Temporal.PlainTime.compare(end, start) <= 0;
      const endDate = crosses ? d.add({ days: 1 }) : d;
      const e = resolveWall(endDate, end === '24:00' ? MIDNIGHT() : end, zone, 'compatible').instant!.epochMilliseconds;
      const cs = Math.max(s, winStart);
      const ce = Math.min(e, winEnd);
      if (ce > cs) spans.push({ s: cs, e: ce });
    }
  }
  return normalizeIntervals(spans);
}

/**
 * Throws on a rule that cannot be read ("9h", a weekday 8). Business hours
 * are configuration: a mistake there is the programmer's, said once when the
 * options are set — never an exception in the middle of drawing.
 */
export function assertBusinessHours(input: BusinessHoursInput): void {
  for (const rule of rulesOf(input)) {
    if (!Array.isArray(rule.daysOfWeek) || !rule.daysOfWeek.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
      throw new RangeError(`businessHours: daysOfWeek must be ISO weekdays 1–7 (got ${JSON.stringify(rule.daysOfWeek)})`);
    }
    for (const [key, value] of [['start', rule.start], ['end', rule.end]] as const) {
      if (value === '24:00' && key === 'end') continue;
      try {
        asTime(value);
      } catch {
        throw new RangeError(`businessHours: ${key} is not a time (got ${String(value)})`);
      }
    }
  }
}
