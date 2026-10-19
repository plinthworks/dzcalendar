import type { Problem, ResourceInput, ResourceNode, TimeGridModel } from '@dzcalendar/core';
import { createCalendar, NO_MOTION } from '@dzcalendar/dom';
import type { CalendarInstance, CalendarOptions } from '@dzcalendar/dom';
import { orientationOf, periodsFor } from '../export/periods.js';
import type { PageOptions, PagePeriod } from '../export/periods.js';
import { PAPER, sheetSize } from '../export/paper.js';
import { exportMessagesFor } from '../export/messages.js';
import type { ExportMessages } from '../export/messages.js';

export interface PrintOptions extends PageOptions {
  /** A resource timeline: rows (resources, children included) per sheet. Default: what the sheet's height holds. */
  readonly rowsPerPage?: number;
  /** False: the sheets are built and left for the caller (`close()` takes them away); no `window.print()`. */
  readonly print?: boolean;
  readonly messages?: Partial<ExportMessages>;
}

export interface PrintJob {
  /** The sheets, in order (each a `.dz-print__page`). */
  readonly pages: readonly HTMLElement[];
  readonly problems: readonly Problem[];
  /** Destroys the copies and their sheets, lets the held dates go. Called after printing by itself. */
  close(): void;
}

const MARGIN = 36;
const TITLE = 34;
const FOOT = 22;

/**
 * Whose resources go on which sheet of a resource timeline: whole top-level
 * resources (a parent with its children), in order, up to `per` rows a
 * sheet; one larger than a sheet has a sheet of its own.
 */
function resourceChunks(roots: readonly ResourceNode[], per: number, groupOf: (n: ResourceNode) => unknown): ResourceInput[][] {
  const inputs = (n: ResourceNode): ResourceInput[] => [n.resource.input, ...n.children.flatMap(inputs)];
  const out: ResourceInput[][] = [];
  let chunk: ResourceInput[] = [];
  let used = 0;
  let group: unknown = Symbol();
  for (const r of roots) {
    const rows = inputs(r);
    // A group's head (resourceGroupField) is a shorter row: 34 of 86 px.
    const head = groupOf(r) !== group ? 0.4 : 0;
    if (chunk.length > 0 && used + head + rows.length > per) {
      out.push(chunk);
      chunk = [];
      used = 0;
      group = Symbol();
    }
    used += (groupOf(r) !== group ? 0.4 : 0) + rows.length;
    group = groupOf(r);
    chunk.push(...rows);
  }
  if (chunk.length > 0 || out.length === 0) out.push(chunk);
  return out;
}

/** A timeline row on paper (three lanes of 1.625rem and its padding) and the heads: what sets the rows a sheet holds. */
const ROW = 86;
const TIMELINE_HEADS = 60;

/** The slot that leaves 32 px a label ("00:00" at 8 px) across the sheet (paper is narrower than a screen that scrolls). */
function paperSlot(minutes: number, width: number): number {
  for (const slot of [15, 30, 60, 120, 180, 240, 360, 720]) if (width / (minutes / slot) >= 32) return slot;
  return 1440;
}

/** What a copy must not take from the calendar: its data paths, its motion, every handler (a print of 20 sheets would call them 20 times). */
const NOT_COPIED = new Set(['kernel', 'sources', 'events', 'autoPrint', 'motion', 'contextMenu', 'chooseScope']);

/** One print job per document: a second call closes the first. */
const JOBS = new WeakMap<Document, PrintJob>();

const problem = (severity: Problem['severity'], path: string, detail: string): Problem => ({ code: 'invalid-export', severity, path, detail });

/**
 * Paged printing by the browser (owner's decision): real sheets in the DOM —
 * a copy of the calendar per period (a week, a day, a month; N resources of a
 * timeline), sharing its store (nothing fetched again), sized to the sheet,
 * with the period's title and "n / of" — then `window.print()`. The text is
 * the browser's: any script, selectable in "Save as PDF". Never throws: what
 * fails is a problem, and nothing is left behind.
 */
