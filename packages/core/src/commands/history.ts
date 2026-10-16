import type { CalEvent } from '../event/types.js';
import type { Series } from '../recurrence/series.js';
import { invert, mutationId, mutationKey } from '../store/changes.js';
import type { Mutation, StoreChange } from '../store/changes.js';
import type { EventStore } from '../store/store.js';
import { applyCommand } from './apply.js';
import type { Command, CommandContext, CommandResult } from './types.js';

export interface HistoryOptions {
  /** Entries kept; the oldest go first. Default 200. */
  readonly limit?: number;
  /**
   * Commands with the same non-null key, run one after another, become one
   * entry — a drag that moves an event forty times is undone once. The key
   * must name the gesture (`move:${id}:${pointerDownTime}`), not only the
   * event: two separate drags of one event are two undos.
   */
  readonly mergeKey?: (cmd: Command) => string | null;
  /**
   * Entries thrown away because something else (a source refresh, another
   * writer) changed the events they touch. Replaying them would overwrite
   * that change, so they go — and the app can say so.
   */
  readonly onDropped?: (labels: readonly string[]) => void;
}

export interface History {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Applies a command and records how to take it back. */
  run(cmd: Command): CommandResult & { readonly change?: StoreChange };
  undo(): boolean;
  redo(): boolean;
  /**
   * Every `run` inside `fn` becomes a single entry. If `fn` throws, what it
   * already applied stays applied and stays undoable as that entry.
   */
  transaction<T>(label: string, fn: () => T): T;
  clear(): void;
  /** Stops listening to the store. */
  destroy(): void;
}

interface Entry {
  readonly label: string;
  mutations: Mutation[];
  readonly mergeKey: string | null;
}

type Item = CalEvent | Series | undefined;

/** What each event or series (`kind:id`) looks like after these mutations, in order. */
function finalStates(mutations: readonly Mutation[]): Map<string, Mutation> {
  const out = new Map<string, Mutation>();
  for (const m of mutations) out.set(mutationKey(m), m);
  return out;
}

const stored = (store: EventStore, m: Mutation): Item =>
  m.kind === 'event' ? store.snapshot.getEvent(mutationId(m)) : store.snapshot.getSeries(mutationId(m));

/** True when the store still shows exactly what these mutations left. Compared by identity. */
function stillApplies(store: EventStore, mutations: readonly Mutation[]): boolean {
  for (const m of finalStates(mutations).values()) if (stored(store, m) !== m.after) return false;
  return true;
}

/**
 * A source event may come back only while its source still delivers it.
 * Restored after the source withdrew it, nothing would ever remove it again.
 */
function restoresOrphan(store: EventStore, steps: readonly Mutation[]): boolean {
  return [...finalStates(steps).values()].some((m) => m.after?.sourceId !== undefined && !store.snapshot.isSourceOwned(mutationId(m), m.kind));
}

/**
 * True when `next` starts from exactly what `prev` left, for every event they
 * share — nothing else slipped in between. Only then may the two be undone as one.
 */
function continues(prev: readonly Mutation[], next: readonly Mutation[]): boolean {
  const left = finalStates(prev);
  return next.every((m) => !left.has(mutationKey(m)) || left.get(mutationKey(m))!.after === m.before);
}

/**
 * One mutation per id: the first `before`, the last `after`. A forty-step
 * drag is stored as one move; created-then-deleted is nothing at all.
 */
function compact(mutations: readonly Mutation[]): Mutation[] {
  const first = new Map<string, Mutation>();
  const last = new Map<string, Mutation>();
  for (const m of mutations) {
    const key = mutationKey(m);
    if (!first.has(key)) first.set(key, m);
    last.set(key, m);
  }
  const out: Mutation[] = [];
  for (const [key, f] of first) {
    const before = f.before;
    const after = last.get(key)!.after;
    if (before === after) continue;
    out.push({ kind: f.kind, ...(before && { before }), ...(after && { after }) } as Mutation);
  }
  return out;
}

const touches = (e: Entry, keys: ReadonlySet<string>) => e.mutations.some((m) => keys.has(mutationKey(m)));

export function createHistory(store: EventStore, ctx: CommandContext, options: HistoryOptions = {}): History {
  const limit = options.limit ?? 200;
  let done: Entry[] = [];
  let undone: Entry[] = [];
  let open: Entry | null = null;
  let writing = false;

  const push = (entry: Entry) => {
    undone = [];
    done.push(entry);
    if (done.length > limit) done.shift();
  };

  const write = (mutations: readonly Mutation[], cause: 'command' | 'undo' | 'redo') => {
    writing = true;
    try {
      return store.apply(mutations, cause);
    } finally {
      writing = false;
    }
  };

  // Anyone else's change to an event or a series invalidates every entry that touches it.
  const unsubscribe = store.subscribe((change) => {
    if (writing) return;
    const ids = new Set([...[...change.added, ...change.updated, ...change.removed].map((id) => `event:${id}`), ...change.seriesTouched.map((id) => `series:${id}`)]);
    const dropped = [...done, ...undone].filter((e) => touches(e, ids)).map((e) => e.label);
    if (dropped.length === 0) return;
    done = done.filter((e) => !touches(e, ids));
    undone = undone.filter((e) => !touches(e, ids));
    options.onDropped?.(dropped);
  });

  const record = (label: string, applied: readonly Mutation[], mergeKey: string | null) => {
    if (open) {
      open.mutations.push(...applied);
      return;
    }
    const last = done[done.length - 1];
    if (mergeKey !== null && undone.length === 0 && last && last.mergeKey === mergeKey && continues(last.mutations, applied)) {
      last.mutations = compact([...last.mutations, ...applied]);
      return;
    }
    push({ label, mutations: compact(applied), mergeKey });
  };

  const replay = (from: Entry[], to: Entry[], backwards: boolean): boolean => {
    const entry = from[from.length - 1];
    if (!entry) return false;
    const steps = backwards ? [...entry.mutations].reverse().map(invert) : entry.mutations;
    const expected = backwards ? entry.mutations : entry.mutations.map(invert).reverse();
    from.pop();
    // The subscription purges entries others overtook; a source can still
    // withdraw an event already deleted here without any visible change.
    if (!stillApplies(store, expected) || restoresOrphan(store, steps)) {
      options.onDropped?.([entry.label]);
      return false;
    }
    write(steps, backwards ? 'undo' : 'redo');
    to.push(entry);
    return true;
  };

  return {
    get canUndo() {
      return done.length > 0;
    },
    get canRedo() {
      return undone.length > 0;
    },

    run(cmd) {
      const result = applyCommand(store.snapshot, cmd, ctx);
      if (!result.ok || result.mutations.length === 0) return result;
      const change = write(result.mutations, 'command');
      if (change.applied.length > 0) {
        const label = cmd.type === 'batch' ? (cmd.label ?? 'batch') : cmd.type;
        record(label, change.applied, options.mergeKey?.(cmd) ?? null);
      }
      return { ...result, change };
    },

    undo: () => replay(done, undone, true),
    redo: () => replay(undone, done, false),

    transaction(label, fn) {
      if (open) return fn();
      open = { label, mutations: [], mergeKey: null };
      try {
        return fn();
      } finally {
        const entry = open;
        open = null;
        entry.mutations = compact(entry.mutations);
        if (entry.mutations.length > 0) push(entry);
      }
    },

    clear() {
      done = [];
      undone = [];
    },

    destroy() {
      unsubscribe();
    },
  };
}
