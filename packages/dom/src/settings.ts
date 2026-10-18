import type { AvailableSlot, Command, CommandResult, CreateRequest, EditScope, EventInstance, Instant, PlainDate, Proposal, Selection } from '@dzcalendar/core';
import type { MenuHook, ScopeRequest } from './host.js';

/** A click on an empty day or moment. */
export type DateClick = { readonly allDay: true; readonly date: PlainDate } | { readonly allDay: false; readonly date: PlainDate; readonly instant: Instant };

/**
 * The options read at the moment they are used — callbacks, the editing
 * switch, the context menu hook, the snap — so `update()` can change them
 * without rebuilding anything. One handler per key: what it validates, and
 * what else must follow when it changes.
 */
export interface LiveSettings {
  /** "New event here" from the context menu: the application opens its own editor. */
  readonly onCreateRequest?: (request: CreateRequest) => void;
  /** "Open" from the context menu. */
  readonly onEventOpen?: (instance: EventInstance) => void;
  /** Events can be dragged and resized, and the context menu offers editing entries. Default false. */
  readonly editable?: boolean;
  /** A command from the calendar's own UI was refused: why (problems, rule violations). */
  readonly onCommandRefused?: (result: CommandResult, command: Command) => void;
  /** Keep, reorder, add to or replace the context menu's entries; null leaves the browser's menu. */
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
}

type Handler<K extends keyof LiveSettings> = {
  /** Throws (RangeError) on a value that cannot be taken: `update()` refuses before changing anything. */
  readonly check?: (value: NonNullable<LiveSettings[K]>) => void;
};

const HANDLERS: { readonly [K in keyof LiveSettings]-?: Handler<K> } = {
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
  chooseScope: {},
  dragEdgeNavigate: {},
  eventResizableFromStart: {},
  onProposalRefused: {},
  keyboardUndo: {},
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
