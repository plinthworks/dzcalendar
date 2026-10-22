# Behaviour sheet — moving an application from FullCalendar

What a developer does: hands DzCalendar the options object their
FullCalendar application already has. What they observe: the same calendar
(view, dates, events, editing, callbacks), each event in its zone, and a
list of what was guessed or has no equivalent. Written from FullCalendar's
public documentation (option names and what they do), in our own words.

## Where we differ on purpose

- **Zones.** A time without an offset or a zone is a wall time: it is read
  in the calendar's zone, and said (`zone-guessed`). A `Date` (or epoch
  milliseconds) is an instant. `timeZone: 'local'` is the browser's zone,
  said; `'UTC'` is UTC; an IANA name is itself.
- **Days of the week** count from Monday = 1 to Sunday = 7 (ISO); the other
  library counts Sunday = 0. Converted everywhere (`firstDay`, `hiddenDays`,
  `daysOfWeek`).
- **Colours** are not given per event: an event names a tone, themes decide
  its colour. A colour is kept in `extendedProps.color` and said.
- **Callbacks** receive plain objects (`event` with `id`, `title`, `start`,
  `end` as `Date`, `allDay`, `extendedProps`…), not live objects with
  methods; changing an event is a command (`calendar.run`).
- **A refused move** is undone through the history: `revert()` is an undo.
- **`eventDrop`, `eventResize`, `eventChange`** follow a person's change —
  a gesture, the keyboard, the menu, the editor — not the application's own
  `calendar.run`, a source's delivery nor an undo. An occurrence moved alone
  is the series' event (its id), dropped.
- **`jsEvent`** is a stand-in (`type`, `preventDefault`, `stopPropagation`):
  the calendar hands no native event to these callbacks. A click on an event
  with a `url` follows it unless `eventClick` returns `false` or calls
  `preventDefault()`.
- **`datesSet`**, `view.activeStart/End` are the grid shown (a month's
  padding days too); `currentStart/End` the period itself. `datesSet` is
  called once per view and dates.
- **`views: {…}`**: what concerns the first view (its family's entry, then
  its own) is laid over the options; the others are said (`per-view`).
- **A series without `startRecur`** runs from 3 January 2000 (theirs runs
  from always).
- **Nothing throws.** An option the calendar refuses is left out and said
  (`invalid-option`); a view that cannot be drawn is said with the import that
  draws it (`listWeek:@dzcalendar/dom/list`). The problems are written once
  to the console (`{ warn: false }` to stop it).
- **On a calendar that exists** (`applyFullCalendar`, the Angular directive):
  `initialView` / `initialDate` only the first time; events and sources are
  the options' (those no longer given go); `firstDay`, `rules`,
  `nowIndicator`, `scrollTime`, `dayMaxLanes`, `eventMaxStack` are made with
  the calendar and said (`at-creation`).

## The options

| What the application gives | What DzCalendar does |
|---|---|
| `initialView`, `initialDate` | the same (view names are shared) |
| `timeZone` | see Zones |
| `locale`, `direction` | the locale; right to left follows it (`direction` said if it disagrees) |
| `firstDay`, `weekends`, `hiddenDays` | the same, Monday = 1 |
| `events`, `eventSources` | arrays as events; a URL a JSON source (start/end/timeZone parameters); a function a source given the dates; `format: 'ics'` an iCalendar source |
| an event's `start`, `end`, `allDay`, `title`, `id`, `groupId`, `url`, `classNames`, `extendedProps`, `resourceId(s)`, `display`, `editable`… | the same fields |
| an event's `daysOfWeek` + `startTime` / `endTime` / `startRecur` / `endRecur` | a weekly series (RRULE) |
| an event's `rrule` (text or object), `duration`, `exdate` | a series |
| `editable`, `selectable` | the same |
| `eventStartEditable`, `eventDurationEditable`, `eventResourceEditable` | per event (`startEditable`…) on every event |
| `slotMinTime`, `slotMaxTime`, `scrollTime`, `snapDuration` | the time grid's hours, the first scroll, the snap |
| `slotDuration` | the time grid's slot |
| `businessHours` | the same shape, days converted |
| `eventConstraint`, `eventOverlap`, `eventAllow`, `selectAllow`, `validRange` | the rules (`constraint`, `overlap`, `allow`, `validRange`) |
| `nowIndicator`, `weekNumbers`, `dayMaxEventRows` / `dayMaxEvents`, `eventMaxStack` | the same (lanes, stack) |
| `allDaySlot`, `displayEventTime` | the same |
| `titleFormat`, `dayHeaderFormat`, `slotLabelFormat`, `eventTimeFormat`, `listDayFormat`, `listDaySideFormat`, `dayPopoverFormat` | `formats` (their own keys and format functions said) |
| `views: { x: { type, duration, dayCount, dateIncrement, visibleRange } }`, `visibleRange` | custom views by settings (`docs/custom-views.md`); a function `visibleRange` and `buttonText` said |
| `droppable`, `drop`, `eventReceive`, `eventLeave`; their `Draggable` | the same, their arguments rebuilt; `Draggable` from the compat (`docs/behaviors/external-drag.md`) |
| `headerToolbar`, `customButtons` | kept whole (`left` / `right`: `start` / `end`; `false`: no header); `prevYear` / `nextYear` said and left out; a button's `icon` becomes the class `fc-icon fc-icon-<name>` (docs/behaviors/header-toolbar.md) |
| `resources`, `resourceGroupField`, `resourceOrder`, `resourceAreaColumns` | the same (nested `children` flattened with their parent) |
| `<name>ClassNames`, `<name>Content`, `<name>DidMount`, `<name>WillUnmount` (event, dayHeader, dayCell, slotLabel, slotLane, allDay, moreLink, dayPopover, nowIndicator, weekNumber, noEvents, view, resourceLabel, resourceLane, resourceGroupLabel, resourceGroupLane, resourceAreaHeader) | the render hooks, their arguments rebuilt (docs/behaviors/render-hooks.md) |
| `eventClick`, `dateClick`, `select`, `unselect`, `datesSet`, `loading` | called with the same information |
| `eventDrop`, `eventResize`, `eventChange`, `eventAdd`, `eventRemove` | called after a person's change, with `revert()` |
| `eventStartEditable`, `eventDurationEditable`, `eventResourceEditable`, `eventClassNames`, `eventDisplay` | on every event that does not say, sources' too |
| `height`, `contentHeight`, `aspectRatio` | said: the height is CSS (`--dz-height`) |
| `eventColor` and its kind, the `…Format` options | said: tones (`tone`), the locale's formats (`locale`) |
| `plugins`, `schedulerLicenseKey`, `themeSystem` | nothing to do (everything is built in, the theme is ours) |
| anything else | said: no equivalent (`compat-unsupported`) |
