/**
 * @dzcalendar/pro/export — exports without dependencies (owner's decisions):
 * PDF (pages drawn on a canvas, the browser shaping every script, put in a
 * PDF we write), PNG, XLSX and CSV (a row per occurrence, both zones, the
 * real duration), ICS (`@dzcalendar/ical`). Loaded on demand.
 */
import { Temporal, exportInputs, viewWindow } from '@dzcalendar/core';
import type { CalEvent, PlainDate, Problem, Series } from '@dzcalendar/core';
import type { CalendarInstance } from '@dzcalendar/dom';
import { serializeICal } from '@dzcalendar/ical';
import { canvasBlob, drawSheet, isRtl, paintContext } from './export/browser.js';
import { isPlainDate } from './export/periods.js';
import { toCSV } from './export/csv.js';
import { exportMessagesFor } from './export/messages.js';
import type { ExportMessages } from './export/messages.js';
import { paintSheets, periodsFor } from './export/pages.js';
import type { PageOptions } from './export/pages.js';
import { pdfFromJpegs } from './export/pdf.js';
import { PAPER } from './export/paper.js';
import type { PdfPage } from './export/pdf.js';
import { occurrenceRows } from './export/rows.js';
import { toXLSX } from './export/xlsx.js';
import { zip } from './export/zip.js';

export { occurrenceRows, excelSerial } from './export/rows.js';
export type { OccurrenceRow, RowsOptions } from './export/rows.js';
export { toCSV, rowsTable } from './export/csv.js';
export { toXLSX } from './export/xlsx.js';
export { zip, crc32 } from './export/zip.js';
export { pdfFromJpegs } from './export/pdf.js';
export type { PdfPage } from './export/pdf.js';
export { PAPER } from './export/paper.js';
export type { Paper, Orientation } from './export/paper.js';
export { periodsFor, paintSheets, sheetSize, MAX_PERIODS, MAX_SHEETS } from './export/pages.js';
export type { PageOptions, PagePeriod } from './export/pages.js';
export { Pen } from './export/paint/ops.js';
export type { Op, Box, PaintStyle, PaintFormat, PaintContext, PageSlot } from './export/paint/ops.js';
export { paintTimeGrid } from './export/paint/timegrid.js';
export { paintDayGrid, dayGridLanes } from './export/paint/daygrid.js';
export { paintList } from './export/paint/list.js';
export { paintTimeline } from './export/paint/timeline.js';
export { drawSheet, paintContext, readStyle, readFormat } from './export/browser.js';
export { EXPORT_EN, EXPORT_FR, EXPORT_AR, EXPORT_ES, EXPORT_DE, exportMessagesFor, defineExportLocale } from './export/messages.js';
export type { ExportMessages } from './export/messages.js';

/** A file, or nothing and why (bad input never throws). */
export interface ExportResult {
  readonly blob: Blob | null;
  readonly problems: readonly Problem[];
}

export interface RangeOptions {
  /** `[from, to)`, dates in the calendar's zone; default what is shown. */
  readonly from?: PlainDate;
  readonly to?: PlainDate;
  /** Words over the locale's. */
  readonly messages?: Partial<ExportMessages>;
}

export interface ImageOptions extends PageOptions {
  /** Device pixels per CSS pixel: 2 (192 dpi) by default. */
  readonly scale?: number;
  readonly messages?: Partial<ExportMessages>;
}

const bad = (path: string, detail: string, severity: Problem['severity'] = 'error'): Problem => ({ code: 'invalid-export', severity, path, detail });

/** Bad input never throws: whatever fails inside (a destroyed calendar, a canvas refused) is a problem and no file. */
async function safe<T>(fn: () => Promise<T>, none: (p: Problem) => T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return none(bad('export', err instanceof Error ? err.name : 'failed'));
  }
}
const noFile = (p: Problem): ExportResult => ({ blob: null, problems: [p] });

/** Fetches `[from, to)` beside what is shown, runs `fn`, lets it go; what could not be loaded is a warning (the file lacks it). */
async function holding<T extends { problems: readonly Problem[] }>(cal: CalendarInstance, from: PlainDate, to: PlainDate, fn: () => T | Promise<T>): Promise<T> {
  const h = cal.kernel.sources.hold(from, to);
  try {
    const { failed } = await h.ready;
    const out = await fn();
    return failed.length === 0 ? out : { ...out, problems: [...out.problems, ...failed.map((f) => bad('sources', f, 'warning'))] };
  } finally {
    h.release();
  }
}

