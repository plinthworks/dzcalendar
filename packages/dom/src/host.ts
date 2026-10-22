import type { EventChange } from './settings.js';
import type { Formats } from './render/formats.js';
import type { ActionItem, ActionTarget, CalendarKernel, PlainDate, Resource, Command, CommandResult, EditScope, EventInstance, Instant, KernelState, Proposal, RulesContext, Segment, ZoneId } from '@dzcalendar/core';
import type {
  AllDayLabelCtx,
  DayCellCtx,
  DayHeaderCtx,
  DayLaneCtx,
  ElementHooks,
  ListDayHeaderCtx,
  MonthHeaderCtx,
  MoreLinkCtx,
  MorePopoverCtx,
  NoEventsCtx,
  NowIndicatorCtx,
  ResourceAreaHeaderCtx,
  ResourceGroupCtx,
  ResourceLaneCtx,
  SlotLabelCtx,
  SlotLaneCtx,
  ViewHookCtx,
  WeekNumberCtx,
} from './render/hooks.js';
import type { InteractionSurface } from './interact/surface.js';
import type { LiveSettings } from './settings.js';

/** What `chooseScope` is told: which occurrence, and what is done to it (where it would go, for a gesture). */
export type ScopeRequest =
  | { readonly instance: EventInstance; readonly kind: 'move' | 'resize'; readonly proposal: Proposal }
  | { readonly instance: EventInstance; readonly kind: 'delete' };
import type { DzMessages } from './messages.js';
import type { MotionAdapter } from './motion.js';
import type { FrameScheduler } from './render/frame.js';
import type { Scope } from './render/scope.js';

/** What an application can put inside an event, and hear about its life. */
export interface EventContentCtx {
  readonly instance: EventInstance;
  readonly segment: Segment;
  readonly timeText: string;
  readonly displayZone: ZoneId;
  readonly family: string;
  /** A background event (a closed day, leave) in a time grid's column: its content, if the hook gives one, is drawn at its top; null leaves it mute. */
  readonly background?: boolean;
}

/** An event's hooks, in every view: the four members every element takes (docs/behaviors/render-hooks.md). */
export interface EventHooks extends ElementHooks<EventContentCtx> {
  /**
   * Replace the default content. Null keeps it. Runs only when the event's
   * content changed; `el` is the event's node (the same one across reruns),
   * so a framework can keep and update what it rendered there.
   */
  content?: (ctx: EventContentCtx, el: HTMLElement) => string | Node | null | undefined;
  /** Once the node is in the page; a returned function runs before it is removed. */
  didMount?: (arg: { el: HTMLElement; ctx: EventContentCtx }) => void | (() => void);
}

/** What a resource's head is drawn from (the timeline's rows will add their depth and state). */
export interface ResourceContentCtx {
  readonly resource: Resource;
  /** The view's type. */
  readonly view: string;
}

/** A resource view's head: what an application puts there (a photo, a specialty) instead of the title. */
export interface ResourceHooks extends ElementHooks<ResourceContentCtx> {
  /** Null keeps the title. Runs when the resource (or the words in force) changed. */
  content?: (ctx: ResourceContentCtx, el: HTMLElement) => string | Node | null;
}

