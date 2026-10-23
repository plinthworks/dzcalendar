/**
 * `@dzcalendar/core/recurrence`: repeating events (RRULE, EXDATE, RDATE,
 * series editing). Imported once by an application that has them; without
 * it, an event with `rrule` is refused with a Problem
 * (`recurrence-not-loaded`) — owner, 18i.
 */
import { parseRRule, serializeRRule } from '@dzcalendar/rrule';
import { expandSeries, occurrenceSpan, seriesSpan } from './recurrence/expand.js';
import { deleteOccurrence, deleteSeries, editOccurrence, editedOccurrence, firstKey, startOfKey } from './recurrence/edit.js';
import { useRecurrence } from './recurrence/engine.js';

useRecurrence({ parseRRule, serializeRRule, expandSeries, occurrenceSpan, seriesSpan, editOccurrence, editedOccurrence, deleteOccurrence, deleteSeries, firstKey, startOfKey });

export { useRecurrence } from './recurrence/engine.js';
