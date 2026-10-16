# Weeks in a month grid

## What the user does
Opens a month.

## What they observe (reference behaviour)
By default six weeks, so the grid keeps its height from month to month;
optionally only the weeks the month touches.

## What DzCalendar does
`fixedWeekCount: true` (default) gives six rows from the locale's first
weekday before the 1st; `false` keeps only rows holding a day of the month.
Days outside the month are dimmed, or left empty with
`showNonCurrentDates: false` (their events are not drawn either).

## Tests
`packages/core/test/views.test.ts`, conformance `navigation/nav-month-fit-weeks`.
