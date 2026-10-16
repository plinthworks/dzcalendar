import { isUnchanged, proposeMove, proposeResize, selectionBetween } from '@dzcalendar/core';
import type { EventInstance, Hit, InteractionContext, Proposal, Selection } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';
import { h } from '../render/reconcile.js';
import { commitProposal, timeOf } from './commit.js';
import type { Box, InteractionSurface } from './surface.js';

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
const EDGE_NAV_MS = { timeGrid: 600, dayGrid: 900 } as const;
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
}

interface Gesture<G> {
  readonly press: Press;
  geo: G;
  origin: { x: number; y: number };
  scroll0: number;
  scrollY: number;
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
  scrollBox: { top: number; bottom: number } | null;
  width: number;
}

const hitKey = (hit: Hit | null) =>
  !hit ? '' : hit.kind === 'slot' ? `s|${hit.instant.epochMilliseconds}|${hit.gap ? 1 : 0}|${hit.resourceId ?? ''}` : `d|${hit.date}|${hit.allDayRow ? 1 : 0}|${hit.resourceId ?? ''}`;

/**
 * Pointer gestures on a view: drag and resize events, select time, click.
 * Mouse, pen and touch take one path. A touch on an event first selects it
 * (handles appear, `aria-pressed`); a drag on a selected event starts at
 * once, with no long press, and only that event blocks scrolling
 * (`touch-action: none` on it alone). What goes where is decided by the
 * core (`proposeMove`, `proposeResize`), and what happens on a drop by
 * `commitProposal` — the same for the keyboard.
 */
