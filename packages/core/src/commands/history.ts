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
   * Takes back exactly what one command applied (`change.applied`), not the
   * last entry: a server's late refusal of the first of two drags. False,
   * and nothing changed, when something else has changed those events since.
   */
  revert(applied: readonly Mutation[]): boolean;
  /** Whether `revert(applied)` would take it back now — the same checks, nothing written (two sides reverted together). */
  canRevert(applied: readonly Mutation[]): boolean;
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

/**
 * `ctx` may be a function: read at each command, so a calendar whose zone,
 * locale or rules change keeps one history.
 */
export function createHistory(store: EventStore, ctx: CommandContext | (() => CommandContext), options: HistoryOptions = {}): History {
  const context = typeof ctx === 'function' ? ctx : () => ctx;
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
    const ids = new Set([...[...change.added, ...change.updated, ...change.removed].map((id) => `event:${id}`), ...change.seriesChanged.map((id) => `series:${id}`)]);
    const dropped = [...done, ...undone].filter((e) => touches(e, ids)).map((e) => e.label);
    if (dropped.length === 0) return;
    done = done.filter((e) => !touches(e, ids));
    undone = undone.filter((e) => !touches(e, ids));
    options.onDropped?.(dropped);
  });

  /** The entry each command's applied mutations went into: what `revert` takes out. */
  const origin = new WeakMap<readonly Mutation[], Entry>();
  /** What each write was (a command, an undo, a redo), and the write going on now. */
  const kindOf = new WeakMap<readonly Mutation[], 'command' | 'undo' | 'redo'>();
  let pending: 'command' | 'undo' | 'redo' | null = null;
  let deferred: readonly Mutation[] | null = null;
  /** How many commands went into an entry (a transaction counts as many): `revert` takes back an entry of one only. */
  const commands = new WeakMap<Entry, number>();
  const count = (e: Entry, n = 1) => commands.set(e, (commands.get(e) ?? 0) + n);
  const record = (label: string, applied: readonly Mutation[], mergeKey: string | null) => {
    if (open) {
      open.mutations.push(...applied);
      // Part of a transaction: taking it back alone would leave the others un-undoable.
      origin.set(applied, open);
      count(open, 2);
      return;
    }
    const last = done[done.length - 1];
    if (mergeKey !== null && undone.length === 0 && last && last.mergeKey === mergeKey && continues(last.mutations, applied)) {
      last.mutations = compact([...last.mutations, ...applied]);
      // Merged with the commands before it (one gesture): none of them alone any more.
      origin.set(applied, last);
      count(last);
      return;
    }
    const entry = { label, mutations: compact(applied), mergeKey };
    origin.set(applied, entry);
    count(entry);
    push(entry);
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
    pending = backwards ? 'undo' : 'redo';
    const change = write(steps, pending);
    pending = null;
    to.push(entry);
    kindOf.set(change.applied, backwards ? 'undo' : 'redo');
    origin.set(change.applied, entry);
    settleDeferred(change.applied);
    return true;
  };

  /**
   * Takes back one write — a command, an undo, a redo — by the entry it went
   * into, whatever is on top of the stacks: a command's entry leaves the
   * history (refused when merged with others or in a transaction), an undo's
   * goes back to the done stack, a redo's back to the undone one.
   */
  /** Whether this change can be taken back as it stands: its events unchanged since, its entry where it should be. */
  function mayTakeBack(applied: readonly Mutation[], kind: 'command' | 'undo' | 'redo', entry: Entry | undefined): boolean {
    if (!entry || !stillApplies(store, applied)) return false;
    if (restoresOrphan(store, [...applied].reverse().map(invert))) return false;
    if (kind === 'command') return !((commands.get(entry) ?? 0) > 1 || entry === open);
    return kind === 'undo' ? undone.includes(entry) : done.includes(entry);
  }
  function takeBack(applied: readonly Mutation[], kind: 'command' | 'undo' | 'redo', entry: Entry | undefined): boolean {
    if (!entry || !mayTakeBack(applied, kind, entry)) return false;
    const steps = [...applied].reverse().map(invert);
    if (kind === 'command') {
      if ((commands.get(entry) ?? 0) > 1 || entry === open) return false;
      done = done.filter((e) => e !== entry);
      undone = undone.filter((e) => e !== entry);
    } else if (kind === 'undo') {
      if (!undone.includes(entry)) return false;
      undone = undone.filter((e) => e !== entry);
      done.push(entry);
    } else {
      if (!done.includes(entry)) return false;
      done = done.filter((e) => e !== entry);
      undone.push(entry);
    }
    write(steps, kind === 'undo' ? 'redo' : 'undo');
    return true;
  }
  /** A revert asked while its own change was being announced (a confirm() in the callback): done once the write is over. */
  function settleDeferred(applied: readonly Mutation[]): void {
    if (deferred !== applied) return;
    deferred = null;
    takeBack(applied, kindOf.get(applied)!, origin.get(applied));
  }

  return {
    get canUndo() {
      return done.length > 0;
    },
    get canRedo() {
      return undone.length > 0;
    },

    run(cmd) {
      const result = applyCommand(store.snapshot, cmd, context());
      if (!result.ok || result.mutations.length === 0) return result;
      pending = 'command';
      const change = write(result.mutations, 'command');
      pending = null;
      if (change.applied.length > 0) {
        const label = cmd.type === 'batch' ? (cmd.label ?? 'batch') : cmd.type;
        record(label, change.applied, options.mergeKey?.(cmd) ?? null);
        kindOf.set(change.applied, 'command');
        settleDeferred(change.applied);
      }
      return { ...result, change };
    },

    undo: () => replay(done, undone, true),
    revert(applied) {
      if (applied.length === 0) return false;
      // Its own change being announced (the callback runs inside the write): taken back once the write is over.
      if (writing && pending && !kindOf.has(applied)) {
        if (pending === 'command' && open) return false;
        deferred = applied;
        return true;
      }
      const kind = kindOf.get(applied);
      return kind ? takeBack(applied, kind, origin.get(applied)) : false;
    },
    redo: () => replay(undone, done, false),
    canRevert(applied) {
      const kind = kindOf.get(applied);
      return applied.length > 0 && kind !== undefined && mayTakeBack(applied, kind, origin.get(applied));
    },

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
