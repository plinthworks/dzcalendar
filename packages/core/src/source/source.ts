import type { EventInput } from '../event/types.js';
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

export interface FetchRequest {
  /** The stretch to fetch. Null for an unchunked source, which answers for all of time. */
  readonly window: ViewWindow | null;
  readonly signal: AbortSignalLike;
  readonly sourceId: string;
}

export type SourceFetch = (req: FetchRequest) => Promise<readonly EventInput[]> | readonly EventInput[];

/** How a source's time is cut into pieces fetched and cached separately (Phase 9 manager). */
export interface ChunkPolicy {
  readonly unit: 'none' | 'week' | 'month' | 'year';
  /** Chunks fetched ahead on each side of what is shown. */
  readonly prefetch: number;
}

export interface EventSourceSpec {
  readonly id: string;
  readonly fetch: SourceFetch;
  readonly chunk: ChunkPolicy;
  readonly staleAfter?: Duration;
  readonly retry?: { readonly attempts: number; readonly backoffMs: number };
  /** Inherited by every event of the source, under its own fields. */
  readonly defaults?: Partial<EventInput>;
}
