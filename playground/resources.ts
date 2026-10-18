import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';

const resources: ResourceInput[] = [
  { id: 'benali', title: 'Dre Benali', service: 'Cardiologie', eventOverlap: false },
  { id: 'haddad', title: 'Dr Haddad', service: 'Cardiologie', timeZone: 'Asia/Riyadh', businessHours: { daysOfWeek: [7, 1, 2, 3, 4], start: '08:00', end: '12:00' }, eventConstraint: 'businessHours' },
  { id: 'martin', title: 'Dr Martin', service: 'Dermatologie' },
  { id: 'nour', title: 'Dre Nour', service: 'Dermatologie' },
];
const events: EventInput[] = [
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 }, resourceId: 'benali' },
  { id: 'b', title: 'Suivi', start: '2026-10-21T08:00[Asia/Riyadh]', duration: { minutes: 30 }, resourceId: 'haddad' },
  { id: 'c', title: 'Réunion de service', start: '2026-10-21T13:00[Europe/Paris]', duration: { hours: 1 }, resourceIds: ['benali', 'haddad'] },
  { id: 'd', title: 'Biopsie', start: '2026-10-21T10:30[Europe/Paris]', duration: { hours: 1 }, resourceId: 'martin' },
  { id: 'e', title: 'Congé', start: '2026-10-22', allDay: true, resourceId: 'nour' },
  { id: 'f', title: 'Consultation', start: '2026-10-22T14:00[Europe/Paris]', duration: { minutes: 30 }, resourceId: 'nour' },
];

const log = document.querySelector<HTMLElement>('#log')!;
const cal = createCalendar(document.querySelector<HTMLElement>('#cal')!, {
  timeZone: 'Europe/Paris',
  locale: 'fr-FR',
  initialView: 'resourceTimeGridDay',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  now: () => Temporal.Instant.from('2026-10-21T09:30:00Z'),
  events,
  resources,
  resourceGroupField: 'service',
  businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
  editable: true,
  selectable: true,
  headerViews: ['resourceTimeGridDay', 'resourceTimeGridWeek', 'resourceDayGridMonth'],
  timeGrid: { slotMin: { hours: 6 }, slotMax: { hours: 20 } },
  onSelect: (sel) => (log.textContent = `Sélection : ${sel.resourceId ?? '—'}, ${sel.start.toString().slice(0, 16)}`),
  onDateClick: (c) => (log.textContent = `Clic : ${c.resourceId ?? '—'}, ${c.date.toString()}`),
  onCommandRefused: (r) => (log.textContent = `Refusé : ${r.ok ? '' : (r.violations ?? []).map((v) => v.code).join(', ')}`),
});
document.querySelector<HTMLSelectElement>('#view')!.addEventListener('change', (e) => cal.update({ view: (e.target as HTMLSelectElement).value }));
document.querySelector<HTMLInputElement>('#group')!.addEventListener('change', (e) => cal.update({ resourceGroupField: (e.target as HTMLInputElement).checked ? 'service' : undefined }));
(window as unknown as { __cal: typeof cal }).__cal = cal;
