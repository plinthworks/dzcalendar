import { Component, NgZone, provideZoneChangeDetection, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Temporal } from '@dzcalendar/core';
import type { EventInstance } from '@dzcalendar/core';
import { DzCalendar } from '../src/index.js';

@Component({
  standalone: true,
  imports: [DzCalendar],
  template: `<dz-calendar view="timeGridWeek" [date]="date" timeZone="Europe/Paris" locale="fr-FR" [events]="events" (eventClick)="clicked($event)" />`,
})
class Host {
  readonly date = Temporal.PlainDate.from('2026-10-21');
  readonly events = [{ id: 'm', title: 'M', start: '2026-10-21T09:00[Europe/Paris]' }];
  readonly cal = viewChild.required(DzCalendar);
  inZone: boolean | null = null;
  clicked(_: EventInstance): void {
    this.inZone = NgZone.isInAngularZone();
  }
}

describe('under zone.js', () => {
  it('the calendar runs outside the zone; what it emits comes back in', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection()] });
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    await f.whenStable();
    const inst = f.componentInstance.cal().instance;
    const zones: boolean[] = [];
    const orig = inst.update.bind(inst);
    (inst as { update: typeof inst.update }).update = (c) => {
      zones.push(NgZone.isInAngularZone());
      orig(c);
    };
    TestBed.inject(NgZone).run(() => f.componentInstance.cal().controller.changeView('dayGridMonth'));
    f.detectChanges();
    // changeView, then the binding handed back (a no-op): both outside.
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.every((z) => !z)).toBe(true);
    TestBed.inject(NgZone).runOutsideAngular(() => (f.nativeElement as HTMLElement).querySelector<HTMLElement>('.dz-dg__item[data-event-id="m"], .dz-bar')!.click());
    expect(f.componentInstance.inZone).toBe(true);
  });
});
