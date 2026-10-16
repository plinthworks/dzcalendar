import { Temporal } from './temporal.js';
import type { PlainDate } from './temporal.js';

/**
 * A calendar date as a day number since 1970-01-01, with no zone involved:
 * all-day events float, and are indexed on these.
 *
 * Arithmetic rather than `PlainDate#since`, because it runs for every all-day
 * event on every query. Days-from-civil (Howard Hinnant's algorithm), valid
 * over Temporal's whole range. The model is ISO, so `year/month/day` are ISO.
 */
export function epochDay(date: PlainDate): number {
  const m = date.month;
  const y = date.year - (m <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + date.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const EPOCH = Temporal.PlainDate.from('1970-01-01');

export function fromEpochDay(n: number): PlainDate {
  return EPOCH.add({ days: n });
}
