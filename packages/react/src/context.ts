import { createContext, createElement, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { CalendarOptions, MotionAdapter } from '@dzcalendar/dom';

/** What an application settles once: the zone, the locale, the words, any other option. A `<DzCalendar>`'s own props still win. */
export type DzCalendarDefaults = Omit<CalendarOptions, 'kernel'>;

interface Settled {
  readonly defaults: DzCalendarDefaults;
  /** Makes each calendar's motion adapter (one per calendar: a drag's state is the adapter's). */
  readonly motion: (() => MotionAdapter) | null;
}

export const DzCalendarContext = createContext<Settled>({ defaults: {}, motion: null });

/**
 * `<DzCalendarProvider defaults={{ timeZone: 'Europe/Paris', locale: 'fr-FR' }} motion={() => createGsapMotion()}>`
 * around the application: every `<DzCalendar>` inside starts from these.
 */
export function DzCalendarProvider(props: { readonly defaults?: DzCalendarDefaults; readonly motion?: () => MotionAdapter; readonly children?: ReactNode }) {
  const parent = useContext(DzCalendarContext);
  // One value while nothing changes: the calendars below are not told of a new one at each render.
  const value = useMemo((): Settled => ({ defaults: { ...parent.defaults, ...props.defaults }, motion: props.motion ?? parent.motion }), [parent, props.defaults, props.motion]);
  return createElement(DzCalendarContext.Provider, { value }, props.children);
}
