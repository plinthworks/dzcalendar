# Context menu on cells and events

Owner's request (2026-10-16): every action can be reached from a context
menu on the cell (and on the event), not only by gestures.

## What the user does
Right-clicks a cell or an event — or long-presses it on a touch screen, or
presses the Menu key / Shift+F10 on the focused cell or event.

## What they observe
A short menu of what can be done *there*: on an empty slot "New event at
14:30", "Paste", "Go to this day"; on an event "Open", "Duplicate", "Move…",
"Change duration…", "Delete"; on a recurring event, a choice of "This
occurrence / This and following / All" before an edit applies.

## What DzCalendar does — and why it matters
- **An alternative to every gesture** (WCAG 2.2, SC 2.5.7): anything doable
  by dragging is doable from the menu and the keyboard. "Move…" enters the
  keyboard grab mode (D.3); nothing requires a pointer or a precise drag.
- **The target is exact, DST included.** The menu knows the instant under
  the pointer through the axis (`fromPosition`): right-clicking the repeated
  02:30 offers "New event at 02:30 (+02:00)" and "… (+01:00)"; a click in a
  skipped hour offers 03:00, and says why.
- **Same commands as everything else.** Each built-in item is a `Command`
  (Phase 1): validated, undoable, refused with a reason (a constraint, a
  non-editable event) — shown disabled with that reason, not hidden.
- **The application decides.** `contextMenu(ctx, defaults)` returns the
  items to show: keep, reorder, add its own ("Book a room"), or return null
  to keep the browser's menu. Items are data (label, icon, shortcut, enabled,
  reason, children), rendered by the calendar, so they are themed, RTL-aware
  and accessible without the app doing anything.
- **Accessible menu**: `role="menu"` / `menuitem`, arrow keys, Home/End,
  type-ahead, Escape closes and gives focus back to the cell or event,
  sub-menus for the recurrence scope; a native `popover` inside the calendar
  (inherits the theme and `color-scheme`), placed at the pointer or anchored
  to the focused element, flipped to stay on screen.
- **Touch**: a long press (500 ms, cancelled by any scroll movement) opens
  it, never blocking scrolling — unlike a mandatory long press to drag.

## Tests
`packages/core/test/actions.test.ts` (which actions a target gets, DST
targets), `packages/dom/test/context-menu.test.ts` (opening by mouse, touch,
keyboard; focus return; disabled items with a reason).
