import type { Instant, PlainDate, PlainTime, Resource, ViewRange, ZonedDateTime } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';
import { guard } from './event.js';

/**
 * The four members every element's hooks take (docs/behaviors/render-hooks.md):
 * classes of the application's, its content in place of ours, a call once
 * the element is in the page, one before it goes.
 */
export interface ElementHooks<C> {
  /** Classes added to the element: a string, a list, or a function of its context (null: none). Re-read at each drawing. */
  class?: string | readonly string[] | ((ctx: C) => string | readonly string[] | null | undefined);
  /** The element's content in place of ours; null or undefined keeps ours. */
  content?: (ctx: C, el: HTMLElement) => string | Node | null | undefined;
  /** Once, after the element is in the page; it may return its own clean-up. */
  didMount?: (arg: { el: HTMLElement; ctx: C }) => void | (() => void);
  /** Once, before the element leaves the page. */
  willUnmount?: (arg: { el: HTMLElement; ctx: C }) => void;
}

/** What every element's context holds: the view's type. */
interface Base {
  /** The view's type (`timeGridWeek`, `dayGridMonth`…). */
  readonly view: string;
}

/** A day: its date, its column's resource, today or not, its real length in the calendar's zone (1 380 or 1 500 on a clock change, 0 for a day that did not exist). */
interface Day extends Base {
  readonly date: PlainDate;
  readonly resource: Resource | null;
  readonly today: boolean;
  readonly lengthMinutes: number;
}

/** A day's head; a month's column head names a weekday: its date is then the column's first (the grid's first week). */
export interface DayHeaderCtx extends Day {
  /** What the calendar writes there itself (the weekday, the date). */
  readonly text: string;
}
export interface DayCellCtx extends Day {
  /** A day of another month shown to fill a month's weeks. */
  readonly outside: boolean;
  /** The day's number as the calendar writes it. */
  readonly text: string;
}
export type DayLaneCtx = Day;
export interface SlotLabelCtx extends Base {
  readonly time: PlainTime;
  /** Minutes from the top of the axis. */
  readonly position: number;
  /** On a fall-back night, the first or second pass of the repeated hour. */
  readonly pass: 1 | 2;
  readonly text: string;
}
export interface SlotLaneCtx extends Base {
  readonly time: PlainTime;
  readonly position: number;
}
export interface AllDayLabelCtx extends Base {
  readonly text: string;
}
export interface MoreLinkCtx extends Base {
  readonly date: PlainDate;
  readonly resource: Resource | null;
  /** How many events it stands for. */
  readonly count: number;
  readonly text: string;
}
export interface MorePopoverCtx extends Base {
  readonly date: PlainDate;
  readonly resource: Resource | null;
}
export interface NowIndicatorCtx extends Base {
  readonly now: ZonedDateTime;
  readonly instant: Instant;
}
export interface WeekNumberCtx extends Base {
  readonly week: number;
  /** The week's first day shown. */
  readonly date: PlainDate;
  readonly text: string;
}
export interface NoEventsCtx extends Base {
  readonly text: string;
}
export interface ListDayHeaderCtx extends Base {
  readonly date: PlainDate;
  readonly lengthMinutes: number;
  readonly text: string;
}
export interface ViewHookCtx extends Base {
  readonly family: string;
  readonly range: ViewRange;
  readonly title: string;
}
export interface MonthHeaderCtx extends Base {
  /** The month's first day. */
  readonly month: PlainDate;
  readonly text: string;
}
export interface ResourceLaneCtx extends Base {
  readonly resource: Resource;
}
export interface ResourceGroupCtx extends Base {
  readonly field: string;
  readonly value: string;
}
export interface ResourceAreaHeaderCtx extends Base {
  readonly field: string;
  readonly text: string;
}

/** How many elements are decorated now, in every calendar of the page. */
let live = 0;
interface Mount {
  hooks: ElementHooks<never>;
  ctx: unknown;
  cleanup?: () => void;
  classes: readonly string[];
  /** Drawn, not yet in the page: its `didMount` waits for the end of the drawing. */
  waiting: boolean;
}
const MOUNTED = new WeakMap<HTMLElement, Mount>();
/** Elements whose `didMount` waits (drawn detached, then put in place). */
let queue: HTMLElement[] = [];
let flushQueued = false;

