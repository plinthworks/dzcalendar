# Multi-month and custom views

Observable behaviour of FullCalendar's multi-month year view, its
`weekends`/`hiddenDays` options and its custom views (public documentation
and demos), described in our own words; no implementation read.

## What the user does
Looks at a whole year, months side by side or stacked; hides the weekend;
turns week numbers on; an application adds a view of its own.

## What they observe (reference behaviour)
- A year of small month grids, wrapping into as many columns as fit (a
  maximum and a minimum width are options); events drawn as in the month.
- `weekends: false` and `hiddenDays` leave days out of every view.
- A custom view is either a configured built-in (four days of the time grid)
  or a function drawing HTML from the period and its events.

## What DzCalendar does — and where it differs on purpose
- **Each month is the month view itself**: bars, "+N", drag and resize, the
  context menu and the keyboard all work. One tab stop for the whole year;
  the arrows cross from month to month (31 October → 1 November in
  November's grid) and past 31 December into the next year. Padding days are
  drawn empty: a date's events show in its own month only, never twice.
- Every month has six weeks (the owner's choice: months side by side align);
  a spec with `fixedWeekCount: false` keeps only the month's weeks. A
  pointer over a padding day stays in the row's own month.
- `multiMonthMaxColumns` (default 3; 1 is a stack) with a minimum width
  (`--dz-mm-min`); a month's title is a button to that month.
- **Week numbers** (`weekNumbers`) follow the locale's rules (week 53 of
  2026 in France is week 1 of 2027 in the US): on the first cell of each row
  of a month, in the corner of a week; each leads to its week.
- **Hidden days** apply to every view that names none of its own — a view
  naming its own keeps them, as in FullCalendar (owner's choice); values are
  ISO weekdays 1–7 (FullCalendar's 0 for Sunday is refused). The keyboard
  steps over them (Friday → Monday, into the next week or day if needed).
- **Paid for when used**: `@dzcalendar/dom/list`, `@dzcalendar/dom/multimonth`
  and `@dzcalendar/dom/custom` register their views on import; their models
  are in `@dzcalendar/core/views`.
- **Custom views**: `defineView({ type, duration, render(el, data, api) })`
  — the calendar keeps the toolbar, title, navigation and sources; `render`
  gets every shown day with its events (in the display zone) and an `api`
  to open an event, open the context menu or announce. Full control
  (gestures, keyboard) is `registerView(family, factory)` with
  `registerModelFamily(family, …)` and `@dzcalendar/dom/toolkit`, as the
  list, multi-month and the Pro do. A custom view's type is its family: a
  built-in family's name is refused, a second definition of a type replaces
  the first, and a `render` that throws is reported and leaves what was
  drawn. Under `injectStyles: false`, include `LIST_CSS` and
  `MULTIMONTH_CSS` (exported by their entries).

## Tests
- `packages/core/test/multimonth.test.ts`: ranges, a date's events in its
  own month only, months kept by identity, hidden days.
- `packages/dom/test/views10.test.ts`: twelve grids, one tab stop, arrows
  across months and years, week numbers by locale, weekends, keyboard over
  hidden days, `defineView`, `registerView`.
- `scripts/browser.mjs`: months side by side then stacked, a drag in
  October's grid, five columns aligned without the weekend, axe.
