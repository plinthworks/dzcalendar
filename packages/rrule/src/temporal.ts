/**
 * Temporal for the rrule package: the value from @tzslot/core (native when
 * the platform has it, else the polyfill — one copy for the whole app), and
 * its types under the same name, so `Temporal.PlainDate` reads as a type too.
 */
import { Temporal as TemporalValue } from '@tzslot/core/lazy';
import type * as T from '@tzslot/core/lazy';

export const Temporal = TemporalValue;
// A namespace of types only: it merges with the value above.
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Temporal {
  type Instant = T.Instant;
  type PlainDate = T.PlainDate;
  type PlainDateTime = T.PlainDateTime;
  type PlainTime = T.PlainTime;
  type ZonedDateTime = T.ZonedDateTime;
  type Duration = T.Duration;
}
