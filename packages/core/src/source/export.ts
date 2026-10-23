import { toInput } from '../commands/patch.js';
import type { CalEvent, EventInput } from '../event/types.js';
import { needRecurrence } from '../recurrence/engine.js';
import type { Series } from '../recurrence/series.js';
import type { StoreSnapshot } from '../store/store.js';

/** A series written back as input: its first occurrence, its rules, exceptions and additions. */
export function seriesInput(s: Series): EventInput {
  const { rules, exdates, rdates } = s.set;
  return {
    ...toInput(s.base),
    id: s.id,
    rrule: rules.length === 1 ? needRecurrence().serializeRRule(rules[0]!) : rules.map(needRecurrence().serializeRRule),
    ...(exdates.length > 0 && { exdate: exdates.map(String) }),
    ...(rdates.length > 0 && { rdate: rdates }),
  };
}

/** An event written back as input; an override says which occurrence it replaces. */
export function eventInput(e: CalEvent): EventInput {
  const input = toInput(e);
  return e.ref ? { ...input, seriesId: e.ref.seriesId, recurrenceId: e.ref.key } : input;
}

/**
 * Everything a snapshot holds (or what `keep` keeps) as inputs: series first,
 * then events, each in id order. Normalized again, it gives the same store —
 * what an export (iCal, JSON) starts from.
 */
export function exportInputs(snap: StoreSnapshot, keep: (x: CalEvent | Series) => boolean = () => true): EventInput[] {
  const out: EventInput[] = [];
  for (const s of snap.state.series.values()) if (keep(s)) out.push(seriesInput(s));
  for (const e of snap.state.events.values()) if (keep(e)) out.push(eventInput(e));
  return out;
}
