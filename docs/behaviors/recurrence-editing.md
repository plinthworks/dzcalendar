# Editing a recurring event: this one, this and following, all

> Repeating events need `import '@dzcalendar/core/recurrence'` once (18i); without it an event with `rrule` is refused with `recurrence-not-loaded`.


Observable behaviour of calendars in general (FullCalendar's documentation,
Google Calendar, Outlook): when a person changes one occurrence of a
repeating event, they are asked how far the change reaches. Described here
in our own words; no implementation was read.

## What the user does
Moves, resizes, renames or deletes one occurrence of a series — by drag
(Phase 7), by keyboard (Phase 8), or from the context menu ("Delete" opens a
sub-menu: *This event / This and following events / All events*).

## What they observe
- **This event** — only that occurrence changes. The others stay. Moved to
  another week, it is found there; deleted, the series just skips it.
- **This and following** — the series before the occurrence is unchanged;
  from it on, the change applies. A series that ended after *n* times still
  ends after *n* times in all (the first part keeps the ones already passed).
- **All events** — every occurrence changes the same way. Moved from Monday
  09:00 to Tuesday 10:00, every Monday 09:00 becomes a Tuesday 10:00 —
  including after the clocks change, still 10:00 on the wall.
- Undo puts back exactly what was there, both halves of a split included.

## What DzCalendar does — and why it matters
- **Plain commands.** `event.update`, `event.move`, `event.resize`,
  `event.delete` take `scope` and `key` (the occurrence's original start,
  offset included — the two 02:30s of a fall-back night are two different
  occurrences). `series.split` cuts without a gesture. All are data, checked,
  and undone through mutations, not by replaying commands.
- **"This" makes an override**: an ordinary event linked to its occurrence,
  indexed where it now is. Deleting "this" is an EXDATE.
- **"All" moves the keys with the series**: overrides, EXDATEs and RDATEs
  follow the same wall-clock shift, so an occurrence edited on its own stays
  attached, and an excluded one stays excluded. The rule is rebased: a
  Monday/Wednesday rule moved by one day becomes Tuesday/Thursday; "the
  second Tuesday" moved to a Thursday of the third week becomes "the third
  Thursday".
- **"Following" splits**: COUNT is shared, or UNTIL becomes the last start
  before the cut; EXDATEs, RDATEs and overrides after the cut go to the new
  series (which records `splitFrom`). From the first occurrence, it is "all".
- **Rules created here say their week start.** A series created in
  DzCalendar gets WKST = the locale's first day, written into the rule; a
  rule read from elsewhere without WKST is read with Monday, as RFC 5545 and
  other calendars read it (owner's decision, 2026-10-16).
- **A source is the authority.** Local edits of a series a source delivers
  (overrides, a split part) go when the source delivers it again, as for
  events.
- **Not yet:** switching a whole series between all-day and timed
  (`invalid-edit`; one occurrence may), choosing the scope on drop (Phase 7,
  `chooseScope`), iCal `RECURRENCE-ID` / `RELATED-TO` (Phase 9).

Conformance: `conformance/cases/series-edit/` (42 cases, written by hand).
