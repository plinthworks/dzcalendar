import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ErrorHandler,
  NgZone,
  ViewContainerRef,
  type EmbeddedViewRef,
  type OnDestroy,
  computed,
  contentChild,
  effect,
  inject,
  input,
  model,
  output,
  untracked,
} from '@angular/core';
import type {
  AvailableSlot,
  BusinessHoursInput,
  CreateRequest,
  EventInput,
  EventInstance,
  EventSourceSpec,
  NormalizationReport,
  PlainDate,
  Problem,
  ResourceInput,
  Selection,
  SourceNotice,
  Weekday,
  ZoneId,
} from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarHooks, CalendarInstance, CalendarOptions, CalendarUpdate, DateClick, DzMessages, EventChange, MotionAdapter } from '@dzcalendar/dom';
import { CalendarController } from './controller.js';
import { DZ_CALENDAR_DEFAULTS, DZ_MOTION } from './providers.js';
import { DzDayHeader, DzEventContent } from './templates.js';
import type { DayHeaderContext, EventContentContext } from './templates.js';

/** The callbacks the component turns into outputs: not options (they would silence the outputs). */
const OWN_CALLBACKS = ['onEventClick', 'onDateClick', 'onEventOpen', 'onCreateRequest', 'onSelect', 'onUnselect', 'onSlotClick', 'onResourceProblems', 'onEventChange'] as const;

/** What `[options]` takes: what `update()` takes, less what has an input or an output of its own. */
export type DzCalendarOptions = Omit<CalendarUpdate, 'view' | 'date' | 'events' | 'sources' | 'hooks' | (typeof OWN_CALLBACKS)[number]>;

/** Keys whose value is undefined are left out: an unbound input changes nothing. */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * `<dz-calendar>`: the DOM calendar in an Angular application. Signal inputs,
 * two-way `view`, `date` and `selection`, outputs for what a person does,
 * a `CalendarController` for what sits around it, and `dzEventContent`
 * templates for the events.
 *
 * Works zoneless: the calendar runs outside change detection and writes
 * signals, which schedule it. Under zone.js it is created outside the zone,
 * and only what it emits comes back in.
 */
@Component({
  selector: 'dz-calendar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CalendarController],
  template: '',
  host: { style: 'display: block' },
})
export class DzCalendar implements OnDestroy {
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private readonly defaults = inject(DZ_CALENDAR_DEFAULTS);
  private readonly makeMotion = inject(DZ_MOTION);
  /** The application's motion for this calendar; a factory that fails (gsap missing) is reported, the calendar drawn still. */
  private ownMotion(): { motion?: MotionAdapter } {
    try {
      return { motion: this.makeMotion!() };
    } catch (err) {
      this.errors.handleError(err);
      return {};
    }
  }
  private readonly errors = inject(ErrorHandler);
  private readonly vcr = inject(ViewContainerRef);
  /** The calendar as signals: `inject(CalendarController)` in a child, or `#cal` then `cal.controller`. */
  readonly controller = inject(CalendarController);

  // ── data ──
  /** Diffed by the store (by id, by value): a new array with the same events redraws nothing. */
  readonly events = input<readonly EventInput[] | undefined>(undefined);
  /** The whole list; a spec is compared by identity — keep the objects stable. */
  readonly sources = input<readonly EventSourceSpec[] | undefined>(undefined);

  // ── state, two-way ──
  readonly view = model<string | undefined>(undefined);
  readonly date = model<PlainDate | undefined>(undefined);
  readonly selection = model<Selection | null>(null);

