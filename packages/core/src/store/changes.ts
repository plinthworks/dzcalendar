import type { CalEvent, EventId, SeriesId } from '../event/types.js';
import type { Series } from '../recurrence/series.js';
import type { Problem } from '../event/problems.js';
import type { MsSpan } from '../intervals.js';

/**
 * One step of a transaction: an event or a series appears (`after` only),
 * disappears (`before` only) or is replaced. Undo is built from these, not
 * from commands: replaying `invert` restores exactly what was there — no
 * server, no validation rule, no re-normalization in between.
 */
export type Mutation =
  | { readonly kind: 'event'; readonly before?: CalEvent; readonly after?: CalEvent }
  | { readonly kind: 'series'; readonly before?: Series; readonly after?: Series };

export function invert(m: Mutation): Mutation {
  return {
    kind: m.kind,
    ...(m.after !== undefined && { before: m.after }),
    ...(m.before !== undefined && { after: m.before }),
  } as Mutation;
}

export const mutationId = (m: Mutation): string => (m.after ?? m.before)!.id;
/** Events and series have separate id spaces: what a mutation touches, uniquely. */
export const mutationKey = (m: Mutation): string => `${m.kind}:${mutationId(m)}`;

export type ChangeCause = 'command' | 'source' | 'undo' | 'redo' | 'api';

/**
 * What one transaction did, net: an event changed twice is `updated` once.
 * `dirtySpans` (epoch ms) and `dirtyDays` (epoch days, for floating all-day
 * events) cover each touched event's old and new place, so a view redraws
 * those stretches and nothing else.
 */
export interface StoreChange {
  readonly version: number;
  readonly added: readonly EventId[];
  readonly updated: readonly EventId[];
  readonly removed: readonly EventId[];
  readonly dirtySpans: readonly MsSpan[];
  readonly dirtyDays: readonly MsSpan[];
  readonly cause: ChangeCause;
  /**
   * Series added, changed or removed. Their occurrences may lie anywhere, to
   * the end of time: a view that shows any of them rebuilds rather than
   * reading spans.
   */
  readonly seriesTouched: readonly SeriesId[];
  /**
   * Every series whose object changed — those in `seriesTouched`, and those
   * where only overrides or EXDATEs changed (their places are in the dirty
   * spans). What history and other writers watch.
   */
  readonly seriesChanged: readonly SeriesId[];
  /** Items a source handed in but the store refused (an id already owned elsewhere). */
  readonly problems: readonly Problem[];
  /**
   * The mutations as the store carried them out: `before` is what was really
   * there, `after` the stamped object now stored. What an undo must record —
   * the objects the store holds, compared later by identity.
   */
  readonly applied: readonly Mutation[];
}

export const isEmptyChange = (c: StoreChange): boolean =>
  c.added.length === 0 && c.updated.length === 0 && c.removed.length === 0 && c.seriesChanged.length === 0;
