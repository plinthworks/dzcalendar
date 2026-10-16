import type { EventInput } from '@dzcalendar/core';

/**
 * Events that exercise what DzCalendar is for: the week of the autumn clock
 * change in Paris, events in other zones, the two 02:30s, an all-day trip.
 */
export const DEMO_EVENTS: EventInput[] = [
  { id: 'standup-mon', title: 'Stand-up', start: '2026-10-19T09:30[Europe/Paris]', duration: { minutes: 15 }, tone: 'blue' },
  { id: 'design', title: 'Revue de design', start: '2026-10-19T10:00[Europe/Paris]', end: '2026-10-19T11:30[Europe/Paris]', tone: 'violet' },
  { id: 'lunch', title: 'Déjeuner', start: '2026-10-19T12:30[Europe/Paris]', duration: { hours: 1 }, tone: 'green' },
  { id: 'overlap-a', title: 'Point client', start: '2026-10-20T14:00[Europe/Paris]', end: '2026-10-20T15:30[Europe/Paris]', tone: 'amber' },
  { id: 'overlap-b', title: 'Recrutement', start: '2026-10-20T14:30[Europe/Paris]', end: '2026-10-20T16:00[Europe/Paris]', tone: 'red' },
  { id: 'overlap-c', title: 'Café', start: '2026-10-20T15:00[Europe/Paris]', duration: { minutes: 30 }, tone: 'slate' },
  { id: 'nyc', title: 'Appel New York (10:00 NY)', start: '2026-10-21T10:00[America/New_York]', duration: { hours: 1 }, tone: 'blue' },
  { id: 'tokyo', title: 'Sync Tokyo (09:00 Tokyo)', start: '2026-10-22T09:00[Asia/Tokyo]', duration: { minutes: 45 }, tone: 'violet' },
  { id: 'trip', title: 'Salon à Lyon', start: '2026-10-21', end: '2026-10-24', tone: 'green' },
  { id: 'release', title: 'Mise en production', start: '2026-10-23', tone: 'red' },
  { id: 'first-0230', title: '02:30, premier passage', start: '2026-10-25T02:30+02:00[Europe/Paris]', duration: { minutes: 30 }, tone: 'amber' },
  { id: 'second-0230', title: '02:30, second passage', start: '2026-10-25T02:30+01:00[Europe/Paris]', duration: { minutes: 30 }, tone: 'red' },
  { id: 'night', title: 'Garde de nuit', start: '2026-10-25T00:00+02:00[Europe/Paris]', end: '2026-10-25T06:00+01:00[Europe/Paris]', tone: 'slate' },
  { id: 'focus', title: 'Bloc concentration', start: '2026-10-22T08:00[Europe/Paris]', end: '2026-10-22T12:00[Europe/Paris]', display: 'background' },
];
