/**
 * @dzcalendar/angular — the calendar in Angular: `<dz-calendar>` with signal
 * inputs and two-way `view`, `date`, `selection`; `CalendarController` as
 * signals for what sits around it; `dzEventContent` templates. Zoneless or
 * zone.js.
 */
import { DzCalendar } from './calendar.js';
import { DzAllDayLabel, DzDayCell, DzDayHeader, DzEventContent, DzHeaderItem, DzListDayHeader, DzMonthHeader, DzMoreLink, DzNoEvents, DzNowIndicator, DzResource, DzResourceAreaHeader, DzResourceGroupHeader, DzSlotLabel, DzWeekNumber } from './templates.js';

/** Everything a template needs, in one import: `imports: [DZ_CALENDAR]`. */
export const DZ_CALENDAR = [
  DzCalendar,
  DzEventContent,
  DzDayHeader,
  DzDayCell,
  DzSlotLabel,
  DzAllDayLabel,
  DzMoreLink,
  DzNowIndicator,
  DzWeekNumber,
  DzNoEvents,
  DzListDayHeader,
  DzMonthHeader,
  DzResource,
  DzResourceGroupHeader,
  DzResourceAreaHeader,
  DzHeaderItem,
] as const;

export { DzCalendar } from './calendar.js';
export type { DzCalendarOptions } from './calendar.js';
export { CalendarController } from './controller.js';
export { DzAllDayLabel, DzDayCell, DzDayHeader, DzEventContent, DzHeaderItem, DzListDayHeader, DzMonthHeader, DzMoreLink, DzNoEvents, DzNowIndicator, DzResource, DzResourceAreaHeader, DzResourceGroupHeader, DzSlotLabel, DzWeekNumber } from './templates.js';
export type { DayHeaderContext, ElementContext, EventContentContext } from './templates.js';
export { DZ_CALENDAR_DEFAULTS, DZ_MOTION, provideDzCalendar, provideDzMotion } from './providers.js';
export type { DzCalendarDefaults } from './providers.js';
