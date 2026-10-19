import { actionsFor, assertBusinessHours, assertTimeline, createKernel, formatTemporal, intentFor, isValidZone, Temporal } from '@dzcalendar/core';
import type { Command, CommandResult, EditScope, Instant, Proposal, Selection, ZonedDateTime } from '@dzcalendar/core';
import { createSettings } from './settings.js';
import { attachInteractions } from './interact/host.js';
import type { Interactions } from './interact/host.js';
import type { LiveSettings } from './settings.js';
import type { Weekday, ActionItem, CalendarKernel, CreateRequest, DurationLike, EventInput, EventSourceSpec, SourceNotice, EventInstance, KernelOptions, NavDirection, PlainDate, ZoneId } from '@dzcalendar/core';
import type { CalendarHooks, MenuHook, ViewController, ViewCtx } from './host.js';
import { viewFactory } from './host.js';
import { createMenu } from './menu.js';
import { messagesForLocale } from './messages.js';
import type { DzMessages } from './messages.js';
import { WAAPI_MOTION } from './motion-waapi.js';
import type { MotionAdapter, MotionChange } from './motion.js';
import { createPopover } from './popover.js';
import { FrameScheduler } from './render/frame.js';
import { h } from './render/reconcile.js';
import { Scope } from './render/scope.js';
import { DZ_CSS, ensureStyles } from './styles.js';
import { THEME_NAMES, ensureTheme, isKnownTheme } from './themes.js';
import { createToolbar } from './toolbar.js';
// Built-in views register themselves.
import './views/timegrid.js';
import './views/daygrid.js';

export interface CalendarOptions extends Partial<KernelOptions>, LiveSettings {
  /** A kernel built elsewhere (shared store, tests). Otherwise one is made from the options. */
  readonly kernel?: CalendarKernel;
  /** Default: the locale's (EN and FR built in; `@dzcalendar/dom/locales/ar|es|de`, `defineLocale`), else EN. */
  /** Any of the words, over the locale's (`defineLocale` takes a complete set). */
  readonly messages?: Partial<DzMessages>;
  /** False under a CSP without inline styles: include `DZ_CSS` yourself. */
  readonly injectStyles?: boolean;
  /**
   * The calendar's CSS in cascade layers (default true): any rule of the page
   * outside a layer wins over it. False for a page whose global reset is
   * unlayered (Tailwind 3, Bootstrap's reboot, normalize.css): the CSS is then
   * plain, its class selectors outweigh those resets, and a page rule of the
   * same weight coming after it wins. The first calendar of a document decides.
   */
  readonly cssLayers?: boolean;
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
  /** False hides Saturday and Sunday (added to `hiddenDays`). Default true. */
  readonly weekends?: boolean;
  /** A number per week: on the month's rows, in the week's corner. Default false. */
  readonly weekNumbers?: boolean;
  /**
   * A ready-made family ('standard', 'slate', 'night', 'pastel', 'frost',
   * 'solar', 'contrast' — with @dzcalendar/theme) or one made with
   * `defineTheme`. Default 'standard'.
   */
  readonly theme?: string;
  /** Light, dark, or the page's ('auto'). Default 'auto'. */
  readonly scheme?: 'auto' | 'light' | 'dark';
  /** Default 'comfortable'. */
  readonly density?: 'compact' | 'comfortable' | 'spacious';
  /**
   * The calendar dates are written in ('islamic-umalqura', 'persian'…; Intl's
   * names). The data and the grids stay Gregorian; titles, numbers and
   * labels follow it. Default: the locale's.
   */
  readonly displayCalendar?: string | null;
  /** A second calendar shown beside the dates (a cell's day, a heading's date). Default none. */
  readonly secondaryCalendar?: string | null;
  /** Months side by side at most in a multi-month view (1: a stack). Default 3. */
  readonly multiMonthMaxColumns?: number;
  /**
   * Above this many events in a view, only what is on screen (and a margin)
   * is mounted; below, everything (what a screen reader's browse mode reads).
   * Default 500; `Infinity` never windows.
   */
  readonly virtualizeAbove?: number;
  /** Options of a plugin's views, by family (`{ timeline: { areaColumns, … } }` for the Pro's timeline). */
  readonly viewOptions?: Readonly<Record<string, unknown>>;
  /** Prepares for printing on `beforeprint` (everything drawn) and restores on `afterprint`. Default false. */
  readonly autoPrint?: boolean;
  /**
   * Overlapping events side by side in a time grid before "+N": a number,
   * 'auto' (as many as the column's width allows, about 2.5rem each) or null
   * (all, however thin). Default 'auto'.
   */
  readonly eventMaxStack?: number | 'auto' | null;
}

