# The keyboard and screen readers

Observable behaviour of calendars (FullCalendar's documentation and demos,
Google Calendar, Outlook, the WAI-ARIA Authoring Practices' date grid),
described in our own words; no implementation read.

## What the user does
Tabs into the calendar, moves from day to day or slot to slot with the
arrows, opens an event, moves or resizes it, selects a stretch of time,
deletes, undoes — without a mouse, or with a screen reader.

## What they observe (reference behaviour)
- FullCalendar: events are links or buttons reachable by Tab, one stop per
  event (a crowded month is dozens of stops); days are not focusable; there
  is no way to move or resize an event without dragging.
- Google Calendar: one stop for the grid, arrows between days; keyboard
  shortcuts for views; moving an event goes through its editor.
- The ARIA date-grid pattern: a `grid`, one tab stop (roving focus), arrows,
  Home/End, PageUp/PageDown.

## What DzCalendar does — and where it differs on purpose
- **One tab stop for the grid.** In a month, the cursor's cell (today when
  shown); in a week or a day, a cursor on the slots (first placed at the
  hour in view) — plus the events, which are buttons.
- **Arrows move a cursor that is a Hit**, like a pointer's: ←/→ a day,
  ↑/↓ a slot (a week in a month), Home/End the line (the week row, the
  day's hours), PageUp/PageDown the period (the same date). Past the last
  shown day the period changes and the cursor goes on. Right to left, ← is
  the next day. Up from a day's first slot is its all-day row.
- **Resource views** (owner's decision, 15a): ←/→ stay in the days of the
  cursor's resource — past its last day the period changes, same resource;
  **Alt+←/→** go to the previous or next resource, the same day and time
  (and, holding an event, move it there). Everything the cursor says starts
  with the resource ("Dr Haddad, Wednesday 21 October, 09:00").
- **Slots step in elapsed time**: on the 25-hour Sunday the cursor visits
  02:00 (+02:00) … then 02:00 (+01:00) — both passes, told apart by offset;
  on the 23-hour Sunday, 01:45 goes to 03:00.
- **Enter** (or Space) on a slot is a date click — and, when the calendar is
  `selectable`, it also selects that slot (a mouse click does not: the mouse
  selects by dragging, the keyboard has no drag); Shift+arrows select (said as it
  grows: "Selected: Wednesday 21 October, 09:00 to 10:00"), Enter gives the
  selection to the application. In a month, Enter on a day goes to its
  events — all of them, those behind "+N" too — ↑/↓ go through them, Escape
  comes back to the day.
- **On an event**: Enter is a click; **M** or **Alt+Enter** holds it (grab
  mode); Delete deletes it (asking how far for an occurrence) and says how to
  undo; Shift+F10 or the Menu key opens its context menu.
- **Grab mode = dragging by keyboard.** Each arrow is the step a pointer
  would make, through the same proposal (`grabStep` → `proposeMove` /
  `proposeResize`); Shift+arrows pull the end, Alt+Shift+arrows the start
  (when `eventResizableFromStart`), PageUp/PageDown a week. Each step is
  said, with the reason when the place is refused ("Not allowed here:
  overlaps another event"). Enter puts it down through the drop's own
  pipeline: refused (said, it flies back), how far (a series), which reading
  (a repeated hour), the history, the announcement. Escape or Tab lets go.
  A press on the calendar's time while holding puts it there — with
  "Move…" in the context menu, a move needs no dragging at all
  (WCAG 2.5.7).
- **Undo / redo**: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y anywhere in an
  `editable` calendar (not in the application's fields; off with
  `keyboardUndo: false`), said. Not while an event is held.
- A screen reader's bare click (VoiceOver, NVDA browse mode, TalkBack) on
  the cursor or an event does what Enter does.
- **What a screen reader hears**: a month cell says its date and how many
  events, and contains a button per event; the drawn bars are presentation,
  their focus ring mirrored from the item. Week columns are groups named by
  their date (and their real length on a 23- or 25-hour day). The cursor
  node is replaced at each move, so the move is spoken as a focus change.

## Tests
- `packages/core/test/keymap.test.ts`: the keymap, `stepHit` across both
  clock changes of Paris 2026, and key sequences proposing exactly what the
  mouse proposes.
- `packages/dom/test/keyboard.test.ts`: every path above in jsdom.
- `scripts/browser.mjs`: axe-core on every view (zero violations), the
  cursor and the grab preview at their pixel, the mirrored ring, "Move…"
  then a click, touch selection handles.
