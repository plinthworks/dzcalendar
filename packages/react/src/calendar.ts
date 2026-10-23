import { Fragment, createElement as h, forwardRef, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties, ForwardedRef, ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { AvailableSlot, CalEvent, CreateRequest, EventInstance, NormalizationReport, PlainDate, Problem, Selection, SourceNotice } from '@dzcalendar/core';
import { loadTemporal, temporalReady } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance, CalendarOptions, CalendarUpdate, DateClick, EventChange, EventContentCtx, HeaderItemCtx, MotionAdapter, CalendarProblem } from '@dzcalendar/dom';
import { DzCalendarContext } from './context.js';
import type { DzCalendarDefaults } from './context.js';
import { CalendarController, CalendarControllerContext } from './controller.js';
import { same } from './same.js';
import { templateClass, templateHooks, templateShape } from '@dzcalendar/dom/toolkit';
import { TEMPLATES, sourceOf } from './templates.js';
import type { Portal, TemplateElement, TemplateProps } from './templates.js';

/** Layout effects in a browser; on a server (where nothing is drawn) plain effects, which React does not warn about. */
const useBrowserLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** The callbacks the component takes as its own props (with what the calendar reports). */
const OWN_CALLBACKS = ['onEventClick', 'onDateClick', 'onEventOpen', 'onCreateRequest', 'onSelect', 'onUnselect', 'onSlotClick', 'onResourceProblems', 'onEventChange', 'onProblem'] as const;
/** Props that are not options of the calendar. */
const NOT_OPTIONS = new Set<string>([...OWN_CALLBACKS, 'controller', 'renderEventContent', ...Object.values(TEMPLATES), 'hooks', 'headerItems', 'defaultView', 'defaultDate', 'onViewChange', 'onDateChange', 'selection', 'onSelectionChange', 'onSourceNotice', 'onProblems', 'onError', 'axis', 'className', 'style', 'id', 'motion', 'initial']);

/** Everything `update()` takes, less what has a prop of its own below. */
export type DzCalendarOptions = Omit<CalendarUpdate, 'hooks' | 'headerItems' | 'motion' | (typeof OWN_CALLBACKS)[number]>;

export interface DzCalendarProps extends DzCalendarOptions, TemplateProps {
  /** Read with `useCalendarState(controller)`; driven with its methods. Keep the same one (`useCalendarController()`). */
  readonly controller?: CalendarController;
  /** The view shown: given, the calendar follows it; `onViewChange` says when a person changes it. */
  readonly view?: string;
  /** The first view, when `view` is not given. */
  readonly defaultView?: string;
  readonly onViewChange?: (view: string) => void;
  readonly date?: PlainDate;
  readonly defaultDate?: PlainDate;
  readonly onDateChange?: (date: PlainDate) => void;
  /** The selection shown (null: none); `onSelectionChange` says what a person selects. */
  readonly selection?: Selection | null;
  readonly onSelectionChange?: (selection: Selection | null) => void;
  /** 'wall' (clock times, a 25-hour day has 25 rows… as the zone's day is) or 'elapsed'. */
  readonly axis?: 'wall' | 'elapsed';
  /** Options read once, when the calendar is made (`firstDay`, `rules`, `now`…): over the provider's defaults, under the props. */
  readonly initial?: DzCalendarDefaults;
  /** Made at creation, not changed after (`DzCalendarProvider`'s `motion` makes one per calendar). */
  readonly motion?: MotionAdapter;
  readonly onDateClick?: (click: DateClick) => void;
  /** A free slot clicked (or Enter on it): the slot as given. Book it; the server checks it again. */
  readonly onSlotClick?: (slot: AvailableSlot) => void;
  /** Something the calendar could not do as asked, found while drawing (without it: the console, once per code). */
  readonly onProblem?: (problem: CalendarProblem) => void;
  readonly onEventClick?: (instance: EventInstance) => void;
  /** What a person changed (a drag, a resize, the keyboard, the menu, the editor): persist it; `revert()` if the server refuses. */
  readonly onEventChange?: (change: EventChange) => void;
  readonly onEventOpen?: (instance: EventInstance) => void;
  readonly onCreateRequest?: (request: CreateRequest) => void;
  /** A selection made by a person (`onSelectionChange` hears it too). */
  readonly onSelect?: (selection: Selection) => void;
  /** Loading, a failed fetch, problems in a delivery, a save refused. */
  readonly onSourceNotice?: (notice: SourceNotice) => void;
  /** What the events given could not be read as. */
  readonly onProblems?: (report: NormalizationReport) => void;
  /** What the `resources` given could not be read as. */
  readonly onResourceProblems?: (problems: readonly Problem[]) => void;
  /** A value the calendar refused (an unknown view, every day hidden): the others are applied. Default `console.error`. */
  readonly onError?: (error: unknown) => void;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly id?: string;
  /** `data-*` and `aria-*` attributes go on the calendar's element. */
  readonly [attribute: `data-${string}` | `aria-${string}`]: string | number | boolean | undefined;
}

