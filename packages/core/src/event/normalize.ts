import { Temporal } from '../temporal.js';
import type { Duration, PlainDate, ZonedDateTime, ZoneId } from '../temporal.js';
import type { IdGenerator } from '../ids.js';
import { isValidZone } from '../zone.js';
import { DEFAULT_ALL_DAY_DURATION, DEFAULT_TIMED_DURATION } from './defaults.js';
import { parseTemporal, placeWall } from './parse-temporal.js';
import type { Parsed } from './parse-temporal.js';
import { problem } from './problems.js';
import type { Problem } from './problems.js';
import type { AllDayEvent, CalEvent, EventInput, ResourceId, TimedEvent } from './types.js';
import { recurrenceEngine } from '../recurrence/engine.js';
import type { RRule, RRuleSet } from '@dzcalendar/rrule';
import type { Series } from '../recurrence/series.js';
import type { Instant } from '../temporal.js';

export interface NormalizeContext {
  /** Where the calendar is read. The last resort for an event that names no zone. */
  readonly displayZone: ZoneId;
  /** The zone of events that name none, before falling back to `displayZone`. */
  readonly defaultEventZone?: ZoneId;
  readonly defaultTimedDuration?: Duration;
  readonly defaultAllDayDuration?: Duration;
  /** True: a moment without a zone is an error rather than a guess. */
  readonly strictZones?: boolean;
  readonly newId: IdGenerator;
  /** When given, a resource id outside it is reported. */
  readonly knownResources?: ReadonlySet<ResourceId>;
}

/** One event, or a series (an event with `rrule`). */
export type Normalized = { readonly kind: 'event'; readonly event: CalEvent } | { readonly kind: 'series'; readonly series: Series };

/** The event an item stands for: the event itself, or a series' first occurrence. */
export const itemEvent = (n: Normalized): CalEvent => (n.kind === 'event' ? n.event : n.series.base);

export type NormalizeResult =
  | { readonly ok: true; readonly value: Normalized; readonly problems: readonly Problem[] }
  | { readonly ok: false; readonly problems: readonly Problem[] };

export interface NormalizationReport {
  readonly accepted: number;
  readonly rejected: number;
  readonly problems: readonly Problem[];
}

/**
 * A bad context is the programmer's mistake, not the data's, and it would make
 * every event fail the same way — so it throws, once, rather than producing a
 * thousand identical problems.
 */
function assertContext(ctx: NormalizeContext): void {
  if (!isValidZone(ctx.displayZone)) throw new RangeError(`displayZone is not a time zone: ${ctx.displayZone}`);
  if (ctx.defaultEventZone !== undefined && !isValidZone(ctx.defaultEventZone)) {
    throw new RangeError(`defaultEventZone is not a time zone: ${ctx.defaultEventZone}`);
  }
}

/** JSON from an API writes `null` for "absent". */
const given = <T>(x: T | null | undefined): x is T => x !== undefined && x !== null;

/**
 * One loose input to one strict event, or the reasons it cannot be one.
 *
 * Bad data never throws: a calendar fed by an API cannot let one malformed row
 * take the screen down. Every guess it makes — a zone assumed, a skipped wall
 * time moved — is reported as a warning, so nothing is bent in silence. A bad
 * `ctx` does throw (`assertContext`).
 */
export function normalizeEvent(input: EventInput, ctx: NormalizeContext, path = 'event'): NormalizeResult {
  assertContext(ctx);
  return normalizeChecked(input, ctx, path);
}

function normalizeChecked(input: EventInput, ctx: NormalizeContext, path: string): NormalizeResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, problems: [problem('invalid-event', 'error', path, `got ${input === null ? 'null' : typeof input}`)] };
  }
  try {
    return normalizeObject(input, ctx, path);
  } catch (e) {
    // Whatever a check above missed still becomes a problem, never an exception.
    return { ok: false, problems: [problem('invalid-event', 'error', path, (e as Error).message)] };
  }
}

