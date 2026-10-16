import { actionsFor, assertBusinessHours, createKernel, formatTemporal, isValidZone, Temporal } from '@dzcalendar/core';
import type { Command, CommandResult, EditScope, Instant, Proposal, ZonedDateTime } from '@dzcalendar/core';
import { createSettings } from './settings.js';
import { attachInteractions } from './interact/host.js';
import type { LiveSettings } from './settings.js';
import type { ActionItem, CalendarKernel, CreateRequest, DurationLike, EventInput, EventInstance, KernelOptions, NavDirection, PlainDate, ZoneId } from '@dzcalendar/core';
import type { CalendarHooks, MenuHook, ViewController, ViewCtx } from './host.js';
import { viewFactory } from './host.js';
import { createMenu } from './menu.js';
import { EN, FR } from './messages.js';
import type { DzMessages } from './messages.js';
import { NO_MOTION } from './motion.js';
import type { MotionAdapter } from './motion.js';
import { createPopover } from './popover.js';
import { FrameScheduler } from './render/frame.js';
import { h } from './render/reconcile.js';
import { Scope } from './render/scope.js';
import { DZ_CSS, ensureStyles } from './styles.js';
import { createToolbar } from './toolbar.js';
// Built-in views register themselves.
import './views/timegrid.js';
import './views/daygrid.js';

export interface CalendarOptions extends Partial<KernelOptions>, LiveSettings {
  /** A kernel built elsewhere (shared store, tests). Otherwise one is made from the options. */
  readonly kernel?: CalendarKernel;
  /** Default: FR for French locales, EN otherwise. */
  readonly messages?: DzMessages;
  /** False under a CSP without inline styles: include `DZ_CSS` yourself. */
  readonly injectStyles?: boolean;
  /** The calendar owns it from here: it is destroyed with the calendar, or when replaced. */
  readonly motion?: MotionAdapter;
  /** Where the time grid is scrolled to on first paint. Default PT8H. */
  readonly scrollTime?: DurationLike;
  /** The line at the current time, refreshed every minute. Default true. */
  readonly nowIndicator?: boolean;
  /** The view switcher's buttons. Default: month, week, day — those this renderer draws. */
  readonly headerViews?: readonly string[];
  /** Lanes a month day shows before "+N": a number, or 'auto' (measured). Default 'auto'. */
  readonly dayMaxLanes?: number | 'auto';
  readonly hooks?: CalendarHooks;
  /**
   * "New event here" from the context menu: the application opens its own
   * editor. A moment in a time grid, a date in a month.
   */
  readonly onCreateRequest?: (request: CreateRequest) => void;
}

export interface CalendarUpdate extends Partial<LiveSettings> {
  readonly messages?: DzMessages;
  readonly locale?: string;
  readonly timeZone?: ZoneId;
  readonly view?: string;
  readonly date?: PlainDate;
  readonly motion?: MotionAdapter;
  readonly events?: readonly EventInput[];
  readonly hooks?: CalendarHooks;
  readonly businessHours?: KernelOptions['businessHours'];
}

export interface CalendarInstance {
  readonly kernel: CalendarKernel;
  readonly element: HTMLElement;
  /**
   * Changes what was asked to change and nothing else, and draws once. A
   * value equal to the current one is a no-op — a framework hands options back
   * after every change, and the screen must not flicker, lose its scroll
   * position or the focused event.
   */
  update(changes: CalendarUpdate): void;
  navigate(dir: NavDirection): void;
  /** Runs a command through the calendar's history (undoable); `validate` checks it against the rules as a gesture would be. */
  run(cmd: Command, opts?: { readonly validate?: boolean }): CommandResult;
  undo(): boolean;
  redo(): boolean;
  destroy(): void;
}

const isZone = (z: string) => isValidZone(z);

function shallowSame(a: object, b: object): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

function sameHooks(a: CalendarHooks, b: CalendarHooks): boolean {
  if (a === b) return true;
  const ea = a.event ?? {};
  const eb = b.event ?? {};
  return shallowSame(ea, eb) && Object.keys(a).length === Object.keys(b).length;
}

const messagesFor = (locale: string) => (locale.toLowerCase().startsWith('fr') ? FR : EN);

