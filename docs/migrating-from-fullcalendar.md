# Moving from FullCalendar

Two tools, used together:

- **`dz-migrate`** (`@dzcalendar/migrate`, a development tool) rewrites the
  code: imports, plugins, `new Calendar(...)`, the common calls, Angular's
  `<full-calendar>`. What needs a person is marked `// dz-migrate:`.
- **`@dzcalendar/compat-fullcalendar`** translates the options object at run
  time: the application keeps its FullCalendar options and callbacks.

```sh
npm install -D @dzcalendar/migrate
npx dz-migrate src              # what would change
npx dz-migrate src --write      # rewrite
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/compat-fullcalendar @dzcalendar/theme
npm uninstall @fullcalendar/core @fullcalendar/daygrid …   # every @fullcalendar/* package
```

## What `dz-migrate` rewrites

| Before | After |
|---|---|
| `import { Calendar } from '@fullcalendar/core'` | `import { createFromFullCalendar } from '@dzcalendar/compat-fullcalendar'` |
| `new Calendar(el, options)` | `createFromFullCalendar(el, options).calendar` |
| `calendar.render()` | removed (drawn when made) |
| `next()`, `prev()`, `today()` | `navigate('next' \| 'prev' \| 'today')` |
| `changeView(v)` | `update({ view: v })` |
| `refetchEvents()`, `unselect()`, `destroy()` | `refetch()`, `select(null)`, `destroy()` |
| types (`CalendarOptions`, `EventClickArg`, `EventApi`…) | the same names from `@dzcalendar/compat-fullcalendar` |
| plugins (`daygrid`, `timegrid`, `interaction`, `rrule`, `icalendar`, `resource*`) | removed: built in |
| `@fullcalendar/list`, `multimonth` | `import '@dzcalendar/dom/list'`, `'@dzcalendar/dom/multimonth'` |
| `@fullcalendar/timeline`, `resource-timeline` | `import '@dzcalendar/pro'` |
| `@fullcalendar/core/locales/ar` (`es`, `de`) | `import '@dzcalendar/dom/locales/ar'`; `locale: arLocale` → `locale: 'ar'` |
| Angular: `FullCalendarModule` | `DZ_CALENDAR, DzFullCalendar` |
| Angular: `<full-calendar [options]="o">` | `<dz-calendar [dzFullCalendar]="o">` |
| `Calendar` as a type | `CalendarInstance` from `@dzcalendar/dom` |
| `@fullcalendar/core/locales-all` | the Arabic, Spanish and German imports (English, French built in) |

Marked for a person: `select(start, end)` (here `select({ start, end, allDay })`), `gotoDate(d)` (`update({ date: Temporal.PlainDate.from(d) })`),
`addEvent(e)` (`run({ type: 'event.create', event })`), `getEventById`,
`getEvents` (`kernel.store.snapshot`), `setOption(k, v)` (`update({ … })`),
`on` / `off` (the callbacks), Angular's `getApi()` (the `CalendarController`).
Left and said: `import * as FC from '@fullcalendar/core'` (import the names).

## What the options become

See `docs/behaviors/fullcalendar-options.md`. In short: the same views,
dates and events, each in its zone. A time without a zone is read in the
calendar's zone, and said. Days count from Monday = 1. Colours become tones
(the colour is kept in `extendedProps.color`). Callbacks receive plain
objects (`event.start` is a `Date`); a refused move is undone with
`revert()`. The height is CSS (`--dz-height`).

`createFromFullCalendar(el, options)` returns `{ calendar, problems,
detach }`: read `problems` once — every guess and every option without an
equivalent is there (`zone-guessed`, `compat-unsupported`).

## Before publication: installing from tarballs

Until the packages are on npm, they are tarballs (`npm run pack:local` in
this repository writes them to `packed/`). Install the whole closure, not
only what you import: `core`, `rrule`, `dom`, `theme`, and with the
translator `ical` and `compat-fullcalendar` — npm cannot fetch an internal
dependency it does not find beside the others. After replacing the tarballs
in an Angular application, empty its caches (`rm -rf .angular/cache
node_modules/.vite`): otherwise the dev server serves the old chunks and the
screen stays blank with `NG0919: Cannot read @Component metadata`, which is
not a circular dependency.

## What changes on the way

- **The zone.** FullCalendar's options rarely name one (theirs is the
  browser's); the calendar's then is the application's
  (`provideDzCalendar({ timeZone })`), never silently the browser's.
- **Every day's events.** FullCalendar shows them all unless `dayMaxEvents`
  says otherwise: so does DzCalendar (`dayMaxLanes: null` is its default
  too, the weeks grow).
- **`slotLabelInterval`** becomes `timeGrid.labelMinutes` (a label every N
  minutes of the clock; the whole hours by default).
- **`eventDrop`, `eventResize`, `eventChange`, `eventAdd`, `eventRemove`**
  follow a person's change (a gesture, the keyboard, the menu, the editor);
  your own `calendar.run()` is not reported — theirs reports `addEvent` and
  `setProp` too. Persist from where your code makes the change.
- **The header.** `headerToolbar` is kept whole (`left` / `right` are
  `start` / `end`; `false`, no header) and `customButtons` with it (their
  `icon` becomes the class `fc-icon fc-icon-<name>`: bring its icon in your
  CSS). `prevYear` / `nextYear` are said and left out
  (`docs/behaviors/header-toolbar.md`).
- **Formats.** `titleFormat`, `dayHeaderFormat`, `slotLabelFormat`,
  `eventTimeFormat`, `listDayFormat`, `listDaySideFormat`,
  `dayPopoverFormat` keep their platform options (`formats`); their own keys
  (`meridiem`, `omitZeroMinute`…) and format functions are said. Without
  one, hours are the locale's ("09:00" in French, "9:00 AM" in English), not
  their compact "9a".
- **Custom views.** `views: { x: { type, duration, dayCount, dateIncrement,
  visibleRange } }` become ours by settings (`docs/custom-views.md`).
- **Dragging in.** `new Draggable(el, { itemSelector, eventData })` from
  their interaction plugin is the compat's (`import { Draggable } from
  '@dzcalendar/compat-fullcalendar'`; `dz-migrate` rewrites the import);
  `droppable`, `drop`, `eventReceive`, `eventLeave` keep their arguments
  (`draggedEl`, `revert`). `eventData.create: false` tells `drop` only.
  Natively: `makeDraggable` (`docs/behaviors/external-drag.md`).
- **Render hooks.** `<name>ClassNames`, `<name>Content`, `<name>DidMount`,
  `<name>WillUnmount` for the elements in `docs/behaviors/render-hooks.md`,
  with their arguments' names; a `ClassNames` function gets no `el`.
- **Types**: `view` is never null in the callbacks' arguments.