export function attachInteractions<G>(ctx: ViewCtx, surface: InteractionSurface<G>): void {
  const doc = ctx.doc;
  const win = doc.defaultView!;
  const root = surface.root;
  const layer = h(doc, 'div', 'dz-ghosts');
  layer.setAttribute('aria-hidden', 'true');
  root.append(layer);

  let press: Press | null = null;
  let gesture: Gesture<G> | null = null;
  /** A drop is waiting for a choice (scope, reading): no new gesture until it settles. */
  let busy = false;
  let selected: HTMLElement | null = null;

  const interaction = (inst: EventInstance | null): InteractionContext => {
    const state = ctx.kernel.getState();
    const rules = ctx.rules();
    return {
      snap: ctx.kernel.store.snapshot,
      displayZone: state.timeZone,
      snapMinutes: ctx.snapMinutes,
      ...(rules && { rules }),
      // A series may move as a whole (the scope is asked on the drop): its own occurrences are not in the way of the preview.
      ...(inst?.event.ref && { movingSeries: inst.event.ref.seriesId }),
    };
  };

  const select = (node: HTMLElement | null) => {
    if (selected === node) return;
    if (selected?.isConnected) {
      selected.classList.remove('dz-ev--selected');
      selected.removeAttribute('aria-pressed');
    }
    selected = node;
    if (node) {
      node.classList.add('dz-ev--selected');
      node.setAttribute('aria-pressed', 'true');
    }
  };

  const editableNode = (node: HTMLElement, inst: EventInstance) => ctx.live().editable === true && (inst.event.perms.start || inst.event.perms.duration) && !node.matches('.dz-ev--bg, .dz-bar--bg');

  /** Which edge a press on an event grabbed: the end strip (or the start one), else the body. */
  function modeAt(node: HTMLElement, inst: EventInstance, x: number, y: number, type: Press['type']): Mode {
    if (!inst.event.perms.duration) return { kind: 'move' };
    const r = node.getBoundingClientRect();
    const band = Math.min(HANDLE[type], r.height / 3, r.width / 3);
    const horizontal = surface.family === 'dayGrid' || inst.event.allDay;
    const rtl = root.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const nearEnd = horizontal ? (rtl ? x - r.left < band : r.right - x < band) : r.bottom - y < band;
    const nearStart = horizontal ? (rtl ? r.right - x < band : x - r.left < band) : y - r.top < band;
    if (nearEnd && node.dataset['resizeEnd'] === '1') return { kind: 'resize', edge: 'end' };
    if (nearStart && node.dataset['resizeStart'] === '1' && ctx.live().eventResizableFromStart) return { kind: 'resize', edge: 'start' };
    return { kind: 'move' };
  }

  ctx.scope.on(root, 'pointerdown', (e) => {
    const pe = e as PointerEvent;
    if (gesture || busy || (pe.pointerType === 'mouse' && pe.button !== 0) || !(pe.target instanceof Element)) return;
    // Headers, the gutter, links, buttons and the scrollbar are not the calendar's time.
    if (pe.target.closest('.dz-more, .dz-dg__num, button, a') || !surface.accepts(pe.target)) return;
    const type = (pe.pointerType === 'touch' || pe.pointerType === 'pen' ? pe.pointerType : 'mouse') as Press['type'];
    const node = pe.target.closest<HTMLElement>('.dz-ev, .dz-bar');
    const inst = node ? surface.instanceOf(node) : null;
    const base = { id: pe.pointerId, type, x0: pe.clientX, y0: pe.clientY, at: win.performance.now() };
    if (node && inst) {
      // A finger on an event that is not selected: let the page scroll; a tap will select it.
      const draggable = editableNode(node, inst) && (type !== 'touch' || selected === node);
      press = { ...base, mode: draggable ? modeAt(node, inst, pe.clientX, pe.clientY, type) : { kind: 'move' }, instance: draggable ? inst : null, node };
      if (draggable && type !== 'touch') {
        pe.preventDefault(); // no text selection while dragging…
        node.focus({ preventScroll: true }); // …which also cancels the focus a click gives: given back here.
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
    // A finger moving from an unselected event, or from empty space, is a scroll.
    if (p.type === 'touch' && (p.mode.kind === 'select' || !p.instance)) return;
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

  ctx.scope.on(doc, 'keydown', (e) => {
    if (gesture && (e as KeyboardEvent).key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  // Scroll is followed by events, never read during a move.
  if (surface.scroller) {
    const sc = surface.scroller;
    ctx.scope.on(
      sc,
      'scroll',
      () => {
        if (!gesture) return;
        gesture.scrollY = sc.scrollTop - gesture.scroll0;
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
    layer.remove();
  });

  function click(p: Press, pe: PointerEvent): void {
    if (p.node) {
      const inst = surface.instanceOf(p.node);
      if (p.type === 'touch' && inst && editableNode(p.node, inst)) select(selected === p.node ? null : p.node);
      if (inst) ctx.live().onEventClick?.(inst);
      return;
    }
    select(null);
    const geo = surface.measure(layerOrigin());
    const hit = surface.hitAt(geo, pe.clientX, pe.clientY, 0);
    if (!hit) return;
    const live = ctx.live();
    live.onDateClick?.(hit.kind === 'slot' ? { allDay: false, date: hit.date, instant: hit.instant } : { allDay: true, date: hit.date });
    // A tap on a touch screen selects one slot (adjusting it by handles: Phase 8).
    if (p.type === 'touch' && live.selectable && live.onSelect) live.onSelect(selectionBetween(interaction(null), hit, hit));
  }

  function layerOrigin(): { x: number; y: number } {
    const r = layer.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }

  /** The scroller's box and the layer's width: read when the geometry is. */
  function boxesRead(): { scrollBox: { top: number; bottom: number } | null; width: number } {
    const r = surface.scroller?.getBoundingClientRect();
    return { scrollBox: r ? { top: r.top, bottom: r.bottom } : null, width: layer.clientWidth };
  }

  function remeasure(g: Gesture<G>): void {
    g.origin = layerOrigin();
    g.geo = surface.measure(g.origin);
    Object.assign(g, boxesRead());
    g.scroll0 = surface.scroller?.scrollTop ?? 0;
    g.scrollY = 0;
    g.hitKey = '';
    queue();
  }

  function start(p: Press, pe: PointerEvent): void {
    // One read for the whole gesture.
    const origin = layerOrigin();
    const geo = surface.measure(origin);
    const grab = surface.hitAt(geo, p.x0, p.y0, 0);
    if (!grab) return;
    const id = p.instance?.event.id;
    gesture = {
      press: p,
      geo,
      origin,
      scroll0: surface.scroller?.scrollTop ?? 0,
      scrollY: 0,
      grab,
      x: pe.clientX,
      y: pe.clientY,
      hitKey: '',
      proposal: null,
      selection: null,
      ghosts: [],
      // Every piece of the event dims, not only the one pressed.
      sources: id ? [...root.querySelectorAll<HTMLElement>(`[data-event-id="${cssEscape(id)}"]`)] : [],
      frame: 0,
      edgeSince: 0,
      edgeSide: null,
      ...boxesRead(),
    };
    try {
      root.setPointerCapture(p.id);
    } catch {
      /* the pointer is already gone */
    }
    root.classList.add(p.mode.kind === 'select' ? 'dz-selecting' : 'dz-dragging');
    for (const n of gesture.sources) n.classList.add('dz-ev--source');
    compute(gesture);
    draw(gesture);
    if (p.mode.kind !== 'select') ctx.motion.dragStart?.(gesture.ghosts);
  }

  function queue(): void {
    if (!gesture || gesture.frame) return;
    gesture.frame = win.requestAnimationFrame(() => {
      const g = gesture;
      if (!g) return;
      g.frame = 0;
      if (compute(g)) draw(g);
      autoscroll(g);
      edgeNavigate(g);
    });
  }

  /** The proposal (or selection) for the pointer's place. False when the hit did not change. No side effect. */
  function compute(g: Gesture<G>): boolean {
    const hit = surface.hitAt(g.geo, g.x, g.y, g.scrollY);
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
    const boxes: Box[] = span ? surface.boxesFor(g.geo, span, g.scrollY) : [];
    const select = g.press.mode.kind === 'select';
    while (g.ghosts.length < boxes.length) {
      const el = h(doc, 'div', select ? 'dz-ghost dz-ghost--select' : 'dz-ghost');
      if (!select && g.press.node) {
        // The event's colour and the application's own classes — not its place or its state.
        const accent = g.press.node.style.getPropertyValue('--dz-event-accent');
        if (accent) el.style.setProperty('--dz-event-accent', accent);
        for (const c of g.press.instance?.event.classNames ?? []) el.classList.add(c);
        el.append(h(doc, 'span', 'dz-ghost__title', g.press.instance?.event.title || ctx.messages.untitled));
      }
      layer.append(el);
      g.ghosts.push(el);
    }
    while (g.ghosts.length > boxes.length) g.ghosts.pop()!.remove();
    const invalid = g.proposal ? !g.proposal.valid : false;
    boxes.forEach((b, i) => {
      const el = g.ghosts[i]!;
      el.style.setProperty('--gx', `${b.x}px`);
      el.style.setProperty('--gy', `${b.y}px`);
      el.style.setProperty('--gw', `${b.w}px`);
      el.style.setProperty('--gh', `${b.h}px`);
      el.classList.toggle('dz-event--invalid', invalid);
    });
    g.ghosts[0]?.setAttribute('data-time', g.proposal ? timeOf(ctx, g.press.mode.kind === 'resize' && g.press.mode.edge === 'end' ? g.proposal.end : g.proposal.start, g.proposal) : '');
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
    if (v === 0) return;
    // scrollBy writes without reading layout first.
    sc.scrollBy(0, v);
    queue();
  }

  function edgeNavigate(g: Gesture<G>): void {
    if (g.press.mode.kind !== 'move' || ctx.live().dragEdgeNavigate === false) return;
    const left = g.origin.x;
    const right = left + g.width;
    const rtl = root.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const side = g.x < left + EDGE_NAV_BAND ? (rtl ? 'next' : 'prev') : g.x > right - EDGE_NAV_BAND ? (rtl ? 'prev' : 'next') : null;
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
    for (const n of g.sources) n.classList.remove('dz-ev--source');
    return g;
  }

  function clearGhosts(g: Gesture<G>): void {
    for (const el of g.ghosts) el.remove();
    g.ghosts = [];
  }

  function cancel(): void {
    const g = end();
    if (g) clearGhosts(g);
  }

  let dropping = false;
  async function drop(): Promise<void> {
    const g = gesture;
    if (!g) return;
    // The last position, computed without the side effects (no autoscroll, no navigation on a drop).
    g.hitKey = '';
    compute(g);
    dropping = true;
    end();
    dropping = false;
    if (g.press.mode.kind === 'select') {
      clearGhosts(g);
      if (g.selection) ctx.live().onSelect?.(g.selection);
      return;
    }
    const p = g.proposal;
    const inst = g.press.instance;
    if (!p || !inst || isUnchanged(p)) return clearGhosts(g);
    busy = true;
    try {
      const landed = await commitProposal(ctx, {
        instance: inst,
        proposal: p,
        kind: g.press.mode.kind === 'resize' ? 'resize' : 'move',
        at: { x: g.x, y: g.y },
        from: g.ghosts[0] ? g.ghosts[0].getBoundingClientRect() : null,
        source: g.press.node,
        ghosts: g.ghosts,
        root,
      });
      // On a touch screen the event stays selected where it landed, ready for the next drag.
      if (landed && g.press.type === 'touch') {
        const node = root.querySelector<HTMLElement>(`[data-event-id="${cssEscape(inst.event.id)}"]`);
        if (node) select(node);
      }
    } catch (err) {
      // An application callback (chooseScope, a hook) failed: the gesture still ends, the error stays visible.
      void Promise.reject(err);
    } finally {
      busy = false;
      clearGhosts(g);
    }
  }
}

const cssEscape = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));
