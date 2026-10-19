import { Injectable, NgZone, inject } from '@angular/core';
import type { Problem } from '@dzcalendar/core';
import type { CalendarInstance } from '@dzcalendar/dom';
import type { CalendarController } from '@dzcalendar/angular';
import type { ExportResult, ImageOptions, RangeOptions } from '@dzcalendar/pro/export';
import type { PrintJob, PrintOptions } from '@dzcalendar/pro/print';

/** The exports and the print are fetched on their first use, not with the application. */
const exportsOf = () => import('@dzcalendar/pro/export');
const printOf = () => import('@dzcalendar/pro/print');

/**
 * A calendar: a `<dz-calendar>` (the component, as `#cal` gives it), its
 * `CalendarController` (`cal.controller`, or injected), or the DOM calendar.
 */
export type DzExportTarget = CalendarController | CalendarInstance | { readonly instance: CalendarInstance | null | undefined };

const noCalendar = (): Problem => ({ code: 'invalid-export', severity: 'error', path: 'calendar', detail: 'not-attached' });

/**
 * Printing and the exports from Angular: your own button, your own menu.
 *
 * ```ts
 * private readonly exports = inject(DzExport);
 * pdf() { this.exports.download(this.cal, 'pdf', 'agenda.pdf'); }
 * ```
 *
 * Each call runs outside Angular's zone (the drawing, the canvas) and
 * resolves inside it. Bad input never throws: a result's `problems` say it.
 */
@Injectable({ providedIn: 'root' })
export class DzExport {
  private readonly zone = inject(NgZone);

  /** Told apart by shape, not by class (two copies of @dzcalendar/angular would fail an instanceof). */
  private instance(target: DzExportTarget): CalendarInstance | null {
    if (!target || typeof target !== 'object') return null;
    if ('kernel' in target && 'element' in target) return target as CalendarInstance;
    const inst = (target as { instance?: unknown }).instance;
    if (typeof inst === 'function') return ((target as CalendarController).instance() as CalendarInstance | null) ?? null;
    return (inst as CalendarInstance | null | undefined) ?? null;
  }

  /** Runs outside the zone, settles inside it; what fails (a chunk that does not load) resolves as `none`, never rejects. */
  private run<T>(fn: () => Promise<T>, none: (p: Problem) => T): Promise<T> {
    return new Promise<T>((resolve) => {
      this.zone.runOutsideAngular(() => {
        fn().then(
          (v) => this.zone.run(() => resolve(v)),
          (e: unknown) => this.zone.run(() => resolve(none({ code: 'invalid-export', severity: 'error', path: 'export', detail: e instanceof Error ? e.name : 'failed' }))),
        );
      });
    });
  }

  private file(target: DzExportTarget, make: (cal: CalendarInstance, m: typeof import('@dzcalendar/pro/export')) => Promise<ExportResult>): Promise<ExportResult> {
    const cal = this.instance(target);
    if (!cal) return Promise.resolve({ blob: null, problems: [noCalendar()] });
    return this.run(async () => make(cal, await exportsOf()), (p) => ({ blob: null, problems: [p] }));
  }

  /** Paged printing by the browser (A4/Letter/A3 sheets, a copy of the calendar per period). */
  print(target: DzExportTarget, o: PrintOptions = {}): Promise<PrintJob> {
    const cal = this.instance(target);
    if (!cal) return Promise.resolve({ pages: [], problems: [noCalendar()], close: () => {} });
    return this.run(async () => (await printOf()).printPages(cal, o), (p) => ({ pages: [], problems: [p], close: () => {} }));
  }

  pdf(target: DzExportTarget, o: ImageOptions & { readonly title?: string } = {}): Promise<ExportResult> {
    return this.file(target, (cal, m) => m.exportPDF(cal, o));
  }

  png(target: DzExportTarget, o: ImageOptions = {}): Promise<{ readonly blobs: readonly Blob[]; readonly problems: readonly Problem[] }> {
    const cal = this.instance(target);
    if (!cal) return Promise.resolve({ blobs: [], problems: [noCalendar()] });
    return this.run(async () => (await exportsOf()).exportPNG(cal, o), (p) => ({ blobs: [], problems: [p] }));
  }

  xlsx(target: DzExportTarget, o: RangeOptions = {}): Promise<ExportResult> {
    return this.file(target, (cal, m) => m.exportXLSX(cal, o));
  }

  csv(target: DzExportTarget, o: RangeOptions & { readonly separator?: ',' | ';' | '\t' } = {}): Promise<ExportResult> {
    return this.file(target, (cal, m) => m.exportCSV(cal, o));
  }

  ics(target: DzExportTarget, o: RangeOptions & { readonly all?: boolean; readonly name?: string } = {}): Promise<ExportResult> {
    return this.file(target, (cal, m) => m.exportICS(cal, o));
  }

  /**
   * An export saved through the browser: `download(cal, 'xlsx', 'agenda.xlsx')`;
   * PNG sheets, one file or a zip of them. Resolves with the problems (empty
   * when the file was saved).
   */
  download(target: DzExportTarget, kind: 'pdf', filename: string, o?: ImageOptions & { readonly title?: string }): Promise<readonly Problem[]>;
  download(target: DzExportTarget, kind: 'png', filename: string, o?: ImageOptions): Promise<readonly Problem[]>;
  download(target: DzExportTarget, kind: 'xlsx', filename: string, o?: RangeOptions): Promise<readonly Problem[]>;
  download(target: DzExportTarget, kind: 'csv', filename: string, o?: RangeOptions & { readonly separator?: ',' | ';' | '\t' }): Promise<readonly Problem[]>;
  download(target: DzExportTarget, kind: 'ics', filename: string, o?: RangeOptions & { readonly all?: boolean; readonly name?: string }): Promise<readonly Problem[]>;
  async download(target: DzExportTarget, kind: 'pdf' | 'png' | 'xlsx' | 'csv' | 'ics', filename: string, o: object = {}): Promise<readonly Problem[]> {
    const m = await exportsOf();
    if (kind === 'png') {
      const r = await this.png(target, o);
      if (r.blobs.length === 1) m.download(r.blobs[0]!, filename);
      else if (r.blobs.length > 1) {
        const files = await Promise.all(r.blobs.map(async (b, i) => ({ name: filename.replace(/\.png$/i, '') + `-${i + 1}.png`, data: new Uint8Array(await b.arrayBuffer()) })));
        m.download(new Blob([m.zip(files) as BlobPart], { type: 'application/zip' }), filename.replace(/\.png$/i, '') + '.zip');
      }
      return r.problems;
    }
    const r = await this[kind](target, o as never);
    if (r.blob) m.download(r.blob, filename);
    return r.problems;
  }
}
