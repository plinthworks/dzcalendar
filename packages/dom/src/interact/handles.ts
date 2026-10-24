import type { CalEvent, Segment } from '@dzcalendar/core';

/**
 * Which edges of an event node a pointer may pull: the end where the event
 * ends in this segment, the start where it starts (used when the calendar
 * allows resizing from the start). Read by the interaction host at
 * pointerdown; drawn by CSS as thin strips. Backgrounds have none.
 */
export function handles(el: HTMLElement, seg: Segment, bg: boolean): void {
  const resizable = !bg && seg.instance.event.perms.duration;
  if (resizable && seg.endsHere) el.dataset['resizeEnd'] = '1';
  else delete el.dataset['resizeEnd'];
  if (resizable && seg.startsHere) el.dataset['resizeStart'] = '1';
  else delete el.dataset['resizeStart'];
}

/**
 * What a person may do to an event: moving it needs its start editable and the calendar editable, or the event
 * saying so itself (`startEditable`/`editable: true`, owner 18k); resizing likewise with its duration.
 */
export const mayMove = (ev: CalEvent, editable: boolean | undefined): boolean => ev.perms.start && (editable === true || ev.perms.own?.start === true);
export const mayResize = (ev: CalEvent, editable: boolean | undefined): boolean => ev.perms.duration && (editable === true || ev.perms.own?.duration === true);
/**
 * Deleting: the calendar editable and the event not closed to every change (its own `editable: false` wins, as for a
 * move — 18j review), or the event saying `true` for both its start and its length (`editable: true`).
 */
export const mayDelete = (ev: CalEvent, editable: boolean | undefined): boolean =>
  (editable === true && (ev.perms.start || ev.perms.duration)) || (ev.perms.own?.start === true && ev.perms.own?.duration === true);

/** An event's node, in any family (the time grid's, the day grid's bars, a timeline's): what gestures grab. */
/** An event's node — never a leaving copy (the motion's, on its way out). */
export const EVENT_NODE = '.dz-ev:not(.dz-leaving), .dz-bar:not(.dz-leaving), .dz-tl__ev:not(.dz-leaving)';
/** A background event's node: drawn, never grabbed. */
export const BACKGROUND_NODE = '.dz-ev--bg, .dz-bar--bg, .dz-tl__ev--bg';
