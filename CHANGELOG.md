# Changes

## Unreleased

### Breaking

- **Temporal is loaded where it is missing** (18i-2). DzCalendar takes
  Temporal from `@tzslot/core/lazy` (`@tzslot/core` ^2.3.0): the browser's own
  where it has one (Chrome and Edge 144, Firefox 139), its polyfill fetched by
  `loadTemporal()` where it has none (Safari, every iOS browser).
  - Await `loadTemporal()` (from `@dzcalendar/core`) before the application's
    first Temporal value. Reading `Temporal` sooner, on such a browser, throws
    a `ReferenceError` naming `loadTemporal`.
  - `createCalendar` called sooner returns a calendar that waits:
    `calendar.ready` resolves once it is drawn; `update`, `navigate`,
    `select`, `refetch`, `onDestroy` and `destroy` wait in line; `run`
    refuses with `calendar-not-ready`; `undo`/`redo` return `false`; reading
    `kernel` or `element` throws. An option it cannot take rejects `ready`
    (with the `RangeError` thrown at once elsewhere) and is said on the
    console. The Pro editor and exports take a drawn calendar: after `ready`.
  - Angular: `provideDzCalendar()` (its defaults now optional) holds the
    application's start until Temporal is there; without it, a
    `<dz-calendar>` waits by itself.
  - `<dz-calendar>`, Angular's, React's and Vue's components, and the FullCalendar
    translation (`createFromFullCalendar`, `applyFullCalendar`) wait by
    themselves; `<dz-calendar>` has `ready`.
  - A polyfill that cannot be fetched is said on the console
    (`temporal-load-failed`); the calendar is not drawn.
  - `DEFAULT_TIMED_DURATION` and `DEFAULT_ALL_DAY_DURATION` are plain frozen
    durations (`{ hours: 1 }`, `{ days: 1 }`), no longer `Temporal.Duration`:
    `Temporal.Duration.from(DEFAULT_TIMED_DURATION)` where one is needed.
- **Repeating events are an entry** (18i-1): `import
  '@dzcalendar/core/recurrence'` once in the application. Without it an event
  with `rrule` is refused with `recurrence-not-loaded` (said once on the
  console). `@dzcalendar/ical`, the FullCalendar translation, the Pro editor
  and `<dz-calendar>` bring it themselves. `useRecurrence` is exported for
  tests only.
- `createDayGridView` moved from `@dzcalendar/dom/toolkit` to
  `@dzcalendar/dom/daygrid` (18i-1).

### Fixed

- The Pro editor takes tzslot's widgets from `@tzslot/dom/lazy` (`@tzslot/dom`
  ^2.4.0): the Temporal polyfill is no longer in its chunk for every browser.

- Angular: `<dz-calendar>` makes its calendar once its inputs are bound: a
  `timeZone` input no longer says `zone-from-browser`, `scrollTime` in
  `[options]` scrolls the first grid, the first view and date are the
  calendar's from its first paint.
- `createCalendar` checks `firstDay` and `hiddenDays` as `update()` does (a
  week with no day, a weekday outside 1–7: `RangeError`).
- `messages: { views }` keeps the built-in views' labels beside the ones given.
- A click on time (`onDateClick`) gives the slot's start on `snapMinutes`
  (10:37 → 10:30), as the context menu and the keyboard do.
- Angular: "Open", "New event here" and clickable bookable slots are offered
  only when `(eventOpen)`, `(createRequest)` or `(slotClick)` is listened to.
- An event moved between two calendars: its revert takes both sides back or
  neither (it could end on neither).
- A context-menu command refused is said to screen readers, as other refusals.
- An event's own `editable: false` is no longer deletable in an editable
  calendar (the context menu and the Delete key).
- Enter gives the selection being made to the application on a month day that
  holds events (it went into the events).
- `timeGrid.slotMin` / `slotMax` are checked at `createCalendar` and `update()`
  (merged with what is there), not when a week is first drawn.
- A header view without its renderer is said once on the console, not at
  each new layout.
- Vue: a bare `business-hours` attribute is `true` (it was an empty string, refused).
- `resourceOrder`: an absent value goes last in a descending order too; a
  comparison that throws puts the whole tree in input order (not half
  sorted), and `update({ resourceOrder })` says it through
  `onResourceProblems`.

### Added

- `loadTemporal`, `temporalReady` (`@dzcalendar/core`); `calendar.ready`;
  `deferredCalendar` (`@dzcalendar/dom/toolkit`, for a package that makes a
  calendar its own way).
- Problem codes `calendar-not-ready`, `recurrence-not-loaded`; runtime
  problem `zone-from-browser` (no `timeZone` given).
- Entries `@dzcalendar/dom/base` (no view), `@dzcalendar/dom/timegrid`,
  `@dzcalendar/dom/daygrid` (18i-1); `@dzcalendar/dom` unchanged. A calendar
  with no view asked takes the first one imported.
