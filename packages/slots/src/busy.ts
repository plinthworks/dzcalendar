
import type { CalEvent, EventInstance, ZoneId } from '@dzcalendar/core';
import type { Busy } from './types.js';

/**
 * The busy time of calendar events (those with `busy`, the default unless
 * cancelled): a timed event is a booking, an all-day one blocks its whole
 * dates in the provider's zone.
 */
export function busyFromEvents(events: Iterable<CalEvent | EventInstance>, zone: ZoneId): Busy[] {
  const out: Busy[] = [];
  for (const x of events) {
    const ev = 'event' in x ? x.event : x;
    if (!ev.busy) continue;
    if (ev.allDay) {
      out.push({ start: ev.start.toZonedDateTime({ timeZone: zone }), end: ev.end.toZonedDateTime({ timeZone: zone }), kind: 'block' });
    } else {
      out.push({ start: ev.start, end: ev.end });
    }
  }
  return out;
}

