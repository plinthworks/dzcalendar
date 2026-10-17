import { getMonthGrid } from '@tzslot/core';
import { Temporal } from '../temporal.js';
import type { PlainDate } from '../temporal.js';
import type { NavContext, ViewRange, ViewSpec } from './spec.js';

const startOfWeek = (d: PlainDate, firstDay: number) => d.subtract({ days: (d.dayOfWeek - firstDay + 7) % 7 });

function shown(spec: ViewSpec, d: PlainDate): boolean {
  return !spec.hiddenDays.includes(d.dayOfWeek as never);
}

function datesBetween(start: PlainDate, end: PlainDate, spec: ViewSpec): PlainDate[] {
  const out: PlainDate[] = [];
  for (let d = start; Temporal.PlainDate.compare(d, end) < 0; d = d.add({ days: 1 })) if (shown(spec, d)) out.push(d);
  return out;
}

/**
 * The dates a view covers around `anchor`. A month grid starts on the
 * locale's first weekday before the 1st and runs six weeks (or only the
 * weeks the month touches); a week starts on the first weekday; a day view
 * with `dayCount` counts shown days, stepping over hidden ones.
 */
export function computeViewRange(anchor: PlainDate, spec: ViewSpec, ctx: NavContext): ViewRange {
  if (spec.hiddenDays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw new RangeError(`${spec.type}: hiddenDays are ISO weekdays, 1 to 7`);
  if (new Set(spec.hiddenDays).size >= 7) throw new RangeError(`${spec.type}: every day of the week is hidden`);
  if (spec.family === 'multiMonth') return multiMonthRange(anchor, spec, ctx);

  switch (spec.alignment) {
    case 'month': {
      const first = anchor.with({ day: 1 });
      // A month grid is one month; a list or several months run for the duration.
      const activeEnd = spec.family === 'dayGrid' ? first.add({ months: 1 }) : first.add(spec.duration);
      if (spec.family === 'dayGrid') {
        let grid = getMonthGrid(first.year, first.month, ctx.firstDay);
        if (!spec.fixedWeekCount) grid = grid.filter((week) => week.some((d) => d.month === first.month && d.year === first.year));
        const start = grid[0]![0]!;
        const end = grid[grid.length - 1]![6]!.add({ days: 1 });
        const weeks = grid.map((week) => week.filter((d) => shown(spec, d)));
        return { start, end, activeStart: first, activeEnd, dates: weeks.flat(), weeks };
      }
      const dates = datesBetween(first, activeEnd, spec);
      return { start: first, end: activeEnd, activeStart: first, activeEnd, dates, weeks: [dates] };
    }
    case 'week': {
      const start = startOfWeek(anchor, ctx.firstDay);
      const end = start.add(spec.duration);
      const dates = datesBetween(start, end, spec);
      return { start, end, activeStart: start, activeEnd: end, dates, weeks: chunkWeeks(dates, ctx.firstDay) };
    }
    case 'year': {
      const start = anchor.with({ month: 1, day: 1 });
      const end = start.add({ years: 1 });
      const dates = datesBetween(start, end, spec);
      return { start, end, activeStart: start, activeEnd: end, dates, weeks: [dates] };
    }
    case 'day':
    case 'none': {
      if (spec.dayCount !== undefined) {
        const dates: PlainDate[] = [];
        let d = anchor;
        while (dates.length < spec.dayCount) {
          if (shown(spec, d)) dates.push(d);
          d = d.add({ days: 1 });
        }
        const start = dates[0]!;
        const end = dates[dates.length - 1]!.add({ days: 1 });
        return { start, end, activeStart: start, activeEnd: end, dates, weeks: [dates] };
      }
      // A one-day view anchored on a hidden day shows the next shown day.
      let start = anchor;
      while (!shown(spec, start)) start = start.add({ days: 1 });
      const end = start.add(spec.duration);
      const dates = datesBetween(start, end, spec);
      return { start, end, activeStart: start, activeEnd: end, dates, weeks: [dates] };
    }
  }
}

/** Rows that each run from the first weekday. */
function chunkWeeks(dates: readonly PlainDate[], firstDay: number): PlainDate[][] {
  const rows: PlainDate[][] = [];
  let key = '';
  for (const d of dates) {
    const k = startOfWeek(d, firstDay).toString();
    if (k !== key) {
      rows.push([]);
      key = k;
    }
    rows[rows.length - 1]!.push(d);
  }
  return rows;
}

/**
 * Several month grids, one per month of the period (a year from January, or
 * `duration` months from the anchor's month). The range runs from the first
 * grid's first day to the last grid's last, so sources fetch what is drawn.
 */
function multiMonthRange(anchor: PlainDate, spec: ViewSpec, ctx: NavContext): ViewRange {
  const first = spec.alignment === 'year' ? anchor.with({ month: 1, day: 1 }) : anchor.with({ day: 1 });
  const activeEnd = first.add(spec.duration);
  const monthSpec: ViewSpec = { ...spec, family: 'dayGrid', alignment: 'month', duration: { months: 1 } };
  const months: ViewRange[] = [];
  for (let m = first; Temporal.PlainDate.compare(m, activeEnd) < 0; m = m.add({ months: 1 })) months.push(computeViewRange(m, monthSpec, ctx));
  const dates = datesBetween(first, activeEnd, spec);
  return { start: months[0]!.start, end: months[months.length - 1]!.end, activeStart: first, activeEnd, dates, weeks: [dates], months };
}
