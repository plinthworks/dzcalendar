import type { CalEvent } from '../event/types.js';
import { Temporal } from '../temporal.js';
import type { PlainDate, ZonedDateTime, ZoneId } from '../temporal.js';
import { resolveWall, transitionsBetween } from '../zone.js';
import { proposeMove, proposeResize } from './propose.js';
import type { Hit, InteractionContext, Proposal } from './propose.js';

/** A key press, as any toolkit reports it. */
export interface KeyLike {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

/**
 * Where the keyboard is: on the grid's cursor (a day, a slot), on an event,
 * or holding an event (grab mode — the keyboard's drag).
 */
export type KeyMode = 'cursor' | 'event' | 'grab';

/** How far one press goes: days, and slots of `snapMinutes` (a time grid's rows). */
export interface Step {
  readonly days: number;
  readonly slots: number;
}

export type Intent =
  /** Cursor: to the next day or slot (`extend`: Shift, the selection grows). Grab: the event moves. */
  | { readonly kind: 'move'; readonly step: Step; readonly extend: boolean }
  /** Grab: one edge moves (Shift: the end; Alt+Shift: the start). */
  | { readonly kind: 'resize'; readonly edge: 'start' | 'end'; readonly step: Step }
  /** Cursor: to the first or last place of its line (a week row, a day's hours). */
  | { readonly kind: 'line'; readonly edge: 'start' | 'end'; readonly extend: boolean }
  /** Cursor: the previous or next period. */
  | { readonly kind: 'period'; readonly dir: 'prev' | 'next' }
  /** Event: the previous or next event of the same day. */
  | { readonly kind: 'item'; readonly delta: 1 | -1 }
  /** Cursor, Enter: into the day's events (a month), else as `activate`. */
  | { readonly kind: 'enter' }
  /** Cursor, Space (and Enter where there is nothing to enter): the date click, or the selection made. */
  | { readonly kind: 'activate' }
  /** Event: Enter or Space. */
  | { readonly kind: 'open' }
  /** Event: M or Alt+Enter. */
  | { readonly kind: 'grab' }
  /** Grab: Enter or Space puts the event down. */
  | { readonly kind: 'commit' }
  /** Escape: lets go (grab), clears the selection (cursor), back to the day (event). Tab in grab mode too. */
  | { readonly kind: 'cancel' }
  /** Event: Delete or Backspace. */
  | { readonly kind: 'delete' }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' };

export interface KeyContext {
  readonly mode: KeyMode;
  /** Right to left: the horizontal arrows swap (the next day is on the left). */
  readonly rtl: boolean;
  /** A time grid's columns are days and its rows slots; a day grid's rows are weeks. */
  readonly grid: 'time' | 'day';
}

const NONE: Step = { days: 0, slots: 0 };

/** The step of an arrow key in this grid, reading direction applied. */
function arrow(key: string, ctx: KeyContext): Step | null {
  const ahead = ctx.rtl ? -1 : 1;
  switch (key) {
    case 'ArrowLeft':
      return { ...NONE, days: -ahead };
    case 'ArrowRight':
      return { ...NONE, days: ahead };
    case 'ArrowUp':
      return ctx.grid === 'time' ? { ...NONE, slots: -1 } : { ...NONE, days: -7 };
    case 'ArrowDown':
      return ctx.grid === 'time' ? { ...NONE, slots: 1 } : { ...NONE, days: 7 };
    default:
      return null;
  }
}

/**
 * What a key means where the keyboard is (ARCHITECTURE D.3). Null: not the
 * calendar's — the page keeps it. Pure, so the keymap is the same in every
 * renderer and port.
 */
export function intentFor(k: KeyLike, ctx: KeyContext): Intent | null {
  const mod = k.ctrlKey === true || k.metaKey === true;
  const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
  if (ctx.mode !== 'grab' && mod && !k.altKey) {
    if (key === 'z') return { kind: k.shiftKey ? 'redo' : 'undo' };
    if (key === 'y' && !k.shiftKey) return { kind: 'redo' };
    return null;
  }
  if (mod) return null;
  const step = arrow(key, ctx);

  if (ctx.mode === 'grab') {
    if (step) {
      if (k.shiftKey) return { kind: 'resize', edge: k.altKey ? 'start' : 'end', step };
      return k.altKey ? null : { kind: 'move', step, extend: false };
    }
    if (key === 'PageUp' || key === 'PageDown') return { kind: 'move', step: { ...NONE, days: key === 'PageUp' ? -7 : 7 }, extend: false };
    if (key === 'Enter' || key === ' ') return { kind: 'commit' };
    if (key === 'Escape' || key === 'Tab') return { kind: 'cancel' };
    return null;
  }

  if (ctx.mode === 'event') {
    if (key === 'Enter' && k.altKey) return { kind: 'grab' };
    if (k.altKey) return null;
    if (key === 'Enter' || key === ' ') return { kind: 'open' };
    if (key === 'm' && !k.shiftKey) return { kind: 'grab' };
    if (key === 'Delete' || key === 'Backspace') return { kind: 'delete' };
    if (key === 'Escape') return { kind: 'cancel' };
    if (step) return { kind: 'item', delta: step.days + step.slots > 0 ? 1 : -1 };
    return null;
  }

  if (k.altKey) return null;
  if (step) return { kind: 'move', step, extend: k.shiftKey === true };
  if (key === 'Home' || key === 'End') return { kind: 'line', edge: key === 'Home' ? 'start' : 'end', extend: k.shiftKey === true };
  if (key === 'PageUp' || key === 'PageDown') return { kind: 'period', dir: key === 'PageUp' ? 'prev' : 'next' };
  if (key === 'Enter') return { kind: 'enter' };
  if (key === ' ') return { kind: 'activate' };
  if (key === 'Escape') return { kind: 'cancel' };
  return null;
}

/**
 * A hit moved by a step, as the keyboard moves the cursor or a held event.
 * Days keep the wall time (read again in the zone, the pass kept; a gap moves
 * on, flagged like a pointer in it). Slots step in elapsed time, so every real
 * slot is visited once: both passes of a repeated hour, none of a skipped one.
 * A slot hit keeps its column's date: the view keeps it inside its hours.
 */
export function stepHit(ctx: Pick<InteractionContext, 'displayZone' | 'snapMinutes'>, hit: Hit, step: Step): Hit {
  if (hit.kind === 'day') return step.days === 0 ? hit : { ...hit, date: hit.date.add({ days: step.days }) };
  let { instant, date } = hit;
  let gap = false;
  if (step.days !== 0) {
    const z = instant.toZonedDateTimeISO(ctx.displayZone);
    const wall = z.toPlainDateTime().add({ days: step.days });
    const r = resolveWall(wall.toPlainDate(), wall.toPlainTime(), ctx.displayZone, { preferOffset: z.offset });
    gap = !r.exists;
    // In a skipped hour: the first moment after it (03:00), as a pointer in the gap gives — not the time pushed on (03:30).
    const back = gap ? resolveWall(wall.toPlainDate(), wall.toPlainTime(), ctx.displayZone, 'earlier').instant : null;
    const after = back && r.instant ? transitionsBetween(back, r.instant, ctx.displayZone)[0]?.at : undefined;
    instant = after ?? r.instant ?? instant;
    date = date.add({ days: step.days });
  }
  if (step.slots !== 0) {
    instant = Temporal.Instant.fromEpochMilliseconds(instant.epochMilliseconds + step.slots * Math.max(1, ctx.snapMinutes) * 60_000);
    gap = false;
  }
  return { kind: 'slot', date, instant, ...(hit.resourceId !== undefined && { resourceId: hit.resourceId }), ...(gap && { gap: true as const }) };
}

/**
 * Where an event's edge stands, as a hit in this grid — what a pointer
 * pressed there would give: a timed event's moment in a time grid, its day
 * in a month, the all-day row for a day event in a time grid. The end of an
 * event is exclusive: its hit is the last day it covers, or the moment it
 * ends in the column of its last minute.
 */
export function eventHit(ev: CalEvent, edge: 'start' | 'end', o: { readonly displayZone: ZoneId; readonly grid: 'time' | 'day' }): Hit {
  if (ev.allDay) {
    const date = edge === 'start' ? (ev.start as PlainDate) : (ev.end as PlainDate).subtract({ days: 1 });
    const last = Temporal.PlainDate.compare(date, ev.start as PlainDate) < 0 ? (ev.start as PlainDate) : date;
    return o.grid === 'time' ? { kind: 'day', date: last, allDayRow: true } : { kind: 'day', date: last };
  }
  const at = (edge === 'start' ? ev.start : ev.end) as ZonedDateTime;
  const instant = at.toInstant();
  // The column an end belongs to is the one of its last minute: an end at midnight closes the day before.
  const ms = edge === 'end' && ev.end.toString() !== ev.start.toString() ? instant.epochMilliseconds - 1 : instant.epochMilliseconds;
  const date = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(o.displayZone).toPlainDate();
  return o.grid === 'time' ? { kind: 'slot', date, instant } : { kind: 'day', date };
}

/** The event as a proposal would leave it: what grab mode holds between two presses. */
export function heldEvent(p: Proposal): CalEvent {
  const ev = p.event;
  if (p.allDay) return { ...ev, allDay: true, start: p.start as PlainDate, end: p.end as PlainDate, resourceIds: p.resourceIds } as CalEvent;
  const zoneGuessed = ev.allDay ? false : ev.zoneGuessed;
  return { ...ev, allDay: false, start: p.start as ZonedDateTime, end: p.end as ZonedDateTime, zoneGuessed, resourceIds: p.resourceIds } as CalEvent;
}

/**
 * One press in grab mode: the held event moved or resized by a step, through
 * the hits a pointer would give and the same proposals (`proposeMove`,
 * `proposeResize`) — so a key sequence lands where the mouse would. `fit`
 * is the view's say on the stepped hit (`from` is where the edge was): kept
 * inside what it draws, or null — nowhere to go, nothing is proposed.
 */
export function grabStep(
  ctx: InteractionContext,
  grid: 'time' | 'day',
  held: CalEvent,
  op: { readonly kind: 'move'; readonly step: Step } | { readonly kind: 'resize'; readonly edge: 'start' | 'end'; readonly step: Step },
  fit: (to: Hit, from: Hit) => Hit | null = (h) => h,
): Proposal | null {
  const edge = op.kind === 'resize' ? op.edge : 'start';
  const from = eventHit(held, edge, { displayZone: ctx.displayZone, grid });
  const to = fit(stepHit(ctx, from, op.step), from);
  if (!to) return null;
  return op.kind === 'move' ? proposeMove(ctx, held, from, to) : proposeResize(ctx, held, op.edge, to);
}
