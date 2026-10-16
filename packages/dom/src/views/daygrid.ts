import { Temporal, formatTemporal } from '@dzcalendar/core';
import type { DayGridBar, DayGridModel, DayGridWeek, KernelState, PlainDate, Segment } from '@dzcalendar/core';
import type { ViewController, ViewCtx } from '../host.js';
import { registerView } from '../host.js';
import { attachMenuTriggers } from '../menu.js';
import { applyEventLook, fillEvent, startReadingOf, timeLabels, unmountEvent } from '../render/event.js';
import { KeyedList, contentsHost, h } from '../render/reconcile.js';

interface WeekItem {
  readonly key: string;
  readonly sig: string;
  readonly week: DayGridWeek;
}

interface BarItem {
  readonly key: string;
  readonly sig: string;
  readonly content: string;
  readonly segment: Segment;
  readonly lane: number;
  readonly from: number;
  readonly to: number;
  readonly bg: boolean;
  /** First and last piece of a bar cut by "+N": only they carry the event's rounded ends. */
  readonly first: boolean;
  readonly last: boolean;
}

interface CellItem {
  readonly key: string;
  readonly sig: string;
  readonly date: PlainDate;
  readonly col: number;
  readonly today: boolean;
  readonly outside: boolean;
  readonly closed: boolean;
  readonly count: number;
}

interface MoreItem {
  readonly key: string;
  readonly sig: string;
  readonly col: number;
  readonly count: number;
  readonly lane: number;
  readonly date: PlainDate;
}

interface WeekParts {
  readonly cells: KeyedList<CellItem>;
  readonly bars: KeyedList<BarItem>;
  readonly more: KeyedList<MoreItem>;
  /** The row currently drawn, for the "+N" links' handlers. */
  week: DayGridWeek | null;
}

/** Stable small ids for model objects. */
const ids = new WeakMap<object, number>();
let nextId = 0;
const idOf = (o: object) => {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = ++nextId));
  return id;
};

/**
 * The month (or a week, or a day) as rows of days. Each row is a CSS grid:
 * cells behind, bars on lanes (`--lane`), and on a day that overflows, the
 * "+N" link in place of the last lane — never a half-covered bar.
 */
