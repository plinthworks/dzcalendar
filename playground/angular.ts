import './prelude';
import '@angular/compiler';
import '../packages/theme/dzcalendar.css';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { DzCalendar, DzEventContent, provideDzCalendar } from '@dzcalendar/angular';
import { Temporal } from '@dzcalendar/core';
import type { EventInstance, PlainDate } from '@dzcalendar/core';
import '@dzcalendar/dom/list';
import { DEMO_EVENTS } from './demo-events';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DzCalendar, DzEventContent],
  template: `
    <div class="bar">
      <button type="button" (click)="cal.controller.prev()">‹</button>
      <strong>{{ cal.controller.title() }}</strong>
      <button type="button" (click)="cal.controller.next()">›</button>
      <button type="button" [disabled]="!cal.controller.canUndo()" (click)="cal.controller.undo()">Annuler</button>
      <span>vue : {{ view() }} · date : {{ date()?.toString() }}</span>
      <span role="status">{{ said() }}</span>
    </div>
    <dz-calendar #cal [events]="events" [(view)]="view" [(date)]="date" [editable]="true" [selectable]="true"
      [options]="{ headerViews: ['dayGridMonth', 'timeGridWeek', 'timeGridDay', 'listWeek'] }" (eventClick)="open($event)">
      <ng-template dzEventContent let-event="event" let-ctx="ctx">
        <span class="dz-ev__time">{{ ctx.timeText }}</span> <b>{{ event.title }}</b>
      </ng-template>
    </dz-calendar>`,
})
class App {
  readonly events = DEMO_EVENTS;
  readonly view = signal<string | undefined>('timeGridWeek');
  readonly date = signal<PlainDate | undefined>(Temporal.PlainDate.from('2026-10-21'));
  readonly said = signal('');
  open(i: EventInstance): void {
    this.said.set(`Ouvrir « ${i.event.title} »`);
  }
}

bootstrapApplication(App, { providers: [provideZonelessChangeDetection(), provideDzCalendar({ timeZone: 'Europe/Paris', locale: 'fr-FR' })] });
