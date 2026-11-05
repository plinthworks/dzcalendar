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
  PageUp/PageDown slide by it too, the cursor going on by as much (as far as
  the slide really went: at a fixed period's end, "no further", the cursor
  stays).
- `timeline.follow` keeps the present's slot at the left edge (owner,
  2026-11-04: at 22:47 in quarters of an hour, 22:45 — what comes is what a
  supervisor watches), a step on when the next slot begins, the period after it brought in past midnight. The
  person's own move along time — a scroll (the bar, a finger, a wheel, the
  keyboard's cursor), a slide, a period without the present — pauses it;
  "Today" takes it up. Each change is said by `onFollowChange(following)`
  (not the option as first read): a "Back to live" button. Made for supervision, where a timeline shows what is
  running now and runs arrive by SSE (`run({ type: 'event.create' })`).
- `timeline.span` (days, hours and minutes) is the time shown at once: a
  slot's width is the room shared by that many slots (measured again on a
  resize; the period at most, one slot at least), written as `--dz-tl-slot`.
  A change by `update()` keeps the minute at the centre in place, the
  present while following. Without it, the stylesheet's width.
- An event still running (`ongoing: true`, owner 2026-11-05) is drawn from
  its start to now: its end follows the present, moved each minute by the
  kernel (`refreshOngoing`, a store change of cause 'api' — no undo, no
  `onEventChange`), never before the end expected (its `end` or `duration`
  as given, kept as `expectedEnd`). Its end is open — dashed — with stripes
  going by (still under reduced motion); its time reads "11:02 – running".
  `event.update({ ongoing: false })` finishes it: at its `end` if given,
  else now. A date alone or a series cannot run (`ongoing-not-timed`).
  Moved (a drag, `event.move`), it keeps its expected length — none: still
  from its new start to now; resized from its start, its expected end stays.
  The history follows its growth: its undo and `revert` stay.
- Recipe (owner 2026-11-05): a process's last status, its failures and
  what runs now in its row head — the store tells what changed
  (`kernel.subscribe`, `store` events), the application reads each
  process's summary again and gives the resources anew (`extendedProps`)
  only when one differs; `hooks.resource.content` draws it. In
  `playground/supervision.ts`; the timeline guide (18j-3, batch 5) tells it.
- A scroll asked (the present followed, a slide, "Today") is kept when
  another model on the same axis arrives before the frame (the resources
  or the events given anew at once).
- `forget: { olderThan }` (owner 2026-11-05, a calendar option, live):
  each minute, and when the calendar is made, the events that ended more
  than that long ago leave the store (`kernel.forgetBefore`, cause 'api': no
  undo, no `onEventChange`); a series and an event still running stay.
- A marker (`display: 'marker'`, owner 2026-11-05) is a moment: a line
  across its row where it happened, its flag (the title, or the content
  hook's) in a lane beside it, three slots wide — the room its lane keeps.
  It has a start only: an end or a duration given is ignored
  (`marker-length-ignored`), a date alone refused (`marker-all-day`). In a
  time grid, a line across its column, the title under it; in a month or a
  list, a line as a timed event's. Its time is written once ("14:32").
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
