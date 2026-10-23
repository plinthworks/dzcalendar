/**
 * @dzcalendar/compat-fullcalendar — an application's FullCalendar options,
 * translated to DzCalendar at run time (docs/behaviors/fullcalendar-options.md):
 *
 * ```ts
 * const { calendar, problems } = createFromFullCalendar(el, fullCalendarOptions);
 * ```
 *
 * Every guess (a time without a zone, the browser's zone) and every option
 * without an equivalent is a problem — warnings; the calendar is drawn.
 * Nothing here throws.
 */
// FullCalendar's rrule events translate to repeating events: the recurrence entry comes with the translation.
import '@dzcalendar/core/recurrence';
import { createCalendar, hasRenderer } from '@dzcalendar/dom';
import type { CalendarInstance, CalendarOptions as DzOptions } from '@dzcalendar/dom';
import type { Problem } from '@dzcalendar/core';
import type { JsEventLike } from './translate.js';
import { said } from './dates.js';
import { translate } from './translate.js';

export { translate as fromFullCalendar, eventInfo, toEvent } from './translate.js';
export { Draggable } from './draggable.js';
export type { DraggableSettings } from './draggable.js';
export type { Translation, JsEventLike } from './translate.js';

export interface CompatOptions {
  /** Says the problems once in the console (`console.warn`), as the other library warns of unknown options. Default true. */
  readonly warn?: boolean;
  /** The zone when the options name none (theirs is the browser's); default the browser's, said. */
  readonly timeZone?: string;
}

/** The entry a view's family needs. */
const ENTRY: Record<string, string> = { list: '@dzcalendar/dom/list', multiMonth: '@dzcalendar/dom/multimonth', timeline: '@dzcalendar/pro' };

/** The views asked for (the first, the toolbar's) that cannot be drawn here: said, with the import that draws them. */
function checkViews(calendar: CalendarInstance, asked: readonly unknown[], path: string, problems: Problem[]): void {
  for (const v of asked) {
    if (typeof v !== 'string') continue;
    const spec = calendar.kernel.getViewSpec(v);
    if (!spec) problems.push(said('compat-unsupported', path, `${v}:${/^(resource)?timeline/i.test(v) ? ENTRY['timeline'] : 'unknown-view'}`));
    else if (!hasRenderer(spec.family)) problems.push(said('compat-unsupported', path, `${v}:${ENTRY[spec.family] ?? spec.family}`));
  }
}

function warnOnce(problems: readonly Problem[], warn: boolean | undefined): void {
  if (warn === false || problems.length === 0 || typeof console === 'undefined') return;
  console.warn(`dzcalendar (from FullCalendar): ${problems.length} problem(s)\n${problems.map((p) => `  ${p.severity} ${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''}`).join('\n')}`);
}

/** Calendar options without what a calendar refused (each key tried on its own, on a detached element). */
function refused(el: HTMLElement, options: Record<string, unknown>, problems: Problem[]): Record<string, unknown> {
  const base = { timeZone: options['timeZone'] };
  const ok: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(options)) {
    try {
      createCalendar(el.ownerDocument.createElement('div'), { ...base, [k]: v } as DzOptions).destroy();
      ok[k] = v;
    } catch (e) {
      problems.push(said('invalid-option', k, k === 'initialView' && typeof v === 'string' ? `${v}:no-renderer` : 'refused', 'error'));
    }
  }
  return ok;
}

/** Makes the calendar from the other library's options, its following callbacks wired. Never throws. */
export function createFromFullCalendar(el: HTMLElement, fullCalendarOptions: unknown, compat: CompatOptions = {}): { readonly calendar: CalendarInstance; readonly problems: readonly Problem[]; detach(): void } {
  const t = translate(fullCalendarOptions, compat.timeZone !== undefined ? { zone: compat.timeZone } : {});
  const problems: Problem[] = [...t.problems];
  const options: Record<string, unknown> = { ...(compat.timeZone !== undefined && { timeZone: compat.timeZone }), ...(t.options as Record<string, unknown>) };
  let calendar: CalendarInstance;
  try {
    calendar = createCalendar(el, options as DzOptions);
  } catch {
    // Which option was refused: found key by key, the calendar made without it.
    const kept = refused(el, options, problems);
    try {
      calendar = createCalendar(el, kept as DzOptions);
    } catch {
      problems.push(said('invalid-option', 'options', 'refused', 'error'));
      calendar = createCalendar(el, { timeZone: options['timeZone'] as string });
    }
  }
  checkViews(calendar, (options['headerViews'] as unknown[] | undefined) ?? [], 'headerToolbar', problems);
  const detach = t.attach(calendar);
  warnOnce(problems, compat.warn);
  return { calendar, problems, detach };
}

/** What `update` cannot change after the calendar is made. */
const AT_CREATION = ['virtualizeAbove', 'autoPrint'];

/**
 * The other library's options laid on a calendar that exists (one an
 * Angular `<dz-calendar>` made): what can change live is updated key by key,
 * the events, sources and resources replaced (sources no longer given are
 * removed), the following callbacks wired. `initialView` and `initialDate`
 * only the first time (`initial: false` after: options changing do not send
 * the calendar back). Never throws.
 */
