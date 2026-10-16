import { epochDay } from '../days.js';
import { normalizeIntervals } from '../intervals.js';
import type { MsSpan } from '../intervals.js';
import { problem } from '../event/problems.js';
import type { Problem } from '../event/problems.js';
import type { Normalized } from '../event/normalize.js';
import type { CalEvent, EventId, ResourceId, SeriesId } from '../event/types.js';
import { occurrenceKey, escapeId, keyOf, seriesEquals, setEquals } from '../recurrence/series.js';
import { expandSeries, occurrenceSpan, seriesSpan } from '../recurrence/expand.js';
import type { Series } from '../recurrence/series.js';
import type { Instant, PlainDate, ZoneId } from '../temporal.js';
import { eventEquals, stamp } from './diff.js';
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
  /** The event id (escaped), or `seriesId@recurrenceKey` for an occurrence. */
  readonly key: string;
  readonly event: CalEvent;
  /** `override` arrives with Phase 6 editing. */
  readonly origin: 'single' | 'occurrence' | 'override';
}

export interface QueryOptions {
  readonly resourceId?: ResourceId;
  /** Default true. `display: 'none'` events are never returned. */
  readonly includeBackground?: boolean;
  /** Receives what expansion had to say (`too-many-occurrences`): the occurrences shown were cut. */
  readonly onProblem?: (p: Problem) => void;
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

function sameRulesAndAdditions(a: Series, b: Series): boolean {
  return setEquals({ ...a.set, exdates: [] }, { ...b.set, exdates: [] });
}

/** The keys and EXDATEs present in one series and not the other. */
function changedPlaces(a: Series, b: Series): (string | Instant | PlainDate)[] {
  const out: (string | Instant | PlainDate)[] = [];
  for (const [k, v] of a.overrides) if (b.overrides.get(k) !== v) out.push(k);
  for (const [k, v] of b.overrides) if (a.overrides.get(k) !== v) out.push(k);
  const ex = (s: Series) => new Map(s.set.exdates.map((x) => [x.toString(), x] as const));
  const ea = ex(a);
  const eb = ex(b);
  for (const [k, x] of ea) if (!eb.has(k)) out.push(x);
  for (const [k, x] of eb) if (!ea.has(k)) out.push(x);
  return out;
}

const indexAdd = (ix: Indexes, id: string, allDay: boolean, sp: MsSpan): Indexes =>
  allDay ? { ...ix, days: ix.days.insert(sp.s, sp.e, id) } : { ...ix, timed: ix.timed.insert(sp.s, sp.e, id) };
const indexRemove = (ix: Indexes, id: string, allDay: boolean, sp: MsSpan): Indexes =>
  allDay ? { ...ix, days: ix.days.remove(sp.s, id) } : { ...ix, timed: ix.timed.remove(sp.s, id) };

/** @internal Everything a snapshot holds, by name. */
interface SnapshotState {
  readonly version: number;
  readonly events: PersistentOrderedMap<EventId, CalEvent>;
  readonly all: Indexes;
  readonly byResource: PersistentOrderedMap<ResourceId, Indexes>;
  readonly series: PersistentOrderedMap<SeriesId, Series>;
  /** Series by the span of their occurrences (timed in ms, all-day in days). */
  readonly seriesIdx: Indexes;
  /** Which source chunks hold each source item (`event:id` / `series:id`). */
  readonly owners: PersistentOrderedMap<string, readonly string[]>;
  /** The item keys each source chunk delivered last time. */
  readonly chunks: PersistentOrderedMap<string, readonly string[]>;
}

export interface MutationOptions {
  /**
   * Stamp each `after` with this revision (an equal one keeps the stored
   * object instead). Omitted to restore objects exactly — undo, redo, and
   * previews where revisions do not matter.
   */
  readonly stampAt?: number;
}

/**
 * One immutable state of the store. Every index is persistent, so producing
 * the next snapshot copies O(log n) nodes per touched item and leaves this
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
    series: PersistentOrderedMap.emptyStrings(),
    seriesIdx: EMPTY_INDEXES,
    owners: PersistentOrderedMap.emptyStrings(),
    chunks: PersistentOrderedMap.emptyStrings(),
  });

  get counts(): { readonly events: number; readonly series: number } {
    return { events: this.state.events.size, series: this.state.series.size };
  }

  getEvent(id: EventId): CalEvent | undefined {
    return this.state.events.get(id);
  }

  getSeries(id: SeriesId): Series | undefined {
    return this.state.series.get(id);
  }

  allEvents(): IterableIterator<CalEvent> {
    return this.state.events.values();
  }

  allSeries(): IterableIterator<Series> {
    return this.state.series.values();
  }

  /** True while some chunk of its source still delivers the event (or series). */
  isSourceOwned(id: string, kind: 'event' | 'series' = 'event'): boolean {
    return this.state.owners.has(`${kind}:${id}`);
  }

