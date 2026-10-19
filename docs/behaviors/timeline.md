# Timeline

## What the user does
Opens a day, a week, a month or a year as rows of resources (or one row),
time running along; drags events between rows and along time.

## What they observe (reference behaviour)
A resource area on the left (a tree, groups, columns of fields), time slots
above, events as bars in their resource's row; a scroller in both directions
keeps the area and the heads in place.

## What DzCalendar does — and where it differs on purpose
- The axis is elapsed time: a 25-hour day is 25 hours wide, an event is as
  long as it lasts. The slots follow the wall clock: on a fall-back night
  02:00 is shown twice (the second marked, both named with their offsets).
- Rows have a fixed height and a "+N" link past their lanes (owner's
  decision), rather than growing.
- An optional "Unassigned" row gathers events on no known resource; a drop
  there removes the resource the event was taken from.
- The area's row heads and the time's cursor are two tab stops; ↑/↓ in the
  time go from resource to resource.
- Only what meets the view is mounted, both ways.

## Tests
`packages/pro/test/timeline.test.ts`, `packages/pro/test/dom/timeline-dom.test.ts`,
`conformance/cases/timeline-axis`, the Phase 15b section of `scripts/browser.mjs`,
`perf/browser-budgets.json` (`resourceTimelineWeek:*:500`).
