import { ApplicationInitStatus, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

// A browser without Temporal of its own (Safari): provideDzCalendar holds the application until its polyfill has
// arrived; a <dz-calendar> without it says what to add (owner, 18i).
vi.mock('@dzcalendar/core', async (original) => (await import('../../../test/temporal-loading.js')).lazyCore(original as never));
import { loading } from '../../../test/temporal-loading.js';
const { DZ_CALENDAR, provideDzCalendar } = await import('../src/index.js');

@Component({ standalone: true, imports: [DZ_CALENDAR], template: `<dz-calendar view="dayGridMonth" timeZone="Africa/Algiers" />` })
class Agenda {}

describe('@dzcalendar/angular while Temporal loads', () => {
  afterEach(() => {
    loading.ready = true;
    TestBed.resetTestingModule();
  });

  it('provideDzCalendar: the application starts once Temporal is there, the calendar drawn', async () => {
    loading.ready = false;
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ timeZone: 'Africa/Algiers' })] });
    const status = TestBed.inject(ApplicationInitStatus);
    expect(status.done).toBe(false);
    loading.release();
    await status.donePromise;
    const f = TestBed.createComponent(Agenda);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('.dz-cal')).not.toBeNull();
  });

  it('without it: the <dz-calendar> waits by itself, drawn once Temporal is there, its two-way view following', async () => {
    loading.ready = false;
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(Agenda);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.dz-cal')).toBeNull();
    loading.release();
    await Promise.resolve();
    await Promise.resolve();
    await f.whenStable();
    expect(el.querySelector('.dz-cal')).not.toBeNull();
    expect(el.querySelector('.dz-dg__cell')).not.toBeNull();
  });
});
