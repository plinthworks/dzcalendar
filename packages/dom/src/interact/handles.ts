import type { Segment } from '@dzcalendar/core';

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