export interface CalendarHooks {
  readonly event?: EventHooks;
  readonly resource?: ResourceHooks;
  /** A day's head (a week's or a day's date, a month's weekday): a mark, a count, a button. */
  readonly dayHeader?: ElementHooks<DayHeaderCtx>;
  /** A day's cell (a month, a day grid's week). */
  readonly dayCell?: ElementHooks<DayCellCtx>;
  /** A time grid's column for a day. */
  readonly dayLane?: ElementHooks<DayLaneCtx>;
  /** A time label in a time grid's gutter. */
  readonly slotLabel?: ElementHooks<SlotLabelCtx>;
  /** A slot's row across a time grid (drawn as elements only when this hook is given). */
  readonly slotLane?: ElementHooks<SlotLaneCtx>;
  /** The all-day row's label. */
  readonly allDayLabel?: ElementHooks<AllDayLabelCtx>;
  /** "+N". */
  readonly moreLink?: ElementHooks<MoreLinkCtx>;
  /** The panel "+N" opens. */
  readonly morePopover?: ElementHooks<MorePopoverCtx>;
  /** The line at the current time. */
  readonly nowIndicator?: ElementHooks<NowIndicatorCtx>;
  /** A week's number. */
  readonly weekNumber?: ElementHooks<WeekNumberCtx>;
  /** The list's "nothing to show". */
  readonly noEvents?: ElementHooks<NoEventsCtx>;
  /** A list's day heading. */
  readonly listDayHeader?: ElementHooks<ListDayHeaderCtx>;
  /** The view's root. */
  readonly view?: ElementHooks<ViewHookCtx>;
  /** A month's title in a multi-month view. */
  readonly monthHeader?: ElementHooks<MonthHeaderCtx>;
  /** A resource's row in a timeline. */
  readonly resourceLane?: ElementHooks<ResourceLaneCtx>;
  /** A group's head (resource views) and its row (a timeline). */
  readonly resourceGroupHeader?: ElementHooks<ResourceGroupCtx>;
  readonly resourceGroupLane?: ElementHooks<ResourceGroupCtx>;
  /** A timeline's resource column head. */
  readonly resourceAreaHeader?: ElementHooks<ResourceAreaHeaderCtx>;
}

export interface ContextMenuCtx {
  readonly target: ActionTarget;
  readonly state: KernelState;
}

/**
 * Everything a view needs from the calendar around it. Mutable fields change
 * with `update()`; `epoch` moves whenever what text means changed (messages,
 * locale, hooks), so content signatures include it and nodes are redrawn in
 * place — never cleared, so focus survives.
 */
export interface ViewCtx {
  readonly doc: Document;
  readonly kernel: CalendarKernel;
  readonly scope: Scope;
  readonly scheduler: FrameScheduler;
  messages: DzMessages;
  locale: string;
  zone: ZoneId;
  motion: MotionAdapter;
  /** A view's scroll after this paint may be eased (a change, not the calendar's first paint). */
  easeScroll: boolean;
  hooks: CalendarHooks;
  /** Runs `fn` (a command), keeping the person's change it makes as `onEventChange` would get it (null: none). */
  capture<T>(fn: () => T): { readonly result: T; readonly change: EventChange | null };
  /** How the application asked each place to be written (`formats`). */
  formats: Formats;
  epoch: number;
  /** Minutes a context-menu moment snaps to in a time grid. */
  snapMinutes: number;
  /** False under a CSP without inline styles: a view family's own CSS is the application's to include. */
  readonly injectStyles: boolean;
  /** Plain CSS, outside the cascade layers (option `cssLayers: false`). */
  readonly cssLayers: boolean;
  /** Week numbers on the month's rows and the week's corner. */
  weekNumbers: boolean;
  /** The time grid's all-day row (false: none, and no all-day event in it). */
  allDaySlot: boolean;
  /** An event's time beside its title (false: the title alone; a real length across a clock change stays said). */
  displayEventTime: boolean;
  /** A second calendar's locale (`-u-ca-`), for the date shown beside each date; null: none. */
  altLocale: string | null;
  /**
   * Above this many events in a view, only what is on screen (plus a margin)
   * is mounted, the rest as it scrolls into view. Below it, everything is.
   */
  virtualizeAbove: number;
  /** `preparePrint()` is in force: everything is mounted, nothing is windowed. */
  printing: boolean;
  /**
   * Options a plugin's view family reads, by family (`viewOptions.timeline`:
   * the Pro's resource area). Replaced by `update({ viewOptions })`, which
   * moves `epoch`.
   */
  viewOptions: Readonly<Record<string, unknown>>;
  /** The "+N" panel: views attach their menu triggers to it too. */
  readonly popoverElement: HTMLElement;
  /**
   * Opens the context menu for a target at a point, or anchored to an
   * element. False when there is nothing to show (or the application asked
   * for the browser's own menu): the caller then leaves the event alone.
   */
  openMenu(target: ActionTarget, at: { x: number; y: number } | HTMLElement, returnFocus: HTMLElement | null): boolean;
  /** The live options (callbacks, `editable`, `selectable`…), read when used. */
  live(): LiveSettings;
  /** The rules a gesture is checked against (null: none). */
  rules(): RulesContext | null;
  /** Said by screen readers (a polite live region). */
  announce(text: string): void;
  /** "This event / following / all" for a gesture on an occurrence: the application's `chooseScope`, or a menu at the drop point. */
  chooseScope(info: ScopeRequest, at: { x: number; y: number }): Promise<EditScope | null>;
  /** A drop in a repeated hour: which of the two readings (a menu at the drop point). */
  chooseReading(p: Proposal, at: { x: number; y: number }): Promise<Proposal | null>;
  /** A gesture's command was refused by the calendar. */
  refused(result: CommandResult, command: Command): void;
  /** Lists a day's events (`nodes`, drawn by the view) in the panel behind a "+N" link; `onClose` runs when it closes. */
  /** `about`: the day (and resource) the panel is for — what `hooks.morePopover` is told. */
  openMore(anchor: HTMLElement, title: string, nodes: Node[], onClose?: () => void, about?: { readonly date: PlainDate; readonly resource: Resource | null }): void;
}

