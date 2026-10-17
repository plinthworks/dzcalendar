# The list views

Observable behaviour of agenda lists (FullCalendar's public documentation
and demos of `listDay`, `listWeek`, `listMonth`, `listYear`; Google
Calendar's "Schedule" view), described in our own words; no implementation
read.

## What the user does
Switches to a list, reads the period's events day by day, opens one, goes
to a day, deletes from the keyboard.

## What they observe (reference behaviour)
- A heading per day that has events (the date, often a link to that day),
  then one row per event: its hours (or "all day"), a colour dot, its title.
- Days without events are left out; an empty period shows a message.
- An event over several days is listed on each of them; all-day rows come
  first, then by start time.
- Rows are links or table rows, one tab stop each; background events are
  not listed.

## What DzCalendar does — and where it differs on purpose
- **Days are the display zone's real days.** A heading says the day's real
  length when it is not 24 hours ("25 h" on the fall-back Sunday, "23 h 30"
  at Lord Howe). A day that does not exist in the zone (Apia, 30 December
  2011) has no heading; an event over it is listed on the 29th and the 31st.
- **Both passes of a repeated hour**, in the order they happen, their hours
  told apart (the second marked; offsets in what a screen reader hears).
- An event over midnight lists the part on each day (22:00 – 00:00, then
  00:00 – 02:00); one ending exactly at midnight does not touch the next day;
  a timed event covering a whole day reads "all day" there.
- **One tab stop** for the whole list (roving): ↑/↓ from event to event,
  Home/End to the ends, PageUp/PageDown to the previous/next day's first
  event. Enter or Space opens (`onEventClick`, else `onEventOpen`), as does
  a click; Delete deletes (asking how far for an occurrence) and says how to
  undo; Shift+F10 or the Menu key opens the context menu (a day heading's
  menu is the pointer's). The focus stays on its event when the list is
  redrawn — following it to another day when it moves, to its neighbour when
  it goes, to the "no events" line when the list empties. **Different from
  the grids on purpose**: a list is a line, not a grid — Home/End are its
  ends, PageUp/PageDown its days, and the arrows stop at the period's edges
  (the toolbar changes period). A clock-change day shows and says each
  event's real length ("3 h réelles") and the offsets of a repeated hour.
- Each day is a `section` with an `h3` (the toolbar title is the `h2`),
  its events a real list (`ul`/`li`), each event a button named by its title
  and spoken hours. No drag in a list.
- Shipped apart: `import '@dzcalendar/dom/list'` registers the family; the
  model (`buildListModel`) is in the core, for the native ports.

## Tests
- `packages/core/test/list.test.ts`: the 25-hour Sunday, Lord Howe,
  Apia 2011, midnight, multi-day and covering events, sort order, listYear,
  hidden days.
- `packages/dom/test/list.test.ts`: order and words, the empty message, the
  tab stop and its keys, Enter/click, focus across a store change, the
  context menu, the heading's day link, Delete, content hooks.
- `scripts/browser.mjs`: chronological rows, axe on listWeek and listMonth.
