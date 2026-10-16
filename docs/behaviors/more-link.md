# "+N more" in a crowded day

## What the user does
Looks at a month in which one day holds more events than its cell can show.

## What they observe (reference behaviour)
The cell shows as many bars as fit, then a link "+N more" in place of the
last row. Clicking it opens a small panel listing every event of that day.

## What DzCalendar does — and where it differs on purpose
- The rows a cell can hold is `maxLanes` (a number, or `'auto'`: measured
  from the cell height once per resize, never per render).
- On a day that overflows, the **last visible lane gives way to the link**,
  so N counts every event not drawn that day — never "+0", never a bar
  half-covered by the link. A bar spanning several days is cut into the
  stretches where it stays visible (`computeOverflow`).
- Background events take no lane and never push a real event behind "+N".
- The panel is a native `popover` element inside the calendar (it inherits
  the theme and `color-scheme`), lists the day's events — including the ones
  still drawn — opens and closes with the keyboard (Enter/Space, Escape),
  and gives focus back to the link that opened it.
- Screen readers hear "3 more events, Wednesday 21 October".

## Tests
`packages/core/test/layout.test.ts` (overflow properties),
`packages/dom/test/daygrid.test.ts` ("+N" and popover).
