import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import { exportControls } from './export-controls.js';
import '@dzcalendar/pro';

const resources: ResourceInput[] = [
  { id: 'card', title: 'Cardiologie', service: 'Médecine' },
  { id: 'benali', title: 'Dre Benali', parentId: 'card', room: 'B12' },
  { id: 'haddad', title: 'Dr Haddad', parentId: 'card', room: 'Télé', timeZone: 'Asia/Riyadh', businessHours: { daysOfWeek: [7, 1, 2, 3, 4], start: '08:00', end: '12:00' } },
  { id: 'derm', title: 'Dermatologie', service: 'Médecine' },
  { id: 'martin', title: 'Dr Martin', parentId: 'derm', room: 'C03' },
  { id: 'nour', title: 'Dre Nour', parentId: 'derm', room: 'C04' },
  { id: 'irm', title: 'Salle IRM', service: 'Plateau technique', room: 'S1' },
];
const at = (d: string, t: string) => `2026-10-${d}T${t}[Europe/Paris]`;
const events: EventInput[] = [
  { id: 'a', title: 'Consultation', start: at('21', '09:00'), duration: { minutes: 45 }, resourceId: 'benali' },
  { id: 'b', title: 'Suivi', start: '2026-10-21T08:00[Asia/Riyadh]', duration: { minutes: 30 }, resourceId: 'haddad' },
  { id: 'c', title: 'Réunion', start: at('21', '13:00'), duration: { hours: 1 }, resourceIds: ['benali', 'haddad'] },
  { id: 'd', title: 'Biopsie', start: at('21', '10:30'), duration: { hours: 1 }, resourceId: 'martin' },
  { id: 'e', title: 'Congé', start: '2026-10-22', end: '2026-10-24', allDay: true, resourceId: 'nour' },
  { id: 'f', title: 'IRM genou', start: at('21', '09:00'), duration: { minutes: 40 }, resourceId: 'irm' },
  { id: 'g', title: 'IRM épaule', start: at('21', '09:20'), duration: { minutes: 40 }, resourceId: 'irm' },
  { id: 'h', title: 'IRM dos', start: at('21', '09:30'), duration: { minutes: 40 }, resourceId: 'irm' },
  { id: 'i', title: 'IRM crâne', start: at('21', '09:40'), duration: { minutes: 40 }, resourceId: 'irm' },
  { id: 'i2', title: 'IRM cheville', start: at('21', '09:50'), duration: { minutes: 30 }, resourceId: 'irm' },
  { id: 'i3', title: 'IRM hanche', start: at('21', '09:10'), duration: { minutes: 30 }, resourceId: 'irm' },
  { id: 'j', title: 'Garde de nuit', start: at('24', '22:00'), end: at('25', '07:00'), resourceId: 'martin' },
  { id: 'k', title: 'À attribuer', start: at('21', '15:00'), duration: { hours: 1 } },
];

const log = document.querySelector<HTMLElement>('#log')!;
const cal = createCalendar(document.querySelector<HTMLElement>('#cal')!, {
  timeZone: 'Europe/Paris',
  locale: 'fr-FR',
  initialView: 'resourceTimelineDay',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  now: () => Temporal.Instant.from('2026-10-21T09:30:00Z'),
  events,
  resources,
  resourceGroupField: 'service',
  businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
  editable: true,
  selectable: true,
  headerViews: ['resourceTimelineDay', 'resourceTimelineWeek', 'resourceTimelineMonth'],
  viewOptions: { timeline: { areaColumns: [{ field: 'title', header: 'Ressource', width: 170 }, { field: 'room', header: 'Salle', width: 70 }] } },
  onSelect: (sel) => (log.textContent = `Sélection : ${sel.resourceId ?? '—'}, ${sel.start.toString().slice(0, 16)}`),
  onCommandRefused: (r) => (log.textContent = `Refusé : ${r.ok ? '' : (r.violations ?? []).map((v) => v.code).join(', ')}`),
});
document.querySelector<HTMLSelectElement>('#view')!.addEventListener('change', (e) => cal.update({ view: (e.target as HTMLSelectElement).value }));
document.querySelector<HTMLInputElement>('#unassigned')!.addEventListener('change', (e) => cal.update({ showUnassigned: (e.target as HTMLInputElement).checked }));
(window as unknown as { __cal: typeof cal }).__cal = cal;
exportControls(cal, document.querySelector<HTMLElement>('#exports')!);
