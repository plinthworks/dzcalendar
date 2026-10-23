# DzCalendar in React — `@dzcalendar/react`, `@dzcalendar/pro-react`

React 18 and 19.

## Install

```sh
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/react
```

and `import '@dzcalendar/theme/dzcalendar.css'` once.

## A calendar

```tsx
import { useState } from 'react';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, Selection } from '@dzcalendar/core';
import { DzCalendar, useCalendarController, useCalendarState } from '@dzcalendar/react';

const events: EventInput[] = [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Asia/Riyadh]', duration: { minutes: 30 } }];

export function Agenda() {
  const cal = useCalendarController();
  const { title, canUndo } = useCalendarState(cal);
  const [view, setView] = useState('timeGridWeek');
  const [selection, setSelection] = useState<Selection | null>(null);
  return (
    <>
      <header>
        <button onClick={cal.prev}>‹</button> <h2>{title}</h2> <button onClick={cal.next}>›</button>
        <button disabled={!canUndo} onClick={cal.undo}>Undo</button>
      </header>
      <DzCalendar
        controller={cal}
        events={events}
        view={view} onViewChange={setView}
        defaultDate={Temporal.PlainDate.from('2026-10-21')}
        selection={selection} onSelectionChange={setSelection}
        timeZone="Asia/Riyadh" locale="ar-SA" editable
        initial={{ firstDay: 7 }}
        renderEventContent={(event, ctx) => <><b>{event.title}</b> {ctx.timeText}</>}
        onEventClick={(i) => console.log(i.event.id)}
      />
    </>
  );
}
```

- **Options are props**: what changed since the last render goes to the
  calendar. Arrays and objects are compared by their contents, so a literal
  written again each render (`resources={[…]}`) changes nothing. Sources are
  compared by identity: keep them stable (`useMemo`).
- **`initial`**: options read once, when the calendar is made (`firstDay`,
  `rules`, `now`…); later changes to it are not read. A prop that goes back
  to `undefined` leaves the calendar's value as it was (pass the default to
  restore it).
- **`view`, `date`, `selection`**: given, they win, as a controlled input's
  value does — `onViewChange`, `onDateChange`, `onSelectionChange` say what a
  person (or the controller) did, and the calendar goes back to the prop
  unless the parent follows. Not given: `defaultView`, `defaultDate`, and
  the calendar keeps its own. A view or date the calendar refused is given
  back (`onViewChange` with the real one) and not tried again until the prop
  changes.
- **`onEventChange`**: what a person changed (a drag, a resize, the
  keyboard, the menu, the editor) — persist it, and `change.revert()` if the
  server refuses (exactly that change, even after another; false when the
  event changed again since). Your own `controller.dispatch()` is not said.
  ```tsx
  onEventChange={(change) => fetch(`/api/rdv/${change.after?.id}`, { method: 'PATCH', body: JSON.stringify({ start: String(change.after?.start) }) })
    .then((r) => { if (!r.ok) change.revert(); })}
  ```
- **`renderDayHeader={(day) => …}`**: each day's head by your components
  (`day.date`, `day.resource`, `day.lengthMinutes`, `day.text`) — a mark, a
  count, a button.
- **A template for every element with a content**: `renderDayCell`,
  `renderSlotLabel`, `renderAllDayLabel`, `renderMoreLink`,
  `renderNowIndicator`, `renderWeekNumber`, `renderNoEvents`,
  `renderListDayHeader`, `renderMonthHeader`, `renderResource`,
  `renderResourceGroupHeader`, `renderResourceAreaHeader` — each given its
  element's context (docs/behaviors/render-hooks.md), drawn by portals in
  your tree.
- **`hooks={{ dayCell: { class: (d) => d.outside ? 'muted' : null } }}`**:
  classes and mounts for any element (the holders — a day's column, a
  timeline row, the view — too), merged with the templates: the template
  gives the content, `hooks` the rest. New closures at each render redraw
  nothing; a function is read when the element is drawn again.
