import { normalizeMany } from '../event/normalize.js';
import type { NormalizationReport, NormalizeContext } from '../event/normalize.js';
import type { EventInput } from '../event/types.js';
import type { StoreChange } from '../store/changes.js';
import type { EventStore } from '../store/store.js';
import type { EventSourceSpec } from './source.js';

/**
 * A fixed list, one chunk for all of time. `defaults` are laid under each
 * event's own fields, one level deep: an event's `classNames` replaces the
 * default list rather than adding to it.
 */
export function arraySource(id: string, events: readonly EventInput[], defaults?: Partial<EventInput>): EventSourceSpec {
  return { id, fetch: () => events, chunk: { unit: 'none', prefetch: 0 }, ...(defaults && { defaults }) };
}

const NEVER = { aborted: false, addEventListener() {} };

/**
 * Loads a source whose `fetch` answers synchronously and is not chunked —
 * an array source — straight into the store. Asynchronous and chunked sources
 * go through the source manager (Phase 9).
 */
export function loadStaticSource(
  store: EventStore,
  spec: EventSourceSpec,
  ctx: NormalizeContext,
): { change: StoreChange; report: NormalizationReport } {
  if (spec.chunk.unit !== 'none') throw new Error(`source ${spec.id} is chunked: use the source manager`);
  const raw = spec.fetch({ sourceId: spec.id, signal: NEVER, window: null });
  if (typeof (raw as PromiseLike<unknown>).then === 'function') throw new Error(`source ${spec.id} is asynchronous: use the source manager`);
  const inputs = (raw as readonly EventInput[]).map((e) => (spec.defaults ? { ...spec.defaults, ...e } : e));
  const { items, report } = normalizeMany(inputs, ctx, spec.id);
  return { change: store.replaceSourceChunk(spec.id, '*', items), report };
}