export interface CalendarUpdate extends Partial<LiveSettings> {
  /** Any of the words, laid over the locale's: replaces what an earlier `messages` gave. */
  readonly messages?: Partial<DzMessages>;
  readonly locale?: string;
  readonly timeZone?: ZoneId;
  readonly view?: string;
  readonly date?: PlainDate;
  readonly motion?: MotionAdapter;
  readonly events?: readonly EventInput[];
  /** The whole list: sources gone are removed, new ones added, a changed spec (by identity) fetched again. */
  readonly sources?: readonly EventSourceSpec[];
  readonly hooks?: CalendarHooks;
  readonly businessHours?: KernelOptions['businessHours'];
  /** Bookable slots drawn in the week and day views (\`findSlots(...).slots\`); null: none. A new array redraws. */
  readonly availableSlots?: KernelOptions['availableSlots'];
  readonly hiddenDays?: KernelOptions['hiddenDays'];
  /** What resource views show as columns; a new array replaces them (the same array changes nothing). */
  readonly resources?: KernelOptions['resources'];
  readonly resourceOrder?: KernelOptions['resourceOrder'];
  readonly resourceGroupField?: KernelOptions['resourceGroupField'];
  /** An "Unassigned" column (a timeline row) first, for events on no known resource. */
  readonly showUnassigned?: boolean;
  /** A timeline's scale and lanes, merged key by key (`slot: undefined` back to the default). */
  readonly timeline?: KernelOptions['timeline'];
  /** A timeline's folded resources and groups (what `onResourceToggle` reports). */
  readonly collapsedResources?: readonly string[];
  readonly collapsedGroups?: readonly string[];
  /** Merged key by key over the current ones (`axis`, `slotMinutes`, `slotMin`…); equal values change nothing. */
  readonly timeGrid?: KernelOptions['timeGrid'];
  readonly weekends?: boolean;
  readonly weekNumbers?: boolean;
  readonly multiMonthMaxColumns?: number;
  /** The view switcher's buttons; equal lists change nothing. */
  readonly headerViews?: readonly string[];
  readonly theme?: string;
  readonly scheme?: 'auto' | 'light' | 'dark';
  readonly density?: 'compact' | 'comfortable' | 'spacious';
  readonly displayCalendar?: string | null;
  readonly secondaryCalendar?: string | null;
  /** Options of a plugin's views, by family; compared family by family (a new object for one redraws it). */
  readonly viewOptions?: Readonly<Record<string, unknown>>;
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
  /** Fetches one source again, or all; what is shown stays until the answers replace it. */
  refetch(sourceId?: string): void;
  /**
   * Draws everything now, nothing windowed — what `window.print()` should
   * see — and returns the function that puts the windowing back.
   */
  preparePrint(): () => void;
  /** Shows a selection (null clears it), as if a person had made it; `onSelect` is not called. */
  select(selection: Selection | null): void;
  /** Runs `fn` when the calendar is destroyed (what an editor opened on it closes with). Returns the way to take it back. */
  onDestroy(fn: () => void): () => void;
  /**
   * The options in force: what was given, with every `update` laid over it
   * (the view and date as now shown). What a copy of this calendar is made
   * from (paged printing), with `store: cal.kernel.store` to share the events.
   */
  getOptions(): CalendarOptions;
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
  return shallowSame(ea, eb) && shallowSame(a.resource ?? {}, b.resource ?? {}) && Object.keys(a).length === Object.keys(b).length;
}

/** Where a built-in family's renderer is imported from, for an error that says what to do. */
const entryHint = (family: string): string =>
  family === 'list' ? ` (import '@dzcalendar/dom/list')` : family === 'multiMonth' ? ` (import '@dzcalendar/dom/multimonth')` : '';

/** `hiddenDays`, plus the weekend when `weekends` is false. */
const hiddenOf = (hidden: readonly Weekday[] | undefined, weekends: boolean | undefined): Weekday[] =>
  [...new Set([...(hidden ?? []), ...(weekends === false ? ([6, 7] as const) : [])])].sort() as Weekday[];

/** The registered language's words (`defineLocale`, `@dzcalendar/dom/locales/*`), else English. */
const messagesFor = (locale: string) => messagesForLocale(locale);
/** An application's messages over the locale's: a set written before a version added keys still works. */
const withDefaults = (given: Partial<DzMessages> | undefined, locale: string): DzMessages => (given ? { ...messagesFor(locale), ...given } : messagesFor(locale));

/** A locale whose dates are written in `calendar` (Intl's `-u-ca-`); none: the locale as it is. */
function withCalendar(locale: string, calendar: string | null | undefined): string {
  let base: Intl.Locale;
  try {
    base = new Intl.Locale(locale);
  } catch {
    throw new RangeError(`not a locale: ${locale}`);
  }
  if (!calendar) return locale;
  let canonical: string;
  try {
    // Case and aliases as Intl takes them ('Islamic-Umalqura', 'islamicc' → 'islamic-civil').
    canonical = new Intl.Locale('und', { calendar: calendar.toLowerCase() }).calendar ?? calendar;
  } catch {
    throw new RangeError(`not a calendar name: ${calendar}`);
  }
  // A well-formed name Intl does not support would be ignored by it, silently: said here instead.
  const supported = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('calendar');
  if (supported && !supported.includes(canonical)) throw new RangeError(`not a calendar Intl supports here: ${calendar}`);
  return new Intl.Locale(base.toString(), { calendar: canonical }).toString();
}

