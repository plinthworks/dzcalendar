import { concat } from './zip.js';

/** A page: a JPEG drawn over the whole page. Sizes in PDF points (1/72 inch). */
export interface PdfPage {
  readonly jpeg: Uint8Array;
  /** The image's pixels. */
  readonly width: number;
  readonly height: number;
  /** The page's size in points (A4 portrait: 595.28 × 841.89). */
  readonly pageWidth: number;
  readonly pageHeight: number;
}

/**
 * A PDF of image pages (owner's decision: the browser shapes the text on a
 * canvas, Arabic included; no font in the file). PDF 1.4, one image per
 * page, a cross-reference table; no clock read (the same pages, the same bytes).
 */
export function pdfFromJpegs(pages: readonly PdfPage[], o: { readonly title?: string } = {}): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let at = 0;
  const push = (b: Uint8Array) => (parts.push(b), (at += b.length));
  const text = (s: string) => push(enc.encode(s));
  const n = pages.length;
  // Objects: 1 catalog, 2 pages, 3 info; then per page: page, contents, image.
  const pageObj = (i: number) => 4 + i * 3;
  // The header, then four bytes above 127: a binary file to whoever transfers it.
  text('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const obj = (id: number, body: () => void) => {
    offsets[id] = at;
    text(`${id} 0 obj\n`);
    body();
    text('\nendobj\n');
  };
  obj(1, () => text('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => text(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`));
  // The title as UTF-16BE with its byte-order mark (any script).
  const utf16 = (s: string) => {
    let hex = 'FEFF';
    for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
    return `<${hex}>`;
  };
  obj(3, () => text(`<< /Producer (DzCalendar)${o.title ? ` /Title ${utf16(o.title)}` : ''} >>`));
  const num = (x: number) => String(Math.round(x * 100) / 100);
  pages.forEach((p, i) => {
    const id = pageObj(i);
    obj(id, () => text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.pageWidth)} ${num(p.pageHeight)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`));
    const draw = enc.encode(`q ${num(p.pageWidth)} 0 0 ${num(p.pageHeight)} 0 0 cm /Im0 Do Q`);
    obj(id + 1, () => {
      text(`<< /Length ${draw.length} >>\nstream\n`);
      push(draw);
      text('\nendstream');
    });
    obj(id + 2, () => {
      text(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      text('\nendstream');
    });
  });
  const xref = at;
  const count = 4 + n * 3;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  text(table + `trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return concat(parts);
}

export { PAPER } from './paper.js';
export type { Paper } from './paper.js';
