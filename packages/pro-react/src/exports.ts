import type { Problem } from '@dzcalendar/core';
import type { CalendarInstance } from '@dzcalendar/dom';
import type { ExportKind, ExportResult, ImageOptions, RangeOptions } from '@dzcalendar/pro/export';
import type { PrintJob, PrintOptions } from '@dzcalendar/pro/print';

/** The exports and the print are fetched on their first use, not with the application. */
const exportsOf = () => import('@dzcalendar/pro/export');
const printOf = () => import('@dzcalendar/pro/print');

const noCalendar = (): Problem => ({ code: 'invalid-export', severity: 'error', path: 'calendar', detail: 'not-attached' });
const failed = (e: unknown): Problem => ({ code: 'invalid-export', severity: 'error', path: 'export', detail: e instanceof Error ? e.name : 'failed' });

/** Printing and the exports of one calendar; nothing here throws or rejects (a result's `problems` say it). */
export interface DzExports {
  /** Paged printing by the browser (A4/Letter/A3 sheets, a copy of the calendar per period). */
  print(o?: PrintOptions): Promise<PrintJob>;
  pdf(o?: ImageOptions & { readonly title?: string }): Promise<ExportResult>;
  png(o?: ImageOptions): Promise<{ readonly blobs: readonly Blob[]; readonly problems: readonly Problem[] }>;
  xlsx(o?: RangeOptions): Promise<ExportResult>;
  csv(o?: RangeOptions & { readonly separator?: ',' | ';' | '\t' }): Promise<ExportResult>;
  ics(o?: RangeOptions & { readonly all?: boolean; readonly name?: string }): Promise<ExportResult>;
  /** Made and saved through the browser: `download('xlsx', 'agenda.xlsx')`; PNG sheets one file or a zip. Resolves with the problems. */
  download(kind: 'pdf', filename: string, o?: ImageOptions & { readonly title?: string }): Promise<readonly Problem[]>;
  download(kind: 'png', filename: string, o?: ImageOptions): Promise<readonly Problem[]>;
  download(kind: 'xlsx', filename: string, o?: RangeOptions): Promise<readonly Problem[]>;
  download(kind: 'csv', filename: string, o?: RangeOptions & { readonly separator?: ',' | ';' | '\t' }): Promise<readonly Problem[]>;
  download(kind: 'ics', filename: string, o?: RangeOptions & { readonly all?: boolean; readonly name?: string }): Promise<readonly Problem[]>;
}

/** The exports of the calendar `instance()` gives when called (null: not mounted, said). */
export function exportsFor(instance: () => CalendarInstance | null): DzExports {
  const file = async (make: (cal: CalendarInstance, m: typeof import('@dzcalendar/pro/export')) => Promise<ExportResult>): Promise<ExportResult> => {
    const cal = instance();
    if (!cal) return { blob: null, problems: [noCalendar()] };
    try {
      return await make(cal, await exportsOf());
    } catch (e) {
      return { blob: null, problems: [failed(e)] };
    }
  };
  return {
    async print(o = {}) {
      const cal = instance();
      if (!cal) return { pages: [], problems: [noCalendar()], close: () => {} };
      try {
        return await (await printOf()).printPages(cal, o);
      } catch (e) {
        return { pages: [], problems: [failed(e)], close: () => {} };
      }
    },
    pdf: (o = {}) => file((cal, m) => m.exportPDF(cal, o)),
    async png(o = {}) {
      const cal = instance();
      if (!cal) return { blobs: [], problems: [noCalendar()] };
      try {
        return await (await exportsOf()).exportPNG(cal, o);
      } catch (e) {
        return { blobs: [], problems: [failed(e)] };
      }
    },
    xlsx: (o = {}) => file((cal, m) => m.exportXLSX(cal, o)),
    csv: (o = {}) => file((cal, m) => m.exportCSV(cal, o)),
    ics: (o = {}) => file((cal, m) => m.exportICS(cal, o)),
    async download(kind: ExportKind, filename: string, o: object = {}) {
      const cal = instance();
      if (!cal) return [noCalendar()];
      try {
        return await (await exportsOf()).downloadExport(cal, kind, filename, o);
      } catch (e) {
        return [failed(e)];
      }
    },
  };
}