  // ── options ──
  readonly timeZone = input<ZoneId | undefined>(undefined);
  readonly locale = input<string | undefined>(undefined);
  readonly axis = input<'wall' | 'elapsed' | undefined>(undefined);
  readonly editable = input<boolean | undefined>(undefined);
  readonly selectable = input<boolean | undefined>(undefined);
  readonly businessHours = input<BusinessHoursInput | undefined>(undefined);
  readonly weekends = input<boolean | undefined>(undefined);
  readonly weekNumbers = input<boolean | undefined>(undefined);
  readonly hiddenDays = input<readonly Weekday[] | undefined>(undefined);
  /** Any of the words, over the locale's. */
  readonly messages = input<Partial<DzMessages> | undefined>(undefined);
  /** 'standard', 'slate', 'night', 'pastel', 'frost', 'solar', 'contrast', or one made with `defineTheme`. */
  readonly theme = input<string | undefined>(undefined);
  readonly scheme = input<'auto' | 'light' | 'dark' | undefined>(undefined);
  readonly density = input<'compact' | 'comfortable' | 'spacious' | undefined>(undefined);
  /** The calendar dates are written in ('islamic-umalqura'…); null: the locale's. */
  readonly displayCalendar = input<string | null | undefined>(undefined);
  /** A second calendar shown beside each date; null: none. */
  readonly secondaryCalendar = input<string | null | undefined>(undefined);
  /** Bookable slots drawn in the week and day views (`findSlots(...).slots` from @dzcalendar/slots); null: none. */
  readonly availableSlots = input<readonly AvailableSlot[] | null | undefined>(undefined);
  /** What resource views show as columns (`resourceTimeGridDay`…); `resourceOrder` and `resourceGroupField` go in `options`. */
  readonly resources = input<readonly ResourceInput[] | undefined>(undefined);
  /** Everything else `update()` takes. */
  readonly options = input<DzCalendarOptions>({});

  // ── what a person does ──
  readonly dateClick = output<DateClick>();
  /** A free slot clicked (or Enter on it): the slot as given. Book it; the server checks it again. */
  readonly slotClick = output<AvailableSlot>();
  readonly eventClick = output<EventInstance>();
  readonly eventOpen = output<EventInstance>();
  readonly createRequest = output<CreateRequest>();
  /** A selection made by a person (`selection` follows it too). */
  readonly selected = output<Selection>();
  /** Loading, a failed fetch, problems in a delivery, a save refused. */
  readonly sourceNotice = output<SourceNotice>();
  readonly problems = output<NormalizationReport>();
  /** What the `resources` given could not be read as. */
  readonly resourceProblems = output<readonly Problem[]>();
  /** What a person changed (a drag, a resize, the keyboard, the menu, the editor): persist it; `revert()` if the server refuses. */
  readonly eventChange = output<EventChange>();

  private readonly eventTemplate = contentChild(DzEventContent);
  private readonly dayTemplate = contentChild(DzDayHeader);

  /** One hooks object per template: `update()` compares hooks member by member. */
  private readonly hooks = computed((): CalendarHooks => {
    const dir = this.eventTemplate();
    const day = this.dayTemplate();
    return { ...(dir && { event: this.templateHooks(dir) }), ...(day && { dayHeader: this.dayHeaderHooks(day) }) };
  });

  private readonly settings = computed((): CalendarUpdate => {
    const axis = this.axis();
    const options: Record<string, unknown> = { ...this.options() };
    for (const k of OWN_CALLBACKS) delete options[k];
    return {
      ...(options as DzCalendarOptions),
      ...defined({
        view: this.view(),
        date: this.date(),
        events: this.events(),
        sources: this.sources(),
        timeZone: this.timeZone(),
        locale: this.locale(),
        editable: this.editable(),
        selectable: this.selectable(),
        businessHours: this.businessHours(),
        weekends: this.weekends(),
        weekNumbers: this.weekNumbers(),
        hiddenDays: this.hiddenDays(),
        messages: this.messages(),
        theme: this.theme(),
        scheme: this.scheme(),
        density: this.density(),
        displayCalendar: this.displayCalendar(),
        secondaryCalendar: this.secondaryCalendar(),
        availableSlots: this.availableSlots(),
        resources: this.resources(),
        timeGrid: axis ? { ...this.options().timeGrid, axis } : undefined,
      }),
      hooks: this.hooks(),
    };
  });

  /** The last selection the calendar itself reported: handed back by the binding, it is not drawn again. */
  private lastSelection: Selection | null = null;

