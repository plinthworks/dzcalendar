/**
 * @dzcalendar/core — the calendar's model, on Temporal.
 *
 * No DOM, no framework, no `Date`. Everything here is a pure function over
 * Temporal values, tested against real IANA rules. Temporal itself comes from
 * @tzslot/core, so an app using both carries one polyfill.
 */
export { Temporal, usingPolyfill } from './temporal.js';
export type {
  PlainDate,
  PlainTime,
  PlainDateTime,
  ZonedDateTime,
  Instant,
  Duration,
  DurationLike,
  Weekday,
  PlainYearMonth,
  ZoneId,
  EpochMs,
} from './temporal.js';
export { createIdGenerator } from './ids.js';
export type { IdGenerator } from './ids.js';
export { normalizeIntervals, unionSpans, intersectSpans, subtractSpans, spansToIntervals } from './intervals.js';
export type { Interval, MsSpan } from './intervals.js';
export { dayInfo, dayInfos, transitionsBetween, resolveWall, isValidZone, isOffsetZone } from './zone.js';
export type { DayInfo, DayKind, Transition, WallPolicy, ResolvedWall } from './zone.js';
export { normalizeEvent, normalizeMany } from './event/normalize.js';
export type { NormalizeContext, Normalized, NormalizeResult, NormalizationReport } from './event/normalize.js';
export { DEFAULT_TIMED_DURATION, DEFAULT_ALL_DAY_DURATION } from './event/defaults.js';
export type { Problem, ProblemCode, Severity } from './event/problems.js';
export type {
  CalEvent,
  TimedEvent,
  AllDayEvent,
  EventInput,
  EventId,
  ResourceId,
  TemporalInput,
  EventDisplay,
  EventStatus,
} from './event/types.js';
