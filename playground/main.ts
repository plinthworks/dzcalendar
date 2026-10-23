import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import { createCalendar, NO_MOTION } from '@dzcalendar/dom';
import '@dzcalendar/dom/list';
import '@dzcalendar/dom/multimonth';
import { createGsapMotion } from '@dzcalendar/motion-gsap';
import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { WAAPI_MOTION } from '@dzcalendar/dom';

/** The motion picked on the page. */
const motionOf = (v: string) => (v === 'none' ? NO_MOTION : v === 'waapi' ? WAAPI_MOTION : createGsapMotion({ preset: v === 'expressive' ? 'expressive' : 'sober', plugins: { InertiaPlugin, ScrollToPlugin } }));
import { DEMO_EVENTS } from './demo-events';

const zones = ['Europe/Paris', 'America/Chicago', 'Asia/Tokyo', 'Australia/Lord_Howe', 'UTC'];
const zoneSelect = document.querySelector<HTMLSelectElement>('#zone')!;
zoneSelect.append(...zones.map((z) => new Option(z, z)));
const host = document.querySelector<HTMLElement>('#cal')!;
const status = document.querySelector<HTMLElement>('#status')!;
const say = (text: string) => (status.textContent = text);

let cal = make('wall');

function make(axis: 'wall' | 'elapsed') {
  return createCalendar(host, {
    timeZone: zoneSelect.value,
    locale: 'fr-FR',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    events: DEMO_EVENTS,
    headerViews: ['multiMonthYear', 'dayGridMonth', 'timeGridWeek', 'timeGridDay', 'listWeek'],
    // The month's "+N" shown here (every event is the default since 18k).
    dayMaxLanes: 'auto',
    weekNumbers: (document.querySelector<HTMLInputElement>('#weeknums')?.checked) ?? false,
    timeGrid: { axis, slotMinutes: 60 },
    businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
    onCreateRequest: (r) =>
      say(r.allDay ? `Nouvel événement demandé le ${r.start.toString()} (journée)` : `Nouvel événement demandé à ${r.start.toZonedDateTimeISO(zoneSelect.value).toString({ smallestUnit: 'minute' })}`),
    onEventOpen: (inst) => say(`Ouvrir « ${inst.event.title} »`),
    editable: true,
    selectable: true,
    onSelect: (sel) => say(`Sélection : ${sel.start.toString()} → ${sel.end.toString()}`),
    // In the month, a day opens into its day (the morph).
    onDateClick: (c) => {
      if (c.allDay && cal.kernel.getState().view.family === 'dayGrid') return cal.update({ view: 'timeGridDay', date: c.date });
      say(c.allDay ? `Clic sur le ${c.date.toString()}` : `Clic à ${c.instant.toZonedDateTimeISO(zoneSelect.value).toString({ smallestUnit: 'minute' })}`);
    },
    // A demo rule: nothing may land on a Saturday (the drop is refused, animated back).
    rules: { allow: (p) => (p.start instanceof Temporal.PlainDate ? p.start : p.start.withTimeZone(zoneSelect.value).toPlainDate()).dayOfWeek !== 6 },
    onCommandRefused: (r) => say(`Refusé : ${[...r.problems.map((p) => p.code), ...('violations' in r && r.violations ? r.violations.map((v) => v.code) : [])].join(', ')}`),
    motion: motionOf(document.querySelector<HTMLSelectElement>('#motion')!.value),
  });
}

// For the browser checks (npm run test:browser): the live calendar.
(window as unknown as { __dz: () => typeof cal }).__dz = () => cal;

zoneSelect.addEventListener('change', () => cal.update({ timeZone: zoneSelect.value }));
document.querySelector<HTMLSelectElement>('#axis')!.addEventListener('change', (e) => {
  const date = cal.kernel.getState().date;
  cal.destroy();
  cal = make((e.target as HTMLSelectElement).value as 'wall' | 'elapsed');
  cal.update({ date });
});
document.querySelector<HTMLSelectElement>('#theme')!.addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  if (v) document.documentElement.dataset['theme'] = v;
  else delete document.documentElement.dataset['theme'];
});
document.querySelector<HTMLSelectElement>('#motion')!.addEventListener('change', (e) => cal.update({ motion: motionOf((e.target as HTMLSelectElement).value) }));
document.querySelector<HTMLInputElement>('#weeknums')?.addEventListener('change', (e) => cal.update({ weekNumbers: (e.target as HTMLInputElement).checked }));
document.querySelector<HTMLInputElement>('#weekends')?.addEventListener('change', (e) => cal.update({ weekends: (e.target as HTMLInputElement).checked }));
// The checks slow the clock down to look at a motion half-way.
(window as unknown as { __gsap: typeof gsap; __cal: () => typeof cal }).__gsap = gsap;
(window as unknown as { __cal: () => typeof cal }).__cal = () => cal;

