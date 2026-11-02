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
  shown); in a week or a day, a cursor on the slots — plus the events, which
  are buttons. Before it has a place it rests at the top of the hours shown
  (owner, 18g-4: an empty day's scrolling hours hold the tab stop; tabbing
  to it scrolls nothing); focused, it is put on now when today is shown and
  now is in view, else on the first slot in view.
- **Arrows move a cursor that is a Hit**, like a pointer's: ←/→ a day,
  ↑/↓ a slot (a week in a month), Home/End the line (the week row, the
  day's hours), PageUp/PageDown the period, the cursor moved by the view's own
  step (a week in a week, a month in a month). Past the last
  shown day the period changes and the cursor goes on. Right to left, ← is
  the next day. Up from a day's first slot is its all-day row.
- **Resource views** (owner's decision, 15a): ←/→ stay in the days of the
  cursor's resource — past its last day the period changes, same resource;
  **Alt+←/→** go to the previous or next resource, the same day and time
  (and, holding an event, move it there). Everything the cursor says starts
  with the resource ("Dr Haddad, Wednesday 21 October, 09:00").
- **Timeline**: ←/→ along time, ↑/↓ from resource to resource (cursor and
  grab); on an event ↑/↓ the previous or next one.
- **Slots step in elapsed time**: on the 25-hour Sunday the cursor visits
  02:00 (+02:00) … then 02:00 (+01:00) — both passes, told apart by offset;
  on the 23-hour Sunday, 01:45 goes to 03:00.
- **Enter** (or Space) on a slot is a date click — and, when the calendar is
  `selectable`, it also selects that slot (a mouse click does not: the mouse
  selects by dragging, the keyboard has no drag); Shift+arrows select (said as it
  grows: "Selected: Wednesday 21 October, 09:00 to 10:00"), Enter gives the
  selection to the application — once: Enter again hands nothing more, and
  once the application cleared it in `onSelect` that Enter is spent (18j-3).
  Escape clears a selection, said ("Selection cleared"). In a time grid
  Enter is Space (no events to enter). In a month, Enter on a day goes to its
  events — all of them, those behind "+N" too — ↑/↓ go through them, Escape
  comes back to the day.
- **On an event**: Enter or Space is a click (`onEventClick`, else
  `onEventOpen`); ←/→/↑/↓ the previous or next event of the day (the whole
  all-day row in a week); Escape back to the cursor; **M** or **Alt+Enter** holds it (grab
  mode); Delete or Backspace deletes it (asking how far for an occurrence) and says how to
  undo; Shift+F10 or the Menu key opens its context menu.
- **Grab mode = dragging by keyboard.** Each arrow is the step a pointer
  would make, through the same proposal (`grabStep` → `proposeMove` /
  `proposeResize`); Shift+arrows pull the end, Alt+Shift+arrows the start
  (when `eventResizableFromStart`), PageUp/PageDown a week. Each step is
  said, with the reason when the place is refused ("Not allowed here:
  overlaps another event", `dropRefusedFor`, the reasons joined by
  `Intl.ListFormat`). Enter or Space puts it down through the drop's own
  pipeline: refused (said, it flies back), how far (a series), which reading
  (a repeated hour), the history, the announcement. Escape lets go; Tab lets go ("Move cancelled") and the focus moves on.
  A press on the calendar's time while holding puts it there — with
  "Move…" in the context menu, a move needs no dragging at all
  (WCAG 2.5.7).
- **Undo / redo**: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y anywhere in an
  `editable` calendar (not in the application's fields; off with
  `keyboardUndo: false`), said. Not while an event is held.
- A screen reader's bare click (VoiceOver, NVDA browse mode, TalkBack) on
  the cursor does what Space does, on an event what Enter does.
- **Context menu**: ↑/↓ (wrapping), Home/End, type-ahead (the same letter
  again goes to the next match), Enter/Space runs the entry, the arrow
  towards a sub-menu opens it, the arrow back or Escape returns to its
  entry, Escape closes the menu and gives focus back, Tab closes it. Opened
  by the Menu key or Shift+F10 on the cursor (slot or day) or on an event.
- **"+N" panel**: a `dialog`; Tab cycles inside it (Close included);
  Enter/Space call `onEventClick`; the Menu key or Shift+F10 open the
  event's menu; Escape closes it and the focus returns to "+N".
- **List views**: one tab stop roving over the entries; ↑/↓ the next or
  previous entry; Home/End the period's first or last; PageUp/PageDown the
  first entry of the previous or next day with entries; Enter/Space open;
  Delete/Backspace delete (scope asked for an occurrence, said with the
  undo key), the focus then on the next entry; Menu key or Shift+F10.
- **An application's controls inside an event** (`eventContent`: a link, a
  button, a field) keep their keys in every view, the panel and list rows
  included, and the Menu key, Shift+F10 and a right-click there are the
  browser's (18j-3 review).
- **Refusals said**: a place (drop, resize, its scope) "Not allowed here";
  an action (a delete, a menu entry, a hand-over to another calendar)
  "Action refused" (owner, 18j-3).
- **What a screen reader hears**: a month cell says its date and how many
  events, and contains a button per event; the drawn bars are presentation,
  their focus ring mirrored from the item. Week columns are groups named by
  their date (and their real length on a 23- or 25-hour day), today's with
  `aria-current="date"` (the day heads are hidden). In a week "+N" is a
  button named with the day and the time; in a month it is hidden, the cell
  listing every event. The cursor
  node is replaced at each move, so the move is spoken as a focus change.

## Tests
- `packages/core/test/keymap.test.ts`: the keymap, `stepHit` across both
  clock changes of Paris 2026, and key sequences proposing exactly what the
  mouse proposes.
- `packages/dom/test/keyboard.test.ts`: every path above in jsdom.
- `scripts/browser.mjs`: axe-core on every view (zero violations), the
  cursor and the grab preview at their pixel, the mirrored ring, "Move…"
  then a click, touch selection handles.
