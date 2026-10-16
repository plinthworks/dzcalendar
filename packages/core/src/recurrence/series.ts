import type { RRuleSet } from '@dzcalendar/rrule';
import { serializeRRule } from '@dzcalendar/rrule';
import type { CalEvent, EventId, RecurrenceKey, SeriesId } from '../event/types.js';
import { eventEquals } from '../store/diff.js';
import { Temporal } from '../temporal.js';
import type { Duration, PlainDate, ZonedDateTime } from '../temporal.js';

/**
 * A recurring event: its first occurrence (`base`: title, colours, zone,
 * length — everything but which day), the rule set that repeats it, and the
 * occurrences replaced by events of their own (`overrides`, Phase 6).
 */
export interface Series {
  readonly id: SeriesId;
  /** As for events: the store version that wrote it. */
  readonly revision: number;
  /** The first occurrence as an event: id is the series id; start/end give the length. */
  readonly base: CalEvent;
  readonly set: RRuleSet;
  readonly overrides: ReadonlyMap<RecurrenceKey, EventId>;
  readonly sourceId?: string;
}

/**
 * The length every occurrence takes: whole days on the wall clock, the rest
 * in elapsed time — RFC 5545's nominal DURATION, so a 3-day timed occurrence
 * still ends at its wall time after a clock change. (Moving one event keeps
 * its elapsed length instead: `commands/apply.ts`.)
 */
export function occurrenceLength(base: CalEvent): Duration {
  if (base.allDay) return Temporal.Duration.from({ days: base.start.until(base.end, { largestUnit: 'days' }).days });
  return base.start.until(base.end.withTimeZone(base.start.timeZoneId), { largestUnit: 'days' });
}

export const keyOf = (start: ZonedDateTime | PlainDate): RecurrenceKey => start.toString();

/** Instance keys are `id`, or `seriesId@key` for an occurrence; ids are escaped so neither `@` nor `|` can collide. */
export const escapeId = (id: string): string => id.replace(/%/g, '%25').replace(/\|/g, '%7C').replace(/@/g, '%40');
export const occurrenceKey = (seriesId: SeriesId, key: RecurrenceKey): string => `${escapeId(seriesId)}@${key}`;
const unescapeId = (id: string): string => id.replace(/%40/g, '@').replace(/%7C/g, '|').replace(/%25/g, '%');

/** The inverse of `escapeId` / `occurrenceKey`: which event, or which occurrence of which series. */
export function parseInstanceKey(key: string): { readonly eventId: EventId } | { readonly seriesId: SeriesId; readonly key: RecurrenceKey } {
  const at = key.indexOf('@');
  return at === -1 ? { eventId: unescapeId(key) } : { seriesId: unescapeId(key.slice(0, at)), key: key.slice(at + 1) };
}

const cache = new WeakMap<Series, Map<RecurrenceKey, CalEvent>>();
/** Occurrences kept per series: years of browsing an endless one must not grow memory without end. */
const CACHE_CAP = 8000;

/**
 * The occurrence starting at `start` as an event. The same object for the
 * same series object and key, so a view drawing it again sees nothing new.
 */
export function materialize(series: Series, start: ZonedDateTime | PlainDate): CalEvent {
  let byKey = cache.get(series);
  if (!byKey) cache.set(series, (byKey = new Map()));
  const key = keyOf(start);
  let ev = byKey.get(key);
  if (!ev) {
    // Forget the older half (a Map iterates in insertion order): what is on screen stays the same object.
    if (byKey.size >= CACHE_CAP) for (const k of [...byKey.keys()].slice(0, CACHE_CAP / 2)) byKey.delete(k);
    const len = occurrenceLength(series.base);
    // The end keeps the base's end zone: a Paris → Tokyo flight lands in Tokyo every time.
    const end =
      start instanceof Temporal.PlainDate
        ? start.add({ days: Math.max(1, len.days) })
        : (start as ZonedDateTime).add(len).withTimeZone((series.base.end as ZonedDateTime).timeZoneId);
    ev = Object.freeze({
      ...series.base,
      id: occurrenceKey(series.id, key),
      start,
      end,
      revision: series.revision,
      ref: { seriesId: series.id, key },
    }) as CalEvent;
    byKey.set(key, ev);
  }
  return ev;
}

/** True when two series repeat the same event the same way (revision aside). */
export function seriesEquals(a: Series, b: Series): boolean {
  if (a === b) return true;
  if (a.id !== b.id || a.sourceId !== b.sourceId) return false;
  if (!eventEquals(a.base, b.base)) return false;
  const rules = (s: Series) => s.set.rules.map(serializeRRule).join('\n');
  const dates = (xs: readonly { toString(): string }[]) => xs.map(String).join(',');
  if (rules(a) !== rules(b) || dates(a.set.exdates) !== dates(b.set.exdates) || dates(a.set.rdates) !== dates(b.set.rdates)) return false;
  if (a.overrides.size !== b.overrides.size) return false;
  for (const [k, v] of a.overrides) if (b.overrides.get(k) !== v) return false;
  return true;
}
