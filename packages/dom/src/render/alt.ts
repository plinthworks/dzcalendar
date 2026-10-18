import { formatTemporal, formatToPartsTemporal } from '@dzcalendar/core';
import type { PlainDate } from '@dzcalendar/core';

/**
 * A date in a second calendar (`altLocale` carries it, `-u-ca-…`): the day
 * alone, or with its month on the first day of that calendar's month — what
 * a cell shows beside its own number — and the date in full, for headings and
 * what a screen reader says.
 */
export function altDate(date: PlainDate, altLocale: string, withMonth = false): { short: string; long: string } {
  // The day as a number, in Latin digits whatever the locale writes: to tell the 1st.
  let first = withMonth;
  try {
    const latn = new Intl.Locale(altLocale, { numberingSystem: 'latn' }).toString();
    // The day part alone: some locales write it with a suffix (ja '1日').
    first ||= formatToPartsTemporal(date, { day: 'numeric' }, latn).find((x) => x.type === 'day')?.value === '1';
  } catch {
    /* an odd locale: no month on the 1st */
  }
  return {
    short: formatTemporal(date, first ? { day: 'numeric', month: 'short' } : { day: 'numeric' }, altLocale),
    long: formatTemporal(date, { day: 'numeric', month: 'long', year: 'numeric' }, altLocale),
  };
}
