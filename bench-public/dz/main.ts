import '../../packages/theme/dzcalendar.css';
import '@dzcalendar/dom/list';
import { Temporal } from '@dzcalendar/core';
import { createKernel } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance } from '@dzcalendar/dom';
import { frame } from '../shared/scenarios';
import type { Bench, BenchEvent } from '../shared/scenarios';
import { drawnHeight, events, shownEvents, DST_CASES } from '../shared/scenarios';

const el = document.getElementById('cal')!;
let cal: CalendarInstance | null = null;
let zone = 'UTC';
/** The kernel's part of the last mount: reading, checking and indexing the events. */
let kernelMs = 0;
/** `?axis=elapsed`: the time grid at the scale of real time (the default is the wall clock, the transition marked). */
const axis = new URLSearchParams(location.search).get('axis') === 'elapsed' ? ('elapsed' as const) : null;
const toDz = (e: BenchEvent) => (e.allDay ? { id: e.id, title: e.title, start: e.start, end: e.end, allDay: true, classNames: [`bench-${e.id}`] } : { id: e.id, title: e.title, start: `${e.start}[${zone}]`, end: `${e.end}[${zone}]`, classNames: [`bench-${e.id}`] });

const bench: Bench = {
  name: axis ? 'DzCalendar (elapsed axis)' : 'DzCalendar',
  async mount(m) {
    zone = m.zone;
    // The same limits as the other pages: 3 events a day in the month before "+N", none in the week.
    const t = performance.now();
    const kernel = createKernel({ timeZone: m.zone, locale: 'en-US', initialView: m.view, initialDate: Temporal.PlainDate.from(m.date.slice(0, 10)), ...(axis && { timeGrid: { axis } }), events: m.events.map(toDz) });
    kernelMs = performance.now() - t;
    cal = createCalendar(el, { kernel, editable: true, selectable: true, dayMaxLanes: 3, eventMaxStack: null });
    await frame();
  },
  async settled() {
    await cal!.kernel.whenLoaded();
  },
  async update(id, title, start, end) {
    cal!.run({ type: 'event.update', id, patch: { title, start: `${start}[${zone}]`, end: `${end}[${zone}]` } });
    await frame();
  },
  async next() {
    cal!.navigate('next');
    await frame();
  },
  destroy() {
    cal?.destroy();
    cal = null;
  },
};
Object.assign(window, { bench, events, DST_CASES, drawnHeight, shownEvents, kernelMs: () => kernelMs });

