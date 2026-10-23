import { Comment, Teleport, Text, computed, defineComponent, getCurrentInstance, h, inject, nextTick, onBeforeUnmount, onMounted, provide, shallowRef, watch } from 'vue';
import type { ComponentPublicInstance, PropType, SlotsType, VNode } from 'vue';
import type {
  AvailableSlot,
  BusinessHoursInput,
  CalEvent,
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
import { loadTemporal, temporalReady } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type {
  AllDayLabelCtx,
  CalendarHooks,
  CalendarInstance,
  CalendarOptions,
  CalendarUpdate,
  DateClick,
  DayCellCtx,
  DayHeaderCtx,
  CalendarProblem,
  DropInfo,
  DzMessages,
  EventChange,
  EventContentCtx,
  EventLeave,
  HeaderItemCtx,
  ListDayHeaderCtx,
  MonthHeaderCtx,
  MoreLinkCtx,
  MotionAdapter,
  NoEventsCtx,
  NowIndicatorCtx,
  ResourceAreaHeaderCtx,
  ResourceContentCtx,
  ResourceGroupCtx,
  SlotLabelCtx,
  WeekNumberCtx,
} from '@dzcalendar/dom';
import { templateClass, templateHooks, templateShape } from '@dzcalendar/dom/toolkit';
import type { TemplateElement, TemplateSource } from '@dzcalendar/dom/toolkit';
import { CALENDAR_CONTROLLER, createCalendarController, writesOf } from './controller.js';
import type { CalendarController } from './controller.js';
import { DZ_CALENDAR_SETTLED } from './plugin.js';
import type { DzCalendarDefaults } from './plugin.js';
import { same } from './same.js';

/** The callbacks the component turns into events: not options (they would silence them). */
const OWN_CALLBACKS = ['onEventClick', 'onDateClick', 'onEventOpen', 'onCreateRequest', 'onSelect', 'onUnselect', 'onSlotClick', 'onResourceProblems', 'onEventChange', 'onDrop', 'onEventReceive', 'onEventLeave', 'onProblem'] as const;

/** What `options` takes: what `update()` takes, less what has a prop or an event of its own. */
export type DzCalendarOptions = Omit<CalendarUpdate, 'view' | 'date' | 'events' | 'sources' | 'hooks' | 'headerItems' | 'motion' | (typeof OWN_CALLBACKS)[number]>;

/** What the `#day-header` slot receives: the day (its date, resource, length, the calendar's words). */
export interface DayHeaderSlotProps {
  readonly day: DayHeaderCtx;
  readonly ctx: DayHeaderCtx;
}

/** Each element with a content and its slot (docs/behaviors/render-hooks.md); a header place is `#header-item-<name>`. */
export const SLOTS: Record<TemplateElement, string> = {
  event: 'event-content',
  dayHeader: 'day-header',
  dayCell: 'day-cell',
  slotLabel: 'slot-label',
  allDayLabel: 'all-day-label',
  moreLink: 'more-link',
  nowIndicator: 'now-indicator',
  weekNumber: 'week-number',
  noEvents: 'no-events',
  listDayHeader: 'list-day-header',
  monthHeader: 'month-header',
  resource: 'resource',
  resourceGroupHeader: 'resource-group-header',
  resourceAreaHeader: 'resource-area-header',
};

/** The slots, each with what it receives (`{ ctx }` for those added in 18f-2). */
export interface DzCalendarSlots {
  'event-content'?: (props: EventContentSlotProps) => VNode[];
  'day-header'?: (props: DayHeaderSlotProps) => VNode[];
  'day-cell'?: (props: { readonly ctx: DayCellCtx }) => VNode[];
  'slot-label'?: (props: { readonly ctx: SlotLabelCtx }) => VNode[];
  'all-day-label'?: (props: { readonly ctx: AllDayLabelCtx }) => VNode[];
  'more-link'?: (props: { readonly ctx: MoreLinkCtx }) => VNode[];
  'now-indicator'?: (props: { readonly ctx: NowIndicatorCtx }) => VNode[];
  'week-number'?: (props: { readonly ctx: WeekNumberCtx }) => VNode[];
  'no-events'?: (props: { readonly ctx: NoEventsCtx }) => VNode[];
  'list-day-header'?: (props: { readonly ctx: ListDayHeaderCtx }) => VNode[];
  'month-header'?: (props: { readonly ctx: MonthHeaderCtx }) => VNode[];
  resource?: (props: { readonly ctx: ResourceContentCtx }) => VNode[];
  'resource-group-header'?: (props: { readonly ctx: ResourceGroupCtx }) => VNode[];
  'resource-area-header'?: (props: { readonly ctx: ResourceAreaHeaderCtx }) => VNode[];
  [headerItem: `header-item-${string}`]: ((props: { readonly ctx: HeaderItemCtx }) => VNode[]) | undefined;
}

/** What the `#event-content` slot receives. */
export interface EventContentSlotProps {
  readonly event: CalEvent;
  readonly ctx: EventContentCtx;
}

/** The events whose listeners change what the calendar offers ("Open" in the menu, "New event here", slots as buttons). */
const OFFERS = { onEventOpen: 'onEventOpen', onCreateRequest: 'onCreateRequest', onSlotClick: 'onSlotClick', onProblem: 'onProblem' } as const;

/** Keys whose value is undefined are left out: a prop not bound changes nothing. */
function defined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

const any = <T>() => ({ type: null as unknown as PropType<T>, default: undefined });

/** What `<DzCalendar>` takes: its props, and its events as `on…` listeners (`@event-click`, `v-model:view`). */
export interface DzCalendarProps {
  readonly events?: readonly EventInput[];
  readonly sources?: readonly EventSourceSpec[];
  readonly resources?: readonly ResourceInput[];
  readonly view?: string;
  readonly date?: PlainDate;
  readonly selection?: Selection | null;
  readonly timeZone?: ZoneId;
  readonly locale?: string;
  readonly axis?: 'wall' | 'elapsed';
  readonly editable?: boolean;
  readonly selectable?: boolean;
  readonly businessHours?: BusinessHoursInput;
  readonly weekends?: boolean;
  readonly weekNumbers?: boolean;
  readonly hiddenDays?: readonly Weekday[];
  readonly messages?: Partial<DzMessages>;
  readonly theme?: string;
  readonly scheme?: 'auto' | 'light' | 'dark';
  readonly density?: 'compact' | 'comfortable' | 'spacious';
  readonly displayCalendar?: string | null;
  readonly secondaryCalendar?: string | null;
  readonly availableSlots?: readonly AvailableSlot[] | null;
  readonly options?: DzCalendarOptions;
  readonly initial?: DzCalendarDefaults;
  readonly controller?: CalendarController;
  readonly motion?: MotionAdapter;
  /** Classes and mounts (and a content where no slot is given) for any element: merged with the slots. */
  readonly hooks?: CalendarHooks;
  readonly 'onUpdate:view'?: (view: string) => void;
  readonly 'onUpdate:date'?: (date: PlainDate) => void;
  readonly 'onUpdate:selection'?: (selection: Selection | null) => void;
  readonly onDateClick?: (click: DateClick) => void;
  readonly onSlotClick?: (slot: AvailableSlot) => void;
  readonly onEventClick?: (instance: EventInstance) => void;
  readonly onEventChange?: (change: EventChange) => void;
  /** `@dropped`: an element of the page dropped here (`makeDraggable`), its event made. */
  readonly onDropped?: (drop: DropInfo) => void;
  /** `@event-receive`: an event came in; `revert()` takes it back. */
  readonly onEventReceive?: (change: EventChange) => void;
  /** `@event-leave`: an event went to another calendar; `revert()` puts it back on both. */
  readonly onEventLeave?: (leave: EventLeave) => void;
  readonly onEventOpen?: (instance: EventInstance) => void;
  readonly onCreateRequest?: (request: CreateRequest) => void;
  readonly onSelected?: (selection: Selection) => void;
  readonly onSourceNotice?: (notice: SourceNotice) => void;
  readonly onProblems?: (report: NormalizationReport) => void;
  readonly onResourceProblems?: (problems: readonly Problem[]) => void;
  readonly onError?: (error: unknown) => void;
}

/**
 * The component's type, written out rather than inferred: what
 * `defineComponent` infers names Vue's internal generics, which change between
 * minor versions (3.4 and 3.5 count them differently).
 */
export type DzCalendarComponent = new () => ComponentPublicInstance & {
  $props: DzCalendarProps;
  $slots: DzCalendarSlots;
};

/**
 * `<DzCalendar>`: the DOM calendar in a Vue application. Props for the
 * options (what changed goes to the calendar), `v-model:view`,
 * `v-model:date` and `v-model:selection`, events for what a person does, a
 * `CalendarController` of refs for what sits around it, and an
 * `#event-content` slot for the events (teleported into each event: the
 * application's provides, store and router reach it).
 */
export const DzCalendar = defineComponent({
  name: 'DzCalendar',
  // The component renders the calendar's element and the teleports: `class`, `style`, `id`… go on the element.
  inheritAttrs: false,
  props: {
    /** Diffed by the store (by id, by value): a new array with the same events redraws nothing. */
    events: any<readonly EventInput[] | undefined>(),
    /** The whole list; a spec is compared by identity — keep the objects stable. */
    sources: any<readonly EventSourceSpec[] | undefined>(),
    resources: any<readonly ResourceInput[] | undefined>(),
    view: any<string | undefined>(),
    date: any<PlainDate | undefined>(),
    /** null: none; undefined (not bound): left to the calendar. */
    selection: any<Selection | null | undefined>(),
    timeZone: any<ZoneId | undefined>(),
    locale: any<string | undefined>(),
    axis: any<'wall' | 'elapsed' | undefined>(),
    editable: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    selectable: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    businessHours: any<BusinessHoursInput | undefined>(),
    weekends: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    weekNumbers: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    hiddenDays: any<readonly Weekday[] | undefined>(),
    messages: any<Partial<DzMessages> | undefined>(),
    theme: any<string | undefined>(),
    scheme: any<'auto' | 'light' | 'dark' | undefined>(),
    density: any<'compact' | 'comfortable' | 'spacious' | undefined>(),
    displayCalendar: any<string | null | undefined>(),
    secondaryCalendar: any<string | null | undefined>(),
    availableSlots: any<readonly AvailableSlot[] | null | undefined>(),
    /** Everything else `update()` takes. */
    options: { type: Object as PropType<DzCalendarOptions>, default: () => ({}) },
    /** Read and driven from beside the calendar (`createCalendarController()`); otherwise its own. */
    controller: any<CalendarController | undefined>(),
    /** Options read once, when the calendar is made (`firstDay`, `rules`, `now`…): over the plugin's defaults, under the props. */
    initial: any<DzCalendarDefaults | undefined>(),
    /** Made at creation, not changed after (the plugin's `motion` makes one per calendar). */
    motion: any<MotionAdapter | undefined>(),
    /** Classes and mounts (and a content where no slot is given) for any element: merged with the slots. */
    hooks: any<CalendarHooks | undefined>(),
  },
  emits: {
    'update:view': (_v: string) => true,
    'update:date': (_d: PlainDate) => true,
    'update:selection': (_s: Selection | null) => true,
    dateClick: (_c: DateClick) => true,
    /** A free slot clicked (or Enter on it): the slot as given. Book it; the server checks it again. */
    slotClick: (_s: AvailableSlot) => true,
    eventClick: (_i: EventInstance) => true,
    /** What a person changed (a drag, a resize, the keyboard, the menu, the editor): persist it; `revert()` if the server refuses. */
    eventChange: (_c: EventChange) => true,
    dropped: (_d: DropInfo) => true,
    eventReceive: (_c: EventChange) => true,
    eventLeave: (_l: EventLeave) => true,
    eventOpen: (_i: EventInstance) => true,
    createRequest: (_r: CreateRequest) => true,
    /** A selection made by a person (`v-model:selection` follows it too). */
    selected: (_s: Selection) => true,
    /** Loading, a failed fetch, problems in a delivery, a save refused. */
    sourceNotice: (_n: SourceNotice) => true,
    /** Something the calendar could not do as asked, found while drawing (without a listener: the console, once per code). */
    problem: (_p: CalendarProblem) => true,
    problems: (_r: NormalizationReport) => true,
    resourceProblems: (_p: readonly Problem[]) => true,
    /** A value the calendar refused (an unknown view, every day hidden): the others are applied. */
    error: (_e: unknown) => true,
  },
  slots: Object as SlotsType<DzCalendarSlots>,
  setup(props, { emit, slots, expose, attrs }) {
    const settled = inject(DZ_CALENDAR_SETTLED, {});
    const self = getCurrentInstance()!;
    // The controller given (read again if another is given), else its own; children see the first (`provide`).
    const own = createCalendarController();
    const controller = props.controller ?? own;
    let current = controller;
    let writes = writesOf(controller);
    provide(CALENDAR_CONTROLLER, controller);
    const host = shallowRef<HTMLElement | null>(null);
    /** A refused value, a failing motion factory: to `@error` when listened to, else to the application's error handler, else the console. */
    const fail = (err: unknown) => {
      if (typeof (self.vnode.props as Record<string, unknown> | null)?.['onError'] === 'function') emit('error', err);
      else if (self.appContext.config.errorHandler) self.appContext.config.errorHandler(err, self.proxy, 'dzcalendar');
      else console.error(err);
    };
    let cal: CalendarInstance | null = null;

    // ── templates: one teleport per drawn node, rendered in this component's tree ──
    /** Each template's nodes (`event`, `dayCell`…, `header:<name>`): the node drawn → its span and what it is told. */
    const portals = new Map<string, Map<HTMLElement, { key: string; span: HTMLElement; ctx: unknown }>>();
    const drawn = shallowRef(0);
    let seq = 0;
    /** A slot's output that draws nothing (an empty `v-if`): comments and blank text only. */
    const blank = (nodes: VNode[] | undefined) => !nodes || nodes.every((n) => n.type === Comment || (n.type === Text && !String(n.children ?? '').trim()));
    const named = slots as unknown as Record<string, ((p: unknown) => VNode[]) | undefined>;
    const source: TemplateSource = {
      has: (el) => Boolean(named[SLOTS[el]]),
      app: () => props.hooks,
      items: () => Object.keys(slots).filter((k) => k.startsWith('header-item-')).map((k) => k.slice(12)),
      blankBackground: (ctx) => blank(named['event-content']?.({ event: ctx.instance.event, ctx })),
    };
    const portal = (key: string, el: HTMLElement, ctx: unknown) => {
      let of = portals.get(key);
      if (!of) portals.set(key, (of = new Map()));
      let p = of.get(el);
      if (!p) {
        const span = el.ownerDocument.createElement('span');
        span.className = templateClass(key);
        p = { key: `t${seq++}`, span, ctx };
        of.set(el, p);
      } else p.ctx = ctx;
      // Vue renders in a microtask: before the browser paints.
      drawn.value++;
      return p.span;
    };
    const release = (key: string, el: HTMLElement) => {
      if (portals.get(key)?.delete(el)) drawn.value++;
    };
    let hooksFor: string | null = null;
    const hooksKey = () => templateShape(source);
    /** Made again only when the shape changes: the functions read the latest slots and `hooks`. */
    const hooks = () => templateHooks(source, portal, release);
    /** What a template draws for a node: the slot's own props (`{ event, ctx }`, `{ day }`), `{ ctx }` for the others. */
    const drawOf = (key: string, ctx: unknown): VNode[] | undefined => {
      if (key.startsWith('header:')) return named[`header-item-${key.slice(7)}`]?.({ ctx });
      const slot = named[SLOTS[key as TemplateElement]];
      if (!slot) return undefined;
      if (key === 'event') return slot({ event: (ctx as EventContentCtx).instance.event, ctx });
      if (key === 'dayHeader') return slot({ day: ctx, ctx });
      return slot({ ctx });
    };

    const settings = computed((): Record<string, unknown> => {
      const options: Record<string, unknown> = { ...props.options };
      for (const k of OWN_CALLBACKS) delete options[k];
      return {
        ...options,
        ...defined({
          view: props.view,
          date: props.date,
          events: props.events,
          sources: props.sources,
          resources: props.resources,
          timeZone: props.timeZone,
          locale: props.locale,
          editable: props.editable,
          selectable: props.selectable,
          businessHours: props.businessHours,
          weekends: props.weekends,
          weekNumbers: props.weekNumbers,
          hiddenDays: props.hiddenDays,
          messages: props.messages,
          theme: props.theme,
          scheme: props.scheme,
          density: props.density,
          displayCalendar: props.displayCalendar,
          secondaryCalendar: props.secondaryCalendar,
          availableSlots: props.availableSlots,
          timeGrid: props.axis ? { ...props.options.timeGrid, axis: props.axis } : undefined,
        }),
      };
    });

    /** The listeners bound on this component (`@event-open`…), read again at each render. */
    const listening = (name: string) => typeof (self.vnode.props as Record<string, unknown> | null)?.[name] === 'function';
    // What the Pro's editor took over wins over the listeners.
    const offers = () => ({
      onEventOpen: writes.taken()?.onEventOpen ?? (listening(OFFERS.onEventOpen) ? (i: EventInstance) => emit('eventOpen', i) : undefined),
      onCreateRequest: writes.taken()?.onCreateRequest ?? (listening(OFFERS.onCreateRequest) ? (r: CreateRequest) => emit('createRequest', r) : undefined),
      onSlotClick: listening(OFFERS.onSlotClick) ? (s: AvailableSlot) => emit('slotClick', s) : undefined,
      onProblem: listening(OFFERS.onProblem) ? (p: CalendarProblem) => emit('problem', p) : undefined,
    });
    let offered = '';
    const offeredNow = () => {
      const t = writes.taken();
      return [Boolean(t?.onEventOpen), Boolean(t?.onCreateRequest), ...Object.values(offers()).map(Boolean)].join();
    };

    const reported: { view?: string; date?: PlainDate; selection?: Selection | null; problems?: NormalizationReport | null } = {};
    let sent: Record<string, unknown> = {};
    const refused: { view?: string; date?: PlainDate } = {};
    const reportProblems = (c: CalendarInstance) => {
      const p = c.kernel.getProblems();
      if (!p || p === reported.problems) return;
      reported.problems = p;
      writes.setProblems(p);
      if (p.problems.length > 0) emit('problems', p);
    };
    /** `update()` refuses a bad value whole: then each change goes alone, the bad ones are reported, the good ones kept. */
    const apply = (c: CalendarInstance, changes: Record<string, unknown>) => {
      try {
        c.update(changes as CalendarUpdate);
      } catch {
        for (const [k, v] of Object.entries(changes)) {
          try {
            c.update({ [k]: v } as CalendarUpdate);
          } catch (err) {
            fail(err);
          }
        }
        // The bindings get the calendar's real view and date back.
        const st = c.kernel.getState();
        if ('view' in changes && changes['view'] !== st.view.type) refused.view = changes['view'] as string;
        if ('date' in changes && !(changes['date'] as PlainDate).equals?.(st.date)) refused.date = changes['date'] as PlainDate;
        if (props.view !== undefined && props.view !== st.view.type) emit('update:view', st.view.type);
        if (props.date !== undefined && !props.date.equals(st.date)) emit('update:date', st.date);
      }
      if ('events' in changes) reportProblems(c);
    };
    /** What changed since the last call goes; the same view or date as the calendar's is no change. */
    const sync = () => {
      const c = cal;
      if (!c) return;
      const s = { ...settings.value };
      const changes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s)) if (k !== 'view' && k !== 'date' && !same(sent[k], v)) changes[k] = v;
      // A view or a date bound is compared with what the calendar shows, not with what was sent: the binding wins.
      const st = c.kernel.getState();
      // A value the calendar refused is not tried again until the binding changes (its error said once).
      if (props.view !== undefined && props.view !== st.view.type && props.view !== refused.view) changes['view'] = reported.view = props.view;
      if (props.date !== undefined && !props.date.equals(st.date) && !same(props.date, refused.date)) changes['date'] = reported.date = props.date;
      sent = s;
      if (hooksKey() !== hooksFor) {
        hooksFor = hooksKey();
        // Nothing dropped here: an element whose hooks changed is let go by the calendar (its willUnmount releases its teleport); the others keep theirs.
        const made = hooks();
        changes['hooks'] = made.hooks;
        changes['headerItems'] = made.headerItems;
      }
      const o = offeredNow();
      if (o !== offered) {
        offered = o;
        Object.assign(changes, offers());
      }
      if (Object.keys(changes).length > 0) apply(c, changes);
      const sel = props.selection;
      if (sel !== undefined && sel !== reported.selection) {
        reported.selection = sel;
        c.select(sel);
      }
    };

    let stop: (() => void) | null = null;
    // No Temporal of its own (Safari): the calendar made once its polyfill has arrived, if still mounted (owner, 18i).
    let gone = false;
    const mount = () => {
      const first = settings.value;
      let motion: { motion?: MotionAdapter } = {};
      if (props.motion) motion = { motion: props.motion };
      else if (settled.motion && settled.defaults?.motion === undefined) {
        try {
          motion = { motion: settled.motion() };
        } catch (err) {
          // A factory that fails (gsap missing) is reported; the calendar is drawn still.
          fail(err);
        }
      }
      const { view, date, ...rest } = defined(first);
      hooksFor = hooksKey();
      offered = offeredNow();
      const options = {
        ...settled.defaults,
        ...props.initial,
        ...motion,
        ...rest,
        ...(view !== undefined && { initialView: view }),
        ...(date !== undefined && { initialDate: date }),
        ...(({ hooks: hk, headerItems }) => ({ hooks: hk, headerItems }))(hooks()),
        ...defined(offers()),
        onDateClick: (x: DateClick) => emit('dateClick', x),
        onEventClick: (i: EventInstance) => emit('eventClick', i),
        onEventChange: (c: EventChange) => emit('eventChange', c),
        onDrop: (d: DropInfo) => emit('dropped', d),
        onEventReceive: (c: EventChange) => emit('eventReceive', c),
        onEventLeave: (l: EventLeave) => emit('eventLeave', l),
        onResourceProblems: (ps: readonly Problem[]) => emit('resourceProblems', ps),
        onSelect: (s: Selection) => {
          reported.selection = s;
          emit('update:selection', s);
          emit('selected', s);
        },
        onUnselect: () => {
          if (reported.selection === null) return;
          reported.selection = null;
          emit('update:selection', null);
        },
        onSource: (n: SourceNotice) => {
          if (n.type === 'loading') writes.setLoading(n.loading);
          if (n.type === 'problems') writes.setProblems(n.report);
          emit('sourceNotice', n);
        },
      } as CalendarOptions;
      let c: CalendarInstance;
      try {
        c = createCalendar(host.value!, options);
      } catch (err) {
        // A first view or date refused: reported, the calendar made without them.
        fail(err);
        const { initialView: _v, initialDate: _d, ...without } = options as Record<string, unknown>;
        c = createCalendar(host.value!, without as CalendarOptions);
      }
      cal = c;
      sent = { ...first };
      const st = c.kernel.getState();
      Object.assign(reported, { view: st.view.type, date: st.date, selection: props.selection ?? null });
      if (props.selection) c.select(props.selection);
      writes.attach(c);
      writes.onReoffer(() => sync());
      reportProblems(c);
      let reading = false;
      stop = c.kernel.subscribe((e) => {
        if (e.type === 'source') return;
        // The history records a command after the store has said it changed: read once the task is over.
        if (!reading) {
          reading = true;
          queueMicrotask(() => {
            reading = false;
            if (cal === c) writes.read();
          });
        }
        if (e.type !== 'state') return;
        writes.read();
        const s = e.state;
        // A view or a date bound: once the parent has had its say, the binding wins (a fixed one sends the calendar back).
        if (props.view !== undefined || props.date !== undefined) void nextTick(() => cal === c && sync());
        if (reported.view !== s.view.type) {
          reported.view = s.view.type;
          emit('update:view', s.view.type);
        }
        if (!reported.date?.equals(s.date)) {
          reported.date = s.date;
          emit('update:date', s.date);
        }
      });
    };
    onMounted(() => {
      if (temporalReady()) mount();
      else loadTemporal().then(
        () => !gone && mount(),
        (e: unknown) => console.error("dzcalendar: temporal-load-failed — Temporal's polyfill could not be loaded; the calendar is not drawn", e),
      );
    });
    // Another controller given: the calendar is handed over to it.
    watch(
      () => props.controller ?? own,
      (next) => {
        if (next === current) return;
        const c = cal;
        if (c) {
          writes.onReoffer(null);
          writes.detach(c);
        }
        current = next;
        writes = writesOf(next);
        if (c) {
          writes.attach(c);
          writes.onReoffer(() => sync());
          sync();
        }
      },
    );
    // Props first (pre-flush), so the calendar has them before this component renders its teleports.
    watch(settings, () => sync(), { flush: 'pre' });
    watch(() => props.selection, () => sync(), { flush: 'pre' });

    onBeforeUnmount(() => {
      gone = true;
      stop?.();
      const c = cal;
      cal = null;
      portals.clear();
      if (c) {
        c.destroy();
        writes.onReoffer(null);
        writes.detach(c);
      }
    });

    expose({
      controller,
      /** The DOM calendar; null before mounting. */
      get instance() {
        return cal;
      },
    });

    return () => {
      // Listeners bound or unbound since the last render: what the calendar offers follows (after this render).
      // A slot added or taken away (`v-if`) changes the hooks: after this render too.
      if (cal && (offeredNow() !== offered || hooksKey() !== hooksFor)) void nextTick(sync);
      void drawn.value;
      const teleports: VNode[] = [];
      for (const [key, of] of portals) {
        for (const p of of.values()) {
          const out = drawOf(key, p.ctx);
          if (out !== undefined) teleports.push(h(Teleport, { to: p.span, key: p.key }, out));
        }
      }
      return [h('div', { ...attrs, ref: host }), ...teleports];
    };
  },
}) as unknown as DzCalendarComponent;
