# Dragging, resizing and selecting with a pointer

Observable behaviour of calendars (FullCalendar's documentation and demos,
Google Calendar, Outlook), described in our own words; no implementation read.

## What the user does
Presses an event and drags it to another time or day; pulls its bottom (or
its end, in a month) to make it longer; drags across empty time to select a
stretch; clicks an empty slot or day; clicks an event. With a finger: taps
an event first, then drags it.

## What they observe (reference behaviour)
- A preview follows the pointer; the event lands on the grid's step (15 min).
- In FullCalendar, a touch drag needs a long press (about a second), which
  feels broken; a tap does not select.
- Rules (constraints, overlap) mark the preview as not allowed.

## What DzCalendar does — and where it differs on purpose
- **One path for mouse, pen and finger** (Pointer Events), starting after
  4 px (8 px for a finger). **No long press:** a tap selects an event (it
  gets an outline, `aria-pressed`, bigger handles) and a drag on it starts at
  once; only the selected event stops the page from scrolling under a
  finger, so empty time still scrolls.
- **The same proposal as the keyboard.** The view turns a point into a Hit;
  `proposeMove` / `proposeResize` (core) decide where the event goes: the
  grabbed offset kept, the start snapped on the wall clock, the event's own
  zone and elapsed length kept. Dropped in a skipped hour, it moves to the
  next moment that exists and says so; dropped at a wall time that happens
  twice, the calendar asks which ("First 02:00 (+02:00)" / "Second 02:00
  (+01:00)").
- **Rules during the drag**: a preview that may not land is red; dropped
  anyway, it goes back where it came from ("Not allowed here" is announced).
  The application's own `run(cmd)` calls are not checked — only gestures.
- **Series**: dropping an occurrence asks "this / following / all" (or the
  application's `chooseScope`).
- **No layout read while moving**: geometry is read once when the gesture
  starts (and after the view moves to another period); every move is
  arithmetic. Autoscroll near the grid's edge; holding at the calendar's
  side goes to the previous/next period.
- **Motion** (optional GSAP adapter, off under `prefers-reduced-motion`):
  the preview lifts, a refused drop shakes and flies back, the dropped event
  lands from the preview, the others slide to make room (Flip).

## Tests
`packages/core/test/interaction.test.ts` (proposals, parity pointer/keyboard),
`npm run test:browser` (mouse, refusal, series scope, Escape, selection,
repeated hour, month, touch emulated). iOS Safari `touch-action`: manual.
