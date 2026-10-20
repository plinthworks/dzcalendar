/**
 * @dzcalendar/react — the calendar in React 18 and 19: `<DzCalendar>`,
 * `useCalendarController` / `useCalendarState` for what sits around it,
 * `DzCalendarProvider` for what an application settles once, and events
 * drawn by the application's own components.
 */
export { DzCalendar } from './calendar.js';
export type { DzCalendarProps, DzCalendarHandle, DzCalendarOptions } from './calendar.js';
export { CalendarController, useCalendarController, useCalendarState, useParentCalendarController } from './controller.js';
export type { CalendarSnapshot } from './controller.js';
export { DzCalendarProvider, DzCalendarContext } from './context.js';
export type { DzCalendarDefaults } from './context.js';
