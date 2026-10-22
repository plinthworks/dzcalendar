/**
 * @dzcalendar/dom — the calendar in plain DOM: time grid and day grid, pointer, touch and keyboard.
 */
export { createCalendar } from './calendar.js';
export type { CalendarOptions, CalendarInstance, CalendarUpdate } from './calendar.js';
export { EN, FR, defineLocale, messagesForLocale } from './messages.js';
export type { DzMessages } from './messages.js';
export { DZ_CSS, ensureStyles } from './styles.js';
export { defineTheme, themeCss, THEME_NAMES } from './themes.js';
export type { ThemeTokens, ThemeColor, ThemeName } from './themes.js';
export { NO_MOTION } from './motion.js';
export type { MotionAdapter, MotionChange, MotionSide, MotionEnter } from './motion.js';
export { WAAPI_MOTION, createWaapiMotion } from './motion-waapi.js';
export { registerView, hasRenderer } from './host.js';
export type { ViewController, ViewCtx, ViewFactory, CalendarHooks, EventHooks, EventContentCtx, ResourceHooks, ResourceContentCtx, ContextMenuCtx, MenuHook, ScopeRequest } from './host.js';
export type { DayHeaderHooks } from './render/day-head.js';
export type {
  AllDayLabelCtx,
  DayCellCtx,
  DayHeaderCtx,
  DayLaneCtx,
  ElementHooks,
  ListDayHeaderCtx,
  MonthHeaderCtx,
  MoreLinkCtx,
  MorePopoverCtx,
  NoEventsCtx,
  NowIndicatorCtx,
  ResourceAreaHeaderCtx,
  ResourceGroupCtx,
  ResourceLaneCtx,
  SlotLabelCtx,
  SlotLaneCtx,
  ViewHookCtx,
  WeekNumberCtx,
} from './render/hooks.js';
export type { LiveSettings, DateClick, EventChange } from './settings.js';
export type { CustomButton, HeaderToolbar } from './toolbar.js';
// A custom view takes part in gestures with a surface, and in the keyboard with its `keys` (none: no keyboard).
export type { InteractionSurface, KeyboardSurface, Box } from './interact/surface.js';
