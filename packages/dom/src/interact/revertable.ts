import type { EventChange } from '../settings.js';

/**
 * Whether a change can still be taken back, without taking it: what a revert across two calendars asks of both
 * sides before touching either (18j review: the event could end on neither). Internal; not part of `EventChange`.
 */
export const canRevertOf = new WeakMap<EventChange, () => boolean>();
