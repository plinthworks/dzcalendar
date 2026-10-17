import { InjectionToken } from '@angular/core';
import type { CalendarOptions } from '@dzcalendar/dom';

/**
 * What an application settles once: the zone, the locale, the words, any
 * other option. Anything set on a `<dz-calendar>` still wins.
 */
export type DzCalendarDefaults = Omit<CalendarOptions, 'kernel'>;

export const DZ_CALENDAR_DEFAULTS = new InjectionToken<DzCalendarDefaults>('dzcalendar.defaults', {
  providedIn: 'root',
  factory: () => ({}),
});

/** `bootstrapApplication(App, { providers: [provideDzCalendar({ timeZone: 'Europe/Paris', locale: 'fr-FR' })] })` */
export function provideDzCalendar(defaults: DzCalendarDefaults) {
  return [{ provide: DZ_CALENDAR_DEFAULTS, useValue: defaults }];
}
