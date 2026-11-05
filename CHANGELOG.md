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

- A view's `dateIncrement: { minutes: 15 }` (or a `duration` in hours) was
  taken and did nothing: a date plus minutes is the same date. A view's
  `duration` and `dateIncrement` are now whole days or more, anything else a
  `RangeError` naming the timeline's `step`.
- Tailwind CSS 3: the recipe `@tailwind base;` then
  `@import '@dzcalendar/theme/tailwind3.css';` left the calendar's CSS out of
  the build without a word (an `@import` after another rule is dropped;
  checked with Tailwind 3.4.17: 0 rules of the calendar). The recipe is the
  three parts of Tailwind as imports, the theme after the base
  (`tailwind3.css`'s header, docs, guide) (18j-3, batch 4).
- `tailwind-theme.css`: outside a calendar the utilities skipped the page's
  shared `--tz-*` palette; `bg-dz-raised` fell back to `Canvas` (the
  calendar's `ButtonFace`) and `border-dz-line` to the full border colour
  (the calendar's lines are at 70 %). They fall back as the calendar does.
- The Pro's timeline and editor sheets were outside the cascade layers and
  appended last: they beat a page's own rules of equal weight, against the
  promise that a page's unlayered rule always wins. They are in
  `dzcalendar.base`; the editor's follows the calendar's `cssLayers` (it was
  always layered).
- A `defineTheme` family had none of the standard family's values (owner,
  2026-11-04: it builds on it): the named tones (`green`, `red`…) were gone,
  the text on a solid event fell to the background colour, and what it left
  out fell to system colours, while its JSDoc said "keeps the theme's value".
  With the theme's CSS, the standard family is on every calendar and a
  family's rules each have one attribute more: what a family gives wins, what
  it leaves out is standard's (checked in Chrome: light, dark, a page's
  `data-theme`, a light page over a dark system).
- `look: 'none'` kept no alignment (owner): slots, "+N" and menu entries
  (buttons) were centred, the gutter's labels lost their end alignment.
  `text-align` is structure.
- `look: 'none'` with `injectStyles: false` warned on the console even when
  the page held `lookGuardedCss(DZ_CSS)` (owner): said only when no readable
  sheet of the document (or shadow root) holds it.

- A selection made with Shift+arrows is handed to `onSelect` once (18j-3,
  batch 3): Enter again gave it again (a double Enter booked twice), and once
  the application cleared it in `onSelect` the next Enter was a new tap (a
  date click and a one-slot selection).
- A press anywhere outside the calendar clears a shown selection and calls
  `onUnselect` (owner, 2026-11-02), as the option pages said; only a click on
  the calendar's empty time did. An element of the page marked
  `data-dz-keep-selection` (a form beside the calendar) keeps it.
- React: `onSelectionChange` is called before `onSelect`, as Vue's and
  Angular's bindings are: a bound `selection` cleared in `onSelect` was put
  back.
- A link, a button or a field an application puts inside an event keeps its
  keys in every view: the Menu key, Shift+F10, a right-click and a touch long
  press there opened the event's menu (and took the browser's own); in a list
  row Backspace deleted the event and Space and the arrows were taken; in the
  "+N" panel Enter and Space were taken.
- A refused action — a delete, a menu entry, an event handed to another
  calendar — is said "Action refused" (`DzMessages.commandRefused`, owner,
  2026-11-02); "Not allowed here" stays for a refused place (a drop, a
  resize, its scope). A held event's refused step names its reasons through
  `DzMessages.dropRefusedFor` and `Intl.ListFormat` (it wrote " : " in every
  language).
- In a week or a day, today's column carries `aria-current="date"`: it sat
  on the day heads only, which are hidden from screen readers.

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

- The timeline slides along time and follows the present (supervision:
  processes as rows, runs arriving by SSE as cards). `timeline.step` (hours
  and minutes, `{ minutes: 15 }`) makes ◀ ▶ and `navigate('prev' | 'next')`
  scroll by it, the next or previous period brought in at the axis' end;
  `calendar.shift(by)` slides by any hours and minutes (also on the Angular, React and
  Vue controllers and `<dz-calendar>`). `timeline.follow` keeps the present
  in view, paused by the person's own move along time, taken up by "Today".
  `playground/supervision.html` shows both.
- `ongoing: true` on an event (owner, 2026-11-05): still running, drawn from
  its start to now and growing each minute in every view (the kernel moves
  its end: `refreshOngoing()`, no undo entry). Its `end` or `duration` is
  the length expected (`expectedEnd`), drawn until now passes it. An open,
  dashed end with stripes going by (`data-ongoing`); its time reads
  "11:02 – running" (`messages.ongoing`, in the five languages).
  `event.update({ ongoing: false })` finishes it at its `end`, else now. A
  date alone or a series is refused (`ongoing-not-timed`).
- `display: 'marker'` (owner, 2026-11-05): a moment without length — an
  alert, a deployment. In a timeline, a line across its row where it
  happened and a flag with its title in a lane beside it; in a time grid, a
  line across the column. A start only: an end or a duration is ignored
  (`marker-length-ignored`, a warning), a date alone is refused
  (`marker-all-day`). A moment's time is written once ("14:32", not
  "14:32 – 14:32"). The supervision playground's alerts are markers.
- `onFollowChange(following)` (owner, 2026-11-05): a timeline following the
  present paused or took it up again — for a "Back to live" button. With
  `timeline.step`, PageUp/PageDown slide the timeline by it, as ◀ ▶ do.
- `timeline.span` (owner, 2026-11-04): the time a timeline shows at once
  (`{ hours: 4 }`), whatever the room — a slot's width computed from it and
  measured again on a resize. Changed live by `update()`, it keeps the
  minute at the centre in place, the present while following: four hours on
  screen that slide with the clock. While following, the present's slot
  now sits at the left edge (at 22:47 in quarters, 22:45), the view moving
  on when the next slot begins. The supervision playground offers 1 h,
  4 h, 12 h, 24 h or the whole period.
- A timeline's background events take the event content hook's label, as a
  time grid's do (`background: true`): « Maintenance » written at the start
  of its window, kept in view while the row scrolls by, read by a screen
  reader. Without content they stay mute tints. The supervision playground
  shows runs, alerts and maintenance windows as cards timed to the second.
- Guides: theming and CSS, Tailwind, unstyled mode, in English and French
  (18j-3, batch 4).

- Guides: drag and drop, selection, keyboard and accessibility, in English
  and French (18j-3, batch 3).

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
