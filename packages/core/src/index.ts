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
export { dayInfo, dayInfos, transitionsBetween, resolveWall, isValidZone, isOffsetZone, isQuietDay } from './zone.js';
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
export { epochDay, fromEpochDay } from './days.js';
export { PersistentOrderedMap } from './store/ordered-map.js';
export { PersistentIntervalTree } from './store/interval-tree.js';
export { eventEquals, sameValue, stamp } from './store/diff.js';
export { invert, isEmptyChange } from './store/changes.js';
export type { Mutation, StoreChange, ChangeCause } from './store/changes.js';
export { createEventStore, viewWindow, StoreSnapshot } from './store/store.js';
export type { EventStore, ViewWindow, EventInstance, QueryOptions } from './store/store.js';
export { applyCommand } from './commands/apply.js';
export { createHistory } from './commands/history.js';
export type { History, HistoryOptions } from './commands/history.js';
export type { Command, CommandContext, CommandResult, EventPatch } from './commands/types.js';
export { arraySource, loadStaticSource } from './source/array-source.js';
export type { AbortSignalLike, FetchRequest, SourceFetch, ChunkPolicy, EventSourceSpec } from './source/source.js';
export { layoutColumn } from './layout/column.js';
export type { ColItem, ColPlacement, ColumnLayoutOptions } from './layout/column.js';
export { packLanes, computeOverflow } from './layout/rows.js';
export type { RowItem, Packed, OverflowPiece, OverflowResult } from './layout/rows.js';
export { PrefixSums, visibleRange, visible2D } from './layout/virtual.js';
export type { VRange, Sizes } from './layout/virtual.js';
export { segmentTimed, segmentAllDay, splitByWeek, dateIndex } from './project/segment.js';
export type { Segment, TimedSegment, SegmentTimedOptions, DateIndex } from './project/segment.js';
export { buildColumnAxis } from './project/time-axis.js';
export type { AxisMode, AxisTick, AxisBand, ColumnAxis, ColumnAxisOptions, FromPosition } from './project/time-axis.js';
export { BUILTIN_VIEWS } from './views/builtin.js';
export { computeViewRange } from './views/range.js';
export { navigate } from './views/nav.js';
export type { NavDirection } from './views/nav.js';
export type { ViewSpec, ViewFamily, ViewRange, NavContext } from './views/spec.js';
export { buildTimeGridModel } from './views/timegrid.js';
export type { TimeGridModel, TimeGridColumn, TimeGridOptions, PlacedTimed, AllDayBar } from './views/timegrid.js';
export { buildDayGridModel } from './views/daygrid.js';
export type { DayGridModel, DayGridWeek, DayGridBar, DayGridOptions } from './views/daygrid.js';
export { formatTemporal, formatToPartsTemporal, formatRangeTitle, weekdayNames, monthNames } from './format/intl.js';
export type { Fmt, Formattable } from './format/intl.js';
export { weekNumber, weekRulesFor } from './format/week.js';
export type { WeekRules } from './format/week.js';
