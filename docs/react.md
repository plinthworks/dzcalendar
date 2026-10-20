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
