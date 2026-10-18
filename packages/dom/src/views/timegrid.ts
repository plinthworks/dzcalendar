import { Temporal, formatTemporal, locateNow, weekNumber, weekRulesFor } from '@dzcalendar/core';
import type { AllDayBar, AxisBand, Hit, MoreTimed, PlacedSlot, PlacedTimed, PlainDate, Segment, TimeGridColumn, TimeGridModel, ZonedDateTime } from '@dzcalendar/core';
import type { Box, InteractionSurface, KeyboardSurface } from '../interact/surface.js';
import { handles } from '../interact/handles.js';
import type { ViewController, ViewCtx } from '../host.js';
import { registerView } from '../host.js';
import { attachMenuTriggers } from '../menu.js';
import { applyEventLook, fillEvent, formatMinutes, timeLabels, timedContent, unmountEvent } from '../render/event.js';
import { KeyedList, contentsHost, h } from '../render/reconcile.js';
import { onScrollFrame } from '../render/window.js';
import { NodePool } from '../render/pool.js';
import { altDate } from '../render/alt.js';

const HM = { hour: '2-digit', minute: '2-digit' } as const;

/** Stable small ids for model objects: a column whose object did not change is not redrawn. */
const ids = new WeakMap<object, number>();
let nextId = 0;
const idOf = (o: object) => {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = ++nextId));
  return id;
};

interface ColumnItem {
  readonly key: string;
  readonly sig: string;
  readonly column: TimeGridColumn;
  readonly today: boolean;
}

interface EventItem {
  readonly key: string;
  /** Position: written as CSS variables only. */
  readonly sig: string;
  /** Content: the event's revision, its readings, the words in force. */
  readonly content: string;
  readonly placed: PlacedTimed;
}

interface ColumnParts {
  readonly hours: HTMLElement;
  readonly bands: HTMLElement;
  readonly events: KeyedList<EventItem>;
  readonly background: KeyedList<EventItem>;
  readonly more: KeyedList<MoreItem>;
  readonly slots: KeyedList<SlotItem>;
}

interface SlotItem {
  readonly key: string;
  readonly sig: string;
  readonly placed: PlacedSlot;
}

interface MoreItem {
  readonly key: string;
  readonly sig: string;
  readonly more: MoreTimed;
  readonly date: PlainDate;
}

export interface TimeGridController extends ViewController {
  columnFor(key: string): HTMLElement | undefined;
}

