# Business hours

## What the user does
Declares opening hours: Monday–Friday, 09:00–18:00.

## What they observe (reference behaviour)
Hours outside are shaded in the time grid; in a month, non-working days are
shaded.

## What DzCalendar does — and where it differs on purpose
- Rules are wall times in a zone of their own (`timeZone`, default the
  calendar's): a Paris shop open 09:00–18:00 seen from Chicago is shaded
  outside 02:00–11:00 Chicago time, correctly through both countries' clock
  changes (which do not fall on the same dates).
- A rule that cannot be read ("9h", a weekday 0 or 8, an unknown zone) is
  refused when the options are set — a configuration error, said once.
- A rule crossing midnight (22:00–06:00) or ending at 24:00 is one interval
  of its true length, so a night shift on a 25-hour night is 9 hours.
- Shading marks what is *outside*; the intervals come from
  `businessIntervals`, in the core, so validation (Phase 6) uses the same.

## Tests
`packages/core/test/business-hours.test.ts`, `packages/dom/test/*`.
