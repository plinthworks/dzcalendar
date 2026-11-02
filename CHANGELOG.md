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

- A view's days and fixed period (every day hidden, `hiddenDays` outside 1–7,
  a `visibleRange` that ends before it starts or shows no day) are refused
  when the calendar is made, for every view in `views` (18j-3, batch 2). A
  view not shown first was accepted and threw when first shown — from a
  header button's click.
- A `defineView` definition given under another name in `views` is that
  name's view (owner, 2026-11-01): its `type` replaced the key, so
  `view.type` was not the name given and its header button never showed
  pressed.
- `TimedEvent.zoneGuessed`'s description: a guessed zone is the calendar's
  when the event was read, kept after a zone change (it said the event
  followed the calendar). React's and Vue's `initial` no longer name
  `firstDay` and `rules` as read once: both are live.

- A source's event made a series (`event.repeat`), or a source's series made
  a single event (`series.rule` null), stays the source's: undo then redo
  works (redo failed), the source withdrawing the id takes it away (the series
  stayed for ever), the source delivering the id again wins (it was refused
  with `duplicate-id` and the id was lost to it), and a refetch while its save
  is out keeps it.
- `<dz-calendar>`'s `ready` is rejected, as `calendar.ready`, when the element
  gives up: options refused (their `RangeError`), Temporal's polyfill not
  loaded, an Angular `<dz-calendar>` already there. It never settled.
- A source failing while the calendar is made (a synchronous `fnSource` that
  throws) is announced: its notice reached `onSource` but not the live region.
- A series cut short in what is shown (more than 2 000 occurrences: a rule
  every minute, a year) is said (18j-3): `onProblem` receives
  `too-many-occurrences`, once a series, again if it comes back — without
  `onProblem`, the console once. It was cut in silence. `kernel.viewProblems()`
  holds what building the shown view had to say.
- Angular's `CalendarController` no longer throws when no `<dz-calendar>` is
  attached (before it is drawn, after it is destroyed): `dispatch` answers
  `{ ok: false, problems: [{ code: 'invalid-option', detail: 'not-mounted' }] }`,
  `undo`/`redo` `false`, the others do nothing — as React's and Vue's
  controllers (owner, 18j-3).

- A source's fetch is given the platform's `AbortSignal` in its types too
  (18j-3): `fnSource('id', ({ signal }) => fetch(url, { signal }))` compiles
  without a cast. `FetchRequest['signal']` is `AbortSignalLike &
  PlatformAbortSignal` (exported) — the platform's own `AbortSignal` wherever
  the application's types know one (the DOM lib, Node's types).

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

- A `CalendarProblem`'s `detail` is in the calendar's language (owner,
  2026-11-01): `DzMessages.problem(p)` (`ProblemWords`: `host-no-height`,
  `zone-from-browser`, `too-many-occurrences`, `events-not-drawn`), in
  English, French, Arabic, German and Spanish; a language of one's own
  defines it too (a full `DzMessages` needs the new member). The kernel's
  data problems keep an English `detail`. Budgets, owner: dom 59 224,
  locales ar 3 111, es 2 440, de 2 508.

- `icalSource` takes `staleAfter` and `retry`, as the other sources.
- A change of the calendar's zone asks again the sources whose answer depends
  on it: `zoneDependent` on a source spec, set by `jsonSource` when it sends
  the zone (owner, 2026-11-01); the events stay shown until the answer. It
  fetched nothing (`refetch()` was needed).

- `loadTemporal`, `temporalReady` (`@dzcalendar/core`); `calendar.ready`;
  `deferredCalendar` (`@dzcalendar/dom/toolkit`, for a package that makes a
  calendar its own way).
- Problem codes `calendar-not-ready`, `recurrence-not-loaded`; runtime
  problem `zone-from-browser` (no `timeZone` given).
- Entries `@dzcalendar/dom/base` (no view), `@dzcalendar/dom/timegrid`,
  `@dzcalendar/dom/daygrid` (18i-1); `@dzcalendar/dom` unchanged. A calendar
  with no view asked takes the first one imported.
