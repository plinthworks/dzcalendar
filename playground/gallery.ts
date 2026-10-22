// A stable page for before/after screenshots of the look (Phase 18g-3): fixed data, a fixed now, every view.
// ?scheme=dark|light, ?theme=<family>.
import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/dom/list';
import '@dzcalendar/dom/multimonth';
import '@dzcalendar/pro';

const q = new URLSearchParams(location.search);
const scheme = (q.get('scheme') ?? 'light') as 'light' | 'dark';
const theme = q.get('theme') ?? 'standard';
document.body.classList.toggle('dark', scheme === 'dark');

const Z = 'Europe/Paris';
const at = (d: string, t: string) => `2026-10-${d}T${t}[${Z}]`;
const events: EventInput[] = [
  { id: 'c1', title: 'Consultation', start: at('19', '09:00'), duration: { minutes: 30 }, tone: 'blue', resourceId: 'benali' },
  { id: 'c2', title: 'Suivi grossesse', start: at('19', '10:00'), duration: { minutes: 45 }, tone: 'green', resourceId: 'haddad' },
  { id: 'c3', title: 'Réunion de service', start: at('20', '08:30'), duration: { hours: 1, minutes: 30 }, tone: 'violet', resourceId: 'benali' },
  { id: 'c4', title: 'Échographie', start: at('20', '09:00'), duration: { minutes: 45 }, tone: 'amber', resourceId: 'martin' },
  { id: 'c5', title: 'Urgence', start: at('20', '09:15'), duration: { minutes: 30 }, tone: 'red', resourceId: 'haddad' },
  { id: 'c6', title: 'Consultation', start: at('21', '09:00'), duration: { minutes: 30 }, resourceId: 'benali' },
  { id: 'c7', title: 'Téléconsultation', start: at('21', '11:00'), duration: { hours: 1 }, tone: 'slate', resourceId: 'martin' },
  { id: 'c8', title: 'Bilan annuel', start: at('22', '14:00'), duration: { hours: 1, minutes: 30 }, tone: 'green', resourceId: 'haddad' },
  { id: 'c9', title: 'Vaccination', start: at('23', '08:00'), duration: { minutes: 20 }, tone: 'blue', resourceId: 'martin' },
  { id: 'c10', title: 'Garde', start: at('22', '18:00'), end: at('23', '08:00'), tone: 'slate', resourceId: 'benali' },
  { id: 'ad1', title: 'Congrès de cardiologie', start: '2026-10-20', end: '2026-10-23', allDay: true, tone: 'violet', resourceId: 'haddad' },
  { id: 'ad2', title: 'Formation', start: '2026-10-21', end: '2026-10-22', allDay: true, tone: 'amber', resourceId: 'martin' },
  { id: 'bg', title: 'Fermé', start: '2026-10-24', end: '2026-10-26', allDay: true, display: 'background', tone: 'red' },
  ...['08:00', '09:00', '10:00', '11:00', '14:00', '15:00'].map((t, i) => ({ id: `m${i}`, title: ['Consultation', 'Suivi', 'Contrôle', 'Résultats', 'Visite', 'Rappel'][i]!, start: at('14', t), duration: { minutes: 30 }, tone: ['blue', 'green', 'amber', 'red', 'slate', 'violet'][i]! })),
  { id: 'n1', title: 'Rendez-vous', start: at('06', '10:00'), duration: { minutes: 30 } },
  { id: 'n2', title: 'Séminaire', start: '2026-10-28', end: '2026-10-31', allDay: true, tone: 'blue' },
];
const resources: ResourceInput[] = [
  { id: 'benali', title: 'Dre Benali' },
  { id: 'haddad', title: 'Dr Haddad' },
  { id: 'martin', title: 'Dr Martin' },
];

const base = {
  timeZone: Z,
  locale: 'fr-FR',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  now: () => Temporal.Instant.from('2026-10-21T08:40:00Z'),
  events,
  scheme,
  theme,
  scrollTime: { hours: 7, minutes: 30 },
  businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
  headerViews: ['dayGridMonth', 'timeGridWeek', 'timeGridDay', 'listWeek'],
} as const;

const views: [string, Record<string, unknown>][] = [
  ['timeGridWeek', {}],
  ['dayGridMonth', {}],
  ['listWeek', {}],
  ['timeGridDay', {}],
  ['resourceTimelineWeek', { resources, headerViews: ['resourceTimelineDay', 'resourceTimelineWeek'] }],
  ['resourceTimeGridDay', { resources, headerViews: ['resourceTimeGridDay', 'timeGridWeek'] }],
  ['multiMonthYear', { headerViews: ['multiMonthYear', 'dayGridMonth'] }],
];
const main = document.getElementById('main')!;
const cals: Record<string, unknown> = {};
for (const [view, extra] of views) {
  const h = document.createElement('p');
  h.className = 'lbl';
  h.textContent = view;
  const card = document.createElement('section');
  card.className = 'card';
  card.id = `v-${view}`;
  const el = document.createElement('div');
  card.append(el);
  main.append(h, card);
  cals[view] = createCalendar(el, { ...base, initialView: view, ...extra } as Parameters<typeof createCalendar>[1]);
}
Object.assign(window, { cals, ready: true });
