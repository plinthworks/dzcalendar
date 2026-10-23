import './prelude';
import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';

const Z = 'Africa/Algiers';
const log = document.getElementById('log')!;
const closed = new Map([['2026-10-23', 'Vacances'], ['2026-10-24', 'Vacances']]);
const kinds = ['Consultation', 'Suivi', 'Sans rendez-vous', 'Rendez-vous'];
const tones = ['red', 'blue', 'slate', 'amber'];
const events: EventInput[] = [{ id: 'vac', title: 'Vacances', start: '2026-10-23', end: '2026-10-25', allDay: true, display: 'background', tone: 'red' }];
let n = 0;
for (const day of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-09', '2026-10-12', '2026-10-13']) {
  for (let m = 8 * 60; m < 11 * 60; m += 30) {
    const k = n % 4;
    events.push({ id: `r${n++}`, title: kinds[k]!, start: `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}[${Z}]`, duration: { minutes: 30 }, tone: tones[k]! });
  }
}
// Patients still booked on a closed day: what the head counts.
events.push({ id: 'late', title: 'Consultation', start: `2026-10-23T09:00[${Z}]`, duration: { minutes: 30 }, tone: 'red' });

const cal = createCalendar(document.getElementById('cal')!, {
  timeZone: Z,
  locale: 'fr-FR',
  initialView: 'timeGridWeek',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  editable: true,
  selectable: true,
  events,
  eventStyle: 'solid',
  dayMaxLanes: null,
  allDaySlot: false,
  hooks: {
    event: { content: (c) => (c.background ? (() => { const s = document.createElement('span'); s.className = 'label'; s.textContent = c.instance.event.title; return s; })() : null) },
    dayHeader: {
      content: (d) => {
        const why = closed.get(String(d.date));
        if (!why) return null;
        const box = document.createElement('span');
        box.append(d.text);
        const mark = document.createElement('span');
        mark.className = 'mark';
        const left = events.filter((e) => e.display !== 'background' && String(e.start).startsWith(String(d.date))).length;
        mark.append(`Fermé · ${why}`);
        if (left > 0) {
          const b = document.createElement('button');
          b.textContent = ` ${left} à déplacer`;
          b.onclick = () => (log.textContent = `${left} patient(s) à déplacer le ${d.date}`);
          mark.append(' ', b);
        }
        box.append(mark);
        return box;
      },
    },
  },
  // What a person changed goes to "the server"; a drop at 12:00 is refused and taken back.
  onEventChange: (c) => {
    const at = c.after && 'start' in c.after ? String(c.after.start).slice(11, 16) : '';
    if (at === '12:00') {
      setTimeout(() => (log.textContent = `refusé par le serveur (pause déjeuner) : ${c.revert() ? 'remis en place' : 'déjà changé'}`), 300);
      log.textContent = `envoi… ${c.after?.title} à ${at}`;
    } else log.textContent = `enregistré : ${c.after?.title ?? c.before?.title} ${at}`;
  },
});
document.getElementById('style')!.onchange = (e) => cal.update({ eventStyle: (e.target as HTMLSelectElement).value as 'solid' | 'tinted' });
document.getElementById('allday')!.onchange = (e) => cal.update({ allDaySlot: (e.target as HTMLInputElement).checked });
document.getElementById('times')!.onchange = (e) => cal.update({ displayEventTime: (e.target as HTMLInputElement).checked });
Object.assign(window, { cal });
