import type { Instant, PlainDate, PlainTime, Weekday, ZoneId, ZonedDateTime } from '@dzcalendar/core';

/** A wall time: `'08:30'` or a PlainTime. As an end, `'24:00'` is the next midnight. */
export type WallTime = PlainTime | string;
/** A moment: an Instant, a ZonedDateTime, or their ISO strings (`2026-10-21T08:00Z`, `…[Asia/Riyadh]`). */
export type Moment = Instant | ZonedDateTime | string;

/** Open from `from` to `to`, wall times of the provider's zone. An end at or before the start crosses midnight. */
export interface Window {
  readonly from: WallTime;
  readonly to: WallTime;
}

/** Open on these ISO weekdays (1 Monday … 7 Sunday). */
export interface WeeklyWindow extends Window {
  readonly days: readonly Weekday[];
}

/**
 * A date that does not follow the week: `closed`, or its own `windows`. It
 * replaces every window that starts on that date (weekly and rules alike).
 */
export interface DateException {
  readonly date: PlainDate | string;
  readonly closed?: boolean;
  readonly windows?: readonly Window[];
}

/** Open on the dates of an RFC 5545 rule (`FREQ=MONTHLY;BYDAY=1SA`), from its first date `start`. */
export interface RuleWindow extends Window {
  readonly rrule: string;
  readonly start: PlainDate | string;
  readonly exdates?: readonly (PlainDate | string)[];
}

/** When the provider can be booked, in the provider's own zone. */
export interface Availability {
  readonly timeZone: ZoneId;
  readonly weekly?: readonly WeeklyWindow[];
  readonly exceptions?: readonly DateException[];
  readonly rules?: readonly RuleWindow[];
}

/**
 * Something already taking the time. A `booking` (the default) is an
 * appointment: it gets the same buffers as a new slot and counts toward the
 * daily cap. A `block` (leave, a meeting in another agenda) only takes its time.
 */
export interface Busy {
  readonly start: Moment;
  readonly end: Moment;
  readonly kind?: 'booking' | 'block';
}

export interface SlotQuery {
  readonly availability: Availability;
  /** The slots wanted start at or after `from` and end at or before `to`. */
  readonly from: Moment;
  readonly to: Moment;
  /** Minutes of real (elapsed) time. */
  readonly duration: number;
  /** Minutes between two slot starts, counted from each opening. Default: the duration. */
  readonly step?: number;
  /** Minutes kept free before and after each appointment (preparation, cleaning). */
  readonly bufferBefore?: number;
  readonly bufferAfter?: number;
  /** No slot starting sooner than this many minutes after `now`. */
  readonly minNotice?: number;
  /** No slot starting later than this many days after `now`. */
  readonly maxAdvanceDays?: number;
  /** Needed by `minNotice` and `maxAdvanceDays` (the engine never reads a clock). */
  readonly now?: Moment;
  /** At most this many bookings starting on one of the provider's dates; a full date offers nothing. */
  readonly maxPerDay?: number;
  readonly busy?: readonly Busy[];
}

/** A bookable slot, in the provider's zone (`.withTimeZone(client)` shows it in another). */
export interface Slot {
  readonly start: ZonedDateTime;
  readonly end: ZonedDateTime;
}

/** Why `checkSlot` refused a start. */
export type SlotRefusal = 'invalid-query' | 'closed' | 'misaligned' | 'busy' | 'notice' | 'advance' | 'daily-cap' | 'out-of-range';

export type SlotCheck = { readonly ok: true; readonly slot: Slot } | { readonly ok: false; readonly reason: SlotRefusal };
