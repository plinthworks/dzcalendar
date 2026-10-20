import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import { frame } from '../shared/scenarios';
import type { Bench, BenchEvent } from '../shared/scenarios';
import { drawnHeight, events, shownEvents, DST_CASES } from '../shared/scenarios';

// Named zones need the Luxon connector in version 6 (its documentation).
const el = document.getElementById('cal')!;
let cal: Calendar | null = null;
const toFc = (e: BenchEvent) => ({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: Boolean(e.allDay), classNames: [`bench-${e.id}`] });

const bench: Bench = {
  name: 'FullCalendar 6.1',
  async mount(m) {
    cal = new Calendar(el, { plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin], timeZone: m.zone, locale: 'en', initialView: m.view, initialDate: m.date.slice(0, 10), editable: true, selectable: true, dayMaxEvents: 3, height: 800, events: m.events.map(toFc) });
    cal.render();
    await frame();
  },
  async update(id, title, start, end) {
    const ev = cal!.getEventById(id)!;
    ev.setProp('title', title);
    ev.setDates(start, end);
    await frame();
  },
  async next() {
    cal!.next();
    await frame();
  },
  destroy() {
    cal?.destroy();
    cal = null;
  },
};
Object.assign(window, { bench, events, DST_CASES, drawnHeight, shownEvents });
