# Bookable slots — `@dzcalendar/slots`

When can this provider be booked? The engine takes the provider's hours (in
the provider's own zone), what is already busy, and the booking rules, and
returns the free slots. Pure Temporal, no clock read, no DOM: the page and the
server run the same code and get the same answer.

## The case in ten lines

```ts
import { findSlots, checkSlot } from '@dzcalendar/slots';

const rules = {
  availability: { timeZone: 'Asia/Riyadh', weekly: [{ days: [7, 1, 2, 3, 4], from: '08:00', to: '12:00' }] },
  duration: 30,
};
const { slots } = findSlots({ ...rules, from: weekStart, to: weekEnd, busy: bookings }); // the page draws these
createCalendar(host, { availableSlots: slots, onSlotClick: (slot) => api.book(slot.start) });
// on the server, before saving (no range needed: it is the slot itself):
if (!checkSlot({ ...rules, busy: bookingsFromDb }, requestedStart).ok) refuse();
```

## Availability

```ts
availability: {
  timeZone: 'Asia/Riyadh',                     // the provider's zone: hours are read there
  weekly: [                                    // ISO weekdays, 1 Monday … 7 Sunday
    { days: [7, 1, 2, 3, 4], from: '08:00', to: '12:00' },
    { days: [7, 1, 2, 3, 4], from: '13:00', to: '16:00' },
  ],
  exceptions: [                                // replace every window opening on that date
    { date: '2026-12-01', closed: true },
    { date: '2026-12-03', windows: [{ from: '10:00', to: '14:00' }] },
  ],
  rules: [                                     // rare cases, RFC 5545
    { rrule: 'FREQ=MONTHLY;BYDAY=1SA', start: '2026-10-03', from: '09:00', to: '12:00', exdates: ['2026-11-07'] },
  ],
}
```

- An end at or before the start crosses midnight (`22:00`–`02:00`), so
  `00:00`–`00:00` is a whole day; `'24:00'` is the next midnight. A window
  belongs to the date it opens on: an exception closing Thursday does not cut
  Wednesday's 22:00–02:00 after midnight. An exception with `closed: true` is
  closed, whatever `windows` it also has.
- Windows that touch merge: `08:00–10:00` and `10:00–12:00` are one opening.
- Clock changes: a window across a change holds its real length (Paris
  01:00–04:00 on 25 October is 4 h). A time the clocks skip never adds open
  time: a window *starting* in the skipped hour opens as Temporal's
  `compatible` reads it (02:30 → 03:30 on 29 March in Paris), one *closing*
  in it closes at the jump (02:30 → the moment 02:00 became 03:00).

## Slots

- `duration` and `step` are minutes of **real** time. Slots start at each
  opening's start, every `step` (default: the duration), while a whole slot
  fits. Across a clock change a slot keeps its length: in Paris on 29 March,
  01:30–03:00 is a 30-minute slot, and on 25 October 02:00 is offered twice,
  once per offset.
- A slot is `{ start, end }` as ZonedDateTimes in the provider's zone;
  `slot.start.withTimeZone(clientZone)` shows it to the client. The calendar
  draws it in its own zone.
- `from`/`to`: only slots wholly inside. They never shift the grid (a range
  starting at 09:30 does not create a 09:30 slot): an opening that began
  before the range counts from its true start, looked for up to a week back.
  An opening that never closes (around the clock) has no start to count
  from: its slots fall on multiples of the step since the epoch.
- `duration` and `step`: whole minutes are expected, from 1 minute to a year.
  At most 10 000 slots are returned (and 200 000 starts looked at), with a
  `too-many-occurrences` warning beyond: narrow the range.

## Rules

| Option | Meaning |
|---|---|
| `busy: [{ start, end, kind? }]` | Taken time. `kind: 'booking'` (default) gets the buffers and counts toward `maxPerDay`; `'block'` (leave, another agenda) only takes its time. |
| `bufferBefore`, `bufferAfter` | Minutes kept free around each appointment. Two bookings end up `bufferAfter + bufferBefore` apart. |
| `minNotice` | No start sooner than this many minutes after `now`. |
| `maxAdvanceDays` | No start later than `now` plus this many days, at the same wall time in the provider's zone (a whole number). |
| `maxPerDay` | At most this many bookings starting on one of the provider's dates; a full date offers nothing (a whole number). |
| `now` | Needed by `minNotice` and `maxAdvanceDays`: the engine never reads a clock. |

Capacity (several seats per slot) is Pro (Phase 16).

`busyFromEvents(events, zone)` turns calendar events into busy time: events
with `busy` (the default unless `status: 'cancelled'`); timed ones are
bookings, all-day ones block their dates in the provider's zone.

## Checking on the server

`checkSlot(query, start)` answers `{ ok: true, slot }` or
`{ ok: false, reason }` with `reason` one of `invalid-query` (with
`problems`: why), `out-of-range`, `closed`, `misaligned`, `notice`,
`advance`, `daily-cap`, `busy` (the first rule broken, in that order). `from`
and `to` are optional here: without them the range is the slot itself. It
accepts exactly what `findSlots` offers — checked on random queries over the
nine zones of the project's tests.

## Bad input

Nothing throws, whatever the shape (JSON from a database included).
`findSlots` returns `{ slots, problems }`:
`unknown-zone` and `invalid-slot-query` (errors: no slots), and warnings for
what was skipped — `invalid-availability` (a window or date that cannot be
read), `invalid-rrule`, a busy entry that cannot be read. Each problem has a
`path` (`availability.weekly[1]`).

## In the calendar

```ts
createCalendar(host, {
  initialView: 'timeGridWeek',
  availableSlots: findSlots(query).slots,          // any { start, end } list works
  onSlotClick: (slot) => { /* the slot as given: book it */ },
});
cal.update({ availableSlots: findSlots(query).slots }); // after a booking
```

- Week and day views draw each slot as a button at its time (`.dz-slot`,
  tokens `--dz-slot-bg`, `--dz-slot-hover-bg`, `--dz-slot-border`,
  `--dz-slot-fg`), under the events. A slot is cut to the hours shown (one
  from before `slotMin` shows its visible part); where slots overlap (a step
  shorter than the duration) each is drawn down to the next start, so every
  start keeps a part of its own. Month and list views do not show slots.
- Slots must be Temporal values (`Instant` or `ZonedDateTime`, as `findSlots`
  gives them); anything else is skipped.
- The calendar creates nothing: `onSlotClick` hands the slot back — the very
  object given, extra fields included; the application books it, its server
  checks it again.
- Without `onSlotClick` the slots only show the free time: they are marked
  disabled, and a click or a drag on one acts as on empty time (date click,
  selection). With it, a drag cannot start on a slot (it is a button).
- Keyboard: slots are out of the tab order (the grid keeps one tab stop). The
  cursor says "Free slot, 10:00–10:30" where it stands in one, and Enter (or
  Space) books it instead of a date click. The cursor moves by `snapMinutes`:
  a slot shorter than that, or off its grid, may be passed over — keep slots
  on the snap grid.
- Words: "slot" in `slotMinutes`, `slotMin` and the cursor's hits is a row of
  the time grid; a bookable slot is `availableSlots` / `onSlotClick`.
- Angular: `[availableSlots]` and `(slotClick)`.
- `playground/slots.html`: a provider in Riyadh seen from Paris, Riyadh or
  Chicago; a click books and re-checks.