/** One family of views, mounted while the current view belongs to it. */
export interface ViewController {
  readonly element: HTMLElement;
  /** What moves on navigation. */
  readonly body: HTMLElement;
  /** Pointer gestures (drag, resize, select): attached by the calendar when present. */
  readonly surface?: InteractionSurface;
  /** Draws the model; returns event nodes created, for an entrance animation. */
  render(model: unknown, state: KernelState): HTMLElement[];
  /** Once a minute: the now line, today's cell. */
  tick(now: Instant, state: KernelState): void;
  /** First paint only: scroll to this many minutes from the start of the axis. */
  scrollTo?(minutes: number): void;
  /**
   * The calendar changed size (or appeared after being hidden): what is
   * mounted is decided again — a window, a month's height. Read and write go
   * through the frame scheduler.
   */
  relayout?(): void;
  destroy(): void;
}

export type ViewFactory = (ctx: ViewCtx) => ViewController;

const VIEWS = new Map<string, ViewFactory>();

/** Built-in families register themselves; so do the Pro's and an application's own. */
export function registerView(family: string, factory: ViewFactory): void {
  VIEWS.set(family, factory);
}

export function viewFactory(family: string): ViewFactory | undefined {
  return VIEWS.get(family);
}

/** Whether a family's views can be drawn (its entry imported: `@dzcalendar/dom/list`, the Pro's timeline…). */
export const hasRenderer = (family: string): boolean => VIEWS.has(family);

export type MenuHook = (ctx: ContextMenuCtx, defaults: readonly ActionItem[]) => readonly ActionItem[] | null;

/**
 * Scrolls `el` as `apply` does, eased by the motion adapter when the view
 * may (`ctx.easeScroll`): `apply` sets the place (any direction, any
 * writing mode), which is read, put back, and handed to the adapter.
 */
export function scrollEased(ctx: Pick<ViewCtx, 'motion' | 'easeScroll'>, el: HTMLElement, apply: () => void): void {
  if (!ctx.easeScroll || !ctx.motion.scroll) return apply();
  const top = el.scrollTop;
  const left = el.scrollLeft;
  apply();
  const to = { top: el.scrollTop, left: el.scrollLeft };
  if (to.top === top && to.left === left) return;
  el.scrollTop = top;
  el.scrollLeft = left;
  if (!ctx.motion.scroll(el, to)) {
    el.scrollTop = to.top;
    el.scrollLeft = to.left;
  }
}

