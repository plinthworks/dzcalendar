import type { DropInfo } from './interact/drop.js';
import type { AvailableSlot, CalEvent, Problem, Command, CommandResult, CreateRequest, EditScope, EventInstance, Instant, PlainDate, Proposal, Selection, Series } from '@dzcalendar/core';
import type { MenuHook, ScopeRequest } from './host.js';

/** A click on an empty day or moment. */
/** A click on empty time; `resourceId`: in a resource view, whose column. */
export type DateClick =
  | { readonly allDay: true; readonly date: PlainDate; readonly resourceId?: string }
  | { readonly allDay: false; readonly date: PlainDate; readonly instant: Instant; readonly resourceId?: string };

/**
 * The options read at the moment they are used — callbacks, the editing
 * switch, the context menu hook, the snap — so `update()` can change them
 * without rebuilding anything. One handler per key: what it validates, and
 * what else must follow when it changes.
 */
/**
 * What a person changed — a drag, a resize, the keyboard, the menu, the
 * editor: the command, each event (and series) before and after, and how to
 * take it back when the server refuses. A program's own `calendar.run()` and a
 * source's deliveries are not said here.
 */
export interface EventChange {
  /** A command a person asked for, or their undo / redo (Ctrl+Z, `undo()`): persist each. */
  readonly cause: 'command' | 'undo' | 'redo';
  /** The command (absent for an undo or a redo). */
  readonly command?: Command;
  /** Every event and series it touched: `before` null when created, `after` null when removed. */
  readonly changes: readonly ({ readonly kind: 'event'; readonly before: CalEvent | null; readonly after: CalEvent | null } | { readonly kind: 'series'; readonly before: Series | null; readonly after: Series | null })[];
  /** The first event touched (most commands touch one): before and after — read events, their data in `props` (given as `extendedProps`). */
  readonly before: CalEvent | null;
  readonly after: CalEvent | null;
  /**
   * Takes back exactly this change (not "the last one"): the server refused
   * it. False, nothing done, when the events changed again since, or when it
   * was one step of a merged gesture or a transaction. An undo's revert redoes
   * that change (a redo's undoes it), whatever else is on the stacks. Called
   * inside the callback itself (a confirm()), it is done as soon as the change
   * is. Not said itself as a change.
   */
  revert(): boolean;
}

/** What `onEventLeave` is told: the event that went, the calendar it went to, the way back. */
export interface EventLeave {
  readonly event: CalEvent;
  /** The calendar's element it was dropped on. */
  readonly to: HTMLElement;
  /** Both sides undone: the event back here, gone from there. False when either changed since. */
  revert(): boolean;
}

/**
 * Something the calendar could not do as asked, found while drawing (not in
 * the data: those are the kernel's problems). Told to `onProblem`, else said
 * once per code on the console.
 */
export interface CalendarProblem {
  /**
   * `events-not-drawn`: events the view cannot show (all-day events in a time grid without its all-day row);
   * `host-no-height`: the calendar has no height of its own (an inline host, or `--dz-height: 100%` with no
   * ancestor of a given height: it grows with its content).
   */
  readonly code: 'events-not-drawn' | 'host-no-height';
  readonly detail: string;
  readonly element?: HTMLElement;
}

