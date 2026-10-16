/**
 * Where Temporal comes from: @tzslot/core, and nowhere else.
 *
 * tzslot already decides between the native Temporal and the `/full` polyfill
 * (static import, ≈20 kB gzipped — decided by the owner, kept here). Taking it
 * from there means an app that uses both libraries carries one polyfill, and
 * one copy of the classes: two copies would make `instanceof` lie, which is
 * why `normalizeEvent` re-reads foreign Temporal objects from their string.
 *
 * `purity.test.ts` fails if any other file touches `Date`, the global
 * `Temporal`, or `temporal-polyfill` directly.
 */
import { Temporal } from '@tzslot/core';

export { Temporal, usingPolyfill } from '@tzslot/core';
export type {
  PlainDate,
  PlainTime,
  PlainDateTime,
  ZonedDateTime,
  Instant,
  Duration,
  DurationLike,
  Weekday,
} from '@tzslot/core';

export type PlainYearMonth = ReturnType<typeof Temporal.PlainYearMonth.from>;
/** An IANA zone identifier ("Europe/Paris", "UTC"). Never a bare offset. */
export type ZoneId = string;
/** Milliseconds since the epoch: what the indexes sort on. Temporal values keep their nanoseconds. */
export type EpochMs = number;
