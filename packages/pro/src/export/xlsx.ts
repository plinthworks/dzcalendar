import { excelSerial } from './rows.js';
import type { OccurrenceRow } from './rows.js';
import type { ExportMessages } from './messages.js';
import { zip } from './zip.js';
import { headOf } from './csv.js';

/** Escaped, and without what XML 1.0 forbids (control characters, U+FFFE, U+FFFF, a lone surrogate): Excel would call the file damaged. */
const esc = (s: string) =>
  s
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');

/** A1 names: 0 → A, 26 → AA. */
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * One sheet: a header, a row per occurrence. Times are real Excel dates
 * (wall times: what the cell says is what the zone's clock said), durations
 * numbers; an Arabic or Hebrew locale gets a right-to-left sheet.
 */
export function toXLSX(rows: readonly OccurrenceRow[], w: ExportMessages, o: { readonly rtl?: boolean; readonly sheet?: string } = {}): Uint8Array {
  const head = headOf(w);
  const str = (r: number, c: number, v: string, style = 0) => `<c r="${colName(c)}${r}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  const num = (r: number, c: number, v: number, style = 0) => `<c r="${colName(c)}${r}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
  // Styles: 1 the header (bold), 2 a date and time, 3 a date.
  // Excel's dates start on 1 January 1900: an earlier one is written as text.
  const when = (r: number, c: number, t: OccurrenceRow['start']) => {
    const serial = excelSerial(t);
    return serial === null ? str(r, c, String(t)) : num(r, c, serial, 'hour' in t ? 2 : 3);
  };
  const lines = [`<row r="1">${head.map((h, c) => str(1, c, h, 1)).join('')}</row>`];
  rows.forEach((x, i) => {
    const r = i + 2;
    lines.push(
      `<row r="${r}">` +
        str(r, 0, x.title) +
        when(r, 1, x.start) +
        str(r, 2, x.zone ?? '') +
        when(r, 3, x.end) +
        str(r, 4, x.endZone ?? '') +
        when(r, 5, x.shownStart) +
        when(r, 6, x.shownEnd) +
        (x.minutes === null ? '' : num(r, 7, x.minutes)) +
        str(r, 8, x.allDay ? w.yes : w.no) +
        str(r, 9, x.resources.join(', ')) +
        str(r, 10, w.statusOf(x.status)) +
        '</row>',
    );
  });
  const widths = [28, 18, 20, 18, 20, 18, 18, 10, 10, 24, 14];
  const sheet =
    XML +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView workbookViewId="0"${o.rtl ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((wd, i) => `<col min="${i + 1}" max="${i + 1}" width="${wd}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${lines.join('')}</sheetData>` +
    (rows.length > 0 ? `<autoFilter ref="A1:${colName(head.length - 1)}${rows.length + 1}"/>` : '') +
    '</worksheet>';
  const styles =
    XML +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
  // A sheet name: 31 characters at most, none of []:*?/\ .
  const name = esc((o.sheet ?? w.sheet).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1');
  const enc = new TextEncoder();
  const files: Record<string, string> = {
    '[Content_Types].xml':
      XML +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': XML + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
    'xl/styles.xml': styles,
  };
  return zip(Object.entries(files).map(([n, text]) => ({ name: n, data: enc.encode(text) })));
}
