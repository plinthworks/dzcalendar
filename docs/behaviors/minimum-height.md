# Short events in a time grid

## What the user does
Creates a five-minute event.

## What they observe (reference behaviour)
It is drawn taller than five minutes would be, so it stays readable and
clickable, and the layout treats it as that tall.

## What DzCalendar does
`minEventMinutes` (default 15) is used *both* for drawing and for the
side-by-side layout (`layoutColumn` with `minVisual`), so a short event never
overlaps the next one it does not touch in time. Its real length is still
the event's; `PlacedTimed.height` keeps it, `visualHeight` is what is drawn.

## Tests
`packages/core/test/layout.test.ts`, conformance `layout-column/column-min-visual`.
