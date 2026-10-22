import { Temporal, UNASSIGNED, isUnchanged, proposeMove, proposeResize, selectionBetween } from '@dzcalendar/core';
import { BACKGROUND_NODE, EVENT_NODE } from './handles.js';
import type { EventInstance, Hit, InteractionContext, PlainDate, Proposal, Selection, ZonedDateTime } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';
import { h } from '../render/reconcile.js';
import { commitProposal, timeOf } from './commit.js';
import { clearGhosts, syncGhosts } from './ghosts.js';
import { attachKeyboard } from './keyboard.js';
import type { Box, InteractionSurface } from './surface.js';
import { activeIn } from '../focus.js';
import { dropTarget, registerTarget, tellReceive, targetAt } from './drop.js';
import type { Carried, DropTarget } from './drop.js';

/** Pixels past the calendar's edge a pointer is still on it (an overshoot, the scrollbar). */
const OUT_MARGIN = 8;
/** Pixels a pointer travels before a press becomes a drag: a finger wobbles more than a mouse. */
const THRESHOLD = { mouse: 4, pen: 4, touch: 8 } as const;
/** The edge strip a press must hit to resize: wider for a finger. */
const HANDLE = { mouse: 8, pen: 8, touch: 16 } as const;
/** A press held this long is a long press (the context menu), never a tap. */
const TAP_MS = 500;
/** Autoscroll: the band along the scroller's edge, and the top speed (px per frame). */
const EDGE = 40;
const MAX_SPEED = 18;
/** Holding an event at the calendar's side this long goes to the previous or next period (longer in a month, where the side columns are real targets). */
const EDGE_NAV_MS = { timeGrid: 600, dayGrid: 900, timeline: 900 } as const;
const EDGE_NAV_BAND = 24;

type Mode = { readonly kind: 'move' } | { readonly kind: 'resize'; readonly edge: 'start' | 'end' } | { readonly kind: 'select' };

interface Press {
  readonly id: number;
  readonly type: 'mouse' | 'pen' | 'touch';
  readonly x0: number;
  readonly y0: number;
  readonly at: number;
  readonly mode: Mode;
  readonly instance: EventInstance | null;
  readonly node: HTMLElement | null;
  /** A selection handle was pulled: the other end stays where it is. */
  readonly anchor?: Hit;
}

interface Gesture<G> {
  readonly press: Press;
  geo: G;
  origin: { x: number; y: number };
  scroll0: number;
  scrollY: number;
  /** Horizontal, for a scroller that scrolls both ways (a timeline). */
  scrollX: number;
  scroll0x: number;
  grab: Hit;
  x: number;
  y: number;
  /** The last hit, as a key: an unchanged hit changes nothing (no proposal, no validation). */
  hitKey: string;
  proposal: Proposal | null;
  selection: Selection | null;
  ghosts: HTMLElement[];
  sources: HTMLElement[];
  frame: number;
  edgeSince: number;
  edgeSide: 'prev' | 'next' | null;
  /** The scroller's box and the layer's width, read with the geometry. */
  scrollBox: ScrollBox | null;
  width: number;
  /** The calendar's box: outside it, the event is over another calendar of the page (`away`) or nowhere. */
  rootBox: { left: number; top: number; right: number; bottom: number };
  away: DropTarget | null;
}

