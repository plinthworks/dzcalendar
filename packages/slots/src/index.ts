/**
 * @dzcalendar/slots — when can this provider be booked? Weekly hours and
 * dated exceptions in the provider's own zone, minus what is busy, cut into
 * slots, with buffers, notice, horizon and a daily cap. Pure Temporal, no
 * clock read, the same answer in the browser and on the server.
 */
export { findSlots, checkSlot, toInstant as readMoment } from './engine.js';
export { openSpans } from './availability.js';
export { busyFromEvents } from './busy.js';
export type { Availability, WeeklyWindow, DateException, RuleWindow, Window, WallTime, Moment, Busy, SlotQuery, CheckQuery, Slot, SlotCheck, SlotRefusal } from './types.js';
