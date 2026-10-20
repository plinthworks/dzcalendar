import '../packages/theme/dzcalendar.css';
import '@dzcalendar/pro';
import { createContext, createElement as h, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Temporal } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { DzCalendar, useCalendarController, useCalendarState } from '@dzcalendar/react';
import { useDzExport, useEventEditor } from '@dzcalendar/pro-react';

// The application's own context: it reaches the events' content (portals).
const Room = createContext('Cabinet A');

const events: EventInput[] = [
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
  { id: 'b', title: 'Appel Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
  { id: 's', title: 'Garde', start: '2026-10-24T22:00[Europe/Paris]', duration: { hours: 8 } },
];

function Badge(props: { title: string }) {
  const room = useContext(Room);
  return h('span', { className: 'badge' }, props.title, ' ', h('small', null, `· ${room}`));
}

function App() {
  const cal = useCalendarController();
  const { title, canUndo, view } = useCalendarState(cal);
  const [room, setRoom] = useState('Cabinet A');
  const [log, setLog] = useState('');
  useEventEditor(cal, { onClosed: (o) => setLog(`éditeur : ${o}`) });
  const exports = useDzExport(cal);
  return h(
    Room.Provider,
    { value: room },
    h('h1', null, 'DzCalendar dans React'),
    h('p', null, "En-tête maison piloté par le contrôleur ; le contenu des événements est un composant de l'application (portail) qui lit son contexte ; la semaine du passage à l'heure d'hiver (dimanche 25 h)."),
    h(
      'div',
      { className: 'bar' },
      h('button', { onClick: cal.prev, id: 'prev' }, '‹'),
      h('button', { onClick: cal.today }, "Aujourd'hui"),
      h('button', { onClick: cal.next, id: 'next' }, '›'),
      h('strong', { id: 'title' }, title),
      h('button', { onClick: cal.undo, disabled: !canUndo, id: 'undo' }, 'Annuler'),
      h('button', { onClick: () => setRoom((r) => (r === 'Cabinet A' ? 'Cabinet B' : 'Cabinet A')), id: 'room' }, 'Changer de salle'),
      h('button', { onClick: () => void exports.download('ics', 'agenda.ics').then((p) => setLog(`ics : ${p.length} problème(s)`)) }, 'ICS'),
      h('span', { id: 'view' }, view),
    ),
    h('p', { id: 'log', role: 'status' }, log),
    h(DzCalendar, {
      className: 'calendar',
      controller: cal,
      defaultView: 'timeGridWeek',
      defaultDate: Temporal.PlainDate.from('2026-10-21'),
      timeZone: 'Europe/Paris',
      locale: 'fr-FR',
      editable: true,
      selectable: true,
      events,
      renderEventContent: (e) => h(Badge, { title: e.title }),
      onEventClick: (i) => setLog(`clic : ${i.event.title}`),
      onSelectionChange: (s) => setLog(s ? `sélection : ${String(s.start)} → ${String(s.end)}` : 'sélection : aucune'),
    }),
  );
}

createRoot(document.getElementById('root')!).render(h(App));
