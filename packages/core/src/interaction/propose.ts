import { DEFAULT_TIMED_DURATION } from '../event/defaults.js';
import type { CalEvent, ResourceId } from '../event/types.js';
import { validateProposal } from '../rules/validate.js';
import { UNASSIGNED } from '../resource/owners.js';
import type { Placement, RulesContext, Violation } from '../rules/validate.js';
import type { EventInstance, StoreSnapshot } from '../store/store.js';
import type { Command } from '../commands/types.js';
import type { EditScope } from '../recurrence/edit.js';
import { Temporal } from '../temporal.js';
import type { Duration, Instant, PlainDate, ZonedDateTime, ZoneId } from '../temporal.js';
import { resolveWall } from '../zone.js';

/**
 * What is under the pointer (or the keyboard cursor), in calendar terms. The
 * view turns a point into a Hit; everything after is pure, so the mouse, a
 * finger, a pen and the keyboard propose exactly the same thing.
 */
export type Hit =
  /** A moment in a time grid column (the axis already read the position, repeated hour included). */
  | {
      readonly kind: 'slot';
      readonly date: PlainDate;
      readonly instant: Instant;
      /** The pointer is in a skipped hour: `instant` is the first moment after it, and what lands there is announced. */
      readonly gap?: true;
      readonly resourceId?: ResourceId;
      /** The start of the slot the point is in (on `snapMinutes`): what a click says (owner, 18j: as the menu does). */
      readonly slotStart?: Instant;
    }
  /** A whole day: a month cell, or the all-day row of a time grid (`allDayRow`). */
  | { readonly kind: 'day'; readonly date: PlainDate; readonly allDayRow?: boolean; readonly resourceId?: ResourceId };

export interface InteractionContext {
  readonly snap: StoreSnapshot;
  readonly displayZone: ZoneId;
  /** Minutes moves and resizes snap to, on the wall clock of the calendar. */
  readonly snapMinutes: number;
  /** When given, each proposal says whether it may go (and why not). */
  readonly rules?: RulesContext;
  /** The length a day event gets when dropped into a time grid. Default one hour. */
  readonly defaultTimedDuration?: Duration;
  /** A series moving as a whole does not collide with itself (scope chosen beforehand). */
  readonly movingSeries?: string;
  /**
   * The view has no all-day row (a timeline): an all-day event dropped on a
   * moment stays all-day and moves by whole days, rather than becoming timed.
   */
  readonly keepAllDay?: boolean;
  /** What is proposed comes from outside this calendar (dragged in from the page or another calendar): said to the rules' `allow`. */
  readonly external?: boolean;
}

/** Where an event would go, and whether it may. The same for every input device. */
export interface Proposal extends Placement {
  readonly allDay: boolean;
  readonly valid: boolean;
  readonly violations: readonly Violation[];
  /**
   * The wall time happens twice (a fall-back night): the reading chosen —
   * the pass under the pointer — and the other one, for the DOM to offer.
   */
  readonly ambiguity?: { readonly chosen: Instant; readonly alternative: Instant; readonly edge: 'start' | 'end' };
  /** The wall time does not exist (a spring-forward gap): moved to the next moment that does, to be announced. */
  readonly skipped?: boolean;
}

/** A moment snapped to the calendar's wall clock, read again in the zone. */
function snapped(i: Instant, ctx: InteractionContext, edge: 'start' | 'end' = 'start'): { instant: Instant; ambiguity?: Proposal['ambiguity']; skipped: boolean } {
  const z = i.toZonedDateTimeISO(ctx.displayZone);
  const step = Math.max(1, ctx.snapMinutes);
  const minutes = Math.round((z.hour * 60 + z.minute + z.second / 60) / step) * step;
  const date = minutes >= 1440 ? z.toPlainDate().add({ days: 1 }) : z.toPlainDate();
  const m = minutes % 1440;
  const time = Temporal.PlainTime.from({ hour: Math.floor(m / 60), minute: m % 60 });
  // The pass the pointer is in decides which of two readings: the offset it shows.
  const r = resolveWall(date, time, ctx.displayZone, { preferOffset: z.offset });
  const instant = r.instant ?? i;
  return {
    instant,
    skipped: !r.exists,
    ...(r.ambiguous && r.other && { ambiguity: { chosen: instant, alternative: r.other, edge } }),
  };
}

