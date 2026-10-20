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
    expect([el.querySelector('.dz-cal')?.getAttribute('data-view'), f.componentInstance.clicked, (f.componentInstance.problems[0] as { path: string }[]).map((p) => p.path)]).toEqual(['dayGridMonth', ['a'], ['height']]);
  });
});

@Component({
  standalone: true,
  imports: [DzCalendar, DzFullCalendar],
  template: `<dz-calendar [dzFullCalendar]="options" (fullCalendarProblems)="problems.push($event)" />`,
})
class Algiers {
  readonly problems: { code: string; path: string; detail?: string }[][] = [];
  // As Sehhaty writes them: no timeZone (FullCalendar's is the browser's).
  readonly options = { initialView: 'timeGridWeek', initialDate: '2026-10-21', events: [{ id: 'a', title: 'RDV', start: '2026-10-21T09:00:00' }] };
}

describe('after Sehhaty’s test: the application’s zone', () => {
  it('provideDzCalendar’s zone wins when the FullCalendar options name none: no guess, wall times read there', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now, timeZone: 'Africa/Algiers' })] });
    const f = TestBed.createComponent(Algiers);
    await f.whenStable();
    const cal = f.debugElement.children[0]!.componentInstance.instance;
    // Algiers is +01:00 all year (no DST).
    // The calendar's zone is not guessed; the event's wall time still is (read in the calendar's zone, said).
    const said = f.componentInstance.problems.flat().map((p) => `${p.code} ${p.path} ${p.detail}`);
    expect([cal.kernel.getState().timeZone, String(cal.kernel.store.snapshot.getEvent('a').start), said]).toEqual(['Africa/Algiers', '2026-10-21T09:00:00+01:00[Africa/Algiers]', ['zone-guessed events[0].start Africa/Algiers']]);
  });
});
