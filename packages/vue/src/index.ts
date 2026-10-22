/**
 * @dzcalendar/vue — the calendar in Vue 3.4 and 3.5: `<DzCalendar>` with
 * `v-model:view`, `v-model:date`, `v-model:selection`; a `CalendarController`
 * of refs (`createCalendarController`, `injectCalendarController`); the
 * `#event-content` slot; `DzCalendarPlugin` for what an application settles
 * once.
 */
export { DzCalendar } from './calendar.js';
export type { DayHeaderSlotProps, DzCalendarComponent, DzCalendarOptions, DzCalendarProps, DzCalendarSlots, EventContentSlotProps } from './calendar.js';
export { CALENDAR_CONTROLLER, createCalendarController, injectCalendarController } from './controller.js';
export type { CalendarController } from './controller.js';
export { DzCalendarPlugin, DZ_CALENDAR_SETTLED, provideDzCalendar } from './plugin.js';
export type { DzCalendarDefaults, DzCalendarSettled } from './plugin.js';
