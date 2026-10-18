# Crowded calendars and printing

Observable behaviour of FullCalendar with many events (its `eventMaxStack`,
`dayMaxEventRows` / "+more" options, its print support in the public
documentation and demos), described in our own words; no implementation read.

## What the user does
Opens a week, a month, a list or a year holding thousands of events; scrolls;
prints the calendar.

## What they observe (reference behaviour)
- A month day shows a few events and "+more"; the rest are in a popover.
- In a time grid, `eventMaxStack` limits how many overlapping events stand
  side by side; the others are behind "+more".
- Lists render every event; long lists are as long as they are.
- Printing uses a print stylesheet; what is scrolled off screen in a time
  grid is not printed unless the height is changed beforehand.

## What DzCalendar does — and where it differs on purpose
- **Time grid "+N", automatic** (`eventMaxStack`, default `'auto'`): as many
  overlapping events side by side as the column's width allows (about
  2.5rem each, guessed from the host before the first paint, measured
  after); the rest of a crowded cluster stands behind "+N" in its last lane,
  one link per stretch of time, opening the panel the month uses. A number
  fixes it; `null` shows them all.
- **Only what is on screen, above a threshold** (`virtualizeAbove`, default
  500 events in the view — the owner's choice): below it everything is
  mounted, so a screen reader's browse mode reads everything; above it the
  time grid mounts the scrolled hours and a screen around them, the list its
  visible rows (heights estimated, then measured, the first visible row kept
  in place), a multi-month year the months near the screen (the others keep
  their height). The keyboard reaches what is not mounted: the cursor, the
  list's arrows and a month cell's Enter mount what they go to. The focused
  event is never unmounted.
- **A month day lists its drawn events** to assistive technology, and every
  event behind "+N" once the day is entered (Enter) — the owner's choice: a
  crowded month holds cells × lanes nodes, not one per event. The cell's name
  still says how many events the day has.
- **A crowded all-day row scrolls** within its own height (`--dz-allday-max`):
  a thousand all-day events do not squeeze the hours to nothing.
- **Printing shows everything** (the owner's choice): `preparePrint()` mounts
  everything (no window, every month, every row) and lifts the "+N" caps — a
  month day grows to hold all its events, a crowded week shows every
  overlapping event — then returns the function that restores (scroll
  position included). `autoPrint: true` does it on `beforeprint`/`afterprint`.
  The theme's print sheet prints the scrolled hours whole, in colour, events
  unbroken, without buttons.
- **Nodes are recycled** (the owner's choice): event nodes of the time grid,
  bars of the month and entries of the list go back to a pool when they leave
  and come back bare (`willUnmount` before, `didMount` after).
- Windowing never moves what it keeps: nodes leaving are removed before the
  others are placed, so the focused event keeps its focus while scrolling.
  A windowed list keeps the row at the top of the view in place when rows
  come or go above it. Every view re-windows when the calendar changes size.

## Measured (Chrome, minified, `npm run perf:browser`)
U = 10 000 events over a year, W = 10 000 in one week. First frame, nodes:
week U 24 ms / 700, week W 98 ms / 2 203 (was 540 ms / 28 903), the same
week with every event side by side on a taller grid 264 ms / 13 995 (windowed),
month U 27 ms / 413, month W 73 ms / 221 (was 176 ms / 10 958), list year U
42 ms / 255 (was 291 ms / 55 277), list week W 42 ms / 256, year U 85 ms /
2 276 (was 174 ms / 13 985), year W 100 ms / 1 564. Changing one event: 3 ms
(week U) to 33 ms (month W) to the next frame, one layout.

## Tests
- `packages/core/test/maxstack.test.ts`: clusters beyond `maxStack`, "+N" runs.
- `packages/dom/test/virtual12.test.ts`, `list-virtual.test.ts`: windowing
  with stubbed sizes, mounting on scroll, the keyboard into unmounted places,
  `preparePrint()`, "+N" and its panel.
- `scripts/browser.mjs`: a crowded week (axe included), the list's scroll
  stable, the hours printed whole; `scripts/perf-browser.mjs`: the budgets.
