import { InjectionToken, provideAppInitializer } from '@angular/core';
import { loadTemporal } from '@dzcalendar/core';
import type { CalendarOptions, MotionAdapter } from '@dzcalendar/dom';

/**
 * What an application settles once: the zone, the locale, the words, any
 * other option. Anything set on a `<dz-calendar>` still wins.
 */
/** Each calendar's `hooks` and `headerItems` are its own (its templates and its `hooks`): not settled for all. */
export type DzCalendarDefaults = Omit<CalendarOptions, 'kernel' | 'hooks' | 'headerItems'>;

export const DZ_CALENDAR_DEFAULTS = new InjectionToken<DzCalendarDefaults>('dzcalendar.defaults', {
  providedIn: 'root',
  factory: () => ({}),
});

/** `bootstrapApplication(App, { providers: [provideDzCalendar({ timeZone: 'Europe/Paris', locale: 'fr-FR' })] })` */
export function provideDzCalendar(defaults: DzCalendarDefaults = {}) {
  // No Temporal of its own (Safari): the application starts once its polyfill has arrived — at once elsewhere (owner, 18i).
  return [{ provide: DZ_CALENDAR_DEFAULTS, useValue: defaults }, provideAppInitializer(() => loadTemporal())];
}

/** Makes each calendar's motion adapter (one per calendar: a drag's state is the adapter's). */
export const DZ_MOTION = new InjectionToken<(() => MotionAdapter) | null>('dzcalendar.motion', {
  providedIn: 'root',
  factory: () => null,
});

/**
 * The motion of every `<dz-calendar>` of the application, settled once:
 * `provideDzMotion(() => createGsapMotion({ preset: 'sober' }))`. One adapter
 * is made per calendar. A `motion` given to `provideDzCalendar` or to a
 * calendar still wins.
 */
export function provideDzMotion(make: () => MotionAdapter) {
  return [{ provide: DZ_MOTION, useValue: make }];
}