export interface LiveSettings {
  /** Something the calendar could not do as asked, found while drawing; without it, said once per code on the console. */
  readonly onProblem?: (problem: CalendarProblem) => void;
  /** After a person's change: persist it, and `revert()` it if the server refuses. */
  readonly onEventChange?: (change: EventChange) => void;
  /** "New event here" from the context menu: the application opens its own editor. */
  readonly onCreateRequest?: (request: CreateRequest) => void;
  /** "Open" from the context menu. */
  readonly onEventOpen?: (instance: EventInstance) => void;
  /** Events can be dragged and resized, and the context menu offers editing entries. Default false. */
  readonly editable?: boolean;
  /** A command from the calendar's own UI was refused: why (problems, rule violations). */
  readonly onCommandRefused?: (result: CommandResult, command: Command) => void;
  /** Keep, reorder, add to or replace the context menu's entries; null or [] leaves the browser's menu (an application opening its own calls preventDefault itself). */
  readonly contextMenu?: MenuHook;
  /** Minutes gestures and context-menu moments snap to in a time grid. Default 15. */
  readonly snapMinutes?: number;
  /** Dragging across empty time selects it (`onSelect`). Default false. */
  readonly selectable?: boolean;
  readonly onSelect?: (selection: Selection) => void;
  /** The selection shown went away (a click elsewhere, Escape, another period) — not when the application cleared it. */
  readonly onUnselect?: () => void;
  readonly onDateClick?: (click: DateClick) => void;
  readonly onEventClick?: (instance: EventInstance) => void;
  /**
   * A free slot of \`availableSlots\` was clicked (or Enter on it): the slot as
   * given. The application books it — its server checks it again
   * (\`checkSlot\`) before saving; the calendar creates nothing.
   */
  readonly onSlotClick?: (slot: AvailableSlot) => void;
  /**
   * A gesture on an occurrence of a series: how far it reaches. Resolve
   * null to cancel. Default: a "this / following / all" menu where it dropped.
   */
  readonly chooseScope?: (request: ScopeRequest) => EditScope | null | Promise<EditScope | null>;
  /** Holding a dragged event at the side goes to the previous/next period. Default true. */
  readonly dragEdgeNavigate?: boolean;
  /** Timed events can be resized from their start too. Default false. */
  readonly eventResizableFromStart?: boolean;
  /** A gesture dropped where the rules refuse it (the proposal and its violations). */
  readonly onProposalRefused?: (proposal: Proposal) => void;
  /** Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo and redo inside the calendar. Default true. */
  readonly keyboardUndo?: boolean;
  /**
   * What may be dropped here from the page (`makeDraggable`) or another
   * calendar: true, false (default), or a filter given the element's data.
   */
  readonly droppable?: boolean | ((data: unknown) => boolean);
  /** An element of the page was dropped and its event made (not on a refusal). */
  readonly onDrop?: (drop: DropInfo) => void;
  /** An event came in (dropped from the page or from another calendar): persist it; `revert()` takes it back (both calendars' sides). */
  readonly onEventReceive?: (change: EventChange) => void;
  /** An event of this calendar was dropped on another one: `revert()` puts it back on both. */
  readonly onEventLeave?: (leave: EventLeave) => void;
  /** A person folded or unfolded a resource or a group (a timeline's tree): the state to keep, if the application wants it back. */
  readonly onResourceToggle?: (state: { readonly collapsedResources: readonly string[]; readonly collapsedGroups: readonly string[] }) => void;
  /** What the resources given (option or `update`) could not be read as: refused entries, dropped fields. Called only when there are some. */
  readonly onResourceProblems?: (problems: readonly Problem[]) => void;
}

type Handler<K extends keyof LiveSettings> = {
  /** Throws (RangeError) on a value that cannot be taken: `update()` refuses before changing anything. */
  readonly check?: (value: NonNullable<LiveSettings[K]>) => void;
};

const HANDLERS: { readonly [K in keyof LiveSettings]-?: Handler<K> } = {
  onProblem: {},
  onEventChange: {},
  onCreateRequest: {},
  onEventOpen: {},
  editable: {},
  onCommandRefused: {},
  contextMenu: {},
  selectable: {},
  onSelect: {},
  onUnselect: {},
  onDateClick: {},
  onEventClick: {},
  onSlotClick: {},
  onResourceProblems: {},
  onResourceToggle: {},
  chooseScope: {},
  dragEdgeNavigate: {},
  eventResizableFromStart: {},
  onProposalRefused: {},
  keyboardUndo: {},
  droppable: {},
  onDrop: {},
  onEventReceive: {},
  onEventLeave: {},
  snapMinutes: {
    check: (v) => {
      if (!Number.isInteger(v) || v < 1 || v > 1440) throw new RangeError(`snapMinutes must be a whole number of minutes from 1 to 1440: ${v}`);
    },
  },
};

export const LIVE_KEYS = Object.keys(HANDLERS) as readonly (keyof LiveSettings)[];

export interface Settings {
  readonly current: LiveSettings;
  /** Checks every given key first; then applies. True when something changed. */
  apply(changes: Partial<LiveSettings>): boolean;
}

export function createSettings(initial: LiveSettings): Settings {
  const pick = (from: Partial<LiveSettings>) => {
    const out: Record<string, unknown> = {};
    for (const k of LIVE_KEYS) if (k in from) out[k] = from[k];
    return out as Partial<LiveSettings>;
  };
  for (const [k, v] of Object.entries(pick(initial))) if (v !== undefined) (HANDLERS[k as keyof LiveSettings].check as ((x: unknown) => void) | undefined)?.(v);
  let current: LiveSettings = pick(initial);
  return {
    get current() {
      return current;
    },
    apply(changes) {
      const given = pick(changes);
      for (const [k, v] of Object.entries(given)) if (v !== undefined) (HANDLERS[k as keyof LiveSettings].check as ((x: unknown) => void) | undefined)?.(v);
      const changed = Object.entries(given).some(([k, v]) => current[k as keyof LiveSettings] !== v);
      if (changed) current = { ...current, ...given };
      return changed;
    },
  };
}
