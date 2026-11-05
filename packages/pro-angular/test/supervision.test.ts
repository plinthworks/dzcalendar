import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { CalendarController, DZ_CALENDAR, DZ_CALENDAR_DEFAULTS, provideDzCalendar } from '@dzcalendar/angular';
import type { DzCalendarOptions } from '@dzcalendar/angular';
import '@dzcalendar/pro';
import { liveSource } from '@dzcalendar/core/live';
import type { LiveMessage } from '@dzcalendar/core/live';

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

// Every option of the supervision batch through Angular, read back from the calendar it made (owner, 2026-11-05:
// "tout est accessible via des options Angular" — checked before the first release).
@Component({
  standalone: true,
  imports: [DZ_CALENDAR],
  providers: [{ provide: DZ_CALENDAR_DEFAULTS, useValue: { now, views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } } } }],
  template: `<dz-calendar view="supervision" [date]="date" timeZone="Europe/Paris" scheme="light" [resources]="processes" [events]="events" [sources]="sources" [options]="options" />`,
})
class Everything {
  readonly date = Temporal.PlainDate.from('2026-10-21');
  readonly processes: ResourceInput[] = [{ id: 'import', title: 'Import' }];
  readonly said: boolean[] = [];
  emit: (m: LiveMessage) => void = () => undefined;
  readonly events: EventInput[] = [
    { id: 'run', title: 'Import', start: '2026-10-21T11:00[Europe/Paris]', duration: { minutes: 20 }, resourceId: 'import', ongoing: true },
    { id: 'alert', title: 'Disque', start: '2026-10-21T11:20:41[Europe/Paris]', resourceId: 'import', display: 'marker' },
  ];
  readonly sources = [liveSource('feed', { connect: (e) => ((this.emit = e), () => undefined) })];
  readonly options: DzCalendarOptions = {
    timeline: { slot: 15, span: { hours: 1 }, step: { minutes: 15 }, follow: { before: { minutes: 5 } }, ticks: { every: 1, label: 5 }, maxLanes: 4 },
    nowRefresh: { seconds: 5 },
    forget: { olderThan: { days: 7 } },
    onFollowChange: (f: boolean) => void this.said.push(f),
  };
}

describe('@dzcalendar/pro-angular: every supervision option through Angular', () => {
  it('timeline span/step/follow before/ticks, nowRefresh, forget, onFollowChange, scheme, running events, markers, a live source', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now })] });
    const f = TestBed.createComponent(Everything);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const ctl = f.debugElement.children[0]!.injector.get(CalendarController);
    const k = ctl.instance()!.kernel;
    f.componentInstance.emit({ create: { id: 'live-1', title: 'Billing', start: '2026-10-21T11:30[Europe/Paris]', resourceId: 'import', ongoing: true } });
    await k.sources.idle();
    await f.whenStable();
    const t = k.getOptions().timeline!;
    expect([
      String(t.span),
      String(t.step),
      JSON.stringify(t.follow),
      JSON.stringify(t.ticks),
      el.querySelector('.dz-cal')?.getAttribute('data-dz-scheme'),
      k.store.snapshot.getEvent('run')?.allDay === false && (k.store.snapshot.getEvent('run') as { ongoing?: boolean }).ongoing,
      el.querySelector('.dz-tl__ev[data-marker]') !== null,
      el.querySelector('.dz-tl__ev[data-ongoing]') !== null,
      k.store.snapshot.getEvent('live-1')?.sourceId,
      el.querySelectorAll('.dz-tl__tick').length > 0,
    ]).toEqual(['PT1H', 'PT15M', '{"before":"PT5M"}', '{"every":1,"label":5}', 'light', true, true, true, 'feed', true]);
    // nowRefresh and forget are live settings: refused through [options] when wrong, as anywhere.
    expect(() => ctl.instance()!.update({ nowRefresh: { hours: 2 } })).toThrow('nowRefresh');
    expect(() => ctl.instance()!.update({ forget: { olderThan: 'P1M' } })).toThrow('forget');
  });
});
