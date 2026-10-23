/**
 * Where Temporal comes from: @tzslot/core, and nowhere else.
 *
 * Its `/lazy` entry (tzslot 2.3) gives the native Temporal where there is one
 * and fetches the `/full` polyfill (≈ 24.5 kB gzipped) only where there is
 * not, from `loadTemporal()` (owner, 18i: K.2 reversed). Taking it
 * from there means an app that uses both libraries carries one polyfill, and
 * one copy of the classes: two copies would make `instanceof` lie, which is
 * why `normalizeEvent` re-reads foreign Temporal objects from their string.
 *
 * `purity.test.ts` fails if any other file touches `Date`, the global
 * `Temporal`, or `temporal-polyfill` directly.
 */
import { Temporal } from '@tzslot/core/lazy';

export { Temporal, usingPolyfill, loadTemporal } from '@tzslot/core/lazy';

/** Temporal can be read now: native, or the polyfill loaded. Where it is not, `await loadTemporal()` first. */
export const temporalReady = (): boolean => 'PlainDate' in Temporal;
export type {
  PlainDate,
  PlainTime,
  PlainDateTime,
  ZonedDateTime,
  Instant,
  Duration,
  DurationLike,
  Weekday,
} from '@tzslot/core/lazy';

export type PlainYearMonth = ReturnType<typeof Temporal.PlainYearMonth.from>;
/** An IANA zone identifier ("Europe/Paris", "UTC"). Never a bare offset. */
export type ZoneId = string;
/** Milliseconds since the epoch: what the indexes sort on. Temporal values keep their nanoseconds. */
export type EpochMs = number;
