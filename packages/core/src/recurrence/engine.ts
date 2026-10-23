/**
 * The recurrence engine, plugged in by `@dzcalendar/core/recurrence` (owner,
 * 18i): a calendar without a repeating event does not pay for RRULE parsing,
 * expansion and series editing. Only types are imported here — nothing of the
 * engine's code is reached from the core's own modules.
 */
import type { parseRRule, serializeRRule } from '@dzcalendar/rrule';
import type { expandSeries, occurrenceSpan, seriesSpan } from './expand.js';
import type { deleteOccurrence, deleteSeries, editOccurrence, editedOccurrence, firstKey, startOfKey } from './edit.js';

export interface RecurrenceEngine {
  readonly parseRRule: typeof parseRRule;
  readonly serializeRRule: typeof serializeRRule;
  readonly expandSeries: typeof expandSeries;
  readonly occurrenceSpan: typeof occurrenceSpan;
  readonly seriesSpan: typeof seriesSpan;
  readonly editOccurrence: typeof editOccurrence;
  readonly editedOccurrence: typeof editedOccurrence;
  readonly deleteOccurrence: typeof deleteOccurrence;
  readonly deleteSeries: typeof deleteSeries;
  readonly firstKey: typeof firstKey;
  readonly startOfKey: typeof startOfKey;
}

let engine: RecurrenceEngine | null = null;

/** Plugged in by `@dzcalendar/core/recurrence`; null takes it out (tests). */
export function useRecurrence(e: RecurrenceEngine | null): void {
  engine = e;
}

/** The engine if plugged in: a repeating event without it is a Problem (`recurrence-not-loaded`). */
export const recurrenceEngine = (): RecurrenceEngine | null => engine;

/**
 * The engine where a series exists already (one can only be made with it):
 * its absence there is the program's mistake, said plainly.
 */
export function needRecurrence(): RecurrenceEngine {
  if (!engine) throw new Error("dzcalendar: a series without the recurrence engine — import '@dzcalendar/core/recurrence'");
  return engine;
}
