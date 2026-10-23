import { itemEvent, normalizeMany } from '../event/normalize.js';
import type { NormalizationReport, NormalizeContext, Normalized } from '../event/normalize.js';
import type { Problem } from '../event/problems.js';
import type { EventInput } from '../event/types.js';
import type { Series } from '../recurrence/series.js';
import { problem } from '../event/problems.js';
import type { Mutation } from '../store/changes.js';
import { datesWindow, sourceOf } from '../store/store.js';
import type { EventStore } from '../store/store.js';
import { Temporal } from '../temporal.js';
import type { Instant, PlainDate, ZoneId } from '../temporal.js';
import { chunksCovering } from './chunks.js';
import type { Chunk } from './chunks.js';
import type { AbortSignalLike, EventSourceSpec, SourceEdit, SourceResult } from './source.js';

/** What the manager tells its owner. */
export type SourceNotice =
  | { readonly type: 'loading'; readonly loading: boolean }
  /** A fetch failed for good (after its retries). The chunks keep what they had. */
  | { readonly type: 'error'; readonly sourceId: string; readonly chunks: readonly string[]; readonly error: unknown }
  /** Some events of a delivery were refused or bent. */
  | { readonly type: 'problems'; readonly sourceId: string; readonly report: NormalizationReport }
  /** A save was refused: the edits were put back (`reverted`), or, when other changes came in between, the source is fetched again. */
  | { readonly type: 'save-error'; readonly sourceId: string; readonly edits: readonly SourceEdit[]; readonly error: unknown; readonly reverted: boolean }
  | { readonly type: 'saved'; readonly sourceId: string; readonly edits: readonly SourceEdit[] };

/** Timers, injectable for tests; the core names their shape itself (no DOM lib). */
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface SourceManagerOptions {
  readonly store: EventStore;
  /** Read at every delivery: the zone may have changed since. */
  readonly normalize: () => NormalizeContext;
  readonly notify?: (n: SourceNotice) => void;
  readonly now?: () => Instant;
  readonly timers?: Timers;
  /** Requests in flight at once, all sources together. Default 4. */
  readonly maxConcurrent?: number;
  /** Loaded chunks kept per source outside what is needed, the least recently shown dropped first. Default 12. */
  readonly keepChunks?: number;
  /** Ids the owner loads by other means (the kernel's `events`): refused, with a `duplicate-id` problem. */
  readonly reserved?: readonly string[];
}

export interface SourceManager {
  /** Adds a source, or replaces the one with its id: its events stay until the new spec's arrive. */
  add(spec: EventSourceSpec): void;
  /** Withdraws a source and its events. */
  remove(id: string): void;
  get(id: string): EventSourceSpec | undefined;
  ids(): string[];
  /** What is shown: `[start, end)` dates, read in `zone`. Fetches what is missing. */
  setRange(start: PlainDate, end: PlainDate, zone: ZoneId): void;
  /** Fetches again (one source, or all); the events stay until the answers replace them. Older answers are ignored. */
  refetch(id?: string): void;
  readonly loading: boolean;
  /** Settles once nothing is fetching, waiting to retry, or saving. */
  idle(): Promise<void>;
  /**
   * Fetches `[start, end)` (dates in the shown zone) beside what is shown and
   * keeps it until released (a print or an export of other dates). `ready`
   * settles once nothing is fetching or saving, with the held chunks that
   * could not be loaded (`source:chunk`): what the file lacks.
   */
  hold(start: PlainDate, end: PlainDate): { readonly ready: Promise<{ readonly failed: readonly string[] }>; release(): void };
  destroy(): void;
}

interface Controller {
  readonly signal: AbortSignalLike;
  abort(): void;
}

/** A real AbortController where there is one (a `fetch` needs a real signal), else a stand-in. */
function controller(): Controller {
  const C = (globalThis as { AbortController?: new () => Controller }).AbortController;
  if (C) return new C();
  const listeners: (() => void)[] = [];
  const signal = { aborted: false, addEventListener: (_: 'abort', fn: () => void) => void listeners.push(fn) };
  return {
    signal,
    abort() {
      if (signal.aborted) return;
      signal.aborted = true;
      for (const fn of listeners) fn();
    },
  };
}