export function createTimeGridView(ctx: ViewCtx): TimeGridController {
  const { doc } = ctx;
  const root = h(doc, 'div', 'dz-tg');
  const head = h(doc, 'div', 'dz-tg__row dz-tg__head');
  const corner = h(doc, 'div', 'dz-tg__corner');
  head.append(corner);
  const headsHost = contentsHost(doc, 'dz-tg__heads');
  head.append(headsHost);
  const allday = h(doc, 'div', 'dz-tg__row dz-tg__allday');
  const alldayLabel = h(doc, 'div', 'dz-tg__allday-label');
  const track = h(doc, 'div', 'dz-tg__allday-track');
  allday.append(alldayLabel, track);
  const body = h(doc, 'div', 'dz-tg__body');
  const grid = h(doc, 'div', 'dz-tg__row dz-tg__grid');
  const gutter = h(doc, 'div', 'dz-tg__gutter');
  gutter.setAttribute('aria-hidden', 'true');
  // Columns get their own host after the gutter: a KeyedList owns its container.
  const colsHost = contentsHost(doc, 'dz-tg__cols');
  grid.append(gutter, colsHost);
  body.append(grid);
  root.append(head, allday, body);

  let model: TimeGridModel | null = null;
  let gutterEpoch = -1;
  const parts = new Map<string, ColumnParts>();
  let nowEl: HTMLElement | null = null;
  let created: HTMLElement[] = [];

  // ── headers ────────────────────────────────────────────────────────────────
  const heads = new KeyedList<ColumnItem>(
    headsHost,
    () => h(doc, 'div', 'dz-tg__dayhead'),
    (el, it) => {
      const { date, axis } = it.column;
      // Seen, not read: each column's group says its day (and a length other than 24 h) itself.
      el.setAttribute('aria-hidden', 'true');
      el.classList.toggle('dz-tg__dayhead--today', it.today);
      el.replaceChildren(
        h(doc, 'span', 'dz-tg__dayhead-weekday', formatTemporal(date, { weekday: 'short' }, ctx.locale)),
        h(doc, 'span', 'dz-tg__dayhead-date', formatTemporal(date, { day: 'numeric' }, ctx.locale)),
        ...(ctx.altLocale ? [h(doc, 'span', 'dz-tg__dayhead-alt', altDate(date, ctx.altLocale).short)] : []),
      );
      // A day that is not 24 hours long says so where the eye lands first.
      if (axis.day.lengthMinutes !== 1440) {
        el.append(h(doc, 'span', 'dz-tg__dayhead-note', axis.day.lengthMinutes === 0 ? '—' : formatMinutes(axis.day.lengthMinutes, ctx.locale)));
      }
      if (it.today) el.setAttribute('aria-current', 'date');
      else el.removeAttribute('aria-current');
    },
  );

  // ── all-day row ────────────────────────────────────────────────────────────
  interface BarItem {
    readonly key: string;
    readonly sig: string;
    readonly content: string;
    readonly bar: AllDayBar;
    readonly bg: boolean;
  }
  const bars = new KeyedList<BarItem>(
    track,
    () => h(doc, 'div', 'dz-bar'),
    (el, it, changed) => {
      const s = it.bar.segment;
      const ev = s.instance.event;
      el.classList.toggle('dz-bar--bg', it.bg);
      el.classList.toggle('dz-bar--cont-start', !s.startsHere);
      el.classList.toggle('dz-bar--cont-end', !s.endsHere);
      el.style.setProperty('--lane', String(it.bar.lane));
      el.style.setProperty('--col', String(s.dayIndex));
      el.style.setProperty('--span', String(s.dayCount));
      if (!changed.content) return;
      applyEventLook(el, ev);
      handles(el, s, it.bg);
      if (it.bg) {
        el.replaceChildren();
        el.setAttribute('aria-hidden', 'true');
        return;
      }
      const title = ev.title || ctx.messages.untitled;
      fillEvent(ctx, el, { instance: s.instance, segment: s, timeText: ctx.messages.allDay, displayZone: ctx.zone, family: 'timeGrid' }, () => [doc.createTextNode(title)], changed.created);
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: ctx.messages.allDay }));
    },
    (el) => unmountEvent(ctx, el),
  );

  // ── columns ────────────────────────────────────────────────────────────────
  /** Event nodes reused across scrolling and weeks (one pool for every column). */
  const eventPool = new NodePool(() => h(doc, 'div', 'dz-ev'));
  const columns = new KeyedList<ColumnItem>(
    colsHost,
    (it) => {
      const el = h(doc, 'div', 'dz-tg__col');
      el.setAttribute('role', 'group');
      const hours = contentsHost(doc, 'dz-tg__hours');
      const bands = contentsHost(doc, 'dz-tg__bands');
      const bgHost = contentsHost(doc, 'dz-tg__bg');
      const slotHost = contentsHost(doc, 'dz-tg__slots');
      const evHost = contentsHost(doc, 'dz-tg__events');
      const moreHost = contentsHost(doc, 'dz-tg__mores');
      el.append(hours, bands, bgHost, slotHost, evHost, moreHost);
      parts.set(it.key, {
        hours,
        bands,
        events: new KeyedList<EventItem>(evHost, () => eventPool.take(), (n, e, c) => drawEvent(n, e.placed, false, c), (n) => unmountEvent(ctx, n), (n) => eventPool.release(n)),
        background: new KeyedList<EventItem>(bgHost, () => h(doc, 'div', 'dz-ev dz-ev--bg'), (n, e, c) => drawEvent(n, e.placed, true, c)),
        more: new KeyedList<MoreItem>(
          moreHost,
          () => {
            const b = h(doc, 'button', 'dz-more dz-more--tg') as HTMLButtonElement;
            b.type = 'button';
            b.addEventListener('click', () => {
              const m = moreOf.get(b);
              if (m) openMoreTimed(b, m.more, m.date);
            });
            return b;
          },
          (b, m) => drawMore(b, m),
        ),
        // Free slots: buttons out of the tab order (the grid keeps one tab stop; the cursor's Enter books them).
        slots: new KeyedList<SlotItem>(
          slotHost,
          () => {
            const b = h(doc, 'button', 'dz-slot') as HTMLButtonElement;
            b.type = 'button';
            b.tabIndex = -1;
            b.addEventListener('click', () => {
              const placed = slotOf.get(b);
              if (placed) ctx.live().onSlotClick?.(placed.slot);
            });
            return b;
          },
          (b, it) => drawSlot(b, it.placed),
        ),
      });
      return el;
    },
    (el, it) => drawColumn(el, it),
    // A column leaving (navigation) takes its events' hooks with it.
    (el) => {
      const p = parts.get(el.dataset['date'] ?? '');
      p?.events.clear();
      p?.background.clear();
      p?.more.clear();
      p?.slots.clear();
    },
  );

  function drawColumn(el: HTMLElement, it: ColumnItem): void {
    const { column } = it;
    const p = parts.get(it.key)!;
    el.dataset['date'] = column.key;
    const name = formatTemporal(column.date, { weekday: 'long', day: 'numeric', month: 'long' }, ctx.locale) + (ctx.altLocale ? ` (${altDate(column.date, ctx.altLocale).long})` : '');
    const length = column.axis.day.lengthMinutes;
    el.setAttribute('aria-label', length === 1440 ? name : length === 0 ? `${name}, ${ctx.messages.dayDoesNotExist}` : `${name}, ${formatMinutes(length, ctx.locale)}`);
    el.classList.toggle('dz-tg__col--today', it.today);
    el.classList.toggle('dz-tg__col--folded', column.folded);
    el.style.setProperty('--dz-len', String(column.axis.length));
    if (column.folded) {
      p.hours.replaceChildren();
      p.bands.replaceChildren(h(doc, 'span', 'dz-tg__folded-label', ctx.messages.dayDoesNotExist));
      p.events.sync([]);
      p.background.sync([]);
      p.slots.sync([]);
      return;
    }
    // Hour lines fall on the wall clock's hours: a grid from 08:30 starts half an hour before the first one.
    el.style.setProperty('--dz-line-offset', String((60 - column.axis.start.toZonedDateTimeISO(ctx.zone).minute) % 60));
    p.hours.replaceChildren(
      ...column.offHours.map((o) => {
        const x = h(doc, 'div', 'dz-off');
        x.style.setProperty('--t', String(o.top));
        x.style.setProperty('--h', String(o.height));
        x.setAttribute('aria-hidden', 'true');
        return x;
      }),
    );
    p.bands.replaceChildren(...column.axis.bands.map((b) => drawBand(b)));
    p.background.sync(column.background.map(itemOf));
    p.slots.sync(column.slots.map((placed) => ({ key: placed.key, sig: `${placed.top}|${placed.height}|${placed.end.epochMilliseconds}|${ctx.epoch}`, placed })));
    created.push(...p.events.sync(shown(column).map(itemOf)));
    p.more.sync(column.more.map((m) => ({ key: m.key, sig: `${m.top}|${m.height}|${m.left}|${m.width}|${m.events.length}|${ctx.epoch}`, more: m, date: column.date })));
  }

  // ── free slots (availableSlots) ──
  const slotOf = new WeakMap<HTMLElement, PlacedSlot>();
  function drawSlot(b: HTMLElement, placed: PlacedSlot): void {
    slotOf.set(b, placed);
    b.style.setProperty('--t', String(placed.top));
    b.style.setProperty('--h', String(placed.height));
    const from = formatTemporal(placed.start.toZonedDateTimeISO(ctx.zone).toPlainTime(), HM, ctx.locale);
    const to = formatTemporal(placed.end.toZonedDateTimeISO(ctx.zone).toPlainTime(), HM, ctx.locale);
    b.textContent = from;
    b.setAttribute('aria-label', ctx.messages.freeSlot({ time: `${from}–${to}` }));
  }

  // ── "+N": a crowded cluster's hidden events, listed in the panel the month uses ──
  const moreOf = new WeakMap<HTMLElement, MoreItem>();
  /** The events of the open panel, by key: what its clicks and menu resolve. */
  let panelEvents = new Map<string, PlacedTimed>();
  function drawMore(b: HTMLElement, m: MoreItem): void {
    moreOf.set(b, m);
    b.style.setProperty('--t', String(m.more.top));
    b.style.setProperty('--h', String(m.more.height));
    b.style.setProperty('--l', String(m.more.left));
    b.style.setProperty('--w', String(m.more.width));
    b.textContent = ctx.messages.moreLink({ count: m.more.events.length });
    const first = m.more.events[0]!.segment.from.toZonedDateTimeISO(ctx.zone);
    const when = `${formatTemporal(m.date, { weekday: 'long', day: 'numeric', month: 'long' }, ctx.locale)}, ${formatTemporal(first.toPlainTime(), HM, ctx.locale)}`;
    b.setAttribute('aria-label', ctx.messages.moreLabel({ count: m.more.events.length, date: when }));
  }
  function openMoreTimed(link: HTMLElement, more: MoreTimed, date: PlainDate): void {
    panelEvents = new Map(more.events.map((p) => [p.segment.key, p]));
    const nodes = more.events.map((p) => {
      const ev = p.segment.instance.event;
      const item = h(doc, 'div', 'dz-bar dz-bar--in-popover');
      applyEventLook(item, ev);
      item.dataset['segment'] = p.segment.key;
      const title = ev.title || ctx.messages.untitled;
      const labels = timeLabels(ctx, ev, { ...(p.startReading && { start: p.startReading }), ...(p.endReading && { end: p.endReading }) });
      fillEvent(ctx, item, { instance: p.segment.instance, segment: p.segment, timeText: labels.text, displayZone: ctx.zone, family: 'timeGrid' }, () => [h(doc, 'span', 'dz-bar__time', labels.text), doc.createTextNode(` ${title}`)], true);
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
      return item;
    });
    ctx.openMore(link, formatTemporal(date, { weekday: 'long', day: 'numeric', month: 'long' }, ctx.locale), nodes, () => {
      for (const n of nodes) unmountEvent(ctx, n);
    });
  }
  const panelEvent = (target: EventTarget | null) => {
    const item = (target as Element | null)?.closest<HTMLElement>('.dz-bar');
    return item ? panelEvents.get(item.dataset['segment'] ?? '') : undefined;
  };
  ctx.scope.on(ctx.popoverElement, 'click', (e) => {
    const p = panelEvent(e.target);
    if (p) ctx.live().onEventClick?.(p.segment.instance);
  });
  ctx.scope.on(ctx.popoverElement, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key !== 'Enter' && ke.key !== ' ') return;
    const p = panelEvent(ke.target);
    if (!p) return;
    ke.preventDefault();
    ctx.live().onEventClick?.(p.segment.instance);
  });
  attachMenuTriggers(ctx, ctx.popoverElement, (target) => {
    const item = target.closest<HTMLElement>('.dz-bar');
    const p = item ? panelEvents.get(item.dataset['segment'] ?? '') : undefined;
    return item && p ? { target: { kind: 'event', instance: p.segment.instance }, anchor: item } : null;
  });

  // ── windowing: above `virtualizeAbove` events, only the scrolled hours (and a screen above and below) ──
  /** The minutes of the axis mounted, or null: everything. */
  let win: { from: number; to: number } | null = null;
  /** Mounted whatever the window: the focused event (and one asked for by the keyboard). */
  const kept = new Set<string>();
  const windowed = (m: TimeGridModel | null) =>
    !ctx.printing && m !== null && m.columns.reduce((n, c) => n + c.events.length, 0) > ctx.virtualizeAbove;
  const shown = (column: TimeGridColumn) =>
    !win ? column.events : column.events.filter((e) => kept.has(e.segment.key) || (e.top < win!.to && e.top + e.visualHeight > win!.from));
  /** The window for the current scroll, in steps of half a screen (so a scroll of a few pixels mounts nothing). */
  function windowNow(m: TimeGridModel): { from: number; to: number } | null {
    const col = m.columns.find(usable);
    const px = col ? pxOf(col) : 0;
    const view = body.clientHeight;
    if (px <= 0 || view <= 0) return null; // no layout (jsdom, hidden): everything
    const step = view / 2 / px;
    const top = body.scrollTop / px;
    const from = Math.floor((top - view / px) / step) * step;
    const to = Math.ceil((top + 2 * view / px) / step) * step;
    return { from, to };
  }
  /** Mounts what the window now covers; true when it moved. */
  function rewindow(force = false, measured?: { from: number; to: number } | null): boolean {
    if (!model) return false;
    const was = win;
    const next = windowed(model) ? (measured !== undefined ? measured : windowNow(model)) : null;
    if (!force && (next === was || (next && was && next.from === was.from && next.to === was.to))) return false;
    win = next;
    for (const column of model.columns) {
      if (column.folded) continue;
      parts.get(column.key)?.events.sync(shown(column).map(itemOf));
    }
    return true;
  }
  onScrollFrame(ctx.scope, body, () => windowed(model), () => measureWindow());
  /** The window read in a read phase, mounted in the write phase that follows. */
  function measureWindow(): void {
    ctx.scheduler.schedule({
      read: () => (model && windowed(model) ? windowNow(model) : null),
      write: (next) => rewindow(win === null || win.to < win.from, next),
    });
  }
  ctx.scope.on(root, 'focusin', (e) => {
    const key = (e.target as HTMLElement | null)?.closest<HTMLElement>('.dz-ev')?.dataset['key'];
    kept.clear();
    if (key) kept.add(key);
  });

  function drawBand(b: AxisBand): HTMLElement {
    const el = h(doc, 'div', `dz-band dz-band--${b.kind}`);
    el.style.setProperty('--t', String(b.from));
    el.style.setProperty('--h', String(b.to - b.from));
    const [a, z] = b.kind === 'gap' ? [b.transition.wallBefore, b.transition.wallAfter] : [b.transition.wallAfter, b.transition.wallBefore];
    const words = { from: formatTemporal(a.toPlainTime(), HM, ctx.locale), to: formatTemporal(z.toPlainTime(), HM, ctx.locale) };
    el.textContent = b.kind === 'gap' ? ctx.messages.gapBand(words) : ctx.messages.repeatBand(words);
    el.setAttribute('role', 'note');
    return el;
  }

  const itemOf = (placed: PlacedTimed): EventItem => ({
    key: placed.segment.key,
    sig: [placed.top, placed.visualHeight, placed.left, placed.width, placed.z].join('|'),
    content: [
      placed.segment.instance.event.revision,
      placed.segment.startsHere,
      placed.segment.endsHere,
      placed.startReading?.pass ?? '',
      placed.endReading?.pass ?? '',
      placed.realMinutes ?? '',
      ctx.epoch,
    ].join('|'),
    placed,
  });

  function drawEvent(el: HTMLElement, p: PlacedTimed, bg: boolean, changed: { pos: boolean; content: boolean; created: boolean }): void {
    if (changed.pos) {
      el.style.setProperty('--t', String(p.top));
      el.style.setProperty('--h', String(p.visualHeight));
      el.style.setProperty('--l', String(p.left));
      el.style.setProperty('--w', String(p.width));
      el.style.zIndex = bg ? '' : String(1 + p.z);
    }
    if (!changed.content) return;
    const seg = p.segment;
    const ev = seg.instance.event;
    el.classList.toggle('dz-ev--cont-start', !seg.startsHere);
    el.classList.toggle('dz-ev--cont-end', !seg.endsHere);
    applyEventLook(el, ev);
    handles(el, seg, bg);
    if (bg || ev.allDay) {
      el.replaceChildren();
      el.setAttribute('aria-hidden', 'true');
      return;
    }
    const labels = timeLabels(ctx, ev, {
      ...(p.startReading && { start: p.startReading }),
      ...(p.endReading && { end: p.endReading }),
      ...(p.realMinutes !== undefined && { realMinutes: p.realMinutes }),
    });
    const title = ev.title || ctx.messages.untitled;
    fillEvent(ctx, el, { instance: seg.instance, segment: seg, timeText: labels.text, displayZone: ctx.zone, family: 'timeGrid' }, () => timedContent(ctx, labels, title, seg.startsHere), changed.created);
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
  }

  function drawGutter(m: TimeGridModel): void {
    const first = m.columns.find((c) => !c.folded);
    gutter.style.setProperty('--dz-len', String(first ? first.axis.length : 0));
    gutter.replaceChildren(
      ...m.gutter.map((t) => {
        const el = h(doc, 'span', 'dz-tick', t.major ? formatTemporal(t.label, HM, ctx.locale) : '');
        el.style.setProperty('--t', String(t.position));
        return el;
      }),
    );
  }

  // ── keyboard: a cursor on the grid, drawn where a pointer would hit ───────
  // One focusable node, replaced on each move (focus moving is what screen
  // readers say reliably). Placed in the grid by `grid-column`, so it scrolls
  // with the hours and needs no measuring. Until it has a place it rests in
  // the all-day row: tabbing to it scrolls nothing, and it is then put at
  // the hour in view.
  const cursorHits = new WeakMap<Element, Hit>();
  let cursorNode = h(doc, 'div', 'dz-cursor');
  cursorNode.tabIndex = 0;
  cursorNode.setAttribute('role', 'button');
  cursorNode.setAttribute('aria-label', ctx.messages.timeSlots);
  // An absolutely placed grid child: its end line must be named, `auto` would run to the grid's edge.
  cursorNode.style.gridColumn = '2 / span 1';
  allday.prepend(cursorNode);

  const columnOf = (date: PlainDate) => model?.columns.find((c) => c.key === date.toString());
  const snapMs = () => Math.max(1, ctx.snapMinutes) * 60_000;
  /** The minutes-to-pixels scale of a drawn column (one layout read). */
  const pxOf = (col: TimeGridColumn) => {
    const el = columns.get(col.key);
    return el && col.axis.length > 0 ? el.getBoundingClientRect().height / col.axis.length : 0;
  };
  /** The slot at a position of a column; in a skipped hour, the first moment after it. */
  const slotAt = (col: TimeGridColumn, minutes: number): Hit => {
    const p = Math.max(0, Math.min(col.axis.length - ctx.snapMinutes, minutes));
    const at = col.axis.fromPosition(p);
    const band = at.exists ? undefined : col.axis.bands.find((b) => b.kind === 'gap' && p >= b.from && p < b.to);
    return { kind: 'slot', date: col.date, instant: band ? col.axis.fromPosition(band.to).instant : at.instant };
  };
  /** The first slot below the top of the scrolled hours. */
  const topSlot = (col: TimeGridColumn): Hit | null => {
    if (col.folded || col.axis.length === 0) return null;
    const px = pxOf(col);
    const snap = Math.max(1, ctx.snapMinutes);
    return slotAt(col, px > 0 ? Math.ceil(body.scrollTop / px / snap) * snap : 0);
  };
  const usable = (c: TimeGridColumn) => !c.folded && c.axis.length > 0;

  const keys: KeyboardSurface = {
    allDayRow: true,
    home() {
      const cols = model?.columns ?? [];
      const today = ctx.kernel.getState().today;
      const col = cols.find((c) => c.date.equals(today) && usable(c)) ?? cols.find(usable);
      return col ? topSlot(col) : null;
    },
    fit(hit) {
      const cols = model?.columns ?? [];
      if (cols.length === 0) return null;
      const col = columnOf(hit.date);
      if (!col) {
        const st = ctx.kernel.getState();
        // A hidden weekday, wherever it is: null, and the keyboard steps on past it (a day view: Friday → Monday).
        if (st.view.hiddenDays.includes(hit.date.dayOfWeek as never)) return null;
        const r = st.range;
        if (Temporal.PlainDate.compare(hit.date, r.start) < 0) return 'prev';
        // A hidden day inside the period: null, and the keyboard steps on past it.
        return Temporal.PlainDate.compare(hit.date, r.end) >= 0 ? 'next' : null;
      }
      if (hit.kind === 'day') return hit.allDayRow ? hit : { kind: 'day', date: hit.date, allDayRow: true };
      if (!usable(col)) return null;
      const s = col.axis.start.epochMilliseconds;
      const last = Math.max(s, col.axis.end.epochMilliseconds - snapMs());
      const ms = Math.max(s, Math.min(last, hit.instant.epochMilliseconds));
      return ms === hit.instant.epochMilliseconds ? hit : { kind: 'slot', date: hit.date, instant: Temporal.Instant.fromEpochMilliseconds(ms) };
    },
    showCursor(hit, label) {
      const cols = model?.columns ?? [];
      const index = cols.findIndex((c) => c.date.equals(hit.date));
      if (index < 0) return;
      const node = h(doc, 'div', 'dz-cursor');
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', label);
      node.style.gridColumn = `${index + 2} / span 1`;
      if (hit.kind === 'slot') {
        const axis = cols[index]!.axis;
        const top = axis.toPosition(hit.instant);
        const end = axis.toEndPosition(Temporal.Instant.fromEpochMilliseconds(hit.instant.epochMilliseconds + snapMs()));
        node.style.setProperty('--t', String(top));
        node.style.setProperty('--h', String(Math.max(end - top, 1)));
        // First in the grid: in the tab order before the hours' events.
        grid.prepend(node);
      } else {
        allday.prepend(node);
      }
      cursorHits.set(node, hit);
      const old = cursorNode;
      cursorNode = node;
      node.focus();
      old.remove();
    },
    isCursor: (el) => el === cursorNode,
    cursorAt: (el) => (el === cursorNode ? (cursorHits.get(el) ?? null) : null),
    lineEdge(hit, edge) {
      const cols = model?.columns ?? [];
      if (hit.kind === 'day') {
        const col = edge === 'start' ? cols[0] : cols[cols.length - 1];
        return col ? { kind: 'day', date: col.date, allDayRow: true } : hit;
      }
      const col = columnOf(hit.date);
      if (!col || !usable(col)) return hit;
      return edge === 'start' ? slotAt(col, 0) : slotAt(col, col.axis.length);
    },
    itemsAt: () => [],
    itemsAround(node) {
      const host = node.closest('.dz-tg__col, .dz-tg__allday-track');
      return host ? [...host.querySelectorAll<HTMLElement>('[data-event-id][tabindex]')] : [];
    },
    nodeFor(eventId, date) {
      // Out of the window: mounted for the keyboard (and kept while it has the focus).
      if (win && model) {
        for (const c of model.columns) for (const e of c.events) if (e.segment.instance.event.id === eventId) kept.add(e.segment.key);
        rewindow(true);
      }
      const all = [...root.querySelectorAll<HTMLElement>('[data-event-id][tabindex]')].filter((n) => n.dataset['eventId'] === eventId);
      // Behind "+N": the link that holds it takes the focus.
      if (all.length === 0) {
        const link = [...root.querySelectorAll<HTMLElement>('.dz-more--tg')].find((b) => moreOf.get(b)?.more.events.some((p) => p.segment.instance.event.id === eventId));
        if (link) return link;
      }
      if (date) {
        const inColumn = all.find((n) => n.closest<HTMLElement>('.dz-tg__col')?.dataset['date'] === date.toString());
        if (inColumn) return inColumn;
      }
      return all[0] ?? null;
    },
    cursorFor(node) {
      const inst = model ? findSegment(model, node.dataset['key'] ?? '')?.instance : undefined;
      const colEl = node.closest<HTMLElement>('.dz-tg__col');
      const col = colEl ? model?.columns.find((c) => c.key === colEl.dataset['date']) : undefined;
      if (col && usable(col)) {
        const start = inst && !inst.event.allDay ? (inst.event.start as ZonedDateTime).toInstant() : col.axis.start;
        const f = keys.fit({ kind: 'slot', date: col.date, instant: start });
        return f && typeof f === 'object' ? f : null;
      }
      // An all-day bar: the first day it shows on.
      const bar = model?.allDay.bars.find((b) => b.segment.key === node.dataset['key']);
      const day = bar ? model?.columns[bar.segment.dayIndex] : undefined;
      return day ? { kind: 'day', date: day.date, allDayRow: true } : null;
    },
    firstSlot(date) {
      const col = columnOf(date);
      return col ? topSlot(col) : null;
    },
    reveal(hit) {
      if (hit.kind !== 'slot') return;
      const col = columnOf(hit.date);
      if (!col || !usable(col)) return;
      const px = pxOf(col);
      if (px <= 0) return;
      const y = col.axis.toPosition(hit.instant) * px;
      const room = ctx.snapMinutes * px * 2;
      if (y - room < body.scrollTop) body.scrollTop = Math.max(0, y - room);
      else if (y + room > body.scrollTop + body.clientHeight) body.scrollTop = y + room - body.clientHeight;
      // What the keyboard looks at is mounted now, not at the next scroll event.
      rewindow();
    },
  };

  // ── gestures: geometry read once per gesture, then arithmetic ─────────────
  interface ColGeo {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly height: number;
    readonly column: TimeGridColumn;
  }
  interface Geo {
    readonly cols: readonly ColGeo[];
    readonly track: { readonly top: number; readonly bottom: number } | null;
    readonly view: { readonly top: number; readonly bottom: number };
    readonly origin: { readonly x: number; readonly y: number };
  }
  const surface: InteractionSurface<Geo> = {
    root,
    scroller: body,
    family: 'timeGrid',
    keys,
    accepts: (target) => target.closest('.dz-tg__col, .dz-tg__allday-track') !== null,
    measure(origin) {
      const m = model;
      const els = [...colsHost.querySelectorAll<HTMLElement>(':scope > .dz-tg__col')];
      const cols: ColGeo[] = [];
      for (const el of els) {
        const column = m?.columns.find((c) => c.key === el.dataset['date']);
        if (!column) continue;
        const r = el.getBoundingClientRect();
        cols.push({ left: r.left, right: r.right, top: r.top, height: r.height, column });
      }
      // In reading order on screen: right to left, the first column in the DOM is the rightmost.
      cols.sort((a, b) => a.left - b.left);
      const t = track.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      return { cols, track: t.height > 0 ? { top: t.top, bottom: t.bottom } : null, view: { top: b.top, bottom: b.bottom }, origin };
    },
    hitAt(geo, x, y, scrollY) {
      const { cols } = geo;
      if (cols.length === 0) return null;
      const cx = Math.max(cols[0]!.left, Math.min(cols[cols.length - 1]!.right - 1, x));
      const c = cols.find((k) => cx >= k.left && cx < k.right) ?? cols[cols.length - 1]!;
      if (geo.track && y >= geo.track.top && y < geo.track.bottom) return { kind: 'day', date: c.column.date, allDayRow: true };
      if (c.column.folded || c.column.axis.length === 0) return null;
      const axis = c.column.axis;
      const cy = Math.max(geo.view.top, Math.min(geo.view.bottom - 1, y));
      const px = c.height / axis.length;
      const minutes = Math.max(0, Math.min(axis.length - 1e-6, (cy - (c.top - scrollY)) / px));
      const at = axis.fromPosition(minutes);
      if (at.exists) return { kind: 'slot', date: c.column.date, instant: at.instant };
      // In a skipped hour: the first moment after it (03:00), flagged so the drop is announced.
      const band = axis.bands.find((x) => x.kind === 'gap' && minutes >= x.from && minutes < x.to);
      return { kind: 'slot', date: c.column.date, instant: band ? axis.fromPosition(band.to).instant : at.instant, gap: true };
    },
    boxesFor(geo, span, scrollY) {
      const o = geo.origin;
      const out: Box[] = [];
      if (span.allDay) {
        if (!geo.track) return out;
        const first = span.start as PlainDate;
        const last = (span.end as PlainDate).subtract({ days: 1 });
        const inside = geo.cols.filter((k) => Temporal.PlainDate.compare(k.column.date, first) >= 0 && Temporal.PlainDate.compare(k.column.date, last) <= 0);
        if (inside.length === 0) return out;
        const h = Math.min(22, geo.track.bottom - geo.track.top - 4);
        const left = Math.min(...inside.map((k) => k.left));
        const right = Math.max(...inside.map((k) => k.right));
        out.push({ x: left - o.x + 2, y: geo.track.top - o.y + 2, w: right - left - 4, h });
        return out;
      }
      const s = (span.start as ZonedDateTime).epochMilliseconds;
      const e = (span.end as ZonedDateTime).epochMilliseconds;
      for (const k of geo.cols) {
        const axis = k.column.axis;
        if (k.column.folded || axis.length === 0) continue;
        const a = Math.max(s, axis.start.epochMilliseconds);
        const b = Math.min(e, axis.end.epochMilliseconds);
        if (a >= b) continue;
        const px = k.height / axis.length;
        const top = axis.toPosition(Temporal.Instant.fromEpochMilliseconds(a)) * px + k.top - scrollY;
        const bottom = axis.toEndPosition(Temporal.Instant.fromEpochMilliseconds(b)) * px + k.top - scrollY;
        // Only inside the scrolling body: a ghost never covers the headers.
        const y0 = Math.max(top, geo.view.top);
        const y1 = Math.min(Math.max(bottom, top + 12), geo.view.bottom);
        if (y1 <= y0) continue;
        out.push({ x: k.left - o.x + 2, y: y0 - o.y, w: k.right - k.left - 6, h: y1 - y0 });
      }
      return out;
    },
    instanceOf(node) {
      if (!model) return null;
      return findSegment(model, node.dataset['key'] ?? '')?.instance ?? null;
    },
  };

  // ── context menu: an event, or the moment under the pointer in a column ────
  attachMenuTriggers(ctx, root, (target, point) => {
    if (!model) return null;
    const evEl = target.closest<HTMLElement>('.dz-ev:not(.dz-ev--bg), .dz-bar:not(.dz-bar--bg)');
    if (evEl) {
      const seg = findSegment(model, evEl.dataset['key'] ?? '');
      return seg ? { target: { kind: 'event', instance: seg.instance }, anchor: evEl } : null;
    }
    // The keyboard's cursor: the very slot (or all-day day) it stands on.
    const cur = keys.cursorAt(target);
    if (cur) {
      if (cur.kind === 'day') return { target: { kind: 'day', date: cur.date }, anchor: target as HTMLElement };
      const c = columnOf(cur.date);
      if (!c) return null;
      const r = c.axis.fromPosition(c.axis.toPosition(cur.instant), { prefer: { offset: cur.instant.toZonedDateTimeISO(ctx.zone).offset } });
      return { target: { kind: 'slot', date: cur.date, instant: cur.instant, exists: true, ambiguous: r.ambiguous, alternative: r.ambiguous ? (r.instant.equals(cur.instant) ? r.alternative : r.instant) : null }, anchor: target as HTMLElement };
    }
    const colEl = target.closest<HTMLElement>('.dz-tg__col');
    if (!colEl) return null;
    const col = model.columns.find((c) => c.key === colEl.dataset['date']);
    if (!col || col.folded) return null;
    // A pointer gives a moment; the keyboard gives the column's first hour.
    let minutes = 0;
    if (point) {
      const rect = colEl.getBoundingClientRect();
      const px = col.axis.length > 0 ? rect.height / col.axis.length : 0;
      minutes = px > 0 ? (point.y - rect.top) / px : 0;
    }
    // On the slot grid: a right-click at 10:37 means the 10:30 slot.
    const snap = ctx.snapMinutes > 0 ? ctx.snapMinutes : 1;
    const snapped = Math.floor(minutes / snap) * snap;
    const at = col.axis.fromPosition(Math.max(0, Math.min(col.axis.length, snapped)));
    return {
      target: { kind: 'slot', date: col.date, instant: at.instant, exists: at.exists, ambiguous: at.ambiguous, alternative: at.alternative },
      anchor: colEl,
    };
  });

  return {
    element: root,
    body,
    surface: surface as InteractionSurface,

    render(next, state) {
      const m = next as TimeGridModel;
      created = [];
      const epoch = ctx.epoch;
      const cols = m.columns.map((column): ColumnItem => ({ key: column.key, sig: `${idOf(column)}|${epoch}`, column, today: column.date.equals(state.today) }));
      root.style.setProperty('--dz-cols', String(m.columns.length));
      alldayLabel.textContent = ctx.messages.allDay;
      // The week's number in the corner (the head is drawn, not read: the columns say their dates).
      const first = m.columns[0]?.date;
      corner.textContent = ctx.weekNumbers && first ? ctx.messages.weekShort({ week: weekNumber(first, { ...weekRulesFor(ctx.locale), firstDay: state.firstDay }) }) : '';
      if (!cursorHits.has(cursorNode)) cursorNode.setAttribute('aria-label', ctx.messages.timeSlots);
      heads.sync(cols.map((c) => ({ ...c, sig: `${idOf(c.column.axis)}|${c.today}|${epoch}` })));
      bars.sync([
        ...m.allDay.background.map((segment) => ({
          key: `bg:${segment.key}`,
          sig: `${segment.dayIndex}|${segment.dayCount}`,
          content: `${segment.instance.event.revision}|${epoch}`,
          bar: { segment, lane: 0 },
          bg: true,
        })),
        ...m.allDay.bars.map((bar) => ({
          key: bar.segment.key,
          sig: `${bar.lane}|${bar.segment.dayIndex}|${bar.segment.dayCount}`,
          content: `${bar.segment.instance.event.revision}|${bar.segment.startsHere}|${bar.segment.endsHere}|${epoch}`,
          bar,
          bg: false,
        })),
      ]);
      if (!model || model.gutter !== m.gutter || gutterEpoch !== epoch) drawGutter(m);
      gutterEpoch = epoch;
      model = m;
      // A crowded week keeps the window it has (the same scroll, the same scale:
      // a store change or another week reads no layout). The first time, the
      // columns are drawn with only what is kept, and the window is measured in
      // the scheduler's read phase, mounted in its write phase. Without a layout
      // (hidden, jsdom) the window is null: everything is mounted.
      const crowded = windowed(m);
      const known = crowded && win !== null && win.to >= win.from;
      if (!crowded) win = null;
      else if (!known) win = { from: 0, to: -1 };
      columns.sync(cols.map((c) => ({ ...c, sig: `${c.sig}|${c.today}` })));
      for (const key of parts.keys()) if (!cols.some((c) => c.key === key)) parts.delete(key);
      if (crowded && !known) measureWindow();
      return created;
    },

    tick(now) {
      const at = model ? locateNow(model, now) : null;
      if (!at || !model) {
        nowEl?.remove();
        nowEl = null;
        return;
      }
      const colEl = columns.get(model.columns[at.column]!.key);
      if (!colEl) return;
      nowEl ??= h(doc, 'div', 'dz-now');
      nowEl.setAttribute('aria-hidden', 'true');
      nowEl.style.setProperty('--t', String(at.position));
      if (nowEl.parentElement !== colEl) colEl.append(nowEl);
    },

    scrollTo(minutes) {
      if (!model) return;
      // The real scale, measured once: --dz-minute may be written in rem or calc().
      const col = model.columns.find((c) => !c.folded);
      const el = col ? columns.get(col.key) : undefined;
      const px = el && col && col.axis.length > 0 ? el.getBoundingClientRect().height / col.axis.length : 0;
      body.scrollTop = minutes * (px || 0.8);
      rewindow();
    },

    columnFor: (key) => columns.get(key),

    relayout() {
      if (windowed(model)) measureWindow();
    },

    destroy() {
      bars.clear();
      for (const p of parts.values()) {
        p.events.clear();
        p.background.clear();
        p.more.clear();
      }
      columns.clear();
      parts.clear();
      root.remove();
    },
  };
}

function findSegment(model: TimeGridModel, key: string): Segment | undefined {
  for (const c of model.columns) {
    const hit = c.events.find((e) => e.segment.key === key);
    if (hit) return hit.segment;
  }
  return model.allDay.bars.find((b) => b.segment.key === key)?.segment;
}

registerView('timeGrid', createTimeGridView);
