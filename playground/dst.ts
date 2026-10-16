import '../packages/theme/dzcalendar.css';
import { Temporal, createEventStore, createKernel, loadStaticSource, arraySource, createIdGenerator } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import { createGsapMotion } from '@dzcalendar/motion-gsap';
import { DEMO_EVENTS } from './demo-events';

const store = createEventStore();
loadStaticSource(store, arraySource('demo', DEMO_EVENTS), { displayZone: 'UTC', newId: createIdGenerator('d') });

const zones = [
  ['Paris', 'Europe/Paris'],
  ['Chicago', 'America/Chicago'],
  ['Lord Howe (30 min)', 'Australia/Lord_Howe'],
  ['Sydney', 'Australia/Sydney'],
] as const;

const weeks = [
  ['Paris recule (25 oct. 2026)', '2026-10-25'],
  ['Chicago recule (1er nov. 2026)', '2026-11-01'],
  ['Lord Howe avance de 30 min (4 oct. 2026)', '2026-10-04'],
  ['Paris avance (29 mars 2026)', '2026-03-29'],
] as const;

const grid = document.querySelector<HTMLElement>('#grid')!;
const calendars = zones.map(([label, zone]) => {
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  const host = document.createElement('div');
  fig.append(cap, host);
  grid.append(fig);
  const kernel = createKernel({ timeZone: zone, locale: 'fr-FR', store, initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-25'), timeGrid: { slotMinutes: 60 } });
  return createCalendar(host, { kernel, motion: createGsapMotion(), scrollTime: 'PT0H' });
});

const bar = document.querySelector<HTMLElement>('#weeks')!;
for (const [label, date] of weeks) {
  const b = document.createElement('button');
  b.className = 'dz-toolbar__btn';
  b.textContent = label;
  b.addEventListener('click', () => calendars.forEach((c) => c.update({ date: Temporal.PlainDate.from(date) })));
  bar.append(b);
}