function rangeOf(cal: CalendarInstance, o: RangeOptions): { from: PlainDate; to: PlainDate } | Problem {
  if (o === null || typeof o !== 'object') return bad('options', typeof o);
  const r = cal.kernel.getState().range;
  if (o.from !== undefined && !isPlainDate(o.from)) return bad('from', 'not-plain-date');
  if (o.to !== undefined && !isPlainDate(o.to)) return bad('to', 'not-plain-date');
  const from = o.from ?? r.activeStart;
  const to = o.to ?? r.activeEnd;
  if (Temporal.PlainDate.compare(to, from) <= 0) return bad('to', 'not-after-from');
  return { from, to };
}

/** The locale's words, the application's `messages` over them; "all day" and "no events" as the calendar says them. */
function words(cal: CalendarInstance, over?: Partial<ExportMessages>): ExportMessages {
  const given = cal.getOptions().messages;
  return { ...exportMessagesFor(cal.kernel.getState().locale), ...(given?.allDay && { allDay: given.allDay }), ...(given?.noEvents && { empty: given.noEvents }), ...over };
}

const rowsOf = (cal: CalendarInstance, r: { from: PlainDate; to: PlainDate }) => occurrenceRows(cal.kernel.store.snapshot, { start: r.from, end: r.to, displayZone: cal.kernel.getState().timeZone, resources: cal.kernel.getResources() });

/** A sheet: a row per occurrence over the range (both zones, the real duration), real Excel dates; right to left in Arabic or Hebrew. */
export function exportXLSX(cal: CalendarInstance, o: RangeOptions = {}): Promise<ExportResult> {
  return safe(async () => {
    const r = rangeOf(cal, o);
    if ('code' in r) return noFile(r);
    return holding(cal, r.from, r.to, () => {
      const bytes = toXLSX(rowsOf(cal, r), words(cal, o.messages), { rtl: isRtl(cal) });
      return { blob: new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), problems: [] };
    });
  }, noFile);
}

/** The same rows as CSV (UTF-8 with a BOM, CRLF); `separator` `;` for a French Excel. */
export function exportCSV(cal: CalendarInstance, o: RangeOptions & { readonly separator?: ',' | ';' | '\t' } = {}): Promise<ExportResult> {
  return safe(async () => {
    const r = rangeOf(cal, o);
    if ('code' in r) return noFile(r);
    const sep = o.separator ?? ',';
    if (![',', ';', '\t'].includes(sep)) return noFile(bad('separator', String(sep)));
    return holding(cal, r.from, r.to, () => ({ blob: new Blob([toCSV(rowsOf(cal, r), words(cal, o.messages), sep)], { type: 'text/csv;charset=utf-8' }), problems: [] }));
  }, noFile);
}

/**
 * An iCalendar file of what the range shows: an event as it is, a series
 * whole (its rule, its moved occurrences), each in its own zone with its
 * VTIMEZONE. `all: true` writes everything the calendar holds.
 */
export function exportICS(cal: CalendarInstance, o: RangeOptions & { readonly all?: boolean; readonly name?: string } = {}): Promise<ExportResult> {
  return safe(async () => {
    const r = rangeOf(cal, o);
    if ('code' in r) return noFile(r);
    return holding(cal, r.from, r.to, () => {
      const snap = cal.kernel.store.snapshot;
      let keep: (x: CalEvent | Series) => boolean = () => true;
      if (!o.all) {
        // What the range shows: its events, and the series (whole: rule, moved occurrences) one of whose occurrences it shows.
        const ids = new Set<string>();
        for (const i of snap.queryInstances(viewWindow(r.from, r.to, cal.kernel.getState().timeZone), { includeBackground: true })) ids.add(i.event.ref?.seriesId ?? i.event.id);
        keep = (x) => ids.has(x.id) || ('ref' in x && x.ref !== undefined && ids.has(x.ref.seriesId));
      }
      const ics = serializeICal(exportInputs(snap, keep), typeof o.name === 'string' ? { name: o.name } : {});
      return { blob: new Blob([ics], { type: 'text/calendar;charset=utf-8' }), problems: [] };
    });
  }, noFile);
}

/**
 * The sheets of a view over dates, each drawn on one reused canvas and
 * encoded before the next (one sheet in memory, not all of them).
 */
