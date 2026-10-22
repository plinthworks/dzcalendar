# Behaviour sheet — dragging in from the page, and between calendars

What a person does: takes something outside the calendar — a patient on a
waiting list, a task, a template "Consultation 30 min" — and drops it on a
day or an hour; it becomes an event there. Or takes an event from one
calendar and drops it on another (two doctors side by side). What they
observe in the other library: an element is made draggable with the data of
the event it will become; the calendar accepts drops when told to; it says
"something was dropped here" and "an event was received"; the calendar the
event left says so too; the same rules as for a move (a constraint, overlap,
an allow function) decide whether the drop is taken, and the receiving side
may undo it. Written in our own words from its public documentation; the
names are ours.

## What DzCalendar does

```ts
import { makeDraggable } from '@dzcalendar/dom/drag';

const off = makeDraggable(card, {
  // What it becomes: an event input without its start (and an id if you have one).
  event: { title: 'Consultation', duration: { minutes: 30 }, extendedProps: { patientId: 42 } },
});

createCalendar(el, {
  droppable: true,
  onDrop: (drop) => removeFromWaitingList(drop.data),   // after the event is made
  onEventReceive: (change) => save(change.after).catch(() => change.revert()),
});
```

- **Pointer**: a press and a move on the element (mouse, pen; on touch a
  press held 300 ms) starts the drag; over a calendar with `droppable`, the
  place under the pointer is shown as the event would be (its length, an
  all-day bar over the all-day row or a month). Release drops; Escape, or
  releasing outside every calendar, cancels.
- **Keyboard**: the element is a button (`role="button"`, focusable, named
  by its own text). Enter or Space picks it up ("Consultation, picked up — go
  to a calendar"); Tab reaches a calendar; the arrows move the place as
  they move an event; Enter puts it down; Escape cancels. A screen reader
  hears each step.
- **The event made**: the data's event at the place dropped — its start
  there (a time in the calendar's zone, or the day), its duration kept (an
  all-day event: one day unless it says), the resource of the column or row
  dropped on. It is made by an `event.create` command checked as a gesture
  is (`{ validate: true }`): the rules apply (`eventConstraint`,
  `eventOverlap`, `eventAllow` — told it comes from outside), a refusal is
  shown at the place and said, nothing made. One undo takes it back.
- **`onDrop(drop)`**: `{ data, date, allDay, resourceId, element }`, after
  the event is made (not called on a refusal). `create: false` in
  `makeDraggable`'s spec: no event is made, `onDrop` alone is told.
- **`onEventReceive(change)`**: the change as `onEventChange` gives it
  (`cause: 'command'`, `after`), with `revert()` — the server refuses, the
  event goes.
- **`droppable`** is `false` by default: a calendar takes nothing it was not
  told to. `droppable: (data) => boolean` filters what it takes (given the
  element's data, or another calendar's event). From the page, `droppable`
  alone is needed; from another calendar, `editable` too.
- **Told once**: a drop reaches `onEventReceive` (and `onDrop`), not
  `onEventChange` as well — persist it there.

## Between two calendars

- An event dragged from a calendar can be dropped on another one on the page
  when both are `editable` and the second is `droppable`. It is made there
  first, then taken from here; if here refuses (its rules, its perms), it is
  taken back there and nothing is told. Once both are done, the first says
  `onEventLeave({ event, to })`, the second `onEventReceive`, and the
  second announces it. An occurrence of a series goes alone (`this`).
- One command on each side (a create, a delete), each in its own history: an
  undo on one calendar alone leaves the event on both or on neither — use
  `revert()`, which puts it back where it was, on both.
- On a shared store (four zones of one agenda) it is a plain move, told to
  the receiving calendar's `onEventReceive`.
- Releasing an event outside every calendar now puts nothing down (it used
  to land at the nearest edge); a few pixels past the edge still count.

## Not done

- No autoscroll while dragging in from the page or another calendar (the
  hour must be in view); an in-calendar drag scrolls as before.
- A calendar in an iframe is not reached from the page around it.

## Where we differ on purpose

- The keyboard path exists for every drag in (a person who cannot drag can
  still put a patient on an hour).
- `makeDraggable` returns its own clean-up; nothing is left on the element
  after it.
- An element's data is read when the drag starts (a list that changes keeps
  each card right).
