# Behaviour sheet — render hooks on every element

What a developer does: gives the calendar functions for one kind of element
it draws — an event, a day's cell, a time label, the "+N" link… What they
observe in the other library: each element can be given classes, its own
content in place of the library's, a call once it is in the page (a
tooltip, a listener), and a call before it goes (the clean-up). Written in our
own words from its public documentation; the names are ours.

## What DzCalendar does

`hooks.<element>` takes four members, each optional:

- `class` — classes added to the element: a string, a list, or a function of
  the element's context returning either (null: none). Re-read whenever the
  element is drawn again; the classes given before and not now are taken
  off, the calendar's own never.
- `content(ctx, el)` — the element's content in place of ours: text, a node
  (a fragment too), or null / undefined to keep ours.
- `didMount({ el, ctx })` — once, after the element is in the page; it may
  return its own clean-up.
- `willUnmount({ el, ctx })` — once, before the element leaves the page (a
  view change, a period change, the calendar destroyed).

The context of each element holds Temporal values (never a `Date`), the
view's type, the resource of its column or row, and, for a day, its real
length in the calendar's zone (1 380 or 1 500 minutes on a clock change, 0
for a day that did not exist). `text` is what the calendar would write.

## Elements

| Element | What it is | Its context (besides `view`) |
|---|---|---|
| `event` | an event, in any view | the instance, its segment, the time text, the view's family, `background` |
| `dayCell` | a day's cell (a month, a day grid week) | date, resource, today, outside (another month), length, text |
| `dayHeader` | a day's head (a week's or a day's date, a month's weekday) | date, resource, today, length, text |
| `dayLane` | a time grid's column for a day | date, resource, today, length |
| `slotLabel` | a time label in a time grid's gutter (not a timeline's) | time, its position, pass (first or second on a fall-back), text |
| `slotLane` | a slot's row across a time grid (drawn only when this hook is given) | time, its position |
| `allDayLabel` | the label of the all-day row | text |
| `moreLink` | "+N" | date, resource, count, text |
| `morePopover` | the panel "+N" opens | date, resource |
| `nowIndicator` | the line at the current time | now (zoned) |
| `weekNumber` | a week's number | week, date, text |
| `noEvents` | the list's "nothing" message | text |
| `listDayHeader` | a list's day heading | date, length, text |
| `view` | the view's root | type, family, range, title |
| `monthHeader` | a month's title in a multi-month view | month, text |
| `resource` | a resource's head (a column or a timeline row's cell) | resource |
| `resourceLane` | a resource's row in a timeline | resource |
| `resourceGroupHeader`, `resourceGroupLane` | a group's head and row | field, value |
| `resourceAreaHeader` | a timeline's resource column head | field, text |

## Where we differ on purpose

- An element given content (or touched in `didMount`) by the application is
  read by assistive technology even where ours is drawn for the eye only (a
  day's head): what the application puts there may be a control.
- A hook that throws is reported (an unhandled rejection) and the element
  drawn as ours: one bug does not blank the calendar.
- Hooks are compared member by member by `update()`: giving the same
  functions again redraws nothing.
- Holders of the calendar — a day's column (`dayLane`), a lane, the view, the
  "+N" panel — take classes and mounts, never content: their content is the
  events. A day's cell's content goes in place of its number, a timeline
  resource's in place of its title, a group's in place of its name.
- The event hooks reach background events in a time grid's columns (with
  `background`); the all-day row's, the month's and the timeline's
  backgrounds stay plain tints.
- `didMount` runs once the drawing is in the page (`el.isConnected`); an
  element drawn and removed in the same drawing is never mounted nor let go.
  New `didMount` / `willUnmount` functions given by `update()`: each element
  is let go and mounted again with them. A hook taken away: let go, its
  classes removed.
- An element the calendar keeps and uses again (the "+N" panel) loses the
  application's classes when it is let go.

## In a framework (React, Vue, Angular)

- A template draws an element's content; the `hooks` prop / input gives
  the rest (classes, mounts) and is merged with it. Where a template exists,
  a `hooks.<element>.content` is not used.
- The calendar's hooks are made again only when their shape changes: a
  template added or taken away, a member of `hooks` added or removed, a
  class given as words changed. New closures at each render redraw nothing
  — a function in `hooks` is read when its element is drawn again (a
  navigation, a change of its data). For a class that must follow the
  application's state at once, give it as words: `class: busy ? 'busy' :
  ''` is re-read at each render.
- `hooks` and `headerItems` are each calendar's own: not in a provider's or
  plugin's defaults.

## The other library's names (`@dzcalendar/compat-fullcalendar`)

`<name>ClassNames`, `<name>Content`, `<name>DidMount`, `<name>WillUnmount`
for: `event`, `dayHeader`, `dayCell`, `slotLabel`, `slotLane`, `allDay`
(→ `allDayLabel`), `moreLink`, `dayPopover` (→ `morePopover`),
`nowIndicator`, `weekNumber`, `noEvents`, `view`, `resourceLabel`
(→ `resource`), `resourceLane`, `resourceGroupLabel`
(→ `resourceGroupHeader`), `resourceGroupLane`, `resourceAreaHeader`. Their
arguments are rebuilt with their field names (`isToday`, `dayNumberText`,
`num`…, a `Date` where they give one); a `ClassNames` function gets no `el`
(the element does not exist yet). A string or list in `eventClassNames`
stays every event's own classes.