export const globalTimers: Timers = {
  set: (fn, ms) => (globalThis as unknown as { setTimeout(f: () => void, ms: number): unknown }).setTimeout(fn, ms),
  clear: (h) => (globalThis as unknown as { clearTimeout(h: unknown): void }).clearTimeout(h),
};

interface Request {
  readonly src: SourceState;
  readonly chunks: readonly Chunk[];
  readonly gen: number;
  readonly ctrl: Controller;
  attempt: number;
  state: 'queued' | 'running' | 'waiting' | 'done';
  timer?: unknown;
}

interface Entry {
  /** When its events were delivered (epoch ms); absent while the first fetch is out. */
  fetchedAt?: number;
  req?: Request;
  lastUsed: number;
}

interface SourceState {
  spec: EventSourceSpec;
  gen: number;
  readonly cache: Map<string, Entry>;
  readonly requests: Set<Request>;
  /** Tags (`event:id`) with a save in flight: a delivery does not overwrite them. */
  readonly pending: Map<string, number>;
  /** Pending tags a delivery wanted to overwrite: fetched again once the save settles. */
  readonly shielded: Set<string>;
  saving: Promise<void>;
  saves: number;
}

const WHOLE: Chunk[] = [{ key: '*', start: null as unknown as PlainDate, end: null as unknown as PlainDate }];

const tagOf = (n: Normalized) => (n.kind === 'event' ? `event:${n.event.id}` : `series:${n.series.id}`);
const editTag = (e: SourceEdit) => `${e.kind}:${e.id}`;

/**
 * Fetches each source's events chunk by chunk as the calendar moves, and
 * keeps the store in step: contiguous missing chunks go out as one request,
 * at most `maxConcurrent` at once; a request nobody needs any more is
 * aborted; an answer from before a refetch is ignored; a chunk is applied
 * atomically (an event over two chunks is owned by both and leaves with the
 * last). Edits to a source with `save` are written back, optimistically.
 */
