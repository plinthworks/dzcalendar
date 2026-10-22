# DzCalendar in Angular — `@dzcalendar/angular`, `@dzcalendar/pro-angular`

Angular 19 to 22, zoneless or zone.js, signals only.

## Install

```sh
ng add @dzcalendar/angular
```

It adds `@dzcalendar/core`, `dom`, `theme`; puts `dzcalendar.css` in the
build's styles; adds `provideDzCalendar({})` to `app.config.ts`. It asks
whether to add GSAP motion (`gsap`, `@dzcalendar/motion-gsap`,
`provideDzMotion`), the Pro (`@dzcalendar/pro`, `pro-angular`,
`@tzslot/dom`) and an example component (`src/app/agenda.ts`). Without
prompts: `ng add @dzcalendar/angular --gsap --pro --example`.

## A calendar

```ts
import { Component, signal } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import type { EventInput, PlainDate, Selection } from '@dzcalendar/core';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [DZ_CALENDAR],
  template: `
    <h2>{{ cal.controller.title() }}</h2>
    <dz-calendar #cal [events]="events()" [(view)]="view" [(date)]="date" [(selection)]="selection" [editable]="true" (eventClick)="open($event)">
      <ng-template dzEventContent let-event="event" let-ctx="ctx"><b>{{ event.title }}</b> {{ ctx.timeText }}</ng-template>
    </dz-calendar>`,
})
export class Agenda {
  readonly events = signal<EventInput[]>([{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Asia/Riyadh]', duration: { minutes: 30 } }]);
  readonly view = signal<string | undefined>('timeGridWeek');
  readonly date = signal<PlainDate | undefined>(undefined);
  readonly selection = signal<Selection | null>(null);
  open(instance: unknown) {}
}
```

Settled once for the application:

```ts
// app.config.ts
providers: [
  provideDzCalendar({ timeZone: 'Asia/Riyadh', locale: 'ar-SA' }),
  provideDzMotion(() => createGsapMotion({ preset: 'sober' })), // one adapter per calendar
];
```

A `motion` given to `provideDzCalendar` or to a calendar wins over
`provideDzMotion`.

## Everything `<dz-calendar>` takes

**Inputs**: `events`, `sources` (keep each spec the same object), `resources`,
`timeZone`, `locale`, `axis` (`'wall'` | `'elapsed'`), `editable`,
`selectable`, `businessHours`, `weekends`, `weekNumbers`, `hiddenDays`,
`messages`, `theme`, `scheme`, `density`, `displayCalendar`,
`secondaryCalendar`, `availableSlots`, and **`[options]`** for everything
else `update()` takes — `firstDay`, `rules`, `nowIndicator`, `scrollTime`,
`dayMaxLanes` (`'auto'`, a number, or `null`: every event, the weeks grow),
`eventMaxStack`, `allDaySlot`, `displayEventTime`, `eventStyle`
(`'tinted'` | `'solid'`), `timeGrid`, `headerViews`, `contextMenu`… All of
them can change at any time.

**Two-way**: `[(view)]`, `[(date)]`, `[(selection)]`.

**Outputs**: `(dateClick)`, `(eventClick)`, `(eventOpen)`,
`(createRequest)`, `(slotClick)`, `(selected)`, `(sourceNotice)`,
`(problems)`, `(resourceProblems)`, and **`(eventChange)`** — what a person
changed (a drag, a resize, the keyboard, the menu, the editor), not your own
`run()` nor a source's delivery.

**Templates**: `<ng-template dzEventContent let-event let-ctx="ctx">` for the
events (a background event — a closed day — gets `ctx.background`: give it
something to show a label at the top of its column, nothing and it stays a
tint); `<ng-template dzDayHeader let-day>` for each day's head (`day.date`,
`day.resource`, `day.lengthMinutes` — 1 380 or 1 500 on a clock change —
`day.text`, the calendar's own words). Both are your components, in your
injector, checked when your signals change.

