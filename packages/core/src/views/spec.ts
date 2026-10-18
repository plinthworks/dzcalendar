import type { DurationLike, PlainDate, Weekday } from '../temporal.js';

/** A built-in family, or one an application or plugin registers (`defineView` uses the view's type). */
export type ViewFamily = 'dayGrid' | 'timeGrid' | 'list' | 'multiMonth' | 'timeline' | 'custom' | (string & {});

/**
 * What a view shows, as data: a family (how it is drawn) and a stretch of
 * time (how long, aligned on what). A custom view is a new spec, not a subclass.
 */
export interface ViewSpec {
  readonly type: string;
  readonly family: ViewFamily;
  /** `{ months: 1 }`, `{ weeks: 1 }`, `{ days: 3 }`, `{ years: 1 }`. */
  readonly duration: DurationLike;
  readonly alignment: 'month' | 'week' | 'day' | 'year' | 'none';
  /** Count shown days rather than calendar days: four days skipping hidden weekends. */
  readonly dayCount?: number;
  /** Month grids: always six weeks (true), or only the weeks the month touches. */
  readonly fixedWeekCount: boolean;
  readonly hiddenDays: readonly Weekday[];
  /** How far prev/next move. Default: the duration. */
  readonly dateIncrement?: DurationLike;
  readonly showNonCurrentDates: boolean;
  /** A resource view: its family draws one column per resource and date (timeGrid, dayGrid). */
  readonly resources?: boolean;
}

/** The dates a view covers. `start`/`end` include padding days; `active*` is the period itself. */
export interface ViewRange {
  readonly start: PlainDate;
  /** Exclusive. */
  readonly end: PlainDate;
  readonly activeStart: PlainDate;
  /** Exclusive. */
  readonly activeEnd: PlainDate;
  /** Shown dates in order, hidden days removed. */
  readonly dates: readonly PlainDate[];
  /** `dates` in rows of one week each (a month grid), or a single row. */
  readonly weeks: readonly (readonly PlainDate[])[];
  /** A multi-month view: each month's own grid (padding days included), in order. */
  readonly months?: readonly ViewRange[];
}

export interface NavContext {
  readonly firstDay: Weekday;
  readonly today: PlainDate;
}
