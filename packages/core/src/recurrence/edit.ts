import {
  expandDates,
  expandZoned,
  explicitRule,
  implicitRule,
  indexOfStart,
  iterateUnion,
  nthStart,
  rebaseRule,
  splitRule,
} from '@dzcalendar/rrule';
import type { ImplicitPart, RRule, RRuleSet } from '@dzcalendar/rrule';
import { problem } from '../event/problems.js';
import type { Problem } from '../event/problems.js';
import type { NormalizeContext } from '../event/normalize.js';
import type { CalEvent, EventId, RecurrenceKey, SeriesId } from '../event/types.js';
import { patchEvent } from '../commands/patch.js';
import type { EventPatch } from '../commands/types.js';
import type { Mutation } from '../store/changes.js';
import type { StoreSnapshot } from '../store/store.js';
import { Temporal } from '../temporal.js';
import type { Duration, Instant, PlainDate, ZonedDateTime } from '../temporal.js';
import { keyOf, materialize, occurrenceLength } from './series.js';
import type { Series } from './series.js';

export type EditScope = 'this' | 'following' | 'all';

/** One occurrence: its series and its original start. */
export interface OccurrenceRef {
  readonly seriesId: SeriesId;
  readonly key: RecurrenceKey;
}

export interface EditOptions {
  /** `all`: keep the occurrences edited on their own (default), or let the series take them back. */
  readonly overrides?: 'keep' | 'drop';
}

type Start = ZonedDateTime | PlainDate;
type Result = { readonly ok: true; readonly mutations: Mutation[] } | { readonly ok: false };

const FAIL: Result = { ok: false };
const isDate = (x: Start): x is PlainDate => x instanceof Temporal.PlainDate;
const sameStart = (a: Start, b: Start) => a.toString() === b.toString();
const lessThan = (a: Start, b: Start) => (isDate(a) ? Temporal.PlainDate.compare(a, b as PlainDate) < 0 : a.epochNanoseconds < (b as ZonedDateTime).epochNanoseconds);

/** The original start a key stands for. */
export function startOfKey(sr: Series, key: RecurrenceKey): Start {
  return sr.base.allDay ? Temporal.PlainDate.from(key) : Temporal.ZonedDateTime.from(key);
}

/** A key's start, or null when the key is not even a date. */
function parseKey(sr: Series, key: RecurrenceKey): Start | null {
  try {
    return startOfKey(sr, key);
  } catch {
    return null;
  }
}

/** True when the series shows an occurrence at that key now (an override counts; an EXDATE does not). */
export function isOccurrence(sr: Series, key: RecurrenceKey): boolean {
  if (sr.overrides.has(key)) return true;
  const at = parseKey(sr, key);
  if (!at) return false;
  if (isDate(at)) return expandDates(sr.base.start as PlainDate, sr.set, { from: at, to: at.add({ days: 1 }) }, 1).starts.some((d) => d.equals(at));
  const got = expandZoned(sr.base.start as ZonedDateTime, sr.set, { from: at.toInstant(), to: at.toInstant().add({ nanoseconds: 1 }) }, 1).starts;
  return got.some((x) => x.toString() === key);
}

/** The first start the series' rules and RDATEs produce (an excluded one too: it is still the series' first key). */
export function firstKey(sr: Series): RecurrenceKey {
  return keyOf(nthStart(sr.base.start, sr.set, 0) ?? sr.base.start);
}

/** The occurrence as it is now: its override, or the series' own. */
function current(snap: StoreSnapshot, sr: Series, key: RecurrenceKey): CalEvent | undefined {
  const id = sr.overrides.get(key);
  return id !== undefined ? snap.getEvent(id) : materialize(sr, startOfKey(sr, key));
}

/** How a start moves when one occurrence moves from `from` to `to`: the same wall-clock difference, in its own zone. */
function shiftStart(x: Start, from: Start, to: Start): Start {
  if (isDate(from) || isDate(x)) {
    const days = (isDate(to) ? to : to.toPlainDate()).since(isDate(from) ? from : from.toPlainDate(), { largestUnit: 'days' }).days;
    return x.add({ days });
  }
  const delta: Duration = (to as ZonedDateTime).toPlainDateTime().since(from.toPlainDateTime(), { largestUnit: 'days' });
  return x.toPlainDateTime().add(delta).toZonedDateTime(x.timeZoneId, { disambiguation: 'compatible' });
}

