import './prelude';
import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import { makeDraggable } from '@dzcalendar/dom/drag';
import type { CalendarInstance, EventChange } from '@dzcalendar/dom';

const now = () => Temporal.Instant.from('2026-10-21T07:00:00Z');
const log = (s: string) => (document.querySelector('#log')!.textContent = s);
const patients = [
  { id: 'p1', name: 'M. Benali', minutes: 30 },
  { id: 'p2', name: 'Mme Haddad', minutes: 45 },
  { id: 'p3', name: 'M. Saïdi', minutes: 15 },
];
const list = document.querySelector('#cards')!;
for (const p of patients) {
  const card = list.appendChild(document.createElement('div'));
  card.className = 'card';
  card.dataset['patient'] = p.id;
  card.textContent = `${p.name} · ${p.minutes} min`;
  makeDraggable(card, { event: { title: p.name, duration: { minutes: p.minutes }, extendedProps: { patientId: p.id } }, data: p });
}
const received: string[] = [];
const doctor = (el: string, name: string, extra: Record<string, unknown> = {}): CalendarInstance =>
  createCalendar(document.querySelector<HTMLElement>(el)!, {
    timeZone: 'Africa/Algiers',
    locale: 'fr-FR',
    initialView: 'timeGridDay',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    now,
    editable: true,
    droppable: true,
    scrollTime: { hours: 8 },
    onDrop: (d) => {
      document.querySelector(`[data-patient="${(d.data as { id: string }).id}"]`)?.remove();
      log(`${(d.data as { name: string }).name} placé chez ${name}`);
    },
    onEventReceive: (c: EventChange) => {
      received.push(`${name}:${c.after?.title}`);
      (window as unknown as { __dd: { lastReceive?: EventChange } }).__dd.lastReceive = c;
    },
    onEventLeave: (l) => log(`${l.event.title} quitte ${name}`),
    ...extra,
  });
const a = doctor('#a', 'Dre A', { events: [{ id: 'r1', title: 'Contrôle', start: '2026-10-21T10:00[Africa/Algiers]', duration: { minutes: 30 } }] });
// Dr B sees patients from 09:00 to 18:00: a drop earlier is refused.
const b = doctor('#b', 'Dr B', { events: [{ id: 'r2', title: 'Réunion', start: '2026-10-21T14:00[Africa/Algiers]', duration: { minutes: 60 } }], businessHours: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7], start: '09:00', end: '18:00' }, rules: { constraint: 'businessHours' } });
(window as unknown as Record<string, unknown>).__dd = { a, b, received };