The same for every element with a content, `let-ctx` (its context,
docs/behaviors/render-hooks.md): `dzDayCell`, `dzSlotLabel`,
`dzAllDayLabel`, `dzMoreLink`, `dzNowIndicator`, `dzWeekNumber`,
`dzNoEvents`, `dzListDayHeader`, `dzMonthHeader`, `dzResource`,
`dzResourceGroupHeader`, `dzResourceAreaHeader` (all in `DZ_CALENDAR`).
`<ng-template dzHeaderItem="filter" let-ctx>` is your place in the header,
named in `headerToolbar` (`[options]="{ headerToolbar: { end: 'filter
timeGridWeek' } }"`); `customButtons` for plain buttons. `[hooks]` gives
classes and mounts for any element (the holders — a day's column, a
timeline row — too), merged with the templates: the template gives the
content, `hooks` the rest.

**Dragging in**: `(dropped)`, `(eventReceive)`, `(eventLeave)` with `makeDraggable` from `@dzcalendar/dom/drag` on your list's items (in `afterNextRender`, its clean-up in `DestroyRef.onDestroy`) and `[options]="{ droppable: true }"` (`docs/behaviors/external-drag.md`). `dropped`, not `drop`: an output named `drop` would also hear the browser's own drop event.

**The controller** (`#cal` then `cal.controller`, or `inject(CalendarController)`
in a child): signals `state`, `title`, `range`, `view`, `date`, `canUndo`,
`canRedo`, `loading`, `problems`, `instance`; methods `prev`, `next`,
`today`, `goTo`, `changeView`, `dispatch` (a command), `undo`, `redo`,
`refetch`.

## Saving a person's change on the server

```ts
import type { EventChange } from '@dzcalendar/dom';

@Component({
  imports: [DZ_CALENDAR],
  template: `<dz-calendar [events]="events()" [editable]="true" (eventChange)="save($event)" />`,
})
export class Agenda {
  private readonly http = inject(HttpClient);
  save(change: EventChange) {
    const moved = change.after;
    if (!moved) return;
    this.http.patch(`/api/appointments/${moved.id}`, { start: moved.start.toString(), end: moved.end.toString() }).subscribe({
      // Refused (a slot taken meanwhile): exactly this change is taken back — not "the last one".
      error: () => change.revert(),
    });
  }
}
```

`change.command` is the command that was run; `change.changes` lists every
event and series it touched (`before` / `after`, null when created or
removed). `revert()` returns false, and changes nothing, when the event was
changed again since.

## From FullCalendar options

`<dz-calendar [dzFullCalendar]="calendarOptions">` (from
`@dzcalendar/angular/fullcalendar`, with `@dzcalendar/compat-fullcalendar`)
lays an application's FullCalendar options on the calendar; it **composes**
with the inputs and `[options]` — the theme, the zone, a context-menu hook
given there stay. The zone of `provideDzCalendar` is kept when the
FullCalendar options name none (theirs is the browser's). `(fullCalendarProblems)`
lists what was guessed or has no equivalent. See
`docs/migrating-from-fullcalendar.md`.

Check templates with `ng build`, not `tsc`: only the Angular compiler reads
them.

## The Pro

```ts
import { DzEventEditor, DzExport } from '@dzcalendar/pro-angular';

@Component({
  imports: [DZ_CALENDAR, DzEventEditor],
  template: `
    <dz-calendar #cal dzEventEditor (editorClosed)="saved($event)" view="resourceTimelineWeek" [resources]="rooms" [events]="events()" />
    <button (click)="exports.download(cal.controller, 'pdf', 'agenda.pdf')">PDF</button>
    <button (click)="exports.download(cal.controller, 'xlsx', 'agenda.xlsx')">Excel</button>
    <button (click)="exports.print(cal.controller)">Imprimer</button>`,
})
export class Planning {
  readonly exports = inject(DzExport);
}
```

`DzExport`: `print`, `pdf`, `png`, `xlsx`, `csv`, `ics`, `download` — with a
`CalendarController` (`#cal` then `cal.controller`, or injected inside a
child of `<dz-calendar>`) or a DOM calendar. The Pro's modules are fetched
on the first use; each call runs outside the zone and resolves inside it.
Bad input never throws: a result's `problems` say it (`not-attached` before
the calendar exists). `import '@dzcalendar/pro'` once registers the
timeline views.

## Notes

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