/** An EXDATE as the start it excludes (a date on a timed series: the series' first start that day). */
function exdateStart(sr: Series, x: Instant | PlainDate): Start | null {
  if (sr.base.allDay) return x instanceof Temporal.PlainDate ? x : x.toZonedDateTimeISO('UTC').toPlainDate();
  const zone = (sr.base.start as ZonedDateTime).timeZoneId;
  if (x instanceof Temporal.Instant) return x.toZonedDateTimeISO(zone);
  for (const s of iterateUnion(sr.base.start, sr.set)) {
    const c = Temporal.PlainDate.compare((s as ZonedDateTime).toPlainDate(), x);
    if (c === 0) return s;
    if (c > 0) return null;
  }
  return null;
}

const UNITS = { YEARLY: 'years', MONTHLY: 'months', WEEKLY: 'weeks', DAILY: 'days', HOURLY: 'hours', MINUTELY: 'minutes', SECONDLY: 'seconds' } as const;

/**
 * The series moved so that its occurrence at `at` becomes `edited`: rules
 * recounted from that occurrence, the new first start the one that keeps it
 * at its position, and every key (overrides, EXDATEs, UNTIL) carried by
 * position — the fourth occurrence stays the fourth. Null when the rules
 * cannot describe the move (the caller reports `invalid-edit`).
 */
function moveAll(sr: Series, at: Start, edited: CalEvent, length: Duration, id: SeriesId): { series: Series; keys: Map<RecurrenceKey, RecurrenceKey> } | null {
  const fields = baseFields(edited, id, sr);
  const keys = new Map<RecurrenceKey, RecurrenceKey>();
  const to = edited.start;
  if (sameStart(at, to)) {
    // Nothing moves: the base takes the new fields, every key stays.
    for (const k of sr.overrides.keys()) keys.set(k, k);
    return { series: { ...sr, id, base: withSpan(fields, sr.base.start, length, edited) }, keys };
  }

  const old = sr.base.start;
  const index = indexOfStart(old, sr.set, at);
  if (index < 0) return null;

  // Rules written out (what they took from the old start), then recounted around the moved occurrence.
  const rewritten = sr.set.rules.map((r) => {
    const { rule, added } = explicitRule(r, old);
    const { count: _c, until: _u, ...open } = rebaseRule(rule, at, to);
    return { open: open as RRule, added, original: r };
  });
  const rdates = sr.set.rdates.map((x) => shiftStart(x, at, to) as ZonedDateTime | PlainDate);
  const openSet: RRuleSet = { rules: rewritten.map((w) => w.open), exdates: [], rdates };

  // The new first start: `index` starts before `to`, looking back whole periods so INTERVAL keeps its phase.
  const unit = rewritten.length > 0 ? UNITS[rewritten[0]!.open.freq] : 'days';
  const step = Math.max(1, ...rewritten.map((w) => w.open.interval));
  let first: Start | null = null;
  for (let back = index + 1; back <= (index + 1) * 64 && first === null; back *= 2) {
    const from = to.subtract({ [unit]: back * step }) as Start;
    const seq: Start[] = [];
    let found = false;
    for (const s of iterateUnion(from, openSet)) {
      if (sameStart(s, to)) {
        found = true;
        break;
      }
      if (lessThan(to, s) || seq.length > 200_000) break;
      seq.push(s);
    }
    if (!found) return null;
    if (seq.length >= index) first = index === 0 ? to : seq[seq.length - index]!;
  }
  if (!first) return null;
  const f = first;

  // Counts stay; an UNTIL moves to where the old last occurrence of its rule went.
  const rules = rewritten.map((w) => {
    let r: RRule = w.open;
    if (w.original.count !== undefined) r = { ...r, count: w.original.count };
    if (w.original.until !== undefined) {
      let last: Start | null = null;
      for (const s of iterateUnion(old, { rules: [w.original], exdates: [], rdates: [] })) last = s;
      const i = last ? indexOfStart(old, sr.set, last) : -1;
      const moved = i >= 0 ? nthStart(f, openSet, i) : null;
      r = { ...r, until: moved ? (isDate(moved) ? moved : moved.toInstant()) : w.original.until };
    }
    return implicitRule(r, f, w.added as ImplicitPart[]);
  });
  const set: RRuleSet = { rules, exdates: [], rdates };

  // Keys go by position — found in one walk of each series, however many keys there are.
  const wanted: { key: Start | null; put: (m: Start) => void }[] = [];
  const exdates: (Instant | PlainDate)[] = [];
  for (const x of sr.set.exdates) wanted.push({ key: exdateStart(sr, x), put: (m) => exdates.push(isDate(m) ? m : x instanceof Temporal.PlainDate ? m.toPlainDate() : m.toInstant()) });
  for (const k of sr.overrides.keys()) wanted.push({ key: parseKey(sr, k), put: (m) => keys.set(k, keyOf(m)) });
  const positions = positionsOf(old, sr.set, wanted.map((w) => w.key));
  const found = startsAt(f, set, positions);
  wanted.forEach((w, i) => {
    const m = positions[i]! >= 0 ? found.get(positions[i]!) : undefined;
    if (m) w.put(m);
  });

  const series: Series = { ...sr, id, base: withSpan(fields, f, length, edited), set: { ...set, exdates } };
  // The occurrence edited must be where it was asked to be.
  const check = nthStart(f, series.set, index);
  if (!check || !sameStart(check, to)) return null;
  return { series, keys };
}

