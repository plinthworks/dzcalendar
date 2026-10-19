import type { CalendarInstance } from '@dzcalendar/dom';

/** Print and export buttons (loaded on the first click), and the same calls on `window.__pro` for the browser checks. */
export function exportControls(cal: CalendarInstance, into: HTMLElement): void {
  const exp = () => import('@dzcalendar/pro/export');
  const prn = () => import('@dzcalendar/pro/print');
  const stamp = () => cal.kernel.getState().range.activeStart.toString();
  const buttons: [string, () => Promise<void>][] = [
    ['Imprimer', async () => void (await (await prn()).printPages(cal))],
    ['PDF', async () => { const m = await exp(); const r = await m.exportPDF(cal); if (r.blob) m.download(r.blob, `agenda-${stamp()}.pdf`); }],
    ['PNG', async () => { const m = await exp(); const r = await m.exportPNG(cal); r.blobs.forEach((b, i) => m.download(b, `agenda-${stamp()}-${i + 1}.png`)); }],
    ['Excel', async () => { const m = await exp(); const r = await m.exportXLSX(cal); if (r.blob) m.download(r.blob, `agenda-${stamp()}.xlsx`); }],
    ['CSV', async () => { const m = await exp(); const r = await m.exportCSV(cal, { separator: ';' }); if (r.blob) m.download(r.blob, `agenda-${stamp()}.csv`); }],
    ['ICS', async () => { const m = await exp(); const r = await m.exportICS(cal); if (r.blob) m.download(r.blob, `agenda-${stamp()}.ics`); }],
  ];
  for (const [label, run] of buttons) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => void run());
    into.append(b);
  }
  (window as unknown as { __pro: unknown }).__pro = { exp, prn, cal };
}
