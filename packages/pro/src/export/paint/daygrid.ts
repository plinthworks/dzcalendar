import type { DayGridModel } from '@dzcalendar/core';
import { eventBox } from './ops.js';
import type { Box, PageSlot, PaintContext } from './ops.js';

const HEAD = 22;
const NUMBER = 16;
const LANE = 15;

/** How many lanes a row of `weeks` rows can hold on this page: what the model is built with (it keeps the last for "+N" itself). */
export function dayGridLanes(box: Box, weeks: number, resourceHeads: boolean): number {
  const rowH = (box.h - HEAD * (resourceHeads ? 2 : 1)) / Math.max(1, weeks);
  return Math.max(1, Math.floor((rowH - NUMBER - 2) / LANE));
}

/** A month (or a week of days) on one page: weekday heads, a row per week, bars by lane, "+N" per day. */
export function paintDayGrid(m: DayGridModel, page: PageSlot, ctx: PaintContext): void {
  const { pen, box } = page;
  const { style, fmt } = ctx;
  const cells = m.weeks[0]?.dates.length ?? 7;
  const cellW = box.w / Math.max(1, cells);
  let y = box.y;
  if (m.resourceHeads.length > 0) {
    for (const r of m.resourceHeads) pen.text(box.x + r.from * cellW, y + 5, r.count * cellW, r.resource.title, { color: style.fg, size: 10, bold: true, align: 'center' });
    y += HEAD;
  }
  m.weeks[0]?.dates.forEach((d, i) => pen.text(box.x + i * cellW, y + 5, cellW, fmt.weekday(d), { color: style.muted, size: cellW < 50 ? 8 : 9, align: 'center' }));
  y += HEAD;
  pen.line(box.x, y, box.x + box.w, y, style.border);
  const rowH = (box.y + box.h - y) / Math.max(1, m.weeks.length);
  m.weeks.forEach((w, r) => {
    const top = y + r * rowH;
    w.dates.forEach((d, i) => {
      const x = box.x + i * cellW;
      if (w.closed[i]) pen.rect(x, top, cellW, rowH, { fill: style.offHours, alpha: 0.5 });
      pen.text(x + 3, top + 3, cellW - 6, fmt.dayNumber(d), { color: w.outside[i] ? style.muted : style.fg, size: 9, align: 'end' });
      pen.line(x, top, x, top + rowH, style.border, 0.6);
    });
    for (const s of w.background) {
      const from = Math.max(0, s.dayIndex - w.firstColumn);
      pen.rect(box.x + from * cellW, top, s.dayCount * cellW, rowH, { fill: style.tone(s.instance.event.tone), alpha: 0.1 });
    }
    for (const b of w.bars) {
      const ev = b.segment.instance.event;
      for (const p of b.pieces) {
        const bx = { x: box.x + p.from * cellW + 2, y: top + NUMBER + b.lane * LANE, w: (p.to - p.from) * cellW - 4, h: LANE - 2 };
        if (ev.allDay || b.segment.dayCount > 1) eventBox(pen, bx, ctx, style.tone(ev.tone), [ev.title], { faded: ev.status === 'cancelled' });
        else {
          // A timed event in a day cell: a dot, its time, its title.
          pen.rect(bx.x + 1, bx.y + 4, 5, 5, { fill: style.tone(ev.tone), r: 2.5 });
          // Its time when the cell has room for it and the title.
          const timed = typeof b.segment.from === 'object' && 'epochMilliseconds' in b.segment.from && cellW >= 90 ? fmt.time(b.segment.from) + ' ' : '';
          pen.text(bx.x + 9, bx.y + 1, bx.w - 9, `${timed}${ev.title}`, { color: style.fg, size: 9 });
        }
      }
    }
    // "+N" under the lanes drawn that day (the bars' lanes, not the week's count of every lane).
    w.hiddenPerDay.forEach((n, i) => {
      if (n <= 0) return;
      const drawn = w.bars.reduce((k, b) => (b.pieces.some((p) => p.from <= i && i < p.to) ? Math.max(k, b.lane + 1) : k), 0);
      pen.text(box.x + i * cellW + 4, top + NUMBER + drawn * LANE, cellW - 8, `+${fmt.number(n)}`, { color: style.muted, size: 9 });
    });
    pen.line(box.x, top + rowH, box.x + box.w, top + rowH, style.border, 0.6);
  });
  pen.line(box.x + box.w, y, box.x + box.w, box.y + box.h, style.border, 0.6);
}
