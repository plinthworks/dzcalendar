import { expandDates, expandZoned, firstStart, lastStart } from '@dzcalendar/rrule';
import { epochDay } from '../days.js';
import type { MsSpan } from '../intervals.js';
import { problem } from '../event/problems.js';
import type { Problem } from '../event/problems.js';
import type { CalEvent } from '../event/types.js';
import { Temporal } from '../temporal.js';
import type { Instant, PlainDate, ZonedDateTime } from '../temporal.js';
import { materialize, occurrenceLength } from './series.js';
import type { Series } from './series.js';

/** What a series is expanded through: instants for a timed one, dates for an all-day one. */
export interface SeriesWindow {
  readonly start: Instant;
  readonly end: Instant;
  readonly startDate: PlainDate;
  /** Exclusive. */
  readonly endDate: PlainDate;
}

/** Occurrences a series may show in one window before it says `too-many-occurrences`. */
export const DEFAULT_OCCURRENCE_LIMIT = 2000;

/** Where an endless series ends in an index. */
export const FOREVER = Number.MAX_SAFE_INTEGER;

/**
 * The occurrences of a series that meet the window, as events — including
 * one that began before the window and runs into it. Overrides are not
 * skipped here: that is the caller's (the store knows them).
 */
export function expandSeries(sr: Series, w: SeriesWindow, o: { readonly limit?: number } = {}): { occurrences: CalEvent[]; problems: Problem[] } {
  const limit = o.limit ?? DEFAULT_OCCURRENCE_LIMIT;
  const base = sr.base;
  const len = occurrenceLength(base);
  let starts: (ZonedDateTime | PlainDate)[];
  let codes: readonly { code: string; detail?: string }[];
  if (base.allDay) {
    const days = Math.max(1, len.days);
    const r = expandDates(base.start, sr.set, { from: w.startDate.subtract({ days: days - 1 }), to: w.endDate }, limit);
    starts = r.starts;
    codes = r.problems;
  } else {
    // Widened back by the length — and by an hour per wall day in it, which a
    // 25-hour day adds — so an occurrence that began before the window is found.
    const back = len.total({ unit: 'milliseconds', relativeTo: base.start }) + (len.days + 1) * 3_600_000;
    const from = Temporal.Instant.fromEpochMilliseconds(w.start.epochMilliseconds - Math.max(0, back));
    const r = expandZoned(base.start, sr.set, { from, to: w.end }, limit);
    starts = r.starts;
    codes = r.problems;
  }
  const occurrences = starts.map((x) => materialize(sr, x)).filter((ev) => meets(ev, w));
  const problems = codes.map((p) => problem('too-many-occurrences', 'warning', `series:${sr.id}`, p.detail));
  return { occurrences, problems };
}

function meets(ev: CalEvent, w: SeriesWindow): boolean {
  if (ev.allDay) return Temporal.PlainDate.compare(ev.start, w.endDate) < 0 && Temporal.PlainDate.compare(ev.end, w.startDate) > 0;
  const s = ev.start.epochMilliseconds;
  const e = Math.max(ev.end.epochMilliseconds, s + 1);
  return s < w.end.epochMilliseconds && e > w.start.epochMilliseconds;
}

/** Where a series sits in an index: from its first start (an RDATE may come first) to its last end, or forever. */
export function seriesSpan(sr: Series): MsSpan {
  const base = sr.base;
  const first = firstStart(base.start, sr.set);
  const last = lastStart(base.start, sr.set);
  const len = occurrenceLength(base);
  if (base.allDay) {
    return { s: epochDay(first as PlainDate), e: last === null ? FOREVER : epochDay(last as PlainDate) + Math.max(1, len.days) };
  }
  const s = (first as ZonedDateTime).epochMilliseconds;
  if (last === null) return { s, e: FOREVER };
  const end = (last as ZonedDateTime).add(len).epochMilliseconds;
  return { s, e: Math.max(end, s + 1) };
}

/**
 * Where the occurrence a key (or an EXDATE) names sits, in the units of the
 * index: epoch ms for a timed series, epoch days for an all-day one. A date
 * on a timed series covers that whole day in the series' zone.
 */
export function occurrenceSpan(sr: Series, at: string | Instant | PlainDate): MsSpan {
  const base = sr.base;
  const len = occurrenceLength(base);
  if (base.allDay) {
    const d = typeof at === 'string' ? Temporal.PlainDate.from(at) : at instanceof Temporal.PlainDate ? at : at.toZonedDateTimeISO('UTC').toPlainDate();
    return { s: epochDay(d), e: epochDay(d) + Math.max(1, len.days) };
  }
  const zone = base.start.timeZoneId;
  if (at instanceof Temporal.PlainDate) {
    const s = at.toZonedDateTime({ timeZone: zone });
    return { s: s.epochMilliseconds, e: s.add({ days: 1 }).add(len).epochMilliseconds };
  }
  const start = typeof at === 'string' ? Temporal.ZonedDateTime.from(at) : at.toZonedDateTimeISO(zone);
  const s = start.epochMilliseconds;
  return { s, e: Math.max(start.add(len).epochMilliseconds, s + 1) };
}
