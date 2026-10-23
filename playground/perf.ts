import './prelude';
import '../packages/theme/dzcalendar.css';
import { Temporal, arraySource, createEventStore, createIdGenerator, loadStaticSource } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/dom/list';
import '@dzcalendar/dom/multimonth';
import '@dzcalendar/pro';

/**
 * The measuring page (ARCHITECTURE G.2/G.3): U = n events over twelve months,
 * W = n events in one week (the worst case). `window.__perf` holds the first
 * render's time and the DOM node count once drawn.
 */
const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'timeGridWeek';
const set = q.get('set') ?? 'W';
const n = Number(q.get('n') ?? 10000);
// `stack=none`: every overlapping event side by side; `minute=3`: a taller grid (what windowing is for).
const stack = q.get('stack') === 'none' ? null : 'auto';
// `res=500`: that many resources, the events spread over them (a timeline's G.2 case).
const res = Number(q.get('res') ?? 0);
if (q.get('minute')) document.documentElement.style.setProperty('--dz-minute', `${Number(q.get('minute'))}px`);

function events(): EventInput[] {
  const out: EventInput[] = [];
  let seed = 7;
  const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const first = Temporal.PlainDate.from(set === 'W' ? '2026-10-19' : '2026-01-01');
  const days = set === 'W' ? 7 : 365;
  for (let i = 0; i < n; i++) {
    const date = first.add({ days: Math.floor(r() * days) });
    if (r() < 0.1) out.push({ id: `e${i}`, title: `Journée ${i}`, start: String(date), end: String(date.add({ days: 1 + Math.floor(r() * 2) })) });
    else {
      const h = String(Math.floor(r() * 24)).padStart(2, '0');
      out.push({ id: `e${i}`, title: `Événement ${i}`, start: `${date}T${h}:${r() < 0.5 ? '00' : '30'}[Europe/Paris]`, duration: { minutes: 30 + 30 * Math.floor(r() * 4) } });
    }
  }
  return res > 0 ? out.map((e, i) => ({ ...e, resourceId: `r${i % res}` })) : out;
}

const data = events();
// The store is filled first: what is measured below is the drawing alone.
const l0 = performance.now();
const store = createEventStore();
loadStaticSource(store, arraySource('events', data), { displayZone: 'Europe/Paris', newId: createIdGenerator('p') });
const load = Math.round(performance.now() - l0);
const t0 = performance.now();
const cal = createCalendar(document.querySelector<HTMLElement>('#cal')!, {
  timeZone: 'Europe/Paris',
  locale: 'fr-FR',
  initialView: view,
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  store,
  editable: true,
  eventMaxStack: stack,
  // The crowded month's "+N" is what is measured (every event is the default since 18k).
  dayMaxLanes: 'auto',
  ...(res > 0 && { resources: Array.from({ length: res }, (_, i) => ({ id: `r${i}`, title: `Resource ${i}` })) }),
});
const sync = performance.now() - t0;
let frame1 = 0;
requestAnimationFrame(() => {
  frame1 = Math.round(performance.now() - t0);
  requestAnimationFrame(() => {
    const total = performance.now() - t0;
    const nodes = document.querySelectorAll('#cal *').length;
    const events = document.querySelectorAll('#cal .dz-ev, #cal .dz-bar, #cal .dz-list__ev, #cal .dz-tl__ev').length;
    const perf = { view, set, n, load, sync: Math.round(sync), frame1, firstFrame: Math.round(total), nodes, events };
    (window as unknown as { __perf: unknown; __dz: unknown }).__perf = perf;
    (window as unknown as { __dz: unknown }).__dz = cal;
    document.querySelector('#out')!.textContent = JSON.stringify(perf);
  });
});
