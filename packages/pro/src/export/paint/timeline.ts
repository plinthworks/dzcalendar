import type { TimelineModel } from '../../timeline/model.js';
import { eventBox } from './ops.js';
import type { PageSlot, PaintContext } from './ops.js';

const HEAD = 20;
const LANE = 16;
const AREA = 150;
const GROUP = 22;

/**
 * A timeline over as many pages as its rows take: the axis fills the page's
 * width (elapsed: a 25-hour day is 25/24 of a 24-hour one), the heads (days
 * or months, then the slots) are repeated on every page, a row is never cut.
 */
export function paintTimeline(m: TimelineModel, first: PageSlot, next: () => PageSlot, ctx: PaintContext): void {
  const { style, fmt } = ctx;
  const ax = m.axis;
  let page = first;
  const bodyX = () => page.box.x + AREA;
  const k = () => (page.box.w - AREA) / Math.max(1, ax.length);
  const px = (pos: number) => bodyX() + pos * k();
  let y = 0;
  const heads = () => {
    const { pen, box } = page;
    y = box.y;
    for (const g of ax.groups) {
      const a = px(ax.toPosition(g.start));
      const b = px(ax.toPosition(g.end));
      pen.text(a, y + 4, b - a, ax.unit === 'day' ? fmt.monthHead(g.date) : fmt.dayHead(g.date), { color: style.fg, size: 10, bold: true, align: 'center' });
      pen.line(a, y, a, box.y + box.h, style.border, 0.8);
    }
    y += HEAD;
    // Slot labels where there is room for them (40 px each at least: "12:00 ص").
    const step = Math.max(1, Math.ceil(40 / k()));
    ax.slots.forEach((s, i) => {
      const a = px(ax.toPosition(s.start));
      pen.line(a, y, a, box.y + box.h, style.border, 0.4, 0.4);
      if (i % step !== 0) return;
      const label = s.time ? fmt.wall(s.time) + (s.pass === 'second' ? '*' : '') : fmt.dayNumber(s.date);
      // Never past the axis' end (the last slot of a 25-hour day).
      pen.text(a + 2, y + 4, Math.min(step * k(), px(ax.length) - a) - 4, label, { color: style.muted, size: 8 });
    });
    y += HEAD;
    pen.line(box.x, y, box.x + box.w, y, style.border);
  };
  heads();
  const startLine = () => page.pen.line(bodyX(), page.box.y, bodyX(), y, style.border);
  if (m.rows.length === 0) page.pen.text(page.box.x, y + 20, page.box.w, ctx.words.empty, { color: style.muted, size: 11, align: 'center' });
  for (const row of m.rows) {
    const h = row.kind === 'group' ? GROUP : Math.max(1, row.lanes) * LANE + 8;
    if (y + h > page.box.y + page.box.h) {
      startLine();
      page = next();
      heads();
    }
    const { pen, box } = page;
    if (row.kind === 'group') {
      pen.rect(box.x, y, box.w, h, { fill: style.offHours, alpha: 0.7 });
      pen.text(box.x + 6, y + 6, box.w - 12, `${row.value} (${fmt.number(row.count)})`, { color: style.fg, size: 10, bold: true });
    } else {
      const label = row.kind === 'resource' ? row.resource.title : '';
      pen.text(box.x + 6 + (row.kind === 'resource' ? row.depth * 12 : 0), y + 5, AREA - 12, label, { color: style.fg, size: 10 });
      for (const o of row.offHours) pen.rect(px(o.from), y, (o.to - o.from) * k(), h, { fill: style.offHours, alpha: 0.5 });
      for (const b of row.background) pen.rect(px(b.from), y, (b.to - b.from) * k(), h, { fill: style.tone(b.segment.instance.event.tone), alpha: 0.12 });
      for (const b of row.events) {
        const ev = b.segment.instance.event;
        eventBox(pen, { x: px(b.from) + 0.5, y: y + 4 + b.lane * LANE, w: Math.max(3, (b.to - b.from) * k() - 1), h: LANE - 2 }, ctx, style.tone(ev.tone), [ev.title], { faded: ev.status === 'cancelled' });
      }
      for (const more of row.more) pen.text(px(more.from), y + 4 + (row.lanes - 1) * LANE, Math.max(24, (more.to - more.from) * k()), `+${fmt.number(more.events.length)}`, { color: style.muted, size: 9 });
    }
    y += h;
    pen.line(box.x, y, box.x + box.w, y, style.border, 0.6);
  }
  startLine();
}
