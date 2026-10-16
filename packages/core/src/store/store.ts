import { epochDay } from '../days.js';
import { normalizeIntervals } from '../intervals.js';
import type { MsSpan } from '../intervals.js';
import { problem } from '../event/problems.js';
import type { Problem } from '../event/problems.js';
import type { Normalized } from '../event/normalize.js';
import type { CalEvent, EventId, ResourceId } from '../event/types.js';
import type { Instant, PlainDate, ZoneId } from '../temporal.js';
import { stamp } from './diff.js';
import { isEmptyChange, mutationId } from './changes.js';
import type { ChangeCause, Mutation, StoreChange } from './changes.js';
import { PersistentIntervalTree } from './interval-tree.js';
import { PersistentOrderedMap } from './ordered-map.js';

declare const windowBrand: unique symbol;

/**
 * The stretch of time a view shows: instants for timed events, dates for
 * floating all-day ones. Built only by `viewWindow`, so the two halves always
 * describe the same days.
 */
export interface ViewWindow {
  readonly start: Instant;
  readonly end: Instant;
  /** Exclusive. */
  readonly startDate: PlainDate;
  readonly endDate: PlainDate;
  readonly displayZone: ZoneId;
  readonly [windowBrand]: true;
}

/** A window of whole days in a zone: from the start of `startDate` to the start of `endDate`. */
export function viewWindow(startDate: PlainDate, endDate: PlainDate, displayZone: ZoneId): ViewWindow {
  return {
    start: startDate.toZonedDateTime({ timeZone: displayZone }).toInstant(),
    end: endDate.toZonedDateTime({ timeZone: displayZone }).toInstant(),
    startDate,
    endDate,
    displayZone,
  } as ViewWindow;
}

export interface EventInstance {
  /** The event id; `${seriesId}${SEP}${recurrenceKey}` for occurrences (Phase 5). */
  readonly key: string;
  readonly event: CalEvent;
  /** Only `single` until Phase 5; the union is here now so adding series breaks no one. */
  readonly origin: 'single' | 'occurrence' | 'override';
}

export interface QueryOptions {
  readonly resourceId?: ResourceId;
  /** Default true. `display: 'none'` events are never returned. */
  readonly includeBackground?: boolean;
}

interface Indexes {
  readonly timed: PersistentIntervalTree;
  readonly days: PersistentIntervalTree;
}

const EMPTY_INDEXES: Indexes = { timed: PersistentIntervalTree.EMPTY, days: PersistentIntervalTree.EMPTY };

/** Where an event sits in its index. A milestone still covers one millisecond, so a window finds it. */
function spanOf(e: CalEvent): MsSpan {
  if (e.allDay) return { s: epochDay(e.start), e: epochDay(e.end) };
  const s = e.start.epochMilliseconds;
  return { s, e: Math.max(e.end.epochMilliseconds, s + 1) };
}

function unindex(ix: Indexes, e: CalEvent): Indexes {
  const { s } = spanOf(e);
  return e.allDay ? { ...ix, days: ix.days.remove(s, e.id) } : { ...ix, timed: ix.timed.remove(s, e.id) };
}

function index(ix: Indexes, e: CalEvent): Indexes {
  const { s, e: end } = spanOf(e);
  return e.allDay ? { ...ix, days: ix.days.insert(s, end, e.id) } : { ...ix, timed: ix.timed.insert(s, end, e.id) };
}

/** @internal Everything a snapshot holds, by name. */
interface SnapshotState {
  readonly version: number;
  readonly events: PersistentOrderedMap<EventId, CalEvent>;
  readonly all: Indexes;
  readonly byResource: PersistentOrderedMap<ResourceId, Indexes>;
  /** Which source chunks hold each source event. */
  readonly owners: PersistentOrderedMap<EventId, readonly string[]>;
  /** The ids each source chunk delivered last time. */
  readonly chunks: PersistentOrderedMap<string, readonly EventId[]>;
}

export interface MutationOptions {
  /**
   * Stamp each `after` with this revision (an equal event keeps the stored
   * object instead). Omitted to restore objects exactly — undo, redo, and
   * previews where revisions do not matter.
   */
  readonly stampAt?: number;
}

/**
 * One immutable state of the store. Every index is persistent, so producing
 * the next snapshot copies O(log n) nodes per touched event and leaves this
 * one exactly as it was — anything holding it keeps a consistent picture.
 */
export class StoreSnapshot {
  readonly version: number;
  /** @internal */ readonly state: SnapshotState;

  /** @internal */
  constructor(state: SnapshotState) {
    this.version = state.version;
    this.state = state;
  }

