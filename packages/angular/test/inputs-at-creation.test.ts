import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DZ_CALENDAR, provideDzCalendar } from '../src/index.js';

// 18j review: the calendar was made before the inputs were bound, so what only the first paint reads came too late.
@Component({
  standalone: true,
  imports: [DZ_CALENDAR],
  template: `<dz-calendar timeZone="Asia/Tokyo" view="timeGridDay" [options]="{ scrollTime: 'PT14H' }" (problem)="told.push($event.code)" />`,
})
class Agenda {
  told: string[] = [];
}

describe('<dz-calendar> made with its inputs', () => {
  it('a timeZone input is the zone from the first paint (no zone-from-browser), scrollTime scrolls the first grid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar()] });
    const f = TestBed.createComponent(Agenda);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const said = [...f.componentInstance.told, ...warn.mock.calls.map((c) => String(c[0]))].filter((x) => x.includes('zone-from-browser'));
    // 14 hours at the comfortable density's 48 px an hour.
    expect({ said, scrollTop: el.querySelector<HTMLElement>('.dz-tg__body')?.scrollTop, view: el.querySelector('.dz-tg') !== null }).toEqual({ said: [], scrollTop: 672, view: true });
    warn.mockRestore();
  });
});

@Component({ standalone: true, imports: [DZ_CALENDAR], template: `<dz-calendar timeZone="Asia/Tokyo" view="noSuchView" [weekNumbers]="true" />` })
class Refused {}

describe('<dz-calendar> with a refused input at creation', () => {
  it('is drawn still, the refusal told to the ErrorHandler once, the other inputs kept', async () => {
    const told: unknown[] = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar(), { provide: (await import('@angular/core')).ErrorHandler, useValue: { handleError: (e: unknown) => told.push(e) } }] });
    const f = TestBed.createComponent(Refused);
    await f.whenStable();
    const k = f.debugElement.children[0]!.injector.get((await import('../src/index.js')).CalendarController).instance()!.kernel;
    expect({ told: told.map((e) => (e as Error).name), zone: k.getState().timeZone, drawn: (f.nativeElement as HTMLElement).querySelector('.dz-cal') !== null }).toEqual({ told: ['RangeError'], zone: 'Asia/Tokyo', drawn: true });
  });
});

@Component({ standalone: true, imports: [DZ_CALENDAR], template: `<dz-calendar timeZone="Europe/Paris" view="timeGridWeek" [date]="date" [events]="events" />` })
class Unbound {
  readonly date = (globalThis as unknown as { __d: unknown }).__d as never;
  readonly events = [{ id: 'a', title: 'Visite', start: '2026-10-21T09:00[Europe/Paris]' }];
}
@Component({ standalone: true, imports: [DZ_CALENDAR], template: `<dz-calendar timeZone="Europe/Paris" view="timeGridWeek" [date]="date" [events]="events" (eventOpen)="opened = true" />` })
class Bound {
  opened = false;
  readonly date = (globalThis as unknown as { __d: unknown }).__d as never;
  readonly events = [{ id: 'a', title: 'Visite', start: '2026-10-21T09:00[Europe/Paris]' }];
}

describe('<dz-calendar> offers "Open" only when (eventOpen) is listened to (owner, 18j)', () => {
  it('unbound: no "Open" in the menu; bound: there, and it reaches the output', async () => {
    const { Temporal } = await import('@dzcalendar/core');
    (globalThis as unknown as { __d: unknown }).__d = Temporal.PlainDate.from('2026-10-21');
    const entries = async (type: typeof Unbound | typeof Bound) => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar()] });
      const f = TestBed.createComponent(type);
      await f.whenStable();
      const el = f.nativeElement as HTMLElement;
      el.querySelector('.dz-ev[data-event-id="a"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
      const items = [...el.querySelectorAll('.dz-menu [role="menuitem"]')].map((x) => x.textContent?.trim() ?? '');
      return { f, el, items };
    };
    const unbound = await entries(Unbound);
    expect(unbound.items.some((t) => /^Open/.test(t))).toBe(false);
    const bound = await entries(Bound);
    expect(bound.items.some((t) => /^Open/.test(t))).toBe(true);
    bound.el.querySelector<HTMLElement>('.dz-menu [role="menuitem"]')!.click();
    expect((bound.f.componentInstance as Bound).opened).toBe(true);
  });
});
