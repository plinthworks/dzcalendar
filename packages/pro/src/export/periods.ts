import { Temporal } from '@dzcalendar/core';
import type { CalendarKernel, PlainDate, Problem } from '@dzcalendar/core';
import type { Orientation, Paper } from './paper.js';

/** Short machine details (the words are the application's): what failed, where. */
export const periodsProblem = (severity: Problem['severity'], path: string, detail: string): Problem => ({ code: 'invalid-export', severity, path, detail });
const problem = periodsProblem;

/** What to put on paper: a view over dates, on a paper size. */
export interface PageOptions {
  /** A view type; default the one shown. A multi-month view is put on paper a month a sheet. */
  readonly view?: string;
  /** The first date to cover; default the asked view's period around the date shown. */
  readonly from?: PlainDate;
  /** Exclusive; default: one period of the view from `from`. */
  readonly to?: PlainDate;
  readonly paper?: Paper;
  /** Default: landscape, portrait for a list. */
  readonly orientation?: Orientation;
}

/** One period of a view: what one sheet (or, for a list or a timeline, a run of sheets) shows. */
export interface PagePeriod {
  readonly view: string;
  readonly date: PlainDate;
  readonly title: string;
  readonly family: string;
}

/** At most this many periods (a year of weeks, and some). */
export const MAX_PERIODS = 60;

export const isPlainDate = (x: unknown): x is PlainDate => x instanceof Temporal.PlainDate;

/** The periods covering `[from, to)`, in the view's own steps; bad input is a problem, never a throw. */
export function periodsFor(kernel: CalendarKernel, o: PageOptions = {}): { periods: PagePeriod[]; problems: Problem[] } {
  const none = (p: Problem) => ({ periods: [], problems: [p] });
  if (o === null || typeof o !== 'object') return none(problem('error', 'options', typeof o));
  const shown = kernel.getState();
  const asked = o.view ?? shown.view.type;
  const spec = typeof asked === 'string' ? kernel.getViewSpec(asked) : undefined;
  if (!spec) return none(problem('error', 'view', String(asked)));
  if (o.from !== undefined && !isPlainDate(o.from)) return none(problem('error', 'from', 'not-plain-date'));
  if (o.to !== undefined && !isPlainDate(o.to)) return none(problem('error', 'to', 'not-plain-date'));
  // A multi-month view: a month a sheet, over the months it shows.
  const multi = spec.family === 'multiMonth';
  const view = multi ? 'dayGridMonth' : asked;
  const around = kernel.stateAt(asked, o.from ?? shown.date)!;
  const from = o.from ?? (multi ? around.range.activeStart : kernel.stateAt(view, shown.date)!.range.activeStart);
  const to = o.to ?? (multi ? around.range.activeEnd : kernel.stateAt(view, from)!.range.activeEnd);
  if (Temporal.PlainDate.compare(to, from) <= 0) return none(problem('error', 'to', 'not-after-from'));
  const problems: Problem[] = [];
  const periods: PagePeriod[] = [];
  let at = from;
  while (periods.length < MAX_PERIODS) {
    const st = kernel.stateAt(view, at)!;
    periods.push({ view, date: at, title: st.title, family: st.view.family });
    const next = st.range.activeEnd;
    if (Temporal.PlainDate.compare(next, to) >= 0 || Temporal.PlainDate.compare(next, at) <= 0) break;
    at = next;
  }
  // Cut only if a period was left out.
  const after = periods.length === MAX_PERIODS ? kernel.stateAt(view, periods[MAX_PERIODS - 1]!.date)!.range.activeEnd : null;
  if (after && Temporal.PlainDate.compare(after, to) < 0) problems.push(problem('warning', 'to', `cut:${MAX_PERIODS}`));
  return { periods, problems };
}

/** The sheet's orientation: given, or landscape (portrait for a list); anything else is a guess, said. */
export function orientationOf(given: unknown, family: string | undefined, problems: Problem[]): Orientation {
  if (given === 'portrait' || given === 'landscape') return given;
  if (given !== undefined) problems.push(problem('warning', 'orientation', String(given)));
  return family === 'list' ? 'portrait' : 'landscape';
}
