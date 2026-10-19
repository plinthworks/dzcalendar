import { Component, provideZonelessChangeDetection, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Temporal } from '@dzcalendar/core';
import type { MotionAdapter } from '@dzcalendar/dom';
import { CalendarController, DzCalendar, provideDzCalendar, provideDzMotion } from '@dzcalendar/angular';
import { DzExport } from '../src/index.js';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');

@Component({
  standalone: true,
  imports: [DzCalendar],
  template: `<dz-calendar view="timeGridWeek" [date]="date" timeZone="Europe/Paris" locale="fr-FR" [events]="events" /><dz-calendar view="timeGridDay" [date]="date" timeZone="Europe/Paris" />`,
})
class Host {
  readonly date = Temporal.PlainDate.from('2026-10-21');
  readonly events = [{ id: 'a', title: 'Garde', start: '2026-10-21T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=2' }];
  readonly cal = viewChild.required(DzCalendar);
}

describe('@dzcalendar/angular 18a: the motion provided once', () => {
  it('provideDzMotion makes one adapter per calendar', async () => {
    const made: MotionAdapter[] = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now }), provideDzMotion(() => (made.push({}), made[made.length - 1]!))] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const els = (f.nativeElement as HTMLElement).querySelectorAll('dz-calendar');
    expect([made.length, els.length, made[0] !== made[1]]).toEqual([2, 2, true]);
  });
});

describe('@dzcalendar/pro-angular 18a: DzExport', () => {
  it('an ICS of the week through the calendar’s controller; a calendar not attached is a problem, not a throw', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now })] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const exports = TestBed.inject(DzExport);
    const controller = f.debugElement.children[0]!.injector.get(CalendarController);
    const r = await exports.ics(controller);
    const text = await r.blob!.text();
    expect([r.problems.length, /RRULE:FREQ=DAILY;COUNT=2/.test(text)]).toEqual([0, true]);
    const none = await exports.xlsx(new CalendarController());
    expect([none.blob, none.problems.map((p) => p.detail)]).toEqual([null, ['not-attached']]);
  });
});

describe('after the 18a review', () => {
  it('provideDzMotion: a motion given to provideDzCalendar wins; a factory that throws is reported, the calendars drawn still', async () => {
    let made = 0;
    const errors: unknown[] = [];
    const { ErrorHandler } = await import('@angular/core');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideDzCalendar({ now }),
        provideDzMotion(() => {
          made++;
          throw new Error('gsap missing');
        }),
        { provide: ErrorHandler, useValue: { handleError: (e: unknown) => errors.push(e) } },
      ],
    });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    expect([made, errors.length, (f.nativeElement as HTMLElement).querySelectorAll('.dz-cal').length]).toEqual([2, 2, 2]);
  });

  it('DzExport takes the component (#cal), its controller, or the DOM calendar alike', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now })] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const exports = TestBed.inject(DzExport);
    const component = f.componentInstance.cal();
    const results = await Promise.all([exports.ics(component), exports.ics(component.instance), exports.ics(f.debugElement.children[0]!.injector.get(CalendarController))]);
    expect(results.map((r) => [r.problems.length, r.blob?.type])).toEqual([0, 1, 2].map(() => [0, 'text/calendar;charset=utf-8']));
  });
});
