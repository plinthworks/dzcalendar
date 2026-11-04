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
- `timeline.step` (hours and minutes) makes ◀ ▶ scroll the axis by that much
  rather than change period; at the axis' end the period holding where the
  slide goes comes in (an aligned one still holding it: the next), landing
  where it was going. A one-day view stops at midnight on the way, a view of
  several days slides across it. `calendar.shift(by)` slides by any hours and minutes (a day or more throws, as the option).
  The keyboard's period keys still change period.
- `timeline.follow` keeps the present's slot at the left edge (owner,
  2026-11-04: at 22:47 in quarters of an hour, 22:45 — what comes is what a
  supervisor watches), a step on when the next slot begins, the period after it brought in past midnight. The
  person's own move along time — a scroll (the bar, a finger, a wheel, the
  keyboard's cursor), a slide, a period without the present — pauses it;
  "Today" takes it up. Made for supervision, where a timeline shows what is
  running now and runs arrive by SSE (`run({ type: 'event.create' })`).
- `timeline.span` (days, hours and minutes) is the time shown at once: a
  slot's width is the room shared by that many slots (measured again on a
  resize; the period at most, one slot at least), written as `--dz-tl-slot`.
  A change by `update()` keeps the minute at the centre in place, the
  present while following. Without it, the stylesheet's width.
- A background event (a maintenance window) is a tint behind the row's
  events; the event content hook gives it a label (`background: true`),
  drawn at its start and kept in view while the row scrolls by.
- A view's `duration` and `dateIncrement` are whole days or more: a date
  plus minutes is the same date, a step that never moved (refused with a
  `RangeError`).

## Tests
`packages/pro/test/timeline.test.ts`, `packages/pro/test/dom/timeline-dom.test.ts`,
`conformance/cases/timeline-axis`, the Phase 15b and step sections of `scripts/browser.mjs` (`playground/supervision.html`),
`perf/browser-budgets.json` (`resourceTimelineWeek:*:500`).