/** The scroller's box in the viewport, and how far it can scroll along (a timeline's autoscroll and edge). */
interface ScrollBox {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

const hitKey = (hit: Hit | null) =>
  !hit ? '' : hit.kind === 'slot' ? `s|${hit.instant.epochMilliseconds}|${hit.gap ? 1 : 0}|${hit.resourceId ?? ''}` : `d|${hit.date}|${hit.allDayRow ? 1 : 0}|${hit.resourceId ?? ''}`;

/** What the pointer and the keyboard share on one view. */
export interface InteractionShared<G = unknown> {
  /** This view as the page's drop target (set once made). */
  target?: DropTarget;
  readonly surface: InteractionSurface<G>;
  /** The preview layer (ghosts, the selection). */
  readonly layer: HTMLElement;
  /** A drop is waiting for a choice (scope, reading): no new gesture until it settles. */
  busy: boolean;
  /** The keyboard holds an event (grab mode): pointer presses do not start gestures. */
  holding: boolean;
  /** The context proposals are made in: the store now, the rules, the snap. */
  interaction(inst: EventInstance | null): InteractionContext;
  layerOrigin(): { x: number; y: number };
  /** The selection on screen, until it is cleared — a pointer's, a finger's (with handles) or the keyboard's. */
  readonly selection: Selection | null;
  /** `silent`: the application asked (`instance.select`) — it is not told back. */
  showSelection(sel: Selection | null, o?: { readonly handles?: boolean; readonly silent?: boolean }): void;
}

/** What the calendar holds of a view's interactions. */
export interface Interactions {
  /** After a paint: the selection is drawn again where the view now shows it. */
  refresh(): void;
  /** The context menu's "Move…" and "Change duration…": the keyboard's grab mode on this event. */
  grab(instance: EventInstance, kind: 'move' | 'resize'): void;
  select(sel: Selection | null): void;
  /** Gives the focus back after the calendar changed under it (undo, redo): to the event, else the cursor. */
  refocus(eventId: string | null): void;
}

/**
 * Pointer gestures on a view: drag and resize events, select time, click.
 * Mouse, pen and touch take one path. A touch on an event first selects it
 * (handles appear, `aria-pressed`); a drag on a selected event starts at
 * once, with no long press, and only that event blocks scrolling
 * (`touch-action: none` on it alone). What goes where is decided by the
 * core (`proposeMove`, `proposeResize`), and what happens on a drop by
 * `commitProposal` — the same for the keyboard, attached here too.
 */
export function attachInteractions<G>(ctx: ViewCtx, surface: InteractionSurface<G>): Interactions {
  const doc = ctx.doc;
  const win = doc.defaultView!;
  const root = surface.root;
  const layer = h(doc, 'div', 'dz-ghosts');
  layer.setAttribute('aria-hidden', 'true');
  root.append(layer);

  let press: Press | null = null;
  let gesture: Gesture<G> | null = null;
  let selected: HTMLElement | null = null;

  // ── the selection on screen ─────────────────────────────────────────────
  let selection: Selection | null = null;
  let selectionHandles = false;
  const selectionGhosts: HTMLElement[] = [];
  let selectionFrame = 0;
  let rangeKey = '';
  const rangeNow = () => {
    const r = ctx.kernel.getState().range;
    return `${r.start}|${r.end}`;
  };
  function drawSelection(): void {
    selectionFrame = 0;
    if (!selection) return clearGhosts(selectionGhosts);
    const geo = surface.measure(shared.layerOrigin());
    syncGhosts(layer, selectionGhosts, surface.boxesFor(geo, selection, 0), { kind: 'select', handles: selectionHandles }, { invalid: false, time: '' });
    for (const g of selectionGhosts) g.classList.add('dz-ghost--armed');
  }
  const queueSelection = () => {
    if (selection && !selectionFrame) selectionFrame = win.requestAnimationFrame(drawSelection);
  };

  const shared: InteractionShared<G> = {
    surface,
    layer,
    busy: false,
    holding: false,
    interaction(inst) {
      const state = ctx.kernel.getState();
      const rules = ctx.rules();
      return {
        snap: ctx.kernel.store.snapshot,
        displayZone: state.timeZone,
        snapMinutes: ctx.snapMinutes,
        ...(rules && { rules }),
        // A series may move as a whole (the scope is asked on the drop): its own occurrences are not in the way of the preview.
        ...(inst?.event.ref && { movingSeries: inst.event.ref.seriesId }),
        // A timeline has no all-day row: an all-day event stays one, moved by days.
        ...(surface.family === 'timeline' && { keepAllDay: true }),
      };
    },
    layerOrigin() {
      const r = layer.getBoundingClientRect();
      return { x: r.left, y: r.top };
    },
    get selection() {
      return selection;
    },
    showSelection(sel, o = {}) {
      // A shown selection going away (a click elsewhere, Escape, another period): said, so a binding can follow.
      const cleared = selection !== null && sel === null && o.silent !== true;
      selection = sel;
      selectionHandles = o.handles === true;
      rangeKey = rangeNow();
      if (selectionFrame) win.cancelAnimationFrame(selectionFrame);
      selectionFrame = 0;
      drawSelection();
      if (cleared) ctx.live().onUnselect?.();
    },
  };
  const interaction = shared.interaction;
  const layerOrigin = shared.layerOrigin;
  // This view on the page's drop targets: what is dragged in from the page or another calendar.
  const self = dropTarget(ctx, shared);
  shared.target = self;
  ctx.scope.add(registerTarget(doc, self));

  const select = (node: HTMLElement | null) => {
    if (selected === node) return;
    if (selected?.isConnected) {
      selected.classList.remove('dz-ev--selected');
      selected.removeAttribute('data-selected');
      selected.removeAttribute('aria-pressed');
    }
    selected = node;
    if (node) {
      node.classList.add('dz-ev--selected');
      node.setAttribute('data-selected', '');
      node.setAttribute('aria-pressed', 'true');
    }
  };

  const editableNode = (node: HTMLElement, inst: EventInstance) => ctx.live().editable === true && (inst.event.perms.start || inst.event.perms.duration) && !node.matches(BACKGROUND_NODE);

  /** Which edge a press on an event grabbed: the end strip (or the start one), else the body. */
  function modeAt(node: HTMLElement, inst: EventInstance, x: number, y: number, type: Press['type']): Mode {
    if (!inst.event.perms.duration) return { kind: 'move' };
    const r = node.getBoundingClientRect();
    const band = Math.min(HANDLE[type], r.height / 3, r.width / 3);
    const horizontal = surface.family !== 'timeGrid' || inst.event.allDay;
    const rtl = root.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const nearEnd = horizontal ? (rtl ? x - r.left < band : r.right - x < band) : r.bottom - y < band;
    const nearStart = horizontal ? (rtl ? r.right - x < band : x - r.left < band) : y - r.top < band;
    if (nearEnd && node.dataset['resizeEnd'] === '1') return { kind: 'resize', edge: 'end' };
    if (nearStart && node.dataset['resizeStart'] === '1' && ctx.live().eventResizableFromStart) return { kind: 'resize', edge: 'start' };
    return { kind: 'move' };
  }

  ctx.scope.on(root, 'pointerdown', (e) => {
    const pe = e as PointerEvent;
    if (gesture || shared.busy || shared.holding || (pe.pointerType === 'mouse' && pe.button !== 0) || !(pe.target instanceof Element)) return;
    const type = (pe.pointerType === 'touch' || pe.pointerType === 'pen' ? pe.pointerType : 'mouse') as Press['type'];
    // A selection's handle: the other end stays, this one follows the pointer.
    const handle = pe.target.closest('.dz-ghost__handle');
    if (handle && selection) {
      const anchor = endHit(selection, handle.classList.contains('dz-ghost__handle--start') ? 'end' : 'start');
      press = { id: pe.pointerId, type, x0: pe.clientX, y0: pe.clientY, at: win.performance.now(), mode: { kind: 'select' }, instance: null, node: null, anchor };
      pe.preventDefault();
      return;
    }
    // Headers, the gutter, links, buttons and the scrollbar are not the calendar's time. A free slot is,
    // when the application takes no slot clicks: a press there clicks, selects and drags as on empty time.
    const button = pe.target.closest('.dz-more, .dz-dg__num, button, a');
    if ((button && !(button.classList.contains('dz-slot') && !ctx.live().onSlotClick)) || !surface.accepts(pe.target)) return;
    const node = pe.target.closest<HTMLElement>(EVENT_NODE);
    const inst = node ? surface.instanceOf(node) : null;
    const base = { id: pe.pointerId, type, x0: pe.clientX, y0: pe.clientY, at: win.performance.now() };
    if (node && inst) {
      // A finger on an event that is not selected: let the page scroll; a tap will select it.
      const draggable = editableNode(node, inst) && (type !== 'touch' || selected === node);
      press = { ...base, mode: draggable ? modeAt(node, inst, pe.clientX, pe.clientY, type) : { kind: 'move' }, instance: draggable ? inst : null, node };
      if (draggable && type !== 'touch') {
        pe.preventDefault(); // no text selection while dragging…
        (surface.focusTarget?.(node) ?? node).focus({ preventScroll: true }); // …which also cancels the focus a click gives: given back here.
      }
      return;
    }
    press = { ...base, mode: { kind: 'select' }, instance: null, node: null };
  });

  ctx.scope.on(doc, 'pointermove', (e) => {
    const pe = e as PointerEvent;
    if (gesture && pe.pointerId === gesture.press.id) {
      gesture.x = pe.clientX;
      gesture.y = pe.clientY;
      queue();
      return;
    }
    if (!press || pe.pointerId !== press.id) return;
    if (Math.hypot(pe.clientX - press.x0, pe.clientY - press.y0) < THRESHOLD[press.type]) return;
    const p = press;
    press = null;
    // A finger moving from an unselected event, or from empty space, is a scroll — not from a selection's handle.
    if (p.type === 'touch' && !p.anchor && (p.mode.kind === 'select' || !p.instance)) return;
    if (p.mode.kind !== 'select' && !p.instance) return;
    if (p.mode.kind === 'select' && !ctx.live().selectable) return;
    start(p, pe);
  });

  ctx.scope.on(doc, 'pointerup', (e) => {
    const pe = e as PointerEvent;
    if (gesture && pe.pointerId === gesture.press.id) {
      gesture.x = pe.clientX;
      gesture.y = pe.clientY;
      void drop();
      return;
    }
    if (!press || pe.pointerId !== press.id) return;
    const p = press;
    press = null;
    // A long press opened the context menu: it was not a tap.
    if (win.performance.now() - p.at > TAP_MS) return;
    click(p, pe);
  });

  const abandon = (e?: Event) => {
    const pe = e as PointerEvent | undefined;
    if (gesture && (!pe || pe.pointerId === undefined || pe.pointerId === gesture.press.id)) cancel();
    if (press && (!pe || pe.pointerId === undefined || pe.pointerId === press.id)) press = null;
  };
  ctx.scope.on(doc, 'pointercancel', abandon);
  ctx.scope.on(root, 'lostpointercapture', (e) => {
    // The root itself lost the pointer (released outside the window): the gesture ends, nothing changes.
    // A child losing it bubbles here too — the touch's implicit capture on the event, taken over by the root: ignored.
    if (e.target === root && gesture && (e as PointerEvent).pointerId === gesture.press.id && !dropping) cancel();
  });
  ctx.scope.on(win, 'blur', () => abandon());

  // Escape during a pointer gesture cancels it — heard first (capture), before the focused event's own keys take it.
  ctx.scope.on(
    doc,
    'keydown',
    (e) => {
      if (gesture && (e as KeyboardEvent).key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    },
    { capture: true },
  );
  ctx.scope.on(win, 'resize', queueSelection);

  // Scroll is followed by events, never read during a move.
  if (surface.scroller) {
    const sc = surface.scroller;
    ctx.scope.on(
      sc,
      'scroll',
      () => {
        queueSelection();
        if (!gesture) return;
        gesture.scrollY = sc.scrollTop - gesture.scroll0;
        gesture.scrollX = sc.scrollLeft - gesture.scroll0x;
        queue();
      },
      { passive: true },
    );
  }
  // The page itself scrolled: what was measured in the viewport moved — measure again.
  ctx.scope.on(
    win,
    'scroll',
    (e) => {
      if (!gesture || e.target === surface.scroller) return;
      remeasure(gesture);
    },
    { passive: true, capture: true },
  );

  ctx.scope.add(() => {
    if (gesture) cancel();
    if (selectionFrame) win.cancelAnimationFrame(selectionFrame);
    layer.remove();
    // Another view family: the selection shown goes with this one — said, as when it is cleared.
    if (shared.selection) ctx.live().onUnselect?.();
  });

  function click(p: Press, pe: PointerEvent): void {
    if (p.node) {
      const inst = surface.instanceOf(p.node);
      if (p.type === 'touch' && inst && editableNode(p.node, inst)) select(selected === p.node ? null : p.node);
      if (inst) ctx.live().onEventClick?.(inst);
      return;
    }
    select(null);
    shared.showSelection(null);
    const geo = surface.measure(layerOrigin());
    const hit = surface.hitAt(geo, pe.clientX, pe.clientY, 0);
    if (!hit) return;
    const live = ctx.live();
    // "Unassigned" is the view's own row, not a resource: the application hears none.
    const resource = hit.resourceId !== undefined && hit.resourceId !== UNASSIGNED ? { resourceId: hit.resourceId } : {};
    live.onDateClick?.(hit.kind === 'slot' ? { allDay: false, date: hit.date, instant: hit.instant, ...resource } : { allDay: true, date: hit.date, ...resource });
    // A tap on a touch screen selects one slot, with two handles to pull its ends.
    if (p.type === 'touch' && live.selectable) {
      const sel = selectionBetween(interaction(null), hit, hit);
      shared.showSelection(sel, { handles: true });
      live.onSelect?.(sel);
    }
  }

  /** The scroller's box and the layer's width: read when the geometry is. */
  function boxesRead(): { scrollBox: ScrollBox | null; width: number } {
    const sc = surface.scroller;
    const r = sc?.getBoundingClientRect();
    // What sticks inside the scroller (a timeline's resource area, its heads) is not its edge: the edge zones start past it.
    const inset = surface.insets?.() ?? { start: 0, top: 0 };
    const rtl = root.closest('[dir]')?.getAttribute('dir') === 'rtl';
    return {
      scrollBox:
        sc && r
          ? { top: r.top + inset.top, bottom: r.bottom, left: r.left + (rtl ? 0 : inset.start), right: r.right - (rtl ? inset.start : 0), scrollWidth: sc.scrollWidth, clientWidth: sc.clientWidth }
          : null,
      width: layer.clientWidth,
    };
  }

  function remeasure(g: Gesture<G>): void {
    g.origin = layerOrigin();
    g.geo = surface.measure(g.origin);
    Object.assign(g, boxesRead());
    g.scroll0 = surface.scroller?.scrollTop ?? 0;
    g.scrollY = 0;
    g.scroll0x = surface.scroller?.scrollLeft ?? 0;
    g.scrollX = 0;
    g.hitKey = '';
    queue();
  }

  function start(p: Press, pe: PointerEvent): void {
    // One read for the whole gesture.
    const origin = layerOrigin();
    const geo = surface.measure(origin);
    const grab = p.anchor ?? surface.hitAt(geo, p.x0, p.y0, 0);
    if (!grab) return;
    if (p.mode.kind === 'select') shared.showSelection(null);
    const id = p.instance?.event.id;
    gesture = {
      press: p,
      geo,
      origin,
      scroll0: surface.scroller?.scrollTop ?? 0,
      scrollY: 0,
      scroll0x: surface.scroller?.scrollLeft ?? 0,
      scrollX: 0,
      grab,
      x: pe.clientX,
      y: pe.clientY,
      hitKey: '',
      proposal: null,
      selection: null,
      ghosts: [],
      // Every piece of the event dims, not only the one pressed.
      sources: id ? [...root.querySelectorAll<HTMLElement>(`:is(${EVENT_NODE})[data-event-id="${cssEscape(id)}"]`)] : [],
      frame: 0,
      edgeSince: 0,
      edgeSide: null,
      rootBox: root.getBoundingClientRect(),
      away: null,
      ...boxesRead(),
    };
    try {
      root.setPointerCapture(p.id);
    } catch {
      /* the pointer is already gone */
    }
    root.classList.add(p.mode.kind === 'select' ? 'dz-selecting' : 'dz-dragging');
    for (const n of gesture.sources) n.classList.add('dz-ev--source'), n.setAttribute('data-moving', '');
    if (p.mode.kind === 'select') root.setAttribute('data-selecting', '');
    else root.setAttribute('data-dragging', '');
    compute(gesture);
    draw(gesture);
    if (p.mode.kind !== 'select') ctx.motion.dragStart?.(gesture.ghosts, p.mode.kind);
  }

  function queue(): void {
    if (!gesture || gesture.frame) return;
    gesture.frame = win.requestAnimationFrame(() => {
      const g = gesture;
      if (!g) return;
      g.frame = 0;
      // Out of this calendar with an event: over another one of the page, it is shown there; nowhere, nothing lands.
      if (outside(g)) return;
      if (compute(g)) draw(g);
      autoscroll(g);
      edgeNavigate(g);
    });
  }

  /** What a moved event is to the page's other calendars. */
  const carriedOf = (g: Gesture<G>): Carried | null =>
    g.press.mode.kind === 'move' && g.press.instance ? { kind: 'calendar', instance: g.press.instance, from: { kernel: ctx.kernel } } : null;

  /**
   * Outside the calendar's box: another calendar of the page under the
   * pointer shows the event there (this one shows nothing); none, nothing
   * lands. No autoscroll, no edge navigation from out there. True while out.
   */
  function outside(g: Gesture<G>): boolean {
    const out = isOut(g);
    const c = carriedOf(g);
    if (!out || !c) {
      if (g.away) {
        g.away.leave();
        g.away = null;
        g.hitKey = '';
      }
      return false;
    }
    const other = targetAt(doc, g.x, g.y, c, self);
    if (other !== g.away) {
      g.away?.leave();
      g.away = other;
    }
    other?.over(c, g.x, g.y);
    g.proposal = null;
    g.hitKey = '';
    clearGhosts(g.ghosts);
    return true;
  }

  /**
   * Dropped on another calendar: made there, then taken from here — or
   * nothing at all (here refusing, there is taken back, never told). Said and
   * told once both are done: `onEventReceive` there, `onEventLeave` here,
   * one revert for both. One store (four zones of one agenda): a move there.
   */
  async function dropAway(g: Gesture<G>, to: DropTarget): Promise<void> {
    const c = carriedOf(g)!;
    const inst = g.press.instance!;
    const shared1 = to.ctx.kernel.store === ctx.kernel.store;
    shared.busy = true;
    try {
      const received = await to.drop(c, { quiet: !shared1 });
      if (!received?.change) return;
      // One store: a move, told there (the event is still the one shown here, in this zone).
      if (shared1) return tellReceive(to.ctx, received.change);
      const there = received.change;
      // This calendar went while the other one asked (a chooser): the event stays here, not made there.
      if (ctx.scope.isDisposed) {
        there.revert();
        return;
      }
      const ev = inst.event;
      const command = ev.ref ? ({ type: 'event.delete', id: ev.ref.seriesId, key: ev.ref.key, scope: 'this' } as const) : ({ type: 'event.delete', id: ev.id } as const);
      const left = ctx.capture(() => ctx.kernel.run(command, { validate: true }));
      if (!left.result.ok) {
        // It cannot leave here: it is not made there either (never told there).
        there.revert();
        ctx.refused(left.result, command);
        return;
      }
      // There first: if it cannot be taken back there (changed since), it is not put back here either — never on both.
      const revert = () => there.revert() && (left.change?.revert() ?? false);
      if (!to.ctx.scope.isDisposed) to.ctx.announce(received.words);
      tellReceive(to.ctx, { ...there, revert });
      try {
        ctx.live().onEventLeave?.({ event: ev, to: to.root, revert });
      } catch (err) {
        void Promise.reject(err);
      }
    } finally {
      shared.busy = false;
    }
  }

  /** The proposal (or selection) for the pointer's place. False when the hit did not change. No side effect. */
  function compute(g: Gesture<G>): boolean {
    const hit = surface.hitAt(g.geo, g.x, g.y, g.scrollY, g.scrollX);
    const key = hitKey(hit);
    if (key === g.hitKey && key !== '') return false;
    g.hitKey = key;
    if (!hit) {
      // Off the calendar's time (a skipped day, outside): nothing would land — no ghost, and a drop now does nothing.
      g.proposal = null;
      g.selection = null;
      return true;
    }
    const ic = interaction(g.press.instance);
    if (g.press.mode.kind === 'select') g.selection = selectionBetween(ic, g.grab, hit);
    else if (g.press.instance) {
      const ev = g.press.instance.event;
      g.proposal = g.press.mode.kind === 'move' ? proposeMove(ic, ev, g.grab, hit) : proposeResize(ic, ev, g.press.mode.edge, hit);
    }
    return true;
  }

  function draw(g: Gesture<G>): void {
    const span = g.press.mode.kind === 'select' ? g.selection : g.proposal;
    const boxes: Box[] = span ? surface.boxesFor(g.geo, span, g.scrollY, g.scrollX) : [];
    const time = g.proposal ? timeOf(ctx, g.press.mode.kind === 'resize' && g.press.mode.edge === 'end' ? g.proposal.end : g.proposal.start, g.proposal) : '';
    const look = g.press.mode.kind === 'select'
      ? { kind: 'select' as const, handles: g.press.type === 'touch' }
      : { kind: 'event' as const, node: g.press.node, instance: g.press.instance, title: g.press.instance?.event.title || ctx.messages.untitled };
    syncGhosts(layer, g.ghosts, boxes, look, { invalid: g.proposal ? !g.proposal.valid : false, time });
  }

  /** Near the scroller's top or bottom edge, inside it, it scrolls — faster the closer — and the hit follows by the scroll event. */
  function autoscroll(g: Gesture<G>): void {
    const sc = surface.scroller;
    const b = g.scrollBox;
    // Above or below the scroller (the all-day row, the headers) is not "near its edge".
    if (!sc || !b || g.y < b.top || g.y > b.bottom) return;
    let v = 0;
    if (g.y < b.top + EDGE) v = -MAX_SPEED * ((b.top + EDGE - g.y) / EDGE);
    else if (g.y > b.bottom - EDGE) v = MAX_SPEED * ((g.y - (b.bottom - EDGE)) / EDGE);
    // A timeline scrolls along time too, near its left and right edges.
    let vx = 0;
    if (surface.family === 'timeline') {
      if (g.x < b.left + EDGE) vx = -MAX_SPEED * Math.min(1, (b.left + EDGE - g.x) / EDGE);
      else if (g.x > b.right - EDGE) vx = MAX_SPEED * Math.min(1, (g.x - (b.right - EDGE)) / EDGE);
    }
    if (v === 0 && vx === 0) return;
    // scrollBy writes without reading layout first.
    sc.scrollBy(vx, v);
    queue();
  }

  function edgeNavigate(g: Gesture<G>): void {
    if (g.press.mode.kind !== 'move' || ctx.live().dragEdgeNavigate === false) return;
    const left = g.origin.x;
    const right = left + g.width;
    const rtl = root.closest('[dir]')?.getAttribute('dir') === 'rtl';
    let side: 'prev' | 'next' | null = g.x < left + EDGE_NAV_BAND ? (rtl ? 'next' : 'prev') : g.x > right - EDGE_NAV_BAND ? (rtl ? 'prev' : 'next') : null;
    // A timeline changes period only once it has scrolled to that end (autoscroll goes first).
    const box = g.scrollBox;
    if (side && surface.family === 'timeline' && box) {
      const at = g.scroll0x + g.scrollX;
      // |scrollLeft| is the distance from the start of time in either direction: 'prev' is at 0.
      const toStart = side === 'prev';
      if (toStart ? Math.abs(at) > 1 : Math.abs(at) < box.scrollWidth - box.clientWidth - 1) side = null;
    }
    if (side !== g.edgeSide) {
      g.edgeSide = side;
      g.edgeSince = win.performance.now();
    }
    if (!side) return;
    if (win.performance.now() - g.edgeSince < EDGE_NAV_MS[surface.family]) {
      queue();
      return;
    }
    g.edgeSince = win.performance.now();
    ctx.kernel.navigate(side);
    // The view drew another period (and may slide in): measure again now, and once it has settled.
    win.requestAnimationFrame(() => gesture === g && remeasure(g));
    win.setTimeout(() => gesture === g && remeasure(g), 350);
  }

  function end(): Gesture<G> | null {
    const g = gesture;
    gesture = null;
    if (!g) return null;
    if (g.frame) win.cancelAnimationFrame(g.frame);
    try {
      if (root.hasPointerCapture?.(g.press.id)) root.releasePointerCapture(g.press.id);
    } catch {
      /* released already */
    }
    root.classList.remove('dz-dragging', 'dz-selecting');
    root.removeAttribute('data-dragging');
    root.removeAttribute('data-selecting');
    for (const n of g.sources) n.classList.remove('dz-ev--source'), n.removeAttribute('data-moving');
    return g;
  }

  function cancel(): void {
    const g = end();
    g?.away?.leave();
    if (g) clearGhosts(g.ghosts);
  }
  /**
   * Out of the calendar: its box read again (the page may have scrolled, a
   * month grown a row), with a margin — a pointer a few pixels past the
   * last column or the scrollbar is still on it.
   */
  const isOut = (g: Gesture<G>) => {
    const b = (g.rootBox = root.getBoundingClientRect());
    return g.x < b.left - OUT_MARGIN || g.x > b.right + OUT_MARGIN || g.y < b.top - OUT_MARGIN || g.y > b.bottom + OUT_MARGIN;
  };

  let dropping = false;
  async function drop(): Promise<void> {
    const g = gesture;
    if (!g) return;
    // The last position, computed without the side effects (no autoscroll, no navigation on a drop).
    g.hitKey = '';
    const away = outside(g) ? g.away : null;
    if (!away && !g.away) compute(g);
    dropping = true;
    end();
    dropping = false;
    if (away) {
      clearGhosts(g.ghosts);
      return dropAway(g, away);
    }
    // Released out of every calendar: nothing lands (not the nearest edge).
    if (g.press.mode.kind === 'move' && isOut(g)) return clearGhosts(g.ghosts);
    if (g.press.mode.kind === 'select') {
      clearGhosts(g.ghosts);
      // The selection stays on screen until a click elsewhere or Escape; a finger's keeps its handles.
      shared.showSelection(g.selection, { handles: g.press.type === 'touch' });
      if (g.selection) ctx.live().onSelect?.(g.selection);
      return;
    }
    const p = g.proposal;
    const inst = g.press.instance;
    if (!p || !inst || isUnchanged(p)) return clearGhosts(g.ghosts);
    shared.busy = true;
    try {
      const outcome = await commitProposal(ctx, {
        instance: inst,
        proposal: p,
        kind: g.press.mode.kind === 'resize' ? 'resize' : 'move',
        ...(g.press.mode.kind === 'resize' && { edge: g.press.mode.edge }),
        at: { x: g.x, y: g.y },
        from: g.ghosts[0] ? g.ghosts[0].getBoundingClientRect() : null,
        source: g.press.node,
        ghosts: g.ghosts,
        root,
      });
      // On a touch screen the event stays selected where it landed, ready for the next drag.
      if (outcome.done && g.press.type === 'touch' && outcome.landed) select(outcome.landed);
      // The pressed node went with the old place (another column, another week): the focus follows the event.
      if (outcome.done && outcome.eventId && g.press.type !== 'touch' && !root.contains(activeIn(root))) keyboard.refocus(outcome.eventId);
    } catch (err) {
      // An application callback (chooseScope, a hook) failed: the gesture still ends, the error stays visible.
      void Promise.reject(err);
    } finally {
      shared.busy = false;
      clearGhosts(g.ghosts);
    }
  }

  /** The hit at one end of a selection: its first slot or day, or its last. */
  function endHit(sel: Selection, end: 'start' | 'end'): Hit {
    const row = surface.family === 'timeGrid' ? { allDayRow: true } : {};
    if (sel.allDay) {
      const date = end === 'start' ? (sel.start as PlainDate) : (sel.end as PlainDate).subtract({ days: 1 });
      return { kind: 'day', date, ...row };
    }
    const zone = ctx.kernel.getState().timeZone;
    // The last slot holds the minute before the end.
    const instant = end === 'start' ? (sel.start as ZonedDateTime).toInstant() : Temporal.Instant.fromEpochMilliseconds((sel.end as ZonedDateTime).epochMilliseconds - 60_000);
    return { kind: 'slot', date: instant.toZonedDateTimeISO(zone).toPlainDate(), instant };
  }

  const keyboard = attachKeyboard(ctx, shared);

  return {
    refresh() {
      // No longer editable: an event selected by a touch is let go (its handles mean nothing now).
      if (selected && ctx.live().editable !== true) select(null);
      if (!selection) return;
      // Another period: the selection was of the one left.
      if (rangeNow() !== rangeKey) return shared.showSelection(null);
      queueSelection();
    },
    grab: (instance, kind) => keyboard.grab(instance, kind),
    select: (sel) => shared.showSelection(sel, { silent: true }),
    refocus: (id) => keyboard.refocus(id),
  };
}

const cssEscape = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));