export async function printPages(cal: CalendarInstance, o: PrintOptions = {}): Promise<PrintJob> {
  const doc = cal.element.ownerDocument;
  const win = doc.defaultView!;
  const { periods, problems } = periodsFor(cal.kernel, o);
  const none = (more: Problem[] = []): PrintJob => ({ pages: [], problems: [...problems, ...more], close: () => {} });
  if (periods.length === 0) return none();
  const paper = o.paper ?? 'a4';
  if (typeof paper !== 'string' || !(paper in PAPER)) return none([problem('error', 'paper', String(paper))]);
  JOBS.get(doc)?.close();
  const family = periods[0]!.family;
  const orientation = orientationOf(o.orientation, family, problems);
  const { width, height } = sheetSize(paper, orientation);
  const fits = Math.max(1, Math.floor((height - 2 * MARGIN - TITLE - FOOT - TIMELINE_HEADS) / ROW));
  let per = fits;
  if (o.rowsPerPage !== undefined) {
    if (Number.isInteger(o.rowsPerPage) && o.rowsPerPage >= 1) per = o.rowsPerPage;
    else problems.push(problem('warning', 'rowsPerPage', String(o.rowsPerPage)));
  }
  const first = cal.kernel.stateAt(periods[0]!.view, periods[0]!.date)!;
  const last = cal.kernel.stateAt(periods[periods.length - 1]!.view, periods[periods.length - 1]!.date)!;

  const copies: CalendarInstance[] = [];
  const pages: HTMLElement[] = [];
  const style = doc.createElement('style');
  const box = doc.createElement('div');
  const hold = cal.kernel.sources.hold(first.range.start, last.range.end);
  let closed = false;
  let untrack = () => {};
  const onAfter = () => job.close();
  const job: PrintJob = {
    pages,
    problems,
    close() {
      if (closed) return;
      closed = true;
      win.removeEventListener('afterprint', onAfter);
      untrack();
      for (const c of copies) c.destroy();
      box.remove();
      style.remove();
      hold.release();
      if (JOBS.get(doc) === job) JOBS.delete(doc);
    },
  };
  JOBS.set(doc, job);
  // The calendar destroyed meanwhile: its sheets go with it.
  untrack = cal.onDestroy(() => job.close());
  try {
    const { failed } = await hold.ready;
    for (const f of failed) problems.push(problem('warning', 'sources', f));
    if (closed) return none();
    const pt = PAPER[paper];
    const [pw, ph] = orientation === 'portrait' ? [pt.width, pt.height] : [pt.height, pt.width];
    // Lengths alone: CSS takes `size: <length>{2}` or a keyword with an orientation, not both.
    style.textContent = `
@page { size: ${pw}pt ${ph}pt; margin: 0; }
@media screen { .dz-print { position: fixed; inset-inline-start: -200000px; top: 0; } }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: none !important; }
  body > *:not(.dz-print) { display: none !important; }
  .dz-print { position: static; }
}
.dz-print { color-scheme: light; }
.dz-print__page { background: Canvas; color: CanvasText; box-sizing: border-box; width: ${width}px; height: ${height}px; padding: ${MARGIN}px; display: flex; flex-direction: column; overflow: hidden; break-after: page; }
.dz-print__page--flow { height: auto; overflow: visible; }
.dz-print__page:last-child { break-after: auto; }
.dz-print__title { margin: 0; height: ${TITLE}px; font-size: 16px; font-weight: 600; }
.dz-print__body { flex: 1 1 auto; min-height: 0; }
.dz-print__foot { height: ${FOOT}px; padding-top: 6px; font-size: 9px; text-align: end; opacity: 0.7; }
.dz-print .dz-toolbar { display: none; }
.dz-print .dz-tl__slot { font-size: 8px; padding-inline: 2px; }`;
    box.className = 'dz-print';
    box.dir = win.getComputedStyle(cal.element).direction;
    doc.head.append(style);
    doc.body.append(box);

    const base = cal.getOptions();
    const rest = Object.fromEntries(Object.entries(base).filter(([k, v]) => !NOT_COPIED.has(k) && !(k.startsWith('on') && typeof v === 'function'))) as CalendarOptions;
    const bodyH = height - 2 * MARGIN - TITLE - FOOT;
    const roots = cal.kernel.getResources().roots;
    const field = base.resourceGroupField;
    const groupOf = (n: ResourceNode) => (field ? (n.resource.input as Record<string, unknown>)[field] : null);
    const sheetsOf = (p: PagePeriod): (ResourceInput[] | null)[] => (p.family === 'timeline' && cal.kernel.getViewSpec(p.view)?.resources ? resourceChunks(roots, per, groupOf) : [null]);
    for (const p of periods) {
      for (const resources of sheetsOf(p)) {
        const page = doc.createElement('section');
        page.className = `dz-print__page${p.family === 'list' ? ' dz-print__page--flow' : ''}`;
        const title = doc.createElement('h2');
        title.className = 'dz-print__title';
        title.textContent = p.title;
        const body = doc.createElement('div');
        body.className = 'dz-print__body';
        body.style.setProperty('--dz-height', p.family === 'list' ? 'auto' : `${bodyH}px`);
        const foot = doc.createElement('div');
        foot.className = 'dz-print__foot';
        page.append(title, body, foot);
        box.append(page);
        pages.push(page);
        // A timeline in hours: a slot the sheet's width can label (a day scale kept as it is).
        const st = cal.kernel.stateAt(p.view, p.date)!;
        const days = st.range.start.until(st.range.end, { largestUnit: 'days' }).days;
        const shown = (base.timeline?.slot ?? (days <= 1 ? 30 : days <= 7 ? 60 : 'day')) as number | 'day';
        const timeline = p.family === 'timeline' && shown !== 'day' ? { timeline: { ...base.timeline, slot: Math.max(shown, paperSlot(days * 1440, width - 2 * MARGIN - 240)) } } : {};
        // A copy: the same look and store, this period, nothing fetched, nothing to edit, everything drawn
        // (no windowing; a crowded week whole; a month's days to what its weeks hold, then "+N").
        copies.push(
          createCalendar(body, {
            ...rest,
            store: cal.kernel.store,
            initialView: p.view,
            initialDate: p.date,
            editable: false,
            selectable: false,
            nowIndicator: false,
            // Nothing moves on paper (not even the default fade).
            motion: NO_MOTION,
            // Paper is light.
            scheme: 'light',
            virtualizeAbove: Number.MAX_SAFE_INTEGER,
            eventMaxStack: null,
            ...(p.family === 'dayGrid' && { dayMaxLanes: 'auto' as const }),
            ...timeline,
            ...(resources && { resources }),
          }),
        );
      }
    }
    pages.forEach((page, i) => (page.querySelector('.dz-print__foot')!.textContent = words(cal, o.messages).page({ n: i + 1, of: pages.length })));
    await frame(win);
    // Sized to the sheet: the hours of a time grid fill its height, a month's weeks too, a timeline's slots its width.
    copies.forEach((copy) => fitToSheet(copy, bodyH));
    await frame(win);
    await frame(win);
    // What a sheet could not hold is cut on paper: said.
    pages.forEach((page, i) => {
      const scrollers = [copies[i]!.element, ...page.querySelectorAll<HTMLElement>('.dz-tg__body, .dz-dg, .dz-dg__body, .dz-tl__scroll, .dz-tl__body')];
      if (!page.classList.contains('dz-print__page--flow') && scrollers.some((x) => x.scrollHeight > x.clientHeight + 1)) problems.push(problem('warning', 'sheets', `clipped:${i + 1}`));
    });
    if (o.print !== false && !closed) {
      win.addEventListener('afterprint', onAfter, { once: true });
      win.print();
    }
    return job;
  } catch (err) {
    job.close();
    return none([problem('error', 'print', err instanceof Error ? err.name : 'failed')]);
  }
}

