# A view of N days

## What the user does
Configures a view of, say, four days, with the weekend hidden.

## What they observe (reference behaviour)
Four *shown* days, skipping hidden ones; next/prev move by those four.

## What DzCalendar does
`dayCount` counts shown days (`computeViewRange`); `navigate` steps by the
same run of shown days both ways, so prev after next returns to the start.
A one-day view anchored on a hidden day shows the next shown day, and steps
over hidden days in the direction of travel.

## Tests
`packages/core/test/views.test.ts`, conformance `navigation/*`.