/** Right-to-left for Arabic, Hebrew, Persian…: from the locale (method or getter, as engines differ). */
function directionOf(locale: string): 'ltr' | 'rtl' {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getTextInfo?: () => { direction?: string }; textInfo?: { direction?: string } };
    const info = typeof l.getTextInfo === 'function' ? l.getTextInfo() : l.textInfo;
    return info?.direction === 'rtl' ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

/**
 * A calendar in `host`: the time grid (week, day) and the day grid (month,
 * week, day), with "+N" panels, business hours, a context menu on cells and
 * events, navigation and a view switcher. Read-only until Phase 7.
 */
export function createCalendar(host: HTMLElement, options: CalendarOptions = {}): CalendarInstance {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  if (options.injectStyles !== false) ensureStyles(host, 'core', DZ_CSS);

  const owned = !options.kernel;
  // Defaults go after the spread: `timeZone: undefined` (a framework's unset
  // input) or `locale: ''` (an empty lang attribute) must not erase them.
  const kernel =
    options.kernel ??
    createKernel({
      ...options,
      timeZone: options.timeZone || Temporal.Now.timeZoneId(),
      locale: options.locale || doc.documentElement.lang || 'en',
    } as KernelOptions);

  const drawable = (type: string) => {
    const spec = kernel.getViewSpec(type);
    return spec !== undefined && viewFactory(spec.family) !== undefined;
  };
  const initial = kernel.getState().view;
  if (!viewFactory(initial.family)) throw new RangeError(`the ${initial.family} family has no renderer`);

  const scope = new Scope();
  const scheduler = new FrameScheduler(win);
  scope.add(() => scheduler.cancel());
  let messagesGiven = options.messages !== undefined;
  const root = h(doc, 'div', 'dz-cal');
  root.dir = directionOf(kernel.getState().locale);

  const menu = createMenu(doc, root);
  const popover = createPopover(doc, root);
  // On destroy, close without handing focus back to a node that is going away.
  scope.add(() => {
    menu.close(false);
    popover.close(false);
  });

  const settings = createSettings(options);
  // What a screen reader is told about gestures: moved, refused, moved past a skipped hour.
  const liveRegion = h(doc, 'div', 'dz-live');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('role', 'status');
  root.append(liveRegion);
  /** A short menu at a point: resolves with the value chosen, or null when it closes without one. */
  function choose<T>(label: string, choices: readonly { id: string; label: string; value: T }[], at: { x: number; y: number }): Promise<T | null> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: T | null) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      menu.open(
        choices.map((c) => ({ id: c.id, label: c.label, enabled: true, run: () => finish(c.value) })),
        at,
        doc.activeElement as HTMLElement | null,
        label,
        () => finish(null),
      );
      ctx.motion.overlayOpen?.(menu.element);
    });
  }
  const ctx: ViewCtx = {
    doc,
    kernel,
    scope,
    scheduler,
    messages: options.messages ?? messagesFor(kernel.getState().locale),
    locale: kernel.getState().locale,
    zone: kernel.getState().timeZone,
    motion: options.motion ?? NO_MOTION,
    hooks: options.hooks ?? {},
    epoch: 0,
    snapMinutes: settings.current.snapMinutes ?? 15,
    popoverElement: popover.element,
    openMenu(target, at, returnFocus) {
      const state = kernel.getState();
      const live = settings.current;
      const defaults = actionsFor(target, {
        displayZone: state.timeZone,
        labels: ctx.messages,
        formatDate: (d) => formatTemporal(d, { weekday: 'long', day: 'numeric', month: 'long' }, ctx.locale),
        formatTime: (i, withOffset) => {
          const z = i.toZonedDateTimeISO(state.timeZone);
          const hm = formatTemporal(z.toPlainTime(), { hour: '2-digit', minute: '2-digit' }, ctx.locale);
          return withOffset ? `${hm} (${z.offset})` : hm;
        },
        ...(live.onCreateRequest && { onCreateRequest: live.onCreateRequest }),
        ...(live.onEventOpen && { onOpen: live.onEventOpen }),
        ...(live.editable && {
          onCommand: (cmd: Command) => {
            // A person's choice from the menu: checked against the rules.
            const r = kernel.run(cmd, { validate: true });
            // Read again: the callback may have been replaced since the menu opened.
            if (!r.ok) settings.current.onCommandRefused?.(r, cmd);
          },
        }),
        ...(drawable('timeGridDay') && { onGoToDay: (d: PlainDate) => kernel.setView('timeGridDay', d) }),
      });
      const items: readonly ActionItem[] | null = live.contextMenu ? live.contextMenu({ target, state }, defaults) : defaults;
      if (!items || items.length === 0) return false;
      menu.open(items, at, returnFocus, ctx.messages.actions);
      ctx.motion.overlayOpen?.(menu.element);
      return true;
    },
    live: () => settings.current,
    rules: () => kernel.rules(),
    announce(text) {
      // Emptied first, so the same words twice are said twice.
      liveRegion.textContent = '';
      requestAnimationFrame(() => (liveRegion.textContent = text));
    },
    chooseScope(request, at) {
      const own = settings.current.chooseScope;
      if (own) return Promise.resolve(own(request));
      return choose<EditScope>(ctx.messages.changeWhich, [
        { id: 'this', label: ctx.messages.scopeThis, value: 'this' },
        { id: 'following', label: ctx.messages.scopeFollowing, value: 'following' },
        { id: 'all', label: ctx.messages.scopeAll, value: 'all' },
      ], at);
    },
    chooseReading(p, at) {
      if (!p.ambiguity) return Promise.resolve(p);
      const zone = kernel.getState().timeZone;
      const read = (i: Instant) => i.toZonedDateTimeISO(zone);
      const hm = (z: ZonedDateTime) => formatTemporal(z.toPlainTime(), { hour: '2-digit', minute: '2-digit' }, ctx.locale);
      const [a, b] = [p.ambiguity.chosen, p.ambiguity.alternative].sort((x, y) => x.epochMilliseconds - y.epochMilliseconds) as [Instant, Instant];
      const option = (i: Instant, first: boolean) => {
        const z = read(i);
        // The event keeps its own zone; only the moment changes — of the edge that was ambiguous (a resize moves one).
        const shift = i.epochMilliseconds - p.ambiguity!.chosen.epochMilliseconds;
        const move = p.ambiguity!.edge === 'start';
        const start = move ? (p.start as ZonedDateTime).add({ milliseconds: shift }) : p.start;
        const end = (p.end as ZonedDateTime).add({ milliseconds: shift });
        return { id: first ? 'first' : 'second', label: ctx.messages.reading({ time: hm(z), offset: z.offset, first }), value: { ...p, start, end } as Proposal };
      };
      return choose<Proposal>(ctx.messages.whichReading({ time: hm(read(a)) }), [option(a, true), option(b, false)], at);
    },
    refused(result, command) {
      settings.current.onCommandRefused?.(result, command);
      ctx.announce(ctx.messages.dropRefused);
    },
    openMore(anchor, title, nodes, onClose) {
      popover.open(anchor, title, nodes, ctx.messages.closePopover, onClose);
      ctx.motion.overlayOpen?.(popover.element);
    },
  };

  const headerViews = (options.headerViews ?? ['dayGridMonth', 'timeGridWeek', 'timeGridDay']).filter(drawable);
  const toolbar = createToolbar(doc, scope, kernel, headerViews, (dir) => kernel.navigate(dir), (v) => kernel.setView(v));
  root.append(toolbar.element);

  let view: ViewController | null = null;
  let viewScope: Scope | null = null;
  let mountedFamily: string | null = null;
  let firstPaint = true;
  /** While `update` applies several changes, the kernel's events wait for one paint. */
  let holding = false;
  let dirty = false;
  let pendingDir: 'prev' | 'next' | 'other' | undefined;

  function mount(family: string): ViewController {
    if (view && mountedFamily === family) return view;
    view?.destroy();
    viewScope?.dispose();
    const factory = viewFactory(family);
    if (!factory) throw new Error(`no renderer for ${family}`);
    // The view's own scope (its listeners, released when another family
    // mounts), over the shared context: words, zone and hooks stay live.
    viewScope = new Scope();
    const viewCtx = Object.assign(Object.create(ctx) as ViewCtx, { scope: viewScope });
    view = factory(viewCtx);
    if (view.surface) attachInteractions(viewCtx, view.surface);
    mountedFamily = family;
    root.append(view.element);
    firstPaint = true;
    return view;
  }

  function paint(): void {
    if (holding) {
      dirty = true;
      return;
    }
    const state = kernel.getState();
    ctx.zone = state.timeZone;
    toolbar.draw(state, ctx.messages, root.dir === 'rtl');
    const vm = kernel.viewModel();
    const v = mount(vm.family);
    root.dataset['view'] = state.view.type;
    root.classList.toggle('dz-editable', settings.current.editable === true);
    const created = v.render(vm.model, state);
    if (options.nowIndicator !== false) v.tick(kernel.now(), state);
    if (!firstPaint && pendingDir) ctx.motion.viewChange?.(v.body, pendingDir);
    else if (!firstPaint && created.length > 0) ctx.motion.eventsEnter?.(created);
    pendingDir = undefined;
    if (firstPaint) {
      firstPaint = false;
      if (vm.family === 'timeGrid' && v.scrollTo) {
        const scroll = Temporal.Duration.from(options.scrollTime ?? 'PT8H').total({ unit: 'minutes' });
        const slotMin = (vm.model as { options: { slotMin?: DurationLike } }).options.slotMin;
        const min = slotMin ? Temporal.Duration.from(slotMin).total({ unit: 'minutes' }) : 0;
        v.scrollTo(Math.max(0, scroll - min));
      }
      if (vm.family === 'dayGrid') measureLanes();
    }
  }

  // ── 'auto' lanes: measured once per size, never during a render ───────────
  const autoLanes = (options.dayMaxLanes ?? 'auto') === 'auto';
  if (typeof options.dayMaxLanes === 'number') kernel.setOptions({ dayGrid: { maxLanes: options.dayMaxLanes } });
  // Until measured, a month shows at most 4 lanes: a day of 10 000 events must
  // not draw 10 000 nodes before "+N" exists.
  else if (autoLanes) kernel.setOptions({ dayGrid: { maxLanes: 4 } });
  // A bar-sized probe, added once here (a write), only measured in `read`.
  // Its own class (sized like a bar), so no `.dz-bar` query ever mistakes it for an event.
  const probe = h(doc, 'div', 'dz-probe');
  probe.setAttribute('aria-hidden', 'true');
  root.append(probe);
  function measureLanes(): void {
    if (!autoLanes || mountedFamily !== 'dayGrid') return;
    // Only a month is squeezed into rows of fixed height; a week or a day of
    // the day grid grows to show everything.
    if (kernel.getState().view.alignment !== 'month') return kernel.setOptions({ dayGrid: { maxLanes: null } });
    scheduler.schedule({
      read: () => {
        const week = root.querySelector<HTMLElement>('.dz-dg__week');
        if (!week) return null;
        // The row's own tracks: the day-number track, one per lane, a gap
        // between every two — what the grid really reserves, not the button.
        const style = getComputedStyle(week);
        const head = parseFloat(style.gridTemplateRows.split(' ')[0] ?? '') || 0;
        const gap = parseFloat(style.rowGap) || 0;
        const bar = probe.getBoundingClientRect().height;
        const weekH = week.getBoundingClientRect().height;
        return weekH > 0 && bar > 0 ? Math.max(1, Math.floor((weekH - head - gap) / (bar + gap))) : null;
      },
      write: (lanes) => {
        if (lanes !== null) kernel.setOptions({ dayGrid: { maxLanes: lanes } });
      },
    });
  }
  const RO = (win as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  if (RO) {
    const ro = new RO(() => measureLanes());
    ro.observe(root);
    scope.add(() => ro.disconnect());
  }

  scope.add(
    kernel.subscribe((e) => {
      // A menu or a "+N" panel describes the screen as it was: any change closes it.
      menu.close(false);
      popover.close(false);
      if (e.type === 'state') {
        if (e.direction) pendingDir = e.direction;
        // Another zone or locale changes what every label says, at the same keys and places.
        if (e.causes.includes('zone') || e.causes.includes('locale')) {
          ctx.zone = e.state.timeZone;
          ctx.locale = e.state.locale;
          ctx.epoch++;
        }
        if (e.causes.includes('locale')) root.dir = directionOf(e.state.locale);
      }
      paint();
      if (e.type === 'state' && (e.causes.includes('view') || e.causes.includes('navigate'))) measureLanes();
    }),
  );

  // Once a minute, aligned on the minute; paused while the tab is hidden. It
  // always runs — past midnight the kernel moves "today" (a state event, so a
  // paint) — and the now line is just what it also redraws when wanted.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const untilNextMinute = () => 60000 - (kernel.now().epochMilliseconds % 60000);
  const tick = () => {
    if (root.isConnected && !kernel.refreshToday() && options.nowIndicator !== false) view?.tick(kernel.now(), kernel.getState());
    timer = setTimeout(tick, untilNextMinute());
  };
  const startTicking = () => {
    clearTimeout(timer);
    if (!doc.hidden) timer = setTimeout(tick, untilNextMinute());
  };
  scope.on(doc, 'visibilitychange', () => {
    if (doc.hidden) return clearTimeout(timer);
    if (!kernel.refreshToday() && options.nowIndicator !== false) view?.tick(kernel.now(), kernel.getState());
    startTicking();
  });
  scope.add(() => clearTimeout(timer));
  startTicking();

  host.append(root);
  paint();

  return {
    kernel,
    element: root,
    update(changes) {
      const state = kernel.getState();
      // Everything that can be refused is refused first: a throw leaves the
      // kernel, and the screen, exactly as they were.
      const viewType = changes.view ?? state.view.type;
      const sameDate = changes.date === undefined || changes.date.equals(state.date);
      const viewChanges = viewType !== state.view.type || !sameDate;
      if (viewChanges) {
        if (!kernel.getViewSpec(viewType)) throw new RangeError(`unknown view: ${viewType}`);
        if (!drawable(viewType)) throw new RangeError(`no renderer for the view ${viewType}`);
      }
      if (changes.timeZone && changes.timeZone !== state.timeZone && !isZone(changes.timeZone)) throw new RangeError(`not a time zone: ${changes.timeZone}`);
      if ('businessHours' in changes && changes.businessHours !== undefined) assertBusinessHours(changes.businessHours);
      // Live settings check themselves and apply at once (nothing to redraw): a bad one throws here, before any change.
      if (settings.apply(changes)) {
        ctx.snapMinutes = settings.current.snapMinutes ?? 15;
        root.classList.toggle('dz-editable', settings.current.editable === true);
      }
      holding = true;
      try {
        kernel.batch(() => {
          if (changes.motion && changes.motion !== ctx.motion) {
            ctx.motion.destroy?.();
            ctx.motion = changes.motion;
          }
          // Compared member by member: a wrapper that rebuilds the same object
          // on every change must not redraw every event.
          if (changes.hooks && !sameHooks(changes.hooks, ctx.hooks)) {
            ctx.hooks = changes.hooks;
            ctx.epoch++;
            dirty = true;
          }
          const newLocale = changes.locale && changes.locale !== state.locale ? changes.locale : null;
          const newMessages = changes.messages && !shallowSame(changes.messages, ctx.messages) ? changes.messages : null;
          if (newMessages) messagesGiven = true;
          if (newLocale) kernel.setLocale(newLocale);
          if (newMessages || newLocale) {
            ctx.messages = newMessages ?? (messagesGiven ? ctx.messages : messagesFor(newLocale ?? state.locale));
            ctx.locale = newLocale ?? ctx.locale;
            ctx.epoch++;
            dirty = true;
          }
          if (changes.timeZone && changes.timeZone !== state.timeZone) kernel.setTimeZone(changes.timeZone);
          if ('businessHours' in changes && changes.businessHours !== undefined) kernel.setOptions({ businessHours: changes.businessHours });
          if (changes.events) kernel.setEvents(changes.events);
          if (viewChanges) kernel.setView(viewType, changes.date);
        });
      } finally {
        holding = false;
      }
      if (dirty) {
        dirty = false;
        paint();
      }
    },
    navigate: (dir) => kernel.navigate(dir),
    run: (cmd, opts) => kernel.run(cmd, opts),
    undo: () => kernel.history.undo(),
    redo: () => kernel.history.redo(),
    destroy() {
      scope.dispose();
      viewScope?.dispose();
      ctx.motion.destroy?.();
      view?.destroy();
      if (owned) kernel.destroy();
      root.remove();
    },
  };
}
