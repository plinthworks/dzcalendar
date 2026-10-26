import { Component, ErrorHandler, inject, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { Temporal, fnSource } from '@dzcalendar/core';
import type { EventInput, EventInstance, PlainDate, Selection } from '@dzcalendar/core';
import { CalendarController, DZ_CALENDAR, DzCalendar, DzEventContent, provideDzCalendar } from '../src/index.js';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const d = (s: string) => Temporal.PlainDate.from(s);
const meeting: EventInput = { id: 'm', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' };

/** A header of one's own, reading the calendar's signals. */
@Component({ selector: 'my-header', standalone: true, template: `<h1>{{ ctl.title() }}</h1><span class="days">{{ ctl.range()?.dates?.length }}</span><button class="next" (click)="ctl.next()">›</button>` })
class Header {
  readonly ctl = inject(CalendarController);
}

@Component({
  standalone: true,
  imports: [DzCalendar, DzEventContent],
  template: `
    <dz-calendar #cal [events]="events()" [(view)]="view" [(date)]="date" [(selection)]="selection" timeZone="Europe/Paris" locale="fr-FR"
      [editable]="true" [selectable]="true" [options]="opts()" (eventClick)="clicked.push($event)">
      @if (templated()) {
        <ng-template dzEventContent let-event="event" let-ctx="ctx"><b class="tpl">{{ event.title }}</b><i>{{ ctx.timeText }}</i><u class="hl">{{ hl() }}</u></ng-template>
      }
    </dz-calendar>`,
})
class Host {
  readonly events = signal<readonly EventInput[]>([meeting]);
  readonly view = signal<string | undefined>('timeGridWeek');
  readonly date = signal<PlainDate | undefined>(d('2026-10-21'));
  readonly selection = signal<Selection | null>(null);
  readonly templated = signal(false);
  readonly hl = signal('x');
  readonly opts = signal<Record<string, unknown>>({});
  readonly clicked: EventInstance[] = [];
  readonly now = now;
  readonly cal = viewChild.required(DzCalendar);
}

async function mount(setup: (h: Host) => void = () => {}): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now })] });
  const f = TestBed.createComponent(Host);
  setup(f.componentInstance);
  await f.whenStable();
  return f;
}
const kernelOf = (f: ComponentFixture<Host>) => f.componentInstance.cal().instance.kernel;

/** Every template's embedded views the component holds (one map per element since 18f-2). */
const viewsOf = (cal: unknown) => [...(cal as { views: Map<string, Map<unknown, { view: { destroyed: boolean } }>> }).views.values()].flatMap((m) => [...m.values()].map((x) => x.view));