/** Each class once, split on spaces: `['a b']` is two classes, never a throw. */
const classesOf = <C>(hooks: { class?: ElementHooks<C>['class'] | undefined }, ctx: C): string[] => {
  const given = typeof hooks.class === 'function' ? guard(() => (hooks.class as (c: C) => string | readonly string[] | null | undefined)(ctx), null) : hooks.class;
  if (!given) return [];
  return [...new Set((typeof given === 'string' ? [given] : [...given]).flatMap((k) => (typeof k === 'string' ? k.split(/\s+/) : [])).filter(Boolean))];
};
/** The application's classes swapped: those given before and not now go, ours stay (a class of ours given by the application too is left). */
function swapClasses(el: HTMLElement, before: readonly string[], next: readonly string[]): void {
  for (const k of before) if (!next.includes(k) && !k.startsWith('dz-')) el.classList.remove(k);
  for (const k of next) el.classList.add(k);
}

function mount(el: HTMLElement, m: Mount): void {
  m.waiting = false;
  const did = m.hooks.didMount as ElementHooks<unknown>['didMount'];
  if (!did) return;
  const cleanup = guard(() => did({ el, ctx: m.ctx }), undefined);
  if (typeof cleanup === 'function') m.cleanup = cleanup;
}

/** The `didMount`s waiting: run once the drawing is in the page (the calendar calls it after each render; a microtask otherwise). */
export function flushMounts(): void {
  flushQueued = false;
  const now = queue;
  queue = [];
  for (const el of now) {
    const m = MOUNTED.get(el);
    if (m?.waiting) mount(el, m);
  }
}

/**
 * The application's hooks laid on an element just drawn: its classes (those
 * given before and not now taken off; ours never), its content in place of
 * ours (`draw` draws ours otherwise), its mount once — when the element is
 * in the page. New `didMount` / `willUnmount` functions (an `update`): the
 * element is let go and mounted again. No hooks any more: let go.
 * `readable`: an element drawn for the eye only (`aria-hidden`) that the
 * application fills — or touches in `didMount` — is read then. True when
 * the application's content was used.
 */
export function decorate<C>(ctx: ViewCtx, hooks: ElementHooks<C> | undefined, el: HTMLElement, c: C, draw?: () => void, readable = false): boolean {
  if (!hooks) {
    if (live > 0 && MOUNTED.has(el)) undecorate(el);
    draw?.();
    return false;
  }
  let had = MOUNTED.get(el);
  if (had && (had.hooks.didMount !== hooks.didMount || had.hooks.willUnmount !== hooks.willUnmount)) {
    undecorate(el);
    had = undefined;
  }
  const own = hooks.content ? guard(() => hooks.content!(c, el), null) : null;
  const used = own !== null && own !== undefined;
  if (used) el.replaceChildren(typeof own === 'string' ? ctx.doc.createTextNode(own) : own);
  else draw?.();
  const next = classesOf(hooks, c);
  swapClasses(el, had?.classes ?? [], next);
  if (had) {
    had.hooks = hooks as ElementHooks<never>;
    had.ctx = c;
    had.classes = next;
  } else if (hooks.didMount || hooks.willUnmount || next.length > 0) {
    const m: Mount = { hooks: hooks as ElementHooks<never>, ctx: c, classes: next, waiting: true };
    MOUNTED.set(el, m);
    live++;
    if (el.isConnected) mount(el, m);
    else if (hooks.didMount) {
      queue.push(el);
      if (!flushQueued) {
        flushQueued = true;
        queueMicrotask(flushMounts);
      }
    } else m.waiting = false;
  }
  if (readable && (used || hooks.didMount)) el.removeAttribute('aria-hidden');
  return used;
}

/** Before an element leaves the page (or is used again for something else): the application lets go of it. Never mounted (it left before the drawing ended): no `willUnmount`. */
export function undecorate(el: HTMLElement): void {
  const m = MOUNTED.get(el);
  if (!m) return;
  MOUNTED.delete(el);
  live--;
  // A node the calendar keeps (the "+N" panel, a pooled one) goes back without the application's classes.
  swapClasses(el, m.classes, []);
  if (m.waiting) return;
  guard(() => m.cleanup?.(), undefined);
  guard(() => m.hooks.willUnmount?.({ el, ctx: m.ctx as never }), undefined);
}

/** Every decorated element under `root` let go (a view torn down whole). */
export function undecorateAll(root: Element): void {
  // Nothing decorated anywhere (no hooks given): nothing to look for.
  if (live === 0) return;
  if (MOUNTED.has(root as HTMLElement)) undecorate(root as HTMLElement);
  for (const el of root.querySelectorAll<HTMLElement>('*')) if (MOUNTED.has(el)) undecorate(el);
}

/** A holder of the calendar (a column, a lane, a cell, the view): classes and mounts only, its content never replaced. */
export function holder<C>(hooks: ElementHooks<C> | undefined): ElementHooks<C> | undefined {
  if (!hooks) return undefined;
  const { content: _ours, ...rest } = hooks;
  return rest;
}

