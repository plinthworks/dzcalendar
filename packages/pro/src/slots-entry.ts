/**
 * `@dzcalendar/pro/slots`: bookable slots with seats (capacity). The same
 * names as `@dzcalendar/slots` — `findSlots`, `checkSlot` — where a booking
 * takes its seats rather than the whole slot; the same answer on the server.
 */
export { findSlots, checkSlot, seatedBusyFromEvents, resourceSeats } from './slots/capacity.js';
export type { SeatedBusy, SeatsQuery, SeatsCheckQuery, SeatedSlot, SeatsRefusal, SeatsCheck } from './slots/capacity.js';
