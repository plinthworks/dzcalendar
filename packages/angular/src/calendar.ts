import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ErrorHandler,
  NgZone,
  ViewContainerRef,
  type EmbeddedViewRef,
  type OnDestroy,
  OnInit,
  computed,
  contentChild,
  contentChildren,
  effect,
  inject,
  input,
  model,
  output,
  untracked,
  type Signal,
  type TemplateRef,
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
import { temporalReady } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarHooks, CalendarInstance, CalendarOptions, CalendarProblem, CalendarUpdate, DateClick, DropInfo, DzMessages, EventChange, EventContentCtx, EventLeave, MotionAdapter } from '@dzcalendar/dom';
import { templateClass, templateHooks, templateShape } from '@dzcalendar/dom/toolkit';
import type { TemplateElement, TemplateSource } from '@dzcalendar/dom/toolkit';
import { CalendarController } from './controller.js';
import { DZ_CALENDAR_DEFAULTS, DZ_MOTION } from './providers.js';
import {
  DzAllDayLabel,
  DzDayCell,
  DzDayHeader,
  DzEventContent,
  DzHeaderItem,
  DzListDayHeader,
  DzMonthHeader,
  DzMoreLink,
  DzNoEvents,
  DzNowIndicator,
  DzResource,
  DzResourceAreaHeader,
  DzResourceGroupHeader,
  DzSlotLabel,
  DzWeekNumber,
} from './templates.js';

/** The callbacks the component turns into outputs: not options (they would silence the outputs). */
const OWN_CALLBACKS = ['onEventClick', 'onDateClick', 'onEventOpen', 'onCreateRequest', 'onSelect', 'onUnselect', 'onSlotClick', 'onResourceProblems', 'onEventChange', 'onDrop', 'onEventReceive', 'onEventLeave', 'onProblem'] as const;

/** What `[options]` takes: what `update()` takes, less what has an input or an output of its own. */
export type DzCalendarOptions = Omit<CalendarUpdate, 'view' | 'date' | 'events' | 'sources' | 'hooks' | 'headerItems' | (typeof OWN_CALLBACKS)[number]>;

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
export class DzCalendar implements OnInit, OnDestroy {
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
  /** Something the calendar could not do as asked, found while drawing (said on the console too, once per code). */
  readonly problem = output<CalendarProblem>();
  private readonly warnedProblems = new Set<string>();
  /** What the `resources` given could not be read as. */
  readonly resourceProblems = output<readonly Problem[]>();
  /** What a person changed (a drag, a resize, the keyboard, the menu, the editor): persist it; `revert()` if the server refuses. */
  readonly eventChange = output<EventChange>();
  /** An element of the page dropped here (`makeDraggable`), its event made (`dropped`: `drop` would also hear the browser's own drop event). */
  readonly dropped = output<DropInfo>();
  /** An event came in (from the page or another calendar): persist it; `revert()` takes it back. */
  readonly eventReceive = output<EventChange>();
  /** An event of this calendar went to another one: `revert()` puts it back on both. */
  readonly eventLeave = output<EventLeave>();

  /** Classes and mounts (and a content where no template is given) for any element: merged with the templates. */
  readonly hooks = input<CalendarHooks | undefined>(undefined);

