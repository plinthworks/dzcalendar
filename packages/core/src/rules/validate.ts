import { normalizeIntervals, subtractSpans } from '../intervals.js';
import type { MsSpan } from '../intervals.js';
import type { CalEvent, EventId, ResourceId } from '../event/types.js';
import type { ResourceTree } from '../resource/types.js';
import type { StoreSnapshot } from '../store/store.js';
import { viewWindow } from '../store/store.js';
import type { PlainDate, ZonedDateTime, ZoneId } from '../temporal.js';
import { Temporal } from '../temporal.js';
import { businessIntervals } from './business-hours.js';
import type { BusinessHoursInput } from './business-hours.js';

/** Where an event is proposed to go: a move, a resize, an edit — whoever asks. */
export interface Placement {
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
  readonly allow?: (p: Placement) => boolean;
  /** Days outside it are not reachable (exclusive end). */
  readonly validRange?: { readonly start?: PlainDate; readonly end?: PlainDate };
  /**
   * The resources: each one an event goes on checks its own `eventConstraint`
   * (else the calendar's) against its own business hours in its own zone,
   * and its `eventOverlap` decides for the events it shares.
   */
  readonly resources?: ResourceTree;
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
  p: Placement,
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
  // One check per resource the event goes on (its own rule and hours, in its zone), else the calendar's.
  const resources = rules.resources ? p.resourceIds.flatMap((id) => rules.resources!.byId.get(id)?.resource ?? []) : [];
  const checks = resources.length > 0
    ? resources.map((r) => ({ spec: r.eventConstraint ?? rules.constraint, hours: r.businessHours ?? rules.businessHours, zone: r.timeZone ?? zone, id: r.id }))
    : [{ spec: rules.constraint, hours: rules.businessHours, zone, id: undefined }];
  for (const c of checks) {
    if (c.spec === undefined) continue;
    let allowed: MsSpan[];
    const spec = c.spec;
    // Business hours as a constraint with none given constrains nothing (rather than refusing everything).
    if (spec === 'businessHours') {
      // Read in the resource's zone: two days of margin cover any offset between it and the calendar's.
      allowed = c.hours === undefined ? [span] : businessIntervals(fromDate.subtract({ days: 1 }), toDate.add({ days: 1 }), c.hours, c.zone);
    } else if ('groupId' in spec) {
      allowed = snap
        .queryInstances(viewWindow(fromDate, toDate, zone))
        .filter((i) => i.event.groupId === spec.groupId && i.event.id !== ev.id)
        .map((i) => spanOf(i.event.start, i.event.end, zone));
    } else allowed = [...spec.spans];
    if (subtractSpans([span], normalizeIntervals(allowed)).length > 0) {
      v('constraint', c.id);
      break;
    }
  }

  // A resource's `eventOverlap` decides for the events it shares: false refuses, true allows, whatever the calendar says.
  const strict = new Set(resources.filter((r) => r.eventOverlap === false).map((r) => r.id));
  const lenient = new Set(resources.filter((r) => r.eventOverlap === true).map((r) => r.id));
  const global = rules.overlap ?? true;
  if (global !== true || strict.size > 0) {
    const moving = { ...ev, start: p.start, end: p.end, resourceIds: p.resourceIds } as CalEvent;
    const others = snap.queryInstances(viewWindow(fromDate, toDate, zone), { includeBackground: false });
    for (const inst of others) {
      const o = inst.event;
      if (o.id === ev.id || (ev.ref && o.ref && ev.ref.seriesId === o.ref.seriesId && ev.ref.key === o.ref.key)) continue;
      if (opts.movingSeries !== undefined && o.ref?.seriesId === opts.movingSeries) continue;
      // Resources: only events that share one meet (none on either side shares the calendar).
      const shared = o.resourceIds.filter((r) => p.resourceIds.includes(r));
      if (p.resourceIds.length > 0 && o.resourceIds.length > 0 && shared.length === 0) continue;
      const os = spanOf(o.start, o.end, zone);
      if (!(os.s < span.e && os.e > span.s)) continue;
      const refused = shared.some((r) => strict.has(r))
        ? true
        : shared.length > 0 && shared.every((r) => lenient.has(r))
          ? false
          : global === false || (global !== true && !global(o, moving));
      if (refused) {
        v('overlap', o.id);
        break;
      }
    }
  }

  if (rules.allow && out.length === 0 && !rules.allow(p)) v('allow');
  return out;
}