  static readonly EMPTY = new StoreSnapshot({
    version: 0,
    events: PersistentOrderedMap.emptyStrings(),
    all: EMPTY_INDEXES,
    byResource: PersistentOrderedMap.emptyStrings(),
    owners: PersistentOrderedMap.emptyStrings(),
    chunks: PersistentOrderedMap.emptyStrings(),
  });

  get counts(): { readonly events: number } {
    return { events: this.state.events.size };
  }

  getEvent(id: EventId): CalEvent | undefined {
    return this.state.events.get(id);
  }

  allEvents(): IterableIterator<CalEvent> {
    return this.state.events.values();
  }

  /**
   * The events a window shows. O(log n + k) per index, then a stable sort:
   * start, longer first, title, id — so two queries of the same state list
   * the same events in the same order, and an overlap layout is repeatable.
   * No cutting into days here: that is the view's projection (`segmentTimed`).
   */
  queryInstances(w: ViewWindow, opts: QueryOptions = {}): EventInstance[] {
    const ix = opts.resourceId === undefined ? this.state.all : this.state.byResource.get(opts.resourceId);
    if (!ix) return [];
    const found: CalEvent[] = [];
    const take = (id: string) => {
      const e = this.state.events.get(id)!;
      if (e.display === 'none') return;
      if (opts.includeBackground === false && (e.display === 'background' || e.display === 'inverse-background')) return;
      found.push(e);
    };
    ix.days.overlapping(epochDay(w.startDate), epochDay(w.endDate), take);
    ix.timed.overlapping(w.start.epochMilliseconds, w.end.epochMilliseconds, take);

    const keyed = found.map((event) => {
      const s = event.allDay ? event.start.toZonedDateTime({ timeZone: w.displayZone }).epochMilliseconds : event.start.epochMilliseconds;
      const e = event.allDay ? event.end.toZonedDateTime({ timeZone: w.displayZone }).epochMilliseconds : event.end.epochMilliseconds;
      return { event, s, d: e - s };
    });
    keyed.sort(
      (a, b) =>
        a.s - b.s ||
        b.d - a.d ||
        (a.event.title < b.event.title ? -1 : a.event.title > b.event.title ? 1 : 0) ||
        (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0),
    );
    return keyed.map(({ event }) => ({ key: event.id, event, origin: 'single' }));
  }

  /**
   * @internal The next snapshot after these mutations. Pure. Returns what
   * each touched id looked like before, and the mutations as carried out.
   */
  withMutations(
    mutations: readonly Mutation[],
    o: MutationOptions = {},
  ): { next: StoreSnapshot; touched: Map<EventId, CalEvent | undefined>; applied: Mutation[] } {
    let { events, all, byResource } = this.state;
    const touched = new Map<EventId, CalEvent | undefined>();
    const applied: Mutation[] = [];

    const drop = (e: CalEvent) => {
      all = unindex(all, e);
      for (const r of e.resourceIds) {
        const ix = byResource.get(r);
        if (ix) byResource = byResource.set(r, unindex(ix, e));
      }
    };
    const add = (e: CalEvent) => {
      all = index(all, e);
      for (const r of e.resourceIds) byResource = byResource.set(r, index(byResource.get(r) ?? EMPTY_INDEXES, e));
    };

    for (const m of mutations) {
      const id = mutationId(m);
      const current = events.get(id);
      if (!touched.has(id)) touched.set(id, current);
      const after = m.after && o.stampAt !== undefined ? stamp(current, m.after, o.stampAt) : m.after;
      if (current === after) continue;
      applied.push({ kind: 'event', ...(current && { before: current }), ...(after && { after }) });
      if (current) drop(current);
      if (after) {
        add(after);
        events = events.set(id, after);
      } else {
        events = events.delete(id);
      }
    }
    const next = new StoreSnapshot({ ...this.state, version: this.version + 1, events, all, byResource });
    return { next, touched, applied };
  }

  /** True while some chunk of the event's source still delivers it. */
  isSourceOwned(id: EventId): boolean {
    return this.state.owners.has(id);
  }

  /** @internal */
  withSourceBookkeeping(owners: SnapshotState['owners'], chunks: SnapshotState['chunks']): StoreSnapshot {
    return new StoreSnapshot({ ...this.state, owners, chunks });
  }
}