describe('<dz-calendar> under provideZonelessChangeDetection', () => {
  it('draws the bound view, date and events', async () => {
    const f = await mount();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.dz-tg')).not.toBeNull();
    expect(kernelOf(f).getState().range.start.toString()).toBe('2026-10-19');
    expect(el.querySelector('.dz-ev[data-event-id="m"]')).not.toBeNull();
  });

  it('[(view)]: the toolbar writes the binding; the binding moves the calendar', async () => {
    const f = await mount();
    const el = f.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.dz-toolbar__view[data-view="dayGridMonth"]')!.click();
    await f.whenStable();
    expect(f.componentInstance.view()).toBe('dayGridMonth');
    f.componentInstance.view.set('timeGridDay');
    await f.whenStable();
    expect(kernelOf(f).getState().view.type).toBe('timeGridDay');
  });

  it('[(date)]: navigating writes the binding; the binding moves the calendar', async () => {
    const f = await mount();
    f.componentInstance.cal().instance.navigate('next');
    await f.whenStable();
    expect(f.componentInstance.date()!.toString()).toBe('2026-10-28');
    f.componentInstance.date.set(d('2027-01-06'));
    await f.whenStable();
    expect(kernelOf(f).getState().range.start.toString()).toBe('2027-01-04');
  });

  it('the date the calendar emitted, handed back by the binding, changes nothing (D.7)', async () => {
    const f = await mount();
    const states: unknown[] = [];
    kernelOf(f).subscribe((e) => e.type === 'state' && states.push(e));
    f.componentInstance.cal().instance.navigate('next');
    await f.whenStable();
    await f.whenStable();
    expect(states).toHaveLength(1);
  });

  it('one input change is one update: the calendar’s answers inside update are not dependencies (untracked)', async () => {
    const f = await mount();
    const inst = f.componentInstance.cal().instance;
    let calls = 0;
    const orig = inst.update.bind(inst);
    (inst as { update: typeof inst.update }).update = (c) => {
      calls++;
      orig(c);
    };
    // A view change makes the calendar answer synchronously (state event → controller and `view` written).
    f.componentInstance.view.set('dayGridMonth');
    await f.whenStable();
    await f.whenStable();
    expect(calls).toBe(1);
  });

  it('a new events array with the same content redraws nothing', async () => {
    const f = await mount();
    const node = (f.nativeElement as HTMLElement).querySelector('.dz-ev[data-event-id="m"]');
    f.componentInstance.events.set([{ ...meeting }]);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('.dz-ev[data-event-id="m"]')).toBe(node);
  });

  it('outputs: a click on an event is emitted', async () => {
    const f = await mount();
    (f.nativeElement as HTMLElement).querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.click();
    await f.whenStable();
    expect(f.componentInstance.clicked.map((i) => i.event.id)).toEqual(['m']);
  });

  it('[(selection)]: the binding hands a selection to the calendar, once (drawing needs layout: the browser checks)', async () => {
    const f = await mount();
    const inst = f.componentInstance.cal().instance;
    const given: unknown[] = [];
    const orig = inst.select.bind(inst);
    (inst as { select: typeof inst.select }).select = (x) => {
      given.push(x);
      orig(x);
    };
    const sel = { allDay: false, start: Temporal.ZonedDateTime.from('2026-10-22T14:00[Europe/Paris]'), end: Temporal.ZonedDateTime.from('2026-10-22T15:00[Europe/Paris]') } as unknown as Selection;
    f.componentInstance.selection.set(sel);
    await f.whenStable();
    await f.whenStable();
    expect(given).toEqual([sel]);
  });
});

describe('CalendarController', () => {
  it('before a calendar is attached: refuses as React and Vue do, throws nothing (18j-3)', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), CalendarController] });
    const ctl = TestBed.inject(CalendarController);
    expect(ctl.dispatch({ type: 'event.delete', id: 'a' })).toEqual({ ok: false, problems: [{ code: 'invalid-option', severity: 'error', path: 'calendar', detail: 'not-mounted' }] });
    expect([ctl.undo(), ctl.redo()]).toEqual([false, false]);
    expect(() => (ctl.next(), ctl.goTo(d('2026-10-21')), ctl.changeView('dayGridMonth'), ctl.refetch())).not.toThrow();
  });

  @Component({
    standalone: true,
    imports: [DzCalendar, Header],
    template: `<dz-calendar view="timeGridWeek" [date]="date" timeZone="Europe/Paris" locale="fr-FR"><my-header /></dz-calendar>`,
  })
  class WithHeader {
    readonly date = d('2026-10-21');
    readonly now = now;
  }

  it('title() and range() as signals, for a child; next() moves the calendar', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now })] });
    // A child projected into <dz-calendar> is not drawn (its template is empty): render the header beside it, through the same injector.
    const f = TestBed.createComponent(WithHeader);
    await f.whenStable();
    const cal = f.debugElement.children[0]!;
    const ctl = cal.injector.get(CalendarController);
    expect(ctl.title()).toBe('19–25 oct. 2026');
    expect(ctl.range()!.dates).toHaveLength(7);
    ctl.next();
    await f.whenStable();
    expect(ctl.title()).toMatch(/^26 oct\..*1 nov\. 2026$/);
    expect(ctl.view()).toBe('timeGridWeek');
    expect(ctl.canUndo()).toBe(false);
  });

  it('canUndo follows a command; loading follows a source', async () => {
    const f = await mount();
    const ctl = f.debugElement.children[0]!.injector.get(CalendarController);
    ctl.dispatch({ type: 'event.move', id: 'm', start: '2026-10-22T09:00[Europe/Paris]' });
    await f.whenStable();
    expect(ctl.canUndo()).toBe(true);
    ctl.undo();
    await f.whenStable();
    expect(ctl.canRedo()).toBe(true);
    let resolve!: (v: readonly EventInput[]) => void;
    f.componentInstance.cal().instance.update({ sources: [fnSource('s', () => new Promise((r) => (resolve = r)))] });
    expect(ctl.loading()).toBe(true);
    await Promise.resolve();
    resolve([]);
    await f.componentInstance.cal().instance.kernel.sources.idle();
    expect(ctl.loading()).toBe(false);
  });
});

