import { PrefixSums, Temporal, UNASSIGNED, fieldOf, formatTemporal } from '@dzcalendar/core';
import type { Hit, Instant, PlainDate, Resource, ZonedDateTime } from '@dzcalendar/core';
import {
  KeyedList,
  NodePool,
  applyEventLook,
  attachMenuTriggers,
  contentsHost,
  ensureStyles,
  fillEvent,
  h,
  handles,
  noResourcesNote,
  onScrollFrame,
  registerView,
  resourceName,
  timeLabels,
  unmountEvent,
  scrollEased,
  activeIn,
} from '@dzcalendar/dom/toolkit';
import type { Box, InteractionSurface, KeyboardSurface, ViewController, ViewCtx } from '@dzcalendar/dom/toolkit';
import type { TimelineBar, TimelineModel, TimelineMore, TimelineRow } from './model.js';
import { timelineNow } from './model.js';
import { TIMELINE_CSS } from './styles.js';

/** A column of the resource area: a field of the resources, its head, its width. */
export interface AreaColumn {
  /** Read with `fieldOf` (the resource's own, what was given, its `extendedProps`). */
  readonly field: string;
  /** The column's head; default the field's name. */
  readonly header?: string;
  /** Pixels; default 160 for the first, 110 for the others. */
  readonly width?: number;
}

/** `viewOptions.timeline` (createCalendar / update). */
export interface TimelineViewOptions {
  /** The resource area's columns. Default one: the resource's title. */
  readonly areaColumns?: readonly AreaColumn[];
}

const HM = { hour: '2-digit', minute: '2-digit' } as const;
const DAY = { weekday: 'long', day: 'numeric', month: 'long' } as const;

/** Stable small ids for model objects: a row whose object did not change is not redrawn. */
const ids = new WeakMap<object, number>();
let nextId = 0;
const idOf = (o: object) => {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = ++nextId));
  return id;
};

interface RowItem {
  readonly key: string;
  readonly sig: string;
  readonly content: string;
  readonly row: TimelineRow;
  readonly index: number;
  readonly top: number;
}

interface BarItem {
  readonly key: string;
  readonly sig: string;
  readonly content: string;
  readonly bar: TimelineBar;
  readonly bg: boolean;
}

interface MoreItem {
  readonly key: string;
  readonly sig: string;
  readonly more: TimelineMore;
}

interface RowParts {
  readonly area: HTMLElement;
  readonly lane: HTMLElement;
  readonly off: HTMLElement;
  readonly bars: KeyedList<BarItem>;
  readonly bgs: KeyedList<BarItem>;
  readonly mores: KeyedList<MoreItem>;
  row: TimelineRow | null;
}

/** A resource area column's width, in px: from a narrow code to a long name, never all the screen. */
const MIN_COL = 40;
const MAX_COL = 480;

/** Nothing mounted yet (the scale is not measured). */
const EMPTY_WINDOW = { from: 0, to: 0, x0: 0, x1: -1 } as const;

/** The resource a row stands for, or undefined (the one row of a timeline without resources, a group). */
const ownerOf = (row: TimelineRow): string | undefined => (row.kind === 'resource' ? row.resource.id : undefined);
const isDrawnRow = (row: TimelineRow) => row.kind !== 'group';

/**
 * A timeline: rows of resources (or one row of every event) along an elapsed
 * time axis, the resource area on the left. One scroller for both ways: the
 * area sticks to the left, the heads to the top, so they follow it without a
 * line of script. What is mounted is what meets the view (and a margin), in
 * rows and along time.
 */
