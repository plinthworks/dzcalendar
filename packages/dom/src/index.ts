/**
 * @dzcalendar/dom — the calendar in plain DOM. Phase 3: the time grid, read-only.
 */
export { createCalendar } from './calendar.js';
export type { CalendarOptions, CalendarInstance, CalendarUpdate } from './calendar.js';
export { EN, FR } from './messages.js';
export type { DzMessages } from './messages.js';
export { DZ_CSS, ensureStyles } from './styles.js';
export { NO_MOTION } from './motion.js';
export type { MotionAdapter } from './motion.js';
export { registerView } from './host.js';
export type { ViewController, ViewCtx, ViewFactory, CalendarHooks, EventHooks, EventContentCtx, ContextMenuCtx, MenuHook } from './host.js';
