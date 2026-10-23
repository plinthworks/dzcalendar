// Phase 18k: each point of Sehhaty's report (retours/2026-10-23-sehhaty.md) on a calendar of its own, for scripts/browser.mjs.
import './prelude';
import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarOptions, CalendarProblem } from '@dzcalendar/dom';
import '@dzcalendar/pro';

const Z = 'Africa/Algiers';
const base = { timeZone: Z, locale: 'fr-FR', initialDate: Temporal.PlainDate.from('2026-10-21'), now: () => Temporal.Instant.from('2026-10-21T09:10:00Z') };
const problems: CalendarProblem[] = [];
const make = (id: string, opts: Partial<CalendarOptions>, boxed = true) => {
  const el = document.createElement('div');
  el.id = id;
  if (boxed) el.className = 'box';
  document.getElementById('main')!.append(el);
  return createCalendar(el, { ...base, onProblem: (p) => problems.push(p), ...opts } as CalendarOptions);
};
const at = (d: string, t: string) => `2026-10-${d}T${t}[${Z}]`;
// A crowded all-day row (it scrolls), a timed event below it: a drag down must stay timed.
const allDay = Array.from({ length: 14 }, (_, i) => ({ id: `ad${i}`, title: `Journée ${i}`, start: '2026-10-19', end: '2026-10-26', allDay: true }));
const cals = {
  drag: make('drag', { initialView: 'timeGridWeek', editable: true, scrollTime: { hours: 8 }, events: [...allDay, { id: 'moved', title: 'À déplacer', start: at('21', '08:30'), duration: { minutes: 30 } }] }),
  closed: make('closed', { initialView: 'timeGridWeek', allDaySlot: false, events: [{ id: 'closed', start: '2026-10-22', end: '2026-10-24', allDay: true, display: 'background', classNames: ['sl-overlay-blocked'] }] }),
  labels: make('labels', { initialView: 'timeGridDay', timeGrid: { slotMin: { hours: 8 }, slotMax: { hours: 12 }, slotMinutes: 15, labelMinutes: 30 } }),
  month: make('month', { initialView: 'dayGridMonth', events: [{ id: 'bg', start: '2026-10-22', end: '2026-10-23', allDay: true, display: 'background' }, ...Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, title: `RDV ${i}`, start: at('21', `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`), duration: { minutes: 30 } }))] }),
  own: make('own', { initialView: 'timeGridWeek', editable: false, scrollTime: { hours: 8 }, events: [{ id: 'mine', title: 'Étirable', start: at('21', '09:00'), duration: { minutes: 30 }, durationEditable: true }, { id: 'other', title: 'Fixe', start: at('21', '11:00'), duration: { minutes: 30 } }] }),
  timeline: make('timeline', { initialView: 'resourceTimelineDay', resources: [{ id: 'a', title: 'Dre A' }], events: [{ id: 't', start: at('21', '09:00'), duration: { hours: 1 }, resourceId: 'a' }] }),
};
// A calendar whose height comes from its content: `--dz-height: 100%` under an ancestor of no height.
const loose = document.createElement('div');
loose.id = 'loose';
loose.style.setProperty('--dz-height', '100%');
document.getElementById('main')!.append(loose);
const looseCal = createCalendar(loose, { ...base, initialView: 'timeGridDay', onProblem: (p) => problems.push(p) } as CalendarOptions);
Object.assign(window, { cals: { ...cals, loose: looseCal }, problems, ready: true });