/** The position of each start in the set (-1 when absent), in one walk. */
function positionsOf(start: Start, set: RRuleSet, wanted: readonly (Start | null)[]): number[] {
  const index = new Map<string, number[]>();
  wanted.forEach((w, i) => {
    if (w) index.set(w.toString(), [...(index.get(w.toString()) ?? []), i]);
  });
  const out = wanted.map(() => -1);
  let last: Start | null = null;
  for (const w of wanted) if (w && (!last || lessThan(last, w))) last = w;
  if (!last) return out;
  let i = 0;
  let left = index.size;
  for (const s of iterateUnion(start, set)) {
    const hit = index.get(s.toString());
    if (hit) {
      for (const j of hit) out[j] = i;
      if (--left === 0) break;
    }
    if (lessThan(last, s) || ++i > 200_000) break;
  }
  return out;
}

/** The starts at these positions, in one walk. */
function startsAt(start: Start, set: RRuleSet, positions: readonly number[]): Map<number, Start> {
  const want = new Set(positions.filter((p) => p >= 0));
  const out = new Map<number, Start>();
  if (want.size === 0) return out;
  const max = Math.max(...want);
  let i = 0;
  for (const s of iterateUnion(start, set)) {
    if (want.has(i)) out.set(i, s);
    if (++i > max) break;
  }
  return out;
}

/** What the base takes from the edited occurrence: everything but its place, its link, its source tag. */
function baseFields(edited: CalEvent, id: SeriesId, sr: Series): CalEvent {
  const { ref: _ref, sourceId: _src, ...fields } = edited;
  return { ...fields, id, revision: sr.base.revision } as CalEvent;
}

function withSpan(fields: CalEvent, start: Start, length: Duration, edited: CalEvent): CalEvent {
  const end = isDate(start)
    ? start.add({ days: Math.max(1, length.days) })
    : (start as ZonedDateTime).add(length).withTimeZone((edited.end as ZonedDateTime).timeZoneId);
  return Object.freeze({ ...fields, start, end }) as CalEvent;
}

/**
 * Edits one occurrence, the following ones, or all of them. Pure: the
 * mutations that carry it out, nothing applied. Problems go to `problems`.
 */
