/**
 * @dzcalendar/pro/print — paged printing by the browser: real A4/Letter
 * sheets, a copy of the calendar per period sized to the sheet, then
 * `window.print()`.
 */
export { printPages } from './print/pages.js';
export type { PrintOptions, PrintJob } from './print/pages.js';
export { periodsFor, sheetSize } from './export/pages.js';
export type { PageOptions, PagePeriod } from './export/pages.js';
