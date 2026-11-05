# @dzcalendar/angular

`<dz-calendar>` for Angular 19 to 22: a calendar where every event keeps its own time zone, built on signals only, zoneless or with zone.js.

**English** · [Français](#français)

## What it is

`@dzcalendar/angular` is the Angular binding of [DzCalendar](https://plinthworks.github.io/dzcalendar/), a calendar and scheduler written from scratch on Temporal. Days of 23 h, 25 h or 23 h 30 are drawn as they are, and each event is shown in the zone it was made in.

- **Signal inputs**, **`model()` two-way bindings** for `view`, `date` and `selection`, **`output()`** for what a person does.
- **`[options]`** for every other live option; **`provideDzCalendar()`** / **`DZ_CALENDAR_DEFAULTS`** for creation options and application-wide defaults.
- **Templates** (`dzEventContent`, `dzDayHeader`, `dzResource`…) for your own components inside the calendar, each view checked on its own.
- **A `CalendarController` of signals** for a header or a panel of your own.
- **`ng add @dzcalendar/angular`** sets it all up.

## Install

```bash
ng add @dzcalendar/angular
```

The schematic installs `@dzcalendar/core`, `@dzcalendar/dom` and `@dzcalendar/theme`, puts `node_modules/@dzcalendar/theme/dzcalendar.css` in the build's `styles`, and adds `provideDzCalendar({})` to the application's root providers. Run again, it does not write the providers twice.

It targets the first application of the workspace with a `build` target (or `--project <name>`) and asks, or takes as flags:

| Option | Default | Adds |
|---|---|---|
| `--gsap` | `false` | `gsap` and `@dzcalendar/motion-gsap`, and `provideDzMotion(() => createGsapMotion())`. |
| `--pro` | `false` | `@dzcalendar/pro`, `@dzcalendar/pro-angular` and `@tzslot/dom` (the timeline, the event editor, printing and the exports). |
| `--example` | `true` | An example component, `src/app/agenda.ts` (`<app-agenda />`): a week, each event in its own zone. |
| `--skip-install` | `false` | Does not run the package manager. |

Without the questions: `ng add @dzcalendar/angular --gsap --pro --example`.

Without the schematic:

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/angular
```

Peer dependency: `@angular/core` `^19.0.0 || ^20.0.0 || ^21.0.0 || ^22.0.0`. Add `node_modules/@dzcalendar/theme/dzcalendar.css` to `styles` in `angular.json`.

Other views are opt-in imports, once, anywhere: `import '@dzcalendar/dom/list'` (list views), `import '@dzcalendar/dom/multimonth'` (multi-month year), `import '@dzcalendar/core/recurrence'` (repeating events with `rrule`).

## Quick start

Application-wide settings, optional (without a provider the zone is the browser's and the language the page's, `<html lang>`):

```ts
// app.config.ts
import type { ApplicationConfig } from '@angular/core';
import { provideDzCalendar } from '@dzcalendar/angular';
import '@dzcalendar/core/recurrence'; // repeating events (rrule)

export const appConfig: ApplicationConfig = {
  providers: [provideDzCalendar({ timeZone: 'Europe/Paris', locale: 'fr-FR' })],
};
```

A calendar:

```ts
import { Component, signal } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, EventInstance, PlainDate, Selection } from '@dzcalendar/core';

@Component({
  selector: 'app-agenda',
  imports: [DZ_CALENDAR],
  template: `
    <h2>{{ cal.controller.title() }}</h2>
    <dz-calendar #cal
      timeZone="Europe/Paris"
      [events]="events()"
      [(view)]="view" [(date)]="date" [(selection)]="selection"
      [editable]="true" [selectable]="true"
      (eventClick)="open($event)">
      <ng-template dzEventContent let-event="event" let-ctx="ctx">
        <b>{{ event.title }}</b> {{ ctx.timeText }}
      </ng-template>
    </dz-calendar>`,
})
export class Agenda {
  readonly events = signal<EventInput[]>([
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
    { id: 'b', title: 'Call Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
    { id: 'c', title: 'Day off', start: '2026-10-23', allDay: true },
    { id: 'w', title: 'Rounds', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
  ]);
  readonly view = signal<string | undefined>('timeGridWeek');
  readonly date = signal<PlainDate | undefined>(Temporal.PlainDate.from('2026-10-21'));
  readonly selection = signal<Selection | null>(null);

  open(instance: EventInstance) {
    console.log(instance.event.title);
  }
}
```

`<dz-calendar>` is `display: block`: give it a height (`style="height: 40rem"`).

### Temporal first

`provideDzCalendar()` holds the application's start until Temporal is there: at once where the browser has it, after the polyfill is fetched on Safari and every iOS browser. Keep it in the providers, even with no defaults (without it, each `<dz-calendar>` waits by itself). Temporal values you make yourself come from `@dzcalendar/core` (one polyfill, one set of classes, shared with other DzCalendar and tzslot packages).

## API

### Inputs

Every input, and every key of `[options]`, can change at any time. What changed goes to the calendar, nothing else.

| Input | Type | What it does |
|---|---|---|
| `events` | `readonly EventInput[]` | The events you hold. Diffed by id and value: a new array with the same events redraws nothing. |
| `sources` | `readonly EventSourceSpec[]` | Events the calendar fetches (`jsonSource`, `fnSource`, `liveSource`…). The whole list; a spec is compared by identity, keep each one the same object. |
| `resources` | `readonly ResourceInput[]` | Columns or rows of the resource views (`resourceOrder` and `resourceGroupField` go in `options`). |
| `timeZone` | `ZoneId` | The zone events are shown in. |
| `locale` | `string` | The language and its conventions. |
| `axis` | `'wall' \| 'elapsed'` | Wall-clock rows (a 25-hour day has 25 rows) or elapsed time. Merged into `timeGrid`. |
| `editable`, `selectable` | `boolean` | Drag, resize and keyboard edits; selection. |
| `businessHours` | `BusinessHoursInput` | Business hours. |
| `weekends`, `weekNumbers` | `boolean` | |
| `hiddenDays` | `readonly Weekday[]` | |
| `messages` | `Partial<DzMessages>` | Any of the words, over the locale's. |
| `theme` | `string` | `'standard'`, `'slate'`, `'night'`, `'pastel'`, `'frost'`, `'solar'`, `'contrast'`, or one made with `defineTheme`. |
| `scheme` | `'auto' \| 'light' \| 'dark'` | |
| `density` | `'compact' \| 'comfortable' \| 'spacious'` | |
| `displayCalendar`, `secondaryCalendar` | `string \| null` | The calendar dates are written in (`'islamic-umalqura'`…); a second calendar shown beside each date. |
| `availableSlots` | `readonly AvailableSlot[] \| null` | Bookable slots drawn in the week and day views (`findSlots(...).slots` from `@dzcalendar/slots`). |
| `hooks` | `CalendarHooks` | Classes and mounts for any element, merged with the templates. |
| `options` | `DzCalendarOptions` | Everything else `update()` takes: `headerToolbar`, `firstDay`, `nowIndicator`, `scrollTime`, `dayMaxLanes`, `eventMaxStack`, `allDaySlot`, `displayEventTime`, `eventStyle`, `timeGrid`, `timeline`, `headerViews`, `contextMenu`, `nowRefresh`, `forget`, `onFollowChange`… ([Options](https://plinthworks.github.io/dzcalendar/options/)). |

An input left unbound changes nothing.

### Two-way bindings (`model()`)

`[(view)]` (`string | undefined`), `[(date)]` (`PlainDate | undefined`) and `[(selection)]` (`Selection | null`). They follow the calendar when a person navigates or selects, and drive it when your signal changes. A value the calendar refuses (an unknown view) is reported to Angular's `ErrorHandler`, and the bindings get the calendar's real view and date back.

### Outputs

| Output | Payload | When |
|---|---|---|
| `(eventClick)` | `EventInstance` | An event is clicked. |
| `(dateClick)` | `DateClick` | A day is clicked. |
| `(slotClick)` | `AvailableSlot` | A free slot is clicked (or Enter on it). Book it; your server checks again. |
| `(eventChange)` | `EventChange` | A person changed an event (drag, resize, keyboard, menu, editor), not what your own code ran without `validate`. Persist it; call `change.revert()` if the server refuses. |
| `(eventOpen)` | `EventInstance` | "Open" in the menu. |
| `(createRequest)` | `CreateRequest` | "New event here" in the menu. |
| `(selected)` | `Selection` | A person made a selection (`selection` follows it too). |
| `(dropped)` | `DropInfo` | An element of the page was dropped here (`makeDraggable`), its event made. |
| `(eventReceive)` | `EventChange` | An event came in; `revert()` takes it back. |
| `(eventLeave)` | `EventLeave` | An event went to another calendar; `revert()` puts it back on both. |
| `(sourceNotice)` | `SourceNotice` | Loading, a failed fetch, problems in a delivery, a refused save. |
| `(problems)` | `NormalizationReport` | What the `events` given could not be read as. |
| `(resourceProblems)` | `readonly Problem[]` | What the `resources` given could not be read as. |
| `(problem)` | `CalendarProblem` | Something the calendar could not do as asked, found while drawing; also said on the console, once per code. |

`(eventOpen)`, `(createRequest)` and `(slotClick)` change what the calendar offers ("Open" in the menu, "New event here", slots as buttons): they are offered only when something listens.

### Templates

Each is an `<ng-template>` inside `<dz-calendar>`, your components in your injector. `DZ_CALENDAR` imports all of them. Each event's view is checked on its own, only when that event's content changed.

| Directive | Context |
|---|---|
| `dzEventContent` | `let-event` (or `let-event="event"`), `let-ctx="ctx"`: `ctx` has `instance`, `timeText`, `displayZone`, `family` and, for a background event, `background`. An empty template leaves a background event mute (wrap the content in `@if (!ctx.background)`). |
| `dzDayHeader` | `let-day`: `day.date`, `day.resource`, `day.lengthMinutes` (1 380 or 1 500 on a clock change), `day.text`; `ctx` is the same object. |
| `dzHeaderItem="name"` | `let-ctx`: your place in the header, named in `headerToolbar`; `ctx` has `name` and the `title`. |
| `dzDayCell`, `dzSlotLabel`, `dzAllDayLabel`, `dzMoreLink`, `dzNowIndicator`, `dzWeekNumber`, `dzNoEvents`, `dzListDayHeader`, `dzMonthHeader`, `dzResource`, `dzResourceGroupHeader`, `dzResourceAreaHeader` | `let-ctx`. |

```ts
import { Component } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import type { DzCalendarOptions } from '@dzcalendar/angular';
import type { ResourceInput } from '@dzcalendar/core';
import '@dzcalendar/pro';

@Component({
  selector: 'app-rooms',
  imports: [DZ_CALENDAR],
  template: `
    <dz-calendar timeZone="Europe/Paris" view="resourceTimelineDay" [resources]="rooms" [options]="options">
      <ng-template dzHeaderItem="filter" let-ctx><input [placeholder]="'Filter ' + ctx.title" /></ng-template>
      <ng-template dzDayHeader let-day><span>{{ day.text }}</span></ng-template>
      <ng-template dzResource let-ctx><b>{{ ctx.resource.title }}</b></ng-template>
      <ng-template dzEventContent let-event let-ctx="ctx">
        @if (!ctx.background) { <b>{{ event.title }}</b> }
      </ng-template>
    </dz-calendar>`,
})
export class Rooms {
  readonly rooms: ResourceInput[] = [{ id: 'r1', title: 'Room 1' }, { id: 'r2', title: 'Room 2' }];
  readonly options: DzCalendarOptions = { headerToolbar: { start: 'prev,next', center: 'title', end: 'filter resourceTimelineDay' } };
}
```

### `[options]` and creation options

Two sets of options exist:

- **Live options**: the inputs above, and `[options]` for the rest. They can change at any time. Keep an `[options]` object stable (a field or a signal), or write it as a literal in the template; what has not changed redraws nothing.
- **Creation options**, read once, when the calendar is made: `now`, `kernel`, `store`, `views` (your own views), `historyLimit`, `titleFormat`, `injectStyles`, `cssLayers`… They go through `provideDzCalendar({ … })` for the application, or `DZ_CALENDAR_DEFAULTS` in a component's `providers` for its calendars. Anything set on a `<dz-calendar>` still wins over the defaults.

```ts
import { Component } from '@angular/core';
import { DZ_CALENDAR, DZ_CALENDAR_DEFAULTS } from '@dzcalendar/angular';
import '@dzcalendar/pro';

@Component({
  selector: 'app-supervision-board',
  imports: [DZ_CALENDAR],
  // A view of the application's own is read once, when the calendar is made.
  providers: [{ provide: DZ_CALENDAR_DEFAULTS, useValue: { views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } } } }],
  template: `<dz-calendar view="supervision" timeZone="Europe/Paris" [resources]="[{ id: 'import', title: 'Import' }]" />`,
})
export class SupervisionBoard {}
```

### Providers

- **`provideDzCalendar(defaults = {})`**: the options every calendar starts from (any option except `kernel`, `hooks` and `headerItems`, which are each calendar's own), and the application initializer that loads Temporal. The token behind it is `DZ_CALENDAR_DEFAULTS` (`DzCalendarDefaults`).
- **`provideDzMotion(() => createGsapMotion({ preset: 'sober' }))`**: the motion of every `<dz-calendar>`, from `@dzcalendar/motion-gsap` (optional). The function is called once per calendar (a drag's state belongs to its adapter). A `motion` given to `provideDzCalendar` or to a calendar wins. A factory that fails is reported to Angular's `ErrorHandler` and the calendar is drawn still. The token is `DZ_MOTION`.

```ts
import type { ApplicationConfig } from '@angular/core';
import { provideDzCalendar, provideDzMotion } from '@dzcalendar/angular';
import { createGsapMotion } from '@dzcalendar/motion-gsap';

export const appConfig: ApplicationConfig = {
  providers: [provideDzCalendar({ timeZone: 'Europe/Paris', locale: 'fr-FR' }), provideDzMotion(() => createGsapMotion({ preset: 'sober' }))],
};
```

### The controller

`CalendarController` is provided by each `<dz-calendar>`: `#cal` then `cal.controller` in a template, or `inject(CalendarController)` in a component created inside the calendar (such as one drawn by a `dzEventContent` template). The component also gives `cal.instance`, the DOM calendar for what nothing else covers.

| Signal | |
|---|---|
| `title`, `view`, `date`, `range` | Computed from the calendar's state (`''` / `null` before it is drawn). |
| `state`, `instance` | The kernel's state; the DOM calendar (`null` before it is drawn and after). |
| `canUndo`, `canRedo`, `loading`, `problems` | What can be undone or redone, a source is fetching, what the last load reported. |

| Method | |
|---|---|
| `prev()`, `next()`, `today()` | Navigate. |
| `goTo(date)`, `changeView(view)` | Go to a date, change view. |
| `shift(by)` | Slides a timeline by hours and minutes (`{ minutes: -15 }`); `false` when the view does not slide; a duration in days (or weeks, months, years) throws a `RangeError`, as `timeline.step` does. |
| `dispatch(command, { validate? })` | Runs a command, returns a `CommandResult` (`ok`, `problems`). Without `validate`, not reported to `(eventChange)` (with `{ validate: true }` it is, as a person's change): persist it where your code runs it. |
| `undo()`, `redo()` | Return `boolean`. |
| `refetch(sourceId?)` | Fetches the sources again. |

Before the calendar is drawn, methods do nothing, and `dispatch` answers a refused `CommandResult`.

```ts
import { Component, inject } from '@angular/core';
import { CalendarController, DZ_CALENDAR } from '@dzcalendar/angular';

@Component({
  selector: 'app-undo',
  template: `<button [disabled]="!cal.canUndo()" (click)="cal.undo()">Undo</button>`,
})
export class UndoButton {
  readonly cal = inject(CalendarController);
}

@Component({
  selector: 'app-planner',
  imports: [DZ_CALENDAR, UndoButton],
  template: `
    <button (click)="calendar.controller.prev()">‹</button>
    <h2>{{ calendar.controller.title() }}</h2>
    <button (click)="calendar.controller.next()">›</button>
    <dz-calendar #calendar timeZone="Europe/Paris" [editable]="true">
      <ng-template dzEventContent let-event><b>{{ event.title }}</b> <app-undo /></ng-template>
    </dz-calendar>`,
})
export class Planner {}
```

### Zoneless and zone.js

The calendar runs outside change detection and writes signals, which schedule it. Under zone.js it is created outside the zone, and only what it emits comes back in. Check your templates with `ng build`, not `tsc`: only the Angular compiler reads them.

### From FullCalendar options

`<dz-calendar [dzFullCalendar]="calendarOptions">` (from `@dzcalendar/angular/fullcalendar`, needing the optional peer `@dzcalendar/compat-fullcalendar`) lays an existing FullCalendar options object on the calendar. See [Migrating from FullCalendar](https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/).

### Server rendering

Importing the package touches no `document` or `window`; the calendar is made in `ngOnInit`, in the component's own element.

## Recipes

### Save what a person changes

```ts
import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import type { EventInput } from '@dzcalendar/core';
import type { EventChange } from '@dzcalendar/dom';

@Component({
  selector: 'app-appointments',
  imports: [DZ_CALENDAR],
  template: `<dz-calendar timeZone="Europe/Paris" [events]="events()" [editable]="true" (eventChange)="save($event)" />`,
})
export class Appointments {
  private readonly http = inject(HttpClient);
  readonly events = signal<EventInput[]>([]);

  save(change: EventChange) {
    const moved = change.after;
    if (!moved) return;
    this.http.patch(`/api/appointments/${moved.id}`, { start: moved.start.toString(), end: moved.end.toString() }).subscribe({
      // Refused by the server: exactly this change is taken back.
      error: () => change.revert(),
    });
  }
}
```

`change.revert()` takes back exactly that change, even if another came after it; it returns `false`, and changes nothing, when the event was changed again since.

### Events from a server

```ts
import { Component } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import { jsonSource } from '@dzcalendar/core';

@Component({
  selector: 'app-remote',
  imports: [DZ_CALENDAR],
  template: `<dz-calendar timeZone="Europe/Paris" [sources]="sources" />`,
})
export class Remote {
  // Stable: a source is compared by identity.
  readonly sources = [jsonSource('team', { url: '/api/events' })];
}
```

### Supervision: a timeline that follows the present

The timeline views are the Pro's (`import '@dzcalendar/pro'`, once). This screen shows what is running now: a three-day custom view with a four-hour window that slides with the clock (`span`, `follow`), a tick every minute (`ticks`), a card per run, an ongoing run with no end yet (`ongoing`), a marker for an alert, a maintenance window as a background event, a feed that tells the calendar about new runs (`liveSource`, from `@dzcalendar/core/live`), and a "Back to live" button shown while following is paused (`onFollowChange`).

```ts
import { Component, signal, viewChild } from '@angular/core';
import { DZ_CALENDAR, DZ_CALENDAR_DEFAULTS, DzCalendar } from '@dzcalendar/angular';
import type { DzCalendarOptions } from '@dzcalendar/angular';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { liveSource } from '@dzcalendar/core/live';
import type { LiveMessage } from '@dzcalendar/core/live';
import '@dzcalendar/pro';

@Component({
  selector: 'app-supervision',
  imports: [DZ_CALENDAR],
  // A view of the application's own is read once, when the calendar is made: in Angular, in the defaults.
  providers: [{ provide: DZ_CALENDAR_DEFAULTS, useValue: { views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } } } }],
  template: `
    @if (!following()) { <button (click)="cal().controller.today()">Back to live</button> }
    <dz-calendar #calendar view="supervision" [date]="date" timeZone="Europe/Paris" scheme="light"
      [resources]="processes" [events]="events" [sources]="sources" [options]="options">
      <ng-template dzEventContent let-event let-ctx="ctx">
        @if (ctx.background) {
          <span class="maint">{{ event.title }}</span>
        } @else {
          <div class="card" [class.card--failed]="event.props.status === 'failed'">
            <b>{{ event.title }}</b> <span class="pill">{{ event.props.status }}</span>
          </div>
        }
      </ng-template>
    </dz-calendar>`,
})
export class Supervision {
  readonly cal = viewChild.required<DzCalendar>('calendar');
  readonly following = signal(true);
  readonly date = Temporal.PlainDate.from('2026-10-21');

  readonly processes: ResourceInput[] = [
    { id: 'import', title: 'Order import' },
    { id: 'backup', title: 'Backup' },
  ];

  readonly events: EventInput[] = [
    // Ongoing: no end yet, it grows with the clock.
    { id: 'run', title: 'Order import', start: '2026-10-21T11:00[Europe/Paris]', resourceId: 'import', ongoing: true, extendedProps: { status: 'running' } },
    // A marker: an instant, not a duration.
    { id: 'alert', title: 'Disk almost full', start: '2026-10-21T11:20:41[Europe/Paris]', resourceId: 'import', display: 'marker', tone: 'red' },
    // A background event: a maintenance window behind the rows.
    { id: 'maint', title: 'Maintenance', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 2 }, resourceId: 'backup', display: 'background', tone: 'violet' },
  ];

  // The feed tells the calendar: each message creates, updates or removes an event.
  readonly sources = [
    liveSource('feed', {
      connect: (emit) => {
        const socket = new WebSocket('wss://example.com/runs');
        socket.onmessage = (m) => emit(JSON.parse(String(m.data)) as LiveMessage);
        return () => socket.close();
      },
    }),
  ];

  readonly options: DzCalendarOptions = {
    // Four hours on screen in quarters of an hour, the present kept 5 minutes from the left edge, a tick every minute (the time written every fifth).
    timeline: { slot: 15, span: { hours: 4 }, step: { minutes: 15 }, follow: { before: { minutes: 5 } }, ticks: { every: 1, label: 5 }, maxLanes: 4 },
    nowRefresh: { seconds: 5 },
    forget: { olderThan: { days: 7 } },
    // false when the person scrolled or slid away; true again after "Today".
    onFollowChange: (following: boolean) => this.following.set(following),
  };
}
```

What the settings do: `timeline.span` is the time on screen at once (a slot's width is the room shared by that many slots); `timeline.follow` keeps the present in view (`true`, or `{ before }` to keep a little of what just happened) and pauses as soon as the person moves along time; `timeline.step` is what the arrows slide by; `timeline.ticks` draws small ticks inside each slot; `nowRefresh` is how often the present is re-read; `forget: { olderThan }` lets go of events that ended longer ago; `onFollowChange` hears following pause or resume. `controller.shift({ minutes: -45 })` slides by any number of hours and minutes. All of `timeline`, `nowRefresh`, `forget` and `onFollowChange` are live: change `[options]` and the screen follows. See [`timeline`](https://plinthworks.github.io/dzcalendar/options/timeline/) and [`onFollowChange`](https://plinthworks.github.io/dzcalendar/options/on-follow-change/).

The Pro's editor and exports for Angular are in [`@dzcalendar/pro-angular`](https://www.npmjs.com/package/@dzcalendar/pro-angular).

## Documentation

- [Angular guide](https://plinthworks.github.io/dzcalendar/getting-started/angular/)
- [Installation](https://plinthworks.github.io/dzcalendar/getting-started/installation/)
- [Migrating from FullCalendar](https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/)
- [Options](https://plinthworks.github.io/dzcalendar/options/) and [API](https://plinthworks.github.io/dzcalendar/api/)
- Guides: [Events](https://plinthworks.github.io/dzcalendar/guides/events/), [Event sources](https://plinthworks.github.io/dzcalendar/guides/event-sources/), [Time zones](https://plinthworks.github.io/dzcalendar/guides/time-zones/), [Views](https://plinthworks.github.io/dzcalendar/guides/views/), [Drag and drop](https://plinthworks.github.io/dzcalendar/guides/drag-and-drop/), [Selection](https://plinthworks.github.io/dzcalendar/guides/selection/), [Recurrence](https://plinthworks.github.io/dzcalendar/guides/recurrence/), [Theming](https://plinthworks.github.io/dzcalendar/guides/theming/), [Keyboard and accessibility](https://plinthworks.github.io/dzcalendar/guides/keyboard-accessibility/), [Languages](https://plinthworks.github.io/dzcalendar/guides/languages/), [Resources and timeline](https://plinthworks.github.io/dzcalendar/guides/resources-timeline/)

## License

MIT

---

## Français

`<dz-calendar>` pour Angular 19 à 22 : un calendrier où chaque événement garde son fuseau horaire, construit sur les signaux seulement, sans zone ou avec zone.js.

[English](#dzcalendarangular) · **Français**

### Ce que c'est

`@dzcalendar/angular` est la liaison Angular de [DzCalendar](https://plinthworks.github.io/dzcalendar/fr/), un calendrier et planificateur écrit de zéro sur Temporal. Les jours de 23 h, 25 h ou 23 h 30 sont dessinés tels qu'ils sont, et chaque événement est montré dans le fuseau où il a été créé.

- **Inputs en signaux**, **liaisons bidirectionnelles `model()`** pour `view`, `date` et `selection`, **`output()`** pour ce que fait une personne.
- **`[options]`** pour toutes les autres options vives ; **`provideDzCalendar()`** / **`DZ_CALENDAR_DEFAULTS`** pour les options de création et les valeurs par défaut de l'application.
- **Des gabarits** (`dzEventContent`, `dzDayHeader`, `dzResource`…) pour vos propres composants dans le calendrier, chaque vue vérifiée isolément.
- **Un `CalendarController` de signaux** pour un en-tête ou un panneau à vous.
- **`ng add @dzcalendar/angular`** installe tout.

### Installation

```bash
ng add @dzcalendar/angular
```

Le schematic installe `@dzcalendar/core`, `@dzcalendar/dom` et `@dzcalendar/theme`, met `node_modules/@dzcalendar/theme/dzcalendar.css` dans les `styles` du build, et ajoute `provideDzCalendar({})` aux providers racine de l'application. Relancé, il n'écrit pas les providers deux fois.

Il vise la première application de l'espace de travail ayant une cible `build` (ou `--project <nom>`) et demande, ou prend en options :

| Option | Défaut | Ajoute |
|---|---|---|
| `--gsap` | `false` | `gsap` et `@dzcalendar/motion-gsap`, et `provideDzMotion(() => createGsapMotion())`. |
| `--pro` | `false` | `@dzcalendar/pro`, `@dzcalendar/pro-angular` et `@tzslot/dom` (la timeline, l'éditeur d'événements, l'impression et les exports). |
| `--example` | `true` | Un composant d'exemple, `src/app/agenda.ts` (`<app-agenda />`) : une semaine, chaque événement dans son fuseau. |
| `--skip-install` | `false` | Ne lance pas le gestionnaire de paquets. |

Sans les questions : `ng add @dzcalendar/angular --gsap --pro --example`.

Sans le schematic :

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/angular
```

Dépendance homologue : `@angular/core` `^19.0.0 || ^20.0.0 || ^21.0.0 || ^22.0.0`. Ajoutez `node_modules/@dzcalendar/theme/dzcalendar.css` aux `styles` d'`angular.json`.

Les autres vues sont des imports à la demande, une fois, n'importe où : `import '@dzcalendar/dom/list'` (vues liste), `import '@dzcalendar/dom/multimonth'` (année multi-mois), `import '@dzcalendar/core/recurrence'` (événements récurrents avec `rrule`).

### Démarrage rapide

Réglages de toute l'application, facultatifs (sans provider, le fuseau est celui du navigateur et la langue celle de la page, `<html lang>`) :

```ts
// app.config.ts
import type { ApplicationConfig } from '@angular/core';
import { provideDzCalendar } from '@dzcalendar/angular';
import '@dzcalendar/core/recurrence'; // événements récurrents (rrule)

export const appConfig: ApplicationConfig = {
  providers: [provideDzCalendar({ timeZone: 'Europe/Paris', locale: 'fr-FR' })],
};
```

Un calendrier :

```ts
import { Component, signal } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, EventInstance, PlainDate, Selection } from '@dzcalendar/core';

@Component({
  selector: 'app-agenda',
  imports: [DZ_CALENDAR],
  template: `
    <h2>{{ cal.controller.title() }}</h2>
    <dz-calendar #cal
      timeZone="Europe/Paris"
      [events]="events()"
      [(view)]="view" [(date)]="date" [(selection)]="selection"
      [editable]="true" [selectable]="true"
      (eventClick)="open($event)">
      <ng-template dzEventContent let-event="event" let-ctx="ctx">
        <b>{{ event.title }}</b> {{ ctx.timeText }}
      </ng-template>
    </dz-calendar>`,
})
export class Agenda {
  readonly events = signal<EventInput[]>([
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
    { id: 'b', title: 'Appel Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
    { id: 'c', title: 'Jour off', start: '2026-10-23', allDay: true },
    { id: 'w', title: 'Tournée', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
  ]);
  readonly view = signal<string | undefined>('timeGridWeek');
  readonly date = signal<PlainDate | undefined>(Temporal.PlainDate.from('2026-10-21'));
  readonly selection = signal<Selection | null>(null);

  open(instance: EventInstance) {
    console.log(instance.event.title);
  }
}
```

`<dz-calendar>` est en `display: block` : donnez-lui une hauteur (`style="height: 40rem"`).

#### Temporal d'abord

`provideDzCalendar()` retient le démarrage de l'application jusqu'à ce que Temporal soit là : tout de suite là où le navigateur l'a, après l'arrivée du polyfill sur Safari et tous les navigateurs d'iOS. Gardez-le dans les providers, même sans valeurs par défaut (sans lui, chaque `<dz-calendar>` attend de son côté). Les valeurs Temporal que vous fabriquez viennent de `@dzcalendar/core` (un seul polyfill, un seul jeu de classes, partagé avec les autres paquets DzCalendar et tzslot).

### API

#### Inputs

Chaque input, et chaque clé de `[options]`, peut changer à tout moment. Ce qui a changé va au calendrier, rien d'autre.

| Input | Type | Rôle |
|---|---|---|
| `events` | `readonly EventInput[]` | Les événements que vous tenez. Comparés par id et par valeur : un nouveau tableau aux mêmes événements ne redessine rien. |
| `sources` | `readonly EventSourceSpec[]` | Des événements que le calendrier va chercher (`jsonSource`, `fnSource`, `liveSource`…). La liste entière ; une spec est comparée par identité, gardez chacune identique. |
| `resources` | `readonly ResourceInput[]` | Colonnes ou lignes des vues par ressources (`resourceOrder` et `resourceGroupField` vont dans `options`). |
| `timeZone` | `ZoneId` | Le fuseau dans lequel les événements sont montrés. |
| `locale` | `string` | La langue et ses conventions. |
| `axis` | `'wall' \| 'elapsed'` | Lignes à l'heure murale (un jour de 25 h a 25 lignes) ou temps écoulé. Fusionné dans `timeGrid`. |
| `editable`, `selectable` | `boolean` | Glisser, redimensionner et édition au clavier ; sélection. |
| `businessHours` | `BusinessHoursInput` | Heures ouvrées. |
| `weekends`, `weekNumbers` | `boolean` | |
| `hiddenDays` | `readonly Weekday[]` | |
| `messages` | `Partial<DzMessages>` | N'importe lequel des mots, par-dessus ceux de la langue. |
| `theme` | `string` | `'standard'`, `'slate'`, `'night'`, `'pastel'`, `'frost'`, `'solar'`, `'contrast'`, ou un thème fait avec `defineTheme`. |
| `scheme` | `'auto' \| 'light' \| 'dark'` | |
| `density` | `'compact' \| 'comfortable' \| 'spacious'` | |
| `displayCalendar`, `secondaryCalendar` | `string \| null` | Le calendrier dans lequel les dates sont écrites (`'islamic-umalqura'`…) ; un second calendrier montré à côté de chaque date. |
| `availableSlots` | `readonly AvailableSlot[] \| null` | Créneaux réservables dessinés dans les vues semaine et jour (`findSlots(...).slots` de `@dzcalendar/slots`). |
| `hooks` | `CalendarHooks` | Classes et montages pour n'importe quel élément, fusionnés avec les gabarits. |
| `options` | `DzCalendarOptions` | Tout le reste de ce que `update()` accepte : `headerToolbar`, `firstDay`, `nowIndicator`, `scrollTime`, `dayMaxLanes`, `eventMaxStack`, `allDaySlot`, `displayEventTime`, `eventStyle`, `timeGrid`, `timeline`, `headerViews`, `contextMenu`, `nowRefresh`, `forget`, `onFollowChange`… ([Options](https://plinthworks.github.io/dzcalendar/fr/options/)). |

Un input non lié ne change rien.

#### Liaisons bidirectionnelles (`model()`)

`[(view)]` (`string | undefined`), `[(date)]` (`PlainDate | undefined`) et `[(selection)]` (`Selection | null`). Elles suivent le calendrier quand une personne navigue ou sélectionne, et le pilotent quand votre signal change. Une valeur que le calendrier refuse (une vue inconnue) est signalée à l'`ErrorHandler` d'Angular, et les liaisons reçoivent en retour la vraie vue et la vraie date.

#### Outputs

| Output | Charge | Quand |
|---|---|---|
| `(eventClick)` | `EventInstance` | Un événement est cliqué. |
| `(dateClick)` | `DateClick` | Un jour est cliqué. |
| `(slotClick)` | `AvailableSlot` | Un créneau libre est cliqué (ou Entrée dessus). Réservez-le ; votre serveur revérifie. |
| `(eventChange)` | `EventChange` | Une personne a modifié un événement (glisser, redimensionner, clavier, menu, éditeur), pas ce que votre propre code a exécuté sans `validate`. Enregistrez-le ; appelez `change.revert()` si le serveur refuse. |
| `(eventOpen)` | `EventInstance` | « Ouvrir » dans le menu. |
| `(createRequest)` | `CreateRequest` | « Nouvel événement ici » dans le menu. |
| `(selected)` | `Selection` | Une personne a fait une sélection (`selection` la suit aussi). |
| `(dropped)` | `DropInfo` | Un élément de la page a été déposé ici (`makeDraggable`), son événement créé. |
| `(eventReceive)` | `EventChange` | Un événement est arrivé ; `revert()` le reprend. |
| `(eventLeave)` | `EventLeave` | Un événement est parti vers un autre calendrier ; `revert()` le remet sur les deux. |
| `(sourceNotice)` | `SourceNotice` | Chargement, échec d'une requête, problèmes dans une livraison, enregistrement refusé. |
| `(problems)` | `NormalizationReport` | Ce que les `events` donnés n'ont pas pu être lus comme. |
| `(resourceProblems)` | `readonly Problem[]` | Ce que les `resources` données n'ont pas pu être lues comme. |
| `(problem)` | `CalendarProblem` | Ce que le calendrier n'a pas pu faire comme demandé, trouvé en dessinant ; dit aussi sur la console, une fois par code. |

`(eventOpen)`, `(createRequest)` et `(slotClick)` changent ce que le calendrier propose (« Ouvrir » dans le menu, « Nouvel événement ici », créneaux en boutons) : ils ne sont proposés que si quelqu'un écoute.

#### Gabarits

Chacun est un `<ng-template>` dans `<dz-calendar>`, vos composants dans votre injecteur. `DZ_CALENDAR` les importe tous. La vue de chaque événement est vérifiée isolément, seulement quand le contenu de cet événement a changé.

| Directive | Contexte |
|---|---|
| `dzEventContent` | `let-event` (ou `let-event="event"`), `let-ctx="ctx"` : `ctx` a `instance`, `timeText`, `displayZone`, `family` et, pour un événement d'arrière-plan, `background`. Un gabarit vide laisse un événement d'arrière-plan muet (enveloppez le contenu dans `@if (!ctx.background)`). |
| `dzDayHeader` | `let-day` : `day.date`, `day.resource`, `day.lengthMinutes` (1 380 ou 1 500 lors d'un changement d'heure), `day.text` ; `ctx` est le même objet. |
| `dzHeaderItem="nom"` | `let-ctx` : votre place dans l'en-tête, nommée dans `headerToolbar` ; `ctx` a `name` et le `title`. |
| `dzDayCell`, `dzSlotLabel`, `dzAllDayLabel`, `dzMoreLink`, `dzNowIndicator`, `dzWeekNumber`, `dzNoEvents`, `dzListDayHeader`, `dzMonthHeader`, `dzResource`, `dzResourceGroupHeader`, `dzResourceAreaHeader` | `let-ctx`. |

```ts
import { Component } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import type { DzCalendarOptions } from '@dzcalendar/angular';
import type { ResourceInput } from '@dzcalendar/core';
import '@dzcalendar/pro';

@Component({
  selector: 'app-salles',
  imports: [DZ_CALENDAR],
  template: `
    <dz-calendar timeZone="Europe/Paris" view="resourceTimelineDay" [resources]="salles" [options]="options">
      <ng-template dzHeaderItem="filter" let-ctx><input [placeholder]="'Filtrer ' + ctx.title" /></ng-template>
      <ng-template dzDayHeader let-day><span>{{ day.text }}</span></ng-template>
      <ng-template dzResource let-ctx><b>{{ ctx.resource.title }}</b></ng-template>
      <ng-template dzEventContent let-event let-ctx="ctx">
        @if (!ctx.background) { <b>{{ event.title }}</b> }
      </ng-template>
    </dz-calendar>`,
})
export class Salles {
  readonly salles: ResourceInput[] = [{ id: 'r1', title: 'Salle 1' }, { id: 'r2', title: 'Salle 2' }];
  readonly options: DzCalendarOptions = { headerToolbar: { start: 'prev,next', center: 'title', end: 'filter resourceTimelineDay' } };
}
```

#### `[options]` et options de création

Il y a deux sortes d'options :

- **Options vives** : les inputs ci-dessus, et `[options]` pour le reste. Elles peuvent changer à tout moment. Gardez un objet `[options]` stable (un champ ou un signal), ou écrivez-le en littéral dans le gabarit ; ce qui n'a pas changé ne redessine rien.
- **Options de création**, lues une fois, quand le calendrier est fait : `now`, `kernel`, `store`, `views` (vos propres vues), `historyLimit`, `titleFormat`, `injectStyles`, `cssLayers`… Elles passent par `provideDzCalendar({ … })` pour l'application, ou par `DZ_CALENDAR_DEFAULTS` dans les `providers` d'un composant pour ses calendriers. Ce qui est posé sur un `<dz-calendar>` l'emporte toujours sur les valeurs par défaut.

```ts
import { Component } from '@angular/core';
import { DZ_CALENDAR, DZ_CALENDAR_DEFAULTS } from '@dzcalendar/angular';
import '@dzcalendar/pro';

@Component({
  selector: 'app-tableau-supervision',
  imports: [DZ_CALENDAR],
  // Une vue propre à l'application est lue une fois, à la création du calendrier.
  providers: [{ provide: DZ_CALENDAR_DEFAULTS, useValue: { views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } } } }],
  template: `<dz-calendar view="supervision" timeZone="Europe/Paris" [resources]="[{ id: 'import', title: 'Import' }]" />`,
})
export class TableauSupervision {}
```

#### Providers

- **`provideDzCalendar(defaults = {})`** : les options dont part chaque calendrier (toute option sauf `kernel`, `hooks` et `headerItems`, propres à chaque calendrier), et l'initialiseur d'application qui charge Temporal. Le jeton derrière est `DZ_CALENDAR_DEFAULTS` (`DzCalendarDefaults`).
- **`provideDzMotion(() => createGsapMotion({ preset: 'sober' }))`** : le mouvement de tous les `<dz-calendar>`, depuis `@dzcalendar/motion-gsap` (facultatif). La fonction est appelée une fois par calendrier (l'état d'un glisser appartient à son adaptateur). Un `motion` donné à `provideDzCalendar` ou à un calendrier l'emporte. Une fabrique qui échoue est signalée à l'`ErrorHandler` d'Angular et le calendrier est dessiné quand même. Le jeton est `DZ_MOTION`.

```ts
import type { ApplicationConfig } from '@angular/core';
import { provideDzCalendar, provideDzMotion } from '@dzcalendar/angular';
import { createGsapMotion } from '@dzcalendar/motion-gsap';

export const appConfig: ApplicationConfig = {
  providers: [provideDzCalendar({ timeZone: 'Europe/Paris', locale: 'fr-FR' }), provideDzMotion(() => createGsapMotion({ preset: 'sober' }))],
};
```

#### Le contrôleur

`CalendarController` est fourni par chaque `<dz-calendar>` : `#cal` puis `cal.controller` dans un gabarit, ou `inject(CalendarController)` dans un composant créé à l'intérieur du calendrier (comme un composant dessiné par un gabarit `dzEventContent`). Le composant donne aussi `cal.instance`, le calendrier DOM pour ce que rien d'autre ne couvre.

| Signal | |
|---|---|
| `title`, `view`, `date`, `range` | Calculés depuis l'état du calendrier (`''` / `null` avant qu'il soit dessiné). |
| `state`, `instance` | L'état du noyau ; le calendrier DOM (`null` avant qu'il soit dessiné et après). |
| `canUndo`, `canRedo`, `loading`, `problems` | Ce qui peut être annulé ou rétabli, une source charge, ce qu'a signalé le dernier chargement. |

| Méthode | |
|---|---|
| `prev()`, `next()`, `today()` | Naviguer. |
| `goTo(date)`, `changeView(view)` | Aller à une date, changer de vue. |
| `shift(by)` | Fait glisser une timeline d'un nombre d'heures et de minutes (`{ minutes: -15 }`) ; `false` quand la vue ne glisse pas ; une durée en jours (ou semaines, mois, années) lève une `RangeError`, comme `timeline.step`. |
| `dispatch(command, { validate? })` | Exécute une commande, renvoie un `CommandResult` (`ok`, `problems`). Sans `validate`, non signalée à `(eventChange)` (avec `{ validate: true }` elle l'est, comme le changement d'une personne) : enregistrez-la là où votre code l'exécute. |
| `undo()`, `redo()` | Renvoient un `boolean`. |
| `refetch(sourceId?)` | Redemande les sources. |

Avant que le calendrier soit dessiné, les méthodes ne font rien et `dispatch` répond un `CommandResult` refusé.

```ts
import { Component, inject } from '@angular/core';
import { CalendarController, DZ_CALENDAR } from '@dzcalendar/angular';

@Component({
  selector: 'app-annuler',
  template: `<button [disabled]="!cal.canUndo()" (click)="cal.undo()">Annuler</button>`,
})
export class BoutonAnnuler {
  readonly cal = inject(CalendarController);
}

@Component({
  selector: 'app-planning',
  imports: [DZ_CALENDAR, BoutonAnnuler],
  template: `
    <button (click)="calendar.controller.prev()">‹</button>
    <h2>{{ calendar.controller.title() }}</h2>
    <button (click)="calendar.controller.next()">›</button>
    <dz-calendar #calendar timeZone="Europe/Paris" [editable]="true">
      <ng-template dzEventContent let-event><b>{{ event.title }}</b> <app-annuler /></ng-template>
    </dz-calendar>`,
})
export class Planning {}
```

#### Sans zone et zone.js

Le calendrier tourne hors de la détection de changements et écrit des signaux, qui la déclenchent. Sous zone.js, il est créé hors de la zone, et seul ce qu'il émet y revient. Vérifiez vos gabarits avec `ng build`, pas `tsc` : seul le compilateur Angular les lit.

#### Depuis les options de FullCalendar

`<dz-calendar [dzFullCalendar]="calendarOptions">` (de `@dzcalendar/angular/fullcalendar`, qui demande la dépendance homologue facultative `@dzcalendar/compat-fullcalendar`) pose un objet d'options FullCalendar existant sur le calendrier. Voir [Migrer depuis FullCalendar](https://plinthworks.github.io/dzcalendar/fr/getting-started/migrating-from-fullcalendar/).

#### Rendu serveur

L'import du paquet ne touche ni `document` ni `window` ; le calendrier se crée dans `ngOnInit`, dans l'élément propre du composant.

### Recettes

#### Enregistrer ce qu'une personne change

```ts
import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import type { EventInput } from '@dzcalendar/core';
import type { EventChange } from '@dzcalendar/dom';

@Component({
  selector: 'app-rendez-vous',
  imports: [DZ_CALENDAR],
  template: `<dz-calendar timeZone="Europe/Paris" [events]="events()" [editable]="true" (eventChange)="save($event)" />`,
})
export class RendezVous {
  private readonly http = inject(HttpClient);
  readonly events = signal<EventInput[]>([]);

  save(change: EventChange) {
    const moved = change.after;
    if (!moved) return;
    this.http.patch(`/api/rendez-vous/${moved.id}`, { start: moved.start.toString(), end: moved.end.toString() }).subscribe({
      // Refusé par le serveur : exactement ce changement est repris.
      error: () => change.revert(),
    });
  }
}
```

`change.revert()` reprend exactement ce changement, même si un autre est venu après ; il renvoie `false`, sans rien changer, quand l'événement a encore changé depuis.

#### Des événements depuis un serveur

```ts
import { Component } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import { jsonSource } from '@dzcalendar/core';

@Component({
  selector: 'app-distant',
  imports: [DZ_CALENDAR],
  template: `<dz-calendar timeZone="Europe/Paris" [sources]="sources" />`,
})
export class Distant {
  // Stable : une source est comparée par identité.
  readonly sources = [jsonSource('equipe', { url: '/api/evenements' })];
}
```

#### Supervision : une timeline qui suit le présent

Les vues timeline sont celles du Pro (`import '@dzcalendar/pro'`, une fois). Cet écran montre ce qui tourne maintenant : une vue sur mesure de trois jours avec une fenêtre de quatre heures qui glisse avec l'horloge (`span`, `follow`), un trait chaque minute (`ticks`), une carte par exécution, une exécution en cours sans fin connue (`ongoing`), un repère pour une alerte, une fenêtre de maintenance en événement d'arrière-plan, un flux qui informe le calendrier des nouvelles exécutions (`liveSource`, de `@dzcalendar/core/live`), et un bouton « Retour au direct » affiché tant que le suivi est en pause (`onFollowChange`).

```ts
import { Component, signal, viewChild } from '@angular/core';
import { DZ_CALENDAR, DZ_CALENDAR_DEFAULTS, DzCalendar } from '@dzcalendar/angular';
import type { DzCalendarOptions } from '@dzcalendar/angular';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { liveSource } from '@dzcalendar/core/live';
import type { LiveMessage } from '@dzcalendar/core/live';
import '@dzcalendar/pro';

@Component({
  selector: 'app-supervision',
  imports: [DZ_CALENDAR],
  // Une vue propre à l'application est lue une fois, à la création du calendrier : en Angular, dans les valeurs par défaut.
  providers: [{ provide: DZ_CALENDAR_DEFAULTS, useValue: { views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } } } }],
  template: `
    @if (!following()) { <button (click)="cal().controller.today()">Retour au direct</button> }
    <dz-calendar #calendar view="supervision" [date]="date" timeZone="Europe/Paris" locale="fr-FR" scheme="light"
      [resources]="processus" [events]="events" [sources]="sources" [options]="options">
      <ng-template dzEventContent let-event let-ctx="ctx">
        @if (ctx.background) {
          <span class="maint">{{ event.title }}</span>
        } @else {
          <div class="card" [class.card--failed]="event.props.status === 'failed'">
            <b>{{ event.title }}</b> <span class="pill">{{ event.props.status }}</span>
          </div>
        }
      </ng-template>
    </dz-calendar>`,
})
export class Supervision {
  readonly cal = viewChild.required<DzCalendar>('calendar');
  readonly following = signal(true);
  readonly date = Temporal.PlainDate.from('2026-10-21');

  readonly processus: ResourceInput[] = [
    { id: 'import', title: 'Import des commandes' },
    { id: 'backup', title: 'Sauvegarde' },
  ];

  readonly events: EventInput[] = [
    // En cours : pas encore de fin, elle grandit avec l'horloge.
    { id: 'run', title: 'Import des commandes', start: '2026-10-21T11:00[Europe/Paris]', resourceId: 'import', ongoing: true, extendedProps: { status: 'running' } },
    // Un repère : un instant, pas une durée.
    { id: 'alert', title: 'Disque presque plein', start: '2026-10-21T11:20:41[Europe/Paris]', resourceId: 'import', display: 'marker', tone: 'red' },
    // Un événement d'arrière-plan : une fenêtre de maintenance derrière les lignes.
    { id: 'maint', title: 'Maintenance', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 2 }, resourceId: 'backup', display: 'background', tone: 'violet' },
  ];

  // Le flux informe le calendrier : chaque message crée, modifie ou retire un événement.
  readonly sources = [
    liveSource('feed', {
      connect: (emit) => {
        const socket = new WebSocket('wss://example.com/runs');
        socket.onmessage = (m) => emit(JSON.parse(String(m.data)) as LiveMessage);
        return () => socket.close();
      },
    }),
  ];

  readonly options: DzCalendarOptions = {
    // Quatre heures à l'écran en quarts d'heure, le présent gardé à 5 minutes du bord gauche, un trait chaque minute (l'heure écrite toutes les cinq).
    timeline: { slot: 15, span: { hours: 4 }, step: { minutes: 15 }, follow: { before: { minutes: 5 } }, ticks: { every: 1, label: 5 }, maxLanes: 4 },
    nowRefresh: { seconds: 5 },
    forget: { olderThan: { days: 7 } },
    // false quand la personne a fait défiler ou glisser ailleurs ; true de nouveau après « Aujourd'hui ».
    onFollowChange: (following: boolean) => this.following.set(following),
  };
}
```

Ce que font les réglages : `timeline.span` est le temps affiché à la fois (la largeur d'un créneau est la place partagée entre ce nombre de créneaux) ; `timeline.follow` garde le présent en vue (`true`, ou `{ before }` pour garder un peu de ce qui vient de se passer) et se met en pause dès que la personne se déplace dans le temps ; `timeline.step` est ce dont les flèches font glisser ; `timeline.ticks` dessine de petits traits dans chaque créneau ; `nowRefresh` dit à quelle fréquence le présent est relu ; `forget: { olderThan }` lâche les événements terminés depuis plus longtemps ; `onFollowChange` entend le suivi se mettre en pause ou reprendre. `controller.shift({ minutes: -45 })` fait glisser de n'importe quel nombre d'heures et de minutes. `timeline`, `nowRefresh`, `forget` et `onFollowChange` sont tous vifs : changez `[options]` et l'écran suit. Voir [`timeline`](https://plinthworks.github.io/dzcalendar/fr/options/timeline/) et [`onFollowChange`](https://plinthworks.github.io/dzcalendar/fr/options/on-follow-change/).

L'éditeur et les exports du Pro pour Angular sont dans [`@dzcalendar/pro-angular`](https://www.npmjs.com/package/@dzcalendar/pro-angular).

### Documentation

- [Guide Angular](https://plinthworks.github.io/dzcalendar/fr/getting-started/angular/)
- [Installation](https://plinthworks.github.io/dzcalendar/fr/getting-started/installation/)
- [Migrer depuis FullCalendar](https://plinthworks.github.io/dzcalendar/fr/getting-started/migrating-from-fullcalendar/)
- [Options](https://plinthworks.github.io/dzcalendar/fr/options/) et [API](https://plinthworks.github.io/dzcalendar/fr/api/)
- Guides : [Événements](https://plinthworks.github.io/dzcalendar/fr/guides/events/), [Sources d'événements](https://plinthworks.github.io/dzcalendar/fr/guides/event-sources/), [Fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/), [Vues](https://plinthworks.github.io/dzcalendar/fr/guides/views/), [Glisser-déposer](https://plinthworks.github.io/dzcalendar/fr/guides/drag-and-drop/), [Sélection](https://plinthworks.github.io/dzcalendar/fr/guides/selection/), [Récurrence](https://plinthworks.github.io/dzcalendar/fr/guides/recurrence/), [Thèmes](https://plinthworks.github.io/dzcalendar/fr/guides/theming/), [Clavier et accessibilité](https://plinthworks.github.io/dzcalendar/fr/guides/keyboard-accessibility/), [Langues](https://plinthworks.github.io/dzcalendar/fr/guides/languages/), [Ressources et timeline](https://plinthworks.github.io/dzcalendar/fr/guides/resources-timeline/)

### Licence

MIT