  /**
   * Created at construction, so the calendar exists as soon as the component
   * does; inputs are not bound yet — the effect below brings them in on the
   * first change detection.
   */
  private readonly calendar: CalendarInstance = this.zone.runOutsideAngular(() =>
    createCalendar(this.host, {
      ...this.defaults,
      // The application's motion, made for this calendar, unless one is given here or in the defaults.
      ...(this.makeMotion && this.defaults.motion === undefined && (untracked(this.settings) as CalendarOptions).motion === undefined && this.ownMotion()),
      ...(untracked(this.settings) as CalendarOptions),
      onDateClick: (c) => this.emit(() => this.dateClick.emit(c)),
      onSlotClick: (x) => this.emit(() => this.slotClick.emit(x)),
      onResourceProblems: (ps) => this.emit(() => this.resourceProblems.emit(ps)),
      onEventClick: (i) => this.emit(() => this.eventClick.emit(i)),
      onEventChange: (c) => this.emit(() => this.eventChange.emit(c)),
      onEventOpen: (i) => this.emit(() => this.eventOpen.emit(i)),
      onCreateRequest: (r) => this.emit(() => this.createRequest.emit(r)),
      onSelect: (sel) =>
        this.emit(() => {
          this.lastSelection = sel;
          this.selection.set(sel);
          this.selected.emit(sel);
        }),
      onUnselect: () =>
        this.emit(() => {
          this.lastSelection = null;
          if (untracked(this.selection) !== null) this.selection.set(null);
        }),
      onSource: (n) =>
        this.emit(() => {
          if (n.type === 'loading') this.controller.loading.set(n.loading);
          if (n.type === 'problems') this.controller.problems.set(n.report);
          this.sourceNotice.emit(n);
        }),
    }),
  );

