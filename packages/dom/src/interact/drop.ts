import { UNASSIGNED, commandFor, createIdGenerator, eventHit, formatTemporal, normalizeEvent, proposeMove, toInput } from '@dzcalendar/core';
import type { CalEvent, CalendarKernel, Command, EventInput, EventInstance, Hit, PlainDate, Proposal, ResourceId, ZonedDateTime } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';
import type { EventChange } from '../settings.js';
import { clearGhosts, syncGhosts } from './ghosts.js';
import type { InteractionShared } from './host.js';
import { timeOf } from './commit.js';

/** What a drag carries across the page (docs/behaviors/external-drag.md). */
export type Carried =
  /** An element of the page made draggable: the event it becomes (no start), the application's data. */
  | { readonly kind: 'outside'; readonly input: EventInput; readonly data: unknown; readonly element: HTMLElement | null; readonly create?: boolean }
  /** An event taken from another calendar. */
  | { readonly kind: 'calendar'; readonly instance: EventInstance; readonly from: { readonly kernel: CalendarKernel } };

/** What `onDrop` is told: the element's data and where it went. */
export interface DropInfo {
  readonly data: unknown;
  /** The moment (in the calendar's zone) or the day it was put on. */
  readonly date: ZonedDateTime | PlainDate;
  readonly allDay: boolean;
  readonly resourceId: ResourceId | null;
  readonly element: HTMLElement | null;
}

/** What a calendar's surface offers to the page's drags. */
export interface DropTarget {
  readonly root: HTMLElement;
  readonly ctx: ViewCtx;
  /** It takes this (`droppable`, its filter; another calendar's event: both editable). */
  accepts(c: Carried): boolean;
  /** The pointer over it at (x, y): the place shown as the event would be. */
  over(c: Carried, x: number, y: number): void;
  /** The pointer left it: nothing shown. */
  leave(): void;
  /** Put down where it was last shown: the change made here (null: refused, nothing made). */
  drop(c: Carried, o?: { readonly quiet?: boolean }): Promise<Dropped | null>;
}

/** A drop made: its change, and the words said for it (held back with `quiet` until the other side is done too). */
export interface Dropped {
  readonly change: EventChange | null;
  readonly words: string;
}

const PAGES = new WeakMap<Document, Set<DropTarget>>();

/** A calendar's surface joins its page's drop targets; the returned function takes it out. */
export function registerTarget(doc: Document, t: DropTarget): () => void {
  let set = PAGES.get(doc);
  if (!set) PAGES.set(doc, (set = new Set()));
  set.add(t);
  return () => set.delete(t);
}

/** The target under (x, y) that takes `c` (not `except`, the calendar it comes from). */
export function targetAt(doc: Document, x: number, y: number, c: Carried, except?: DropTarget): DropTarget | null {
  let el = doc.elementFromPoint(x, y);
  // A calendar in a shadow root (a Web Component, Angular's ShadowDom): the point read inside it.
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  if (!el) return null;
  for (const t of PAGES.get(doc) ?? []) if (t !== except && t.root.contains(el) && t.accepts(c)) return t;
  return null;
}

/** Any calendar of the page (for words in its language before a calendar is reached). */
export const anyTarget = (doc: Document): DropTarget | null => PAGES.get(doc)?.values().next().value ?? null;

/** An element the keyboard took, held by the page until a calendar puts it down (`done`) or the person cancels. */
export interface PageHold {
  readonly carried: Carried;
  cancel(said: boolean): void;
  done(): void;
}
const HELD = new WeakMap<Document, PageHold>();
export const heldOn = (doc: Document) => HELD.get(doc) ?? null;
export function holdOn(doc: Document, held: PageHold | null): void {
  if (held) HELD.set(doc, held);
  else HELD.delete(doc);
}

const DROP_ID = '\u0000dz-drop';
/** The autoscroll's band and its fastest step, as for a drag inside a calendar. */
const EDGE = 40;
const SPEED = 18;
const ids = createIdGenerator('dz-drop');

/** The title a carried thing is shown and said with. */
export const titleOf = (ctx: ViewCtx, c: Carried) => (c.kind === 'outside' ? c.input.title : c.instance.event.title) || ctx.messages.untitled;

/**
 * The event a carried thing would be at a hit: an element's event placed
 * there (its length kept; on a day, one day unless it counts days), or the
 * other calendar's event as it is (moved there by `proposeMove`).
 */
