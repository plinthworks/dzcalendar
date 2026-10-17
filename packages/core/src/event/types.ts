import type { DurationLike, Instant, PlainDate, PlainDateTime, ZonedDateTime, ZoneId } from '../temporal.js';

export type EventId = string;
export type ResourceId = string;
export type SeriesId = string;
/**
 * An occurrence's identity within its series: its *original* start, written
 * in full — `2026-10-25T02:30:00+02:00[Europe/Paris]`, or a date for an
 * all-day series. The offset is part of it, so the two 02:30s of a fall-back
 * night are two occurrences, never one.
 */
export type RecurrenceKey = string;

/** What can be written where a moment is expected. Never a `Date` — see `date-object-rejected`. */
export type TemporalInput = ZonedDateTime | PlainDate | PlainDateTime | Instant | string;

export type EventDisplay = 'auto' | 'block' | 'list-item' | 'background' | 'inverse-background' | 'none';
export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

/**
 * An event as an application hands it in: loose, partly optional, strings
 * welcome. `normalizeEvent` turns it into a `CalEvent` or says why it cannot.
 *
 * With `rrule` (and optionally `exdate`, `rdate`) it becomes a series: its
 * start is the first occurrence, its length every occurrence's length.
 */
export interface EventInput {
  id?: string;
  groupId?: string;
  title?: string;
  start?: TemporalInput;
  end?: TemporalInput;
  /** Used when `end` is absent. Days are wall days, hours are elapsed hours (`ZonedDateTime.add`). */
  duration?: DurationLike;
  allDay?: boolean;
  /** The event's own zone, for a start that does not carry one. */
  timeZone?: ZoneId;
  resourceId?: ResourceId;
  resourceIds?: readonly ResourceId[];
  /** An RFC 5545 rule (`FREQ=WEEKLY;BYDAY=MO`), or several: the event becomes a series. */
  rrule?: string | readonly string[];
  exdate?: readonly TemporalInput[];
  rdate?: readonly TemporalInput[];
  /**
   * With `recurrenceId`, the event replaces one occurrence of the series
   * `seriesId` (iCalendar's RECURRENCE-ID): the occurrence that *would have*
   * started then. Linked when the series comes in the same batch.
   */
  seriesId?: SeriesId;
  recurrenceId?: TemporalInput;
  display?: EventDisplay;
  status?: EventStatus;
  /** Feeds the slot engine: a busy event blocks availability. Default: not cancelled. */
  busy?: boolean;
  editable?: boolean;
  startEditable?: boolean;
  durationEditable?: boolean;
  resourceEditable?: boolean;
  classNames?: readonly string[];
  /** A token name (`--dz-tone-<tone>`), not a colour: themes decide what it looks like. */
  tone?: string;
  url?: string;
  extendedProps?: Readonly<Record<string, unknown>>;
}

interface EventCommon {
  readonly id: EventId;
  readonly groupId?: string;
  readonly title: string;
  readonly resourceIds: readonly ResourceId[];
  readonly display: EventDisplay;
  readonly status: EventStatus;
  readonly busy: boolean;
  readonly perms: { readonly start: boolean; readonly duration: boolean; readonly resource: boolean };
  readonly classNames: readonly string[];
  readonly tone?: string;
  readonly url?: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly sourceId?: string;
  /** Present on an occurrence of a series (and, in Phase 6, on an override): which one it stands for. */
  readonly ref?: { readonly seriesId: SeriesId; readonly key: RecurrenceKey };
  /**
   * +1 on every change: what a render hook keys on to know it must run again.
   * The store owns it (Phase 1): normalization always says 0, "not yet assigned".
   */
  readonly revision: number;
}

/**
 * An event at a time of day. `start` and `end` may sit in different zones —
 * a flight leaves Paris and lands in Tokyo. The event's zone is its start's.
 * Invariant: `end` is not before `start`, compared as instants. Equal is a
 * milestone, which the layout draws at a minimum height.
 */
export interface TimedEvent extends EventCommon {
  readonly allDay: false;
  readonly start: ZonedDateTime;
  readonly end: ZonedDateTime;
  /**
   * True when no zone was named and the display zone was assumed
   * (`zone-defaulted`, `offset-only`). Such an event follows the calendar when
   * its zone changes; one whose zone was named never does.
   */
  readonly zoneGuessed: boolean;
}

/**
 * An event on whole dates, with no zone at all: it covers the same calendar
 * days for every reader, wherever they are. `end` is exclusive and after `start`.
 */
export interface AllDayEvent extends EventCommon {
  readonly allDay: true;
  readonly start: PlainDate;
  readonly end: PlainDate;
}

export type CalEvent = TimedEvent | AllDayEvent;
