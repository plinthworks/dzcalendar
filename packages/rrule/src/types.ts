import type { Temporal } from './temporal.js';

export type Frequency = 'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY';
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A weekday, optionally the n-th of its period (2 = second, -1 = last). */
export interface ByDay {
  readonly weekday: Weekday;
  readonly n?: number;
}

/**
 * A recurrence rule, RFC 5545 §3.3.10, as data. `until` keeps the kind of
 * value it was given: a date for all-day series, an instant otherwise.
 */
export interface RRule {
  readonly freq: Frequency;
  readonly interval: number;
  readonly count?: number;
  readonly until?: Temporal.Instant | Temporal.PlainDate;
  readonly bySecond?: readonly number[];
  readonly byMinute?: readonly number[];
  readonly byHour?: readonly number[];
  readonly byDay?: readonly ByDay[];
  readonly byMonthDay?: readonly number[];
  readonly byYearDay?: readonly number[];
  readonly byWeekNo?: readonly number[];
  readonly byMonth?: readonly number[];
  readonly bySetPos?: readonly number[];
  readonly wkst: Weekday;
}

/** A rule with its exceptions and additions (RFC 5545 EXDATE, RDATE). */
export interface RRuleSet {
  readonly rules: readonly RRule[];
  /**
   * Excluded starts. An instant excludes that moment; a date excludes every
   * occurrence on that date in the series' zone (a date-only EXDATE on a
   * timed series, which FullCalendar ignores — #6105).
   */
  readonly exdates: readonly (Temporal.Instant | Temporal.PlainDate)[];
  /** Added starts: instants for a timed series, dates for an all-day one. */
  readonly rdates: readonly (Temporal.ZonedDateTime | Temporal.PlainDate)[];
}

export type RRuleProblemCode = 'invalid-rrule' | 'too-many-occurrences';

export interface RRuleProblem {
  readonly code: RRuleProblemCode;
  readonly detail: string;
}