  constructor() {
    this.controller.attach(this.calendar, (fn) => this.zone.runOutsideAngular(fn));
    this.reportProblems();
    let reading = false;
    const stop = this.calendar.kernel.subscribe((e) => {
      if (e.type === 'source') return;
      // The history records a command after the store has said it changed:
      // what can be undone is read once the task is over (one read for a burst).
      if (!reading) {
        reading = true;
        queueMicrotask(() => {
          reading = false;
          if (!this.destroyed) this.emit(() => this.controller.read(this.calendar));
        });
      }
      this.emit(() => {
        if (e.type !== 'state') return;
        this.controller.state.set(e.state);
        // The two-way state follows the calendar; written only when it differs,
        // so the binding handing it back is a no-op (D.7).
        const s = e.state;
        if (untracked(this.view) !== s.view.type) this.view.set(s.view.type);
        const d = untracked(this.date);
        if (d === undefined || !d.equals(s.date)) this.date.set(s.date);
      });
    });
    this.unsubscribe = stop;

    // The settings are read here, so the effect follows them; the call into the
    // calendar runs untracked. The calendar may answer by calling back — a view
    // change writes `view` — and a callback that writes a signal inside an
    // effect is an error on Angular 18 (NG0600), and a hidden dependency on any.
    let sent: Record<string, unknown> = {};
    effect(() => {
      const s = this.settings() as Record<string, unknown>;
      untracked(() => {
        // Only what changed since the last call: a view or a date change must not
        // diff ten thousand events again, and one bad value must not be sent
        // again with every later change.
        const changes: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s)) if (sent[k] !== v) changes[k] = v;
        // Another template (or none): the views made from the last one go; the
        // calendar redraws every event's content with the new hooks.
        if ('hooks' in changes) this.dropViews();
        sent = s;
        if (Object.keys(changes).length > 0) this.apply(changes as CalendarUpdate);
      });
    });
    effect(() => {
      const sel = this.selection();
      untracked(() => {
        if (sel === this.lastSelection) return;
        this.lastSelection = sel;
        this.zone.runOutsideAngular(() => this.calendar.select(sel));
      });
    });
  }

  private readonly unsubscribe: () => void;

  private destroyed = false;

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unsubscribe();
    this.calendar.destroy();
    this.dropViews();
    this.controller.detach();
  }

  private dropViews(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    for (const v of this.dayViews.values()) v.destroy();
    this.dayViews.clear();
  }

  /** The DOM calendar, for what the inputs and the controller do not cover. */
  get instance(): CalendarInstance {
    return this.calendar;
  }

  /** Outputs and signal writes go back into Angular's zone (a no-op zoneless). */
  private emit(fn: () => void): void {
    if (NgZone.isInAngularZone()) fn();
    else this.zone.run(fn);
  }

  /**
   * Hands changes to the calendar outside Angular's zone (the listeners and
   * timers a view mounts must not run change detection on every pointer move;
   * a no-op zoneless). `update()` refuses a bad value whole (an unknown view,
   * every day hidden): then each change goes alone, the bad ones are reported
   * to Angular's ErrorHandler, and the bindings get the calendar's real view
   * and date back — the good changes are not lost with the bad.
   */
  private apply(changes: CalendarUpdate): void {
    const run = (c: CalendarUpdate) => this.zone.runOutsideAngular(() => this.calendar.update(c));
    try {
      run(changes);
    } catch {
      for (const [k, v] of Object.entries(changes)) {
        try {
          run({ [k]: v } as CalendarUpdate);
        } catch (err) {
          this.errors.handleError(err);
        }
      }
      const st = this.calendar.kernel.getState();
      this.emit(() => {
        if (untracked(this.view) !== st.view.type) this.view.set(st.view.type);
        const d = untracked(this.date);
        if (d !== undefined && !d.equals(st.date)) this.date.set(st.date);
      });
    }
    if ('events' in changes) this.reportProblems();
  }

  private reportProblems(): void {
    const p = this.calendar.kernel.getProblems();
    if (p && p !== untracked(this.controller.problems)) {
      this.controller.problems.set(p);
      if (p.problems.length > 0) this.emit(() => this.problems.emit(p));
    }
  }

  // ── event templates: one embedded view per event node, checked alone ──
  private readonly views = new Map<HTMLElement, EmbeddedViewRef<EventContentContext>>();
  /** How many times an event's view was checked: a test reads it. @internal */
  checks = 0;

  private templateHooks(dir: DzEventContent): NonNullable<CalendarHooks['event']> {
    return {
      content: (ctx, el) => {
        // A background (a closed day): drawn only when the template gives it something (`@if (ctx.background)`).
        if (ctx.background) {
          const probe = this.vcr.createEmbeddedView(dir.template, { $implicit: ctx.instance.event, event: ctx.instance.event, ctx });
          probe.detectChanges();
          const empty = probe.rootNodes.every((n: Node) => n.nodeType === 8 || (n.nodeType === 3 && !n.textContent?.trim()) || (n instanceof Element && !n.childNodes.length && !n.textContent?.trim() && n.tagName !== 'IMG'));
          probe.destroy();
          if (empty) return null;
        }
        const context: EventContentContext = { $implicit: ctx.instance.event, event: ctx.instance.event, ctx };
        let view = this.views.get(el);
        if (!view || view.destroyed) {
          // In the component's own container, so a signal its template reads
          // (the application's, not the event's) refreshes that view alone;
          // its nodes are moved into the event's node, as a portal does.
          view = this.vcr.createEmbeddedView(dir.template, context);
          this.views.set(el, view);
        } else Object.assign(view.context, context);
        view.detectChanges();
        this.checks++;
        const host = this.host.ownerDocument.createElement('span');
        host.className = 'dz-ev__content';
        host.append(...(view.rootNodes as Node[]));
        return host;
      },
      willUnmount: ({ el }) => {
        this.views.get(el)?.destroy();
        this.views.delete(el);
      },
    };
  }

  // ── day-head templates: one embedded view per head, checked alone ──
  private readonly dayViews = new Map<HTMLElement, EmbeddedViewRef<DayHeaderContext>>();

  private dayHeaderHooks(dir: DzDayHeader): NonNullable<CalendarHooks['dayHeader']> {
    return {
      content: (day, el) => {
        const context: DayHeaderContext = { $implicit: day, day };
        let view = this.dayViews.get(el);
        if (!view || view.destroyed) {
          view = this.vcr.createEmbeddedView(dir.template, context);
          this.dayViews.set(el, view);
        } else Object.assign(view.context, context);
        view.detectChanges();
        const host = this.host.ownerDocument.createElement('span');
        host.className = 'dz-dayhead__content';
        host.append(...(view.rootNodes as Node[]));
        return host;
      },
      willUnmount: ({ el }) => {
        this.dayViews.get(el)?.destroy();
        this.dayViews.delete(el);
      },
    };
  }
}
