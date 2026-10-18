import type { ViewSpec } from './spec.js';

const base = { fixedWeekCount: true, hiddenDays: [], showNonCurrentDates: true } as const;

/** The views every calendar knows. A custom view is a spec added beside these. */
export const BUILTIN_VIEWS: Readonly<Record<string, ViewSpec>> = Object.freeze({
  dayGridMonth: { ...base, type: 'dayGridMonth', family: 'dayGrid', duration: { months: 1 }, alignment: 'month' },
  dayGridWeek: { ...base, type: 'dayGridWeek', family: 'dayGrid', duration: { weeks: 1 }, alignment: 'week' },
  dayGridDay: { ...base, type: 'dayGridDay', family: 'dayGrid', duration: { days: 1 }, alignment: 'day' },
  timeGridWeek: { ...base, type: 'timeGridWeek', family: 'timeGrid', duration: { weeks: 1 }, alignment: 'week' },
  timeGridDay: { ...base, type: 'timeGridDay', family: 'timeGrid', duration: { days: 1 }, alignment: 'day' },
  listDay: { ...base, type: 'listDay', family: 'list', duration: { days: 1 }, alignment: 'day' },
  listWeek: { ...base, type: 'listWeek', family: 'list', duration: { weeks: 1 }, alignment: 'week' },
  listMonth: { ...base, type: 'listMonth', family: 'list', duration: { months: 1 }, alignment: 'month' },
  listYear: { ...base, type: 'listYear', family: 'list', duration: { years: 1 }, alignment: 'year' },
  multiMonthYear: { ...base, type: 'multiMonthYear', family: 'multiMonth', duration: { years: 1 }, alignment: 'year' },
  // One column per resource (and date): the same families, given the calendar's resources.
  resourceTimeGridDay: { ...base, type: 'resourceTimeGridDay', family: 'timeGrid', duration: { days: 1 }, alignment: 'day', resources: true },
  resourceTimeGridWeek: { ...base, type: 'resourceTimeGridWeek', family: 'timeGrid', duration: { weeks: 1 }, alignment: 'week', resources: true },
  resourceDayGridDay: { ...base, type: 'resourceDayGridDay', family: 'dayGrid', duration: { days: 1 }, alignment: 'day', resources: true },
  resourceDayGridWeek: { ...base, type: 'resourceDayGridWeek', family: 'dayGrid', duration: { weeks: 1 }, alignment: 'week', resources: true },
  resourceDayGridMonth: { ...base, type: 'resourceDayGridMonth', family: 'dayGrid', duration: { months: 1 }, alignment: 'month', resources: true },
});