export function editOccurrence(
  snap: StoreSnapshot,
  ref: OccurrenceRef,
  patch: EventPatch,
  scope: EditScope,
  ctx: NormalizeContext,
  path: string,
  problems: Problem[],
  o: EditOptions = {},
  /** Cut even when the patch changes nothing (`series.split`). */
  forceSplit = false,
): Result {
  const sr = snap.getSeries(ref.seriesId);
  if (!sr) {
    problems.push(problem('unknown-event', 'error', `${path}.id`, ref.seriesId));
    return FAIL;
  }
  const at = parseKey(sr, ref.key);
  // "All" may be anchored on any key of the series (an excluded first one too); the others need a shown occurrence.
  const known = at !== null && (scope === 'all' ? sr.overrides.has(ref.key) || indexOfStart(sr.base.start, sr.set, at) >= 0 : isOccurrence(sr, ref.key));
  if (!at || !known) {
    problems.push(problem('unknown-occurrence', 'error', `${path}.key`, ref.key));
    return FAIL;
  }
  // `this` edits the occurrence as it is now (its override, if any); the
  // others edit what the series itself produces there, so an override's own
  // move is not spread to every occurrence.
  const target = scope === 'this' ? current(snap, sr, ref.key) : materialize(sr, at);
  if (!target) {
    problems.push(problem('unknown-event', 'error', `${path}.key`, ref.key));
    return FAIL;
  }
  const edited = patchEvent(target, patch, ctx, path, problems);
  if (!edited) return FAIL;
  if (edited === target && !(forceSplit && scope === 'following')) return { ok: true, mutations: [] };
  if (scope !== 'this' && edited.allDay !== sr.base.allDay) {
    // A whole series switching between days and times needs its rules rewritten: one occurrence only.
    problems.push(problem('invalid-edit', 'error', `${path}.patch.allDay`, 'only one occurrence can change between all-day and timed'));
    return FAIL;
  }
  if (scope === 'this') return { ok: true, mutations: editThis(sr, ref.key, target, edited, ctx) };

  // A start-only move keeps the series' own length (wall days and elapsed rest), not the moved occurrence's.
  const length = 'end' in patch || 'duration' in patch ? occurrenceLength(edited) : occurrenceLength(sr.base);
  const first = indexOfStart(sr.base.start, sr.set, at) === 0;
  const r = scope === 'all' || first ? editAll(snap, sr, at, edited, length, o) : editFollowing(snap, sr, ref.key, at, edited, length, ctx);
  if (!r) {
    problems.push(problem('invalid-edit', 'error', `${path}.key`, 'the series cannot repeat this way from here'));
    return FAIL;
  }
  return { ok: true, mutations: r };
}

/** Checks a proposed edit before any mutation: the event `editOccurrence` would write, for the calendar's rules. */
export function editedOccurrence(snap: StoreSnapshot, ref: OccurrenceRef, patch: EventPatch, scope: EditScope, ctx: NormalizeContext): { before: CalEvent; after: CalEvent } | null {
  const sr = snap.getSeries(ref.seriesId);
  const at = sr ? parseKey(sr, ref.key) : null;
  if (!sr || !at) return null;
  const before = scope === 'this' ? current(snap, sr, ref.key) : materialize(sr, at);
  if (!before) return null;
  const after = patchEvent(before, patch, ctx, 'check', []);
  return after ? { before, after } : null;
}

function editThis(sr: Series, key: RecurrenceKey, occ: CalEvent, edited: CalEvent, ctx: NormalizeContext): Mutation[] {
  if (sr.overrides.has(key)) return [{ kind: 'event', before: occ, after: edited }];
  // A new event stands in for the occurrence, found at its new place by the
  // ordinary index; the series skips its key from now on.
  const id: EventId = ctx.newId();
  const { sourceId: _src, ...fields } = edited;
  const override = Object.freeze({ ...fields, id, revision: 0, ref: { seriesId: sr.id, key } }) as CalEvent;
  return [
    { kind: 'event', after: override },
    { kind: 'series', before: sr, after: Object.freeze({ ...sr, overrides: new Map(sr.overrides).set(key, id) }) },
  ];
}

/** The override events re-linked to their new keys (and series); those whose place is gone go too. */
function relink(snap: StoreSnapshot, overrides: ReadonlyMap<RecurrenceKey, EventId>, keys: Map<RecurrenceKey, RecurrenceKey>, seriesId: SeriesId, out: Mutation[]): Map<RecurrenceKey, EventId> {
  const next = new Map<RecurrenceKey, EventId>();
  for (const [k, id] of overrides) {
    const ev = snap.getEvent(id);
    const nk = keys.get(k);
    if (nk === undefined) {
      if (ev) out.push({ kind: 'event', before: ev });
      continue;
    }
    next.set(nk, id);
    if (ev && (nk !== k || ev.ref?.seriesId !== seriesId)) out.push({ kind: 'event', before: ev, after: Object.freeze({ ...ev, ref: { seriesId, key: nk } }) as CalEvent });
  }
  return next;
}

