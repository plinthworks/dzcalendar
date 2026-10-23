import { normalizeMany } from '../event/normalize.js';
import type { NormalizationReport, NormalizeContext, Normalized } from '../event/normalize.js';
import type { EventInput } from '../event/types.js';
import type { EventStore } from '../store/store.js';
import type { Problem } from '../event/problems.js';
import type { Timers } from './manager.js';

/**
 * The `events` option of a large calendar (owner, 18h: above
 * `DEFER_ABOVE` events): what the shown period needs is normalized and
 * indexed at once; the rest — sorted by the week it starts in — while the
 * page is idle, nearest months first. Nothing changes but *when* the work is
 * done: a read that needs everything (`flush`) finishes it first, and the
 * problems of the rest are told when it is done.
 */
export const DEFER_ABOVE = 2000;

/** Days kept either side of the shown period (a zone's offset, a multi-day event's start before it). */
const MARGIN_DAYS = 7;
/** One idle slice: months until this many milliseconds are spent. */
const SLICE_MS = 4;

/** `YYYY-MM-DD` from a string or a Temporal object's own writing; null when it cannot be read cheaply. */
const DAY = /^(\d{4})-?(\d{2})-?(\d{2})/;
function dayOf(v: unknown): string | null {
  const s = typeof v === 'string' ? v : v !== null && typeof v === 'object' ? String(v) : null;
  const m = s === null ? null : DAY.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Whole days a duration input spans at most (rounded up), or null when it cannot be read cheaply. */
function daysOf(d: unknown): number | null {
  if (d === undefined || d === null) return 1;
  if (typeof d === 'object') {
    const o = d as Record<string, unknown>;
    if (o['years'] !== undefined || o['months'] !== undefined) return null;
    const n = (k: string) => (typeof o[k] === 'number' ? (o[k] as number) : 0);
    return Math.ceil(n('weeks') * 7 + n('days') + n('hours') / 24 + n('minutes') / 1440 + n('seconds') / 86400) + 1;
  }
  return null;
}

/** A day `n` days after an ISO day (UTC arithmetic on numbers: no calendar object for a coarse bound). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const t = epochDayOf(y, m, d) + n;
  return dayFromEpochDay(t);
}
// Civil-from-days (Howard Hinnant): the core reads no `Date`.
/** Days since 1970-01-01 of a civil date (month 1–12). */
function epochDayOf(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function dayFromEpochDay(z0: number): string {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface Partition {
  /** Indexes of the inputs needed now (the period and its margin, and whatever cannot be placed cheaply). */
  readonly now: readonly number[];
  /** The others by the week they start in (its Monday), nearest the period first, with the latest day any of them reaches. */
  readonly later: readonly (readonly [week: string, indexes: readonly number[], end: string])[];
}

/**
 * Sorts the inputs. Kept together, so `normalizeMany` judges them as it
 * would all at once: a repeated id (its duplicates), a series and its
 * overrides, events identical but for their rank (same start: same week).
 */
export function partitionEvents(inputs: readonly EventInput[], from: string, to: string): Partition {
  // A period not written as a plain ISO day (outside years 0000–9999): everything now, nothing guessed.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { now: inputs.map((_, i) => i), later: [] };
  const lo = addDays(from, -MARGIN_DAYS);
  const hi = addDays(to, MARGIN_DAYS);
  const ids = new Map<unknown, number>();
  for (const e of inputs) if (e && typeof e === 'object' && e.id !== undefined && e.id !== null) ids.set(e.id, (ids.get(e.id) ?? 0) + 1);
  const now: number[] = [];
  const months = new Map<string, number[]>();
  const ends = new Map<string, string>();
  for (let i = 0; i < inputs.length; i++) {
    const e = inputs[i] as (EventInput & Record<string, unknown>) | null;
    if (!e || typeof e !== 'object' || e.rrule !== undefined || e.recurrenceId !== undefined || (e.id !== undefined && e.id !== null && (ids.get(e.id) ?? 0) > 1)) {
      now.push(i);
      continue;
    }
    const start = dayOf(e.start);
    const span = e.end !== undefined && e.end !== null ? null : daysOf(e.duration);
    const end = e.end !== undefined && e.end !== null ? dayOf(e.end) : start !== null && span !== null ? addDays(start, span) : null;
    // Not read cheaply, or touching the period: now (its problems said at once too).
    if (start === null || end === null || (start < hi && end >= lo)) {
      now.push(i);
      continue;
    }
    // By the week it starts in (a few hundred events: one idle slice), its Monday as the key.
    const [y, m, d] = start.split('-').map(Number) as [number, number, number];
    const day = epochDayOf(y, m, d);
    // Without an id, near a Monday (Sunday or Monday as written): its twin written in another zone could fall in the other week
    // and lose its rank (`#1`); loaded now, beside it.
    const dow = (((day + 3) % 7) + 7) % 7;
    if ((e.id === undefined || e.id === null) && (dow === 0 || dow === 6)) {
      now.push(i);
      continue;
    }
    const week = dayFromEpochDay(day - ((((day + 3) % 7) + 7) % 7));
    let list = months.get(week);
    if (!list) months.set(week, (list = []));
    list.push(i);
    if (end > (ends.get(week) ?? '')) ends.set(week, end);
  }
  const [cy, cm, cd] = from.split('-').map(Number) as [number, number, number];
  const centre = epochDayOf(cy, cm, cd);
  const distance = (w: string) => {
    const [y, m, d] = w.split('-').map(Number) as [number, number, number];
    return Math.abs(epochDayOf(y, m, d) - centre);
  };
  const later = [...months]
    .sort((a, b) => distance(a[0]) - distance(b[0]) || (a[0] < b[0] ? -1 : 1))
    .map(([w, idx]) => [w, idx, ends.get(w)!] as const);
  return { now, later };
}

const merge = (a: NormalizationReport, b: NormalizationReport): NormalizationReport => ({
  accepted: a.accepted + b.accepted,
  rejected: a.rejected + b.rejected,
  problems: [...a.problems, ...b.problems],
});

type Deadline = { timeRemaining(): number };
type Idle = { requestIdleCallback?(fn: (d: Deadline) => void, o: { timeout: number }): unknown; cancelIdleCallback?(h: unknown): void };
/**
 * The page's idle moments where there are any (a browser: after the frames
 * that show the calendar), else the next turn. A busy page still gets a slice
 * at least every second (`timeout`), so its load ends, more slowly.
 */
export function idleTimers(fallback: Timers): Timers {
  const g = globalThis as Idle;
  const ric = g.requestIdleCallback;
  const cic = g.cancelIdleCallback;
  // The idle period's own length reaches the slice (`fn(deadline)`): a quiet page takes the rest in a few long slices.
  return ric && cic ? { set: (fn) => ric.call(g, fn as (d: Deadline) => void, { timeout: 1000 }), clear: (h) => cic.call(g, h) } : fallback;
}

const clock = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? 0;

export interface DeferredEvents {
  /** What is in the store now: the period's report, then, once done, everything's. */
  readonly report: NormalizationReport;
  /** The week chunks this load writes, with the latest day their events reach: the next load empties those that may reach its period. */
  readonly chunks: ReadonlyMap<string, string>;
  readonly done: boolean;
  /** Whether every week a period (`from` to `to`, ISO days) needs is loaded already. */
  covers(from: string, to: string): boolean;
  /** The weeks a period needs, now (the rest stays for idle time). */
  load(from: string, to: string): void;
  /** Everything left, now. */
  flush(): void;
  /** Nothing more (a new load, the calendar destroyed). */
  cancel(): void;
}

/**
 * Loads `inputs` as the source `sourceId`: the period at once, the rest by
 * week in idle slices, or at once for a period that needs them (`load`);
 * `onDone` with the whole report when finished. `previous` are the week
 * chunks an earlier load wrote: those that may reach this period, and those
 * this load has not, are emptied with this one's first write (one change).
 */
export function loadDeferred(
  store: EventStore,
  sourceId: string,
  inputs: readonly EventInput[],
  ctx: NormalizeContext,
  period: { readonly from: string; readonly to: string },
  timers: Timers,
  previous: ReadonlyMap<string, string>,
  onDone: (report: NormalizationReport) => void,
): DeferredEvents {
  const { now, later } = partitionEvents(inputs, period.from, period.to);
  const take = (idx: readonly number[]) => normalizeMany(idx.map((i) => inputs[i]!), ctx, sourceId, idx);
  const first = take(now);
  const chunks = new Map<string, string>(later.map(([w, , end]) => [`week:${w}`, end]));
  const lo = addDays(period.from, -MARGIN_DAYS);
  const hi = addDays(period.to, MARGIN_DAYS);
  // An earlier load's weeks this one has not, or whose events may reach this period (a long event it removed): emptied now.
  // The others are written again as they load, an unchanged event keeping its object (what an undo checks).
  const stale = [...previous].filter(([k, end]) => !chunks.has(k) || (k.slice(5) <= hi && end >= lo)).map(([k]) => k);
  const firstChange = store.replaceSourceChunks(sourceId, [['*', first.items], ...stale.map((k) => [k, []] as [string, Normalized[]])]);
  // What the store refused (an id a source owns already) is a problem of this load, as in a full one.
  const refused = (problems: readonly Problem[]): NormalizationReport => ({ accepted: 0, rejected: 0, problems });
  let report = firstChange.problems.length > 0 ? merge(first.report, refused(firstChange.problems)) : first.report;
  const loaded = new Set<number>();
  let cursor = 0;
  let timer: unknown = null;
  let cancelled = false;
  let told = false;
  const done = () => cancelled || loaded.size === later.length;
  /** One week (an index into `later`) normalised, its chunk entry. */
  const takeWeek = (k: number): [string, Normalized[]] => {
    loaded.add(k);
    const [week, idx] = later[k]!;
    const r = take(idx);
    report = merge(report, r.report);
    return [`week:${week}`, r.items];
  };
  /** Weeks' entries written in one change. */
  const write = (entries: readonly [string, Normalized[]][]) => {
    if (entries.length === 0) return;
    const change = store.replaceSourceChunks(sourceId, entries);
    if (change.problems.length > 0) report = merge(report, refused(change.problems));
  };
  const finish = () => {
    if (!done()) {
      // A flush from a listener of that write (it read `kernel.store`) may have done the rest already.
      if (timer === null) timer = timers.set(((d?: Deadline) => step(false, d)) as () => void, 0);
    } else if (!told && !cancelled) {
      told = true;
      if (timer !== null) timers.clear(timer);
      timer = null;
      onDone(report);
    }
  };
  const step = (all: boolean, deadline?: Deadline & { didTimeout?: boolean }) => {
    timer = null;
    if (done()) return;
    const t0 = clock();
    // What the browser says is free (a quiet page: up to 50 ms), half of it for the normalising (the store's indexing follows),
    // never under SLICE_MS; a slice forced by the timeout (a busy page) takes 25 ms, so the load still ends soon.
    const budget = deadline?.didTimeout ? 25 : Math.max(SLICE_MS, deadline && typeof deadline.timeRemaining === 'function' ? deadline.timeRemaining() / 2 : 0);
    const entries: [string, Normalized[]][] = [];
    // Nearest weeks first; at least one a slice; normalised as picked, so the budget counts the work.
    while (cursor < later.length && (all || entries.length === 0 || clock() - t0 < budget)) {
      if (!loaded.has(cursor)) entries.push(takeWeek(cursor));
      cursor++;
    }
    write(entries);
    finish();
  };
  /** The weeks a period (its end exclusive) needs: begun before its end, reaching its start. */
  const needed = (from: string, to: string) => {
    const out: number[] = [];
    for (let k = 0; k < later.length; k++) if (!loaded.has(k) && later[k]![0] < to && later[k]![2] >= addDays(from, -1)) out.push(k);
    return out;
  };
  if (later.length > 0) timer = timers.set(((d?: Deadline) => step(false, d)) as () => void, 0);
  return {
    get report() {
      return report;
    },
    chunks,
    get done() {
      return done();
    },
    covers: (from, to) => done() || needed(from, to).length === 0,
    load(from, to) {
      if (done()) return;
      write(needed(from, to).map(takeWeek));
      finish();
    },
    flush() {
      if (done()) return;
      if (timer !== null) timers.clear(timer);
      timer = null;
      step(true);
    },
    cancel() {
      cancelled = true;
      if (timer !== null) timers.clear(timer);
      timer = null;
    },
  };
}

/** What is still to load on a store, from every kernel that loads into it. */
/** A kernel's load still going on a store: everything now, or what a period needs. */
export interface PendingLoad {
  finish(): void;
  load(from: string, to: string): void;
}
const PENDING = new WeakMap<EventStore, Set<PendingLoad>>();
const FACES = new WeakMap<EventStore, EventStore>();
/** A face's own store: a face handed back (`createKernel({ store: cal.kernel.store })`) is the store it shows. */
const RAW = new WeakMap<EventStore, EventStore>();
export const rawOf = (store: EventStore): EventStore => RAW.get(store) ?? store;

/**
 * The store as a source manager writes it: what is still to load first (an id
 * a source sends may be one of the `events` not in yet — the first owner wins,
 * as in a full load where `events` came first). Reads stay raw.
 */
export function writerFace(store: EventStore): EventStore {
  const finish = () => {
    for (const p of [...(PENDING.get(store) ?? [])]) p.finish();
  };
  return {
    get snapshot() {
      return store.snapshot;
    },
    apply: (mutations, cause) => (finish(), store.apply(mutations, cause)),
    replaceSourceChunk: (sourceId, chunk, items) => (finish(), store.replaceSourceChunk(sourceId, chunk, items)),
    replaceSourceChunks: (sourceId, entries) => (finish(), store.replaceSourceChunks(sourceId, entries)),
    subscribe: (fn) => store.subscribe(fn),
  };
}

/** Registers a kernel's load on its store; returns the unregistering. */
export function pendingOn(store: EventStore, load: PendingLoad): () => void {
  let set = PENDING.get(store);
  if (!set) PENDING.set(store, (set = new Set()));
  set.add(load);
  return () => set.delete(load);
}

/** What a period (ISO days) needs, from every load on the store — another calendar's too (a shared store). */
export function loadPeriod(store: EventStore, from: string, to: string): void {
  for (const p of [...(PENDING.get(store) ?? [])]) p.load(from, to);
}

/**
 * The store as the application sees it (`kernel.store`): every read and
 * write finishes what is still to load first, so it is never partial. One
 * face per store: two calendars sharing a store share it too (an identity a
 * drop between them compares).
 */
export function storeFace(given: EventStore): EventStore {
  const store = rawOf(given);
  let face = FACES.get(store);
  if (face) return face;
  const finish = () => {
    for (const p of [...(PENDING.get(store) ?? [])]) p.finish();
  };
  face = {
    get snapshot() {
      finish();
      return store.snapshot;
    },
    apply: (mutations, cause) => (finish(), store.apply(mutations, cause)),
    replaceSourceChunk: (sourceId, chunk, items) => (finish(), store.replaceSourceChunk(sourceId, chunk, items)),
    replaceSourceChunks: (sourceId, entries) => (finish(), store.replaceSourceChunks(sourceId, entries)),
    subscribe: (fn) => store.subscribe(fn),
  };
  FACES.set(store, face);
  RAW.set(face, store);
  return face;
}