export interface EventStore {
  readonly snapshot: StoreSnapshot;
  /**
   * One transaction, one notification. The store stamps revisions itself
   * (except for `undo`/`redo`, which restore objects as they were); the
   * change's `applied` lists what it really did. A batch that changes
   * nothing notifies no one and keeps the version.
   */
  apply(mutations: readonly Mutation[], cause: ChangeCause): StoreChange;
  /**
   * Replaces what one chunk of one source delivered. An event delivered by two
   * chunks (it overlaps both) belongs to both, and goes only when both drop it.
   * An event equal to the stored one keeps its object and revision. The source
   * is the authority: an event edited or deleted locally comes back as the
   * source says on the next delivery.
   */
  replaceSourceChunk(sourceId: string, chunk: string, items: readonly Normalized[]): StoreChange;
  subscribe(fn: (change: StoreChange) => void): () => void;
}

function describe(
  prev: StoreSnapshot,
  next: StoreSnapshot,
  touched: Map<EventId, CalEvent | undefined>,
  applied: Mutation[],
  cause: ChangeCause,
  problems: readonly Problem[],
): StoreChange {
  const added: EventId[] = [];
  const updated: EventId[] = [];
  const removed: EventId[] = [];
  const spans: MsSpan[] = [];
  const days: MsSpan[] = [];
  const mark = (e: CalEvent) => (e.allDay ? days : spans).push(spanOf(e));
  for (const [id, before] of touched) {
    const after = next.getEvent(id);
    if (before === after) continue;
    if (!before) added.push(id);
    else if (!after) removed.push(id);
    else updated.push(id);
    if (before) mark(before);
    if (after) mark(after);
  }
  const changed = added.length + updated.length + removed.length > 0;
  return {
    version: changed ? next.version : prev.version,
    added,
    updated,
    removed,
    dirtySpans: normalizeIntervals(spans),
    dirtyDays: normalizeIntervals(days),
    cause,
    problems,
    applied: changed ? applied : [],
  };
}

export function createEventStore(initial: StoreSnapshot = StoreSnapshot.EMPTY): EventStore {
  let snapshot = initial;
  const listeners = new Set<(c: StoreChange) => void>();

  const commit = (next: StoreSnapshot, change: StoreChange) => {
    snapshot = next;
    if (!isEmptyChange(change)) for (const fn of [...listeners]) fn(change);
    return change;
  };

  return {
    get snapshot() {
      return snapshot;
    },

    apply(mutations, cause) {
      const restoring = cause === 'undo' || cause === 'redo';
      const { next, touched, applied } = snapshot.withMutations(mutations, restoring ? {} : { stampAt: snapshot.version + 1 });
      const change = describe(snapshot, next, touched, applied, cause, []);
      return isEmptyChange(change) ? change : commit(next, change);
    },

    replaceSourceChunk(sourceId, chunk, items) {
      const chunkKey = `${sourceId}\u0000${chunk}`;
      const { events } = snapshot.state;
      let owners = snapshot.state.owners;
      const problems: Problem[] = [];
      const mutations: Mutation[] = [];
      const delivered = new Set<EventId>();

      for (const item of items) {
        const event = item.event;
        const current = events.get(event.id);
        if (current && current.sourceId !== sourceId) {
          // Someone else holds this id now (a user event, another source):
          // refuse, and stop counting this chunk among the id's owners.
          problems.push(problem('duplicate-id', 'error', `${sourceId}/${chunk}`, event.id));
          const rest = (owners.get(event.id) ?? []).filter((k) => k !== chunkKey);
          owners = rest.length > 0 ? owners.set(event.id, rest) : owners.delete(event.id);
          continue;
        }
        if (delivered.has(event.id)) continue;
        delivered.add(event.id);
        const own = owners.get(event.id);
        if (!own) owners = owners.set(event.id, [chunkKey]);
        else if (!own.includes(chunkKey)) owners = owners.set(event.id, [...own, chunkKey]);
        const tagged = event.sourceId === sourceId ? event : ({ ...event, sourceId } as CalEvent);
        mutations.push({ kind: 'event', ...(current && { before: current }), after: tagged });
      }

      for (const id of snapshot.state.chunks.get(chunkKey) ?? []) {
        if (delivered.has(id)) continue;
        const rest = (owners.get(id) ?? []).filter((k) => k !== chunkKey);
        if (rest.length > 0) {
          owners = owners.set(id, rest);
          continue;
        }
        owners = owners.delete(id);
        const current = events.get(id);
        // Only what this source still owns: the id may now be a user's event.
        if (current && current.sourceId === sourceId) mutations.push({ kind: 'event', before: current });
      }

      const chunks = delivered.size > 0 ? snapshot.state.chunks.set(chunkKey, [...delivered]) : snapshot.state.chunks.delete(chunkKey);
      const base = snapshot.withSourceBookkeeping(owners, chunks);
      const { next, touched, applied } = base.withMutations(mutations, { stampAt: base.version + 1 });
      const change = describe(base, next, touched, applied, 'source', problems);
      return commit(isEmptyChange(change) ? base : next, change);
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