function normalizeObject(input: EventInput, ctx: NormalizeContext, path: string): NormalizeResult {
  const problems: Problem[] = [];
  const failed = (): NormalizeResult => ({ ok: false, problems });
  const isError = () => problems.some((p) => p.severity === 'error');

  if (given(input.id) && (typeof input.id !== 'string' || input.id === '')) {
    problems.push(problem('invalid-id', 'error', `${path}.id`, String(input.id)));
  }

  if (given(input.timeZone) && (typeof input.timeZone !== 'string' || !isValidZone(input.timeZone))) {
    problems.push(problem('unknown-zone', 'error', `${path}.timeZone`, String(input.timeZone)));
  }

  for (const key of ['resourceIds', 'classNames'] as const) {
    if (given(input[key]) && !Array.isArray(input[key])) {
      problems.push(problem('invalid-event', 'error', `${path}.${key}`, 'expected an array'));
    }
  }

  if (!given(input.start)) {
    problems.push(problem('missing-start', 'error', `${path}.start`));
    return failed();
  }
  const start = parseTemporal(input.start, `${path}.start`, 'start');
  problems.push(...start.problems);
  const end = given(input.end) ? parseTemporal(input.end, `${path}.end`, 'end') : null;
  if (end) problems.push(...end.problems);

  let duration: Duration | null = null;
  if (given(input.duration)) {
    try {
      duration = Temporal.Duration.from(input.duration);
      if (duration.sign < 0) throw new RangeError('negative');
    } catch (e) {
      problems.push(problem('invalid-duration', 'error', `${path}.duration`, (e as Error).message));
    }
  }

  if (!start.ok || (end && !end.ok) || isError()) return failed();

  const endParsed = end?.ok ? end.parsed : null;
  const allDay = input.allDay ?? (start.parsed.kind === 'date' && (!endParsed || endParsed.kind === 'date'));

  const common = buildCommon(input, ctx, path, problems);
  const span = allDay
    ? allDaySpan(input, ctx, path, start.parsed, endParsed, duration, problems)
    : timedSpan(input, ctx, path, start.parsed, endParsed, duration, problems);

  if (!span || isError()) return failed();
  let event = Object.freeze({ ...common, ...span }) as CalEvent;
  if (given(input.recurrenceId)) {
    const ref = overrideRef(input, path, event, problems);
    if (!ref) return failed();
    event = Object.freeze({ ...event, ref }) as CalEvent;
  }
  if (!given(input.rrule)) return { ok: true, value: { kind: 'event', event }, problems };

  // A series: the event is its first occurrence; the rules repeat it.
  const set = recurrenceSet(input, ctx, path, event, problems);
  if (!set || isError()) return failed();
  const series: Series = { id: event.id, revision: 0, base: event, set, overrides: new Map() };
  return { ok: true, value: { kind: 'series', series }, problems };
}

/**
 * The occurrence an override stands for, keyed as the series keys it: a date,
 * or the original start in full. A wall time is read in the override's zone;
 * `normalizeMany` re-keys it in the series' zone when the series is there.
 */
function overrideRef(input: EventInput, path: string, event: CalEvent, problems: Problem[]): { seriesId: string; key: string } | null {
  const at = `${path}.recurrenceId`;
  if (given(input.rrule) || typeof input.seriesId !== 'string' || input.seriesId === '') {
    problems.push(problem('invalid-recurrence-id', 'error', at, given(input.rrule) ? 'an override cannot repeat' : 'needs seriesId'));
    return null;
  }
  const p = parseTemporal(input.recurrenceId, at, 'start');
  const v = p.ok ? p.parsed : null;
  let key: string | null = null;
  if (v && event.allDay) key = (v.kind === 'date' ? v.value : v.kind === 'instant' ? null : v.value.toPlainDate())?.toString() ?? null;
  else if (v && !event.allDay) {
    const zone = event.start.timeZoneId;
    key = v.kind === 'zoned' ? v.value.toString() : v.kind === 'instant' ? v.value.toZonedDateTimeISO(zone).toString() : v.kind === 'wall' ? placeWall(v.value, zone, at).value.toString() : null;
  }
  if (key === null) {
    problems.push(problem('invalid-recurrence-id', 'error', at, String(input.recurrenceId)));
    return null;
  }
  return { seriesId: input.seriesId, key };
}

/**
 * Overrides meet their series: each joins the series' `overrides`, keyed in
 * the series' zone. One whose series is not in the batch stays a plain event.
 */