- **`headerItems={{ filter: <DoctorFilter /> }}`** with `headerToolbar={{
  end: 'filter timeGridWeek' }}`: your components in the header (a node, or
  `(ctx) => …` with the view and title); `customButtons` for plain buttons.
- A background event (a closed day) reaches `renderEventContent` with
  `ctx.background`: return something for a label at the top of its column,
  null for a plain tint.
- **`renderEventContent`**: the application's components, rendered through
  portals in its own tree — its context, state, router and i18n reach them —
  before the browser paints.
- **`useCalendarController()`** gives a stable controller (`prev`, `next`,
  `today`, `goTo`, `changeView`, `dispatch`, `undo`, `redo`, `refetch`);
  **`useCalendarState(cal)`** reads it (`title`, `view`, `date`, `range`,
  `canUndo`, `canRedo`, `loading`, `problems`, `instance`).
- **A ref** gives `{ instance, controller }`. Another `controller` given
  later takes the calendar over (the old one is let go). In what `renderEventContent`
  renders, **`useParentCalendarController()`** gives that calendar's
  controller.
- `className`, `style`, `id`, `data-*` and `aria-*` go on the calendar's
  element.
- **Server rendering**: importing the packages touches no `document` or
  `window`; the calendar is made in the browser only.
- **`onError`**: a value the calendar refused (an unknown view); the other
  changes are applied. Default `console.error`.
- **`DzCalendarProvider`**: `defaults` (zone, locale, words…) and `motion`
  (one adapter made per calendar: `motion={() => createGsapMotion()}`).
- `onEventOpen`, `onCreateRequest`, `onSlotClick` change what the calendar
  offers ("Open" in the menu…): given only while the prop is.

- **`onDrop`, `onEventReceive`, `onEventLeave`** (props) with `makeDraggable` from `@dzcalendar/dom/drag` on your list's items: dragged in from the page, or between two calendars (`docs/behaviors/external-drag.md`).

## The Pro

```tsx
import '@dzcalendar/pro';                     // the timeline views
import { useDzExport, useEventEditor } from '@dzcalendar/pro-react';

const cal = useCalendarController();
useEventEditor(cal, { onClosed: (outcome) => console.log(outcome) });
const exports = useDzExport(cal);
<button onClick={() => exports.download('pdf', 'agenda.pdf')}>PDF</button>
```

The editor takes "Open" and "New event here" through the controller
(`cal.takeOver(…)`), over the calendar's own `onEventOpen` and
`onCreateRequest`, until its component goes. The editor and the exports are
fetched on first use. Nothing throws: a
result's `problems` say what went wrong.

## Notes

- `onProblem` (React) / `@problem` (Vue): something the calendar could not
  do as asked, found while drawing (`events-not-drawn`, `host-no-height`);
  without a listener, the console says it once per code.

- A content hook (or template, slot) now also receives **background
  events**, in a time grid's columns, with `ctx.background`: return nothing
  for them to keep a plain tint. The all-day row's and the month's
  backgrounds stay tints.
- An event is given with `extendedProps` (an input); read back — in
  `eventChange`, `eventClick`, a template — it is a `CalEvent`, whose own data
  is `props` (`change.after.props.patientId`).
- The day-header hook covers the week, day and month views (a month's
  column: the first date of that weekday), not a list's day headings.
- The change output says a person's change — a gesture, the keyboard, the
  menu, the editor, and their undo / redo (`cause`). A command your code runs
  with `{ validate: true }` counts as a person's (that is what it means:
  checked as a gesture is); without it, it is not said.
- A context-menu hook that returns `null` or `[]` means "no calendar menu
  here": the browser's own menu opens. An application that opens its own menu
  from the hook calls `preventDefault()` on the `contextmenu` event itself
  (the calendar cannot know it did).