/** What a ref on `<DzCalendar>` gives. */
export interface DzCalendarHandle {
  /** The DOM calendar; null before mounting. */
  readonly instance: CalendarInstance | null;
  readonly controller: CalendarController;
}

/** Keys whose value is undefined are left out: a prop not given changes nothing. */
function defined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/** What a template draws for an element (undefined: no template for it now). */
function drawOf(p: DzCalendarProps, element: string, ctx: unknown): ReactNode | undefined {
  if (element === 'event') return p.renderEventContent ? p.renderEventContent((ctx as EventContentCtx).instance.event, ctx as EventContentCtx) : undefined;
  if (element.startsWith('header:')) {
    const item = p.headerItems?.[element.slice(7)];
    return item === undefined ? undefined : typeof item === 'function' ? (item as (c: HeaderItemCtx) => ReactNode)(ctx as HeaderItemCtx) : item;
  }
  const render = p[TEMPLATES[element as TemplateElement]] as ((c: unknown) => ReactNode) | undefined;
  return render ? render(ctx) : undefined;
}

function Calendar(props: DzCalendarProps, ref: ForwardedRef<DzCalendarHandle>) {
  const settled = useContext(DzCalendarContext);
  const own = useMemo(() => new CalendarController(), []);
  const controller = props.controller ?? own;
  const host = useRef<HTMLDivElement>(null);
  const cal = useRef<CalendarInstance | null>(null);
  // No Temporal of its own (Safari): the calendar made once its polyfill has arrived (owner, 18i).
  const [temporal, setTemporal] = useState(temporalReady);
  useEffect(() => {
    if (temporal) return;
    let live = true;
    loadTemporal().then(
      () => live && setTemporal(true),
      (e: unknown) => console.error("dzcalendar: temporal-load-failed — Temporal's polyfill could not be loaded; the calendar is not drawn", e),
    );
    return () => {
      live = false;
    };
  }, [temporal]);
  /** The props of the last render: what the calendar's callbacks call. */
  const latest = useRef(props);
  latest.current = props;

  // ── templates: one portal per drawn node, rendered in this component's tree ──
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const queued = useRef(false);
  /**
   * Drawn before the browser paints: the calendar paints in its own frames,
   * outside React's work; a microtask runs once that work is over, and
   * `flushSync` renders the portals then, not a frame later.
   */
  const refresh = () => {
    if (queued.current) return;
    queued.current = true;
    queueMicrotask(() => {
      queued.current = false;
      if (!cal.current) return;
      try {
        flushSync(bump);
      } catch {
        bump();
      }
    });
  };
  const seq = useRef(0);
  /** Each element's templates: the node it is drawn for → its span and what it is told. */
  const portals = useRef(new Map<string, Map<HTMLElement, Portal>>());
  const source = useMemo(() => sourceOf(latest), []);
  const shape = templateShape(source);
  /** One set of hooks while the shape stays: `update()` compares them member by member. */
  const built = useMemo(
    () =>
      templateHooks(
        source,
        (element, el, ctx) => {
          let of = portals.current.get(element);
          if (!of) portals.current.set(element, (of = new Map()));
          let p = of.get(el);
          if (!p) {
            const span = el.ownerDocument.createElement('span');
            span.className = templateClass(element);
            p = { key: `t${seq.current++}`, span, ctx };
            of.set(el, p);
          } else p.ctx = ctx;
          refresh();
          return p.span;
        },
        (element, el) => {
          if (portals.current.get(element)?.delete(el)) refresh();
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shape],
  );

  // ── the options: what changed since the last render goes to the calendar ──
  const settings: Record<string, unknown> = {};
  /** `data-*` and `aria-*` go on the calendar's element, with `className`, `style`, `id`. */
  const attributes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (/^(data|aria)-/.test(k)) attributes[k] = v;
    else if (!NOT_OPTIONS.has(k)) settings[k] = v;
  }
  if (props.axis) settings['timeGrid'] = { ...props.timeGrid, axis: props.axis };
  settings['hooks'] = built.hooks;
  settings['headerItems'] = built.headerItems;
  const sent = useRef<Record<string, unknown>>({});
  const refused = useRef<{ view?: string; date?: PlainDate }>({});
  const reported = useRef<{ view?: string; date?: PlainDate; selection?: Selection | null; problems?: NormalizationReport | null }>({});

  /**
   * The callbacks whose presence changes what the calendar offers ("Open" in
   * the menu, "New event here", slots as buttons): given only while their prop is.
   */
  const ctl = useRef(controller);
  const offers = () => {
    const p = latest.current;
    // What the Pro's editor took over wins over the props.
    const t = ctl.current.takenOver;
    return {
      onEventOpen: t?.onEventOpen ?? (p.onEventOpen && ((i: EventInstance) => latest.current.onEventOpen?.(i))),
      onCreateRequest: t?.onCreateRequest ?? (p.onCreateRequest && ((r: CreateRequest) => latest.current.onCreateRequest?.(r))),
      onSlotClick: p.onSlotClick && ((x: AvailableSlot) => latest.current.onSlotClick?.(x)),
      onProblem: p.onProblem && ((x: CalendarProblem) => latest.current.onProblem?.(x)),
    };
  };
  const offeredKey = () => {
    const t = ctl.current.takenOver;
    const p = latest.current;
    return [t?.onEventOpen ?? p.onEventOpen, t?.onCreateRequest ?? p.onCreateRequest, p.onSlotClick, p.onProblem].map((f) => (f === undefined ? '0' : f === t?.onEventOpen || f === t?.onCreateRequest ? 't' : '1')).join('');
  };
  const offered = offeredKey();
  const lastOffered = useRef(offered);
  /** Offers again now (a takeover begun or ended). */
  const reoffer = () => {
    const c = cal.current;
    if (!c) return;
    lastOffered.current = offeredKey();
    try {
      c.update(offers() as CalendarUpdate);
    } catch {
      /* a calendar being destroyed */
    }
  };
  const fail = (err: unknown) => (latest.current.onError ?? ((e: unknown) => console.error(e)))(err);
  const reportProblems = (c: CalendarInstance) => {
    const p = c.kernel.getProblems();
    if (!p || p === reported.current.problems) return;
    reported.current.problems = p;
    controller.setProblems(p);
    if (p.problems.length > 0) latest.current.onProblems?.(p);
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
      // The parent gets the calendar's real view and date back.
      const st = c.kernel.getState();
      if ('view' in changes && changes['view'] !== st.view.type) refused.current.view = changes['view'] as string;
      if ('date' in changes && !(changes['date'] as PlainDate).equals?.(st.date)) refused.current.date = changes['date'] as PlainDate;
      if ('view' in changes && changes['view'] !== st.view.type) {
        reported.current.view = st.view.type;
        latest.current.onViewChange?.(st.view.type);
      }
      if ('date' in changes && !(changes['date'] as PlainDate).equals?.(st.date)) {
        reported.current.date = st.date;
        latest.current.onDateChange?.(st.date);
      }
    }
    if ('events' in changes) reportProblems(c);
  };

  // ── made when mounted, destroyed when unmounted ──
  useBrowserLayoutEffect(() => {
    if (!temporal) return;
    const el = host.current!;
    const first = defined(settings);
    const given = latest.current;
    let motion: { motion?: MotionAdapter } = {};
    if (given.motion) motion = { motion: given.motion };
    else if (settled.motion && settled.defaults.motion === undefined) {
      try {
        motion = { motion: settled.motion() };
      } catch (err) {
        // A factory that fails (gsap missing) is reported; the calendar is drawn still.
        fail(err);
      }
    }
    const view = given.view ?? given.defaultView;
    const date = given.date ?? given.defaultDate;
    let c: CalendarInstance;
    const options = {
      ...settled.defaults,
      ...given.initial,
      ...motion,
      ...first,
      ...(view !== undefined && { initialView: view }),
      ...(date !== undefined && { initialDate: date }),
      onDateClick: (x: DateClick) => latest.current.onDateClick?.(x),
      onEventChange: (c: EventChange) => latest.current.onEventChange?.(c),
      ...defined(offers()),
      onResourceProblems: (ps: readonly Problem[]) => latest.current.onResourceProblems?.(ps),
      onEventClick: (i: EventInstance) => latest.current.onEventClick?.(i),
      onSelect: (sel: Selection) => {
        reported.current.selection = sel;
        latest.current.onSelect?.(sel);
        latest.current.onSelectionChange?.(sel);
      },
      onUnselect: () => {
        if (reported.current.selection === null) return;
        reported.current.selection = null;
        latest.current.onSelectionChange?.(null);
      },
      onSource: (n: SourceNotice) => {
        if (n.type === 'loading') controller.setLoading(n.loading);
        if (n.type === 'problems') controller.setProblems(n.report);
        latest.current.onSourceNotice?.(n);
      },
    } as CalendarOptions;
    delete (options as Record<string, unknown>)['view'];
    delete (options as Record<string, unknown>)['date'];
    try {
      c = createCalendar(el, options);
    } catch (err) {
      // A first view or date refused: reported, the calendar made without them.
      fail(err);
      const { initialView: _v, initialDate: _d, ...rest } = options as Record<string, unknown>;
      c = createCalendar(el, rest as CalendarOptions);
    }
    cal.current = c;
    sent.current = first;
    lastOffered.current = offered;
    reported.current = { view: c.kernel.getState().view.type, date: c.kernel.getState().date, selection: given.selection ?? null };
    if (given.selection) c.select(given.selection);
    ctl.current.attach(c);
    ctl.current.onReoffer(reoffer);
    reportProblems(c);
    let reading = false;
    const stop = c.kernel.subscribe((e) => {
      if (e.type === 'source') return;
      // The history records a command after the store has said it changed: read once the task is over.
      if (!reading) {
        reading = true;
        queueMicrotask(() => {
          reading = false;
          if (cal.current === c) ctl.current.read();
        });
      }
      if (e.type !== 'state') return;
      ctl.current.read();
      // Said once per change, and not back to whoever just set it.
      const s = e.state;
      // A view or a date given: rendered again, so the prop wins if the parent did not follow (as a controlled input).
      if (latest.current.view !== undefined || latest.current.date !== undefined) bump();
      if (reported.current.view !== s.view.type) {
        reported.current.view = s.view.type;
        latest.current.onViewChange?.(s.view.type);
      }
      if (!reported.current.date?.equals(s.date)) {
        reported.current.date = s.date;
        latest.current.onDateChange?.(s.date);
      }
    });
    return () => {
      stop();
      cal.current = null;
      c.destroy();
      portals.current.clear();
      ctl.current.onReoffer(null);
      ctl.current.detach(c);
    };
    // Made once (once Temporal is there): later props go through `update()` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temporal]);

  useBrowserLayoutEffect(() => {
    const c = cal.current;
    if (!c) return;
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(settings)) if (v !== undefined && k !== 'view' && k !== 'date' && !same(sent.current[k], v)) changes[k] = v;
    // A view or a date given is compared with what the calendar shows, not with what was sent: the prop wins.
    const st = c.kernel.getState();
    // A value the calendar refused is not tried again until the prop changes (its error said once).
    if (props.view !== undefined && props.view !== st.view.type && props.view !== refused.current.view) changes['view'] = props.view;
    if (props.date !== undefined && !props.date.equals(st.date) && !same(props.date, refused.current.date)) changes['date'] = props.date;
    // What the parent gave is not said back to it.
    if (changes['view'] !== undefined) reported.current.view = changes['view'] as string;
    if (changes['date'] !== undefined) reported.current.date = changes['date'] as PlainDate;
    // Everything seen is recorded — a view or date dropped above as no change too, or the parent setting it back later would look like nothing.
    for (const [k, v] of Object.entries(settings)) if (v !== undefined) sent.current[k] = v;
    // Other hooks: nothing is dropped here — an element whose hooks changed is let go by the calendar (its willUnmount releases its portal); the others keep theirs.
    if (offered !== lastOffered.current) {
      lastOffered.current = offered;
      Object.assign(changes, offers());
    }
    if (Object.keys(changes).length > 0) apply(c, changes);
    const sel = props.selection;
    if (sel !== undefined && sel !== reported.current.selection) {
      reported.current.selection = sel;
      c.select(sel);
    }
  });

  // Another controller given: the calendar is handed over to it.
  useBrowserLayoutEffect(() => {
    const was = ctl.current;
    if (was === controller) return;
    ctl.current = controller;
    const c = cal.current;
    if (!c) return;
    was.onReoffer(null);
    was.detach(c);
    controller.attach(c);
    controller.onReoffer(reoffer);
    reoffer();
  });

  useImperativeHandle(ref, () => ({
    get instance() {
      return cal.current;
    },
    controller,
  }), [controller]);

  // Every template's portals, in this component's tree: they see this calendar's controller (`useParentCalendarController()`).
  const drawn: ReactNode[] = [];
  for (const [element, of] of portals.current) {
    for (const p of of.values()) {
      const out = drawOf(props, element, p.ctx);
      if (out !== undefined) drawn.push(createPortal(out, p.span, p.key));
    }
  }
  return h(
    Fragment,
    null,
    h('div', { ...attributes, ref: host, className: props.className, style: props.style, id: props.id }),
    drawn.length > 0 ? h(CalendarControllerContext.Provider, { value: controller }, drawn) : null,
  );
}

/**
 * `<DzCalendar>`: the DOM calendar in a React application. Options as props
 * (what changed goes to the calendar), `view` / `date` / `selection` given
 * or free (`onViewChange`…), callbacks for what a person does, a
 * `CalendarController` for what sits around it, `renderEventContent` for the
 * events (portals: the application's context reaches them).
 */
export const DzCalendar = forwardRef<DzCalendarHandle, DzCalendarProps>(Calendar);
DzCalendar.displayName = 'DzCalendar';
