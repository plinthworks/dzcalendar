import { formatTemporal, registerModelFamily } from '@dzcalendar/core';
import type { CalEvent, Command, EventInstance, KernelState, Segment } from '@dzcalendar/core';
import { buildListModel } from '@dzcalendar/core/views';
import type { ListDay, ListEntry, ListModel } from '@dzcalendar/core/views';
import { KeyedList, NodePool, altDate, RowWindow, onScrollFrame, applyEventLook, attachMenuTriggers, dayStates, drawNow, decorate, ensureStyles, written, fillEvent, formatMinutes, h, holder, registerView, startReadingOf, timeLabels, undecorateAll, unmountEvent } from '@dzcalendar/dom/toolkit';
import type { ViewController, ViewCtx } from '@dzcalendar/dom/toolkit';
import { activeIn } from '../focus.js';

/** Layout only; the look comes with the CSS pass. */
export const LIST_CSS = `
@layer dzcalendar.base, dzcalendar.theme;
@layer dzcalendar.base {
.dz-list { container: dz-list / inline-size; flex: 1; min-height: 0; overflow: auto; /* A focused row never under the sticky day head (WCAG 2.4.11). */ scroll-padding-top: var(--dz-list-head, 2.75rem); border: 1px solid var(--dz-border, var(--dzc-border)); border-radius: var(--dz-radius, var(--dzc-radius)); }
.dz-list__head { position: sticky; top: 0; z-index: 1; background-color: Canvas; display: flex; justify-content: space-between; gap: 0.5rem; margin: 0; padding: 0.375rem 0.75rem; font-size: 0.875rem; font-weight: 600; background: var(--dz-bg-raised, var(--dzc-bg-raised)); border-block-end: 1px solid var(--dz-border, var(--dzc-border)); }
.dz-list__date { all: unset; cursor: pointer; display: inline-flex; align-items: center; min-height: var(--dz-target-min, 24px); }
.dz-list__date:focus-visible, .dz-list__ev:focus-visible { outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: -2px; }
.dz-list__len { font-weight: 400; color: var(--dz-fg-muted, var(--dzc-fg-muted)); }
.dz-list__items { list-style: none; margin: 0; padding: 0; }
.dz-list__ev { display: flex; align-items: baseline; gap: 0.75rem; padding: 0.375rem 0.75rem; font-size: 0.875rem; cursor: pointer; border-block-end: 1px solid var(--dz-border, var(--dzc-border)); }
.dz-list__alt { margin-inline-start: 0.5rem; font-weight: 400; color: var(--dz-fg-muted, var(--dzc-fg-muted)); }
.dz-list__time { flex: none; min-inline-size: min(9rem, 35%); color: var(--dz-fg-muted, var(--dzc-fg-muted)); font-variant-numeric: tabular-nums; }
/* Narrow (320 px, a zoom of 400 %): the time on its own line, the title below it, nothing sideways (1.4.10). */
@container dz-list (max-width: 30rem) { .dz-list__ev { flex-wrap: wrap; row-gap: 0.125rem; } .dz-list__time { flex-basis: 100%; min-inline-size: 0; } .dz-list__title { min-width: 0; overflow-wrap: anywhere; } }
.dz-list__time .dz-ev__offset, .dz-list__time .dz-ev__real { color: var(--dz-fg, var(--dzc-fg)); font-size: 0.6875rem; }
.dz-list__dot { flex: none; align-self: center; inline-size: 0.625rem; block-size: 0.625rem; border-radius: 50%; background: var(--dz-event-accent, var(--dzc-accent)); }
.dz-list__empty { padding: 2rem 1rem; text-align: center; color: var(--dz-fg-muted, var(--dzc-fg-muted)); }
.dz-list__gap { list-style: none; }
}
`;

/** What stands for rows not mounted (windowed): their height, nothing else. */
interface GapItem {
  readonly key: string;
  readonly sig: string;
  readonly gap: number;
}

type DayItem = { readonly key: string; readonly sig: string; readonly day: ListDay; readonly index: number } | GapItem;

