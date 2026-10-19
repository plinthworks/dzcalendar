import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal, buildResourceTree, createEventStore, createIdGenerator, normalizeMany } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { occurrenceRows, excelSerial } from '../src/export/rows.js';
import { toCSV } from '../src/export/csv.js';
import { toXLSX } from '../src/export/xlsx.js';
import { crc32, zip } from '../src/export/zip.js';
import { pdfFromJpegs } from '../src/export/pdf.js';
import { EXPORT_EN, EXPORT_FR, exportMessagesFor } from '../src/export/messages.js';

const d = (s: string) => Temporal.PlainDate.from(s);
function snapshot(events: EventInput[]) {
  const store = createEventStore();
  store.replaceSourceChunk('events', 'all', normalizeMany(events, { displayZone: 'Europe/Paris', newId: createIdGenerator('x') }, 'events').items);
  return store.snapshot;
}
const EVENTS: EventInput[] = [
  // The night the clocks go back in Paris (25 October 2026, 03:00 → 02:00): 00:00–06:00 is 7 real hours.
  { id: 'night', title: 'Garde de nuit', start: '2026-10-25T00:00[Europe/Paris]', end: '2026-10-25T06:00[Europe/Paris]', resourceId: 'r1' },
  // Kolkata (+05:30, no clock change): 14:00 there is 09:30 in Paris (+01:00 after the 25th).
  { id: 'call', title: '=SUM(A1)', start: '2026-10-26T14:00[Asia/Kolkata]', end: '2026-10-26T14:45[Asia/Kolkata]' },
  // A flight Paris → Tokyo: leaves 10:00 UTC, lands 07:00 Tokyo (+09:00) = 22:00 UTC = 23:00 Paris (+01:00) the day before; 12 h.
  { id: 'fly', title: 'Vol, "AF276"', start: '2026-10-27T11:00[Europe/Paris]', end: '2026-10-28T07:00[Asia/Tokyo]', status: 'tentative' },
  { id: 'day', title: 'Congé', start: '2026-10-29', allDay: true },
  { id: 'later', title: 'Hors plage', start: '2026-11-03T09:00[Europe/Paris]' },
];

describe('occurrence rows (both zones, the real duration)', () => {
  it('in order; each in its own zones and in the shown zone; 7 hours on the night of the change; the flight ends in Tokyo', () => {
    const { tree } = buildResourceTree([{ id: 'r1', title: 'Urgences' }]);
    const rows = occurrenceRows(snapshot(EVENTS), { start: d('2026-10-24'), end: d('2026-11-01'), displayZone: 'Europe/Paris', resources: tree });
    expect(rows.map((r) => [r.title, String(r.start), r.zone, String(r.end), r.endZone, String(r.shownStart), String(r.shownEnd), r.minutes, r.resources, r.status])).toEqual([
      ['Garde de nuit', '2026-10-25T00:00:00', 'Europe/Paris', '2026-10-25T06:00:00', 'Europe/Paris', '2026-10-25T00:00:00', '2026-10-25T06:00:00', 420, ['Urgences'], 'confirmed'],
      ['=SUM(A1)', '2026-10-26T14:00:00', 'Asia/Kolkata', '2026-10-26T14:45:00', 'Asia/Kolkata', '2026-10-26T09:30:00', '2026-10-26T10:15:00', 45, [], 'confirmed'],
      ['Vol, "AF276"', '2026-10-27T11:00:00', 'Europe/Paris', '2026-10-28T07:00:00', 'Asia/Tokyo', '2026-10-27T11:00:00', '2026-10-27T23:00:00', 720, [], 'tentative'],
      ['Congé', '2026-10-29', null, '2026-10-30', null, '2026-10-29', '2026-10-30', null, [], 'confirmed'],
    ]);
  });

  it('Excel serials: 1 January 1900 is 1, 28 February 59, 1 March 61 (Excel counts a 29 February 1900 that never was); before 1900 none; noon is .5', () => {
    expect([excelSerial(d('1900-01-01')), excelSerial(d('1900-02-28')), excelSerial(d('1900-03-01')), excelSerial(d('1899-12-31')), excelSerial(d('2026-10-25')), excelSerial(Temporal.PlainDateTime.from('2026-10-25T12:00'))]).toEqual([1, 59, 61, null, 46320, 46320.5]);
  });
});

describe('CSV', () => {
  it('a BOM, CRLF, quotes doubled, a formula written as text; French words', () => {
    const rows = occurrenceRows(snapshot(EVENTS.slice(1, 3)), { start: d('2026-10-24'), end: d('2026-11-01'), displayZone: 'Europe/Paris' });
    const csv = toCSV(rows, EXPORT_FR, ';');
    expect(csv.split('\r\n')).toEqual([
      '﻿Titre;Début;Fuseau horaire;Fin;Fuseau de fin;Début (fuseau affiché);Fin (fuseau affiché);Minutes;Journée entière;Ressources;Statut',
      "'=SUM(A1);2026-10-26 14:00;Asia/Kolkata;2026-10-26 14:45;Asia/Kolkata;2026-10-26 09:30;2026-10-26 10:15;45;Non;;Confirmé",
      '"Vol, ""AF276""";2026-10-27 11:00;Europe/Paris;2026-10-28 07:00;Asia/Tokyo;2026-10-27 11:00;2026-10-27 23:00;720;Non;;Provisoire',
      '',
    ]);
  });

  it('the words follow the locale (fr-CA → French, xx → English)', () => {
    expect([exportMessagesFor('fr-CA').title, exportMessagesFor('xx').title]).toEqual(['Titre', 'Title']);
  });
});

