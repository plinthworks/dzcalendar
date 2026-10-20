import type { PlainDate, Resource } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';
import { guard } from './event.js';

/** What a day's head is drawn from: its date, its column's resource, the day's length (23 h, 25 h…), what the calendar would write there. */
export interface DayHeaderCtx {
  /** The day; a month's column head names a weekday: then the first date of that column (the grid's first week). */
  readonly date: PlainDate;
  readonly resource: Resource | null;
  /** The view's type (`timeGridWeek`, `dayGridMonth`…). */
  readonly view: string;
  readonly today: boolean;
  /** The day's length in this zone: 1 440, 1 380 or 1 500 on a clock change, 0 for a day that did not exist. */
  readonly lengthMinutes: number;
  /** What the calendar writes there itself (the weekday, the date). */
  readonly text: string;
}

/** A day's head in the time grid and day grid views (not a list's day headings): what an application puts there (a mark, a count, a button) in place of the calendar's words. */
export interface DayHeaderHooks {
  /** Null keeps the calendar's. Runs when the day, its head's place or the words in force changed. */
  content?: (ctx: DayHeaderCtx, el: HTMLElement) => string | Node | null;
  /** After the head is created; a returned function runs before it is removed. */
  didMount?: (arg: { el: HTMLElement; ctx: DayHeaderCtx }) => void | (() => void);
  willUnmount?: (arg: { el: HTMLElement; ctx: DayHeaderCtx }) => void;
}

const MOUNTED = new WeakMap<HTMLElement, { ctx: DayHeaderCtx; cleanup?: () => void }>();

/**
 * The application's content in a day's head, if it gives one: true when it
 * did (the head then holds its nodes and is read by assistive technology —
 * a button there must be reachable); false keeps the calendar's.
 */
export function ownDayHead(ctx: ViewCtx, el: HTMLElement, c: DayHeaderCtx): boolean {
  const hooks = ctx.hooks.dayHeader;
  if (!hooks) return false;
  const had = MOUNTED.get(el);
  // An application's hook that throws is reported; the calendar's words stay.
  const own = guard(() => hooks.content?.(c, el), null);
  if (own !== null && own !== undefined) {
    el.replaceChildren(typeof own === 'string' ? ctx.doc.createTextNode(own) : own);
    el.removeAttribute('aria-hidden');
  }
  if (!had) {
    const cleanup = guard(() => hooks.didMount?.({ el, ctx: c }), undefined);
    MOUNTED.set(el, { ctx: c, ...(typeof cleanup === 'function' && { cleanup }) });
  } else had.ctx = c;
  // What didMount puts there (a button) must be reachable too: the head is read when the application touches it.
  if (hooks.didMount) el.removeAttribute('aria-hidden');
  return own !== null && own !== undefined;
}

/** Before a day's head goes: the application lets go of what it put there. */
export function unmountDayHead(ctx: ViewCtx, el: HTMLElement): void {
  const m = MOUNTED.get(el);
  if (!m) return;
  MOUNTED.delete(el);
  guard(() => m.cleanup?.(), undefined);
  guard(() => ctx.hooks.dayHeader?.willUnmount?.({ el, ctx: m.ctx }), undefined);
}
