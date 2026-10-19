import '../packages/theme/dzcalendar.css';
import '@dzcalendar/element/define';
import type { DzCalendarElement } from '@dzcalendar/element';
import type { EventInput } from '@dzcalendar/core';

const events: EventInput[] = [
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
  { id: 'b', title: 'Appel Tokyo', start: '2026-10-22T17:00[Asia/Tokyo]', duration: { hours: 1 } },
  { id: 's', title: 'Point', start: '2026-10-19T08:30[Europe/Paris]', duration: { minutes: 15 }, rrule: 'FREQ=DAILY;COUNT=5' },
];
const log = document.querySelector<HTMLElement>('#log')!;
for (const el of document.querySelectorAll<DzCalendarElement>('dz-calendar')) el.events = events;
document.addEventListener('dz-event-click', (e) => (log.textContent = `dz-event-click : ${(e as CustomEvent).detail.event.title}`));
document.addEventListener('dz-dates-set', (e) => (log.textContent = `dz-dates-set : ${(e as CustomEvent).detail.title}`));
