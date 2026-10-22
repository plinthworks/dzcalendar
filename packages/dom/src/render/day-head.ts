import type { ViewCtx } from '../host.js';
import { decorate, undecorate } from './hooks.js';
import type { DayHeaderCtx, ElementHooks } from './hooks.js';

export type { DayHeaderCtx } from './hooks.js';
/** A day's head in the time grid and day grid views: a mark, a count, a button, in place of the calendar's words. */
export type DayHeaderHooks = ElementHooks<DayHeaderCtx>;

/** The application's hooks on a day's head; true when its content was used. Read by assistive technology once the application fills or touches it. */
export const ownDayHead = (ctx: ViewCtx, el: HTMLElement, c: DayHeaderCtx): boolean => decorate(ctx, ctx.hooks.dayHeader, el, c, undefined, true);

/** Before a day's head goes. */
export const unmountDayHead = (_ctx: ViewCtx, el: HTMLElement): void => undecorate(el);
