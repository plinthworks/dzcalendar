import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { CalendarController, DZ_CALENDAR, DZ_CALENDAR_DEFAULTS, provideDzCalendar } from '@dzcalendar/angular';
import type { DzCalendarOptions } from '@dzcalendar/angular';
import '@dzcalendar/pro';

// Supervision in Angular (owner, 2026-11-04): the timeline's settings through [options], live; the cards by kind through
// dzEventContent — a run says how it went, a maintenance window (a background) its name.
const now = () => Temporal.Instant.from('2026-10-21T09:37:00Z');

@Component({
  standalone: true,
  imports: [DZ_CALENDAR],
  // A view of the application's own is read once, when the calendar is made: in Angular, in the component's defaults.
  providers: [{ provide: DZ_CALENDAR_DEFAULTS, useValue: { now, views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } } } }],
  template: `
    <dz-calendar view="supervision" [date]="date" timeZone="Europe/Paris" locale="fr-FR" [resources]="processes" [events]="events" [options]="options()">
      <ng-template dzEventContent let-event let-ctx="ctx">
        @if (ctx.background) {
          <span class="maint">{{ event.title }}</span>
        } @else {
          <div class="card" [class.card--failed]="event.props.status === 'failed'">
            <b>{{ event.title }}</b> <span class="pill">{{ event.props.status }}</span>
          </div>
        }
      </ng-template>
    </dz-calendar>`,
})
class Supervision {
  readonly date = Temporal.PlainDate.from('2026-10-21');
  readonly processes: ResourceInput[] = [
    { id: 'import', title: 'Import des commandes' },
    { id: 'backup', title: 'Sauvegarde' },
  ];
  readonly events: EventInput[] = [
    { id: 'r1', title: 'Import des commandes', start: '2026-10-21T10:05:12[Europe/Paris]', duration: { minutes: 90 }, resourceId: 'import', tone: 'red', extendedProps: { status: 'failed' } },
    { id: 'm1', title: 'Maintenance', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 2 }, resourceId: 'backup', display: 'background', tone: 'violet' },
  ];
  readonly options = signal<DzCalendarOptions>({
    timeline: { slot: 15, span: { hours: 4 }, step: { minutes: 15 }, follow: true },
  });
}

describe('@dzcalendar/pro-angular: a supervision timeline', () => {
  it('cards by kind from dzEventContent (a maintenance window labelled), the span changed live by [options], shift on the controller', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now })] });
    const f = TestBed.createComponent(Supervision);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const card = el.querySelector('.dz-tl__ev:not(.dz-tl__ev--bg) .card');
    const maint = el.querySelector('.dz-tl__ev--bg.dz-tl__ev--labelled');
    const ctl = f.debugElement.children[0]!.injector.get(CalendarController);
    const asked = String(ctl.instance()!.kernel.getOptions().timeline?.span);
    f.componentInstance.options.update((o) => ({ ...o, timeline: { ...o.timeline, span: { hours: 1 } } }));
    await f.whenStable();
    expect([
      [...(card?.children ?? [])].map((c) => c.textContent).join(' | '),
      card?.classList.contains('card--failed'),
      maint?.textContent?.trim(),
      maint?.getAttribute('aria-hidden'),
      asked,
      String(ctl.instance()!.kernel.getOptions().timeline?.span),
      // A day or more is a view's dateIncrement, refused as the option is; a duration of hours, a boolean (jsdom draws no width to slide along).
      (() => { try { return ctl.shift({ days: 1 }); } catch (e) { return (e as Error).name; } })(),
      typeof ctl.shift({ minutes: 15 }),
    ]).toEqual(['Import des commandes | failed', true, 'Maintenance', null, 'PT4H', 'PT1H', 'RangeError', 'boolean']);
  });
});