  /**
   * The events a window shows: single events from the indexes, occurrences
   * of the series whose span meets the window (expanded only there, an
   * occurrence that began before the window and runs into it included). A
   * stable sort: start, longer first, title, key.
   */
  queryInstances(w: ViewWindow, opts: QueryOptions = {}): EventInstance[] {
    const ix = opts.resourceId === undefined ? this.state.all : this.state.byResource.get(opts.resourceId);
    const keep = (e: CalEvent) =>
      e.display !== 'none' && !(opts.includeBackground === false && (e.display === 'background' || e.display === 'inverse-background'));
    const found: EventInstance[] = [];
    if (ix) {
      const take = (id: string) => {
        const e = this.state.events.get(id)!;
        if (keep(e)) found.push({ key: escapeId(e.id), event: e, origin: e.ref ? 'override' : 'single' });
      };
      ix.days.overlapping(epochDay(w.startDate), epochDay(w.endDate), take);
      ix.timed.overlapping(w.start.epochMilliseconds, w.end.epochMilliseconds, take);
    }
    const series = (id: string) => {
      const sr = this.state.series.get(id)!;
      if (opts.resourceId !== undefined && !sr.base.resourceIds.includes(opts.resourceId)) return;
      if (!keep(sr.base)) return;
      const { occurrences, problems } = expandSeries(sr, w);
      if (opts.onProblem) for (const p of problems) opts.onProblem(p);
      for (const ev of occurrences) {
        if (sr.overrides.has(ev.ref!.key)) continue;
        found.push({ key: occurrenceKey(sr.id, ev.ref!.key), event: ev, origin: 'occurrence' });
      }
    };
    this.state.seriesIdx.days.overlapping(epochDay(w.startDate), epochDay(w.endDate), series);
    this.state.seriesIdx.timed.overlapping(w.start.epochMilliseconds, w.end.epochMilliseconds, series);

    const keyed = found.map((inst) => {
      const event = inst.event;
      const s = event.allDay ? event.start.toZonedDateTime({ timeZone: w.displayZone }).epochMilliseconds : event.start.epochMilliseconds;
      const e = event.allDay ? event.end.toZonedDateTime({ timeZone: w.displayZone }).epochMilliseconds : event.end.epochMilliseconds;
      return { inst, s, d: e - s };
    });
    keyed.sort(
      (a, b) =>
        a.s - b.s ||
        b.d - a.d ||
        (a.inst.event.title < b.inst.event.title ? -1 : a.inst.event.title > b.inst.event.title ? 1 : 0) ||
        (a.inst.key < b.inst.key ? -1 : a.inst.key > b.inst.key ? 1 : 0),
    );
    return keyed.map(({ inst }) => inst);
  }

