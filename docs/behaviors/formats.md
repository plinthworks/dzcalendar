# Behaviour sheet — how dates and times are written

What a developer does: says how the calendar writes a date or an hour in
each place — "9 h" instead of "09:00", "lun. 19" instead of "lun. 19/10", a
title with the weekday. What they observe in the other library: one option
per place, taking the platform's date-format options or a function that
returns the text. Written in our own words from its public documentation;
the names are ours.

## What DzCalendar does

`formats: { <place>: Intl.DateTimeFormatOptions | (arg) => string }`, live
through `update()` (a new object with the same options, or the same
functions, redraws nothing):

| Place | Where | A function is given | By default |
|---|---|---|---|
| `title` | the header's title | `start`, `end` (the last day shown), `view`, `locale` | the month; a week's days; a day in full |
| `dayHeader` | a day's head (week, day, a month's weekdays) | `date`, `view`, `locale` | "lun. 19"; a month: "lun." |
| `dayCell` | a month's day number | `date`, `view`, `locale` | "19" |
| `slotLabel` | a time grid's hours, a timeline's slots | `time`, `view`, `locale` | "09:00" |
| `eventTime` | each hour in an event's time | `time` (the wall time in the calendar's zone), `event`, `locale` | "09:00" |
| `eventTimeRange` | an event's whole time | `start`, `end` (zoned), `startText`, `endText`, `event`, `locale` | "09:00 – 10:00" |
| `listDay` | a list's day heading | `date`, `locale` | "mercredi 21 octobre 2026" |
| `listDaySide` | a second text at the end of a list's day heading | `date`, `locale` | none |
| `monthHeader` | a month's title in a year | `month`, `locale` | "octobre 2026" |
| `morePopover` | the "+N" panel's title | `date`, `locale` | "mercredi 21 octobre" |
| `weekNumber` | a week's number (a function only: the platform has no week field) | `week`, `date`, `locale` | "S43" |

- Options are given to the platform's formatter in the calendar's locale
  (and its display calendar: `islamic-umalqura`…); a date is written in the
  calendar's zone.
- A title in options formats its first and last day as a range ("19 – 25
  oct.") when they differ.
- A function that throws, or returns something else than text, and options
  the platform refuses are reported once (an unhandled rejection) and the
  place written as by default from then on.
- A month's or a year's title is given its own first and last days, not the
  grid's padding ones (October, not 28 September – 8 November).
- The Pro timeline follows `slotLabel` (its hours), `dayHeader` (a day over
  hours), `monthHeader` (a month over days), `dayCell` (a day's slot) and
  `morePopover`.
- The keyboard's announcements and the exports keep the calendar's words.
- What is said to assistive technology keeps the calendar's full words (an
  event's hours with their offsets on a clock change, a day with its
  weekday and month): a short "9 h" is for the eye.
- A repeated hour's mark ("02:30*") is added after an hour written by
  `eventTime`, as after the default.

## Where we differ on purpose

- `weekNumber` takes a function only.
- `listDaySide` adds a second text; the day heading keeps its length on a
  clock change ("25 h").