describe('dzEventContent', () => {
  it('draws each event with the template; a change checks only that event’s view', async () => {
    const f = await mount((h) => {
      h.templated.set(true);
      h.events.set([meeting, { id: 'o', title: 'Autre', start: '2026-10-22T11:00[Europe/Paris]' }]);
    });
    const el = f.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('.tpl')].map((x) => x.textContent).sort()).toEqual(['Autre', 'Réunion']);
    const cal = f.componentInstance.cal();
    const before = cal.checks;
    f.componentInstance.events.set([{ ...meeting, title: 'Réunion 2' }, { id: 'o', title: 'Autre', start: '2026-10-22T11:00[Europe/Paris]' }]);
    await f.whenStable();
    expect(cal.checks - before).toBe(1);
    expect(el.querySelector('.dz-ev[data-event-id="m"] .tpl')!.textContent).toBe('Réunion 2');
    // Leaving the period destroys the views of the events that left.
    cal.instance.navigate('next');
    await f.whenStable();
    expect(viewsOf(cal)).toHaveLength(0);
  });
});

describe('provideDzCalendar', () => {
  @Component({ standalone: true, imports: [DzCalendar], template: `<dz-calendar [date]="date" view="dayGridMonth" />` })
  class Bare {
    readonly date = d('2026-10-21');
  }

  it('sets what the component leaves unbound: zone, locale, options', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ timeZone: 'Asia/Kolkata', locale: 'fr-FR', weekNumbers: true, now })] });
    const f = TestBed.createComponent(Bare);
    await f.whenStable();
    const k = f.debugElement.children[0]!.injector.get(CalendarController).instance()!.kernel;
    expect(k.getState().timeZone).toBe('Asia/Kolkata');
    expect(k.getState().title).toBe('octobre 2026');
    expect((f.nativeElement as HTMLElement).querySelectorAll('.dz-dg__wk').length).toBeGreaterThan(3);
  });
});

