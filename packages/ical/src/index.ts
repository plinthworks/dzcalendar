/**
 * @dzcalendar/ical — iCalendar (RFC 5545) on Temporal. Each event keeps its
 * real zone: IANA TZIDs as they are, Windows names through CLDR's table, a
 * custom VTIMEZONE matched to the IANA zone with the same offsets. Writes
 * VTIMEZONEs from the zones' real transitions.
 */
export { parseICal } from './parse.js';
export type { ParseICalOptions, ParsedICal, ICalCalendar } from './parse.js';
export { serializeICal } from './serialize.js';
export type { SerializeICalOptions } from './serialize.js';
export { icalSource } from './source.js';
export type { ICalSourceOptions, FetchLike } from './source.js';
export { windowsZone } from './zones.js';
