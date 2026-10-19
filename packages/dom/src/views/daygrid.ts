import { Temporal, formatTemporal } from '@dzcalendar/core';
import { weekNumber, weekRulesFor } from '@dzcalendar/core';
import type { DayGridBar, DayGridModel, DayGridWeek, Hit, KernelState, PlainDate, Segment, ZonedDateTime } from '@dzcalendar/core';

/** The shape of `@dzcalendar/core/views`' multi-month model, named here so the month view does not import that entry. */
interface MonthsModel {
  readonly months: readonly { readonly month: PlainDate; readonly model: DayGridModel }[];
}
import type { Box, InteractionSurface, KeyboardSurface } from '../interact/surface.js';
import type { ViewController, ViewCtx } from '../host.js';
import { registerView } from '../host.js';
import { attachMenuTriggers } from '../menu.js';
import { applyEventLook, fillEvent, startReadingOf, timeLabels, unmountEvent } from '../render/event.js';
import { KeyedList, contentsHost, h } from '../render/reconcile.js';
import { onScrollFrame } from '../render/window.js';
import { altDate } from '../render/alt.js';
import { NodePool } from '../render/pool.js';
import { drawResourceHeads, noResourcesNote, resourceName } from '../render/resource-heads.js';

/** A cell's key: its date, and its resource in a resource view (the same date shows once per resource). */
const cellKey = (date: PlainDate, resourceId: string | undefined) => (resourceId === undefined ? date.toString() : `${date.toString()}|${resourceId}`);

interface WeekItem {
  readonly key: string;
  readonly sig: string;
  readonly week: DayGridWeek;
  readonly maxLanes: number | null;
}

/** One month grid: the whole view, or one month of a multi-month view. */
interface Section {
  readonly key: string;
  readonly model: DayGridModel;
  /** The month's first day, in a multi-month view. */
  readonly month: PlainDate | null;
}

interface MonthItem {
  readonly key: string;
  readonly sig: string;
  readonly section: Section;
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
  /** Whose cell, in a resource view; and whether it starts that resource's days in the row. */
  readonly resourceId: string | undefined;
  readonly resourceTitle: string;
  readonly resourceStart: boolean;
  readonly col: number;
  readonly today: boolean;
  readonly outside: boolean;
  readonly closed: boolean;
  readonly count: number;
  /** Every event on this day, hidden by "+N" or not: what the day holds. */
  readonly segs: readonly Segment[];
  /** Those drawn as bars: the only ones the cell lists until the day is entered (Enter). */
  readonly drawn: readonly Segment[];
  /** The row's week number, on its first cell when week numbers are on. */
  readonly week: number | null;
}

