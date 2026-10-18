# Resource columns

## What the user does
Gives the calendar a list of resources (doctors, rooms) and events carrying
`resourceId` / `resourceIds`, and opens a day, week or month "by resource".

## What they observe (reference behaviour)
One column per resource, its name in a header above; a week view shows each
resource's days under its name. Events sit in the column of their resource.
Dragging an event into another resource's column reassigns it. Resources can
be grouped by a field, with a header over each group.

## What DzCalendar does — and where it differs on purpose
- Resources first: each resource's days side by side, a 2 px line where the
  next resource's days begin. Dates above resources is not offered.
- Every resource of the tree is a column, parents included, depth first.
  Grouping applies to the roots.
- Every column is drawn in the calendar's zone; a resource's `timeZone` is
  where its business hours are read, so a doctor in Riyadh is shaded in Paris
  time, correctly through Paris's clock change (the shading moves by an hour
  on 25 October 2026, Riyadh's hours do not).
- A resource's own `eventConstraint` and `eventOverlap` are checked for the
  events on it, against its own hours, in its own zone.
- A drop swaps the resource the event was grabbed on for the one under the
  pointer, keeping its other resources.
- The heads are seen, not read: each column (each cell of a day grid) says
  whose it is in its own name ("Dr Haddad, Wednesday 21 October"); the
  keyboard's cursor says it too, and left/right go from one column to the
  next.
- Events on no resource, or on a resource not in the list, are not drawn in
  resource views.

## Tests
`packages/core/test/resources.test.ts`, `packages/dom/test/resources15.test.ts`,
`conformance/cases/resource-tree`, `conformance/cases/resource-rules`, the
Phase 15a section of `scripts/browser.mjs`.