/** A locale without its calendar keyword: what an application gave, when the kernel's carries one. */
function withoutCalendar(locale: string): string {
  try {
    const l = new Intl.Locale(locale);
    if (!l.calendar) return locale;
    return l.toString().replace(`-ca-${l.calendar}`, '').replace(/-u$/, '');
  } catch {
    return locale;
  }
}

/** A bad theme, scheme or density is a configuration error, said before anything changes. */
function checkLook(o: { theme?: string | undefined; scheme?: string | undefined; density?: string | undefined }): void {
  if (o.theme !== undefined && !isKnownTheme(o.theme)) throw new RangeError(`unknown theme: ${o.theme} (${THEME_NAMES.join(', ')}, or defineTheme first)`);
  if (o.scheme !== undefined && !['auto', 'light', 'dark'].includes(o.scheme)) throw new RangeError(`scheme is 'auto', 'light' or 'dark': ${o.scheme}`);
  if (o.density !== undefined && !['compact', 'comfortable', 'spacious'].includes(o.density)) throw new RangeError(`density is 'compact', 'comfortable' or 'spacious': ${o.density}`);
}

/** The second calendar's locale, or null when it is the one the dates are already written in. */
function altLocaleOf(base: string, display: string | null, secondary: string | null): string | null {
  if (!secondary) return null;
  const alt = withCalendar(base, secondary);
  const shown = new Intl.DateTimeFormat(withCalendar(base, display)).resolvedOptions().calendar;
  return new Intl.DateTimeFormat(alt).resolvedOptions().calendar === shown ? null : alt;
}