export function eventAt(ctx: ViewCtx, c: Carried, hit: Hit): CalEvent | null {
  if (c.kind === 'calendar') {
    if (c.from.kernel.store === ctx.kernel.store) return c.instance.event;
    // Another store's event is checked here as a new one: its id may name another event of this store.
    const { ref: _ref, ...ev } = c.instance.event;
    return { ...ev, id: DROP_ID };
  }
  const zone = ctx.kernel.getState().timeZone;
  const allDay = hit.kind === 'day';
  const { start: _s, end: _e, allDay: _a, resourceId: _r, duration, ...rest } = c.input;
  const days = duration && typeof duration === 'object' && 'days' in duration ? duration : undefined;
  const resourceIds = hit.resourceId !== undefined && hit.resourceId !== UNASSIGNED ? [hit.resourceId] : (c.input.resourceIds ?? []);
  const input: EventInput = {
    ...rest,
    id: c.input.id ?? DROP_ID,
    start: hit.kind === 'day' ? hit.date.toString() : hit.instant.toZonedDateTimeISO(zone).toString(),
    allDay,
    resourceIds,
    ...(allDay ? days && { duration: days } : duration && { duration }),
  };
  const r = normalizeEvent(input, { displayZone: zone, newId: ids });
  return r.ok && r.value.kind === 'event' ? r.value.event : null;
}

/** The hit an event starts at, in this view's terms (what a move is counted from). */
export function startHit(ctx: ViewCtx, ev: CalEvent, timeGrid: boolean): Hit {
  return eventHit(ev, 'start', { displayZone: ctx.kernel.getState().timeZone, grid: timeGrid ? 'time' : 'day' });
}

/** Where the carried thing lands at a hit, checked against this calendar's rules (told it comes from outside). */
export function proposeDrop<G>(ctx: ViewCtx, shared: InteractionShared<G>, c: Carried, hit: Hit): Proposal | null {
  const ev = eventAt(ctx, c, hit);
  if (!ev) return null;
  const ic = { ...shared.interaction(null), external: true };
  // An element's event is made at the hit: no move. Another calendar's moves from where it starts, onto this column's resource.
  const grab = c.kind === 'outside' ? hit : startHit(ctx, ev, shared.surface.family === 'timeGrid');
  return proposeMove(ic, ev, grab, hit);
}

/**
 * The command a drop runs here: an element's event created; another
 * calendar's event moved (one store) or created here (its own store).
 */
export function dropCommand(ctx: ViewCtx, c: Carried, p: Proposal): Command {
  const placed = { start: p.start.toString(), end: p.end.toString(), allDay: p.allDay, resourceIds: [...p.resourceIds] };
  if (c.kind === 'outside') {
    const { start: _s, end: _e, allDay: _a, resourceId: _r, duration: _d, ...rest } = c.input;
    return { type: 'event.create', event: { ...rest, ...placed } };
  }
  if (c.from.kernel.store === ctx.kernel.store) return commandFor(c.instance, p);
  // Another store: the event written again here; its id kept unless this calendar has one already (or it is an occurrence).
  const { id, ...input } = toInput(c.instance.event);
  const snap = ctx.kernel.store.snapshot;
  const keep = id !== undefined && !c.instance.event.ref && !snap.getEvent(id) && !snap.getSeries(id);
  // Only this calendar's resources: those of the other one mean nothing here.
  const known = ctx.kernel.getResources().byId;
  return { type: 'event.create', event: { ...input, ...(keep && { id }), ...placed, resourceIds: placed.resourceIds.filter((r) => known.has(r)) } };
}

/**
 * A calendar's surface as a drop target: the place shown with its ghosts,
 * the drop run through the history checked as a gesture is, said, and given
 * to `onDrop` / `onEventReceive` (another calendar's: the caller pairs it
 * with the leave). Its own drags are not its business here.
 */