describe('zip, XLSX and PDF, read back by independent readers', () => {
  it('CRC-32 of "123456789" is CBF43926 (the standard check value)', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  const python = (() => {
    try {
      execFileSync('python3', ['-c', 'import openpyxl, pypdf, zipfile']);
      return true;
    } catch {
      return false;
    }
  })();
  const dir = mkdtempSync(join(tmpdir(), 'dz-export-'));
  const py = (code: string, file: string) => execFileSync('python3', ['-I', '-c', code, file], { encoding: 'utf8' }).trim();

  it.skipIf(!python)('a zip Python’s zipfile reads, CRCs checked', () => {
    const f = join(dir, 'a.zip');
    writeFileSync(f, zip([{ name: 'a.txt', data: new TextEncoder().encode('bonjour') }, { name: 'é/b.txt', data: new Uint8Array([0, 1, 2]) }]));
    expect(py("import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print('|'.join(f'{i.filename}:{len(z.read(i))}' for i in z.infolist()))", f)).toBe('a.txt:7|é/b.txt:3');
  });

  it.skipIf(!python)('an XLSX openpyxl opens: header, real dates, numbers, a right-to-left sheet in Arabic', () => {
    const rows = occurrenceRows(snapshot(EVENTS), { start: d('2026-10-24'), end: d('2026-11-01'), displayZone: 'Europe/Paris' });
    const f = join(dir, 'a.xlsx');
    writeFileSync(f, toXLSX(rows, EXPORT_EN));
    const out = py(
      "import sys,openpyxl; ws=openpyxl.load_workbook(sys.argv[1]).active; r=list(ws.iter_rows(values_only=True)); print(ws.title); print(r[0][0], r[0][7]); print(r[1][0], r[1][1].isoformat(), r[1][5].isoformat(), r[1][7]); print(r[2][0], r[2][2]); print(r[3][3].isoformat(), r[3][4]); print(r[4][1].isoformat(), r[4][7], r[4][8]); print(ws.freeze_panes, ws.sheet_view.rightToLeft)",
      f,
    );
    expect(out.split('\n')).toEqual(['Events', 'Title Minutes', 'Garde de nuit 2026-10-25T00:00:00 2026-10-25T00:00:00 420', '=SUM(A1) Asia/Kolkata', '2026-10-28T07:00:00 Asia/Tokyo', '2026-10-29T00:00:00 None Yes', 'A2 None']);
    const ar = join(dir, 'ar.xlsx');
    writeFileSync(ar, toXLSX(rows, exportMessagesFor('ar'), { rtl: true }));
    expect(py("import sys,openpyxl; ws=openpyxl.load_workbook(sys.argv[1]).active; print(ws.title, ws.sheet_view.rightToLeft, ws['A1'].value)", ar)).toBe('الأحداث True العنوان');
  });

  it.skipIf(!python)('what XML forbids (U+FFFF, a control character, a lone surrogate) is left out: the sheet still opens', () => {
    const rows = occurrenceRows(snapshot([{ id: 'x', title: 'A\uffffB\u0001C\ud800D', start: '2026-10-21T09:00[Europe/Paris]' }]), { start: d('2026-10-21'), end: d('2026-10-22'), displayZone: 'Europe/Paris' });
    const f = join(dir, 'bad.xlsx');
    writeFileSync(f, toXLSX(rows, EXPORT_EN));
    expect(py("import sys,openpyxl; print(openpyxl.load_workbook(sys.argv[1]).active['A2'].value)", f)).toBe('ABCD');
  });

  it.skipIf(!python)('a PDF pypdf reads: two A4 pages, each one image of the given size, the title in Arabic', () => {
    // The smallest valid JPEG would need an encoder; a PDF reader does not decode the image to count it.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const f = join(dir, 'a.pdf');
    writeFileSync(f, pdfFromJpegs([0, 1].map(() => ({ jpeg, width: 1240, height: 1754, pageWidth: 595.28, pageHeight: 841.89 })), { title: 'تقويم' }));
    const out = py(
      "import sys,pypdf; r=pypdf.PdfReader(sys.argv[1], strict=True); print(len(r.pages)); p=r.pages[1]; print(float(p.mediabox.width), float(p.mediabox.height)); x=p['/Resources']['/XObject']['/Im0'].get_object(); print(x['/Width'], x['/Height'], x['/Filter']); print(r.metadata.title)",
      f,
    );
    expect(out.split('\n')).toEqual(['2', '595.28 841.89', '1240 1754 /DCTDecode', 'تقويم']);
  });
});
