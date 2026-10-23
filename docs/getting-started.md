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
import { Temporal, loadTemporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
// Repeating events (the `rrule` below): their engine, imported once by an application that has them.
import '@dzcalendar/core/recurrence';

// At once where the browser has Temporal (Chrome, Edge, Firefox); Safari fetches its polyfill first.
await loadTemporal();

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
  path, detail }` (`missing-start`, `unknown-zone`, `zone-defaulted`…) for the
  last load of events; a source's are in its `problems` notice. Options are
  the exception: `createCalendar` and `update` throw a `RangeError` on one
  they cannot take (an unknown view), and change nothing.
- **Sources** fetched as the calendar moves:
  `jsonSource('api', { url: '/events' })` (sends `start`, `end`,
  `timeZone`), `fnSource('fn', async ({ window }) => […])`, iCalendar with
  `@dzcalendar/ical`.

## Many events

Up to 2 000 events, the `events` option is read, checked and indexed when
the calendar is created. Above that, the calendar does the shown period (and a
week either side) first and the other weeks while the page is idle, nearest
first: it is on screen sooner, and nothing else changes —

- showing a period not loaded yet loads the weeks it needs at once (another
  calendar sharing the store too); reading `calendar.kernel.store` (an
  export, a search, the first drag), running a command or an undo finishes
  the rest first, so they always see every event;
- `setEvents` returns the shown period's report; when the rest is in, its
  problems (if any) come through `onSource` (`{ type: 'problems', sourceId:
  'events' }`, the whole report) and `kernel.getProblems()` holds all of them;
- `await calendar.kernel.whenLoaded()` waits for everything — a fraction of
  a second on a quiet page, longer on a page kept busy (a slice at least every
  second).

## Worth knowing

- **Temporal from the browser.** Where the browser has its own (Chrome and
  Edge 144, Firefox 139), nothing more is loaded; where it has none (Safari,
  every iOS browser), `loadTemporal()` fetches the polyfill (≈ 25 kB gzipped)
  once. Await it before the application's first Temporal value — reading
  `Temporal` sooner there throws a `ReferenceError` saying so. A calendar
  created sooner waits by itself: `calendar.ready` resolves once it is drawn;
  meanwhile `update`, `navigate`, `select` and `refetch` wait in line, `run`
  refuses (`calendar-not-ready`) and reading `kernel` throws. `<dz-calendar>`,
  React, Vue and the FullCalendar translation wait too (`<dz-calendar>` has
  `ready`), and so does Angular's `<dz-calendar>`; `provideDzCalendar()`
  holds the application's start instead, so nothing waits once it runs. What takes a calendar (the
  Pro editor, the exports) takes it drawn: after `ready`. A polyfill that
  cannot be fetched is said on the console (`temporal-load-failed`).
  A top-level `await` needs a build target that has it (Vite 7's default;
  `build.target: 'es2022'` with Vite 6), or `loadTemporal().then(start)`.
- **Paid for only when used.** Repeating events need `import
  '@dzcalendar/core/recurrence'` once (without it, an event with `rrule` is
  refused with the problem `recurrence-not-loaded`; `@dzcalendar/ical` and the
  FullCalendar translation bring it themselves). `@dzcalendar/dom` has the time
  grid and the day grid; `@dzcalendar/dom/base` has no view, and
  `@dzcalendar/dom/timegrid`, `/daygrid`, `/list`, `/multimonth` add each
  (a view not imported is said with its import).

- **The box is given, never measured.** The calendar is as tall as
  `--dz-height` says (40rem by default). `--dz-height: 100%` is 100% of its
  host's height: the host needs one of its own (or `height: 100%` all the
  way up); without it, the calendar grows with its hours and draws over the
  page — it says so (`onProblem`, `host-no-height`).
  `<dz-calendar>` is a block.
- **Problems while drawing** come to `onProblem(problem)` (`{ code, detail,
  element }`), or to the console once per code without it:
  `events-not-drawn` (all-day events in a time grid with `allDaySlot:
  false` — an all-day background still washes its columns — and timed events
  entirely outside `slotMin`–`slotMax`), `host-no-height`, `zone-from-browser`
  (no `timeZone` given: the device's is used — a phone set to Tokyo draws
  Algiers' 14:00 at 22:00; pass `timeZone`). Each is told once,
  and again if it comes back after going away. In the wrappers: React
  `onProblem`, Angular `(problem)` (also on the console), Vue `@problem`.
- **Who may change an event**: `editable` is the calendar's default; an
  event's own `editable`, `startEditable` or `durationEditable` wins over it.
  A `true` of its own makes it editable that way in a calendar that is not
  (`durationEditable: true` alone: resized, not moved; deleted only with
  `editable: true`); it then carries `data-editable` (`move`, `resize`), has
  its menu entries as far as it said, and may be dropped on another
  calendar. Ctrl+Z stays the editable calendar's.
- **The month shows every event** by default (the weeks grow); a year's
  tiny days show what fits, then "+N". `dayMaxLanes: 'auto'` (or a number)
  for "+N" in a month too — the right choice for a very crowded one.
- **The hours' labels** (a time grid's): one a whole hour; `timeGrid: {
  labelMinutes: 30 }` for every half hour (`slotMinutes` sets the ticks; a
  label falls on a tick, so take a multiple of it). Every tick carries
  `data-time`. A timeline's heads have their own scale (`timeline.slot`).
- **Structure**: a resize grip is the event's `::after` (6 px; no node);
  in a month, bars are children of the week's row, not of the day's cell
  (`grid-column`); a time grid's columns and day heads both carry
  `data-date`; events come in with `extendedProps` and are read back as
  `props`. Templates for a month's day cell and for the hours' labels exist:
  `hooks.dayCell` and `hooks.slotLabel` (`dzDayCell` / `dzSlotLabel` in
  Angular, `renderDayCell` / `renderSlotLabel` in React, `#day-cell` /
  `#slot-label` slots in Vue).

## Then

- Frameworks: `docs/angular.md`, `docs/react.md`, `docs/vue.md`, the Web
  Component `docs/element.md`.
- Resources (a column per doctor), the timeline (Pro), bookable slots,
  the editor, printing and exports, motion, languages, theming: the other
  files in `docs/`.
- Moving from FullCalendar: `docs/migrating-from-fullcalendar.md`.