export function createDayGridView(ctx: ViewCtx): ViewController {
  const { doc } = ctx;
  const root = h(doc, 'div', 'dz-dg');
  root.setAttribute('role', 'grid');
  const head = h(doc, 'div', 'dz-dg__head');
  head.setAttribute('role', 'row');
  const body = h(doc, 'div', 'dz-dg__body');
  root.append(head, body);
  let model: DayGridModel | null = null;
  let state: KernelState | null = null;
  const parts = new Map<string, WeekParts>();
  let created: HTMLElement[] = [];

  const weeks = new KeyedList<WeekItem>(
    body,
    (it) => {
      const el = h(doc, 'div', 'dz-dg__week');
      el.setAttribute('role', 'row');
      const cells = contentsHost(doc, 'dz-dg__cells');
      const barsHost = contentsHost(doc, 'dz-dg__bars');
      const more = contentsHost(doc, 'dz-dg__mores');
      el.append(cells, barsHost, more);
      const p: WeekParts = {
        week: null,
        cells: new KeyedList<CellItem>(cells, () => h(doc, 'div', 'dz-dg__cell'), (n, c) => drawCell(n, c)),
        bars: new KeyedList<BarItem>(barsHost, () => h(doc, 'div', 'dz-bar'), (n, b, c) => drawBar(n, b, c), (n) => unmountEvent(ctx, n)),
        more: new KeyedList<MoreItem>(
          more,
          (m) => {
            const link = h(doc, 'button', 'dz-more') as HTMLButtonElement;
            link.type = 'button';
            link.setAttribute('aria-haspopup', 'dialog');
            link.addEventListener('click', () => p.week && openMore(link, p.week, Number(link.dataset['col'])));
            void m;
            return link;
          },
          (link, m) => drawMore(link, m),
        ),
      };
      parts.set(it.key, p);
      return el;
    },
    (el, it) => drawWeek(el, it),
    // A row leaving (navigation) takes its events' hooks with it.
    (el) => {
      const p = parts.get(el.dataset['key'] ?? '');
      p?.bars.clear();
    },
  );

  function drawWeek(el: HTMLElement, it: WeekItem): void {
    const { week } = it;
    const p = parts.get(it.key)!;
    const s = state!;
    p.week = week;
    const max = model?.maxLanes ?? null;
    const shown = max !== null ? Math.min(week.laneCount, max) : week.laneCount;
    el.style.setProperty('--dz-cols', String(week.dates.length));
    el.style.setProperty('--lanes', String(shown));
    p.cells.sync(
      week.dates.map((date, i): CellItem => {
        const count = week.segments.filter((sg) => sg.dayIndex - week.firstColumn <= i && i < sg.dayIndex - week.firstColumn + sg.dayCount).length;
        const today = date.equals(s.today);
        const outside = week.outside[i] ?? false;
        const closed = week.closed[i] ?? false;
        return { key: date.toString(), sig: `${i}|${today}|${outside}|${closed}|${count}|${ctx.epoch}`, date, col: i, today, outside, closed, count };
      }),
    );
    const items: BarItem[] = [];
    for (const seg of week.background) {
      items.push({ key: `bg:${seg.key}`, sig: `${seg.dayIndex}|${seg.dayCount}`, content: `${seg.instance.event.revision}|${ctx.epoch}`, segment: seg, lane: 0, from: seg.dayIndex - week.firstColumn, to: seg.dayIndex - week.firstColumn + seg.dayCount, bg: true, first: true, last: true });
    }
    for (const bar of week.bars) items.push(...piecesOf(bar));
    created.push(...p.bars.sync(items));
    // "+N" links, where a day hides something: keyed by date, so a link keeps its node (and focus).
    const lane = Math.max(0, (max ?? 1) - 1);
    p.more.sync(
      week.hiddenPerDay.flatMap((n, i) => (n === 0 ? [] : [{ key: week.dates[i]!.toString(), sig: `${n}|${i}|${lane}|${ctx.epoch}`, col: i, count: n, lane, date: week.dates[i]! }])),
    );
  }

  function drawMore(link: HTMLElement, m: MoreItem): void {
    link.dataset['col'] = String(m.col);
    link.textContent = ctx.messages.moreLink({ count: m.count });
    link.style.setProperty('--col', String(m.col));
    link.style.setProperty('--lane', String(m.lane));
    link.setAttribute('aria-label', ctx.messages.moreLabel({ count: m.count, date: formatTemporal(m.date, { weekday: 'long', day: 'numeric', month: 'long' }, ctx.locale) }));
  }

  function piecesOf(bar: DayGridBar): BarItem[] {
    const s = bar.segment;
    const n = bar.pieces.length;
    // Always suffixed: a bar cut by "+N" or not keeps the same keys, so a
    // resize that changes the lanes does not rebuild it (nor rerun its hooks).
    return bar.pieces.map((p, k) => ({
      key: `${s.key}|p${k}`,
      sig: `${bar.lane}|${p.from}|${p.to}`,
      content: `${s.instance.event.revision}|${s.startsHere && k === 0}|${s.endsHere && k === n - 1}|${ctx.epoch}`,
      segment: s,
      lane: bar.lane,
      from: p.from,
      to: p.to,
      bg: false,
      first: k === 0,
      last: k === n - 1,
    }));
  }

  function drawCell(cell: HTMLElement, c: CellItem): void {
    cell.setAttribute('role', 'gridcell');
    cell.style.setProperty('--col', String(c.col));
    cell.dataset['date'] = c.date.toString();
    cell.classList.toggle('dz-dg__cell--today', c.today);
    cell.classList.toggle('dz-dg__cell--outside', c.outside);
    cell.classList.toggle('dz-dg__cell--closed', c.closed);
    if (c.today) cell.setAttribute('aria-current', 'date');
    else cell.removeAttribute('aria-current');
    const long = formatTemporal(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, ctx.locale);
    cell.setAttribute('aria-label', ctx.messages.dayLabel({ date: long, count: c.count }));
    cell.tabIndex = -1;
    // The day number leads to that day, where a day view exists. One tab stop
    // per cell is the job of Phase 8's roving focus: until then it is not a stop.
    const dayView = ctx.kernel.getViewSpec('timeGridDay') ? 'timeGridDay' : ctx.kernel.getViewSpec('dayGridDay') ? 'dayGridDay' : null;
    const num = h(doc, dayView ? 'button' : 'span', 'dz-dg__num', formatTemporal(c.date, { day: 'numeric' }, ctx.locale));
    if (dayView) {
      (num as HTMLButtonElement).type = 'button';
      num.tabIndex = -1;
      num.setAttribute('aria-label', `${ctx.messages.goToDay}, ${long}`);
      num.addEventListener('click', () => ctx.kernel.setView(dayView, c.date));
    }
    cell.replaceChildren(num);
  }

  function drawBar(el: HTMLElement, it: BarItem, changed: { pos: boolean; content: boolean; created: boolean }): void {
    el.classList.toggle('dz-bar--bg', it.bg);
    el.style.setProperty('--lane', String(it.lane));
    el.style.setProperty('--col', String(it.from));
    el.style.setProperty('--span', String(Math.max(1, it.to - it.from)));
    if (!changed.content) return;
    const s = it.segment;
    const ev = s.instance.event;
    el.dataset['segment'] = s.key;
    el.classList.toggle('dz-bar--cont-start', !(s.startsHere && it.first));
    el.classList.toggle('dz-bar--cont-end', !(s.endsHere && it.last));
    el.classList.toggle('dz-bar--timed', !ev.allDay);
    applyEventLook(el, ev);
    if (it.bg) {
      el.replaceChildren();
      el.setAttribute('aria-hidden', 'true');
      return;
    }
    const title = ev.title || ctx.messages.untitled;
    const reading = startReadingOf(ev, ctx.zone);
    const labels = timeLabels(ctx, ev, reading ? { start: reading } : {});
    // In a month, a timed event shows its start time, then its title.
    const fallback = () =>
      ev.allDay
        ? [doc.createTextNode(title)]
        : [h(doc, 'span', 'dz-bar__time', labels.text.split(' – ')[0]), doc.createTextNode(` ${title}`)];
    fillEvent(ctx, el, { instance: s.instance, segment: s, timeText: labels.text, displayZone: ctx.zone, family: 'dayGrid' }, fallback, changed.created);
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
  }

  function openMore(link: HTMLElement, week: DayGridWeek, col: number): void {
    const date = week.dates[col]!;
    const segs = week.segments.filter((sg) => sg.dayIndex - week.firstColumn <= col && col < sg.dayIndex - week.firstColumn + sg.dayCount);
    // The same rendering as the grid's bars: hooks included, mounted now, unmounted on close.
    const nodes = segs.map((sg) => {
      const ev = sg.instance.event;
      const item = h(doc, 'div', 'dz-bar dz-bar--in-popover');
      applyEventLook(item, ev);
      item.dataset['segment'] = sg.key;
      const title = ev.title || ctx.messages.untitled;
      const reading = startReadingOf(ev, ctx.zone);
      const labels = timeLabels(ctx, ev, reading ? { start: reading } : {});
      fillEvent(
        ctx,
        item,
        { instance: sg.instance, segment: sg, timeText: labels.text, displayZone: ctx.zone, family: 'dayGrid' },
        () => (ev.allDay ? [doc.createTextNode(title)] : [h(doc, 'span', 'dz-bar__time', labels.text), doc.createTextNode(` ${title}`)]),
        true,
      );
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
      return item;
    });
    ctx.openMore(link, formatTemporal(date, { weekday: 'long', day: 'numeric', month: 'long' }, ctx.locale), nodes, () => {
      for (const n of nodes) unmountEvent(ctx, n);
    });
  }

  const segmentByKey = (key: string): Segment | undefined => {
    for (const w of model?.weeks ?? []) {
      const seg = w.segments.find((sg) => sg.key === key);
      if (seg) return seg;
    }
    return undefined;
  };
  // The panel's events take the same context menu as the grid's.
  attachMenuTriggers(ctx, ctx.popoverElement, (target) => {
    const item = target.closest<HTMLElement>('.dz-bar');
    const seg = item ? segmentByKey(item.dataset['segment'] ?? '') : undefined;
    return item && seg ? { target: { kind: 'event', instance: seg.instance }, anchor: item } : null;
  });

  attachMenuTriggers(ctx, root, (target) => {
    if (!model) return null;
    const barEl = target.closest<HTMLElement>('.dz-bar:not(.dz-bar--bg)');
    if (barEl) {
      const seg = segmentByKey(barEl.dataset['segment'] ?? '');
      return seg ? { target: { kind: 'event', instance: seg.instance }, anchor: barEl } : null;
    }
    const cell = target.closest<HTMLElement>('.dz-dg__cell');
    if (!cell) return null;
    return { target: { kind: 'day', date: Temporal.PlainDate.from(cell.dataset['date']!) }, anchor: cell };
  });

  return {
    element: root,
    body,
    render(next, s) {
      const m = next as DayGridModel;
      // Set before drawing: the rows read the new model's lanes.
      model = m;
      state = s;
      created = [];
      const first = m.weeks[0];
      head.replaceChildren(
        ...(first?.dates ?? []).map((d) => {
          const c = h(doc, 'div', 'dz-dg__weekday', formatTemporal(d, { weekday: 'short' }, ctx.locale));
          c.setAttribute('role', 'columnheader');
          return c;
        }),
      );
      root.style.setProperty('--dz-cols', String(first?.dates.length ?? 7));
      root.classList.toggle('dz-dg--month', s.view.alignment === 'month');
      weeks.sync(m.weeks.map((week) => ({ key: week.dates[0]?.toString() ?? '', sig: `${idOf(week)}|${s.today.toString()}|${m.maxLanes}|${ctx.epoch}`, week })));
      for (const key of parts.keys()) if (!m.weeks.some((w) => w.dates[0]?.toString() === key)) parts.delete(key);
      return created;
    },
    tick() {
      /* today moves through kernel.refreshToday → a new state → render */
    },
    destroy() {
      for (const p of parts.values()) p.bars.clear();
      weeks.clear();
      parts.clear();
      root.remove();
    },
  };
}

registerView('dayGrid', createDayGridView);
