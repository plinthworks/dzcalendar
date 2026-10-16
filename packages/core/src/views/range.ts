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
  if (spec.hiddenDays.length >= 7) throw new RangeError(`${spec.type}: every day of the week is hidden`);

  switch (spec.alignment) {
    case 'month': {
      const first = anchor.with({ day: 1 });
      const activeEnd = first.add({ months: 1 });
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
