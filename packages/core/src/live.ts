/**
 * `@dzcalendar/core/live` — sources that are told rather than asked (owner, 2026-11-05): `liveSource` for any feed
 * (a WebSocket, MQTT…), `sseSource` for Server-Sent Events. Apart from the core: only an application that shows a
 * live feed loads it.
 */
export { liveSource, sseSource } from './source/live.js';
export type { LiveMessage, LiveSourceOptions, SseSourceOptions } from './source/live.js';