describe('review fixes', () => {
  it('[(selection)] follows a selection the calendar clears itself (onUnselect)', async () => {
    const f = await mount();
    const sel = { allDay: false, start: Temporal.ZonedDateTime.from('2026-10-22T14:00[Europe/Paris]'), end: Temporal.ZonedDateTime.from('2026-10-22T15:00[Europe/Paris]') } as unknown as Selection;
    // As the calendar reports a person's selection, then clears it (Escape, a click elsewhere, another period).
    f.componentInstance.cal().instance.select(sel);
    f.componentInstance.selection.set(sel);
    await f.whenStable();
    f.componentInstance.cal().instance.navigate('next'); // another period clears a shown selection
    await f.whenStable();
    expect(f.componentInstance.selection()).toBeNull();
  });

  it('[(date)] bound to undefined receives the calendar’s date', async () => {
    const f = await mount((h) => h.date.set(undefined));
    const k = f.componentInstance.cal().instance.kernel;
    f.componentInstance.cal().instance.navigate('next');
    await f.whenStable();
    // Today (21 October, the injected clock) plus a week.
    expect(f.componentInstance.date()?.toString()).toBe('2026-10-28');
    expect(k.getState().date.toString()).toBe('2026-10-28');
  });

  it('a template removed then added: no view left behind, the new one used', async () => {
    const f = await mount((h) => h.templated.set(true));
    const cal = f.componentInstance.cal();
    const first = viewsOf(cal);
    expect(first.length).toBeGreaterThan(0);
    f.componentInstance.templated.set(false);
    await f.whenStable();
    expect(viewsOf(cal)).toHaveLength(0);
    expect(first.every((v) => v.destroyed)).toBe(true);
    expect((f.nativeElement as HTMLElement).querySelector('.tpl')).toBeNull();
    f.componentInstance.templated.set(true);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('.dz-ev[data-event-id="m"] .tpl')!.textContent).toBe('Réunion');
  });

  it('canUndo() is right at once after dispatch(); the events are not handed over again on a view change', async () => {
    const f = await mount();
    const ctl = f.debugElement.children[0]!.injector.get(CalendarController);
    ctl.dispatch({ type: 'event.move', id: 'm', start: '2026-10-22T09:00[Europe/Paris]' });
    expect(ctl.canUndo()).toBe(true);
    const inst = f.componentInstance.cal().instance;
    const seen: string[][] = [];
    const orig = inst.update.bind(inst);
    (inst as { update: typeof inst.update }).update = (c) => {
      seen.push(Object.keys(c).filter((k) => k === 'events' || k === 'view'));
      orig(c);
    };
    f.componentInstance.view.set('dayGridMonth');
    await f.whenStable();
    expect(seen).toEqual([['view']]);
  });

  it('after destroy the controller no longer reaches the calendar', async () => {
    const f = await mount();
    const ctl = f.debugElement.children[0]!.injector.get(CalendarController);
    f.destroy();
    expect(ctl.instance()).toBeNull();
    // Nothing reached, nothing thrown (owner, 18j-3: as React's and Vue's controllers).
    expect(() => ctl.next()).not.toThrow();
    expect(ctl.dispatch({ type: 'event.delete', id: 'a' }).ok).toBe(false);
  });
});

describe('code review fixes', () => {
  it('a bad view is reported and undone; later changes still go through', async () => {
    const errors: unknown[] = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now }), { provide: ErrorHandler, useValue: { handleError: (e: unknown) => errors.push(e) } }] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    f.componentInstance.view.set('nope');
    await f.whenStable();
    expect(errors).toHaveLength(1);
    expect(f.componentInstance.view()).toBe('timeGridWeek');
    f.componentInstance.events.set([meeting, { id: 'n', title: 'Nouveau', start: '2026-10-23T09:00[Europe/Paris]' }]);
    f.componentInstance.date.set(d('2026-12-02'));
    await f.whenStable();
    expect(errors).toHaveLength(1);
    const k = kernelOf(f);
    expect(k.getState().range.start.toString()).toBe('2026-11-30');
    expect(k.store.snapshot.getEvent('n')).toBeDefined();
  });

  it('callbacks in [options] do not silence the outputs', async () => {
    const f = await mount((h) => h.opts.set({ onEventClick: () => {} }));
    (f.nativeElement as HTMLElement).querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.click();
    await f.whenStable();
    expect(f.componentInstance.clicked.map((i) => i.event.id)).toEqual(['m']);
  });

  it('a template reading an application signal follows it (that view alone)', async () => {
    const f = await mount((h) => h.templated.set(true));
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.dz-ev[data-event-id="m"] .hl')!.textContent).toBe('x');
    f.componentInstance.hl.set('y');
    await f.whenStable();
    expect(el.querySelector('.dz-ev[data-event-id="m"] .hl')!.textContent).toBe('y');
  });

  it('[(selection)] is cleared when another view family takes over', async () => {
    const f = await mount();
    const sel = { allDay: false, start: Temporal.ZonedDateTime.from('2026-10-22T14:00[Europe/Paris]'), end: Temporal.ZonedDateTime.from('2026-10-22T15:00[Europe/Paris]') } as unknown as Selection;
    f.componentInstance.selection.set(sel);
    await f.whenStable();
    f.componentInstance.view.set('dayGridMonth');
    await f.whenStable();
    expect(f.componentInstance.selection()).toBeNull();
  });
});

