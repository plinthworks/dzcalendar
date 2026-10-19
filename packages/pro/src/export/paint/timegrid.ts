import type { TimeGridModel } from '@dzcalendar/core';
import { eventBox } from './ops.js';
import type { PageSlot, PaintContext } from './ops.js';

const HEAD = 22;
const LANE = 16;
const GUTTER = 46;

/**
 * A time grid on one page: heads (groups, resources, dates), the all-day
 * row, the hours. The whole axis fits the page: a 25-hour day in elapsed
 * mode is taller than its neighbours by an hour; in wall mode the repeated
 * hour is the model's band, striped.
 */
export function paintTimeGrid(m: TimeGridModel, page: PageSlot, ctx: PaintContext): void {
  const { pen, box } = page;
  const { style, fmt, words } = ctx;
  const cols = m.columns.length;
  const colW = (box.w - GUTTER) / Math.max(1, cols);
  const cx = (i: number) => box.x + GUTTER + i * colW;
  let y = box.y;
  // Heads.
  if (m.groupHeads.length > 0) {
    for (const g of m.groupHeads) {
      const first = m.resourceHeads[g.from];
      const last = m.resourceHeads[g.from + g.count - 1];
      if (!first || !last) continue;
      pen.text(cx(first.from), y + 5, (last.from + last.count - first.from) * colW, g.value, { color: style.muted, size: 9, align: 'center' });
    }
    y += HEAD;
  }
  const perResource = m.resourceHeads[0]?.count ?? cols;
  if (m.resourceHeads.length > 0) {
    for (const r of m.resourceHeads) {
      pen.text(cx(r.from), y + 5, r.count * colW, r.resource.title, { color: style.fg, size: 10, bold: true, align: 'center' });
      pen.line(cx(r.from), y, cx(r.from), box.y + box.h, style.border);
    }
    y += HEAD;
  }
  if (m.resourceHeads.length === 0 || perResource > 1) {
    // Narrow columns (a week of several resources): the narrow form.
    m.columns.forEach((c, i) => pen.text(cx(i), y + 5, colW, colW < 70 ? fmt.dayHeadNarrow(c.date) : fmt.dayHead(c.date), { color: style.fg, size: colW < 70 ? 9 : 10, align: 'center' }));
    y += HEAD;
  }
  pen.line(box.x, y, box.x + box.w, y, style.border);
  // The all-day row.
  const lanes = m.allDay.lanes;
  const allDayH = Math.max(1, lanes) * LANE + 6;
  pen.text(box.x, y + 4, GUTTER - 4, words.allDayRow, { color: style.muted, size: 8, align: 'end' });
  for (const b of m.allDay.background) pen.rect(cx(b.column), y, b.segment.dayCount * colW, allDayH, { fill: style.tone(b.segment.instance.event.tone), alpha: 0.12 });
  for (const b of m.allDay.bars) {
    const ev = b.segment.instance.event;
    eventBox(pen, { x: cx(b.column) + 1, y: y + 3 + b.lane * LANE, w: b.segment.dayCount * colW - 2, h: LANE - 2 }, ctx, style.tone(ev.tone), [ev.title]);
  }
  y += allDayH;
  pen.line(box.x, y, box.x + box.w, y, style.border);
  // The hours: the longest column's axis fills the rest of the page.
  const top = y;
  const length = Math.max(1, ...m.columns.map((c) => c.axis.length));
  const k = (box.y + box.h - top) / length;
  for (const t of m.gutter) {
    const ty = top + t.position * k;
    pen.line(box.x + GUTTER, ty, box.x + box.w, ty, style.border, t.major ? 0.6 : 0.4, t.major ? 0.7 : 0.35);
    // The last line's label would hang below the grid.
    if (t.major && t.note !== 'skipped' && ty < box.y + box.h - 8) pen.text(box.x, ty + 1, GUTTER - 6, fmt.wall(t.label) + (t.note === 'second-pass' ? '*' : ''), { color: style.muted, size: 8, align: 'end' });
  }
  m.columns.forEach((c, i) => {
    const x = cx(i);
    pen.line(x, top, x, box.y + box.h, style.border, 0.6);
    if (c.folded) return pen.hatch(x, top, colW, box.y + box.h - top, style.muted);
    for (const o of c.offHours) pen.rect(x, top + o.top * k, colW, o.height * k, { fill: style.offHours, alpha: 0.5 });
    for (const b of c.axis.bands) pen.hatch(x, top + b.from * k, colW, (b.to - b.from) * k, style.muted);
    for (const b of c.background) pen.rect(x, top + b.top * k, colW, b.height * k, { fill: style.tone(b.segment.instance.event.tone), alpha: 0.12 });
    for (const e of c.events) {
      const ev = e.segment.instance.event;
      const h = Math.max(e.visualHeight * k, 11);
      const w = e.width * colW - 2;
      const time = fmt.time(e.segment.from);
      // Narrow: the title alone (its place on the axis says the time).
      const lines = w < 60 ? [ev.title] : h >= 24 ? [time, ev.title] : [`${time} ${ev.title}`];
      eventBox(pen, { x: x + e.left * colW + 1, y: top + e.top * k + 0.5, w, h: h - 1 }, ctx, style.tone(ev.tone), lines, { faded: ev.status === 'cancelled' });
    }
    for (const more of c.more) {
      const b = { x: x + more.left * colW + 1, y: top + more.top * k, w: more.width * colW - 2, h: Math.max(more.height * k, 12) };
      pen.rect(b.x, b.y, b.w, b.h, { stroke: style.border });
      pen.text(b.x, b.y + 2, b.w, `+${fmt.number(more.events.length)}`, { color: style.fg, size: 9, align: 'center' });
    }
  });
  pen.line(box.x + box.w, top, box.x + box.w, box.y + box.h, style.border, 0.6);
}
