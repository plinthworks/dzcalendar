import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Temporal } from '@dzcalendar/core';
import { DZ_CALENDAR, provideDzCalendar } from '../src/index.js';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');

@Component({
  standalone: true,
  imports: [DZ_CALENDAR],
  template: `
    <dz-calendar view="timeGridWeek" [date]="date" timeZone="Africa/Algiers" locale="fr-FR" [events]="events">
      <ng-template dzDayHeader let-day>
        @if (closed().includes(day.date.toString())) {
          <button class="mark" (click)="opened.push(day.date.toString())">Fermé · {{ day.text }}</button>
        } @else {
          {{ day.text }}
        }
      </ng-template>
      <ng-template dzEventContent let-event let-ctx="ctx">
        @if (ctx.background) {
          @if (event.title) { <b class="label">{{ event.title }}</b> }
        } @else {
          <b>{{ event.title }}</b>
        }
      </ng-template>
    </dz-calendar>`,
})
class Agenda {
  readonly date = Temporal.PlainDate.from('2026-10-21');
  readonly closed = signal(['2026-10-23']);
  readonly opened: string[] = [];
  readonly events = [
    { id: 'v', title: 'Vacances', start: '2026-10-23', end: '2026-10-25', allDay: true, display: 'background' as const },
    { id: 'p', title: '', start: '2026-10-21T12:00[Africa/Algiers]', duration: { hours: 1 }, display: 'background' as const },
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Africa/Algiers]', duration: { minutes: 30 } },
  ];
}

describe('@dzcalendar/angular after Sehhaty’s test', () => {
  it('dzDayHeader: the application’s mark in a day’s head, clickable, following its signals; a background labelled by dzEventContent, an empty one mute', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now })] });
    const f = TestBed.createComponent(Agenda);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const mark = el.querySelector<HTMLButtonElement>('.dz-tg__dayhead .mark');
    mark?.click();
    const labels = [...el.querySelectorAll('.dz-tg__col .dz-ev--bg')].map((b) => b.textContent?.trim() ?? '');
    f.componentInstance.closed.set(['2026-10-23', '2026-10-24']);
    await f.whenStable();
    expect([mark?.textContent?.trim(), f.componentInstance.opened, labels.sort(), el.querySelectorAll('.dz-tg__dayhead .mark').length]).toEqual(['Fermé · ven. 23', ['2026-10-23'], ['', 'Vacances', 'Vacances'], 2]);
  });
});
