# Clean room

DzCalendar is written from scratch. It reproduces what a person **sees and
does** with FullCalendar — never how FullCalendar does it.

## Allowed

- FullCalendar's public documentation and live demos, to learn observable
  behaviour: what a click, a drag, a resize or a navigation produces.
- Public issue *reports*, for the bug they describe (the symptom), cited by
  number in tests (`refs: ["FC#6729"]`).
- Standards: RFC 5545 (iCalendar, RRULE), Temporal, Intl, WAI-ARIA, WCAG.
- tzslot, which is ours.

## Not allowed

- Reading, copying or translating FullCalendar's source code, internal types,
  tests, CSS or build setup — nor any commercial competitor's.
- Decompiling or reverse-engineering minified bundles of any calendar library.
- Pasting their documentation text into ours.

## How a behaviour is borrowed

Each imitated behaviour gets a sheet in `docs/behaviors/<name>.md`, in our own
words: what the user does, what they observe, what DzCalendar does instead
where we differ on purpose (DST, zones, keyboard). The sheet is written
before the code, and the code's tests point to it.

This applies to every contributor, human or agent.
