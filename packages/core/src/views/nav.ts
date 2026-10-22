import { Temporal } from '../temporal.js';
import type { PlainDate } from '../temporal.js';
import { computeViewRange } from './range.js';
import type { NavContext, ViewSpec } from './spec.js';

export type NavDirection = 'prev' | 'next' | 'today' | { readonly to: PlainDate };

/**
 * The anchor after a navigation. Months move from the 1st, so 31 January
 * plus one month is February, not 3 March; a `dayCount` view steps by its
 * shown days, so four weekdays forward from Thursday lands on Wednesday.
 */
export function navigate(anchor: PlainDate, spec: ViewSpec, dir: NavDirection, ctx: NavContext): PlainDate {
  // A fixed period does not move: previous, next and today stay on it.
  if (spec.visibleRange && typeof dir !== 'object') return anchor;
  if (dir === 'today') return ctx.today;
  if (typeof dir === 'object') return dir.to;
  const sign = dir === 'next' ? 1 : -1;

  if (spec.dayCount !== undefined && spec.dateIncrement === undefined) {
    const range = computeViewRange(anchor, spec, ctx);
    if (sign === 1) return range.end;
    // Back: the start of the previous run of `dayCount` shown days.
    let d = range.start.subtract({ days: 1 });
    let n = 0;
    for (;;) {
      if (!spec.hiddenDays.includes(d.dayOfWeek as never)) n++;
      if (n === spec.dayCount) return d;
      d = d.subtract({ days: 1 });
    }
  }

  const step = Temporal.Duration.from(spec.dateIncrement ?? spec.duration);
  const from = spec.alignment === 'month' ? anchor.with({ day: 1 }) : spec.alignment === 'year' ? anchor.with({ month: 1, day: 1 }) : anchor;
  let to = sign === 1 ? from.add(step) : from.subtract(step);
  // A day view steps over hidden days in the direction of travel: back from
  // Monday with the weekend hidden is Friday, not a Sunday that would show Monday again.
  if ((spec.alignment === 'day' || spec.alignment === 'none') && spec.hiddenDays.length > 0 && spec.hiddenDays.length < 7) {
    while (spec.hiddenDays.includes(to.dayOfWeek as never)) to = to.add({ days: sign });
  }
  return to;
}