  // ── templates: one per element with a content, and the header's places ──
  // Angular reads a query only as a class member's initializer: one each, gathered below.
  private readonly eventTemplate = contentChild(DzEventContent);
  private readonly dayHeaderTemplate = contentChild(DzDayHeader);
  private readonly dayCellTemplate = contentChild(DzDayCell);
  private readonly slotLabelTemplate = contentChild(DzSlotLabel);
  private readonly allDayLabelTemplate = contentChild(DzAllDayLabel);
  private readonly moreLinkTemplate = contentChild(DzMoreLink);
  private readonly nowIndicatorTemplate = contentChild(DzNowIndicator);
  private readonly weekNumberTemplate = contentChild(DzWeekNumber);
  private readonly noEventsTemplate = contentChild(DzNoEvents);
  private readonly listDayHeaderTemplate = contentChild(DzListDayHeader);
  private readonly monthHeaderTemplate = contentChild(DzMonthHeader);
  private readonly resourceTemplate = contentChild(DzResource);
  private readonly resourceGroupHeaderTemplate = contentChild(DzResourceGroupHeader);
  private readonly resourceAreaHeaderTemplate = contentChild(DzResourceAreaHeader);
  private readonly templates: Record<TemplateElement, Signal<{ readonly template: TemplateRef<unknown> } | undefined>> = {
    event: this.eventTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    dayHeader: this.dayHeaderTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    dayCell: this.dayCellTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    slotLabel: this.slotLabelTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    allDayLabel: this.allDayLabelTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    moreLink: this.moreLinkTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    nowIndicator: this.nowIndicatorTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    weekNumber: this.weekNumberTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    noEvents: this.noEventsTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    listDayHeader: this.listDayHeaderTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    monthHeader: this.monthHeaderTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    resource: this.resourceTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    resourceGroupHeader: this.resourceGroupHeaderTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
    resourceAreaHeader: this.resourceAreaHeaderTemplate as Signal<{ readonly template: TemplateRef<unknown> } | undefined>,
  };
  private readonly headerItemTemplates = contentChildren(DzHeaderItem);
  private readonly source: TemplateSource = {
    has: (el) => Boolean(this.templates[el]()),
    app: () => this.hooks(),
    items: () => this.headerItemTemplates().map((d) => d.name()),
    blankBackground: (ctx) => {
      // A background (a closed day): drawn only when the template gives it something (`@if (ctx.background)`).
      const dir = this.templates.event();
      if (!dir) return true;
      const probe = this.vcr.createEmbeddedView(dir.template, { $implicit: ctx.instance.event, event: ctx.instance.event, ctx });
      probe.detectChanges();
      const empty = probe.rootNodes.every((n: Node) => n.nodeType === 8 || (n.nodeType === 3 && !n.textContent?.trim()) || (n instanceof Element && !n.childNodes.length && !n.textContent?.trim() && n.tagName !== 'IMG'));
      probe.destroy();
      return empty;
    },
  };
  private shape = '';
  private made: ReturnType<typeof templateHooks> | null = null;
  /** Made again only when the shape changes (which templates, which members of `hooks`): `update()` then redraws nothing. */
  private readonly built = computed(() => {
    const shape = templateShape(this.source);
    if (shape !== this.shape || !this.made) {
      this.shape = shape;
      this.made = templateHooks(this.source, (key, el, ctx) => this.portal(key, el, ctx), (key, el) => this.release(key, el));
    }
    return this.made;
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
      hooks: this.built().hooks,
      headerItems: this.built().headerItems,
    };
  });

  /** The last selection the calendar itself reported: handed back by the binding, it is not drawn again. */
  private lastSelection: Selection | null = null;

  /**
   * Made in ngOnInit, once the inputs are bound: what they say is the calendar's
   * from its first paint (its zone, its scroll, its first view) — made at
   * construction, it drew with none of them and took them afterwards, too late
   * for what only the first paint reads (18j review: a `timeZone` input said
   * `zone-from-browser`, `scrollTime` was not scrolled to).
   */
  private calendar!: CalendarInstance;
  /** What the settings were when the calendar was made: the effect below sends only what changes after. */
  private sent: Record<string, unknown> = {};

  private make(): CalendarInstance {
    const given = { ...(untracked(this.settings) as Record<string, unknown>) };
    this.sent = given;
    // The bindings speak update()'s names: the view and the date shown are the calendar's first ones.
    const { view, date, ...rest } = given as { view?: string; date?: PlainDate } & Record<string, unknown>;
    try {
      return this.makeWith(rest, view, date);
    } catch {
      // A value the calendar refuses (an unknown view): made bare, then every binding laid on by the effect below,
      // each alone when one fails — the bad one told to Angular's ErrorHandler once, the good ones not lost with it.
      const made = this.makeWith({}, undefined, undefined);
      this.calendar = made;
      this.sent = {};
      return made;
    }
  }

  private makeWith(rest: Record<string, unknown>, view: string | undefined, date: PlainDate | undefined): CalendarInstance {
    return this.zone.runOutsideAngular(() =>
    createCalendar(this.host, {
      ...this.defaults,
      // The application's motion, made for this calendar, unless one is given here or in the defaults.
      ...(this.makeMotion && this.defaults.motion === undefined && (rest as CalendarOptions).motion === undefined && this.ownMotion()),
      ...(rest as CalendarOptions),
      ...(view !== undefined && { initialView: view }),
      ...(date !== undefined && { initialDate: date }),
      onDateClick: (c) => this.emit(() => this.dateClick.emit(c)),
      onSlotClick: (x) => this.emit(() => this.slotClick.emit(x)),
      onResourceProblems: (ps) => this.emit(() => this.resourceProblems.emit(ps)),
      onEventClick: (i) => this.emit(() => this.eventClick.emit(i)),
      onEventChange: (c) => this.emit(() => this.eventChange.emit(c)),
      onDrop: (d) => this.emit(() => this.dropped.emit(d)),
      onEventReceive: (c) => this.emit(() => this.eventReceive.emit(c)),
      onEventLeave: (l) => this.emit(() => this.eventLeave.emit(l)),
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
      // An output cannot tell whether it is listened to: told there, and on the console once per code.
      onProblem: (p) => {
        if (!this.warnedProblems.has(p.code)) {
          this.warnedProblems.add(p.code);
          console.warn(`dzcalendar: ${p.code} — ${p.detail}`);
        }
        this.emit(() => this.problem.emit(p));
      },
      onSource: (n) =>
        this.emit(() => {
          if (n.type === 'loading') this.controller.loading.set(n.loading);
          if (n.type === 'problems') this.controller.problems.set(n.report);
          this.sourceNotice.emit(n);
        }),
    }),
    );
  }

  /** The controller, the problems and the calendar's state wired to the bindings, once the calendar is drawn. */
  private wire(): void {
    this.wired = true;
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
  }

  ngOnInit(): void {
    this.calendar = this.make();
    // Drawn now, or — Temporal still loading (Safari, no provideDzCalendar() holding the start) — once it is
    // (18i): until then the calendar keeps what the bindings ask, and the controller and problems wait.
    if (temporalReady()) this.wire();
    else void this.calendar.ready.then(() => !this.destroyed && this.wire(), () => {});
  }

  constructor() {
    // The settings are read here, so the effect follows them; the call into the
    // calendar runs untracked. The calendar may answer by calling back — a view
    // change writes `view` — and a callback that writes a signal inside an
    // effect is an error on Angular 18 (NG0600), and a hidden dependency on any.
    effect(() => {
      const s = this.settings() as Record<string, unknown>;
      untracked(() => {
        // Not made yet (ngOnInit makes it with these very settings).
        if (!this.calendar) return;
        const sent = this.sent;
        // Only what changed since the last call: a view or a date change must not
        // diff ten thousand events again, and one bad value must not be sent
        // again with every later change.
        const changes: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s)) if (sent[k] !== v) changes[k] = v;
        // Another template (or none): the views made from the last one go; the
        // calendar redraws every event's content with the new hooks.
        // Other templates: nothing dropped here — an element whose hooks changed is let go by the calendar (its willUnmount destroys its view); the others keep theirs.
        this.sent = s;
        if (Object.keys(changes).length > 0) this.apply(changes as CalendarUpdate);
      });
    });
    effect(() => {
      const sel = this.selection();
      untracked(() => {
        if (!this.calendar || sel === this.lastSelection) return;
        this.lastSelection = sel;
        this.zone.runOutsideAngular(() => this.calendar.select(sel));
      });
    });
  }

  private unsubscribe: () => void = () => {};
  private wired = false;

  private destroyed = false;

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unsubscribe();
    this.calendar?.destroy();
    this.dropViews();
    this.controller.detach();
  }

  private dropViews(): void {
    for (const of of this.views.values()) for (const v of of.values()) v.view.destroy();
    this.views.clear();
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
    // Still waiting for Temporal: read once it is drawn (wire()).
    if (!this.wired) return;
    const p = this.calendar.kernel.getProblems();
    if (p && p !== untracked(this.controller.problems)) {
      this.controller.problems.set(p);
      if (p.problems.length > 0) this.emit(() => this.problems.emit(p));
    }
  }

  // ── templates: one embedded view per drawn node, checked alone ──
  private readonly views = new Map<string, Map<HTMLElement, { view: EmbeddedViewRef<unknown>; host: HTMLElement }>>();
  /** How many times an event's view was checked: a test reads it. @internal */
  checks = 0;

  /** The node drawn for `el` by its template: made once, its context updated after. */
  private portal(key: string, el: HTMLElement, ctx: unknown): HTMLElement {
    const dir = key.startsWith('header:') ? this.headerItemTemplates().find((d) => d.name() === key.slice(7)) : this.templates[key as TemplateElement]();
    if (!dir) {
      const none = this.host.ownerDocument.createElement('span');
      none.className = templateClass(key);
      return none;
    }
    // The context each template's `let-` reads: an event's `event` and `ctx`, a day head's `day`, the others' `ctx`.
    const context: Record<string, unknown> =
      key === 'event'
        ? { $implicit: (ctx as EventContentCtx).instance.event, event: (ctx as EventContentCtx).instance.event, ctx }
        : key === 'dayHeader'
          ? { $implicit: ctx, day: ctx, ctx }
          : { $implicit: ctx, ctx };
    let of = this.views.get(key);
    if (!of) this.views.set(key, (of = new Map()));
    let made = of.get(el);
    if (!made || made.view.destroyed) {
      // In the component's own container, so a signal its template reads
      // (the application's) refreshes that view alone; its nodes are moved
      // into the element's node, as a portal does — into one host kept for
      // that node, so a control focused in it (a header's select) stays.
      const host = this.host.ownerDocument.createElement('span');
      host.className = templateClass(key);
      made = { view: this.vcr.createEmbeddedView(dir.template, context), host };
      of.set(el, made);
    } else Object.assign(made.view.context as object, context);
    made.view.detectChanges();
    if (key === 'event') this.checks++;
    // Nodes a structural directive added since are taken in too; those already there stay put.
    for (const n of made.view.rootNodes as Node[]) if (n.parentNode !== made.host) made.host.append(n);
    return made.host;
  }

  private release(key: string, el: HTMLElement): void {
    const of = this.views.get(key);
    of?.get(el)?.view.destroy();
    of?.delete(el);
  }
}
