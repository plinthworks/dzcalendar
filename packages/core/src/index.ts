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
export { normalizeEvent, normalizeMany, itemEvent } from './event/normalize.js';
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
export { createEventStore, viewWindow, datesWindow, StoreSnapshot } from './store/store.js';
export type { EventStore, ViewWindow, EventInstance, QueryOptions } from './store/store.js';
export { occurrenceLength, materialize, keyOf, escapeId, occurrenceKey, parseInstanceKey, seriesEquals } from './recurrence/series.js';
export { expandSeries, seriesSpan, DEFAULT_OCCURRENCE_LIMIT } from './recurrence/expand.js';
export type { SeriesWindow } from './recurrence/expand.js';
export type { Series } from './recurrence/series.js';
export { parseRRule, serializeRRule } from '@dzcalendar/rrule';
export type { RRule, RRuleSet, Frequency, Weekday as RRuleWeekday } from '@dzcalendar/rrule';
export { editOccurrence, deleteOccurrence, deleteSeries, isOccurrence, startOfKey } from './recurrence/edit.js';
export type { EditScope, OccurrenceRef, EditOptions } from './recurrence/edit.js';
export { validateProposal } from './rules/validate.js';
export type { Placement, Violation, ConstraintSpec, OverlapFn, RulesContext } from './rules/validate.js';
export { rebaseRule, splitRule, countBefore } from '@dzcalendar/rrule';
export { proposeMove, proposeResize, isUnchanged, selectionBetween, commandFor } from './interaction/propose.js';
export type { Hit, InteractionContext, Proposal, Selection } from './interaction/propose.js';
export { intentFor, stepHit, eventHit, grabStep, heldEvent } from './interaction/keymap.js';
export type { Intent, KeyContext, KeyLike, KeyMode, Step } from './interaction/keymap.js';
export { applyCommand } from './commands/apply.js';
export { createHistory } from './commands/history.js';
export type { History, HistoryOptions } from './commands/history.js';
export type { Command, CommandContext, CommandResult, EventPatch, Reach } from './commands/types.js';
export { arraySource, loadStaticSource } from './source/array-source.js';
export type { AbortSignalLike, FetchRequest, SourceFetch, SourceResult, ChunkPolicy, EventSourceSpec, SourceEdit, SaveRequest } from './source/source.js';
export { exportInputs, eventInput, seriesInput } from './source/export.js';
export { createSourceManager } from './source/manager.js';
export type { SourceManager, SourceManagerOptions, SourceNotice, Timers } from './source/manager.js';
export { jsonSource, fnSource } from './source/json-source.js';
export type { JsonSourceOptions, FetchLike } from './source/json-source.js';
export { chunkAt, chunksCovering } from './source/chunks.js';
export type { Chunk } from './source/chunks.js';
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
export { BUILTIN_VIEWS, registerViewSpec, registeredViewSpecs } from './views/builtin.js';
export { computeViewRange } from './views/range.js';
export { navigate } from './views/nav.js';
export type { NavDirection } from './views/nav.js';
export type { ViewSpec, ViewSettings, ViewFamily, ViewRange, NavContext } from './views/spec.js';
export { buildTimeGridModel, buildTimeGridColumn, updateTimeGridModel, locateNow, slotInstant } from './views/timegrid.js';
export type { TimeGridModel, TimeGridColumn, TimeGridOptions, PlacedTimed, MoreTimed, AllDayBar, Reading, AvailableSlot, PlacedSlot, ResourceHead, ResourceGroupHead } from './views/timegrid.js';
export { buildResourceTree, fieldOf, EMPTY_TREE } from './resource/tree.js';
export { flattenRows, columnResources, groupValue } from './resource/rows.js';
export { UNASSIGNED, UNASSIGNED_RESOURCE, instancesOf } from './resource/owners.js';
export type { ResourceRow, RowState, ColumnResources } from './resource/rows.js';
export type { Resource, ResourceInput, ResourceNode, ResourceTree, ResourceOrder } from './resource/types.js';
export { buildDayGridModel, updateDayGridModel } from './views/daygrid.js';
export type { DayGridModel, DayGridWeek, DayGridBar, DayGridOptions } from './views/daygrid.js';
export { formatTemporal, formatToPartsTemporal, formatRangeTitle, weekdayNames, monthNames } from './format/intl.js';
export type { Fmt, Formattable } from './format/intl.js';
export { weekNumber, weekRulesFor } from './format/week.js';
export type { WeekRules } from './format/week.js';
export { createKernel, registerModelFamily, assertTimeline } from './kernel.js';
export type { CalendarKernel, KernelOptions, KernelState, KernelEvent, ViewModel, ModelFamily, ModelOptions, StateCause, TitleFormat, TitleFormatArg } from './kernel.js';
export { businessIntervals, assertBusinessHours } from './rules/business-hours.js';
export type { BusinessHoursRule, BusinessHoursInput } from './rules/business-hours.js';
export { actionsFor } from './actions/actions.js';
export type { ActionTarget, ActionItem, ActionLabels, ActionContext, CreateRequest } from './actions/actions.js';