type EntryItem =
  | {
      readonly key: string;
      readonly sig: string;
      readonly content: string;
      readonly entry: ListEntry;
      /** The day's place in the list, for the hooks' segment. */
      readonly index: number;
      /** Its place among all the period's entries (1-based), and how many, when windowed. */
      readonly pos: number;
      readonly size: number;
    }
  | GapItem;

const isGap = (it: DayItem | EntryItem): it is GapItem => 'gap' in it;

/** Row heights before anything is measured (px); corrected by measuring mounted rows. */
const EST_HEAD = 33;
const EST_ENTRY = 33;

/** The entry as a one-day segment, for the content hooks. */
const segmentOf = (e: ListEntry, index: number): Segment => ({
  key: e.key,
  instance: e.instance,
  dayIndex: index,
  dayCount: 1,
  part: 0,
  startsHere: e.startsHere,
  endsHere: e.endsHere,
  from: e.start ? e.start.toInstant() : (e.instance.event.start as Segment['from']),
  to: e.end ? e.end.toInstant() : (e.instance.event.end as Segment['to']),
});

/**
 * The period as a list of days, each with its events in reading order. One
 * tab stop (roving) over the events; arrows go from event to event, PageUp
 * and PageDown from day to day.
 */
export function createListView(ctx: ViewCtx): ViewController {
  const { doc } = ctx;
  if (ctx.injectStyles) ensureStyles(ctx.popoverElement, 'list', LIST_CSS, ctx.cssLayers);
  const root = h(doc, 'div', 'dz-list');
  /** The view's type, for the hooks' contexts. */
  let viewType = '';
  const body = h(doc, 'div', 'dz-list__body');
  const empty = h(doc, 'p', 'dz-list__empty');
  /** The entries' keys in order at the last render: where a vanished entry stood. */
  let prevOrder: string[] = [];
  root.append(body);
  let model: ListModel | null = null;
  let created: HTMLElement[] = [];
  /** The entry holding the tab stop; `refocus` asks for it to take the focus once drawn. */
  let cursorKey: string | null = null;
  let refocus = false;
  const entryLists = new Map<string, KeyedList<EntryItem>>();
  const byKey = new Map<string, ListEntry>();

  const dayView = () => (ctx.kernel.getViewSpec('timeGridDay') ? 'timeGridDay' : ctx.kernel.getViewSpec('dayGridDay') ? 'dayGridDay' : null);
  const longDate = (day: ListDay) =>
    written(ctx, ctx.formats.listDay, day.date, () => ({ date: day.date, view: viewType, locale: ctx.locale }), () => formatTemporal(day.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, ctx.locale));

  const gapNode = (tag: string) => {
    const g = h(doc, tag, 'dz-list__gap');
    g.setAttribute('aria-hidden', 'true');
    return g;
  };
  const entryPool = new NodePool(() => h(doc, 'div', 'dz-list__ev'));
  const days = new KeyedList<DayItem>(
    body,
    (it) => {
      if (isGap(it)) return gapNode('div');
      const section = h(doc, 'section', 'dz-list__day');
      const head = h(doc, 'h3', 'dz-list__head');
      const items = h(doc, 'ul', 'dz-list__items');
      section.append(head, items);
      entryLists.set(
        it.key,
        new KeyedList<EntryItem>(
          items,
          (e) => {
            if (isGap(e)) return gapNode('li');
            const li = h(doc, 'li', 'dz-list__li');
            const ev = entryPool.take();
            ev.setAttribute('role', 'button');
            li.append(ev);
            return li;
          },
          (li, e, changed) => {
            if (isGap(e)) li.style.height = `${e.gap}px`;
            else {
              if (e.size > 0) {
                li.setAttribute('aria-setsize', String(e.size));
                li.setAttribute('aria-posinset', String(e.pos));
              } else {
                li.removeAttribute('aria-setsize');
                li.removeAttribute('aria-posinset');
              }
              if (changed.content) drawEntry(li.firstElementChild as HTMLElement, e, changed.created);
            }
          },
          (li) => {
            if (!li.classList.contains('dz-list__gap')) unmountEvent(ctx, li.firstElementChild as HTMLElement);
          },
          // The entry's node goes back to the pool: scrolling a long list reuses them.
          (li) => {
            const ev = li.firstElementChild as HTMLElement | null;
            if (ev && !li.classList.contains('dz-list__gap')) entryPool.release(ev);
          },
        ),
      );
      return section;
    },
    (section, it) => {
      if (isGap(it)) section.style.height = `${it.gap}px`;
      else drawDay(section, it);
    },
    (section) => {
      undecorateAll(section);
      const key = section.dataset['key'] ?? '';
      entryLists.get(key)?.clear();
      entryLists.delete(key);
    },
  );

  function drawDay(section: HTMLElement, it: Exclude<DayItem, GapItem>): void {
    const { day } = it;
    section.dataset['date'] = String(day.date);
    dayStates(section, day.date, ctx.kernel.getState().today, false, false, false);
    const head = section.firstElementChild as HTMLElement;
    const view = dayView();
    const date = h(doc, view ? 'button' : 'span', 'dz-list__date', longDate(day));
    // A short heading of the application's ("19/10") is for the eye: the full date is said.
    if (ctx.formats.listDay) date.setAttribute('aria-label', formatTemporal(day.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, ctx.locale));
    if (view) {
      (date as HTMLButtonElement).type = 'button';
      // The events are the list's tab stop; the date is reached by pointer and screen-reader browsing.
      date.tabIndex = -1;
      date.addEventListener('click', () => ctx.kernel.setView(view, day.date));
    }
    head.replaceChildren(date);
    if (ctx.altLocale) head.append(h(doc, 'span', 'dz-list__alt', altDate(day.date, ctx.altLocale).long));
    // A 23- or 25-hour day says how long it really is.
    if (day.lengthMinutes !== 1440) head.append(h(doc, 'span', 'dz-list__len', formatMinutes(day.lengthMinutes, ctx.locale)));
    // A second text at the heading's end, if the application asks for one.
    const side = ctx.formats.listDaySide ? written(ctx, ctx.formats.listDaySide, day.date, () => ({ date: day.date, view: viewType, locale: ctx.locale }), () => '') : '';
    if (side) head.append(h(doc, 'span', 'dz-list__side', side));
    decorate(ctx, ctx.hooks.listDayHeader, head, { view: viewType, date: day.date, lengthMinutes: day.lengthMinutes, text: longDate(day) });
  }

  /** The hours of the part on this day, with offsets where a repeated hour makes them ambiguous. */
  function labelsOf(e: ListEntry) {
    const ev = e.instance.event;
    if (e.allDay || ev.allDay || !e.start || !e.end) return { text: ctx.messages.allDay, spoken: ctx.messages.allDay, real: '', offset: null };
    const zone = ev.start.timeZoneId;
    const part = { ...ev, start: e.start.withTimeZone(zone), end: e.end.withTimeZone(zone) } as CalEvent;
    const start = startReadingOf(part, ctx.zone);
    const end = startReadingOf({ ...part, start: part.end } as CalEvent, ctx.zone);
    // The real length, said and shown when the clock faces do not tell it (a 25-hour day).
    const realMinutes = (e.end.epochMilliseconds - e.start.epochMilliseconds) / 60_000;
    return timeLabels(ctx, part, { ...(start && { start }), ...(end && { end }), realMinutes });
  }

  function drawEntry(el: HTMLElement, it: Exclude<EntryItem, GapItem>, created: boolean): void {
    const e = it.entry;
    const ev = e.instance.event;
    byKey.set(e.key, e);
    applyEventLook(el, ev, drawNow(ctx));
    el.dataset['segment'] = e.key;
    el.tabIndex = e.key === cursorKey ? 0 : -1;
    const title = ev.title || ctx.messages.untitled;
    const labels = labelsOf(e);
    el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
    const fallback = () => {
      const time = h(doc, 'span', 'dz-list__time', labels.text);
      time.dir = 'ltr';
      if (labels.offset) time.append(h(doc, 'span', 'dz-ev__offset', labels.offset));
      if (labels.real) time.append(h(doc, 'span', 'dz-ev__real', labels.real));
      const dot = h(doc, 'span', 'dz-list__dot');
      dot.setAttribute('aria-hidden', 'true');
      return [time, dot, h(doc, 'span', 'dz-list__title', title)];
    };
    fillEvent(ctx, el, { instance: e.instance, segment: segmentOf(e, it.index), timeText: labels.text, displayZone: ctx.zone, family: 'list' }, fallback, created);
  }

  // ── rows: what is mounted, and where the rest would be ──────────────────
  // Every day heading and every entry is a row, in order. Their heights sit in
  // a PrefixSums: estimated, then measured once mounted. Above the threshold
  // only the rows in the scroller's view (and a view's height on each side) are
  // mounted; gaps of the right height stand for the others.
  interface Row {
    readonly key: string;
    readonly day: number;
    /** -1 for a day's heading, else the entry's index in its day. */
    readonly entry: number;
  }
  let rows: Row[] = [];
  /** An entry key's row, and its place among all entries. */
  const rowOf = new Map<string, number>();
  /** A day heading's row, by date. */
  const headOf = new Map<string, number>();
  const order: string[] = [];
  /** Heights estimated then measured, the visible range, the anchored corrections (shared with the other views). */
  const rw = new RowWindow();
  let windowed = false;
  /** The rows mounted at the last draw, `to` exclusive. */
  let shown = { from: 0, to: 0 };


  function index(m: ListModel): void {
    rows = [];
    rowOf.clear();
    headOf.clear();
    order.length = 0;
    m.days.forEach((d, di) => {
      headOf.set(String(d.date), rows.length);
      rows.push({ key: `head|${d.date}`, day: di, entry: -1 });
      d.entries.forEach((e, ei) => {
        rowOf.set(e.key, rows.length);
        order.push(e.key);
        rows.push({ key: e.key, day: di, entry: ei });
      });
    });
    rw.reset(
      rows.map((r) => r.key),
      (i) => (rows[i]!.entry < 0 ? EST_HEAD : EST_ENTRY),
    );
  }

  /** The rows on screen and a screen's height on each side, from the scroller. */
  /** The scroller's offset and height, read on scroll, on resize, when measuring — not while rendering. */
  let viewTop = 0;
  /** Where the list was scrolled when printing began. */
  let printedAt: number | null = null;
  let viewHeight = -1;
  const readView = () => {
    viewTop = root.scrollTop || 0;
    viewHeight = root.clientHeight || 0;
  };
  function visibleRows(): { from: number; to: number } {
    if (viewHeight < 0) readView(); // the very first time only
    return rw.visible(viewTop, viewHeight);
  }

  /** What stands for rows `[from, to)`: their height. */
  const gapItem = (from: number, to: number): GapItem => {
    const gap = rw.offsetOf(to) - rw.offsetOf(from);
    return { key: `gap|${rows[from]!.key}`, sig: String(gap), gap };
  };

  /** Mounts what the window holds — and always the tab stop, so Tab reaches the list. */
  function draw(): void {
    const m = model;
    if (!m) return;
    const all = order.length;
    windowed = !ctx.printing && all > ctx.virtualizeAbove;
    const range = windowed ? visibleRows() : { from: 0, to: rows.length };
    shown = range;
    const keep = cursorKey !== null ? rowOf.get(cursorKey) : undefined;
    const mounted = (r: number) => (r >= range.from && r < range.to) || r === keep;
    const dayItems: DayItem[] = [];
    let gapFrom = -1;
    const flushGap = (to: number) => {
      if (gapFrom >= 0) dayItems.push(gapItem(gapFrom, to));
      gapFrom = -1;
    };
    const perDay = new Map<number, EntryItem[]>();
    let r = 0;
    m.days.forEach((day, di) => {
      const head = r;
      const end = head + 1 + day.entries.length;
      let any = mounted(head);
      for (let k = head + 1; k < end && !any; k++) any = mounted(k);
      if (!any) {
        if (gapFrom < 0) gapFrom = head;
        r = end;
        return;
      }
      flushGap(head);
      dayItems.push({ key: String(day.date), sig: `${day.lengthMinutes}|${ctx.epoch}`, day, index: di });
      const items: EntryItem[] = [];
      let skip = -1;
      for (let k = head + 1; k < end; k++) {
        if (!mounted(k)) {
          if (skip < 0) skip = k;
          continue;
        }
        if (skip >= 0) items.push(gapItem(skip, k));
        skip = -1;
        const entry = day.entries[k - head - 1]!;
        // Rows before it, less the headings up to its own: its place among the entries.
        const pos = windowed ? k - di : 0;
        items.push({
          key: entry.key,
          sig: `${pos}|${windowed ? all : 0}`,
          content: `${entry.instance.event.revision}|${entry.allDay}|${entry.start}|${entry.end}|${di}|${ctx.epoch}`,
          entry,
          index: di,
          pos,
          size: windowed ? all : 0,
        });
      }
      if (skip >= 0) items.push(gapItem(skip, end));
      perDay.set(di, items);
      r = end;
    });
    flushGap(rows.length);
    days.sync(dayItems);
    for (const [di, items] of perDay) {
      const list = entryLists.get(String(m.days[di]!.date));
      if (list) created.push(...list.sync(items).flatMap((li) => (li.classList.contains('dz-list__gap') ? [] : [li.firstElementChild as HTMLElement])));
    }
    if (windowed) scheduleMeasure();
  }

  // ── measuring: estimates corrected, the first visible row kept in place ──
  let measuring = false;
  function scheduleMeasure(): void {
    if (measuring) return;
    measuring = true;
    ctx.scheduler.schedule({
      read: () => {
        measuring = false;
        const found: [number, number][] = [];
        for (const n of body.querySelectorAll<HTMLElement>('.dz-list__head, .dz-list__li')) {
          const r = n.matches('h3') ? headOf.get((n.parentElement as HTMLElement).dataset['date'] ?? '') : rowOf.get((n.firstElementChild as HTMLElement).dataset['segment'] ?? '');
          const size = n.getBoundingClientRect().height;
          if (r !== undefined && size > 0) found.push([r, size]);
        }
        return { found, top: root.scrollTop };
      },
      write: ({ found, top }) => {
        // What moves above the row at the top moves the scroll as much: that row stays put.
        const next = rw.measure(found, top);
        if (next === null) return;
        root.scrollTop = next;
        viewTop = next;
        draw();
      },
    });
  }

  // Scrolling re-windows once a frame.
  onScrollFrame(ctx.scope, root, () => windowed, () => {
    readView();
    const next = visibleRows();
    if (next.from !== shown.from || next.to !== shown.to) draw();
  });

  /** Brings an entry into the window (scrolling to it), mounted now. */
  function reveal(key: string): HTMLElement | null {
    const r = rowOf.get(key);
    if (r === undefined) return null;
    if (windowed) {
      const top = rw.offsetOf(r);
      const bottom = top + rw.sizeOf(r);
      const view = root.clientHeight || 0;
      // Under the sticky heading of its day: one heading's height of room above.
      if (top - EST_HEAD < root.scrollTop) root.scrollTop = Math.max(0, top - EST_HEAD);
      else if (bottom > root.scrollTop + view) root.scrollTop = bottom - view;
      cursorKey = key;
      draw();
    }
    return entries().find((n) => n.dataset['segment'] === key) ?? null;
  }

  // ── what the person does ──────────────────────────────────────────────
  const entries = () => [...body.querySelectorAll<HTMLElement>('.dz-list__ev')];
  const instanceOf = (el: Element | null): { el: HTMLElement; instance: EventInstance } | null => {
    const node = el?.closest<HTMLElement>('.dz-list__ev');
    const e = node ? byKey.get(node.dataset['segment'] ?? '') : undefined;
    return node && e ? { el: node, instance: e.instance } : null;
  };

  function rove(key: string | null, focus: boolean): void {
    const prev = cursorKey;
    cursorKey = key;
    // The tab stop is always mounted: windowed, a new one may need drawing.
    if (windowed && key && key !== prev && !entries().some((n) => n.dataset['segment'] === key)) draw();
    for (const n of entries()) n.tabIndex = n.dataset['segment'] === key ? 0 : -1;
    if (focus && key) (reveal(key) ?? entries().find((n) => n.dataset['segment'] === key))?.focus();
  }

  const activate = (instance: EventInstance) => {
    const live = ctx.live();
    if (live.onEventClick) live.onEventClick(instance);
    else live.onEventOpen?.(instance);
  };

  const undoKey = () => (ctx.live().keyboardUndo === false ? '' : /Mac|iPhone|iPad/.test(doc.defaultView?.navigator.platform ?? '') ? '⌘Z' : 'Ctrl+Z');

  async function remove(instance: EventInstance, node: HTMLElement): Promise<void> {
    if (ctx.live().editable !== true) return ctx.announce(ctx.messages.notEditable);
    const ev = instance.event;
    let command: Command = { type: 'event.delete', id: ev.id };
    if (ev.ref) {
      const r = node.getBoundingClientRect();
      const scope = await ctx.chooseScope({ instance, kind: 'delete' }, { x: r.left, y: r.bottom });
      if (!scope || ctx.scope.isDisposed) return;
      command = { type: 'event.delete', id: ev.ref.seriesId, key: ev.ref.key, scope };
    }
    // The focus goes on to the next event (or the one before) once this one is gone — in the
    // period's order, mounted or not.
    const at = order.indexOf(node.dataset['segment'] ?? '');
    const next = order[at + 1] ?? order[at - 1] ?? null;
    const result = ctx.kernel.run(command, { validate: true });
    if (!result.ok) return ctx.refused(result, command);
    ctx.announce(ctx.messages.eventDeleted({ title: ev.title || ctx.messages.untitled, undo: undoKey() }));
    cursorKey = next;
    refocus = true;
    // Drawn already if the store change painted at once; otherwise at the next render.
    if (cursorKey && byKey.has(cursorKey)) {
      refocus = false;
      rove(cursorKey, true);
    }
  }

  ctx.scope.on(root, 'click', (e) => {
    const hit = instanceOf(e.target as Element);
    if (!hit) return;
    rove(hit.el.dataset['segment'] ?? null, false);
    activate(hit.instance);
  });
  ctx.scope.on(root, 'focusin', (e) => {
    const hit = instanceOf(e.target as Element);
    if (hit && hit.el.dataset['segment'] !== cursorKey) rove(hit.el.dataset['segment'] ?? null, false);
  });
  ctx.scope.on(root, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    const hit = instanceOf(ke.target as Element);
    if (!hit || ke.altKey || ke.ctrlKey || ke.metaKey || !model) return;
    // Over the period's entries, mounted or not.
    const at = order.indexOf(hit.el.dataset['segment'] ?? '');
    const dayStart = (dir: 1 | -1) => {
      const r = rowOf.get(order[at]!);
      const day = r === undefined ? -1 : rows[r]!.day;
      for (let d = day + dir; d >= 0 && d < model!.days.length; d += dir) {
        const first = model!.days[d]!.entries[0];
        if (first) return first.key;
      }
      return undefined;
    };
    let to: string | undefined;
    switch (ke.key) {
      case 'ArrowDown':
        to = order[at + 1];
        break;
      case 'ArrowUp':
        to = order[at - 1];
        break;
      case 'Home':
        to = order[0];
        break;
      case 'End':
        to = order[order.length - 1];
        break;
      case 'PageDown':
        to = dayStart(1);
        break;
      case 'PageUp':
        to = dayStart(-1);
        break;
      case 'Enter':
      case ' ':
        ke.preventDefault();
        activate(hit.instance);
        return;
      case 'Delete':
      case 'Backspace':
        ke.preventDefault();
        void remove(hit.instance, hit.el);
        return;
      default:
        return;
    }
    ke.preventDefault();
    if (to) rove(to, true);
  });

  attachMenuTriggers(ctx, root, (target) => {
    const hit = instanceOf(target);
    if (hit) return { target: { kind: 'event', instance: hit.instance }, anchor: hit.el };
    const section = target.closest<HTMLElement>('.dz-list__day');
    const head = target.closest<HTMLElement>('.dz-list__head');
    if (!section || !head || !model) return null;
    const day = model.days.find((d) => String(d.date) === section.dataset['date']);
    return day ? { target: { kind: 'day', date: day.date }, anchor: (head.querySelector<HTMLElement>('.dz-list__date') ?? head) } : null;
  });

  return {
    element: root,
    body,
    render(next: unknown, s: KernelState) {
      const m = next as ListModel;
      viewType = s.view.type;
      decorate(ctx, holder(ctx.hooks.view), root, { view: s.view.type, family: s.view.family, range: s.range, title: s.title });
      model = m;
      created = [];
      root.setAttribute('aria-label', s.title);
      const focused = root.contains(activeIn(root));
      // Printing mounts every row; the window comes back where the reader was.
      if (ctx.printing && printedAt === null) printedAt = root.scrollTop;
      byKey.clear();
      for (const day of m.days) for (const e of day.entries) byKey.set(e.key, e);
      // Windowed, the browser no longer anchors the scroll: the row at the top
      // of the view is the anchor, kept where it is when rows come or go above it.
      const anchor = windowed && rows.length > 0 && !ctx.printing ? (() => {
        const r = rw.rowAt(viewTop);
        return { key: rows[r]!.key, into: viewTop - rw.offsetOf(r), at: r };
      })() : null;
      index(m);
      if (anchor) {
        let r = rows.findIndex((x) => x.key === anchor.key);
        if (r < 0) r = Math.min(anchor.at, rows.length - 1);
        if (r >= 0) {
          const top = Math.max(0, rw.offsetOf(r) + (rows[r]!.key === anchor.key ? anchor.into : 0));
          if (Math.abs(top - viewTop) > 0.5) {
            root.scrollTop = top;
            viewTop = top;
          }
        }
      }
      // The tab stop stays on its entry while it is listed; else on the same event (moved to
      // another day), else at the place it held; else the first.
      if (!cursorKey || !byKey.has(cursorKey)) {
        const all = m.days.flatMap((d) => d.entries);
        const was = prevOrder.indexOf(cursorKey ?? '');
        const instance = cursorKey?.slice(0, cursorKey.lastIndexOf('|'));
        cursorKey = (all.find((e) => e.instance.key === instance) ?? all[Math.min(Math.max(was, 0), all.length - 1)])?.key ?? null;
      }
      prevOrder = [...order];
      draw();
      if (m.days.length === 0) {
        empty.textContent = ctx.messages.noEvents;
        decorate(ctx, ctx.hooks.noEvents, empty, { view: s.view.type, text: ctx.messages.noEvents });
        if (!empty.isConnected) root.append(empty);
      } else {
        decorate(ctx, undefined, empty, null);
        empty.remove();
      }
      const lost = focused && !root.contains(activeIn(root));
      rove(cursorKey, refocus || lost);
      // Nothing left to focus: the empty message holds it, so it does not fall to the page.
      if (lost && !cursorKey) {
        empty.tabIndex = -1;
        empty.focus();
      }
      refocus = false;
      if (!ctx.printing && printedAt !== null) {
        root.scrollTop = printedAt;
        viewTop = printedAt;
        printedAt = null;
        if (windowed) draw();
      }
      return created;
    },
    relayout() {
      // Another size: the view's height read in a read phase, the window drawn in the write phase.
      ctx.scheduler.schedule({ read: readView, write: () => windowed && draw() });
    },
    tick() {
      /* nothing moves with the minute */
    },
    destroy() {
      undecorateAll(root);
      days.clear();
      root.remove();
    },
  };
}

registerModelFamily<ListModel>('list', {
  build: (range, snap, { displayZone }) => buildListModel(range, snap, { displayZone }),
});
registerView('list', createListView);