function editAll(snap: StoreSnapshot, sr: Series, at: Start, edited: CalEvent, length: Duration, o: EditOptions): Mutation[] | null {
  const moved = moveAll(sr, at, edited, length, sr.id);
  if (!moved) return null;
  const mutations: Mutation[] = [];
  let overrides: Map<RecurrenceKey, EventId>;
  if (o.overrides === 'drop') {
    for (const id of sr.overrides.values()) {
      const ev = snap.getEvent(id);
      if (ev) mutations.push({ kind: 'event', before: ev });
    }
    overrides = new Map();
  } else overrides = relink(snap, sr.overrides, moved.keys, sr.id, mutations);
  mutations.push({ kind: 'series', before: sr, after: Object.freeze({ ...moved.series, overrides }) });
  return mutations;
}

function editFollowing(snap: StoreSnapshot, sr: Series, key: RecurrenceKey, at: Start, edited: CalEvent, length: Duration, ctx: NormalizeContext): Mutation[] | null {
  const { head, tail } = cutSeries(sr, at);
  const id: SeriesId = ctx.newId();
  const mutations: Mutation[] = [];

  // The occurrence edited becomes the first of the new series: its own override is folded in.
  const own = sr.overrides.get(key);
  const ownEvent = own !== undefined ? snap.getEvent(own) : undefined;
  if (ownEvent) mutations.push({ kind: 'event', before: ownEvent });

  const headOverrides = new Map<RecurrenceKey, EventId>();
  const tailOverrides = new Map<RecurrenceKey, EventId>();
  for (const [k, v] of sr.overrides) {
    if (k === key) continue;
    const s = parseKey(sr, k);
    (s && lessThan(s, at) ? headOverrides : tailOverrides).set(k, v);
  }

  // The rest of the series as a series of its own, from the cut, unchanged:
  // it must repeat exactly what the old one did from there on (INTERVAL's
  // phase from a cut that is not one of the rule's own starts may not).
  const { sourceId: _src, ...plain } = sr;
  const tailSeries: Series = { ...plain, id, base: { ...materialize(sr, at), id } as CalEvent, set: tail, overrides: tailOverrides };
  if (!sameUnion(sr, at, tailSeries)) return null;

  mutations.push({ kind: 'series', before: sr, after: Object.freeze({ ...sr, set: head, overrides: headOverrides }) });
  const repeats = nthStart(at, tail, 1) !== null;
  if (!repeats) {
    // Nothing repeats after the cut: the edited occurrence is a plain event now.
    for (const v of tailOverrides.values()) {
      const ev = snap.getEvent(v);
      if (ev) mutations.push({ kind: 'event', before: ev });
    }
    const { ref: _ref, sourceId: _s, ...fields } = edited;
    mutations.push({ kind: 'event', after: Object.freeze({ ...fields, id, revision: 0 }) as CalEvent });
    return mutations;
  }
  const moved = moveAll(tailSeries, at, edited, length, id);
  if (!moved) return null;
  const overrides = relink(snap, tailOverrides, moved.keys, id, mutations);
  mutations.push({ kind: 'series', after: Object.freeze({ ...moved.series, id, revision: 0, overrides, splitFrom: { seriesId: sr.id, at: key } }) });
  return mutations;
}

