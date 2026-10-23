// A header whose end holds more than a phone's width (French words, five buttons): it must break, never push the
// page sideways (18j review: the documentation's headerToolbar demo at 390 px).
import './prelude';
import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/dom/list';

createCalendar(document.getElementById('cal')!, {
  timeZone: 'Europe/Paris',
  locale: 'fr-FR',
  initialView: 'dayGridMonth',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  headerToolbar: { start: 'title', center: '', end: 'today prev,next dayGridMonth,timeGridWeek,listWeek' },
});
(window as unknown as { ready: boolean }).ready = true;
