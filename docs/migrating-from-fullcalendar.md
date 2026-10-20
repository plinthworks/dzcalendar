# Moving from FullCalendar

Two tools, used together:

- **`dz-migrate`** (`@dzcalendar/migrate`, a development tool) rewrites the
  code: imports, plugins, `new Calendar(...)`, the common calls, Angular's
  `<full-calendar>`. What needs a person is marked `// dz-migrate:`.
- **`@dzcalendar/compat-fullcalendar`** translates the options object at run
  time: the application keeps its FullCalendar options and callbacks.

```sh
npx @dzcalendar/migrate src              # what would change
npx @dzcalendar/migrate src --write      # rewrite
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