/** True when `tail` (starting at `at`) repeats what `sr` did from `at` on — the first 64 starts. */
function sameUnion(sr: Series, at: Start, tail: Series): boolean {
  const a: string[] = [];
  for (const s of iterateUnion(sr.base.start, sr.set)) {
    if (lessThan(s, at)) continue;
    a.push(s.toString());
    if (a.length === 64) break;
  }
  const b: string[] = [];
  for (const s of iterateUnion(tail.base.start, tail.set)) {
    b.push(s.toString());
    if (b.length === 64) break;
  }
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * The series on each side of a cut (the cut goes to the tail). The tail's
 * rules have what they took from the old start written out (its start is
 * now the cut); the cut itself is added as an RDATE when no rule starts
 * there, so the tail still begins with it.
 */
function cutSeries(sr: Series, at: Start): { head: RRuleSet; tail: RRuleSet } {
  const headRules: RRule[] = [];
  const tailRules: RRule[] = [];
  for (const r of sr.set.rules) {
    const { before: b, after: a } = splitRule(r, sr.base.start, at);
    if (b) headRules.push(b);
    if (a) {
      const { rule, added } = explicitRule(a, sr.base.start);
      tailRules.push(implicitRule(rule, at, added));
    }
  }
  const atNs = isDate(at) ? 0n : (at as ZonedDateTime).epochNanoseconds;
  const atDate = isDate(at) ? at : (at as ZonedDateTime).toPlainDate();
  const after = (x: Instant | PlainDate | ZonedDateTime) =>
    x instanceof Temporal.PlainDate ? Temporal.PlainDate.compare(x, atDate) >= 0 : (x instanceof Temporal.Instant ? x.epochNanoseconds : x.epochNanoseconds) >= atNs;
  const tailRdates = sr.set.rdates.filter((x) => after(x));
  const tail: RRuleSet = { rules: tailRules, exdates: sr.set.exdates.filter((x) => after(x)), rdates: tailRdates };
  const startsAtCut = nthStart(at, tail, 0);
  return {
    head: { rules: headRules, exdates: sr.set.exdates.filter((x) => !after(x)), rdates: sr.set.rdates.filter((x) => !after(x)) },
    tail: startsAtCut && sameStart(startsAtCut, at) ? tail : { ...tail, rdates: [at, ...tailRdates] },
  };
}

/** Deletes one occurrence (an EXDATE), the following ones (the series ends before it), or the whole series. */
export function deleteOccurrence(snap: StoreSnapshot, ref: OccurrenceRef, scope: EditScope, path: string, problems: Problem[]): Result {
  const sr = snap.getSeries(ref.seriesId);
  if (!sr) {
    problems.push(problem('unknown-event', 'error', `${path}.id`, ref.seriesId));
    return FAIL;
  }
  if (scope === 'all') return { ok: true, mutations: deleteSeries(snap, sr) };
  const at = parseKey(sr, ref.key);
  if (!at || !isOccurrence(sr, ref.key)) {
    problems.push(problem('unknown-occurrence', 'error', `${path}.key`, ref.key));
    return FAIL;
  }
  if (scope === 'following' && indexOfStart(sr.base.start, sr.set, at) === 0) return { ok: true, mutations: deleteSeries(snap, sr) };
  const mutations: Mutation[] = [];
  if (scope === 'this') {
    const own = sr.overrides.get(ref.key);
    const overrides = new Map(sr.overrides);
    if (own !== undefined) {
      const ev = snap.getEvent(own);
      if (ev) mutations.push({ kind: 'event', before: ev });
      overrides.delete(ref.key);
    }
    const set: RRuleSet = { ...sr.set, exdates: [...sr.set.exdates, isDate(at) ? at : at.toInstant()] };
    mutations.push({ kind: 'series', before: sr, after: Object.freeze({ ...sr, set, overrides }) });
    return { ok: true, mutations };
  }
  const { head } = cutSeries(sr, at);
  const overrides = new Map<RecurrenceKey, EventId>();
  for (const [k, v] of sr.overrides) {
    const s = parseKey(sr, k);
    if (s && lessThan(s, at)) overrides.set(k, v);
    else {
      const ev = snap.getEvent(v);
      if (ev) mutations.push({ kind: 'event', before: ev });
    }
  }
  mutations.push({ kind: 'series', before: sr, after: Object.freeze({ ...sr, set: head, overrides }) });
  return { ok: true, mutations };
}

/** The series and every event standing in for one of its occurrences. */
export function deleteSeries(snap: StoreSnapshot, sr: Series): Mutation[] {
  const mutations: Mutation[] = [];
  for (const id of sr.overrides.values()) {
    const ev = snap.getEvent(id);
    if (ev) mutations.push({ kind: 'event', before: ev });
  }
  mutations.push({ kind: 'series', before: sr });
  return mutations;
}
