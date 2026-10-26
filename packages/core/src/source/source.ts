import type { Problem } from '../event/problems.js';
import type { CalEvent, EventInput } from '../event/types.js';
import type { Series } from '../recurrence/series.js';
import type { Duration } from '../temporal.js';
import type { ViewWindow } from '../store/store.js';

/**
 * The core has no DOM types (`lib: ES2023`), so it names the shape of an abort
 * signal itself. A real `AbortSignal` fits it.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
}

/**
 * The platform's own `AbortSignal` where its types are known (a browser's DOM
 * lib, Node's types) — what a source's fetch hands to `fetch` — else nothing
 * more than `AbortSignalLike`. Resolved in the application's compilation, not ours.
 */
export type PlatformAbortSignal = typeof globalThis extends { readonly AbortSignal: { readonly prototype: infer S } } ? S : unknown;

export interface FetchRequest {
  /**
   * The stretch to fetch. Null for an unchunked source, which answers for all
   * of time. A chunk is whole dates: its instants run from the first date's
   * midnight at UTC+14 to the last's at UTC−12, so the events of those dates
   * are in it whatever zone the calendar shows — changing zone fetches nothing.
   */
  readonly window: ViewWindow | null;
  /** A real `AbortSignal` wherever the platform has one: pass it to `fetch`. */
  readonly signal: AbortSignalLike & PlatformAbortSignal;
  readonly sourceId: string;
}

/** What a fetch answers: the events, and what reading them went wrong (an iCal file's lines). */
export type SourceResult = readonly EventInput[] | { readonly events: readonly EventInput[]; readonly problems?: readonly Problem[] };

export type SourceFetch = (req: FetchRequest) => Promise<SourceResult> | SourceResult;

/** How a source's time is cut into pieces fetched and cached separately. */
export interface ChunkPolicy {
  readonly unit: 'none' | 'week' | 'month' | 'year';
  /** Chunks fetched ahead on each side of what is shown. */
  readonly prefetch: number;
}

/** One thing a person changed in a source's events, as the store held it before and holds it now. */
export type SourceEdit =
  | { readonly kind: 'event'; readonly id: string; readonly before?: CalEvent; readonly after?: CalEvent }
  | { readonly kind: 'series'; readonly id: string; readonly before?: Series; readonly after?: Series };

export interface SaveRequest {
  readonly sourceId: string;
  /** In the order they happened. `exportInputs` writes them back as inputs. */
  readonly edits: readonly SourceEdit[];
  readonly cause: 'command' | 'undo' | 'redo';
}

export interface EventSourceSpec {
  readonly id: string;
  readonly fetch: SourceFetch;
  readonly chunk: ChunkPolicy;
  /** Chunks older than this are fetched again when shown. */
  readonly staleAfter?: Duration;
  /** Attempts after the first, each `backoffMs` × 2ⁿ later. Default: none. */
  readonly retry?: { readonly attempts: number; readonly backoffMs: number };
  /** Inherited by every event of the source, under its own fields. */
  readonly defaults?: Partial<EventInput>;
  /**
   * Writes a person's edits back (optimistic: they show at once). A rejection
   * puts them back as they were; while it is pending, a refetch does not
   * overwrite them. Without it, an edit lasts until the source is fetched again.
   */
  readonly save?: (req: SaveRequest) => Promise<unknown> | unknown;
}