function linkOverrides(items: Normalized[], problems: Problem[], tag: (p: Problem) => Problem): void {
  const at = new Map<string, number>();
  items.forEach((it, i) => it.kind === 'series' && at.set(it.series.id, i));
  for (const [i, it] of items.entries()) {
    const ref = it.kind === 'event' ? it.event.ref : undefined;
    if (!ref || it.kind !== 'event') continue;
    const si = at.get(ref.seriesId);
    const sr = si === undefined ? undefined : (items[si] as { series: Series }).series;
    if (!sr || sr.base.allDay !== it.event.allDay) {
      problems.push(tag(problem('orphan-override', 'warning', `events[${i}].seriesId`, ref.seriesId)));
      const { ref: _r, ...plain } = it.event;
      items[i] = { kind: 'event', event: Object.freeze(plain) as CalEvent };
      continue;
    }
    const key = sr.base.allDay ? ref.key : Temporal.ZonedDateTime.from(ref.key).withTimeZone(sr.base.start.timeZoneId).toString();
    if (key !== ref.key) items[i] = { kind: 'event', event: Object.freeze({ ...it.event, ref: { seriesId: sr.id, key } }) as CalEvent };
    items[si!] = { kind: 'series', series: { ...sr, overrides: new Map([...sr.overrides, [key, it.event.id]]) } };
  }
}

function recurrenceSet(input: EventInput, ctx: NormalizeContext, path: string, event: CalEvent, problems: Problem[]): RRuleSet | null {
  const texts = typeof input.rrule === 'string' ? [input.rrule] : Array.isArray(input.rrule) ? input.rrule : null;
  if (!texts || texts.length === 0) {
    problems.push(problem('invalid-rrule', 'error', `${path}.rrule`, 'expected a rule string or a list of them'));
    return null;
  }
  // Repeating events are an entry of their own (owner, 18i): without it, said, never guessed.
  const engine = recurrenceEngine();
  if (!engine) {
    problems.push(problem('recurrence-not-loaded', 'error', `${path}.rrule`, "import '@dzcalendar/core/recurrence' for repeating events (imported already? then two copies of @dzcalendar/core are installed)"));
    return null;
  }
  const rules: RRule[] = [];
  texts.forEach((text, i) => {
    const r = typeof text === 'string' ? engine.parseRRule(text) : null;
    if (!r || !r.ok) {
      problems.push(problem('invalid-rrule', 'error', `${path}.rrule${texts.length > 1 ? `[${i}]` : ''}`, r && !r.ok ? r.problem.detail : 'not a string'));
      return;
    }
    // Hours and minutes make no sense for an all-day series.
    if (event.allDay && (r.rule.freq === 'HOURLY' || r.rule.freq === 'MINUTELY' || r.rule.freq === 'SECONDLY')) {
      problems.push(problem('invalid-rrule', 'error', `${path}.rrule`, `FREQ=${r.rule.freq} on an all-day event`));
      return;
    }
    rules.push(r.rule);
  });
  const zone = event.allDay ? ctx.displayZone : event.start.timeZoneId;
  const exdates: (Instant | PlainDate)[] = [];
  for (const [i, x] of (input.exdate ?? []).entries()) {
    const p = parseTemporal(x, `${path}.exdate[${i}]`, 'start');
    if (!p.ok) {
      problems.push(problem('invalid-exdate', 'error', `${path}.exdate[${i}]`, String(x)));
      continue;
    }
    const v = p.parsed;
    // A date excludes that day; a moment excludes that moment (a wall time is read in the event's zone).
    // An all-day series has days only: a moment names the day it falls on, in the calendar's zone.
    if (event.allDay) {
      exdates.push(v.kind === 'date' ? v.value : v.kind === 'zoned' || v.kind === 'wall' ? v.value.toPlainDate() : v.value.toZonedDateTimeISO(zone).toPlainDate());
      continue;
    }
    exdates.push(
      v.kind === 'date' ? v.value : v.kind === 'instant' ? v.value : v.kind === 'zoned' ? v.value.toInstant() : placeWall(v.value, zone, `${path}.exdate[${i}]`).value.toInstant(),
    );
  }
  const rdates: (ZonedDateTime | PlainDate)[] = [];
  for (const [i, x] of (input.rdate ?? []).entries()) {
    const p = parseTemporal(x, `${path}.rdate[${i}]`, 'start');
    if (!p.ok) {
      problems.push(problem('invalid-rdate', 'error', `${path}.rdate[${i}]`, String(x)));
      continue;
    }
    const v = p.parsed;
    if (event.allDay) rdates.push(v.kind === 'date' ? v.value : v.kind === 'zoned' ? v.value.toPlainDate() : v.kind === 'wall' ? v.value.toPlainDate() : v.value.toZonedDateTimeISO(zone).toPlainDate());
    else rdates.push(v.kind === 'zoned' ? v.value : v.kind === 'instant' ? v.value.toZonedDateTimeISO(zone) : v.kind === 'wall' ? placeWall(v.value, zone, `${path}.rdate[${i}]`).value : v.value.toZonedDateTime({ timeZone: zone, plainTime: (event.start as ZonedDateTime).toPlainTime() }));
  }
  return { rules, exdates, rdates };
}

