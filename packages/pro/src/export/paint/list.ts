import type { ListModel } from '@dzcalendar/core/views';
import type { PageSlot, PaintContext } from './ops.js';

const DAY = 24;
const ROW = 18;
const TIME = 92;

/**
 * A list over as many pages as it takes: a day's head, then its events
 * (time, a dot, the title). A day cut by the page bottom has its head again
 * on the next page.
 */
export function paintList(m: ListModel, first: PageSlot, next: () => PageSlot, ctx: PaintContext): void {
  const { style, fmt, words } = ctx;
  let page = first;
  let y = page.box.y;
  const bottom = () => page.box.y + page.box.h;
  const head = (date: ListModel['days'][number]['date']) => {
    const { pen, box } = page;
    pen.rect(box.x, y, box.w, DAY - 2, { fill: style.offHours, alpha: 0.6 });
    pen.text(box.x + 6, y + 6, box.w - 12, fmt.longDay(date), { color: style.fg, size: 10, bold: true });
    y += DAY;
  };
  if (m.days.length === 0) {
    page.pen.text(page.box.x, y + 20, page.box.w, words.empty, { color: style.muted, size: 11, align: 'center' });
    return;
  }
  for (const day of m.days) {
    // A head alone at the bottom of a page goes to the next one with its first event.
    if (y + DAY + ROW > bottom()) ((page = next()), (y = page.box.y));
    head(day.date);
    for (const e of day.entries) {
      if (y + ROW > bottom()) {
        page = next();
        y = page.box.y;
        head(day.date);
      }
      const { pen, box } = page;
      const ev = e.instance.event;
      const when = e.allDay ? words.allDayRow : `${e.start ? fmt.time(e.start.toInstant()) : ''} – ${e.end ? fmt.time(e.end.toInstant()) : ''}`;
      pen.text(box.x + 6, y + 4, TIME - 8, when, { color: style.muted, size: 9 });
      pen.rect(box.x + TIME + 2, y + 6, 6, 6, { fill: style.tone(ev.tone), r: 3 });
      pen.text(box.x + TIME + 14, y + 3, box.w - TIME - 20, ev.title, { color: ev.status === 'cancelled' ? style.muted : style.fg, size: 10 });
      pen.line(box.x, y + ROW, box.x + box.w, y + ROW, style.border, 0.5, 0.5);
      y += ROW;
    }
  }
}
