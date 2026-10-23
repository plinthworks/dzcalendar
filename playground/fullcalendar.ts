import './prelude';
import '../packages/theme/dzcalendar.css';
import { createFromFullCalendar } from '@dzcalendar/compat-fullcalendar';

const log = document.getElementById('log')!;
const say = (s: string) => (log.textContent = s);

// Written as an application would for FullCalendar.
const { calendar, problems } = createFromFullCalendar(document.getElementById('cal')!, {
  plugins: [],
  timeZone: 'Europe/Paris',
  locale: 'fr',
  initialView: 'timeGridWeek',
  initialDate: '2026-10-21',
  firstDay: 1,
  slotMinTime: '07:00:00',
  slotMaxTime: '20:00:00',
  editable: true,
  selectable: true,
  nowIndicator: true,
  businessHours: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '18:00' },
  headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
  height: 'auto',
  events: [
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00:00', end: '2026-10-21T10:00:00', color: '#c00' },
    { id: 'b', title: 'Visio Chicago', start: '2026-10-22T15:00:00Z', end: '2026-10-22T16:00:00Z' },
    { id: 'c', title: 'Garde', start: '2026-10-24', end: '2026-10-26' },
    { id: 's', title: 'Cours (lun., mer.)', daysOfWeek: [1, 3], startTime: '12:00', endTime: '13:30', startRecur: '2026-10-01', endRecur: '2026-12-01' },
    { id: 'r', title: 'Réunion (rrule)', rrule: { freq: 'weekly', byweekday: ['fr'], dtstart: '2026-10-02T16:00:00' }, duration: '01:00' },
  ],
  eventClick: (info: { event: { title: string; start: Date } }) => say(`eventClick : ${info.event.title} — ${info.event.start.toISOString()}`),
  select: (info: { startStr: string; endStr: string }) => say(`select : ${info.startStr} → ${info.endStr}`),
  eventDrop: (info: { event: { title: string; startStr: string } }) => say(`eventDrop : ${info.event.title} → ${info.event.startStr}`),
  datesSet: (info: { startStr: string; endStr: string }) => say(`datesSet : ${info.startStr} → ${info.endStr}`),
});
document.getElementById('problems')!.replaceChildren(...problems.map((p) => Object.assign(document.createElement('li'), { textContent: `${p.severity} ${p.code} ${p.path} ${p.detail ?? ''}` })));
Object.assign(window, { calendar, problems });