/** Right-to-left for Arabic, Hebrew, Persian…: from the locale (method or getter, as engines differ). */
/** Right-to-left scripts' languages, for engines without `Intl.Locale#getTextInfo` (older WebViews). */
const RTL = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ks', 'ku', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi']);
function directionOf(locale: string): 'ltr' | 'rtl' {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getTextInfo?: () => { direction?: string }; textInfo?: { direction?: string } };
    const info = typeof l.getTextInfo === 'function' ? l.getTextInfo() : l.textInfo;
    if (info?.direction) return info.direction === 'rtl' ? 'rtl' : 'ltr';
    // A script subtag decides first (az-Arab is right to left, ku-Latn is not).
    if (l.script) return ['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm', 'Rohg'].includes(l.script) ? 'rtl' : 'ltr';
    return RTL.has(l.language) ? 'rtl' : 'ltr';
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
  const cssLayers = options.cssLayers !== false;
  if (options.injectStyles !== false) ensureStyles(host, 'core', DZ_CSS, cssLayers);

  const owned = !options.kernel;
  // The locale as given; what the kernel and the labels use carries the display calendar.
  let baseLocale = options.locale || doc.documentElement.lang || 'en';
  let displayCalendar = options.displayCalendar ?? null;
  let secondaryCalendar = options.secondaryCalendar ?? null;
  // Defaults go after the spread: `timeZone: undefined` (a framework's unset
  // input) or `locale: ''` (an empty lang attribute) must not erase them.
  const kernel =
    options.kernel ??
    createKernel({
      ...options,
      timeZone: options.timeZone || Temporal.Now.timeZoneId(),
      hiddenDays: hiddenOf(options.hiddenDays, options.weekends),
      locale: withCalendar(baseLocale, displayCalendar),
    } as KernelOptions);
  if (options.kernel) {
    // Someone else's kernel: its locale is the base; a display calendar asked here is applied now, not at a later update.
    baseLocale = withoutCalendar(options.kernel.getState().locale);
    if (options.displayCalendar) options.kernel.setLocale(withCalendar(baseLocale, displayCalendar));
  }

  const drawable = (type: string) => {
    const spec = kernel.getViewSpec(type);
    return spec !== undefined && viewFactory(spec.family) !== undefined;
  };
  const initial = kernel.getState().view;
  if (!viewFactory(initial.family)) throw new RangeError(`the ${initial.family} family has no renderer${entryHint(initial.family)}`);

  const scope = new Scope();
  const scheduler = new FrameScheduler(win);
  scope.add(() => scheduler.cancel());
  let messagesGiven = options.messages !== undefined;
  // What the application gave, before the locale's defaults filled it: what a new `messages` is compared to.
  let givenMessages: Partial<DzMessages> | undefined = options.messages;
  const root = h(doc, 'div', 'dz-cal');
  root.dir = directionOf(kernel.getState().locale);
  // Theme, scheme, density: attributes the stylesheets read.
  const look = { theme: options.theme ?? 'standard', scheme: options.scheme ?? 'auto', density: options.density ?? 'comfortable' };
  checkLook(look);
  const applyLook = () => {
    // Always set: the theme's families (the standard one too) are keyed on it.
    root.dataset['dzTheme'] = look.theme;
    if (look.scheme === 'auto') delete root.dataset['dzScheme'];
    else root.dataset['dzScheme'] = look.scheme;
    if (look.density === 'comfortable') delete root.dataset['dzDensity'];
    else root.dataset['dzDensity'] = look.density;
    if (options.injectStyles !== false) ensureTheme(host, look.theme, cssLayers);
  };
  applyLook();
  let hidden: { days: readonly Weekday[] | undefined; weekends: boolean | undefined } = { days: options.hiddenDays, weekends: options.weekends };
  /** The resources array last given: the same one again changes nothing. */
  let resourcesGiven = options.resources;
  const columns = (n: number) => {
    if (!Number.isInteger(n) || n < 1) throw new RangeError(`multiMonthMaxColumns must be a whole number ≥ 1: ${n}`);
    root.style.setProperty('--dz-mm-cols', String(n));
  };
  columns(options.multiMonthMaxColumns ?? 3);

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
  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) anywhere in the calendar, but not in a field an application put there.
  scope.on(root, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    // Only where the person may change things: an application's own commands are not theirs to undo.
    if (ke.defaultPrevented || settings.current.keyboardUndo === false || settings.current.editable !== true) return;
    const t = ke.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .dz-menu')) return;
    const intent = intentFor(ke, { mode: 'cursor', rtl: root.dir === 'rtl', grid: 'day' });
    if (intent?.kind !== 'undo' && intent?.kind !== 'redo') return;
    ke.preventDefault();
    const focused = (doc.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-event-id]')?.dataset['eventId'] ?? null;
    const done = intent.kind === 'undo' ? kernel.history.undo() : kernel.history.redo();
    if (done) ctx.announce(intent.kind === 'undo' ? ctx.messages.undone : ctx.messages.redone);
    // The focused node may have gone with the change: the event where it now is, else the cursor.
    if (done && !root.contains(doc.activeElement)) interactions?.refocus(focused);
  });
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
    messages: withDefaults(options.messages, kernel.getState().locale),
    locale: kernel.getState().locale,
    zone: kernel.getState().timeZone,
    motion: options.motion ?? WAAPI_MOTION,
    hooks: options.hooks ?? {},
    epoch: 0,
    snapMinutes: settings.current.snapMinutes ?? 15,
    weekNumbers: options.weekNumbers === true,
    altLocale: altLocaleOf(baseLocale, displayCalendar, secondaryCalendar),
    virtualizeAbove: (() => {
      const v = options.virtualizeAbove ?? 500;
      if (!(v >= 0)) throw new RangeError(`virtualizeAbove must be a number ≥ 0 (Infinity: never): ${v}`);
      return v;
    })(),
    printing: false,
    viewOptions: options.viewOptions ?? {},
    injectStyles: options.injectStyles !== false,
    cssLayers,
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
        ...(live.editable && interactions && {
          onGrab: (inst: EventInstance, kind: 'move' | 'resize') => interactions?.grab(inst, kind),
          // A month draws a timed event's day, not its hours: it only moves there, as under the pointer.
          canResize: (inst: EventInstance) => (mountedFamily !== 'dayGrid' && mountedFamily !== 'multiMonth') || inst.event.allDay,
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
      // Two in one frame: the last is said.
      (win ?? globalThis).requestAnimationFrame(() => (liveRegion.textContent = text));
    },
    chooseScope(request, at) {
      const own = settings.current.chooseScope;
      if (own) return Promise.resolve(own(request));
      return choose<EditScope>(request.kind === 'delete' ? ctx.messages.deleteWhich : ctx.messages.changeWhich, [
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

  // A tab for a view whose family was not imported would do nothing: left out, and said once.
  const tabsOf = (asked: readonly string[] | undefined) =>
    (asked ?? ['dayGridMonth', 'timeGridWeek', 'timeGridDay']).filter((v) => {
      if (drawable(v)) return true;
      if (asked) console.warn(`dzcalendar: no renderer for the view ${v}${entryHint(kernel.getViewSpec(v)?.family ?? '')}`);
      return false;
    });
  let headerAsked = options.headerViews;
  const headerViews = tabsOf(headerAsked);
  const toolbar = createToolbar(doc, scope, kernel, headerViews, (dir) => kernel.navigate(dir), (v) => kernel.setView(v));
  root.append(toolbar.element);

  let view: ViewController | null = null;
  let interactions: Interactions | null = null;
  let viewScope: Scope | null = null;
  let mountedFamily: string | null = null;
  let firstPaint = true;
  /** While `update` applies several changes, the kernel's events wait for one paint. */
  let holding = false;
  let dirty = false;
  let pendingDir: 'prev' | 'next' | 'other' | undefined;
  /** The calendar has been drawn once: what comes next is a change. */
  let painted = false;
  /** What was last drawn: the "from" of the next change. */
  let shown = kernel.getState();
  /** A change seen before its redraw, with what the adapter kept of the old screen. */
  let pendingChange: { readonly change: MotionChange; readonly token: unknown } | null = null;

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
    interactions = view.surface ? attachInteractions(viewCtx, view.surface) : null;
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
    let v: ViewController;
    try {
      v = mount(vm.family);
    } catch (err) {
      // Nothing drawn: the change it was for is gone with it.
      pendingChange = null;
      throw err;
    }
    root.dataset['view'] = state.view.type;
    root.classList.toggle('dz-editable', settings.current.editable === true);
    const created = v.render(vm.model, state);
    interactions?.refresh();
    if (options.nowIndicator !== false) v.tick(kernel.now(), state);
    // The adapter animates the change itself, or the plain hooks do.
    const change = pendingChange;
    pendingChange = null;
    // A change animates from the second paint of the calendar on (a view of another family mounting is a change too).
    const handled = painted && change !== null && ctx.motion.afterChange?.(change.token, change.change, v.body) === true;
    if (!handled && !firstPaint && pendingDir) ctx.motion.viewChange?.(v.body, pendingDir);
    else if (!handled && !firstPaint && created.length > 0) ctx.motion.eventsEnter?.(created);
    if (painted && change && change.change.from.title !== state.title) ctx.motion.titleChange?.(toolbar.title, change.change.from.title, state.title, change.change);
    painted = true;
    pendingDir = undefined;
    shown = state;
    if (firstPaint) {
      firstPaint = false;
      if (vm.family === 'timeline' && v.scrollTo) {
        // A timeline scrolls along time: to that hour of today when shown, else of its first day.
        v.scrollTo(Temporal.Duration.from(options.scrollTime ?? 'PT8H').total({ unit: 'minutes' }));
      } else if (vm.family === 'timeGrid' && v.scrollTo) {
        const scroll = Temporal.Duration.from(options.scrollTime ?? 'PT8H').total({ unit: 'minutes' });
        const slotMin = (vm.model as { options: { slotMin?: DurationLike } }).options.slotMin;
        const min = slotMin ? Temporal.Duration.from(slotMin).total({ unit: 'minutes' }) : 0;
        v.scrollTo(Math.max(0, scroll - min));
      }
      if (vm.family === 'dayGrid' || vm.family === 'multiMonth') measureLanes();
      if (vm.family === 'timeGrid') measureStack();
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
    if (!autoLanes || ctx.printing) return;
    // A week or a day of the day grid grows to show everything: uncapped at once, from the state (not the mounted view).
    const view = kernel.getState().view;
    if (view.family === 'dayGrid' && view.alignment !== 'month') return kernel.setOptions({ dayGrid: { maxLanes: null } });
    scheduler.schedule({
      // Decided at read time, on the view then mounted: a view change paints after the event that asked.
      read: (): number | null | undefined => {
        const family = mountedFamily;
        if (family !== 'dayGrid' && family !== 'multiMonth') return undefined;
        // Only a month is squeezed into rows of fixed height; a week or a day of
        // the day grid grows to show everything. A multi-month row has its own fixed height.
        if (family === 'dayGrid' && kernel.getState().view.alignment !== 'month') return null;
        const week = root.querySelector<HTMLElement>('.dz-dg__week');
        if (!week) return undefined;
        // The row's own tracks: the day-number track, one per lane, a gap
        // between every two — what the grid really reserves, not the button.
        const style = getComputedStyle(week);
        const head = parseFloat(style.gridTemplateRows.split(' ')[0] ?? '') || 0;
        const gap = parseFloat(style.rowGap) || 0;
        const bar = probe.getBoundingClientRect().height;
        const weekH = week.getBoundingClientRect().height;
        return weekH > 0 && bar > 0 ? Math.max(1, Math.floor((weekH - head - gap) / (bar + gap))) : undefined;
      },
      write: (lanes) => {
        if (lanes !== undefined) kernel.setOptions({ dayGrid: { maxLanes: lanes } });
      },
    });
  }
  // ── 'auto' stacking in a time grid: as many lanes as fit at ~2.5rem each ──
  const stack = options.eventMaxStack === undefined ? 'auto' : options.eventMaxStack;
  if (typeof stack === 'number' && !(Number.isInteger(stack) && stack >= 1)) throw new RangeError(`eventMaxStack must be a whole number ≥ 1, 'auto' or null: ${stack}`);
  // Until measured, a guess from the host's width (the gutter aside), else four: a
  // crowded week must not draw ten thousand slivers first, nor draw twice when the guess is right.
  const guessStack = (): number => {
    const width = host.getBoundingClientRect().width;
    const em = win ? parseFloat(win.getComputedStyle(host).fontSize) || 16 : 16;
    const st = kernel.getState();
    // A resource view has a column per resource and date.
    const cols = Math.max(1, st.range.dates.length * (st.view.resources ? Math.max(1, kernel.getResources().order.length) : 1));
    return width > 0 ? Math.max(2, Math.floor((width - 4 * em) / cols / (2.5 * em))) : 4;
  };
  kernel.setOptions({ timeGrid: { maxStack: stack === 'auto' ? guessStack() : stack } });
  function measureStack(): void {
    if (stack !== 'auto' || ctx.printing) return;
    scheduler.schedule({
      read: (): number | undefined => {
        if (mountedFamily !== 'timeGrid') return undefined;
        const col = root.querySelector<HTMLElement>('.dz-tg__col:not(.dz-tg__col--folded)');
        const width = col?.getBoundingClientRect().width ?? 0;
        const em = parseFloat(getComputedStyle(root).fontSize) || 16;
        return width > 0 ? Math.max(2, Math.floor(width / (2.5 * em))) : undefined;
      },
      write: (n) => {
        if (n !== undefined) kernel.setOptions({ timeGrid: { maxStack: n } });
      },
    });
  }
  const RO = (win as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  if (RO) {
    const ro = new RO(() => (measureLanes(), measureStack(), view?.relayout?.()));
    ro.observe(root);
    scope.add(() => ro.disconnect());
  }

  // Loading is a state of the whole calendar (aria-busy); a refused save and a
  // failed fetch are said. The application hears them all through `onSource`.
  const sourceNotice = (n: SourceNotice) => {
    if (n.type === 'loading') {
      root.classList.toggle('dz-loading', n.loading);
      if (n.loading) root.setAttribute('aria-busy', 'true');
      else root.removeAttribute('aria-busy');
    } else if (n.type === 'save-error') {
      const e = n.edits.find((x) => x.kind === 'event' || x.kind === 'series');
      const ev = e && (e.kind === 'event' ? (e.after ?? e.before) : (e.after ?? e.before)?.base);
      ctx.announce(ctx.messages.saveFailed({ title: ev?.title ?? '', reverted: n.reverted }));
    } else if (n.type === 'error') ctx.announce(ctx.messages.loadFailed);
  };
  if (kernel.sources.loading) sourceNotice({ type: 'loading', loading: true });
  scope.add(
    kernel.subscribe((e) => {
      if (e.type === 'source') return sourceNotice(e.notice);
      // A menu or a "+N" panel describes the screen as it was: any change closes it.
      menu.close(false);
      popover.close(false);
      if (e.type === 'state') {
        if (e.direction) pendingDir = e.direction;
        // The old screen is still drawn: the adapter looks at it now. Several changes before one paint are one change:
        // the first one's "from" (and what the adapter kept of it), every cause, the last "to".
        if (pendingChange) {
          const prev = pendingChange.change;
          const to = { view: e.state.view.type, family: e.state.view.family, date: e.state.date, zone: e.state.timeZone, title: e.state.title, days: e.state.range.dates.length };
          const direction = e.direction ?? prev.direction;
          pendingChange = {
            token: pendingChange.token,
            change: { ...prev, causes: [...new Set([...prev.causes, ...e.causes])], to, days: prev.from.date.until(e.state.date, { largestUnit: 'days' }).days, rtl: directionOf(e.state.locale) === 'rtl', ...(direction && { direction }) },
          };
        } else if (view) {
          const was = shown;
          const side = (s: typeof was) => ({ view: s.view.type, family: s.view.family, date: s.date, zone: s.timeZone, title: s.title, days: s.range.dates.length });
          const change: MotionChange = {
            causes: e.causes,
            ...(e.direction && { direction: e.direction }),
            from: side(was),
            to: side(e.state),
            days: was.date.until(e.state.date, { largestUnit: 'days' }).days,
            root,
            // The new locale's direction (root.dir follows it just below).
            rtl: directionOf(e.state.locale) === 'rtl',
          };
          pendingChange = { change, token: ctx.motion.beforeChange?.(change) };
        }
        // Another zone or locale changes what every label says, at the same keys and places.
        if (e.causes.includes('zone') || e.causes.includes('locale')) {
          ctx.zone = e.state.timeZone;
          ctx.locale = e.state.locale;
          ctx.epoch++;
        }
        if (e.causes.includes('locale')) {
          root.dir = directionOf(e.state.locale);
          // Changed by someone else (another calendar on the kernel, the kernel itself): that is the base now.
          if (e.state.locale !== withCalendar(baseLocale, displayCalendar)) baseLocale = withoutCalendar(e.state.locale);
        }
      }
      paint();
      // Another number of columns (a period, a view, resources): lanes and stacks measured again.
      if (e.type === 'state' && (e.causes.includes('view') || e.causes.includes('navigate') || e.causes.includes('resources'))) (measureLanes(), measureStack());
    }),
  );

  // Once a minute, aligned on the minute; paused while the tab is hidden. It
  // always runs — past midnight the kernel moves "today" (a state event, so a
  // paint) — and the now line is just what it also redraws when wanted.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const untilNextMinute = () => 60000 - (kernel.now().epochMilliseconds % 60000);
  const tick = () => {
    if (root.isConnected && !kernel.refreshToday() && options.nowIndicator !== false) {
      view?.tick(kernel.now(), kernel.getState());
      ctx.motion.nowTick?.([...root.querySelectorAll<HTMLElement>('.dz-now')]);
    }
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

  /** Everything mounted, synchronously; the returned function restores the windowing. */
  function preparePrint(): () => void {
    // One at a time: a second call while printing restores nothing (the first one's function does).
    if (ctx.printing || scope.isDisposed) return () => {};
    // Paper shows everything (the owner's choice): no "+N" in the month nor in a crowded week.
    const caps = { maxLanes: kernel.getOptions().dayGrid?.maxLanes ?? null, maxStack: kernel.getOptions().timeGrid?.maxStack ?? null };
    ctx.printing = true;
    ctx.epoch++;
    holding = true;
    try {
      kernel.batch(() => kernel.setOptions({ dayGrid: { maxLanes: null }, timeGrid: { maxStack: null } }));
    } finally {
      holding = false;
    }
    paint();
    let done = false;
    return () => {
      if (done || scope.isDisposed) return;
      done = true;
      ctx.printing = false;
      ctx.epoch++;
      holding = true;
      try {
        kernel.batch(() => kernel.setOptions({ dayGrid: { maxLanes: caps.maxLanes }, timeGrid: { maxStack: caps.maxStack } }));
      } finally {
        holding = false;
      }
      paint();
    };
  }
  if (options.autoPrint && win) {
    let restore: (() => void) | null = null;
    scope.on(win, 'beforeprint', () => (restore = preparePrint()));
    scope.on(win, 'afterprint', () => {
      restore?.();
      restore = null;
    });
  }

  host.append(root);
  /** The options given, every update laid over (`getOptions`). */
  let given: CalendarOptions = options;
  /** What closes with the calendar (an editor's dialog). */
  const destroyHooks = new Set<() => void>();
  paint();
  // What the initial resources could not be read as: said once, after the first paint.
  const firstProblems = kernel.getResourceProblems();
  if (options.resources && firstProblems.length > 0) settings.current.onResourceProblems?.(firstProblems);

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
        if (!drawable(viewType)) throw new RangeError(`no renderer for the view ${viewType}${entryHint(kernel.getViewSpec(viewType)!.family)}`);
      }
      if (changes.timeZone && changes.timeZone !== state.timeZone && !isZone(changes.timeZone)) throw new RangeError(`not a time zone: ${changes.timeZone}`);
      if ('businessHours' in changes && changes.businessHours !== undefined) assertBusinessHours(changes.businessHours);
      if (changes.timeline) assertTimeline(changes.timeline);
      if (changes.multiMonthMaxColumns !== undefined && !(Number.isInteger(changes.multiMonthMaxColumns) && changes.multiMonthMaxColumns >= 1)) {
        throw new RangeError(`multiMonthMaxColumns must be a whole number ≥ 1: ${changes.multiMonthMaxColumns}`);
      }
      checkLook(changes);
      // Locale and calendars together, checked before anything changes (a bad one must not stick).
      const touchesLocale = Boolean(changes.locale) || 'displayCalendar' in changes || 'secondaryCalendar' in changes;
      const nextBase = changes.locale || baseLocale;
      const nextDisplay = 'displayCalendar' in changes ? (changes.displayCalendar ?? null) : displayCalendar;
      const nextSecondary = 'secondaryCalendar' in changes ? (changes.secondaryCalendar ?? null) : secondaryCalendar;
      const nextEffective = touchesLocale ? withCalendar(nextBase, nextDisplay) : null;
      if (touchesLocale && nextSecondary) withCalendar(nextBase, nextSecondary);
      if (changes.hiddenDays?.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw new RangeError(`hiddenDays are ISO weekdays, 1 (Monday) to 7 (Sunday): ${changes.hiddenDays.join(', ')}`);
      if (('hiddenDays' in changes || 'weekends' in changes) && hiddenOf('hiddenDays' in changes ? changes.hiddenDays : hidden.days, 'weekends' in changes ? changes.weekends : hidden.weekends).length >= 7) {
        throw new RangeError('every day of the week is hidden');
      }
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
            // What the old adapter kept of the screen is not the new one's.
            pendingChange = null;
          }
          // Compared member by member: a wrapper that rebuilds the same object
          // on every change must not redraw every event.
          if (changes.hooks && !sameHooks(changes.hooks, ctx.hooks)) {
            ctx.hooks = changes.hooks;
            ctx.epoch++;
            dirty = true;
          }
          // Only when asked: a locale changed elsewhere (a shared kernel) is not put back by an unrelated update.
          const newLocale = nextEffective !== null && nextEffective !== state.locale ? nextEffective : null;
          if (touchesLocale) {
            baseLocale = nextBase;
            displayCalendar = nextDisplay;
            secondaryCalendar = nextSecondary;
            const alt = altLocaleOf(baseLocale, displayCalendar, secondaryCalendar);
            if (alt !== ctx.altLocale) {
              ctx.altLocale = alt;
              ctx.epoch++;
              dirty = true;
            }
          }
          if ((changes.theme && changes.theme !== look.theme) || (changes.scheme && changes.scheme !== look.scheme) || (changes.density && changes.density !== look.density)) {
            look.theme = changes.theme ?? look.theme;
            look.scheme = changes.scheme ?? look.scheme;
            look.density = changes.density ?? look.density;
            applyLook();
            // Another density: another scale, lanes and stacks measured again.
            measureLanes();
            measureStack();
          }
          const newMessages = changes.messages && !shallowSame(changes.messages, givenMessages ?? ctx.messages) ? changes.messages : null;
          if (newMessages) {
            messagesGiven = true;
            givenMessages = newMessages;
          }
          if (newLocale) kernel.setLocale(newLocale);
          if (newMessages || newLocale) {
            // The application's words over the (new) locale's: switching language keeps the overrides, not the old language.
            ctx.messages = withDefaults(newMessages ?? (messagesGiven ? givenMessages : undefined), newLocale ?? state.locale);
            ctx.locale = newLocale ?? ctx.locale;
            ctx.epoch++;
            dirty = true;
          }
          if (changes.timeZone && changes.timeZone !== state.timeZone) kernel.setTimeZone(changes.timeZone);
          if ('businessHours' in changes && changes.businessHours !== undefined) kernel.setOptions({ businessHours: changes.businessHours });
          if ('availableSlots' in changes) kernel.setOptions({ availableSlots: changes.availableSlots ?? null });
          if (changes.timeGrid) kernel.setOptions({ timeGrid: changes.timeGrid });
          if (changes.resources && changes.resources !== resourcesGiven) {
            resourcesGiven = changes.resources;
            const problems = kernel.setResources(changes.resources);
            if (problems.length > 0) settings.current.onResourceProblems?.(problems);
          }
          if ('resourceOrder' in changes || 'resourceGroupField' in changes || 'showUnassigned' in changes) {
            kernel.setOptions({
              ...('resourceOrder' in changes && { resourceOrder: changes.resourceOrder }),
              ...('resourceGroupField' in changes && { resourceGroupField: changes.resourceGroupField }),
              ...(changes.showUnassigned !== undefined && { showUnassigned: changes.showUnassigned }),
            });
          }
          if (changes.timeline) kernel.setOptions({ timeline: changes.timeline });
          if (changes.collapsedResources || changes.collapsedGroups) {
            kernel.setOptions({ ...(changes.collapsedResources && { collapsedResources: changes.collapsedResources }), ...(changes.collapsedGroups && { collapsedGroups: changes.collapsedGroups }) });
          }
          if ('hiddenDays' in changes || 'weekends' in changes) {
            hidden = { days: 'hiddenDays' in changes ? changes.hiddenDays : hidden.days, weekends: 'weekends' in changes ? changes.weekends : hidden.weekends };
            kernel.setOptions({ hiddenDays: hiddenOf(hidden.days, hidden.weekends) });
          }
          if (changes.weekNumbers !== undefined && changes.weekNumbers !== ctx.weekNumbers) {
            ctx.weekNumbers = changes.weekNumbers;
            ctx.epoch++;
            dirty = true;
          }
          if (changes.multiMonthMaxColumns !== undefined) columns(changes.multiMonthMaxColumns);
          if (changes.viewOptions && !shallowSame(changes.viewOptions, ctx.viewOptions)) {
            ctx.viewOptions = changes.viewOptions;
            ctx.epoch++;
            dirty = true;
          }
          if (changes.headerViews && changes.headerViews.join() !== (headerAsked ?? []).join()) {
            headerAsked = changes.headerViews;
            toolbar.setViews(tabsOf(headerAsked));
            dirty = true;
          }
          if (changes.events) kernel.setEvents(changes.events);
          if (changes.sources) {
            const keep = new Set(changes.sources.map((x) => x.id));
            for (const id of kernel.sources.ids()) if (!keep.has(id)) kernel.sources.remove(id);
            for (const spec of changes.sources) kernel.sources.add(spec);
          }
          if (viewChanges) kernel.setView(viewType, changes.date);
        });
      } finally {
        holding = false;
      }
      // An option set to undefined goes back to its default: dropped, not kept as undefined.
      const next: Record<string, unknown> = { ...given };
      for (const [k, v] of Object.entries(changes)) if (v === undefined) delete next[k];
      else next[k] = v;
      given = next as CalendarOptions;
      if (dirty) {
        dirty = false;
        paint();
      }
    },
    getOptions() {
      const st = kernel.getState();
      const { view: _v, date: _d, ...rest } = given as CalendarOptions & CalendarUpdate;
      return { ...rest, initialView: st.view.type, initialDate: st.date, timeZone: st.timeZone };
    },
    navigate: (dir) => kernel.navigate(dir),
    run: (cmd, opts) => kernel.run(cmd, opts),
    undo: () => kernel.history.undo(),
    redo: () => kernel.history.redo(),
    refetch: (id) => kernel.sources.refetch(id),
    preparePrint,
    select: (sel) => interactions?.select(sel),
    onDestroy(fn) {
      destroyHooks.add(fn);
      return () => destroyHooks.delete(fn);
    },
    destroy() {
      for (const fn of [...destroyHooks]) {
        try {
          fn();
        } catch (err) {
          void Promise.reject(err);
        }
      }
      destroyHooks.clear();
      scope.dispose();
      viewScope?.dispose();
      ctx.motion.destroy?.();
      view?.destroy();
      if (owned) kernel.destroy();
      root.remove();
    },
  };
}
