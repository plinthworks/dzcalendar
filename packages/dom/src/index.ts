/**
 * @dzcalendar/dom — the calendar in plain DOM: time grid and day grid, pointer, touch and keyboard.
 */
export { createCalendar } from './calendar.js';
export type { CalendarOptions, CalendarInstance, CalendarUpdate } from './calendar.js';
export { EN, FR } from './messages.js';
export type { DzMessages } from './messages.js';
export { DZ_CSS, ensureStyles } from './styles.js';
export { NO_MOTION } from './motion.js';
export type { MotionAdapter } from './motion.js';
export { registerView } from './host.js';
export type { ViewController, ViewCtx, ViewFactory, CalendarHooks, EventHooks, EventContentCtx, ContextMenuCtx, MenuHook, ScopeRequest } from './host.js';
export type { LiveSettings, DateClick } from './settings.js';
// A custom view takes part in gestures with a surface, and in the keyboard with its `keys` (none: no keyboard).
export type { InteractionSurface, KeyboardSurface, Box } from './interact/surface.js';
