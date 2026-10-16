import { normalizeIntervals, subtractSpans } from '../intervals.js';
import type { MsSpan } from '../intervals.js';
import type { CalEvent, EventId, ResourceId } from '../event/types.js';
import type { StoreSnapshot } from '../store/store.js';
import { viewWindow } from '../store/store.js';
import type { PlainDate, ZonedDateTime, ZoneId } from '../temporal.js';
import { Temporal } from '../temporal.js';
import { businessIntervals } from './business-hours.js';
import type { BusinessHoursInput } from './business-hours.js';

/** Where an event is proposed to go: a move, a resize, an edit — whoever asks. */
export interface Proposal {
  readonly event: CalEvent;
  readonly start: ZonedDateTime | PlainDate;
  readonly end: ZonedDateTime | PlainDate;
  readonly resourceIds: readonly ResourceId[];
}

export interface Violation {
  readonly code: 'constraint' | 'overlap' | 'allow' | 'valid-range' | 'not-editable';
  readonly eventId: EventId;
  readonly detail?: string;
}

/**
 * Where an event may go: inside business hours, inside a group's events,
 * inside given spans (ms, in any zone — spans are instants).
 */
export type ConstraintSpec = 'businessHours' | { readonly groupId: string } | { readonly spans: readonly MsSpan[] };

/** Whether `moving` may sit over `still`. */
export type OverlapFn = (still: CalEvent, moving: CalEvent) => boolean;

export interface RulesContext {
  readonly displayZone: ZoneId;
  readonly businessHours?: BusinessHoursInput;
  readonly constraint?: ConstraintSpec;
  /** False: no event may overlap another (backgrounds aside). A function decides pair by pair. Default true. */
  readonly overlap?: boolean | OverlapFn;
  /** The application's last word. */
  readonly allow?: (p: Proposal) => boolean;
  /** Days outside it are not reachable (exclusive end). */
  readonly validRange?: { readonly start?: PlainDate; readonly end?: PlainDate };
}

/** A proposal as instants: an all-day one covers its days in the calendar's zone. */
function spanOf(start: ZonedDateTime | PlainDate, end: ZonedDateTime | PlainDate, zone: ZoneId): MsSpan {
  const ms = (x: ZonedDateTime | PlainDate) => (x instanceof Temporal.PlainDate ? x.toZonedDateTime({ timeZone: zone }).epochMilliseconds : x.epochMilliseconds);
  const s = ms(start);
  return { s, e: Math.max(ms(end), s + 1) };
}

const dateOf = (x: ZonedDateTime | PlainDate, zone: ZoneId): PlainDate => (x instanceof Temporal.PlainDate ? x : x.withTimeZone(zone).toPlainDate());

/**
 * What stands in the way of a proposal, cheapest checks first: editable,
 * valid range, constraint, overlap (one indexed query over the proposal's
 * window), then the application's `allow`. Empty means it may go.
 */
export function validateProposal(
  snap: StoreSnapshot,
  p: Proposal,
  rules: RulesContext,
  /** A series moving as a whole: its own occurrences move with it and are not in the way. */
  opts: { readonly movingSeries?: string } = {},
): Violation[] {
  const ev = p.event;
  const out: Violation[] = [];
  const zone = rules.displayZone;
  const v = (code: Violation['code'], detail?: string) => out.push(detail === undefined ? { code, eventId: ev.id } : { code, eventId: ev.id, detail });

  const startMoved = p.start.toString() !== ev.start.toString();
  // All-day lengths in calendar days: a 25-hour day is still one day.
  const lengthOf = (s: ZonedDateTime | PlainDate, e: ZonedDateTime | PlainDate) => {
    if (s instanceof Temporal.PlainDate) return `${s.until(e as PlainDate, { largestUnit: 'days' }).days}d`;
    const sp = spanOf(s, e, zone);
    return `${sp.e - sp.s}ms`;
  };
  const resized = lengthOf(p.start, p.end) !== lengthOf(ev.start, ev.end);
  const reassigned = p.resourceIds.join('\u0000') !== ev.resourceIds.join('\u0000');
  if (startMoved && !ev.perms.start) v('not-editable', 'start');
  if (resized && !ev.perms.duration) v('not-editable', 'duration');
  if (reassigned && !ev.perms.resource) v('not-editable', 'resource');

  const span = spanOf(p.start, p.end, zone);
  const range = rules.validRange;
  if (range) {
    const first = dateOf(p.start, zone);
    if (range.start && Temporal.PlainDate.compare(first, range.start) < 0) v('valid-range', 'before');
    if (range.end) {
      const endAt = range.end.toZonedDateTime({ timeZone: zone }).epochMilliseconds;
      if (span.e > endAt) v('valid-range', 'after');
    }
  }

  const fromDate = dateOf(p.start, zone).subtract({ days: 1 });
  const toDate = dateOf(p.end, zone).add({ days: 1 });
  if (rules.constraint !== undefined) {
    let allowed: MsSpan[];
    const c = rules.constraint;
    // Business hours as a constraint with none given constrains nothing (rather than refusing everything).
    if (c === 'businessHours') allowed = rules.businessHours === undefined ? [span] : businessIntervals(fromDate, toDate, rules.businessHours, zone);
    else if ('groupId' in c) {
      allowed = snap
        .queryInstances(viewWindow(fromDate, toDate, zone))
        .filter((i) => i.event.groupId === c.groupId && i.event.id !== ev.id)
        .map((i) => spanOf(i.event.start, i.event.end, zone));
    } else allowed = [...c.spans];
    if (subtractSpans([span], normalizeIntervals(allowed)).length > 0) v('constraint');
  }

  if (rules.overlap !== undefined && rules.overlap !== true) {
    const moving = { ...ev, start: p.start, end: p.end, resourceIds: p.resourceIds } as CalEvent;
    const others = snap.queryInstances(viewWindow(fromDate, toDate, zone), { includeBackground: false });
    for (const inst of others) {
      const o = inst.event;
      if (o.id === ev.id || (ev.ref && o.ref && ev.ref.seriesId === o.ref.seriesId && ev.ref.key === o.ref.key)) continue;
      if (opts.movingSeries !== undefined && o.ref?.seriesId === opts.movingSeries) continue;
      // Resources: only events that share one meet (none on either side shares the calendar).
      if (p.resourceIds.length > 0 && o.resourceIds.length > 0 && !o.resourceIds.some((r) => p.resourceIds.includes(r))) continue;
      const os = spanOf(o.start, o.end, zone);
      if (!(os.s < span.e && os.e > span.s)) continue;
      if (rules.overlap === false || !rules.overlap(o, moving)) {
        v('overlap', o.id);
        break;
      }
    }
  }

  if (rules.allow && out.length === 0 && !rules.allow(p)) v('allow');
  return out;
}
