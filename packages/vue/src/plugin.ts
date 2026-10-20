import { inject, provide } from 'vue';
import type { App, InjectionKey } from 'vue';
import type { CalendarOptions, MotionAdapter } from '@dzcalendar/dom';

/** What an application settles once: the zone, the locale, the words, any other option. A `<DzCalendar>`'s own props still win. */
export type DzCalendarDefaults = Omit<CalendarOptions, 'kernel'>;

export interface DzCalendarSettled {
  readonly defaults?: DzCalendarDefaults;
  /** Makes each calendar's motion adapter (one per calendar: a drag's state is the adapter's). */
  readonly motion?: () => MotionAdapter;
}

export const DZ_CALENDAR_SETTLED: InjectionKey<DzCalendarSettled> = Symbol('dzcalendar.settled');

/** `app.use(DzCalendarPlugin, { defaults: { timeZone: 'Europe/Paris', locale: 'fr-FR' }, motion: () => createGsapMotion() })` */
export const DzCalendarPlugin = {
  install(app: App, settled: DzCalendarSettled = {}): void {
    app.provide(DZ_CALENDAR_SETTLED, settled);
  },
};

/** The same for one part of the application (inside a component's `setup`): laid over what is settled above. */
export function provideDzCalendar(settled: DzCalendarSettled): void {
  const above = inject(DZ_CALENDAR_SETTLED, {});
  provide(DZ_CALENDAR_SETTLED, { defaults: { ...above.defaults, ...settled.defaults }, ...((settled.motion ?? above.motion) && { motion: (settled.motion ?? above.motion)! }) });
}