  /**
   * @internal The next snapshot after these mutations. Pure. Returns what
   * each touched event looked like before, the series touched, and the
   * mutations as carried out.
   */
  withMutations(
    mutations: readonly Mutation[],
    o: MutationOptions = {},
  ): { next: StoreSnapshot; touched: Map<EventId, CalEvent | undefined>; seriesTouched: Set<SeriesId>; applied: Mutation[] } {
    let { events, all, byResource, series, seriesIdx } = this.state;
    const touched = new Map<EventId, CalEvent | undefined>();
    const seriesTouched = new Set<SeriesId>();
    const applied: Mutation[] = [];

    const drop = (e: CalEvent) => {
      const sp = spanOf(e);
      all = indexRemove(all, e.id, e.allDay, sp);
      for (const r of e.resourceIds) {
        const ix = byResource.get(r);
        if (ix) byResource = byResource.set(r, indexRemove(ix, e.id, e.allDay, sp));
      }
    };
    const add = (e: CalEvent) => {
      const sp = spanOf(e);
      all = indexAdd(all, e.id, e.allDay, sp);
      for (const r of e.resourceIds) byResource = byResource.set(r, indexAdd(byResource.get(r) ?? EMPTY_INDEXES, e.id, e.allDay, sp));
    };

    for (const m of mutations) {
      const id = mutationId(m);
      if (m.kind === 'series') {
        const current = series.get(id);
        const after = m.after && o.stampAt !== undefined ? stampSeries(current, m.after, o.stampAt) : m.after;
        if (current === after) continue;
        applied.push({ kind: 'series', ...(current && { before: current }), ...(after && { after }) });
        seriesTouched.add(id);
        if (current) seriesIdx = indexRemove(seriesIdx, id, current.base.allDay, seriesSpan(current));
        if (after) {
          seriesIdx = indexAdd(seriesIdx, id, after.base.allDay, seriesSpan(after));
          series = series.set(id, after);
        } else {
          series = series.delete(id);
        }
        continue;
      }
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
    const next = new StoreSnapshot({ ...this.state, version: this.version + 1, events, all, byResource, series, seriesIdx });
    return { next, touched, seriesTouched, applied };
  }

  /** @internal */
  withSourceBookkeeping(owners: SnapshotState['owners'], chunks: SnapshotState['chunks']): StoreSnapshot {
    return new StoreSnapshot({ ...this.state, owners, chunks });
  }
}

/** A series equal to the stored one keeps that object; a different one takes the revision. */
function stampSeries(prev: Series | undefined, next: Series, revision: number): Series {
  if (prev && seriesEquals(prev, next)) return prev;
  if (next.revision === revision) return next;
  // What did not change keeps its object (and its revision): an override
  // leaves the base alone, so the occurrences built from it stay as drawn.
  const base = prev && eventEquals(prev.base, next.base) ? prev.base : (Object.freeze({ ...next.base, revision }) as CalEvent);
  const set = prev && setEquals(prev.set, next.set) ? prev.set : next.set;
  return Object.freeze({ ...next, revision, base, set });
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
   * Replaces what one chunk of one source delivered — events and series. An
   * item delivered by two chunks belongs to both, and goes only when both
   * drop it. An item equal to the stored one keeps its object and revision.
   * The source is the authority: an item edited or deleted locally comes back
   * as the source says on the next delivery.
   */
  replaceSourceChunk(sourceId: string, chunk: string, items: readonly Normalized[]): StoreChange;
  subscribe(fn: (change: StoreChange) => void): () => void;
}

function describe(
  prev: StoreSnapshot,
  next: StoreSnapshot,
  touched: Map<EventId, CalEvent | undefined>,
  seriesTouched: Set<SeriesId>,
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
  const touchedSeries: SeriesId[] = [];
  const seriesChanged: SeriesId[] = [];
  for (const id of seriesTouched) {
    const before = prev.getSeries(id);
    const after = next.getSeries(id);
    if (before === after) continue;
    seriesChanged.push(id);
    // Only overrides or EXDATEs changed: the occurrences they name are what
    // changed, at known places. Anything else may move occurrences anywhere.
    if (before && after && before.base === after.base && sameRulesAndAdditions(before, after)) {
      for (const at of changedPlaces(before, after)) (after.base.allDay ? days : spans).push(occurrenceSpan(after, at));
      continue;
    }
    touchedSeries.push(id);
  }
  const changed = added.length + updated.length + removed.length + seriesChanged.length > 0;
  return {
    version: changed ? next.version : prev.version,
    added,
    updated,
    removed,
    seriesTouched: touchedSeries,
    seriesChanged,
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
    if (!isEmptyChange(change)) {
      // One listener that throws must not keep the change from the others.
      for (const fn of [...listeners]) {
        try {
          fn(change);
        } catch (err) {
          // Reported as an unhandled rejection: visible, and after the round.
          void Promise.reject(err);
        }
      }
    }
    return change;
  };

  return {
    get snapshot() {
      return snapshot;
    },

    apply(mutations, cause) {
      const restoring = cause === 'undo' || cause === 'redo';
      const { next, touched, seriesTouched, applied } = snapshot.withMutations(mutations, restoring ? {} : { stampAt: snapshot.version + 1 });
      const change = describe(snapshot, next, touched, seriesTouched, applied, cause, []);
      return isEmptyChange(change) ? change : commit(next, change);
    },

    replaceSourceChunk(sourceId, chunk, items) {
      const chunkKey = `${sourceId}\u0000${chunk}`;
      const { events, series } = snapshot.state;
      let owners = snapshot.state.owners;
      const problems: Problem[] = [];
      const mutations: Mutation[] = [];
      const delivered = new Set<string>();

      for (const item of items) {
        const kind = item.kind;
        const id = kind === 'event' ? item.event.id : item.series.id;
        const tag = `${kind}:${id}`;
        const current = kind === 'event' ? events.get(id) : series.get(id);
        // An id is one thing: an event and a series may not share it, whoever brought them.
        const other = kind === 'event' ? series.get(id) : events.get(id);
        if ((current && current.sourceId !== sourceId) || other) {
          // Someone else holds this id now (a user's, another source's):
          // refuse, and stop counting this chunk among the id's owners.
          problems.push(problem('duplicate-id', 'error', `${sourceId}/${chunk}`, id));
          const rest = (owners.get(tag) ?? []).filter((k) => k !== chunkKey);
          owners = rest.length > 0 ? owners.set(tag, rest) : owners.delete(tag);
          continue;
        }
        if (delivered.has(tag)) continue;
        delivered.add(tag);
        const own = owners.get(tag);
        if (!own) owners = owners.set(tag, [chunkKey]);
        else if (!own.includes(chunkKey)) owners = owners.set(tag, [...own, chunkKey]);
        if (kind === 'event') {
          const tagged = item.event.sourceId === sourceId ? item.event : ({ ...item.event, sourceId } as CalEvent);
          mutations.push({ kind: 'event', ...(current && { before: current as CalEvent }), after: tagged });
        } else {
          const tagged = item.series.sourceId === sourceId ? item.series : { ...item.series, sourceId };
          mutations.push({ kind: 'series', ...(current && { before: current as Series }), after: tagged });
        }
      }

      for (const tag of snapshot.state.chunks.get(chunkKey) ?? []) {
        if (delivered.has(tag)) continue;
        const rest = (owners.get(tag) ?? []).filter((k) => k !== chunkKey);
        if (rest.length > 0) {
          owners = owners.set(tag, rest);
          continue;
        }
        owners = owners.delete(tag);
        const [kind, ...idParts] = tag.split(':');
        const id = idParts.join(':');
        // Only what this source still owns: the id may now be a user's.
        if (kind === 'event') {
          const current = events.get(id);
          if (current && current.sourceId === sourceId) mutations.push({ kind: 'event', before: current });
        } else {
          const current = series.get(id);
          if (current && current.sourceId === sourceId) mutations.push({ kind: 'series', before: current });
        }
      }

      // The source is the authority on its series too: what was edited locally
      // around one (overrides, a part cut off by "this and following") goes
      // when the source says the series again, or stops saying it.
      const localGone = new Set<string>();
      for (const m of [...mutations]) {
        if (m.kind !== 'series' || !m.before) continue;
        const was = m.before;
        if (m.after && seriesEquals(was, m.after)) continue;
        const kept = new Set(m.after ? m.after.overrides.values() : []);
        for (const id of was.overrides.values()) {
          const ev = events.get(id);
          if (ev && ev.sourceId === undefined && !kept.has(id) && !localGone.has(`event:${id}`)) {
            localGone.add(`event:${id}`);
            mutations.push({ kind: 'event', before: ev });
          }
        }
        // Every local part cut from it, and the parts cut from those, to the end of the chain.
        const cutFrom = [was.id];
        while (cutFrom.length > 0) {
          const parent = cutFrom.pop()!;
          for (const other of series.values()) {
            if (other.splitFrom?.seriesId !== parent || other.sourceId !== undefined || localGone.has(`series:${other.id}`)) continue;
            localGone.add(`series:${other.id}`);
            cutFrom.push(other.id);
            for (const id of other.overrides.values()) {
              const ev = events.get(id);
              if (ev && !localGone.has(`event:${id}`)) {
                localGone.add(`event:${id}`);
                mutations.push({ kind: 'event', before: ev });
              }
            }
            mutations.push({ kind: 'series', before: other });
          }
        }
      }

      const chunks = delivered.size > 0 ? snapshot.state.chunks.set(chunkKey, [...delivered]) : snapshot.state.chunks.delete(chunkKey);
      const base = snapshot.withSourceBookkeeping(owners, chunks);
      const { next, touched, seriesTouched, applied } = base.withMutations(mutations, { stampAt: base.version + 1 });
      const change = describe(base, next, touched, seriesTouched, applied, 'source', problems);
      return commit(isEmptyChange(change) ? base : next, change);
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export { keyOf };