export function createSourceManager(o: SourceManagerOptions): SourceManager {
  const { store } = o;
  const notify = o.notify ?? (() => {});
  const now = () => (o.now ? o.now() : Temporal.Now.instant()).epochMilliseconds;
  const timers = o.timers ?? globalTimers;
  const max = o.maxConcurrent ?? 4;
  const keep = o.keepChunks ?? 12;
  const sources = new Map<string, SourceState>();
  const queue: Request[] = [];
  let running = 0;
  let waiting = 0;
  let tick = 0;
  let range: { start: PlainDate; end: PlainDate; zone: ZoneId } | null = null;
  /** Ranges held beside the shown one (`hold`). */
  const holds = new Set<{ start: PlainDate; end: PlainDate }>();
  let loading = false;
  let idlers: (() => void)[] = [];
  let destroyed = false;

  const busy = () => queue.length + running + waiting > 0;
  const saving = () => [...sources.values()].some((s) => s.saves > 0);
  const settle = () => {
    const now = busy();
    if (now !== loading) {
      loading = now;
      notify({ type: 'loading', loading });
    }
    if (!now && !saving() && idlers.length > 0) {
      const done = idlers;
      idlers = [];
      for (const fn of done) fn();
    }
  };

  const staleMs = (spec: EventSourceSpec): number => {
    if (!spec.staleAfter) return Infinity;
    const at = o.now ? o.now() : Temporal.Now.instant();
    return Temporal.Duration.from(spec.staleAfter).total({ unit: 'milliseconds', relativeTo: at.toZonedDateTimeISO('UTC') });
  };

  const neededChunks = (src: SourceState): Chunk[] => {
    const { unit, prefetch } = src.spec.chunk;
    if (unit === 'none') return WHOLE;
    const out = range ? chunksCovering(unit, range.start, range.end, prefetch) : [];
    if (holds.size === 0) return out;
    const seen = new Set(out.map((c) => c.key));
    for (const h of holds) for (const c of chunksCovering(unit, h.start, h.end, 0)) if (!seen.has(c.key)) (seen.add(c.key), out.push(c));
    return out;
  };

  /** Drops chunks from the store (and the cache). */
  const drop = (src: SourceState, keys: readonly string[]) => {
    if (keys.length === 0) return;
    for (const k of keys) src.cache.delete(k);
    store.replaceSourceChunks(src.spec.id, keys.map((k) => [k, []] as const));
  };

  const abort = (req: Request) => {
    if (req.state === 'done') return;
    if (req.state === 'waiting') {
      timers.clear(req.timer);
      waiting--;
    }
    if (req.state === 'running') running--;
    if (req.state === 'queued') queue.splice(queue.indexOf(req), 1);
    req.state = 'done';
    req.ctrl.abort();
    req.src.requests.delete(req);
    // Chunks never loaded go; loaded ones keep their (stale) events.
    for (const c of req.chunks) {
      const e = req.src.cache.get(c.key);
      if (e?.req !== req) continue;
      if (e.fetchedAt === undefined) req.src.cache.delete(c.key);
      else delete e.req;
    }
  };

  function sync(src: SourceState): void {
    const needed = neededChunks(src);
    const keys = new Set(needed.map((c) => c.key));
    const stale = staleMs(src.spec);
    const t = now();
    tick++;
    // Nobody needs it any more: abort.
    for (const req of [...src.requests]) if (!req.chunks.some((c) => keys.has(c.key))) abort(req);
    let run: Chunk[] = [];
    const runs: Chunk[][] = [];
    for (const c of needed) {
      const e = src.cache.get(c.key);
      if (e) e.lastUsed = tick;
      const missing = !e || (!e.req && e.fetchedAt !== undefined && t - e.fetchedAt >= stale);
      if (missing) run.push(c);
      else if (run.length > 0) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length > 0) runs.push(run);
    for (const chunks of runs) request(src, chunks);
    // Keep a few chunks around for going back; drop the rest.
    // A chunk holding something with a save out stays until the save settles.
    const holdsPending = (k: string) => (store.snapshot.state.chunks.get(`${src.spec.id}\u0000${k}`) ?? []).some((t) => src.pending.has(t));
    const spare = [...src.cache].filter(([k, e]) => !keys.has(k) && !e.req && e.fetchedAt !== undefined && !holdsPending(k));
    spare.sort((a, b) => b[1].lastUsed - a[1].lastUsed);
    drop(src, spare.slice(keep).map(([k]) => k));
    dispatch();
    settle();
  }

  function request(src: SourceState, chunks: readonly Chunk[]): void {
    const req: Request = { src, chunks, gen: src.gen, ctrl: controller(), attempt: 0, state: 'queued' };
    for (const c of chunks) {
      const e = src.cache.get(c.key);
      if (e) e.req = req;
      else src.cache.set(c.key, { req, lastUsed: tick });
    }
    src.requests.add(req);
    queue.push(req);
  }

  function dispatch(): void {
    while (running < max && queue.length > 0) {
      const req = queue.shift()!;
      req.state = 'running';
      running++;
      start(req);
    }
  }

  function start(req: Request): void {
    const { src, chunks } = req;
    const window = src.spec.chunk.unit === 'none' || !range ? null : datesWindow(chunks[0]!.start, chunks[chunks.length - 1]!.end, range.zone);
    let answer: Promise<SourceResult> | SourceResult;
    try {
      answer = src.spec.fetch({ window, signal: req.ctrl.signal, sourceId: src.spec.id });
    } catch (err) {
      failed(req, err);
      return;
    }
    if (typeof (answer as PromiseLike<unknown>)?.then === 'function') {
      (answer as Promise<SourceResult>).then(
        (v) => delivered(req, v),
        (err) => failed(req, err),
      );
    } else delivered(req, answer as SourceResult);
  }

  /** False for an answer nobody waits for any more: aborted, or from before a refetch. */
  const current = (req: Request) => req.state === 'running' && !destroyed && req.gen === req.src.gen && sources.get(req.src.spec.id) === req.src;

  function finish(req: Request): void {
    if (req.state === 'running') running--;
    req.state = 'done';
    req.src.requests.delete(req);
  }

  function delivered(req: Request, v: SourceResult): void {
    if (!current(req)) {
      if (req.state === 'running') finish(req);
      dispatch();
      settle();
      return;
    }
    const inputs = Array.isArray(v) ? (v as readonly EventInput[]) : (v as { events?: unknown })?.events;
    if (!Array.isArray(inputs)) {
      failed(req, new TypeError(`source ${req.src.spec.id} answered without a list of events`));
      return;
    }
    finish(req);
    apply(req.src, req.chunks, inputs, Array.isArray(v) ? [] : ((v as { problems?: readonly Problem[] }).problems ?? []));
    const t = now();
    for (const c of req.chunks) {
      const e = req.src.cache.get(c.key);
      if (e?.req === req) {
        delete e.req;
        e.fetchedAt = t;
      }
    }
    dispatch();
    settle();
  }

  function failed(req: Request, error: unknown): void {
    if (!current(req)) {
      if (req.state === 'running') finish(req);
      dispatch();
      settle();
      return;
    }
    const retry = req.src.spec.retry;
    if (retry && req.attempt < retry.attempts) {
      running--;
      req.attempt++;
      req.state = 'waiting';
      waiting++;
      req.timer = timers.set(() => {
        if (req.state !== 'waiting') return;
        waiting--;
        req.state = 'queued';
        queue.push(req);
        dispatch();
        settle();
      }, retry.backoffMs * 2 ** (req.attempt - 1));
      dispatch();
      settle();
      return;
    }
    finish(req);
    for (const c of req.chunks) {
      const e = req.src.cache.get(c.key);
      if (e?.req !== req) continue;
      // Never loaded: asked again when the shown range next changes. Loaded
      // before: what it had stays, until it is stale or refetched.
      if (e.fetchedAt === undefined) req.src.cache.delete(c.key);
      else delete e.req;
    }
    notify({ type: 'error', sourceId: req.src.spec.id, chunks: req.chunks.map((c) => c.key), error });
    dispatch();
    settle();
  }

  /**
   * Normalizes the whole answer first (derived ids depend on the batch), then
   * gives each chunk what meets it. A series, and the overrides of a series
   * in the answer, go to every chunk asked; so does an event meeting none.
   */
  function apply(src: SourceState, chunks: readonly Chunk[], inputs: readonly EventInput[], problems: readonly Problem[]): void {
    const { defaults, id } = src.spec;
    const withDefaults = defaults ? inputs.map((e) => ({ ...defaults, ...e })) : inputs;
    const { items, report } = normalizeMany(withDefaults, o.normalize(), id);
    if (problems.length + report.problems.length > 0) {
      notify({ type: 'problems', sourceId: id, report: { ...report, problems: [...problems.map((p) => ({ ...p, sourceId: id })), ...report.problems] } });
    }
    const shown = items.flatMap((item): Normalized[] => {
      const tag = tagOf(item);
      if (!src.pending.has(tag)) return [item];
      // A save is out for it: what the person sees stays until it settles.
      src.shielded.add(tag);
      const snap = store.snapshot;
      if (item.kind === 'event') {
        const ev = snap.getEvent(item.event.id);
        return ev && ev.sourceId === id ? [{ kind: 'event', event: ev }] : [];
      }
      const sr = snap.getSeries(item.series.id);
      return sr && sr.sourceId === id ? [{ kind: 'series', series: sr }] : [];
    });
    const entries: [string, Normalized[]][] = chunks.map((c) => [c.key, []]);
    if (chunks.length === 1) entries[0]![1] = shown;
    else {
      const seriesIds = new Set(shown.flatMap((n) => (n.kind === 'series' ? [n.series.id] : [])));
      const spans = chunks.map((c) => datesWindow(c.start, c.end, range!.zone));
      for (const n of shown) {
        const ev = itemEvent(n);
        const everywhere = n.kind === 'series' || (ev.ref !== undefined && seriesIds.has(ev.ref.seriesId));
        let met = false;
        if (!everywhere) {
          chunks.forEach((c, i) => {
            const hit = ev.allDay
              ? Temporal.PlainDate.compare(ev.start, c.end) < 0 && Temporal.PlainDate.compare(ev.end, c.start) > 0
              : ev.start.epochMilliseconds < spans[i]!.end.epochMilliseconds &&
                (ev.end.epochMilliseconds > spans[i]!.start.epochMilliseconds ||
                  (ev.end.epochMilliseconds === ev.start.epochMilliseconds && ev.start.epochMilliseconds >= spans[i]!.start.epochMilliseconds));
            if (hit) {
              entries[i]![1].push(n);
              met = true;
            }
          });
        }
        if (!met) for (const e of entries) e[1].push(n);
      }
    }
    store.replaceSourceChunks(id, entries);
  }

  // ── Writing edits back ──────────────────────────────────────────────

  const unsubscribe = store.subscribe((change) => {
    if (change.cause !== 'command' && change.cause !== 'undo' && change.cause !== 'redo') return;
    const bySource = new Map<SourceState, SourceEdit[]>();
    // Series as this change left them (or had them), then as the store holds them:
    // an override or a split made by this very command finds its series here.
    const inChange = new Map<string, Series>();
    for (const m of change.applied) if (m.kind === 'series') inChange.set((m.after ?? m.before)!.id, (m.after ?? m.before)!);
    const seriesById = (id: string) => inChange.get(id) ?? store.snapshot.getSeries(id);
    for (const m of change.applied) {
      const obj = (m.after ?? m.before)!;
      const sid = sourceOf(obj, seriesById);
      const src = sid === undefined ? undefined : sources.get(sid);
      if (!src?.spec.save) continue;
      const edit = (m.kind === 'event'
        ? { kind: 'event', id: obj.id, ...(m.before && { before: m.before }), ...(m.after && { after: m.after }) }
        : { kind: 'series', id: obj.id, ...(m.before && { before: m.before }), ...(m.after && { after: m.after }) }) as SourceEdit;
      bySource.set(src, [...(bySource.get(src) ?? []), edit]);
    }
    for (const [src, edits] of bySource) save(src, edits, change.cause as 'command' | 'undo' | 'redo');
  });

  function save(src: SourceState, edits: readonly SourceEdit[], cause: 'command' | 'undo' | 'redo'): void {
    const tags = edits.map(editTag);
    for (const t of tags) src.pending.set(t, (src.pending.get(t) ?? 0) + 1);
    src.saves++;
    const spec = src.spec;
    // One at a time per source, in order: the server sees the edits as they happened.
    src.saving = src.saving.then(async () => {
      let error: unknown;
      let ok = true;
      try {
        await spec.save!({ sourceId: spec.id, edits, cause });
      } catch (e) {
        ok = false;
        error = e;
      }
      let refetchAfter = false;
      if (!ok && !destroyed) {
        const reverted = revert(edits);
        refetchAfter = !reverted;
        notify({ type: 'save-error', sourceId: spec.id, edits, error, reverted });
      } else if (ok) notify({ type: 'saved', sourceId: spec.id, edits });
      for (const t of tags) {
        const n = (src.pending.get(t) ?? 1) - 1;
        if (n > 0) src.pending.set(t, n);
        else {
          src.pending.delete(t);
          // The source sent something for it meanwhile: ask again for the truth.
          if (src.shielded.delete(t)) refetchAfter = true;
        }
      }
      src.saves--;
      if (refetchAfter && !destroyed && sources.get(spec.id) === src) refetch(spec.id);
      settle();
    });
  }

  /** Puts back what the edits changed, if nothing else changed it since. True when all of it went back. */
  function revert(edits: readonly SourceEdit[]): boolean {
    const snap = store.snapshot;
    const back: Mutation[] = [];
    let all = true;
    for (const e of [...edits].reverse()) {
      const now = e.kind === 'event' ? snap.getEvent(e.id) : snap.getSeries(e.id);
      if (now !== e.after) {
        all = false;
        continue;
      }
      back.push({ kind: e.kind, ...(e.after && { before: e.after }), ...(e.before && { after: e.before }) } as Mutation);
    }
    if (back.length > 0) store.apply(back, 'source');
    return all;
  }

  function refetch(id?: string): void {
    for (const src of id === undefined ? sources.values() : [sources.get(id)].filter((s): s is SourceState => !!s)) {
      src.gen++;
      for (const req of [...src.requests]) abort(req);
      for (const e of src.cache.values()) e.fetchedAt = -Infinity;
      sync(src);
    }
  }

  return {
    add(spec) {
      if (o.reserved?.includes(spec.id)) {
        notify({ type: 'problems', sourceId: spec.id, report: { accepted: 0, rejected: 0, problems: [{ ...problem('duplicate-id', 'error', 'sources', spec.id), sourceId: spec.id }] } });
        return;
      }
      const prev = sources.get(spec.id);
      if (prev) {
        if (prev.spec === spec) return;
        const recut = prev.spec.chunk.unit !== spec.chunk.unit;
        prev.spec = spec;
        if (recut) {
          // Other chunk keys: what the old ones hold would never be replaced.
          prev.gen++;
          for (const req of [...prev.requests]) abort(req);
          drop(prev, [...prev.cache.keys()]);
        } else {
          // What another spec fetched for dates not shown would come back unchanged when they are: gone, fetched anew then.
          const shown = new Set(neededChunks(prev).map((c) => c.key));
          const unseen = [...prev.cache.keys()].filter((k) => !shown.has(k));
          if (unseen.length > 0) drop(prev, unseen);
        }
        refetch(spec.id);
        return;
      }
      const src: SourceState = { spec, gen: 0, cache: new Map(), requests: new Set(), pending: new Map(), shielded: new Set(), saving: Promise.resolve(), saves: 0 };
      sources.set(spec.id, src);
      sync(src);
    },
    remove(id) {
      const src = sources.get(id);
      if (!src) return;
      src.gen++;
      for (const req of [...src.requests]) abort(req);
      sources.delete(id);
      const keys = [...src.cache.keys()];
      src.cache.clear();
      if (keys.length > 0) store.replaceSourceChunks(id, keys.map((k) => [k, []] as const));
      dispatch();
      settle();
    },
    get: (id) => sources.get(id)?.spec,
    ids: () => [...sources.keys()],
    setRange(start, end, zone) {
      // The same range again (a locale or an option changed): nothing to fetch,
      // and a chunk that just failed is not asked again in a loop.
      if (range && range.start.equals(start) && range.end.equals(end) && range.zone === zone) return;
      range = { start, end, zone };
      for (const src of sources.values()) sync(src);
    },
    refetch,
    get loading() {
      return loading;
    },
    idle() {
      if (!busy() && !saving()) return Promise.resolve();
      return new Promise<void>((resolve) => idlers.push(resolve));
    },
    hold(start, end) {
      const h = { start, end };
      holds.add(h);
      for (const src of sources.values()) sync(src);
      const idle = !busy() && !saving() ? Promise.resolve() : new Promise<void>((resolve) => idlers.push(resolve));
      // Loaded or not: a chunk never answered (its retries spent) is missing from what is held.
      const ready = idle.then(() => {
        const failed: string[] = [];
        for (const src of sources.values()) {
          const { unit } = src.spec.chunk;
          for (const c of unit === 'none' ? WHOLE : chunksCovering(unit, start, end, 0)) {
            const e = src.cache.get(c.key);
            if (!e || e.fetchedAt === undefined) failed.push(`${src.spec.id}:${c.key}`);
          }
        }
        return { failed };
      });
      let held = true;
      return {
        ready,
        release() {
          if (!held || destroyed) return;
          held = false;
          holds.delete(h);
          // What it loaded stays as spare chunks (dropped least recently used first).
          for (const src of sources.values()) sync(src);
        },
      };
    },
    destroy() {
      destroyed = true;
      for (const src of sources.values()) for (const req of [...src.requests]) abort(req);
      unsubscribe();
      settle();
      sources.clear();
    },
  };
}