const daysBetween = (a: PlainDate, b: PlainDate) => a.until(b, { largestUnit: 'days' }).days;
const elapsedMs = (e: CalEvent) =>
  e.allDay ? 0 : (e.end as ZonedDateTime).epochMilliseconds - (e.start as ZonedDateTime).epochMilliseconds;

function finish(ctx: InteractionContext, given: Omit<Proposal, 'valid' | 'violations'>): Proposal {
  const p = ctx.external ? { ...given, external: true } : given;
  const violations = ctx.rules ? validateProposal(ctx.snap, p, ctx.rules, ctx.movingSeries !== undefined ? { movingSeries: ctx.movingSeries } : {}) : [];
  return { ...p, valid: violations.length === 0, violations };
}

/**
 * The resources after a move: the one grabbed on is swapped for the one
 * under the pointer, the others kept (an event on two doctors, dragged from
 * one to a third, stays on the other). Grabbed outside a resource column, it
 * goes onto the one it is dropped on.
 */
function resourcesFor(ev: CalEvent, grab: Hit, over: Hit): readonly ResourceId[] {
  const to = over.resourceId;
  if (to === undefined || to === grab.resourceId) return ev.resourceIds;
  const from = grab.resourceId;
  // Onto "Unassigned": the resource it was taken from goes (the others stay). Out of it: onto the one it is dropped on.
  if (to === UNASSIGNED) return from === undefined ? [] : ev.resourceIds.filter((r) => r !== from);
  if (from === UNASSIGNED) return [to];
  if (from === undefined || !ev.resourceIds.includes(from)) return [to];
  const out = ev.resourceIds.map((r) => (r === from ? to : r));
  return out.filter((r, i) => out.indexOf(r) === i);
}

/**
 * Where `ev` goes when the point that grabbed it (`grab`) is over `over`. A
 * timed event keeps its elapsed length and its zone; its new start is the
 * grabbed offset applied, snapped on the wall clock and read again in the
 * zone (a gap moves it forward, flagged; a repeat keeps the pass under the
 * pointer, flagged with the other). A day event moves by whole days.
 * Dropped on the all-day row, a timed event becomes a day; dropped in a
 * time grid, a day event becomes timed.
 */
export function proposeMove(ctx: InteractionContext, ev: CalEvent, grab: Hit, over: Hit): Proposal {
  if (ev.allDay && ctx.keepAllDay && over.kind === 'slot') {
    // No all-day row to drop it on: the day under the pointer, as in a month.
    const day = (h: Hit): Hit => (h.kind === 'slot' ? { kind: 'day', date: h.date, ...(h.resourceId !== undefined && { resourceId: h.resourceId }) } : h);
    return proposeMove(ctx, ev, day(grab), day(over));
  }
  const resourceIds = resourcesFor(ev, grab, over);
  if (over.kind === 'slot') {
    if (ev.allDay) {
      // A day event into the time grid: timed, at the snapped moment, default length.
      const s = snapped(over.instant, ctx);
      const start = s.instant.toZonedDateTimeISO(ctx.displayZone);
      const end = start.add(ctx.defaultTimedDuration ?? DEFAULT_TIMED_DURATION);
      return finish(ctx, { event: ev, start, end, resourceIds, allDay: false, skipped: s.skipped || over.gap === true, ...(s.ambiguity && { ambiguity: s.ambiguity }) });
    }
    const offset = grab.kind === 'slot' ? grab.instant.epochMilliseconds - (ev.start as ZonedDateTime).epochMilliseconds : 0;
    const target = Temporal.Instant.fromEpochMilliseconds(over.instant.epochMilliseconds - offset);
    const s = snapped(target, ctx);
    const start = s.instant.toZonedDateTimeISO((ev.start as ZonedDateTime).timeZoneId);
    const end = start.add({ milliseconds: elapsedMs(ev) }).withTimeZone((ev.end as ZonedDateTime).timeZoneId);
    // Skipped: the snapped wall start did not exist, or the pointer itself was in the skipped hour.
    return finish(ctx, { event: ev, start, end, resourceIds, allDay: false, skipped: s.skipped || over.gap === true, ...(s.ambiguity && { ambiguity: s.ambiguity }) });
  }

  // Over a day.
  const grabDate = grab.date;
  const days = daysBetween(grabDate, over.date);
  if (ev.allDay) {
    const start = (ev.start as PlainDate).add({ days });
    const end = (ev.end as PlainDate).add({ days });
    return finish(ctx, { event: ev, start, end, resourceIds, allDay: true });
  }
  if (over.allDayRow) {
    // A timed event onto the all-day row: the day it lands on.
    const start = over.date;
    return finish(ctx, { event: ev, start, end: start.add({ days: 1 }), resourceIds, allDay: true });
  }
  // A timed event moved between month cells: the same wall time, so many days later, in its own zone.
  const zs = ev.start as ZonedDateTime;
  const wall = zs.toPlainDateTime().add({ days });
  const r = resolveWall(wall.toPlainDate(), wall.toPlainTime(), zs.timeZoneId, { preferOffset: zs.offset });
  const start = (r.instant ?? zs.toInstant()).toZonedDateTimeISO(zs.timeZoneId);
  const end = start.add({ milliseconds: elapsedMs(ev) }).withTimeZone((ev.end as ZonedDateTime).timeZoneId);
  return finish(ctx, {
    event: ev,
    start,
    end,
    resourceIds,
    allDay: false,
    skipped: !r.exists,
    ...(r.ambiguous && r.other && r.instant && { ambiguity: { chosen: r.instant, alternative: r.other, edge: 'start' as const } }),
  });
}

