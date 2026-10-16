import type { ActionItem, ActionTarget, CalendarKernel, Command, CommandResult, EditScope, EventInstance, Instant, KernelState, Proposal, RulesContext, Segment, ZoneId } from '@dzcalendar/core';
import type { InteractionSurface } from './interact/surface.js';
import type { LiveSettings } from './settings.js';

/** What `chooseScope` is told: which occurrence, where it would go, by which gesture. */
export interface ScopeRequest {
  readonly instance: EventInstance;
  readonly proposal: Proposal;
  readonly kind: 'move' | 'resize';
}
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
}

export interface EventHooks {
  /** Replace the default content. Null keeps it. Runs only when the event's content changed. */
  content?: (ctx: EventContentCtx) => string | Node | null;
  /** After the node is created; a returned function runs before it is removed. */
  didMount?: (arg: { el: HTMLElement; ctx: EventContentCtx }) => void | (() => void);
  willUnmount?: (arg: { el: HTMLElement; ctx: EventContentCtx }) => void;
}

export interface CalendarHooks {
  readonly event?: EventHooks;
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
  hooks: CalendarHooks;
  epoch: number;
  /** Minutes a context-menu moment snaps to in a time grid. */
  snapMinutes: number;
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
  openMore(anchor: HTMLElement, title: string, nodes: Node[], onClose?: () => void): void;
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

export type MenuHook = (ctx: ContextMenuCtx, defaults: readonly ActionItem[]) => readonly ActionItem[] | null;
