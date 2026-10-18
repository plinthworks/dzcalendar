# Bookable slots — `@dzcalendar/slots`

When can this provider be booked? The engine takes the provider's hours (in
the provider's own zone), what is already busy, and the booking rules, and
returns the free slots. Pure Temporal, no clock read, no DOM: the page and the
server run the same code and get the same answer.

## The case in ten lines

```ts
import { findSlots, checkSlot } from '@dzcalendar/slots';

const query = (busy) => ({
  availability: { timeZone: 'Asia/Riyadh', weekly: [{ days: [7, 1, 2, 3, 4], from: '08:00', to: '12:00' }] },
  from: '2026-10-21T00:00+03:00[Asia/Riyadh]', to: '2026-10-28T00:00+03:00[Asia/Riyadh]',
  duration: 30, busy,
});
const { slots } = findSlots(query(bookings));          // the page draws these
createCalendar(host, { availableSlots: slots, onSlotClick: (slot) => api.book(slot.start) });
// on the server, before saving:
if (!checkSlot(query(bookingsFromDb), requestedStart).ok) refuse();
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

- An end at or before the start crosses midnight (`22:00`–`02:00`); `'24:00'`
  is the next midnight. A window belongs to the date it opens on.
- Windows that touch merge: `08:00–10:00` and `10:00–12:00` are one opening.
- Clock changes: wall times are resolved like Temporal's `compatible` — a
  window starting in a skipped hour opens when the hour ends; a window across
  a change holds its real length (Paris 01:00–04:00 on 25 October is 4 h).

## Slots

- `duration` and `step` are minutes of **real** time. Slots start at each
  opening's start, every `step` (default: the duration), while a whole slot
  fits. Across a clock change a slot keeps its length: in Paris on 29 March,
  01:30–03:00 is a 30-minute slot, and on 25 October 02:00 is offered twice,
  once per offset.
- A slot is `{ start, end }` as ZonedDateTimes in the provider's zone;
  `slot.start.withTimeZone(clientZone)` shows it to the client. The calendar
  draws it in its own zone.
- `from`/`to`: only slots wholly inside. They do not shift the grid (a range
  starting at 09:30 does not create a 09:30 slot).

## Rules

| Option | Meaning |
|---|---|
| `busy: [{ start, end, kind? }]` | Taken time. `kind: 'booking'` (default) gets the buffers and counts toward `maxPerDay`; `'block'` (leave, another agenda) only takes its time. |
| `bufferBefore`, `bufferAfter` | Minutes kept free around each appointment. Two bookings end up `bufferAfter + bufferBefore` apart. |
| `minNotice` | No start sooner than this many minutes after `now`. |
| `maxAdvanceDays` | No start later than this many days after `now` (calendar days in the provider's zone). |
| `maxPerDay` | At most this many bookings starting on one of the provider's dates; a full date offers nothing. |
| `now` | Needed by `minNotice` and `maxAdvanceDays`: the engine never reads a clock. |

Capacity (several seats per slot) is Pro (Phase 16).

`busyFromEvents(events, zone)` turns calendar events into busy time: events
with `busy` (the default unless `status: 'cancelled'`); timed ones are
bookings, all-day ones block their dates in the provider's zone.

## Checking on the server

`checkSlot(query, start)` answers `{ ok: true, slot }` or
`{ ok: false, reason }` with `reason` one of `invalid-query`, `out-of-range`,
`closed`, `misaligned`, `notice`, `advance`, `daily-cap`, `busy` (the first
rule broken, in that order). It is exactly what `findSlots` would offer.

## Bad input

Nothing throws. `findSlots` returns `{ slots, problems }`:
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
  `--dz-slot-fg`), under the events.
- The calendar creates nothing: `onSlotClick` hands the slot back; the
  application books it, its server checks it again.
- Keyboard: slots are out of the tab order (the grid keeps one tab stop). The
  cursor says "Free slot, 10:00–10:30" where it stands in one, and Enter (or
  Space) books it instead of a date click.
- Angular: `[availableSlots]` and `(slotClick)`.
- `playground/slots.html`: a provider in Riyadh seen from Paris, Riyadh or
  Chicago; a click books and re-checks.