describe('templates for every element (18f-2, Angular)', () => {
  @Component({
    standalone: true,
    imports: [DZ_CALENDAR],
    template: `
      <dz-calendar [view]="view()" [date]="date" timeZone="Europe/Paris" locale="fr-FR" [options]="opts" [hooks]="hooks">
        <ng-template dzSlotLabel let-ctx><b class="lbl">{{ ctx.time.hour === 9 && ctx.time.minute === 0 ? ctx.text + ' ' + who() : ctx.text }}</b></ng-template>
        <ng-template dzDayCell let-ctx><em>j{{ ctx.date.day }}</em></ng-template>
        <ng-template dzHeaderItem="filter" let-ctx><select aria-label="Médecin"><option>Tous ({{ ctx.name }})</option></select></ng-template>
      </dz-calendar>`,
  })
  class Templated {
    readonly view = signal('timeGridWeek');
    readonly date = d('2026-10-21');
    readonly who = signal('ctx');
    readonly opts = { now, headerToolbar: { start: 'title', end: 'filter' } };
    readonly hooks = { dayCell: { class: (c: { outside: boolean }) => (c.outside ? 'muted' : null) } };
  }

  it('dzSlotLabel and dzHeaderItem in the week; dzDayCell with [hooks] classes in the month', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(Templated);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const nine = [...el.querySelectorAll('.dz-tick .lbl')].map((b) => b.textContent).find((t) => t?.startsWith('09:00'));
    expect([nine, el.querySelector('.dz-toolbar__item select option')?.textContent]).toEqual(['09:00 ctx', 'Tous (filter)']);
    f.componentInstance.view.set('dayGridMonth');
    await f.whenStable();
    const cell = el.querySelector('.dz-dg__cell[data-date="2026-10-21"]')!;
    expect([cell.querySelector('.dz-dg__num em')?.textContent, el.querySelector('.dz-dg__cell[data-date="2026-09-28"]')?.classList.contains('muted')]).toEqual(['j21', true]);
  });
});

describe('after the 18f-2 execution review (Angular)', () => {
  @Component({
    standalone: true,
    imports: [DZ_CALENDAR],
    template: `
      <dz-calendar #cal view="dayGridMonth" [date]="date" timeZone="Europe/Paris" locale="fr-FR" [options]="opts" [hooks]="hooks()">
        <ng-template dzDayCell let-ctx><em>{{ ctx.date.day }}</em></ng-template>
        <ng-template dzHeaderItem="filter"><select id="sel"><option>a</option></select></ng-template>
      </dz-calendar>`,
  })
  class Leaky {
    readonly date = d('2026-10-21');
    readonly opts = { now, headerToolbar: { start: 'title', end: 'filter' } };
    readonly hooks = signal<Record<string, unknown>>({ slotLabel: { class: 'w1' } });
    readonly cal = viewChild.required(DzCalendar);
  }

  it('day cells keep one view each across navigations; the header place survives other hooks changing, focused', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(Leaky);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const cal = f.componentInstance.cal();
    for (let i = 0; i < 5; i++) {
      cal.instance.navigate('next');
      await f.whenStable();
    }
    // One view per cell shown, and the header place's.
    expect(viewsOf(cal)).toHaveLength(el.querySelectorAll('.dz-dg__cell').length + 1);
    const sel = el.querySelector<HTMLSelectElement>('#sel')!;
    sel.focus();
    f.componentInstance.hooks.set({ slotLabel: { class: 'w2' } });
    await f.whenStable();
    cal.instance.navigate('next');
    await f.whenStable();
    expect([el.querySelector('#sel') === sel, document.activeElement === sel]).toEqual([true, true]);
  });
});