async function sheets<T>(cal: CalendarInstance, o: ImageOptions, encode: (c: HTMLCanvasElement) => Promise<T>): Promise<{ out: T[]; width: number; height: number; problems: Problem[] }> {
  const empty = (problems: Problem[]) => ({ out: [], width: 0, height: 0, problems });
  const { periods, problems } = periodsFor(cal.kernel, o);
  if (periods.length === 0) return empty(problems);
  const paper = o.paper ?? 'a4';
  if (typeof paper !== 'string' || !(paper in PAPER)) return empty([bad('paper', String(paper))]);
  let scale = 2;
  if (o.scale !== undefined) {
    if (typeof o.scale === 'number' && o.scale > 0 && o.scale <= 4) scale = o.scale;
    else problems.push(bad('scale', String(o.scale), 'warning'));
  }
  const first = cal.kernel.stateAt(periods[0]!.view, periods[0]!.date)!;
  const last = cal.kernel.stateAt(periods[periods.length - 1]!.view, periods[periods.length - 1]!.date)!;
  return holding(cal, first.range.start, last.range.end, async () => {
    const ctx = paintContext(cal, words(cal, o.messages));
    const drawn = paintSheets(cal.kernel, periods, { paper, ...(o.orientation !== undefined && { orientation: o.orientation }), ctx, zoneNote: cal.kernel.getState().timeZone });
    const canvas = cal.element.ownerDocument.createElement('canvas');
    const out: T[] = [];
    try {
      for (const pen of drawn.pens) {
        drawSheet(canvas, pen.ops, { width: drawn.width, height: drawn.height, scale, font: ctx.font, rtl: ctx.rtl });
        out.push(await encode(canvas));
      }
    } finally {
      // Its pixels let go now, not when the page is.
      canvas.width = 0;
      canvas.height = 0;
    }
    return { out, width: drawn.width, height: drawn.height, problems: [...problems, ...drawn.problems] };
  });
}

/** A PDF of the view over the dates asked: a sheet per page, A4 (or Letter, A3), landscape (portrait for a list). */
export function exportPDF(cal: CalendarInstance, o: ImageOptions & { readonly title?: string } = {}): Promise<ExportResult> {
  return safe(async () => {
    const s = await sheets(cal, o, async (c) => ({ jpeg: new Uint8Array(await (await canvasBlob(c, 'image/jpeg', 0.9)).arrayBuffer()), width: c.width, height: c.height }));
    if (s.out.length === 0) return { blob: null, problems: s.problems };
    const pages: PdfPage[] = s.out.map((x) => ({ ...x, pageWidth: (s.width / 96) * 72, pageHeight: (s.height / 96) * 72 }));
    // The periods exported, not the one shown: "19–25 oct. – 2–8 nov. 2026".
    const { periods } = periodsFor(cal.kernel, o);
    const named = periods.length === 0 ? '' : periods.length === 1 ? periods[0]!.title : `${periods[0]!.title} – ${periods[periods.length - 1]!.title}`;
    const title = typeof o.title === 'string' ? o.title : named;
    return { blob: new Blob([pdfFromJpegs(pages, { title }) as BlobPart], { type: 'application/pdf' }), problems: s.problems };
  }, noFile);
}

/** The same sheets as PNG images, one per sheet. */
export function exportPNG(cal: CalendarInstance, o: ImageOptions = {}): Promise<{ readonly blobs: readonly Blob[]; readonly problems: readonly Problem[] }> {
  return safe(
    async () => {
      const s = await sheets(cal, o, (c) => canvasBlob(c, 'image/png'));
      return { blobs: s.out, problems: s.problems };
    },
    (p) => ({ blobs: [], problems: [p] }),
  );
}

/** Saves a file through the browser (an `<a download>` clicked, its URL let go after). */
export function download(blob: Blob, filename: string, doc: Document = document): void {
  const a = doc.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.style.display = 'none';
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** The exports by name, as a framework's own button picks one. */
export type ExportKind = 'pdf' | 'png' | 'xlsx' | 'csv' | 'ics';

/**
 * An export made and saved through the browser in one call:
 * `downloadExport(cal, 'xlsx', 'agenda.xlsx')`. PNG sheets: one file, or a zip
 * of them. Resolves with the problems (empty when the file was saved); never
 * rejects.
 */
export async function downloadExport(cal: CalendarInstance, kind: ExportKind, filename: string, o: object = {}): Promise<readonly Problem[]> {
  const doc = cal.element.ownerDocument;
  if (kind === 'png') {
    const r = await exportPNG(cal, o);
    if (r.blobs.length === 1) download(r.blobs[0]!, filename, doc);
    else if (r.blobs.length > 1) {
      const base = filename.replace(/\.png$/i, '');
      const files = await Promise.all(r.blobs.map(async (b, i) => ({ name: `${base}-${i + 1}.png`, data: new Uint8Array(await b.arrayBuffer()) })));
      download(new Blob([zip(files) as BlobPart], { type: 'application/zip' }), `${base}.zip`, doc);
    }
    return r.problems;
  }
  const make = { pdf: exportPDF, xlsx: exportXLSX, csv: exportCSV, ics: exportICS }[kind];
  if (!make) return [bad('kind', String(kind))];
  const r = await make(cal, o);
  if (r.blob) download(r.blob, filename, doc);
  return r.problems;
}
