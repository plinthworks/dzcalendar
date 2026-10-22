# Getting started — `@dzcalendar/core`, `@dzcalendar/dom`

A calendar and scheduler on Temporal: every event keeps its own time zone,
and days of 23 h, 25 h or 23 h 30 are shown for what they are — the hour that
does not exist marked, the repeated hour shown twice, real lengths said (and
drawn to scale with `timeGrid: { axis: 'elapsed' }`). No `Date` anywhere:
moments are Temporal values or ISO 8601 strings with IANA zones.

```sh
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme
```

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';

const calendar = createCalendar(document.getElementById('agenda')!, {
  timeZone: 'Europe/Paris',          // the zone the calendar is drawn in
  locale: 'fr-FR',
  initialView: 'timeGridWeek',       // dayGridMonth, timeGridWeek, timeGridDay, listWeek (import '@dzcalendar/dom/list')…
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  editable: true,
  selectable: true,
  events: [
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
    // Its own zone: drawn at 17:00 in Paris.
    { id: 'b', title: 'Call Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
    { id: 'c', title: 'Day off', start: '2026-10-23', allDay: true },
    { id: 'w', title: 'Rounds', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
  ],
  onEventClick: (instance) => console.log(instance.event.title, String(instance.event.start)),
  onSelect: (selection) => console.log(String(selection.start), String(selection.end)),
});
```

## What it gives

- **`calendar.run(command)`** — every change is a command, plain data
  (`site/commands.schema.json`; in the published package
  `@dzcalendar/core/commands.schema.json`). It returns `{ ok: true }` or
  `{ ok: false, problems, violations? }` — a refused command never throws:
  `{ type: 'event.move', id: 'a', start: '2026-10-22T10:00[Europe/Paris]' }`,
  `event.create`, `event.update`, `event.resize`, `event.delete`,
  `series.delete`, `series.split`, `series.rule`, `event.repeat`, `batch`.
  A person's drag, resize or menu choice is the same commands.
  `calendar.undo()` / `calendar.redo()`.
- **`calendar.update({ … })`** — what can change live: view, date, zone,
  locale, events, sources, resources, business hours, hidden days, theme…
  A refused value throws a `RangeError` and changes nothing.
- **The header**: `headerToolbar: { start: 'prev,next today', center:
  'title', end: 'reload dayGridMonth,timeGridWeek' }` (a space between
  groups, a comma inside one; `false`: none) and the application's buttons,
  `customButtons: { reload: { text, hint?, icon?, click, active? } }`
  (`docs/behaviors/header-toolbar.md`).
- **Formats**: `formats: { slotLabel: { hour: 'numeric' }, title: (t) => … }`
  — each place written with the platform's options or a function
  (`docs/behaviors/formats.md`).
- **Custom views**: `views: { congres: { family: 'timeGrid', visibleRange:
  { start, end } } }` and more (`docs/custom-views.md`).
- **Dragging in** (`import { makeDraggable } from '@dzcalendar/dom/drag'`): `makeDraggable(card, { event: { title, duration },
  data })` and `droppable: true`, `onDrop`, `onEventReceive` (with
  `revert()`); an event dragged between two calendars, `onEventLeave` on
  the one it left; a keyboard path for all of it
  (`docs/behaviors/external-drag.md`).
- **Render hooks**: `hooks.<element>` — `class`, `content`, `didMount`,
  `willUnmount` — on events, days, hours, "+N", the now line, resources…
  (`docs/behaviors/render-hooks.md`).
- **`calendar.navigate('prev' | 'next' | 'today')`**, `calendar.select(…)`,
  `calendar.refetch()`, `calendar.destroy()`.
- **`calendar.kernel`** — the model without the screen: `getState()` (view,
  date, range, title), `store.snapshot` (events, occurrences),
  `getProblems()`.
- **Bad data never throws**: an event that cannot be read is left out and
  said — `calendar.kernel.getProblems()?.problems` lists `{ code, severity,
  path, detail }` (`missing-start`, `unknown-zone`, `zone-guessed`…) for the
  last load of events; a source's are in its `problems` notice. Options are
  the exception: `createCalendar` and `update` throw a `RangeError` on one
  they cannot take (an unknown view), and change nothing.
- **Sources** fetched as the calendar moves:
  `jsonSource('api', { url: '/events' })` (sends `start`, `end`,
  `timeZone`), `fnSource('fn', async ({ window }) => […])`, iCalendar with
  `@dzcalendar/ical`.

## Then

- Frameworks: `docs/angular.md`, `docs/react.md`, `docs/vue.md`, the Web
  Component `docs/element.md`.
- Resources (a column per doctor), the timeline (Pro), bookable slots,
  the editor, printing and exports, motion, languages, theming: the other
  files in `docs/`.
- Moving from FullCalendar: `docs/migrating-from-fullcalendar.md`.