export function createTimelineView(ctx: ViewCtx): ViewController {
  const { doc } = ctx;
  if (ctx.injectStyles) ensureStyles(ctx.popoverElement, 'timeline', TIMELINE_CSS, ctx.cssLayers);
  const root = h(doc, 'div', 'dz-tl');
  const scroller = h(doc, 'div', 'dz-tl__scroller');
  const sheet = h(doc, 'div', 'dz-tl__sheet');
  sheet.setAttribute('role', 'treegrid');
  const head = h(doc, 'div', 'dz-tl__head');
  head.setAttribute('role', 'row');
  head.setAttribute('aria-rowindex', '1');
  const corner = h(doc, 'div', 'dz-tl__corner');
  const timehead = h(doc, 'div', 'dz-tl__timehead');
  timehead.setAttribute('role', 'columnheader');
  const groupsHost = contentsHost(doc, 'dz-tl__groups');
  const slotsHost = contentsHost(doc, 'dz-tl__slots');
  timehead.append(groupsHost, slotsHost);
  head.append(corner, timehead);
  const body = h(doc, 'div', 'dz-tl__body');
  const lines = h(doc, 'div', 'dz-tl__lines');
  lines.setAttribute('aria-hidden', 'true');
  const linesHost = contentsHost(doc, 'dz-tl__line-host');
  lines.append(linesHost);
  const rowsHost = contentsHost(doc, 'dz-tl__rows');
  body.append(lines, rowsHost);
  sheet.append(head, body);
  scroller.append(sheet);
  root.append(scroller);
  const emptyNote = noResourcesNote(ctx, root);
  const skipped = h(doc, 'p', 'dz-empty');
  const skippedNote = (show: boolean) => {
    if (!show) return skipped.remove();
    skipped.textContent = ctx.messages.dayDoesNotExist;
    if (!skipped.isConnected) root.append(skipped);
  };

  let model: TimelineModel | null = null;
  /** The rows that are drawn rows (not group heads) in order: what up and down walk. */
  let offsets = new PrefixSums([]);
  const parts = new Map<string, RowParts>();
  const nowEl = h(doc, 'div', 'dz-tl__now');
  nowEl.setAttribute('aria-hidden', 'true');
  /** Pixels: one nominal slot, a resource row, a group row. Measured in a read phase; 0 until then (everything mounted). */
  let px = 0;
  let rowPx = 0;
  let groupPx = 0;
  /** Mounted: rows `[from, to)` and positions `[x0, x1)`; null: everything. */
  let win: { from: number; to: number; x0: number; x1: number } | null = null;
  /** Mounted whatever the window: the row and event the keyboard is on. */
  const keptRows = new Set<string>();
  /** The area's column widths, as dragged (by field: another set of columns does not inherit them); kept across renders. */
  const widths = new Map<string, number>();
  let created: HTMLElement[] = [];
  let cornerEpoch = -1;
  /** The rows have group heads (resources one level down under them). */
  let grouped = false;
  /** Sticky inside the scroller: the resource area's width and the heads' height (px), read with the scale. */
  let insetStart = 0;
  let insetTop = 0;
  /** The hour the calendar asked to scroll to (scrollTime), again after a period or scale change. */
  let scrollMinutes = 480;
  /** Right to left: positions run from the right edge, and the scroll offset is negative (Chrome). */
  const rtl = () => root.closest('[dir]')?.getAttribute('dir') === 'rtl';
  /** How far along time the scroller is, whatever the direction. */
  const scrolledAlong = () => Math.abs(scroller.scrollLeft);
  const scrollAlong = (v: number) => (scroller.scrollLeft = rtl() ? -v : v);

  const opts = (): TimelineViewOptions => (ctx.viewOptions['timeline'] as TimelineViewOptions | undefined) ?? {};
  const columnsOf = (): readonly AreaColumn[] => {
    const c = opts().areaColumns;
    return c && c.length > 0 ? c : [{ field: 'title' }];
  };
  const widthOf = (i: number, c: AreaColumn) => widths.get(c.field) ?? c.width ?? (i === 0 ? 160 : 110);
  function applyWidths(): void {
    const cols = model && model.options.rows ? columnsOf() : [];
    const ws = cols.map((c, i) => widthOf(i, c));
    root.style.setProperty('--dz-tl-area', `${ws.reduce((a, b) => a + b, 0)}px`);
    root.style.setProperty('--dz-tl-area-cols', ws.length > 0 ? ws.map((w) => `${w}px`).join(' ') : '0px');
  }

  // ── the area's heads: one per column, each with a handle that sets its width ──
  function drawCorner(): void {
    const resourced = Boolean(model?.options.rows);
    const cols = resourced ? columnsOf() : [];
    const grips: HTMLElement[] = [];
    corner.replaceChildren(
      ...cols.map((c, i) => {
        // The title column is named "Resource" when the application gives it no head: a column header needs a name.
        const name = c.header ?? (c.field === 'title' ? ctx.messages.resource : c.field);
        const cell = h(doc, 'div', 'dz-tl__colhead', name);
        cell.setAttribute('role', 'columnheader');
        cell.setAttribute('aria-colindex', String(i + 1));
        const grip = h(doc, 'div', 'dz-tl__resizer');
        grip.setAttribute('role', 'separator');
        grip.setAttribute('aria-orientation', 'vertical');
        // One tab stop for every separator: ↑/↓ go from one to the next, ←/→ set the width.
        grip.tabIndex = i === 0 ? 0 : -1;
        grip.setAttribute('aria-valuenow', String(widthOf(i, c)));
        grip.setAttribute('aria-valuemin', String(MIN_COL));
        grip.setAttribute('aria-valuemax', String(MAX_COL));
        grip.setAttribute('aria-label', name);
        grip.addEventListener('pointerdown', (e) => startResize(e, i, c, grip));
        grip.addEventListener('keydown', (e) => {
          const move = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          if (move) {
            const next = grips[i + move];
            if (next) {
              e.preventDefault();
              for (const g of grips) g.tabIndex = g === next ? 0 : -1;
              next.focus();
            }
            return;
          }
          const step = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
          if (!step) return;
          e.preventDefault();
          setWidth(c.field, widthOf(i, c) + (rtl() ? -step : step), grip);
        });
        grips.push(grip);
        cell.append(grip);
        return cell;
      }),
    );
  }
  function setWidth(field: string, w: number, grip: HTMLElement): void {
    // Never so wide that no time is left to see.
    widths.set(field, Math.max(MIN_COL, Math.min(MAX_COL, Math.round(w))));
    grip.setAttribute('aria-valuenow', String(widths.get(field)));
    applyWidths();
  }
  function startResize(e: PointerEvent, i: number, c: AreaColumn, grip: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = widthOf(i, c);
    const r = rtl();
    const move = (m: PointerEvent) => setWidth(c.field, w0 + (r ? x0 - m.clientX : m.clientX - x0), grip);
    const up = () => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
    };
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
  }

  // ── the time heads: days (or months) above, slots below; windowed along time ──
  interface HeadItem {
    readonly key: string;
    readonly sig: string;
    readonly from: number;
    readonly to: number;
    readonly text: string;
    readonly label: string;
  }
  const place = (el: HTMLElement, from: number, to: number) => {
    el.style.setProperty('--x', String(from));
    el.style.setProperty('--w', String(Math.max(0, to - from)));
  };
  const groupHeads = new KeyedList<HeadItem>(
    groupsHost,
    () => h(doc, 'div', 'dz-tl__group'),
    (el, it) => {
      place(el, it.from, it.to);
      el.replaceChildren(h(doc, 'span', 'dz-tl__group-text', it.text));
    },
  );
  const slotHeads = new KeyedList<HeadItem>(
    slotsHost,
    () => h(doc, 'div', 'dz-tl__slot'),
    (el, it) => {
      place(el, it.from, it.to);
      // Seen: "02:00*"; said (and on hover): "02:00 (+01:00)" — the offset, not the mark (D.6).
      const seen = h(doc, 'span', '', it.text);
      if (it.label !== it.text) seen.setAttribute('aria-hidden', 'true');
      el.replaceChildren(seen, ...(it.label !== it.text ? [h(doc, 'span', 'dz-tl__sr', it.label)] : []));
      el.title = it.label;
    },
  );
  const lineList = new KeyedList<{
    key: string;
    sig: string;
    x: number;
    major: boolean;
  }>(
    linesHost,
    () => h(doc, 'div', 'dz-tl__line'),
    (el, it) => {
      el.style.setProperty('--x', String(it.x));
      el.classList.toggle('dz-tl__line--major', it.major);
    },
  );
  /** What a slot is called: its wall time (with `*` and the offset on a repeated one), or its day. */
  function slotText(m: TimelineModel, i: number): { text: string; label: string } {
    const s = m.axis.slots[i]!;
    if (!s.time)
      return {
        text: formatTemporal(s.date, { day: 'numeric' }, ctx.locale),
        label: formatTemporal(s.date, DAY, ctx.locale),
      };
    const hm = formatTemporal(s.time, HM, ctx.locale);
    if (s.pass === null) return { text: hm, label: hm };
    // The two 02:00s of a fall-back night: the second marked, both with their offsets in the label.
    return {
      text: `${hm}${s.pass === 'second' ? ctx.messages.secondPassMark : ''}`,
      label: `${hm} (${s.offset})`,
    };
  }
  function drawHeads(m: TimelineModel): void {
    const x0 = win ? win.x0 : -Infinity;
    const x1 = win ? win.x1 : Infinity;
    const a = m.axis;
    groupHeads.sync(
      a.groups
        .filter((g) => g.lengthMinutes > 0 && a.toPosition(g.end) > x0 && a.toPosition(g.start) < x1)
        .map((g) => {
          const from = a.toPosition(g.start);
          const to = a.toPosition(g.end);
          const text =
            a.unit === 'day' ? formatTemporal(g.date, { month: 'long', year: 'numeric' }, ctx.locale) : formatTemporal(g.date, { weekday: 'short', day: 'numeric', month: 'short' }, ctx.locale);
          return {
            key: g.date.toString(),
            sig: `${from}|${to}|${ctx.epoch}`,
            from,
            to,
            text,
            label: text,
          };
        }),
    );
    const dayStarts = new Set(a.groups.map((g) => g.start.epochMilliseconds));
    const items: HeadItem[] = [];
    const ls: { key: string; sig: string; x: number; major: boolean }[] = [];
    a.slots.forEach((s, i) => {
      const from = a.toPosition(s.start);
      const to = a.toPosition(s.end);
      if (to <= x0 || from >= x1) return;
      const t = slotText(m, i);
      const key = String(s.start.epochMilliseconds);
      items.push({ key, sig: `${from}|${to}|${ctx.epoch}`, from, to, ...t });
      const major = a.unit === 'day' ? s.date.day === 1 : dayStarts.has(s.start.epochMilliseconds);
      ls.push({ key, sig: `${from}|${major}`, x: from, major });
    });
    slotHeads.sync(items);
    lineList.sync(ls);
  }

  // ── rows ─────────────────────────────────────────────────────────────────
  const barPool = new NodePool(() => h(doc, 'div', 'dz-tl__ev'));
  const rows = new KeyedList<RowItem>(
    rowsHost,
    (it) => {
      const el = h(doc, 'div', 'dz-tl__row');
      el.setAttribute('role', 'row');
      const area = h(doc, 'div', 'dz-tl__area');
      const lane = h(doc, 'div', 'dz-tl__lane');
      lane.setAttribute('role', 'gridcell');
      const off = contentsHost(doc, 'dz-tl__offs');
      const bgHost = contentsHost(doc, 'dz-tl__bgs');
      const barHost = contentsHost(doc, 'dz-tl__bars');
      const moreHost = contentsHost(doc, 'dz-tl__mores');
      lane.append(off, bgHost, barHost, moreHost);
      el.append(area, lane);
      const p: RowParts = {
        area,
        lane,
        off,
        row: null,
        bars: new KeyedList<BarItem>(
          barHost,
          () => barPool.take(),
          (n, b, c) => drawBar(n, b, c),
          (n) => unmountEvent(ctx, n),
          (n) => barPool.release(n),
        ),
        bgs: new KeyedList<BarItem>(
          bgHost,
          () => h(doc, 'div', 'dz-tl__ev dz-tl__ev--bg'),
          (n, b, c) => drawBar(n, b, c),
        ),
        mores: new KeyedList<MoreItem>(
          moreHost,
          () => {
            const b = h(doc, 'button', 'dz-more dz-more--tl') as HTMLButtonElement;
            b.type = 'button';
            b.tabIndex = -1;
            b.addEventListener('click', () => {
              const m = moreOf.get(b);
              const r = p.row;
              if (m && r) openMoreTl(b, m, r);
            });
            return b;
          },
          (b, it) => drawMore(b, it.more),
        ),
      };
      parts.set(it.key, p);
      return el;
    },
    (el, it, changed) => drawRow(el, it, changed),
    (el) => {
      const p = parts.get(el.dataset['key'] ?? '');
      p?.bars.clear();
      p?.bgs.clear();
      p?.mores.clear();
      parts.delete(el.dataset['key'] ?? '');
    },
  );

  function drawRow(el: HTMLElement, it: RowItem, changed: { pos: boolean; content: boolean }): void {
    const p = parts.get(it.key)!;
    const row = it.row;
    p.row = row;
    el.style.setProperty('--y', String(it.top));
    el.setAttribute('aria-rowindex', String(it.index + 2));
    el.classList.toggle('dz-tl__row--group', row.kind === 'group');
    el.classList.toggle('dz-tl__row--unassigned', row.kind === 'resource' && row.resource.id === UNASSIGNED);
    if (row.kind === 'resource') el.dataset['resource'] = row.resource.id;
    else delete el.dataset['resource'];
    if (changed.content) drawArea(el, p, row);
    if (row.kind === 'group') {
      p.bars.sync([]);
      p.bgs.sync([]);
      p.mores.sync([]);
      p.off.replaceChildren();
      return;
    }
    if (changed.content) {
      p.off.replaceChildren(
        ...row.offHours.map((o) => {
          const x = h(doc, 'div', 'dz-tl__off');
          place(x, o.from, o.to);
          return x;
        }),
      );
    }
    syncBars(p, row);
  }

  /** The row's events meeting the window along time (and the kept one). */
  function syncBars(p: RowParts, row: TimelineRow): void {
    if (row.kind === 'group') return;
    const x0 = win ? win.x0 : -Infinity;
    const x1 = win ? win.x1 : Infinity;
    const inWin = (b: { from: number; to: number }) => b.to >= x0 && b.from <= x1;
    const kept = keptBar;
    created.push(...p.bars.sync(row.events.filter((b) => inWin(b) || b.segment.key === kept).map((b) => barItem(b, false))));
    p.bgs.sync(row.background.filter(inWin).map((b) => barItem(b, true)));
    p.mores.sync(
      row.more.filter(inWin).map((m) => ({
        key: m.key,
        sig: `${m.from}|${m.to}|${m.events.length}|${ctx.epoch}`,
        more: m,
      })),
    );
  }

  const barItem = (b: TimelineBar, bg: boolean): BarItem => ({
    key: b.segment.key,
    sig: `${b.from}|${b.to}|${b.lane}`,
    content: `${b.segment.instance.event.revision}|${b.segment.startsHere}|${b.segment.endsHere}|${ctx.epoch}`,
    bar: b,
    bg,
  });

  function drawArea(el: HTMLElement, p: RowParts, row: TimelineRow): void {
    if (row.kind === 'all') {
      el.removeAttribute('aria-level');
      el.removeAttribute('aria-expanded');
      p.area.replaceChildren();
      p.lane.setAttribute('aria-label', ctx.kernel.getState().title);
      return;
    }
    if (row.kind === 'group') {
      el.setAttribute('aria-level', '1');
      el.setAttribute('aria-expanded', String(row.expanded));
      const cell = h(doc, 'div', 'dz-tl__cell dz-tl__cell--group');
      cell.setAttribute('role', 'rowheader');
      cell.tabIndex = -1;
      const toggle = expander(row.expanded, () => toggleGroup(row.value));
      cell.append(toggle, h(doc, 'span', 'dz-tl__group-name', `${row.value || '—'} (${new Intl.NumberFormat(ctx.locale).format(row.count)})`));
      p.area.replaceChildren(cell);
      p.lane.removeAttribute('aria-label');
      return;
    }
    const r = row.resource;
    // Under a group head, a root is one level down.
    el.setAttribute('aria-level', String(row.depth + 1 + (grouped ? 1 : 0)));
    if (row.expanded === null) el.removeAttribute('aria-expanded');
    else el.setAttribute('aria-expanded', String(row.expanded));
    const cols = columnsOf();
    p.area.replaceChildren(
      ...cols.map((c, i) => {
        const cell = h(doc, 'div', 'dz-tl__cell');
        cell.setAttribute('role', i === 0 ? 'rowheader' : 'gridcell');
        cell.setAttribute('aria-colindex', String(i + 1));
        if (i === 0) {
          cell.tabIndex = -1;
          cell.style.setProperty('--depth', String(row.depth));
          if (row.expanded !== null) cell.append(expander(row.expanded, () => toggleResource(r.id)));
          // "Unassigned" is the calendar's own row: an application's hook draws its resources, not it.
          const own = c.field === 'title' && r.id !== UNASSIGNED ? ctx.hooks.resource?.content?.({ resource: r }, cell) : null;
          const title = h(doc, 'span', 'dz-tl__title');
          if (own === null || own === undefined) title.textContent = c.field === 'title' ? resourceName(ctx, r) : textOf(r, c.field);
          else title.replaceChildren(typeof own === 'string' ? doc.createTextNode(own) : own);
          cell.append(title);
        } else cell.textContent = textOf(r, c.field);
        return cell;
      }),
    );
    for (const c of r.classNames) el.classList.add(c);
    p.lane.setAttribute('aria-label', resourceName(ctx, r));
    p.lane.setAttribute('aria-colindex', String(cols.length + 1));
  }
  const textOf = (r: Resource, field: string) => {
    const v = r.id === UNASSIGNED ? '' : fieldOf(r, field);
    return v === undefined || v === null ? '' : String(v);
  };
  function expander(open: boolean, run: () => void): HTMLElement {
    const b = h(doc, 'button', 'dz-tl__expander') as HTMLButtonElement;
    b.type = 'button';
    b.tabIndex = -1;
    b.setAttribute('aria-hidden', 'true');
    b.textContent = open ? '▾' : '▸';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      run();
    });
    return b;
  }
  /** The tree's state lives in the kernel (it survives `update()`, the model is built from it). */
  function toggleResource(id: string): void {
    const now = new Set(ctx.kernel.getOptions().collapsedResources ?? []);
    if (now.has(id)) now.delete(id);
    else now.add(id);
    ctx.kernel.setOptions({ collapsedResources: [...now] });
    reportToggle();
  }
  /** What the application keeps of the tree, if it wants it back (`collapsedResources`, `collapsedGroups`). */
  function reportToggle(): void {
    const o = ctx.kernel.getOptions();
    ctx.live().onResourceToggle?.({ collapsedResources: o.collapsedResources ?? [], collapsedGroups: o.collapsedGroups ?? [] });
  }
  function toggleGroup(value: string): void {
    const now = new Set(ctx.kernel.getOptions().collapsedGroups ?? []);
    if (now.has(value)) now.delete(value);
    else now.add(value);
    ctx.kernel.setOptions({ collapsedGroups: [...now] });
    reportToggle();
  }

  function drawBar(el: HTMLElement, it: BarItem, changed: { pos: boolean; content: boolean; created: boolean }): void {
    const b = it.bar;
    if (changed.pos) {
      place(el, b.from, b.to);
      el.style.setProperty('--lane', String(b.lane));
    }
    if (!changed.content) return;
    const seg = b.segment;
    const ev = seg.instance.event;
    el.classList.toggle('dz-tl__ev--cont-start', !seg.startsHere);
    el.classList.toggle('dz-tl__ev--cont-end', !seg.endsHere);
    applyEventLook(el, ev);
    handles(el, seg, it.bg);
    if (it.bg) {
      el.replaceChildren();
      el.setAttribute('aria-hidden', 'true');
      return;
    }
    const labels = timeLabels(ctx, ev, {});
    const title = ev.title || ctx.messages.untitled;
    fillEvent(
      ctx,
      el,
      {
        instance: seg.instance,
        segment: seg,
        timeText: labels.text,
        displayZone: ctx.zone,
        family: 'timeline',
      },
      () => [h(doc, 'span', 'dz-tl__ev-title', title), h(doc, 'span', 'dz-tl__ev-time', labels.text)],
      changed.created,
    );
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
  }

  // ── "+N" ─────────────────────────────────────────────────────────────────
  const moreOf = new WeakMap<HTMLElement, TimelineMore>();
  let panelEvents = new Map<string, TimelineBar>();
  function drawMore(b: HTMLElement, m: TimelineMore): void {
    moreOf.set(b, m);
    place(b, m.from, m.to);
    b.style.setProperty('--lane', String((model?.maxLanes ?? 1) - 1));
    b.textContent = ctx.messages.moreLink({ count: m.events.length });
    const first = m.events[0]!.segment.from as Instant;
    b.setAttribute(
      'aria-label',
      ctx.messages.moreLabel({
        count: m.events.length,
        date: `${formatTemporal(first.toZonedDateTimeISO(ctx.zone).toPlainDate(), DAY, ctx.locale)}, ${formatTemporal(first.toZonedDateTimeISO(ctx.zone).toPlainTime(), HM, ctx.locale)}`,
      }),
    );
  }
  function openMoreTl(link: HTMLElement, m: TimelineMore, row: TimelineRow): void {
    panelEvents = new Map(m.events.map((e) => [e.segment.key, e]));
    const nodes = m.events.map((e) => {
      const ev = e.segment.instance.event;
      const item = h(doc, 'div', 'dz-bar dz-bar--in-popover');
      applyEventLook(item, ev);
      item.dataset['segment'] = e.segment.key;
      const title = ev.title || ctx.messages.untitled;
      const labels = timeLabels(ctx, ev, {});
      fillEvent(
        ctx,
        item,
        {
          instance: e.segment.instance,
          segment: e.segment,
          timeText: labels.text,
          displayZone: ctx.zone,
          family: 'timeline',
        },
        () => [h(doc, 'span', 'dz-bar__time', labels.text), doc.createTextNode(` ${title}`)],
        true,
      );
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
      return item;
    });
    const first = m.events[0]!.segment.from as Instant;
    const owner = row.kind === 'resource' ? `${resourceName(ctx, row.resource)}, ` : '';
    ctx.openMore(link, owner + formatTemporal(first.toZonedDateTimeISO(ctx.zone).toPlainDate(), DAY, ctx.locale), nodes, () => {
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

  // ── windowing, on both axes ─────────────────────────────────────────────
  const total = (m: TimelineModel) => m.rows.reduce((n, r) => n + (r.kind === 'group' ? 0 : r.events.length), 0);
  const windowed = (m: TimelineModel | null) => !ctx.printing && m !== null && (total(m) > ctx.virtualizeAbove || m.rows.length > 120 || m.axis.slots.length > 400);
  /** Row heights and offsets (from the measured sizes; 0 before: every row at 0, everything mounted). */
  function layoutRows(m: TimelineModel): void {
    offsets = new PrefixSums(m.rows.map((r) => (r.kind === 'group' ? groupPx : rowPx)));
  }
  /** The window for the current scroll: a view (rows) and a screen (time) on each side, in steps of half. */
  function windowNow(m: TimelineModel, s: { top: number; left: number; h: number; w: number; area: number }): typeof win {
    if (px <= 0 || rowPx <= 0 || s.h <= 0) return null;
    const stepY = s.h / 2;
    const yFrom = Math.floor((s.top - s.h) / stepY) * stepY;
    const yTo = Math.ceil((s.top + 2 * s.h) / stepY) * stepY;
    const from = m.rows.length === 0 ? 0 : offsets.indexAt(Math.max(0, yFrom));
    const to = Math.min(m.rows.length, offsets.indexAt(Math.max(0, yTo)) + 1);
    const laneW = Math.max(4, (s.w - s.area) / px);
    const stepX = Math.max(1, laneW / 2);
    const left = s.left / px;
    const x0 = Math.floor((left - laneW) / stepX) * stepX;
    const x1 = Math.ceil((left + 2 * laneW) / stepX) * stepX;
    return { from, to, x0, x1 };
  }
  const scrollState = () => ({
    top: scroller.scrollTop,
    left: scrolledAlong(),
    h: scroller.clientHeight,
    w: scroller.clientWidth,
    area: corner.getBoundingClientRect().width,
  });
  function measureWindow(): void {
    ctx.scheduler.schedule({
      read: () => (model && windowed(model) ? windowNow(model, scrollState()) : null),
      write: (next) => mount(next),
    });
  }
  onScrollFrame(ctx.scope, scroller, () => windowed(model), measureWindow);

  /** Mounts what the window covers. */
  function mount(next: typeof win, force = false): void {
    const m = model;
    if (!m) return;
    const same = next && win && next.from === win.from && next.to === win.to && next.x0 === win.x0 && next.x1 === win.x1;
    if (!force && (same || (next === null && win === null))) return;
    win = windowed(m) ? next : null;
    syncRows(m);
    drawHeads(m);
  }

  function syncRows(m: TimelineModel): void {
    const from = win ? win.from : 0;
    const to = win ? win.to : m.rows.length;
    const items: RowItem[] = [];
    m.rows.forEach((row, i) => {
      const key = row.key;
      if ((i < from || i >= to) && !keptRows.has(key)) return;
      items.push({
        key,
        sig: `${offsets.offsetOf(i)}|${i}`,
        // The row's body (reused across a fold), its place in the tree, the words in force.
        content: `${idOf(row.kind === 'group' ? row : row.events)}|${row.kind === 'resource' ? `${row.depth}|${row.expanded}` : ''}|${grouped}|${ctx.epoch}|${columnsOf().length}`,
        row,
        index: i,
        top: offsets.offsetOf(i),
      });
    });
    rows.sync(items);
    // A row whose content did not change still meets another window along time.
    for (const it of items) {
      const p = parts.get(it.key);
      if (p) syncBars(p, it.row);
    }
  }

  // ── the keyboard: a cursor on a row, at a moment (or a day) ──────────────
  /** A cursor without a place yet: focused, the keyboard puts it at `home()` and names it. */
  function unplacedCursor(): HTMLElement {
    const n = h(doc, 'div', 'dz-cursor dz-tl__cursor');
    n.tabIndex = 0;
    n.setAttribute('role', 'button');
    n.setAttribute('aria-label', ctx.messages.timeSlots);
    // In the time's head (a column header may hold it): a treegrid owns rows only.
    timehead.prepend(n);
    return n;
  }
  let cursorNode = unplacedCursor();
  /** The cursor had the focus when it last lost it (a fold takes its row, and the focus, away). */
  let cursorWasFocused = false;
  /** Where the next `home()` goes (from the area's row head, into that row). */
  let pendingHome: Hit | null = null;
  const cursorHits = new WeakMap<Element, Hit>();
  let keptBar: string | null = null;

  const drawnRows = () => (model?.rows ?? []).map((r, i) => [r, i] as const).filter(([r]) => isDrawnRow(r));
  const rowIndexOf = (resourceId: string | undefined) => {
    const m = model;
    if (!m) return -1;
    const all = drawnRows();
    const hit = all.find(([r]) => ownerOf(r) === resourceId);
    return (hit ?? all[0])?.[1] ?? -1;
  };
  const snapMs = () => Math.max(1, ctx.snapMinutes) * 60_000;
  const dayUnit = () => model?.axis.unit === 'day';
  const hitAtRow = (row: TimelineRow, instant: Instant): Hit => {
    const date = instant.toZonedDateTimeISO(ctx.zone).toPlainDate();
    const owner = ownerOf(row);
    const base: Hit = dayUnit() ? { kind: 'day', date } : { kind: 'slot', date, instant };
    return owner === undefined ? base : { ...base, resourceId: owner };
  };
  const instantOf = (hit: Hit): Instant => (hit.kind === 'slot' ? hit.instant : hit.date.toZonedDateTime({ timeZone: ctx.zone }).toInstant());

  const keys: KeyboardSurface = {
    allDayRow: false,
    hitGrid: () => (dayUnit() ? 'day' : 'time'),
    home() {
      const m = model;
      if (!m) return null;
      if (pendingHome) {
        const p = pendingHome;
        pendingHome = null;
        return p;
      }
      const i = rowIndexOf(undefined);
      if (i < 0) return null;
      const now = ctx.kernel.now();
      const at = timelineNow(m, now) !== null ? now : m.axis.start;
      const f = keys.fit(hitAtRow(m.rows[i]!, at));
      return f && typeof f === 'object' ? f : null;
    },
    fit(hit) {
      const m = model;
      if (!m || m.axis.slots.length === 0) return null;
      const i = rowIndexOf(hit.resourceId);
      if (i < 0) return null;
      const row = m.rows[i]!;
      const t = instantOf(hit).epochMilliseconds;
      const s = m.axis.start.epochMilliseconds;
      const e = m.axis.end.epochMilliseconds;
      if (t < s) return 'prev';
      if (t >= e) return 'next';
      if (dayUnit()) {
        const date = hit.kind === 'day' ? hit.date : Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(ctx.zone).toPlainDate();
        const owner = ownerOf(row);
        return owner === undefined ? { kind: 'day', date } : { kind: 'day', date, resourceId: owner };
      }
      const ms = Math.min(t, e - snapMs());
      return hitAtRow(row, Temporal.Instant.fromEpochMilliseconds(ms));
    },
    stepAcross(hit, delta) {
      const all = drawnRows();
      const at = all.findIndex(([r]) => ownerOf(r) === hit.resourceId);
      const next = all[(at < 0 ? 0 : at) + delta];
      if (!next) return null;
      const f = keys.fit(hitAtRow(next[0], instantOf(hit)));
      return f && typeof f === 'object' ? f : null;
    },
    showCursor(hit, label) {
      const m = model;
      if (!m) return;
      const i = rowIndexOf(hit.resourceId);
      if (i < 0) return;
      const row = m.rows[i]!;
      const key = row.key;
      keptRows.clear();
      keptRows.add(key);
      syncRows(m);
      const node = h(doc, 'div', 'dz-cursor dz-tl__cursor');
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', label);
      const t = instantOf(hit);
      const from = m.axis.toPosition(t);
      const to = dayUnit() ? m.axis.toPosition(m.axis.slots[Math.max(0, m.axis.slotAt(t))]!.end) : m.axis.toPosition(t.epochMilliseconds + snapMs());
      node.style.setProperty('--x', String(from));
      node.style.setProperty('--w', String(Math.max(to - from, 0.05)));
      // In its row's time cell (the row is kept mounted): a treegrid's rows hold cells, a cell holds the cursor.
      (parts.get(key)?.lane ?? timehead).prepend(node);
      cursorHits.set(node, hit);
      const old = cursorNode;
      cursorNode = node;
      node.focus({ preventScroll: true });
      old.remove();
    },
    isCursor: (el) => el === cursorNode,
    cursorAt: (el) => (el === cursorNode ? (cursorHits.get(el) ?? null) : null),
    lineEdge(hit, edge) {
      const m = model;
      if (!m) return hit;
      const i = rowIndexOf(hit.resourceId);
      const at = edge === 'start' ? m.axis.start : Temporal.Instant.fromEpochMilliseconds(m.axis.end.epochMilliseconds - (dayUnit() ? 1 : snapMs()));
      const f = keys.fit(hitAtRow(m.rows[i]!, at));
      return f && typeof f === 'object' ? f : hit;
    },
    itemsAt: () => [],
    itemsAround(node) {
      const lane = node.closest('.dz-tl__lane');
      return lane ? [...lane.querySelectorAll<HTMLElement>('[data-event-id][tabindex]')] : [];
    },
    nodeFor(eventId, _date, resourceId) {
      const m = model;
      if (!m) return null;
      // Mounted for the keyboard: its row, and the bar along time.
      for (const r of m.rows) {
        if (r.kind === 'group') continue;
        const bar = r.events.find((b) => b.segment.instance.event.id === eventId);
        if (bar && (resourceId === undefined || ownerOf(r) === resourceId)) {
          keptRows.add(r.key);
          keptBar = bar.segment.key;
          syncRows(m);
          break;
        }
      }
      const all = [...rowsHost.querySelectorAll<HTMLElement>('.dz-tl__ev[data-event-id][tabindex]')].filter((n) => n.dataset['eventId'] === eventId);
      const inRow = resourceId === undefined ? undefined : all.find((n) => n.closest<HTMLElement>('.dz-tl__row')?.dataset['resource'] === resourceId);
      if (inRow ?? all[0]) return inRow ?? all[0]!;
      // Behind "+N": its link.
      return [...rowsHost.querySelectorAll<HTMLElement>('.dz-more--tl')].find((b) => moreOf.get(b)?.events.some((e) => e.segment.instance.event.id === eventId)) ?? null;
    },
    cursorFor(node) {
      const m = model;
      const rowEl = node.closest<HTMLElement>('.dz-tl__row');
      if (!m || !rowEl) return null;
      const row = m.rows.find((r) => r.key === rowEl.dataset['key']);
      if (!row || row.kind === 'group') return null;
      const bar = row.events.find((b) => b.segment.key === node.dataset['key']);
      const f = keys.fit(hitAtRow(row, bar ? (bar.segment.from as Instant) : m.axis.start));
      return f && typeof f === 'object' ? f : null;
    },
    reveal(hit) {
      const m = model;
      if (!m || px <= 0) return;
      const i = rowIndexOf(hit.resourceId);
      const x = m.axis.toPosition(instantOf(hit)) * px;
      const area = corner.getBoundingClientRect().width;
      const laneW = scroller.clientWidth - area;
      const along = scrolledAlong();
      if (x < along + px) scrollAlong(Math.max(0, x - px));
      else if (x > along + laneW - 2 * px) scrollAlong(x - laneW + 2 * px);
      const y = offsets.offsetOf(i);
      const headH = head.getBoundingClientRect().height;
      const viewH = scroller.clientHeight - headH;
      if (y < scroller.scrollTop) scroller.scrollTop = y;
      else if (y + rowPx > scroller.scrollTop + viewH) scroller.scrollTop = y + rowPx - viewH;
      mount(windowed(m) ? windowNow(m, scrollState()) : null);
    },
  };

  // ── gestures: geometry read once ─────────────────────────────────────────
  interface Geo {
    /** Viewport x of position 0 (the lanes' start) and y of the first row, at measure time. */
    readonly x0: number;
    readonly y0: number;
    readonly px: number;
    /** Right to left: positions grow leftwards from `x0`. */
    readonly dir: 1 | -1;
    readonly view: {
      readonly top: number;
      readonly bottom: number;
      readonly left: number;
      readonly right: number;
    };
    readonly origin: { readonly x: number; readonly y: number };
  }
  const surface: InteractionSurface<Geo> = {
    root,
    scroller,
    family: 'timeline',
    keys,
    accepts: (target) => target.closest('.dz-tl__lane') !== null,
    insets: () => ({ start: insetStart, top: insetTop }),
    measure(origin) {
      const b = body.getBoundingClientRect();
      const area = corner.getBoundingClientRect().width;
      const s = scroller.getBoundingClientRect();
      const headH = head.getBoundingClientRect().height;
      const m = model;
      const scale = m && m.axis.length > 0 ? (sheet.getBoundingClientRect().width - area) / m.axis.length : 0;
      const r = rtl();
      return {
        x0: r ? b.right - area : b.left + area,
        y0: b.top,
        px: scale,
        dir: r ? -1 : 1,
        view: r
          ? {
              top: s.top + headH,
              bottom: s.bottom,
              left: s.left,
              right: s.right - area,
            }
          : {
              top: s.top + headH,
              bottom: s.bottom,
              left: s.left + area,
              right: s.right,
            },
        origin,
      };
    },
    hitAt(geo, x, y, scrollY, scrollX = 0) {
      const m = model;
      if (!m || geo.px <= 0) return null;
      const cy = Math.max(geo.view.top, Math.min(geo.view.bottom - 1, y));
      const cx = Math.max(geo.view.left, Math.min(geo.view.right - 1, x));
      const yy = cy - (geo.y0 - scrollY);
      const i = offsets.indexAt(Math.max(0, yy));
      const row = m.rows[Math.min(i, m.rows.length - 1)];
      if (!row || row.kind === 'group') return null;
      // The scroller moved by scrollX since the measure: content moved the other way.
      const pos = ((cx - (geo.x0 - scrollX)) * geo.dir) / geo.px;
      const at = m.axis.fromPosition(Math.max(0, Math.min(m.axis.length - 1e-6, pos)));
      return hitAtRow(row, at);
    },
    boxesFor(geo, span, scrollY, scrollX = 0) {
      const m = model;
      if (!m || geo.px <= 0) return [];
      const ms = (x: ZonedDateTime | PlainDate) => (x instanceof Temporal.PlainDate ? x.toZonedDateTime({ timeZone: ctx.zone }).epochMilliseconds : x.epochMilliseconds);
      const from = m.axis.toPosition(ms(span.start));
      const to = m.axis.toPosition(Math.max(ms(span.end), ms(span.start)));
      const on = span.resourceIds ?? (span.resourceId !== undefined ? [span.resourceId] : null);
      const known = new Set((m.options.resources ?? []).map((r) => r.id));
      const out: Box[] = [];
      m.rows.forEach((row, i) => {
        if (row.kind === 'group') return;
        if (row.kind === 'resource' && on) {
          const mine = row.resource.id === UNASSIGNED ? !on.some((r) => known.has(r)) : on.includes(row.resource.id);
          if (!mine) return;
        }
        const top = geo.y0 - scrollY + offsets.offsetOf(i) + 3;
        const height = Math.max(8, offsets.offsetOf(i + 1) - offsets.offsetOf(i) - 6);
        if (top + height < geo.view.top || top > geo.view.bottom) return;
        const a = geo.x0 - scrollX + geo.dir * from * geo.px;
        const z = geo.x0 - scrollX + geo.dir * Math.max(to, from + 0.25) * geo.px;
        const x1 = Math.max(Math.min(a, z), geo.view.left);
        const x2 = Math.min(Math.max(a, z), geo.view.right);
        if (x2 <= x1) return;
        out.push({
          x: x1 - geo.origin.x,
          y: Math.max(top, geo.view.top) - geo.origin.y,
          w: x2 - x1,
          h: Math.min(height, geo.view.bottom - Math.max(top, geo.view.top)),
        });
      });
      return out;
    },
    instanceOf(node) {
      const m = model;
      if (!m) return null;
      for (const r of m.rows) {
        if (r.kind === 'group') continue;
        const b = r.events.find((x) => x.segment.key === node.dataset['key']) ?? r.background.find((x) => x.segment.key === node.dataset['key']);
        if (b) return b.segment.instance;
      }
      return null;
    },
  };

  // ── the context menu: an event, or the moment (day) under the pointer in a row ──
  attachMenuTriggers(ctx, root, (target, point) => {
    const m = model;
    if (!m) return null;
    const evEl = target.closest<HTMLElement>('.dz-tl__ev:not(.dz-tl__ev--bg)');
    if (evEl) {
      const inst = surface.instanceOf(evEl);
      return inst ? { target: { kind: 'event', instance: inst }, anchor: evEl } : null;
    }
    const cur = keys.cursorAt(target);
    const hit =
      cur ??
      (() => {
        const lane = target.closest<HTMLElement>('.dz-tl__lane');
        if (!lane) return null;
        const geo = surface.measure({ x: 0, y: 0 });
        return point ? surface.hitAt(geo, point.x, point.y, 0, 0) : surface.hitAt(geo, lane.getBoundingClientRect().left + 1, lane.getBoundingClientRect().top + 1, 0, 0);
      })();
    if (!hit) return null;
    const rid = hit.resourceId !== undefined && hit.resourceId !== UNASSIGNED ? { resourceId: hit.resourceId } : {};
    const anchor = (cur ? target : (target.closest<HTMLElement>('.dz-tl__lane') ?? target)) as HTMLElement;
    if (hit.kind === 'day') return { target: { kind: 'day', date: hit.date, ...rid }, anchor };
    const snap = Math.max(1, ctx.snapMinutes) * 60_000;
    const instant = Temporal.Instant.fromEpochMilliseconds(Math.floor(hit.instant.epochMilliseconds / snap) * snap);
    return {
      target: {
        kind: 'slot',
        date: hit.date,
        instant,
        exists: true,
        ambiguous: false,
        alternative: null,
        ...rid,
      },
      anchor,
    };
  });

  // ── the tree from the keyboard: the area's row heads are one tab stop ────
  let headFocus: string | null = null;
  /** A fold from the keyboard redraws the row: its head is focused again after the render. */
  let refocusHead = false;
  ctx.scope.on(rowsHost, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    const cell = (ke.target as Element | null)?.closest<HTMLElement>('.dz-tl__cell[role="rowheader"]');
    if (!cell || ke.target !== cell || !model) return;
    const rowEl = cell.closest<HTMLElement>('.dz-tl__row')!;
    const m = model;
    const i = m.rows.findIndex((r) => r.key === rowEl.dataset['key']);
    const row = m.rows[i];
    if (!row) return;
    const right = rtl() ? 'ArrowLeft' : 'ArrowRight';
    const left = rtl() ? 'ArrowRight' : 'ArrowLeft';
    const focusRow = (j: number) => {
      const r = m.rows[j];
      if (!r) return;
      const key = r.key;
      keptRows.add(key);
      syncRows(m);
      headFocus = key;
      const target = [...rowsHost.querySelectorAll<HTMLElement>('.dz-tl__row')].find((x) => x.dataset['key'] === key)?.querySelector<HTMLElement>('.dz-tl__cell[role="rowheader"]');
      target?.focus();
    };
    const expanded = row.kind === 'all' ? null : row.expanded;
    // The row is drawn again (another state): its head takes the focus back then.
    const toggle = () => {
      headFocus = row.key;
      refocusHead = true;
      if (row.kind === 'group') toggleGroup(row.value);
      else if (row.kind === 'resource') toggleResource(row.resource.id);
    };
    if (ke.key === 'ArrowDown') focusRow(i + 1);
    else if (ke.key === 'ArrowUp') focusRow(i - 1);
    else if (ke.key === 'Enter' || ke.key === ' ') {
      if (expanded === null) return;
      toggle();
    } else if (ke.key === right) {
      if (expanded === false) toggle();
      else if (row.kind !== 'group') {
        // Into the row's time: the cursor at the start of what is in view (placed and named by the keyboard).
        const f = keys.fit(hitAtRow(row, m.axis.fromPosition(px > 0 ? scrolledAlong() / px : 0)));
        if (f && typeof f === 'object') {
          pendingHome = f;
          const fresh = unplacedCursor();
          const old = cursorNode;
          cursorNode = fresh;
          old.remove();
          fresh.focus({ preventScroll: true });
        }
      }
    } else if (ke.key === left) {
      if (expanded === true) toggle();
      else if (row.kind === 'resource') {
        // To its parent.
        const parent = row.resource.parentId;
        const j = parent ? m.rows.findIndex((r) => r.kind === 'resource' && r.resource.id === parent) : -1;
        if (j >= 0) focusRow(j);
      }
    } else return;
    ke.preventDefault();
    ke.stopPropagation();
  });
  /** The area's tab stop: the row head focused last, else the first. */
  function roveHeads(): void {
    const cells = [...rowsHost.querySelectorAll<HTMLElement>('.dz-tl__cell[role="rowheader"]')];
    const stop = cells.find((c) => c.closest<HTMLElement>('.dz-tl__row')?.dataset['key'] === headFocus) ?? cells[0];
    for (const c of cells) c.tabIndex = c === stop ? 0 : -1;
  }
  ctx.scope.on(root, 'focusin', (e) => {
    cursorWasFocused = e.target === cursorNode;
  });
  ctx.scope.on(rowsHost, 'focusin', (e) => {
    const cell = (e.target as Element | null)?.closest<HTMLElement>('.dz-tl__cell[role="rowheader"]');
    if (cell) {
      headFocus = cell.closest<HTMLElement>('.dz-tl__row')?.dataset['key'] ?? null;
      roveHeads();
    }
    const key = (e.target as HTMLElement | null)?.closest<HTMLElement>('.dz-tl__ev')?.dataset['key'];
    if (key) keptBar = key;
  });

  /** Lanes of the one row of a timeline without resources: as many as its height holds. */
  function fillLanes(): void {
    ctx.scheduler.schedule({
      read: () => {
        const m = model;
        if (!m || m.options.rows) return undefined;
        const view = scroller.clientHeight - head.getBoundingClientRect().height;
        const laneH = lanePx();
        return laneH > 0 && view > 0 ? Math.max(2, Math.floor((view - 8) / laneH)) : undefined;
      },
      write: (n) => {
        if (n !== undefined && n !== ctx.kernel.getOptions().timeline?.fillLanes) ctx.kernel.setOptions({ timeline: { fillLanes: n } });
      },
    });
  }
  /** One lane's height, from a bar-sized probe. */
  const probe = h(doc, 'div', 'dz-tl__probe');
  probe.setAttribute('aria-hidden', 'true');
  root.append(probe);
  const lanePx = () => probe.getBoundingClientRect().height;

  /** The scale and the row heights, read once (then on resize): what windowing and gestures compute with. */
  function measure(then: () => void): void {
    ctx.scheduler.schedule({
      read: () => {
        const m = model;
        const area = corner.getBoundingClientRect().width;
        const scale = m && m.axis.length > 0 ? (sheet.getBoundingClientRect().width - area) / m.axis.length : 0;
        const lane = lanePx();
        return { scale, lane, state: scrollState(), area, top: head.getBoundingClientRect().height };
      },
      write: ({ scale, lane, state, area, top }) => {
        const m = model;
        if (!m) return;
        insetStart = area;
        insetTop = top;
        // A resource row holds its lanes and a little room; a group row one lane.
        const nextRow = lane > 0 ? m.maxLanes * lane + 8 : 0;
        const changed = scale !== px || nextRow !== rowPx;
        px = scale;
        rowPx = nextRow;
        groupPx = lane > 0 ? lane + 8 : 0;
        root.style.setProperty('--dz-tl-row', rowPx > 0 ? `${rowPx}px` : '');
        root.style.setProperty('--dz-tl-grouprow', groupPx > 0 ? `${groupPx}px` : '');
        layoutRows(m);
        body.style.height = `${offsets.offsetOf(m.rows.length)}px`;
        if (changed || win?.to === 0) mount(windowed(m) ? windowNow(m, state) : null, true);
        then();
      },
    });
  }

  return {
    element: root,
    body: scroller,
    surface: surface as InteractionSurface,

    render(next) {
      const m = next as TimelineModel;
      created = [];
      const prev = model;
      model = m;
      // Another period or scale: the scroll offset means another moment now — back to the hour asked, today if shown.
      const rescroll = prev !== null && (!prev.axis.start.equals(m.axis.start) || prev.axis.slotMinutes !== m.axis.slotMinutes);
      root.classList.toggle('dz-tl--days', m.axis.unit === 'day');
      root.classList.toggle('dz-tl--resources', Boolean(m.options.rows));
      root.style.setProperty('--dz-tl-len', String(m.axis.length));
      grouped = m.rows.some((r) => r.kind === 'group');
      sheet.setAttribute('aria-colcount', String((m.options.rows ? columnsOf().length : 0) + 1));
      timehead.setAttribute('aria-colindex', String((m.options.rows ? columnsOf().length : 0) + 1));
      root.style.setProperty('--dz-tl-lanes', String(m.maxLanes));
      sheet.setAttribute('aria-rowcount', String(m.rows.length + 1));
      sheet.setAttribute('aria-label', ctx.kernel.getState().title);
      applyWidths();
      emptyNote(Boolean(m.options.rows) && m.rows.length === 0);
      if (!prev || prev.options.rows !== m.options.rows || ctx.epoch !== cornerEpoch) {
        drawCorner();
        cornerEpoch = ctx.epoch;
      }
      timehead.setAttribute('aria-label', ctx.kernel.getState().title);
      // Rows at the measured heights; a new period keeps the window's rows, the scroll measured again.
      layoutRows(m);
      body.style.height = rowPx > 0 ? `${offsets.offsetOf(m.rows.length)}px` : '';
      // A crowded timeline mounts nothing before its scale is known (500 rows of events, then most of them
      // thrown away, would cost more than the whole window): the measure that follows mounts the window.
      if (!windowed(m)) win = null;
      else if (px <= 0 || win === null) win = { ...EMPTY_WINDOW };
      const hadCursor = activeIn(scroller) === cursorNode;
      syncRows(m);
      // The cursor's row folded away, or another scale (its place means another moment): it starts again,
      // without a place; focused, the keyboard puts it at home and names it.
      if (!cursorNode.isConnected || (rescroll && cursorHits.has(cursorNode))) {
        const fresh = unplacedCursor();
        const old = cursorNode;
        cursorNode = fresh;
        old.remove();
        keptRows.clear();
        if (hadCursor || ((activeIn(scroller) ?? doc.body) === doc.body && cursorWasFocused)) fresh.focus({ preventScroll: true });
        cursorWasFocused = false;
      }
      // A day the zone skipped (Apia, 30 December 2011) has no time to draw: said, as in the time grid.
      skippedNote(m.axis.length === 0);
      drawHeads(m);
      roveHeads();
      if (refocusHead) {
        refocusHead = false;
        [...rowsHost.querySelectorAll<HTMLElement>('.dz-tl__row')].find((x) => x.dataset['key'] === headFocus)?.querySelector<HTMLElement>('.dz-tl__cell[role="rowheader"]')?.focus();
      }
      if (!cursorHits.has(cursorNode)) cursorNode.setAttribute('aria-label', ctx.messages.timeSlots);
      measure(() => {
        if (!m.options.rows) fillLanes();
      });
      if (rescroll) scrollToMinutes(scrollMinutes);
      return created;
    },

    tick(now) {
      const m = model;
      const x = m ? timelineNow(m, now) : null;
      if (x === null) {
        nowEl.remove();
        return;
      }
      nowEl.style.setProperty('--x', String(x));
      if (nowEl.parentElement !== body) body.append(nowEl);
    },

    scrollTo(minutes) {
      scrollMinutes = minutes;
      scrollToMinutes(minutes);
    },

    relayout() {
      measure(() => {
        if (model && !model.options.rows) fillLanes();
      });
    },

    destroy() {
      for (const p of parts.values()) {
        p.bars.clear();
        p.bgs.clear();
        p.mores.clear();
      }
      rows.clear();
      parts.clear();
      root.remove();
    },
  };

  /** To that hour of today when the axis shows today, else of its first day; a day scale: today's column, two before it. */
  function scrollToMinutes(minutes: number): void {
    const m = model;
    if (!m) return;
    // Eased or not as decided now: the place is written a frame later.
    const eased = { motion: ctx.motion, easeScroll: ctx.easeScroll };
    {
      ctx.scheduler.schedule({
        read: () => {
          const area = corner.getBoundingClientRect().width;
          return m.axis.length > 0 ? (sheet.getBoundingClientRect().width - area) / m.axis.length : 0;
        },
        write: (scale) => {
          if (scale <= 0) return;
          const today = ctx.kernel.getState().today;
          const day = m.axis.groups.find((g) => g.date.equals(today)) ?? m.axis.groups[0];
          // Counted in days the heads are months: today's own slot.
          const todaySlot = m.axis.slots.find((x) => x.date.equals(today));
          if (!day) return;
          const at = m.axis.unit === 'day' ? (todaySlot?.start ?? m.axis.start) : Temporal.Instant.fromEpochMilliseconds(day.start.epochMilliseconds + minutes * 60_000);
          scrollEased(eased, scroller, () => scrollAlong(Math.max(0, m.axis.toPosition(at) * scale - (m.axis.unit === 'day' ? scale * 2 : 0))));
          measureWindow();
        },
      });
    }
  }
}

registerView('timeline', createTimelineView);