export function applyFullCalendar(calendar: CalendarInstance, fullCalendarOptions: unknown, how: { readonly initial?: boolean } = {}): { readonly problems: readonly Problem[]; detach(): void } {
  // The calendar's zone (what the application settled) when the options name none.
  const t = translate(fullCalendarOptions, { zone: calendar.kernel.getState().timeZone });
  const { initialView, initialDate, timeZone, ...rest } = t.options as Record<string, unknown>;
  const problems: Problem[] = [...t.problems];
  const sources = rest['sources'];
  delete rest['sources'];
  const tryUpdate = (path: string, change: Record<string, unknown>) => {
    try {
      calendar.update(change);
    } catch {
      problems.push(said('invalid-option', path, path === 'initialView' ? `${String(initialView)}:no-renderer` : 'refused', 'error'));
    }
  };
  if (timeZone !== undefined && timeZone !== calendar.kernel.getState().timeZone) tryUpdate('timeZone', { timeZone });
  if (how.initial !== false && (initialView !== undefined || initialDate !== undefined)) tryUpdate(initialView !== undefined ? 'initialView' : 'initialDate', { ...(initialView !== undefined && { view: initialView }), ...(initialDate !== undefined && { date: initialDate }) });
  // The options own the events: none given is none.
  rest['events'] ??= [];
  // The header's layout and its buttons in one change: a layout naming buttons not yet given would say them unknown.
  const header: Record<string, unknown> = {};
  for (const k of ['customButtons', 'headerToolbar']) if (k in rest) (header[k] = rest[k]), delete rest[k];
  if (Object.keys(header).length > 0) tryUpdate('headerToolbar', header);
  for (const [k, v] of Object.entries(rest)) {
    if (AT_CREATION.includes(k)) problems.push(said('compat-unsupported', k, 'at-creation'));
    else tryUpdate(k, { [k]: v });
  }
  // The whole list: what an earlier apply added and this one no longer gives goes.
  tryUpdate('eventSources', { sources: (sources as unknown[] | undefined) ?? [] });
  checkViews(calendar, (rest['headerViews'] as unknown[] | undefined) ?? [], 'headerToolbar', problems);
  const detach = t.attach(calendar);
  return { problems, detach };
}

/** The options an application wrote for FullCalendar (read loosely: unknown keys are said, not refused). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FullCalendarOptions = Record<string, any>;

/** An event as the callbacks receive it (a plain object: a change is a command on the calendar). */
export interface EventApi {
  readonly id: string;
  readonly groupId: string;
  readonly title: string;
  readonly start: Date;
  readonly end: Date;
  readonly startStr: string;
  readonly endStr: string;
  readonly allDay: boolean;
  readonly url: string;
  readonly classNames: readonly string[];
  readonly display: string;
  readonly extendedProps: Readonly<Record<string, unknown>>;
  readonly resourceIds: readonly string[];
}

/**
 * The other library's type names an application imports, here so the
 * codemod only changes where they come from. Loose where theirs were
 * classes; the information is the same.
 */
export type CalendarOptions = FullCalendarOptions;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventInput = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventSourceInput = any;
export interface ViewApi {
  readonly type: string;
  readonly title: string;
  readonly activeStart: Date;
  readonly activeEnd: Date;
  readonly currentStart: Date;
  readonly currentEnd: Date;
}
export interface EventClickArg {
  readonly event: EventApi;
  readonly el: HTMLElement | null;
  readonly jsEvent: JsEventLike;
  readonly view: ViewApi;
}
export interface DateClickArg {
  readonly date: Date;
  readonly dateStr: string;
  readonly allDay: boolean;
  readonly resource?: { readonly id: string };
  readonly jsEvent: JsEventLike;
  readonly view: ViewApi;
}
export interface DateSelectArg {
  readonly start: Date;
  readonly end: Date;
  readonly startStr: string;
  readonly endStr: string;
  readonly allDay: boolean;
  readonly resource?: { readonly id: string };
  readonly jsEvent: JsEventLike;
  readonly view: ViewApi;
}
export interface EventChangeArg {
  readonly event: EventApi;
  readonly oldEvent: EventApi;
  readonly relatedEvents: readonly EventApi[];
  revert(): void;
}
export type EventDropArg = EventChangeArg & { readonly delta: null; readonly jsEvent: JsEventLike; readonly view: ViewApi };
export type EventResizeDoneArg = EventChangeArg & { readonly startDelta: null; readonly endDelta: null; readonly jsEvent: JsEventLike; readonly view: ViewApi };
export interface EventAddArg {
  readonly event: EventApi;
  readonly relatedEvents: readonly EventApi[];
  revert(): void;
}
export type EventRemoveArg = EventAddArg;
export interface DatesSetArg {
  readonly start: Date;
  readonly end: Date;
  readonly startStr: string;
  readonly endStr: string;
  readonly timeZone: string;
  readonly view: ViewApi;
}
export interface EventContentArg {
  readonly event: EventApi;
  readonly el: HTMLElement;
  readonly timeText: string;
  readonly view: ViewApi;
  readonly isStart: boolean;
  readonly isEnd: boolean;
}
export type EventMountArg = EventContentArg;