/**
 * One edge of `ev` to the point `over`. The other edge stays; an event is
 * never shorter than one snap step (a day for a day event). A timed event's
 * edge snaps on the wall clock like a move.
 */
export function proposeResize(ctx: InteractionContext, ev: CalEvent, edge: 'start' | 'end', over: Hit): Proposal {
  const resourceIds = ev.resourceIds;
  if (ev.allDay) {
    const date = over.date;
    const s = ev.start as PlainDate;
    const e = ev.end as PlainDate;
    if (edge === 'end') {
      // The cell under the pointer is the last day: the end is the day after.
      let end = date.add({ days: 1 });
      if (Temporal.PlainDate.compare(end, s) <= 0) end = s.add({ days: 1 });
      return finish(ctx, { event: ev, start: s, end, resourceIds, allDay: true });
    }
    let start = date;
    if (Temporal.PlainDate.compare(start, e) >= 0) start = e.subtract({ days: 1 });
    return finish(ctx, { event: ev, start, end: e, resourceIds, allDay: true });
  }
  const zs = ev.start as ZonedDateTime;
  const ze = ev.end as ZonedDateTime;
  if (over.kind !== 'slot') return finish(ctx, { event: ev, start: zs, end: ze, resourceIds, allDay: false });
  const s = snapped(over.instant, ctx, edge);
  const gap = s.skipped || over.gap === true;
  const minMs = Math.max(1, ctx.snapMinutes) * 60_000;
  if (edge === 'end') {
    let end = s.instant.toZonedDateTimeISO(ze.timeZoneId);
    // Clamped to the shortest length: the edge is no longer the snapped moment, nor its flags.
    if (end.epochMilliseconds - zs.epochMilliseconds < minMs) {
      end = zs.add({ milliseconds: minMs }).withTimeZone(ze.timeZoneId);
      return finish(ctx, { event: ev, start: zs, end, resourceIds, allDay: false });
    }
    return finish(ctx, { event: ev, start: zs, end, resourceIds, allDay: false, skipped: gap, ...(s.ambiguity && { ambiguity: s.ambiguity }) });
  }
  let start = s.instant.toZonedDateTimeISO(zs.timeZoneId);
  if (ze.epochMilliseconds - start.epochMilliseconds < minMs) {
    start = ze.subtract({ milliseconds: minMs }).withTimeZone(zs.timeZoneId);
    return finish(ctx, { event: ev, start, end: ze, resourceIds, allDay: false });
  }
  return finish(ctx, { event: ev, start, end: ze, resourceIds, allDay: false, skipped: gap, ...(s.ambiguity && { ambiguity: s.ambiguity }) });
}

