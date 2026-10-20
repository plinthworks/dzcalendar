/**
 * @dzcalendar/angular — the calendar in Angular: `<dz-calendar>` with signal
 * inputs and two-way `view`, `date`, `selection`; `CalendarController` as
 * signals for what sits around it; `dzEventContent` templates. Zoneless or
 * zone.js.
 */
import { DzCalendar } from './calendar.js';
import { DzDayHeader, DzEventContent } from './templates.js';

/** Everything a template needs, in one import: `imports: [DZ_CALENDAR]`. */
export const DZ_CALENDAR = [DzCalendar, DzEventContent, DzDayHeader] as const;

export { DzCalendar } from './calendar.js';
export type { DzCalendarOptions } from './calendar.js';
export { CalendarController } from './controller.js';
export { DzDayHeader, DzEventContent } from './templates.js';
export type { DayHeaderContext, EventContentContext } from './templates.js';
export { DZ_CALENDAR_DEFAULTS, DZ_MOTION, provideDzCalendar, provideDzMotion } from './providers.js';
export type { DzCalendarDefaults } from './providers.js';
