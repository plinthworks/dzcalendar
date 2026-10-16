import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import { createCalendar, NO_MOTION } from '@dzcalendar/dom';
import { createGsapMotion } from '@dzcalendar/motion-gsap';
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
    timeGrid: { axis, slotMinutes: 60 },
    businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
    onCreateRequest: (r) =>
      say(r.allDay ? `Nouvel événement demandé le ${r.start.toString()} (journée)` : `Nouvel événement demandé à ${r.start.toZonedDateTimeISO(zoneSelect.value).toString({ smallestUnit: 'minute' })}`),
    onEventOpen: (inst) => say(`Ouvrir « ${inst.event.title} »`),
    motion: (document.querySelector<HTMLInputElement>('#motion')!).checked ? createGsapMotion() : NO_MOTION,
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
document.querySelector<HTMLInputElement>('#motion')!.addEventListener('change', (e) => {
  cal.update({ motion: (e.target as HTMLInputElement).checked ? createGsapMotion() : NO_MOTION });
});
