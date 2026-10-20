# Timeline — `@dzcalendar/pro`

Resources in rows, time running along. The axis is **elapsed**: a position is
real time since the start, so an event is as long on screen as it lasts, a
25-hour day is 25 hours wide and a 23-hour one 23. The
slots are cut on the wall clock: on a fall-back night 02:00 happens twice —
the second marked `02:00*`, both named with their offsets — and on a
spring-forward night there is no 02:00 at all.

```ts
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro'; // registers the family and its eight views

createCalendar(host, {
  initialView: 'resourceTimelineWeek',
  resources: [
    { id: 'card', title: 'Cardiology', service: 'Medicine' },
    { id: 'benali', title: 'Dr Benali', parentId: 'card', room: 'B12' },
  ],
  resourceGroupField: 'service',
  viewOptions: { timeline: { areaColumns: [{ field: 'title', header: 'Resource', width: 170 }, { field: 'room', header: 'Room' }] } },
  timeline: { slot: 60, maxLanes: 3 },
  editable: true,
});
```

MIT: `@dzcalendar/pro` is a code boundary, no licence key.

## Views and scale

| View | Default slot |
|---|---|
| `timelineDay`, `resourceTimelineDay` | 30 minutes |
| `timelineWeek`, `resourceTimelineWeek` | 1 hour (days above the hours, scrolled along) |
| `timelineMonth`, `resourceTimelineMonth` | 1 day (months above) |
| `timelineYear`, `resourceTimelineYear` | 1 day |

`timeline: { slot }` sets the scale for every timeline view: whole minutes
dividing a day (5, 10, 15, 20, 30, 60, 120…) or `'day'`; anything else is
refused (RangeError, at creation or `update()`), and `slot: undefined` goes
back to the default. A wall-clock slot crossing a clock change keeps its
true width (an hourly slot is 90 minutes wide on Lord Howe's spring day). The width of a slot is the stylesheet's:
`--dz-tl-slot` (2.75rem; 2.25rem counted in days). A timeline is continuous
time: hidden days are not taken out. On first paint (and after another
period or scale) it scrolls to `scrollTime` of today when shown, else of its
first day; counted in days, to today.

## Rows

- **Fixed height, "+N"**: a resource row shows
  `timeline.maxLanes` lanes (default 3); past them its last lane holds "+N"
  links, one per stretch where the hidden events run into one another, and
  the link opens them in the "+N" panel. Every resource row has the same
  height, so windowing is arithmetic.
- **Without resources** (`timelineDay`…): one row of every event, filling
  the view (its lanes are measured).
- **Tree and groups**: rows follow the resource tree (depth first, the
  15a order) and `resourceGroupField` (a head row per group, roots grouped).
  Folding a resource or a group is kept in the kernel
  (`collapsedResources`, `collapsedGroups`), so it survives `update()`;
  `onResourceToggle({ collapsedResources, collapsedGroups })` reports it,
  `update({ collapsedResources, collapsedGroups })` sets it. A day the zone
  skipped is said ("This day does not exist in this time zone").
- **"Unassigned"** (`showUnassigned: true`, default off): a
  first row of the events on no resource or on resources the
  calendar does not know. Dropping an event there takes it off the resource
  it was taken from (the others stay); dragging it out puts it on the row it
  is dropped on. The column views offer it too. It is the view's, not a
  resource: a date click or a selection on it carries no `resourceId`.
- Business hours shade each row in its resource's zone (15a); counted in
  days, a day without any open hour is shaded whole.

## The resource area

- Columns: `viewOptions.timeline.areaColumns` — `field` (read with
  `fieldOf`: the resource's own, then what was given, then `extendedProps`),
  `header` (the title column is "Resource" by default), `width` (px;
  default 160, then 110; 40 to 480). Each head has a separator to drag; from
  the keyboard the separators are one tab stop — ↑/↓ from one to the next,
  ←/→ 16 px a step. A width belongs to its field and is kept while the view
  lives.
- `hooks.resource.content({ resource }, el)` draws the first cell's title.
- The area sticks to the left and the heads to the top of the one scroller:
  scrolled both ways, they follow without script.

## Interactions

Everything the grids do: drag between rows (the resource taken from swapped
for the row's), resize by either edge (from the start with
`eventResizableFromStart`), select a stretch on a row, the context menu
(a moment, or a day, with the row's `resourceId`), undo. Near the scroller's
edges a drag scrolls along time; the period changes only once the scroll is
at its end; the edge zones start past the sticky area and heads. An
all-day event stays all-day (there is no all-day row): it moves by whole
days. Counted in days, a timed event moves by whole days and is not resized
(as in a month).

## Keyboard and screen readers

- The rows are a `treegrid`: each row says its level, its expansion, its
  index; its first cell is the row head, the time its grid cell.
- Two tab stops: the area's row heads (↑/↓ the rows, ← folds or goes to the
  parent, → unfolds or goes into the row's time, Enter/Space folds), and the
  time's cursor — ←/→ along time (`snapMinutes`, or a day counted in days),
  ↑/↓ the next resource, Home/End the row's start and end, Page Up/Down the
  period. What the cursor says starts with the resource ("Dr Haddad,
  Wednesday 21 October, 09:00").
- On an event, every arrow goes to the next or previous event of its row.
- Holding an event (M), ↑/↓ move it to the next resource, ←/→ in time (an
  all-day event: a day a step).
- The repeated hour's slot heads read "02:00*" and are said "02:00
  (+01:00)": the offset, not the mark.

## Performance

Above `virtualizeAbove` events (or 120 rows, or 400 slots), only the rows
meeting the view and a screen around it are mounted, and along time only
what meets the view and a screen on each side; nothing is mounted before
the scale is measured. Measured in Chrome, minified (`npm run
perf:browser`, budgets in `perf/browser-budgets.json`): 500 resources ×
10 000 events, first frame about 20 ms spread over a year (week and month)
and 40 ms all in one week (budget 80); scrolling about 1 ms of script a
frame (budget 8), longest frame one display frame (budget 25 ms). Not
measured yet: a year view with business hours, a drag's validation.

## Without a screen

`@dzcalendar/pro/model`: `buildTimelineAxis`, `buildTimelineModel`,
`updateTimelineModel`, `TIMELINE_VIEWS` — pure, for a server or a native
port; the `timeline-axis` conformance suite checks the axis.
