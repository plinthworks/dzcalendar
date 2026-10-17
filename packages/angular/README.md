# @dzcalendar/angular

The DzCalendar calendar for Angular 19 and later — signals only: signal
inputs, `model()` two-way bindings, `output()`, a controller of signals.
Zoneless or zone.js.

## In three steps

```bash
npm install @dzcalendar/angular @dzcalendar/theme
```

```ts
// app.config.ts — optional: what every calendar of the app shares
import { provideDzCalendar } from '@dzcalendar/angular';
export const appConfig = { providers: [provideDzCalendar({ timeZone: 'Europe/Paris', locale: 'fr-FR' })] };
```

```ts
import { Component, signal } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import type { EventInput } from '@dzcalendar/core';

@Component({
  selector: 'app-agenda',
  imports: [DZ_CALENDAR],
  template: `<dz-calendar [events]="events()" [(view)]="view" (eventClick)="open($event)" />`,
})
export class Agenda {
  readonly events = signal<EventInput[]>([{ id: '1', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }]);
  readonly view = signal('timeGridWeek');
  open(e: { event: { title: string } }) { console.log(e.event.title); }
}
```

and the theme once, in `angular.json` `styles`: `node_modules/@dzcalendar/theme/dzcalendar.css`.

Nothing else is required: without a provider, the zone is the browser's and
the language the page's (`<html lang>`).

## More

- **A header of one's own**: `<dz-calendar #cal>` then `{{ cal.controller.title() }}`,
  `(click)="cal.controller.next()"`; or `inject(CalendarController)` in a child.
- **Event content**: `<ng-template dzEventContent let-event="event" let-ctx="ctx">…</ng-template>`
  inside `<dz-calendar>`. Each event's view is checked on its own.
- **Other views**: `import '@dzcalendar/dom/list';` (listDay…listYear),
  `import '@dzcalendar/dom/multimonth';` (multiMonthYear), once, anywhere.
- **A server**: `[sources]="[jsonSource('team', { url: '/api/events' })]"` (keep the array stable).
- Creation options (`views`, `rules`, `scrollTime`…) go in `provideDzCalendar`,
  at the application or in a component's `providers`.
