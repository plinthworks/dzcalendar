import type { StoreChange } from '../store/changes.js';
import type { StoreSnapshot } from '../store/store.js';
import type { PlainDate } from '../temporal.js';
import { buildDayGridModel, updateDayGridModel } from './daygrid.js';
import type { DayGridModel, DayGridOptions } from './daygrid.js';
import type { ViewRange } from './spec.js';

export interface MultiMonthModel {
  readonly version: number;
  readonly range: ViewRange;
  /** One month grid each; padding days are drawn empty (each date's events show in its own month only). */
  readonly months: readonly { readonly month: PlainDate; readonly model: DayGridModel }[];
}

/** A month grid per month of the range: the month view's model, reused whole. */
export function buildMultiMonthModel(range: ViewRange, snap: StoreSnapshot, opts: DayGridOptions): MultiMonthModel {
  const o = { ...opts, showNonCurrentDates: false };
  const months = (range.months ?? [range]).map((r) => ({ month: r.activeStart, model: buildDayGridModel(r, snap, o) }));
  return { version: snap.version, range, months };
}

/** Each month follows the store on its own: a month the change does not touch keeps its object. */
export function updateMultiMonthModel(prev: MultiMonthModel, snap: StoreSnapshot, change: StoreChange): MultiMonthModel {
  let same = true;
  const months = prev.months.map((m) => {
    const model = updateDayGridModel(m.model, snap, change);
    // Every row kept: the month is unchanged, whatever the store's version says.
    if (model === m.model || (model.weeks.length === m.model.weeks.length && model.weeks.every((w, i) => w === m.model.weeks[i]))) return m;
    same = false;
    return { month: m.month, model };
  });
  return same ? prev : { version: snap.version, range: prev.range, months };
}
