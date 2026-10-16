import type { Command, CommandResult, CreateRequest, EventInstance } from '@dzcalendar/core';
import type { MenuHook } from './host.js';

/**
 * The options read at the moment they are used — callbacks, the editing
 * switch, the context menu hook, the snap — so `update()` can change them
 * without rebuilding anything. One handler per key: what it validates, and
 * what else must follow when it changes.
 */
export interface LiveSettings {
  readonly onCreateRequest?: (request: CreateRequest) => void;
  readonly onEventOpen?: (instance: EventInstance) => void;
  readonly editable?: boolean;
  readonly onCommandRefused?: (result: CommandResult, command: Command) => void;
  readonly contextMenu?: MenuHook;
  readonly snapMinutes?: number;
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
