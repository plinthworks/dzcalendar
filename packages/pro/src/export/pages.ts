import type { CalendarKernel, DayGridModel, Problem, TimeGridModel } from '@dzcalendar/core';
import type { ListModel } from '@dzcalendar/core/views';
import type { TimelineModel } from '../timeline/model.js';
import { Pen } from './paint/ops.js';
import type { Box, PageSlot, PaintContext } from './paint/ops.js';
import { paintTimeGrid } from './paint/timegrid.js';
import { dayGridLanes, paintDayGrid } from './paint/daygrid.js';
import { paintList } from './paint/list.js';
import { paintTimeline } from './paint/timeline.js';
import { orientationOf, periodsProblem as problem } from './periods.js';
import type { PagePeriod } from './periods.js';
import { sheetSize } from './paper.js';
import type { Orientation, Paper } from './paper.js';

export { periodsFor, MAX_PERIODS } from './periods.js';
export type { PageOptions, PagePeriod } from './periods.js';
export { sheetSize, PAPER } from './paper.js';
export type { Paper, Orientation } from './paper.js';

/** At most this many sheets in one file (a long list, a timeline of many resources): past it, a warning. */
export const MAX_SHEETS = 300;

/** The families drawn on paper (a multi-month view is printed as its months). */
const PAINTABLE = new Set(['timeGrid', 'dayGrid', 'list', 'timeline']);

const MARGIN = 36;
const TITLE = 34;
const FOOT = 22;

/** Every sheet of every period, drawn as operations: the period's title on top, "n / of" at the foot. */
export function paintSheets(kernel: CalendarKernel, periods: readonly PagePeriod[], o: { readonly paper: Paper; readonly orientation?: Orientation; readonly ctx: PaintContext; readonly zoneNote?: string }): { pens: Pen[]; width: number; height: number; problems: Problem[] } {
  const problems: Problem[] = [];
  const pens: Pen[] = [];
  const orientation = orientationOf(o.orientation, periods[0]?.family, problems);
  const { width, height } = sheetSize(o.paper, orientation);
  const { ctx } = o;
  const box: Box = { x: MARGIN, y: MARGIN + TITLE, w: width - 2 * MARGIN, h: height - 2 * MARGIN - TITLE - FOOT };
  for (const p of periods) {
    const sheet = (): PageSlot => {
      const pen = new Pen(width, ctx.rtl);
      // Past the cap, drawn on nothing (and said once).
      if (pens.length >= MAX_SHEETS) {
        if (!problems.some((x) => x.detail === `cut:${MAX_SHEETS}`)) problems.push(problem('warning', 'sheets', `cut:${MAX_SHEETS}`));
        return { pen, box };
      }
      pen.rect(0, 0, width, height, { fill: ctx.style.bg });
      pen.text(MARGIN, MARGIN, box.w * 0.7, p.title, { color: ctx.style.fg, size: 16, bold: true });
      if (o.zoneNote) pen.text(MARGIN + box.w * 0.7, MARGIN + 4, box.w * 0.3, o.zoneNote, { color: ctx.style.muted, size: 9, align: 'end' });
      pens.push(pen);
      return { pen, box };
    };
    const st = kernel.stateAt(p.view, p.date)!;
    // The model, with the caps paper lifts; null when the family is not registered (`@dzcalendar/dom/list` not imported).
    const over =
      p.family === 'timeGrid'
        ? { timeGrid: { maxStack: null } }
        : p.family === 'dayGrid'
          ? { dayGrid: { maxLanes: dayGridLanes(box, st.range.weeks.length, Boolean(st.view.resources)) } }
          : p.family === 'timeline'
            ? { timeline: { maxLanes: 8, fillLanes: 30 } }
            : undefined;
    const vm = PAINTABLE.has(p.family) ? kernel.modelAt(p.view, p.date, over) : null;
    if (!vm) {
      problems.push(problem('error', 'view', `${p.view}:${PAINTABLE.has(p.family) ? 'unregistered' : 'unpaintable'}`));
      continue;
    }
    if (p.family === 'timeGrid') paintTimeGrid(vm.model as TimeGridModel, sheet(), ctx);
    else if (p.family === 'dayGrid') paintDayGrid(vm.model as DayGridModel, sheet(), ctx);
    else if (p.family === 'list') paintList(vm.model as ListModel, sheet(), sheet, ctx);
    else paintTimeline(vm.model as TimelineModel, sheet(), sheet, ctx);
  }
  pens.forEach((pen, i) => pen.text(MARGIN, height - MARGIN - FOOT + 8, box.w, ctx.words.page({ n: i + 1, of: pens.length }), { color: ctx.style.muted, size: 9, align: 'end' }));
  return { pens, width, height, problems };
}

