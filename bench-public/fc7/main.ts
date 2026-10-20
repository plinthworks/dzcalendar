import 'fullcalendar/skeleton.css';
import 'fullcalendar/themes/classic/theme.css';
import 'fullcalendar/themes/classic/palette.css';
import { Calendar } from 'fullcalendar';
import themePlugin from 'fullcalendar/themes/classic';
import dayGridPlugin from 'fullcalendar/daygrid';
import timeGridPlugin from 'fullcalendar/timegrid';
import listPlugin from 'fullcalendar/list';
import interactionPlugin from 'fullcalendar/interaction';
import { frame } from '../shared/scenarios';
import type { Bench, BenchEvent } from '../shared/scenarios';
import { drawnHeight, events, shownEvents, DST_CASES } from '../shared/scenarios';

// Named zones built in since version 7, on temporal-polyfill (its documentation).
const el = document.getElementById('cal')!;
let cal: Calendar | null = null;
const toFc = (e: BenchEvent) => ({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: Boolean(e.allDay), className: `bench-${e.id}` });
// Version 7 takes `className`, a string (its migration guide).

const bench: Bench = {
  name: 'FullCalendar 7.1',
  async mount(m) {
    cal = new Calendar(el, { plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, themePlugin], timeZone: m.zone, locale: 'en', initialView: m.view, initialDate: m.date.slice(0, 10), editable: true, selectable: true, dayMaxEvents: 3, height: 800, events: m.events.map(toFc) });
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
