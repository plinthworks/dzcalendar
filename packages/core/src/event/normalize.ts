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

/** Shaped as a union so Phase 5 can add `{ kind: 'series' }` without changing callers. */
export type Normalized = { readonly kind: 'event'; readonly event: CalEvent };

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

  if (given(input.rrule) || given(input.exdate) || given(input.rdate)) {
    problems.push(problem('unsupported-recurrence', 'error', path, 'recurrence arrives in Phase 5'));
    return failed();
  }

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
  const event = Object.freeze({ ...common, ...span }) as CalEvent;
  return { ok: true, value: { kind: 'event', event }, problems };
}

function buildCommon(input: EventInput, ctx: NormalizeContext, path: string, problems: Problem[]) {
  const resourceIds = [...new Set([...(given(input.resourceId) ? [input.resourceId] : []), ...(input.resourceIds ?? [])])];
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
    resourceIds: Object.freeze(resourceIds),
    display: input.display ?? 'auto',
    status,
    busy: input.busy ?? status !== 'cancelled',
    perms: Object.freeze({
      start: input.startEditable ?? editable,
      duration: input.durationEditable ?? editable,
      resource: input.resourceEditable ?? editable,
    }),
    classNames: Object.freeze([...(input.classNames ?? [])]),
    ...(given(input.tone) && { tone: input.tone }),
    ...(given(input.url) && { url: input.url }),
    props: Object.freeze({ ...(input.extendedProps ?? {}) }),
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

  if (Temporal.Instant.compare(end.toInstant(), start.toInstant()) < 0) {
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
    const d = duration ?? ctx.defaultAllDayDuration ?? DEFAULT_ALL_DAY_DURATION;
    try {
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
 * Many inputs, each judged alone. A rejected input never stops the others;
 * a repeated id rejects the later input and keeps the first.
 */
export function normalizeMany(
  inputs: Iterable<EventInput>,
  ctx: NormalizeContext,
  sourceId?: string,
): { items: Normalized[]; report: NormalizationReport } {
  assertContext(ctx);
  const items: Normalized[] = [];
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const tag = (p: Problem): Problem => (sourceId === undefined ? p : { ...p, sourceId });
  let rejected = 0;
  let i = 0;
  for (const input of inputs) {
    const path = `events[${i++}]`;
    const r = normalizeChecked(input, ctx, path);
    problems.push(...r.problems.map(tag));
    if (!r.ok) {
      rejected++;
      continue;
    }
    if (seen.has(r.value.event.id)) {
      problems.push(tag(problem('duplicate-id', 'error', `${path}.id`, r.value.event.id)));
      rejected++;
      continue;
    }
    seen.add(r.value.event.id);
    const event = sourceId === undefined ? r.value.event : (Object.freeze({ ...r.value.event, sourceId }) as CalEvent);
    items.push({ kind: 'event', event });
  }
  return { items, report: { accepted: items.length, rejected, problems } };
}