/** True when a proposal puts the event where it already is. */
export function isUnchanged(p: Proposal): boolean {
  const ev = p.event;
  return ev.allDay === p.allDay && ev.start.toString() === p.start.toString() && ev.end.toString() === p.end.toString() && ev.resourceIds.join('\u0000') === p.resourceIds.join('\u0000');
}

/** A selection of time, as a person dragged it: days, or moments snapped on the wall clock. */
export interface Selection {
  readonly start: ZonedDateTime | PlainDate;
  readonly end: ZonedDateTime | PlainDate;
  readonly allDay: boolean;
  readonly resourceId?: ResourceId;
  /** A moment of it fell in a gap and was moved on. */
  readonly skipped?: boolean;
}

/** The stretch between two hits, in either order: whole days over days, snapped moments over slots. */
export function selectionBetween(ctx: InteractionContext, a: Hit, b: Hit): Selection {
  // "Unassigned" is the view's, not a resource: a selection there is on none.
  const resource = a.resourceId !== undefined && a.resourceId !== UNASSIGNED ? { resourceId: a.resourceId } : {};
  if (a.kind === 'day' || b.kind === 'day') {
    const [d1, d2] = Temporal.PlainDate.compare(a.date, b.date) <= 0 ? [a.date, b.date] : [b.date, a.date];
    return { start: d1, end: d2.add({ days: 1 }), allDay: true, ...resource };
  }
  const [x, y] = a.instant.epochMilliseconds <= b.instant.epochMilliseconds ? [a.instant, b.instant] : [b.instant, a.instant];
  const step = Math.max(1, ctx.snapMinutes);
  // The slot under each end: from the start of the first to the end of the last.
  // Slots are wall-clock slots: from the start of the first to the end of the last, read in the pass under the pointer.
  const wallSlot = (i: Instant, plus: number) => {
    const z = i.toZonedDateTimeISO(ctx.displayZone);
    const m = Math.floor((z.hour * 60 + z.minute) / step) * step + plus;
    const date = m >= 1440 ? z.toPlainDate().add({ days: 1 }) : z.toPlainDate();
    const mm = m % 1440;
    const r = resolveWall(date, Temporal.PlainTime.from({ hour: Math.floor(mm / 60), minute: mm % 60 }), ctx.displayZone, { preferOffset: z.offset });
    return { instant: r.instant ?? i, skipped: !r.exists };
  };
  const s = wallSlot(x, 0);
  const e = wallSlot(y, 0);
  let end = wallSlot(y, step).instant;
  // Never ending at or before the pointer (a repeated or skipped half hour can fold the wall slot onto itself).
  if (end.epochMilliseconds <= y.epochMilliseconds) end = Temporal.Instant.fromEpochMilliseconds(y.epochMilliseconds + step * 60_000);
  // And the pointer is inside: a start read in the other pass comes back to the slot's real start.
  const startI = s.instant.epochMilliseconds > x.epochMilliseconds ? x : s.instant;
  return {
    start: startI.toZonedDateTimeISO(ctx.displayZone),
    end: end.toZonedDateTimeISO(ctx.displayZone),
    allDay: false,
    ...resource,
    ...((s.skipped || e.skipped) && { skipped: true }),
  };
}

/**
 * The command that carries a proposal out. An occurrence is addressed
 * through its series (`scope` says how far — the DOM asks `chooseScope`).
 * A change between timed and all-day is an update; the rest is a move.
 */
export function commandFor(instance: EventInstance, p: Proposal, scope: EditScope = 'this'): Command {
  const ev = instance.event;
  const reach = ev.ref ? { id: ev.ref.seriesId, key: ev.ref.key, scope } : { id: ev.id };
  const resources = p.resourceIds.join('\u0000') !== ev.resourceIds.join('\u0000') ? { resourceIds: p.resourceIds } : {};
  if (p.allDay !== ev.allDay) return { type: 'event.update', ...reach, patch: { allDay: p.allDay, start: p.start, end: p.end, ...resources } };
  return { type: 'event.move', ...reach, start: p.start, end: p.end, ...resources };
}