export function dropTarget<G>(ctx: ViewCtx, shared: InteractionShared<G>): DropTarget {
  const surface = shared.surface;
  const ghosts: HTMLElement[] = [];
  let geo: G;
  let proposal: Proposal | null = null;
  let key = '';
  /** Where the pointer is (for the autoscroll's next frame), and that frame. */
  let last: { readonly c: Carried; readonly x: number; readonly y: number } | null = null;
  let frame = 0;
  const win = ctx.doc.defaultView!;
  /**
   * Near the scroller's edge (inside it), it scrolls — faster the closer, as
   * a drag inside does — and the place under the pointer follows, frame by
   * frame while the pointer stays there.
   */
  const autoscroll = () => {
    frame = 0;
    const sc = surface.scroller;
    if (!last || !sc) return;
    const r = sc.getBoundingClientRect();
    const { x, y } = last;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
    const v = y < r.top + EDGE ? -SPEED * ((r.top + EDGE - y) / EDGE) : y > r.bottom - EDGE ? SPEED * ((y - (r.bottom - EDGE)) / EDGE) : 0;
    const h = surface.family === 'timeline' ? (x < r.left + EDGE ? -SPEED * ((r.left + EDGE - x) / EDGE) : x > r.right - EDGE ? SPEED * ((x - (r.right - EDGE)) / EDGE) : 0) : 0;
    if (v === 0 && h === 0) return;
    sc.scrollBy(h, v);
    key = '';
    target.over(last.c, x, y);
  };
  const target: DropTarget = {
    root: surface.root,
    ctx,
    accepts(c) {
      const live = ctx.live();
      if (ctx.scope.isDisposed || shared.busy || shared.holding) return false;
      // Another calendar's event: this one editable too; a filter is given the event.
      if (c.kind === 'calendar' && live.editable !== true) return false;
      const d = live.droppable;
      if (typeof d === 'function') {
        try {
          return d(c.kind === 'calendar' ? c.instance.event : c.data) === true;
        } catch (err) {
          void Promise.reject(err);
          return false;
        }
      }
      return d === true;
    },
    over(c, x, y) {
      last = { c, x, y };
      if (!frame) frame = win.requestAnimationFrame(autoscroll);
      // Measured at each step (the caller asks once a frame): the page or the calendar may have scrolled.
      geo = surface.measure(shared.layerOrigin());
      const hit = surface.hitAt(geo, x, y, 0, 0) ?? null;
      const k = hit ? JSON.stringify([hit.kind, String(hit.date), hit.kind === 'slot' ? String(hit.instant) : '', hit.resourceId ?? '']) : '';
      if (k === key) return;
      key = k;
      proposal = hit ? proposeDrop(ctx, shared, c, hit) : null;
      const boxes = proposal && hit ? surface.boxesFor(geo, proposal, 0, 0) : [];
      surface.root.classList.toggle('dz-dropping', proposal !== null);
      syncGhosts(shared.layer, ghosts, boxes, { kind: 'event', node: c.kind === 'outside' ? c.element : null, instance: c.kind === 'calendar' ? c.instance : null, title: titleOf(ctx, c) }, {
        invalid: proposal ? !proposal.valid : false,
        time: proposal ? timeOf(ctx, proposal.start, proposal) : '',
      });
    },
    leave() {
      last = null;
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      key = '';
      proposal = null;
      surface.root.classList.remove('dz-dropping');
      clearGhosts(ghosts);
    },
    async drop(c, o = {}) {
      const p = proposal;
      const box = ghosts[0]?.getBoundingClientRect() ?? null;
      target.leave();
      if (!p || ctx.scope.isDisposed) return null;
      return commitDrop(ctx, shared, c, p, box ? { x: box.left, y: box.bottom } : { x: 0, y: 0 }, o.quiet === true);
    },
  };
  return target;
}

/** A drop at a proposal (the pointer's or the keyboard's): refused (said), or run, said and told. */
export async function commitDrop<G>(ctx: ViewCtx, shared: InteractionShared<G>, c: Carried, p: Proposal, at: { readonly x: number; readonly y: number }, quiet = false): Promise<Dropped | null> {
  const title = titleOf(ctx, c);
  if (!p.valid) {
    ctx.announce(ctx.messages.dropRefused);
    ctx.live().onProposalRefused?.(p);
    return null;
  }
  let chosen = p;
  if (p.ambiguity) {
    const pick = await ctx.chooseReading(p, at);
    if (!pick || ctx.scope.isDisposed) return null;
    chosen = pick;
  }
  // Told only (`create: false`): the application makes what it wants of it, from `onDrop`.
  if (c.kind === 'outside' && c.create === false) {
    tellDrop(ctx, c, chosen);
    return { change: null, words: '' };
  }
  const command = dropCommand(ctx, c, chosen);
  shared.busy = true;
  let made: { result: ReturnType<CalendarKernel['run']>; change: EventChange | null };
  try {
    made = ctx.capture(() => ctx.kernel.run(command, { validate: true, external: true }));
  } finally {
    shared.busy = false;
  }
  if (!made.result.ok) {
    ctx.refused(made.result, command);
    return null;
  }
  const when = timeOf(ctx, chosen.start, chosen) || formatTemporal(chosen.start as PlainDate, { weekday: 'long', day: 'numeric', month: 'long' }, ctx.locale);
  const words = ctx.messages.eventReceived({ title, when });
  // Another calendar's event: said and told once the other side has let it go (the caller does).
  if (quiet) return { change: made.change, words };
  ctx.announce(words);
  if (c.kind === 'outside') {
    tellDrop(ctx, c, chosen);
    if (made.change) tellReceive(ctx, made.change);
  }
  return { change: made.change, words };
}

/** `onDrop`, an application's bug reported, not thrown into the drag. */
function tellDrop(ctx: ViewCtx, c: Extract<Carried, { kind: 'outside' }>, p: Proposal): void {
  try {
    ctx.live().onDrop?.({ data: c.data, date: p.start, allDay: p.allDay, resourceId: p.resourceIds[0] ?? null, element: c.element });
  } catch (err) {
    void Promise.reject(err);
  }
}

/** `onEventReceive`, an application's bug reported, not thrown into the drag. */
export function tellReceive(ctx: ViewCtx, change: EventChange): void {
  try {
    ctx.live().onEventReceive?.(change);
  } catch (err) {
    void Promise.reject(err);
  }
}
