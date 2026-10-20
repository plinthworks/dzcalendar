import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Temporal } from '@dzcalendar/core';
import { DzCalendar, provideDzCalendar } from '../src/index.js';
import { DzFullCalendar } from '../fullcalendar/src/index.js';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');

@Component({
  standalone: true,
  imports: [DzCalendar, DzFullCalendar],
  template: `<dz-calendar [dzFullCalendar]="options()" (fullCalendarProblems)="problems.push($event)" />`,
})
class Host {
  readonly clicked: string[] = [];
  readonly problems: unknown[] = [];
  readonly options = signal<Record<string, unknown>>({
    timeZone: 'Europe/Paris',
    initialView: 'dayGridMonth',
    initialDate: '2026-10-21',
    firstDay: 1,
    events: [{ id: 'a', title: 'Réunion', start: '2026-10-21T09:00:00+02:00' }],
    eventClick: (info: { event: { id: string } }) => this.clicked.push(info.event.id),
    height: 'auto',
  });
}

describe('@dzcalendar/angular/fullcalendar', () => {
  it('FullCalendar options on a <dz-calendar>: the view, the events, the callbacks; what has no equivalent said', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now })] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('[data-event-id="a"]')!.click();
    expect([el.querySelector('.dz-cal')?.getAttribute('data-view'), f.componentInstance.clicked, (f.componentInstance.problems[0] as { path: string }[]).map((p) => p.path)]).toEqual(['dayGridMonth', ['a'], ['height', 'firstDay']]);
  });
});