const words = (cal: CalendarInstance, over?: Partial<ExportMessages>): ExportMessages => ({ ...exportMessagesFor(cal.kernel.getState().locale), ...over });

const frame = (win: Window) => new Promise<void>((r) => win.requestAnimationFrame(() => r()));

/** One copy's scale set to its sheet (measured: what its heads take is the copy's own). */
function fitToSheet(copy: CalendarInstance, bodyH: number): void {
  const el = copy.element;
  const vm = copy.kernel.viewModel();
  const top = el.getBoundingClientRect().top;
  if (vm.family === 'timeGrid') {
    const m = vm.model as TimeGridModel;
    const minutes = Math.max(1, ...m.columns.map((c) => c.axis.length));
    const scroller = el.querySelector<HTMLElement>('.dz-tg__body');
    const heads = scroller ? scroller.getBoundingClientRect().top - top : 90;
    const minute = Math.max(0.2, (bodyH - heads - 2) / minutes);
    el.style.setProperty('--dz-minute', `${minute}px`);
    // Measured again: borders and rounding the first guess did not see.
    if (scroller && scroller.scrollHeight > scroller.clientHeight) el.style.setProperty('--dz-minute', `${(minute * scroller.clientHeight) / scroller.scrollHeight}px`);
  } else if (vm.family === 'dayGrid') {
    const weeks = el.querySelectorAll('.dz-dg__week').length || 1;
    const first = el.querySelector<HTMLElement>('.dz-dg__week');
    const heads = first ? first.getBoundingClientRect().top - top : 40;
    el.style.setProperty('--dz-week-min', `${Math.floor((bodyH - heads - 2) / weeks)}px`);
  } else if (vm.family === 'timeline') {
    // On the timeline itself: its own rule sets the slot's width there.
    const tl = el.querySelector<HTMLElement>('.dz-tl');
    if (!tl) return;
    const len = (vm.model as { axis: { length: number } }).axis.length;
    const area = parseFloat(el.ownerDocument.defaultView!.getComputedStyle(tl).getPropertyValue('--dz-tl-area')) || 150;
    tl.style.setProperty('--dz-tl-slot', `${Math.max(2, (tl.clientWidth - area - 2) / Math.max(1, len))}px`);
  }
}

