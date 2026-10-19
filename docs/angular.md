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