interface ItemOfDay {
  readonly key: string;
  readonly sig: string;
  readonly seg: Segment;
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
export function createDayGridView(ctx: ViewCtx, opts: { readonly months?: boolean } = {}): ViewController {
  const { doc } = ctx;
  /** A multi-month view: a grid per month, each date's events in its own month only. */
  const multi = opts.months === true;
  const root = h(doc, 'div', multi ? 'dz-dg dz-mm' : 'dz-dg');
  const head = h(doc, 'div', 'dz-dg__head');
  head.setAttribute('role', 'row');
  // A resource view's heads (groups, resources) above the weekdays.
  const groupsHost = contentsHost(doc, 'dz-dg__groups');
  const resourcesHost = contentsHost(doc, 'dz-dg__resources');
  const weekdaysHost = contentsHost(doc, 'dz-dg__weekdays');
  head.append(groupsHost, resourcesHost, weekdaysHost);
  const resourceHeads = drawResourceHeads(ctx, groupsHost, resourcesHost, 'dz-dg', 1);
  const emptyNote = noResourcesNote(ctx, root);
  const body = h(doc, 'div', 'dz-dg__body');
  if (multi) root.append(body);
  else {
    root.setAttribute('role', 'grid');
    root.append(head, body);
  }
  let sections: Section[] = [];
  const allWeeks = () => sections.flatMap((x) => x.model.weeks);
  let state: KernelState | null = null;
  const parts = new Map<string, WeekParts>();
  /** Bar nodes reused across months and weeks. */
  const barPool = new NodePool(() => h(doc, 'div', 'dz-bar'));
  let created: HTMLElement[] = [];
  /** The keyboard's day (and resource, in a resource view): its cell is the grid's tab stop. */
  let cursorDate: PlainDate | null = null;
  let cursorResource: string | undefined;
  const itemLists = new WeakMap<HTMLElement, { readonly host: HTMLElement; readonly list: KeyedList<ItemOfDay> }>();
  /**
   * A day's buttons for screen readers and the keyboard: those of the bars
   * drawn, and — once the day is entered (Enter) — every event behind "+N"
   * too. A crowded month thus holds cells × lanes nodes, not one per event.
   */
  const cellItems = new WeakMap<HTMLElement, CellItem>();
  /** The cell entered (Enter): its key. */
  let expanded: string | null = null;
  function syncItems(cell: HTMLElement, c: CellItem, all: boolean): void {
    const segs = all ? c.segs : c.drawn;
    itemLists.get(cell)?.list.sync(segs.map((seg) => ({ key: `item:${seg.key}`, sig: `${seg.instance.event.revision}|${ctx.epoch}`, seg })));
  }
  /** Every event of that day listed (and the last day entered back to its drawn ones). */
  function expand(date: PlainDate | null, resourceId?: string): void {
    const key = date ? cellKey(date, resourceId ?? defaultResource()) : null;
    if (expanded !== null && key === expanded) return;
    const prev = expanded !== null ? cellByKey(expanded) : null;
    expanded = key;
    const prevItem = prev ? cellItems.get(prev) : undefined;
    if (prev && prevItem) syncItems(prev, prevItem, false);
    const cell = date ? cellOf(date, resourceId) : null;
    const item = cell ? cellItems.get(cell) : undefined;
    if (cell && item) syncItems(cell, item, true);
  }

  const weekList = (host: HTMLElement) => new KeyedList<WeekItem>(
    host,
    (it) => {
      const el = h(doc, 'div', 'dz-dg__week');
      el.setAttribute('role', 'row');
      const cells = contentsHost(doc, 'dz-dg__cells');
      // What is drawn across the days is seen, not read: each cell lists its own events.
      const barsHost = contentsHost(doc, 'dz-dg__bars');
      barsHost.setAttribute('aria-hidden', 'true');
      const more = contentsHost(doc, 'dz-dg__mores');
      more.setAttribute('aria-hidden', 'true');
      el.append(cells, barsHost, more);
      const p: WeekParts = {
        week: null,
        cells: new KeyedList<CellItem>(cells, () => h(doc, 'div', 'dz-dg__cell'), (n, c) => drawCell(n, c)),
        bars: new KeyedList<BarItem>(barsHost, () => barPool.take(), (n, b, c) => drawBar(n, b, c), (n) => unmountEvent(ctx, n), (n) => barPool.release(n)),
        more: new KeyedList<MoreItem>(
          more,
          (m) => {
            const link = h(doc, 'button', 'dz-more') as HTMLButtonElement;
            link.type = 'button';
            // A pointer's way to the hidden events; the keyboard reaches them in the cell.
            link.tabIndex = -1;
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
  /** The single grid's rows, or each month's. */
  const weeks = weekList(body);
  const monthWeeks = new Map<string, KeyedList<WeekItem>>();
  const months = new KeyedList<MonthItem>(
    body,
    (it) => {
      const el = h(doc, 'section', 'dz-mm__month');
      const title = h(doc, 'h3', 'dz-mm__title');
      const grid = h(doc, 'div', 'dz-mm__grid');
      grid.setAttribute('role', 'grid');
      const mhead = h(doc, 'div', 'dz-dg__head');
      mhead.setAttribute('role', 'row');
      const rows = contentsHost(doc, 'dz-mm__rows');
      grid.append(mhead, rows);
      el.append(title, grid);
      monthWeeks.set(it.key, weekList(rows));
      return el;
    },
    (el, it) => drawMonth(el, it.section),
    (el) => {
      monthWeeks.get(el.dataset['key'] ?? '')?.clear();
      monthWeeks.delete(el.dataset['key'] ?? '');
    },
  );

  function weekdayHead(host: HTMLElement, m: DayGridModel): void {
    const resourced = m.resourceHeads.length > 0;
    const row = (m.groupHeads.length > 0 ? 1 : 0) + (resourced ? 1 : 0) + 1;
    // A one-day resource view: the resources are the columns, the title says the day.
    const dates = resourced && (m.weeks[0]?.dates.length ?? 0) === m.resourceHeads.length ? [] : (m.weeks[0]?.dates ?? []);
    host.replaceChildren(
      ...dates.map((d, i) => {
        const c = h(doc, 'div', 'dz-dg__weekday', formatTemporal(d, { weekday: 'short' }, ctx.locale));
        c.setAttribute('role', 'columnheader');
        if (resourced) {
          c.style.gridRow = String(row);
          c.style.gridColumn = String(i + 1);
        }
        return c;
      }),
    );
  }

  function weekItems(x: Section): WeekItem[] {
    const s = state!;
    return x.model.weeks.map((week) => ({
      key: x.key ? `${x.key}|${week.dates[0]?.toString() ?? ''}` : (week.dates[0]?.toString() ?? ''),
      sig: `${idOf(week)}|${s.today.toString()}|${x.model.maxLanes}|${ctx.epoch}`,
      week,
      maxLanes: x.model.maxLanes,
    }));
  }

  function drawMonth(el: HTMLElement, x: Section): void {
    const name = formatTemporal(x.month!, { month: 'long', year: 'numeric' }, ctx.locale);
    const title = el.querySelector<HTMLElement>('.dz-mm__title')!;
    const go = h(doc, 'button', 'dz-mm__go', name) as HTMLButtonElement;
    go.type = 'button';
    go.setAttribute('aria-label', `${ctx.messages.goToMonth}, ${name}`);
    go.addEventListener('click', () => ctx.kernel.getViewSpec('dayGridMonth') && ctx.kernel.setView('dayGridMonth', x.month!));
    title.replaceChildren(go);
    const grid = el.querySelector<HTMLElement>('.dz-mm__grid')!;
    grid.setAttribute('aria-label', name);
    grid.style.setProperty('--dz-cols', String(x.model.weeks[0]?.dates.length ?? 7));
    weekdayHead(grid.querySelector<HTMLElement>('.dz-dg__head')!, x.model);
    fill(x.key, x, !asleep.has(x.key), el);
  }

  // ── a crowded year: months far from the screen asleep, at the height they would take ──
  /** Month keys whose weeks are not mounted. */
  const asleep = new Set<string>();
  /** The period last opened, to scroll to its date's month once. */
  let shownYear = '';
  /** A drawn month's height (every month has six weeks): what an asleep one keeps. */
  let monthHeight = 0;
  const crowdedYear = () =>
    multi && !ctx.printing && sections.reduce((n, x) => n + x.model.weeks.reduce((k, w) => k + w.segments.length, 0), 0) > ctx.virtualizeAbove;
  function fill(key: string, x: Section, awake: boolean, node?: HTMLElement): void {
    // While it is created, the month's node is not in the list yet: handed over.
    const el = node ?? months.get(key);
    const grid = el?.querySelector<HTMLElement>('.dz-mm__grid');
    const list = monthWeeks.get(key);
    if (!el || !grid || !list) return;
    if (awake) {
      el.style.removeProperty('min-height');
      grid.removeAttribute('aria-hidden');
      created.push(...list.sync(weekItems(x)));
    } else {
      // The whole month's height (title included), on the element that had it.
      if (monthHeight > 0) el.style.minHeight = `${monthHeight}px`;
      // A grid without rows is not a grid to assistive technology: hidden until it wakes (the keyboard wakes it).
      grid.setAttribute('aria-hidden', 'true');
      list.clear();
    }
  }
  /** The months meeting the scrolled view and a screen around it; the others asleep. Read, then write. */
  function wake(): void {
    if (!multi) return;
    ctx.scheduler.schedule({
      read: () => {
        const view = body.getBoundingClientRect();
        const margin = Math.max(view.height, 200);
        const awakeMonth = sections.map((x) => months.get(x.key)).find((el, i) => el && !asleep.has(sections[i]!.key));
        return {
          crowded: crowdedYear() && view.height > 0,
          height: awakeMonth?.getBoundingClientRect().height ?? 0,
          near: sections.map((x) => {
            const r = months.get(x.key)?.getBoundingClientRect();
            return r ? r.bottom >= view.top - margin && r.top <= view.bottom + margin : true;
          }),
        };
      },
      write: ({ crowded, height, near }) => {
        if (height > 0) monthHeight = height;
        sections.forEach((x, i) => {
          const el = months.get(x.key);
          if (!el) return;
          const keep = !crowded || monthHeight === 0 || near[i] || el.contains(doc.activeElement);
          if (keep && asleep.delete(x.key)) fill(x.key, x, true);
          else if (!keep && !asleep.has(x.key)) {
            asleep.add(x.key);
            fill(x.key, x, false);
          }
        });
      },
    });
  }
  /** A date's month awake now (the keyboard goes there). */
  function wakeMonthOf(date: PlainDate): void {
    if (asleep.size === 0) return;
    const x = sections.find((m) => m.month !== null && m.month.year === date.year && m.month.month === date.month);
    if (x && asleep.delete(x.key)) fill(x.key, x, true);
  }
  onScrollFrame(ctx.scope, body, () => multi && crowdedYear(), wake);

  function drawWeek(el: HTMLElement, it: WeekItem): void {
    const { week } = it;
    const sec = sections.find((x) => x.model.weeks.includes(week));
    const d0 = sec?.model.weeks[0]?.dates[0];
    if (d0) firstShown = d0;
    const p = parts.get(it.key)!;
    const s = state!;
    p.week = week;
    const max = it.maxLanes;
    const shown = max !== null ? Math.min(week.laneCount, max) : week.laneCount;
    el.style.setProperty('--dz-cols', String(week.dates.length));
    // At least one: `repeat(0, …)` is invalid CSS, and the whole row template would be dropped
    // (one track as tall as the row — which the lane measurement then read as "room for one lane").
    el.style.setProperty('--lanes', String(Math.max(1, shown)));
    p.cells.sync(
      week.dates.map((date, i): CellItem => {
        const segs = week.segments.filter((sg) => sg.dayIndex - week.firstColumn <= i && i < sg.dayIndex - week.firstColumn + sg.dayCount);
        const hiddenKeys = week.hiddenKeysPerDay[i] ?? [];
        // A set: a crowded day hides a thousand events, and a list lookup per event was quadratic.
        const hidden = hiddenKeys.length === 0 ? null : new Set(hiddenKeys);
        const drawn = hidden === null ? segs : segs.filter((sg) => !hidden.has(sg.key));
        const count = segs.length;
        const today = date.equals(s.today);
        const outside = week.outside[i] ?? false;
        const closed = week.closed[i] ?? false;
        const items = segs.map((sg) => `${sg.key}:${sg.instance.event.revision}`).join(',');
        const wk = i === 0 && ctx.weekNumbers ? weekNumber(date, { ...weekRulesFor(ctx.locale), firstDay: s.firstDay }) : null;
        const res = week.resources[i] ?? null;
        const resourceStart = res !== null && i > 0 && week.resources[i - 1] !== res;
        return {
          key: cellKey(date, res?.id),
          sig: `${i}|${today}|${outside}|${closed}|${items}|${wk}|${resourceStart}|${ctx.epoch}`,
          date,
          resourceId: res?.id,
          resourceTitle: res ? resourceName(ctx, res) : '',
          resourceStart,
          col: i,
          today,
          outside,
          closed,
          count,
          segs,
          drawn,
          week: wk,
        };
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
      week.hiddenPerDay.flatMap((n, i) => (n === 0 ? [] : [{ key: cellKey(week.dates[i]!, week.resources[i]?.id), sig: `${n}|${i}|${lane}|${ctx.epoch}`, col: i, count: n, lane, date: week.dates[i]! }])),
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

  /** The first date the view shows (its own month's in a multi-month view: each month's first cell). */
  let firstShown: PlainDate = Temporal.PlainDate.from('1970-01-01');
  function drawCell(cell: HTMLElement, c: CellItem): void {
    cell.setAttribute('role', 'gridcell');
    cell.style.setProperty('--col', String(c.col));
    cell.dataset['date'] = c.date.toString();
    if (c.resourceId !== undefined) cell.dataset['resource'] = c.resourceId;
    else delete cell.dataset['resource'];
    cell.classList.toggle('dz-dg__cell--resource-start', c.resourceStart);
    cell.classList.toggle('dz-dg__cell--today', c.today);
    cell.classList.toggle('dz-dg__cell--outside', c.outside);
    cell.classList.toggle('dz-dg__cell--closed', c.closed);
    if (c.today) cell.setAttribute('aria-current', 'date');
    else cell.removeAttribute('aria-current');
    // The month too on a grid's first day: a grid starting mid-month would otherwise show bare numbers.
    const alt = ctx.altLocale ? altDate(c.date, ctx.altLocale, c.col === 0 && c.date.equals(firstShown)) : null;
    const long = formatTemporal(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, ctx.locale) + (alt ? ` (${alt.long})` : '');
    // In a resource view the cell says whose it is first.
    cell.setAttribute('aria-label', ctx.messages.dayLabel({ date: c.resourceTitle ? ctx.messages.ofResource({ resource: c.resourceTitle, place: long }) : long, count: c.count }));
    // Roving focus: the cursor's cell is the grid's one tab stop.
    cell.tabIndex = cursorDate?.equals(c.date) && cursorResource === c.resourceId ? 0 : -1;
    // The day number leads to that day, where a day view exists (the context menu's "Go to this day" too).
    const dayView = ctx.kernel.getViewSpec('timeGridDay') ? 'timeGridDay' : ctx.kernel.getViewSpec('dayGridDay') ? 'dayGridDay' : null;
    const num = h(doc, dayView ? 'button' : 'span', 'dz-dg__num', formatTemporal(c.date, { day: 'numeric' }, ctx.locale));
    if (dayView) {
      (num as HTMLButtonElement).type = 'button';
      num.tabIndex = -1;
      num.setAttribute('aria-label', `${ctx.messages.goToDay}, ${long}`);
      num.addEventListener('click', () => ctx.kernel.setView(dayView, c.date));
    }
    let items = itemLists.get(cell);
    if (!items) {
      const host = h(doc, 'div', 'dz-dg__items');
      items = { host, list: new KeyedList<ItemOfDay>(host, () => h(doc, 'div', 'dz-dg__item'), (n, it) => drawItem(n, it.seg)) };
      itemLists.set(cell, items);
      cell.append(host);
    }
    // The number is redrawn; the list keeps its nodes (and the focus on one of them).
    const old = cell.querySelector(':scope > .dz-dg__num');
    if (old) old.replaceWith(num);
    else cell.prepend(num);
    // The second calendar's day beside the number (said in the cell's name, so hidden here).
    cell.querySelector(':scope > .dz-dg__alt')?.remove();
    if (alt) {
      const a = h(doc, 'span', 'dz-dg__alt', alt.short);
      a.setAttribute('aria-hidden', 'true');
      num.after(a);
    }
    cell.querySelector(':scope > .dz-dg__wk')?.remove();
    if (c.week !== null) {
      // The week's number, leading to that week where a week view exists.
      const weekView = ctx.kernel.getViewSpec('timeGridWeek') ? 'timeGridWeek' : ctx.kernel.getViewSpec('dayGridWeek') ? 'dayGridWeek' : null;
      const wk = h(doc, weekView ? 'button' : 'span', 'dz-dg__wk', ctx.messages.weekShort({ week: c.week }));
      wk.setAttribute('aria-label', ctx.messages.weekLabel({ week: c.week }));
      if (weekView) {
        (wk as HTMLButtonElement).type = 'button';
        wk.tabIndex = -1;
        wk.addEventListener('click', () => ctx.kernel.setView(weekView, c.date));
      }
      cell.prepend(wk);
    }
    cellItems.set(cell, c);
    syncItems(cell, c, expanded === c.key);
  }

  /** The cell's own button for an event: what the keyboard focuses and a screen reader reads in the day. */
  function drawItem(el: HTMLElement, seg: Segment): void {
    const ev = seg.instance.event;
    const title = ev.title || ctx.messages.untitled;
    const reading = startReadingOf(ev, ctx.zone);
    const labels = timeLabels(ctx, ev, reading ? { start: reading } : {});
    el.setAttribute('role', 'button');
    el.tabIndex = -1;
    el.dataset['segment'] = seg.key;
    el.dataset['eventId'] = ev.id;
    if (ev.ref) el.dataset['seriesId'] = ev.ref.seriesId;
    else delete el.dataset['seriesId'];
    el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
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
    // Days are pulled by their edges where the event really starts or ends in this row; timed events in a month only move.
    const resizable = !it.bg && ev.allDay && ev.perms.duration;
    if (resizable && s.endsHere && it.last) el.dataset['resizeEnd'] = '1';
    else delete el.dataset['resizeEnd'];
    if (resizable && s.startsHere && it.first) el.dataset['resizeStart'] = '1';
    else delete el.dataset['resizeStart'];
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
    for (const w of allWeeks()) {
      const seg = w.segments.find((sg) => sg.key === key);
      if (seg) return seg;
    }
    return undefined;
  };
  // The panel's events take the same context menu as the grid's.
  // An event in the "+N" panel is clicked like one in the grid.
  ctx.scope.on(ctx.popoverElement, 'click', (e) => {
    const item = (e.target as Element | null)?.closest<HTMLElement>('.dz-bar');
    const seg = item ? segmentByKey(item.dataset['segment'] ?? '') : undefined;
    if (seg) ctx.live().onEventClick?.(seg.instance);
  });
  // …and by keyboard: Enter or Space, as on a button.
  ctx.scope.on(ctx.popoverElement, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key !== 'Enter' && ke.key !== ' ') return;
    const item = (ke.target as Element | null)?.closest<HTMLElement>('.dz-bar');
    const seg = item ? segmentByKey(item.dataset['segment'] ?? '') : undefined;
    if (!seg) return;
    ke.preventDefault();
    ctx.live().onEventClick?.(seg.instance);
  });

  attachMenuTriggers(ctx, ctx.popoverElement, (target) => {
    const item = target.closest<HTMLElement>('.dz-bar');
    const seg = item ? segmentByKey(item.dataset['segment'] ?? '') : undefined;
    return item && seg ? { target: { kind: 'event', instance: seg.instance }, anchor: item } : null;
  });

  // ── keyboard: the cells are the cursor, their items the events ─────────
  // A date may be drawn twice in a multi-month view (a padding day of the next month): its own month's cell wins.
  /** The first resource of a resource view (a hit without one lands there); undefined in a plain view. */
  const defaultResource = (): string | undefined => sections[0]?.model.resourceHeads[0]?.resource.id;
  const cellOf = (date: PlainDate, resourceId?: string) => (wakeMonthOf(date), cellOfDrawn(date, resourceId ?? defaultResource()));
  const cellOfDrawn = (date: PlainDate, resourceId: string | undefined) => {
    const all = [...body.querySelectorAll<HTMLElement>(`.dz-dg__cell[data-date="${date.toString()}"]`)].filter((c) => c.dataset['resource'] === resourceId);
    return all.find((c) => !c.classList.contains('dz-dg__cell--outside')) ?? all[0] ?? null;
  };
  const cellByKey = (key: string) => {
    const [date, ...rest] = key.split('|');
    return cellOfDrawn(Temporal.PlainDate.from(date!), rest.length > 0 ? rest.join('|') : undefined);
  };
  /** A hit on a cell: its date, and its resource in a resource view. */
  const dayHit = (date: PlainDate, resourceId: string | undefined): Hit => (resourceId === undefined ? { kind: 'day', date } : { kind: 'day', date, resourceId });
  const cellHit = (el: HTMLElement): Hit | null => (el.dataset['date'] ? dayHit(Temporal.PlainDate.from(el.dataset['date']), el.dataset['resource']) : null);
  const shownDates = () => allWeeks().flatMap((w) => (multi ? w.dates.filter((_, i) => !w.outside[i]) : w.dates));
  const homeDate = (): PlainDate | null => {
    const dates = shownDates();
    const st = state ?? ctx.kernel.getState();
    return dates.find((d) => d.equals(st.today)) ?? dates.find((d) => Temporal.PlainDate.compare(d, st.range.activeStart) >= 0) ?? dates[0] ?? null;
  };
  /** One tab stop: the cursor's cell. */
  function rove(date: PlainDate | null, resourceId: string | undefined = date && cursorDate?.equals(date) ? cursorResource : defaultResource()): void {
    cursorDate = date;
    cursorResource = date ? resourceId : undefined;
    // The cursor left the entered day: its hidden events' buttons go again.
    if (expanded !== null && !(date && cellKey(date, resourceId) === expanded)) expand(null);
    const stop = date ? cellOf(date, resourceId) : null;
    for (const c of body.querySelectorAll<HTMLElement>('.dz-dg__cell')) c.tabIndex = c === stop ? 0 : -1;
  }
  const weekOf = (date: PlainDate) => allWeeks().find((w) => w.dates.some((d, i) => d.equals(date) && !(multi && w.outside[i])));
  /** The bars (or the "+N" link) that show an event on one day: where its focus ring is drawn. */
  function visualsOf(item: HTMLElement): HTMLElement[] {
    const cell = item.closest<HTMLElement>('.dz-dg__cell');
    const row = cell?.closest<HTMLElement>('.dz-dg__week');
    if (!cell || !row) return [];
    const col = Number(cell.style.getPropertyValue('--col'));
    const bars = [...row.querySelectorAll<HTMLElement>('.dz-bar')].filter((b) => {
      if (b.dataset['segment'] !== item.dataset['segment']) return false;
      const from = Number(b.style.getPropertyValue('--col'));
      return from <= col && col < from + Number(b.style.getPropertyValue('--span'));
    });
    if (bars.length > 0) return bars;
    const more = [...row.querySelectorAll<HTMLElement>('.dz-more')].find((m) => Number(m.dataset['col']) === col);
    return more ? [more] : [];
  }
  ctx.scope.on(root, 'focusin', (e) => {
    const t = e.target as Element | null;
    if (t?.matches('.dz-dg__item')) for (const v of visualsOf(t as HTMLElement)) v.classList.add('dz-focus');
    if (t?.matches('.dz-dg__cell') && t instanceof HTMLElement && t.dataset['date'] && (cursorDate?.toString() !== t.dataset['date'] || cursorResource !== t.dataset['resource'])) {
      rove(Temporal.PlainDate.from(t.dataset['date']), t.dataset['resource']);
    }
  });
  ctx.scope.on(root, 'focusout', (e) => {
    const t = e.target as Element | null;
    if (t?.matches('.dz-dg__item')) for (const v of root.querySelectorAll('.dz-focus')) v.classList.remove('dz-focus');
  });

  const keys: KeyboardSurface = {
    allDayRow: false,
    home() {
      const d = homeDate();
      return d ? dayHit(d, defaultResource()) : null;
    },
    fit(hit) {
      const dates = shownDates();
      if (dates.length === 0) return null;
      if (dates.some((d) => d.equals(hit.date))) {
        // In a resource view, a hit without a known resource lands on the first one's cell.
        const rid = defaultResource() === undefined ? undefined : sections[0]!.model.resourceHeads.some((x) => x.resource.id === hit.resourceId) ? hit.resourceId : defaultResource();
        return hit.kind === 'day' && !hit.allDayRow && hit.resourceId === rid ? hit : dayHit(hit.date, rid);
      }
      // A hidden weekday, wherever it is: null, and the keyboard steps on past it (a day view: Friday → Monday).
      if ((state ?? ctx.kernel.getState()).view.hiddenDays.includes(hit.date.dayOfWeek as never)) return null;
      // The period's bounds (a month grid's padding included; a multi-month view's months only).
      const r = (state ?? ctx.kernel.getState()).range;
      if (Temporal.PlainDate.compare(hit.date, multi ? r.activeStart : r.start) < 0) return 'prev';
      if (Temporal.PlainDate.compare(hit.date, multi ? r.activeEnd : r.end) >= 0) return 'next';
      // A hidden day inside the period: null, and the keyboard steps on past it.
      return null;
    },
    showCursor(hit) {
      rove(hit.date, hit.resourceId);
      cellOf(hit.date, hit.resourceId)?.focus();
    },
    isCursor: (el) => el.matches('.dz-dg__cell'),
    cursorAt: (el) => (el.matches('.dz-dg__cell') && el instanceof HTMLElement ? cellHit(el) : null),
    lineEdge(hit, edge) {
      const w = weekOf(hit.date);
      // The line is the cursor's resource's days in the row (all the row outside a resource view).
      const inRow = w ? w.dates.filter((_, i) => !(multi && w.outside[i]) && w.resources[i]?.id === hit.resourceId) : [];
      const d = edge === 'start' ? inRow[0] : inRow[inRow.length - 1];
      return d ? dayHit(d, hit.resourceId) : hit;
    },
    stepAcross(hit, delta) {
      const heads = sections[0]?.model.resourceHeads ?? [];
      if (heads.length === 0) return undefined;
      const i = heads.findIndex((x) => x.resource.id === hit.resourceId);
      const next = heads[(i < 0 ? 0 : i) + delta];
      return next ? dayHit(hit.date, next.resource.id) : null;
    },
    itemsAt: (hit) => {
      expand(hit.date, hit.resourceId);
      return [...(cellOf(hit.date, hit.resourceId)?.querySelectorAll<HTMLElement>('.dz-dg__item') ?? [])];
    },
    itemsAround: (node) => [...(node.closest('.dz-dg__items')?.querySelectorAll<HTMLElement>('.dz-dg__item') ?? [])],
    nodeFor(eventId, date, resourceId) {
      // Its cell in that resource's days, else in any resource's that day, else anywhere.
      const inCellOf = (r: string | undefined) => {
        if (!date) return undefined;
        expand(date, r);
        return [...(cellOf(date, r)?.querySelectorAll<HTMLElement>('.dz-dg__item') ?? [])].find((n) => n.dataset['eventId'] === eventId);
      };
      const inAnyCell = () =>
        date ? [...body.querySelectorAll<HTMLElement>(`.dz-dg__cell[data-date="${date.toString()}"] .dz-dg__item`)].find((n) => n.dataset['eventId'] === eventId) : undefined;
      return inCellOf(resourceId) ?? inAnyCell() ?? [...body.querySelectorAll<HTMLElement>('.dz-dg__item')].find((n) => n.dataset['eventId'] === eventId) ?? null;
    },
    cursorFor(node) {
      const cell = node.closest<HTMLElement>('.dz-dg__cell');
      return cell ? cellHit(cell) : null;
    },
    reveal() {
      /* the month does not scroll */
    },
  };

  /** A pointer pressed a bar: the focus goes to its item in the cell where it starts in that row. */
  function focusTarget(node: HTMLElement): HTMLElement {
    if (!node.matches('.dz-bar')) return node;
    const row = node.closest<HTMLElement>('.dz-dg__week');
    const col = node.style.getPropertyValue('--col');
    const cell = [...(row?.querySelectorAll<HTMLElement>('.dz-dg__cell') ?? [])].find((c) => c.style.getPropertyValue('--col') === col);
    return [...(cell?.querySelectorAll<HTMLElement>('.dz-dg__item') ?? [])].find((i) => i.dataset['segment'] === node.dataset['segment']) ?? node;
  }

  // ── gestures: geometry read once per gesture ─────────────────────────────
  interface WeekGeo {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly cells: readonly { readonly left: number; readonly right: number; readonly date: PlainDate; readonly outside: boolean; readonly resourceId: string | undefined }[];
  }
  interface Geo {
    readonly weeks: readonly WeekGeo[];
    /** Where the first lane starts below a row's top (the day number's track and a gap). */
    readonly laneTop: number;
    readonly laneHeight: number;
    readonly origin: { readonly x: number; readonly y: number };
  }
  const surface: InteractionSurface<Geo> = {
    root,
    scroller: null,
    family: 'dayGrid',
    keys,
    focusTarget,
    accepts: (target) => target.closest('.dz-dg__week') !== null,
    measure(origin) {
      const weeksGeo: WeekGeo[] = [];
      let laneTop = 24;
      let laneHeight = 20;
      const rows = [...body.querySelectorAll<HTMLElement>('.dz-dg__week')];
      const first = rows[0];
      if (first) {
        const style = getComputedStyle(first);
        const tracks = style.gridTemplateRows.split(' ').map((t) => parseFloat(t) || 0);
        const gap = parseFloat(style.rowGap) || 0;
        laneTop = (tracks[0] ?? 24) + gap;
        laneHeight = tracks[1] ?? laneHeight;
      }
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        const cells = [...row.querySelectorAll<HTMLElement>('.dz-dg__cell')].map((c) => {
          const cr = c.getBoundingClientRect();
          return { left: cr.left, right: cr.right, date: Temporal.PlainDate.from(c.dataset['date']!), outside: c.classList.contains('dz-dg__cell--outside'), resourceId: c.dataset['resource'] };
        });
        // In reading order, so a right-to-left row still finds its cells by position.
        cells.sort((a, b) => a.left - b.left);
        weeksGeo.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, cells });
      }
      return { weeks: weeksGeo, laneTop, laneHeight, origin };
    },
    hitAt(geo, x, y) {
      const { weeks: ws } = geo;
      if (ws.length === 0) return null;
      // The row under the point, or the nearest (months side by side: rows share their heights).
      const dist = (k: WeekGeo) => Math.max(k.top - y, 0, y - k.bottom + 1) + Math.max(k.left - x, 0, x - k.right + 1);
      const w = ws.reduce((best, k) => (dist(k) < dist(best) ? k : best));
      // In a multi-month view a padding day belongs to the next month's grid: the row's own days only.
      const cells = multi ? w.cells.filter((k) => !k.outside) : w.cells;
      if (cells.length === 0) return null;
      const cx = Math.max(cells[0]!.left, Math.min(cells[cells.length - 1]!.right - 1, x));
      const c = cells.find((k) => cx >= k.left && cx < k.right) ?? cells[cells.length - 1]!;
      return dayHit(c.date, c.resourceId);
    },
    boxesFor(geo, span) {
      const zone = ctx.zone;
      const first = span.allDay ? (span.start as PlainDate) : (span.start as ZonedDateTime).withTimeZone(zone).toPlainDate();
      let last: PlainDate;
      if (span.allDay) last = (span.end as PlainDate).subtract({ days: 1 });
      else {
        // A timed event shows on the days it touches: an end at midnight does not touch the next one.
        const end = (span.end as ZonedDateTime).withTimeZone(zone);
        last = end.toPlainTime().equals(Temporal.PlainTime.from('00:00')) && Temporal.PlainDate.compare(end.toPlainDate(), first) > 0 ? end.toPlainDate().subtract({ days: 1 }) : end.toPlainDate();
      }
      const o = geo.origin;
      const out: Box[] = [];
      // In a resource view, only the cells of the resources it is (or would be) on: one box per resource and row.
      const on = span.resourceIds ?? (span.resourceId !== undefined ? [span.resourceId] : null);
      for (const w of geo.weeks) {
        const inside = w.cells.filter(
          (c) => !(multi && c.outside) && (c.resourceId === undefined || !on || on.includes(c.resourceId)) && Temporal.PlainDate.compare(c.date, first) >= 0 && Temporal.PlainDate.compare(c.date, last) <= 0,
        );
        const runs = new Map<string, typeof inside>();
        for (const c of inside) (runs.get(c.resourceId ?? '') ?? runs.set(c.resourceId ?? '', []).get(c.resourceId ?? '')!).push(c);
        for (const run of runs.values()) {
          const left = Math.min(...run.map((c) => c.left));
          const right = Math.max(...run.map((c) => c.right));
          out.push({ x: left - o.x + 2, y: w.top + geo.laneTop - o.y, w: right - left - 4, h: geo.laneHeight });
        }
      }
      return out;
    },
    instanceOf(node) {
      return segmentByKey(node.dataset['segment'] ?? '')?.instance ?? null;
    },
  };

  attachMenuTriggers(ctx, root, (target) => {
    if (sections.length === 0) return null;
    const barEl = target.closest<HTMLElement>('.dz-bar:not(.dz-bar--bg), .dz-dg__item');
    if (barEl) {
      const seg = segmentByKey(barEl.dataset['segment'] ?? '');
      // A cell's item is hidden: the menu opens under its cell, and the focus comes back to it.
      const anchor = barEl.matches('.dz-dg__item') ? (barEl.closest<HTMLElement>('.dz-dg__cell') ?? barEl) : barEl;
      return seg ? { target: { kind: 'event', instance: seg.instance }, anchor, focus: barEl.matches('.dz-dg__item') ? barEl : focusTarget(barEl) } : null;
    }
    const cell = target.closest<HTMLElement>('.dz-dg__cell');
    if (!cell) return null;
    const resource = cell.dataset['resource'];
    return { target: { kind: 'day', date: Temporal.PlainDate.from(cell.dataset['date']!), ...(resource !== undefined && { resourceId: resource }) }, anchor: cell };
  });

  return {
    element: root,
    body,
    surface: surface as InteractionSurface,
    render(next, s) {
      // Set before drawing: the rows read the new model's lanes.
      sections = multi
        ? (next as MonthsModel).months.map((x) => ({ key: x.month.toString().slice(0, 7), model: x.model, month: x.month }))
        : [{ key: '', model: next as DayGridModel, month: null }];
      state = s;
      created = [];
      const focused = root.contains(doc.activeElement);
      root.setAttribute('aria-label', s.title);
      // The cursor stays on its day while it is shown; otherwise today, or the period's first day.
      if (!cursorDate || !shownDates().some((d) => d.equals(cursorDate!))) {
        cursorDate = homeDate();
        cursorResource = sections[0]?.model.resourceHeads[0]?.resource.id;
      }
      // Resources changed under the cursor: the first one's cell.
      const heads = sections[0]?.model.resourceHeads ?? [];
      if (heads.length === 0) cursorResource = undefined;
      else if (!heads.some((x) => x.resource.id === cursorResource)) cursorResource = heads[0]!.resource.id;
      root.classList.toggle('dz-dg--month', s.view.alignment === 'month' || multi);
      if (multi) {
        // A crowded year draws the months near the cursor's first; the rest wake as they come near the screen.
        // Asleep only once a month's real height is known: before, an asleep month would collapse.
        if (crowdedYear() && monthHeight > 0) {
          const cursorMonth = (cursorDate ?? s.date).toString().slice(0, 7);
          const at = Math.max(0, sections.findIndex((x) => x.key === cursorMonth));
          sections.forEach((x, i) => (Math.abs(i - at) > 3 ? asleep.add(x.key) : asleep.delete(x.key)));
        } else asleep.clear();
        months.sync(sections.map((x) => ({ key: x.key, sig: `${idOf(x.model)}|${s.today.toString()}|${ctx.epoch}|${asleep.has(x.key)}`, section: x })));
        // A new year (or a first one) opens on the month of its date, as a month view would show it.
        const year = s.range.activeStart.toString();
        if (year !== shownYear) {
          shownYear = year;
          const target = months.get((cursorDate ?? s.date).toString().slice(0, 7));
          const first = sections[0] ? months.get(sections[0].key) : undefined;
          if (target && first) {
            ctx.scheduler.schedule({
              read: () => target.offsetTop - first.offsetTop,
              write: (top) => {
                body.scrollTop = Math.max(0, top);
                wake();
              },
            });
          } else wake();
        } else wake();
      }
      else {
        const m = sections[0]!.model;
        resourceHeads.sync(m.resourceHeads, m.groupHeads, ctx.epoch);
        emptyNote(m.options.resources !== undefined && m.options.resources.length === 0);
        weekdayHead(weekdaysHost, m);
        root.style.setProperty('--dz-cols', String(m.weeks[0]?.dates.length ?? 7));
        created.push(...weeks.sync(weekItems(sections[0]!)));
      }
      const live = new Set(sections.flatMap((x) => weekItems(x).map((w) => w.key)));
      for (const key of parts.keys()) if (!live.has(key)) parts.delete(key);
      // A cell whose content did not change was not redrawn: the tab stop is set on all of them.
      rove(cursorDate, cursorResource);
      // The focused day went away (hidden days changed): the focus goes to the cursor's day, not to the page.
      if (focused && !root.contains(doc.activeElement) && cursorDate) cellOf(cursorDate, cursorResource)?.focus();
      return created;
    },
    tick() {
      /* today moves through kernel.refreshToday → a new state → render */
    },
    relayout() {
      // Another width: months have another height; asleep ones take the new one when measured.
      monthHeight = 0;
      wake();
    },
    destroy() {
      for (const p of parts.values()) p.bars.clear();
      resourceHeads.clear();
      weeks.clear();
      months.clear();
      parts.clear();
      root.remove();
    },
  };
}

registerView('dayGrid', createDayGridView);