// Shared, frozen, so ten thousand events without resources or classes do not
// carry ten thousand empty arrays, and every event has the same shape.
const EMPTY_LIST: readonly string[] = Object.freeze([]);
const EMPTY_PROPS: Readonly<Record<string, unknown>> = Object.freeze({});
const OWN = [null, { start: true, duration: false }, { start: false, duration: true }, { start: true, duration: true }].map((o) => o && Object.freeze(o));
const PERMS = Array.from({ length: 32 }, (_, i) => {
  const own = OWN[(i >> 3) & 3];
  return Object.freeze({ start: (i & 1) !== 0, duration: (i & 2) !== 0, resource: (i & 4) !== 0, ...(own && { own }) });
});
/** One frozen object per combination: `ownStart` / `ownDuration` only count where they give something. */
const perms = (start: boolean, duration: boolean, resource: boolean, ownStart = false, ownDuration = false) =>
  PERMS[(start ? 1 : 0) | (duration ? 2 : 0) | (resource ? 4 : 0) | (ownStart && start ? 8 : 0) | (ownDuration && duration ? 16 : 0)]!;
const list = (xs: readonly string[]): readonly string[] => (xs.length === 0 ? EMPTY_LIST : Object.freeze(xs));

/**
 * Class names as tokens: "a b" is two classes, "" none — so the DOM can add
 * them one by one without `classList` throwing on a space or an empty string.
 */
function classList(xs: readonly string[] | undefined): readonly string[] {
  if (!xs || xs.length === 0) return EMPTY_LIST;
  const tokens = xs.flatMap((x) => String(x).split(/\s+/)).filter((x) => x.length > 0);
  return list([...new Set(tokens)]);
}

function buildCommon(input: EventInput, ctx: NormalizeContext, path: string, problems: Problem[]) {
  const resourceIds =
    !given(input.resourceId) && !(input.resourceIds && input.resourceIds.length > 0)
      ? EMPTY_LIST
      : [...new Set([...(given(input.resourceId) ? [input.resourceId] : []), ...(input.resourceIds ?? [])])];
  if (ctx.knownResources) {
    for (const r of resourceIds) {
      if (!ctx.knownResources.has(r)) problems.push(problem('unknown-resource', 'warning', `${path}.resourceIds`, r));
    }
  }
  const editable = input.editable ?? true;
  const status = input.status ?? 'confirmed';
  return {
    id: given(input.id) ? input.id : ctx.newId(),
    ...(given(input.groupId) && { groupId: input.groupId }),
    title: input.title ?? '',
    resourceIds: list(resourceIds),
    display: input.display ?? 'auto',
    status,
    busy: input.busy ?? status !== 'cancelled',
    perms: perms(
      input.startEditable ?? editable,
      input.durationEditable ?? editable,
      input.resourceEditable ?? editable,
      // What it said `true` to itself: its own field, else `editable` for both.
      (input.startEditable ?? input.editable) === true,
      (input.durationEditable ?? input.editable) === true,
    ),
    classNames: classList(input.classNames),
    // A tone names a CSS token (`--dz-tone-<tone>`): anything else is ignored, never interpolated.
    ...(given(input.tone) && /^[a-z0-9_-]+$/i.test(input.tone) && { tone: input.tone }),
    ...(given(input.url) && { url: input.url }),
    props: input.extendedProps && Object.keys(input.extendedProps).length > 0 ? Object.freeze({ ...input.extendedProps }) : EMPTY_PROPS,
    revision: 0,
  };
}

