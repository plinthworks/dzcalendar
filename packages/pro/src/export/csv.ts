import type { OccurrenceRow } from './rows.js';
import type { ExportMessages } from './messages.js';

/** What a spreadsheet would run as a formula: written as text (CSV injection). */
const FORMULA = /^[=+\-@\t\r]/;

const wall = (t: OccurrenceRow['start']) => ('hour' in t ? `${t.toPlainDate().toString()} ${t.toPlainTime().toString({ smallestUnit: 'minute' })}` : t.toString());

function cell(v: string, sep: string): string {
  const safe = FORMULA.test(v) ? `'${v}` : v;
  return safe.includes(sep) || /["\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The columns, in order: the event in its own zones, then in the calendar's. */
export const headOf = (w: ExportMessages): string[] => [w.title, w.start, w.zone, w.end, w.endZone, w.shownStart, w.shownEnd, w.minutes, w.allDay, w.resources, w.status];

/** The header, then one line per row; the values a spreadsheet reads (ISO dates, minutes). */
export function rowsTable(rows: readonly OccurrenceRow[], w: ExportMessages): string[][] {
  return [
    headOf(w),
    ...rows.map((r) => [r.title, wall(r.start), r.zone ?? '', wall(r.end), r.endZone ?? '', wall(r.shownStart), wall(r.shownEnd), r.minutes === null ? '' : String(r.minutes), r.allDay ? w.yes : w.no, r.resources.join(', '), w.statusOf(r.status)]),
  ];
}

/** RFC 4180, CRLF, a BOM (Excel reads UTF-8 then). `separator` `;` for the locales whose Excel expects it. */
export function toCSV(rows: readonly OccurrenceRow[], w: ExportMessages, separator = ','): string {
  return '﻿' + rowsTable(rows, w).map((line) => line.map((v) => cell(v, separator)).join(separator)).join('\r\n') + '\r\n';
}