/** The zone a moment without one is read in, and whether that was a guess. */
function eventZone(input: EventInput, ctx: NormalizeContext): { zone: ZoneId; guessed: boolean } {
  const named = given(input.timeZone) ? input.timeZone : ctx.defaultEventZone;
  return named !== undefined ? { zone: named, guessed: false } : { zone: ctx.displayZone, guessed: true };
}

interface Placed {
  readonly value: ZonedDateTime;
  readonly guessed: boolean;
}

function toZoned(
  parsed: Parsed,
  input: EventInput,
  ctx: NormalizeContext,
  path: string,
  problems: Problem[],
  zoneOverride?: ZoneId,
): Placed | null {
  if (parsed.kind === 'zoned') return { value: parsed.value, guessed: false };
  const { zone, guessed } = zoneOverride !== undefined ? { zone: zoneOverride, guessed: false } : eventZone(input, ctx);
  if (guessed) {
    const code = parsed.kind === 'instant' ? 'offset-only' : 'zone-defaulted';
    if (ctx.strictZones) {
      problems.push(problem(code, 'error', path, 'strictZones'));
      return null;
    }
    problems.push(problem(code, 'warning', path, zone));
  }
  switch (parsed.kind) {
    case 'instant':
      return { value: parsed.value.toZonedDateTimeISO(zone), guessed };
    case 'wall': {
      const placed = placeWall(parsed.value, zone, path);
      problems.push(...placed.problems);
      return { value: placed.value, guessed };
    }
    case 'date':
      return { value: parsed.value.toZonedDateTime({ timeZone: zone }), guessed };
  }
}

function timedSpan(
  input: EventInput,
  ctx: NormalizeContext,
  path: string,
  startP: Parsed,
  endP: Parsed | null,
  duration: Duration | null,
  problems: Problem[],
): Pick<TimedEvent, 'allDay' | 'start' | 'end' | 'zoneGuessed'> | null {
  const placed = toZoned(startP, input, ctx, `${path}.start`, problems);
  if (!placed) return null;
  const start = placed.value;

  let end: ZonedDateTime;
  if (endP) {
    // An end without a zone of its own is read in the start's zone, which is
    // the event's — not the display zone, which belongs to the reader.
    const placedEnd = toZoned(endP, input, ctx, `${path}.end`, problems, endP.kind === 'zoned' ? undefined : start.timeZoneId);
    if (!placedEnd) return null;
    end = placedEnd.value;
  } else {
    try {
      end = start.add(duration ?? ctx.defaultTimedDuration ?? DEFAULT_TIMED_DURATION);
    } catch (e) {
      problems.push(problem('invalid-duration', 'error', `${path}.duration`, (e as Error).message));
      return null;
    }
  }

  // ZonedDateTime.compare orders by instant, whatever the two zones.
  if (Temporal.ZonedDateTime.compare(end, start) < 0) {
    problems.push(problem('end-before-start', 'error', `${path}.end`, `${start.toString()} > ${end.toString()}`));
    return null;
  }
  return { allDay: false, start, end, zoneGuessed: placed.guessed };
}

function allDaySpan(
  input: EventInput,
  ctx: NormalizeContext,
  path: string,
  startP: Parsed,
  endP: Parsed | null,
  duration: Duration | null,
  problems: Problem[],
): Pick<AllDayEvent, 'allDay' | 'start' | 'end'> | null {
  // A zone does serve an all-day event read from an instant: it says which
  // date that instant falls on. Otherwise the event floats and the zone is noise.
  if (given(input.timeZone) && startP.kind !== 'instant' && endP?.kind !== 'instant') {
    problems.push(problem('allday-zone-ignored', 'warning', `${path}.timeZone`, input.timeZone));
  }

  const start = toDate(startP, input, ctx, `${path}.start`, problems);
  if (!start) return null;
  let end: PlainDate | null;
  if (endP) {
    end = toDate(endP, input, ctx, `${path}.end`, problems);
  } else {
    try {
      const d = Temporal.Duration.from(duration ?? ctx.defaultAllDayDuration ?? DEFAULT_ALL_DAY_DURATION);
      // Only whole days move a date; hours on an all-day event mean nothing.
      end = start.add({ days: Math.max(1, Math.trunc(d.total({ unit: 'days', relativeTo: start }))) });
    } catch (e) {
      problems.push(problem('invalid-duration', 'error', `${path}.duration`, (e as Error).message));
      return null;
    }
  }
  if (!end) return null;

  if (Temporal.PlainDate.compare(end, start) <= 0) {
    problems.push(problem('end-before-start', 'error', `${path}.end`, `${start.toString()} ≥ ${end.toString()} (end is exclusive)`));
    return null;
  }
  return { allDay: true, start, end };
}

function toDate(parsed: Parsed, input: EventInput, ctx: NormalizeContext, path: string, problems: Problem[]): PlainDate | null {
  if (parsed.kind === 'date') return parsed.value;
  problems.push(problem('allday-with-time', 'warning', path, parsed.value.toString()));
  if (parsed.kind === 'wall') return parsed.value.toPlainDate();
  // An instant has a date only somewhere: same zone rules, same warnings, as a timed start.
  return toZoned(parsed, input, ctx, path, problems)?.value.toPlainDate() ?? null;
}

/**
 * cyrb53: a fast 53-bit string hash. Used twice with two seeds for derived
 * ids (a 32-bit hash made two real titles collide in review).
 */
function hash53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Many inputs, each judged alone. A rejected input never stops the others;
 * a repeated id rejects the later input and keeps the first.
 *
 * With a `sourceId`, an event the source sent without an id gets one derived
 * from what it is — source, start, end, title — not from a counter. Fetched
 * again (a refresh, or a neighbouring chunk it overlaps), it gets the same id,
 * so the store sees the same event rather than one removed and one added.
 * Identical events in one batch are told apart by their rank: `#1`, `#2`.
 */
export function normalizeMany(
  inputs: Iterable<EventInput>,
  ctx: NormalizeContext,
  sourceId?: string,
  /** Where each input stands in the whole list (a part of it, loaded later): its problems name that place. */
  indexes?: readonly number[],
): { items: Normalized[]; report: NormalizationReport } {
  assertContext(ctx);
  const items: Normalized[] = [];
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const ranks = new Map<string, number>();
  const tag = (p: Problem): Problem => (sourceId === undefined ? p : { ...p, sourceId });
  let rejected = 0;
  let i = 0;
  for (const input of inputs) {
    const path = `events[${indexes ? indexes[i] : i}]`;
    i++;
    const r = normalizeChecked(input, ctx, path);
    problems.push(...r.problems.map(tag));
    if (!r.ok) {
      rejected++;
      continue;
    }
    const item = r.value;
    let event = itemEvent(item);
    if (sourceId !== undefined) {
      let id = event.id;
      if (!given((input as EventInput).id)) {
        // Two 53-bit hashes of the same text under different seeds: ~106 bits,
        // so ids derived across chunks and refreshes do not meet by chance.
        // A series' rules are part of what it is: the same start with another rule is another series.
        const rules = item.kind === 'series' ? `|${item.series.set.rules.map((r) => recurrenceEngine()?.serializeRRule(r) ?? '').join(';;')}` : '';
        const text = `${event.start.toString()}|${event.end.toString()}|${event.title}${rules}`;
        const base = `${sourceId}:${hash53(text)}${hash53(text, 0x9e3779b9)}`;
        const rank = ranks.get(base) ?? 0;
        ranks.set(base, rank + 1);
        id = rank === 0 ? base : `${base}#${rank}`;
      }
      event = Object.freeze({ ...event, id, sourceId }) as CalEvent;
    }
    if (seen.has(event.id)) {
      problems.push(tag(problem('duplicate-id', 'error', `${path}.id`, event.id)));
      rejected++;
      continue;
    }
    seen.add(event.id);
    items.push(item.kind === 'event' ? { kind: 'event', event } : { kind: 'series', series: { ...item.series, id: event.id, base: event, ...(sourceId !== undefined && { sourceId }) } });
  }
  linkOverrides(items, problems, tag);
  return { items, report: { accepted: items.length, rejected, problems } };
}
