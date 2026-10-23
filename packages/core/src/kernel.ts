import { normalizeMany } from './event/normalize.js';
import type { NormalizationReport, Normalized } from './event/normalize.js';
import type { EventInput } from './event/types.js';
import { formatRangeTitle, formatTemporal } from './format/intl.js';
import { weekRulesFor } from './format/week.js';
import { createIdGenerator } from './ids.js';
import { assertBusinessHours } from './rules/business-hours.js';
import type { BusinessHoursInput } from './rules/business-hours.js';
import { arraySource, loadStaticSource } from './source/array-source.js';
import { createSourceManager, globalTimers } from './source/manager.js';
import type { SourceManager, SourceNotice, Timers } from './source/manager.js';
import type { EventSourceSpec } from './source/source.js';
import type { StoreChange } from './store/changes.js';
import { createHistory } from './commands/history.js';
import type { History } from './commands/history.js';
import type { Command, CommandContext, CommandResult } from './commands/types.js';
import type { RulesContext } from './rules/validate.js';
import { createEventStore } from './store/store.js';
import type { EventStore, StoreSnapshot } from './store/store.js';
import { Temporal } from './temporal.js';
import type { Instant, PlainDate, Weekday, ZoneId } from './temporal.js';
import { BUILTIN_VIEWS, registeredViewSpecs } from './views/builtin.js';
import { buildDayGridModel, updateDayGridModel } from './views/daygrid.js';
import type { DayGridModel, DayGridOptions } from './views/daygrid.js';
import { navigate } from './views/nav.js';
import type { NavDirection } from './views/nav.js';
import { assertViewSpec, computeViewRange } from './views/range.js';
import { DEFER_ABOVE, idleTimers, loadDeferred, loadPeriod, pendingOn, rawOf, storeFace, writerFace } from './source/deferred.js';
import type { DeferredEvents } from './source/deferred.js';
import type { NavContext, ViewRange, ViewSettings, ViewSpec } from './views/spec.js';
import { buildTimeGridModel, updateTimeGridModel } from './views/timegrid.js';
import type { AvailableSlot, TimeGridModel, TimeGridOptions } from './views/timegrid.js';
import { isValidZone } from './zone.js';
import type { Problem } from './event/problems.js';
import { buildResourceTree } from './resource/tree.js';
import { columnResources } from './resource/rows.js';
import type { ColumnResources } from './resource/rows.js';
import type { ResourceInput, ResourceOrder, ResourceTree } from './resource/types.js';
import { UNASSIGNED_RESOURCE } from './resource/owners.js';

/** Options that shape the models; changeable at any time with `setOptions`. */
export interface ModelOptions {
  readonly timeGrid?: Omit<TimeGridOptions, 'displayZone' | 'businessHours' | 'availableSlots' | 'resources' | 'resourceGroups'>;
  readonly dayGrid?: Omit<DayGridOptions, 'displayZone' | 'businessHours' | 'showNonCurrentDates' | 'resources' | 'resourceGroups'>;
  /** A timeline's scale and rows (the Pro's family reads them). */
  readonly timeline?: {
    /**
     * Minutes per slot (dividing a day) or 'day'. Default: 30 for a day, 60 up to a week, days beyond.
     * @default {slotPerSpan}
     */
    readonly slot?: number | 'day';
    /**
     * Lanes a resource row shows before "+N". Default 3.
     * @default 3
     */
    readonly maxLanes?: number;
    /**
     * Lanes of a timeline without resources (its one row fills the view: the DOM measures it). Default 12.
     * @default 12
     */
    readonly fillLanes?: number;
  };
  /** How sibling resources are ordered after their `order`: field names (`'-title'` descending) or a comparison. */
  readonly resourceOrder?: ResourceOrder | undefined;
  /** Resource views group their columns (a timeline its rows) by this field: a head over each run. */
  readonly resourceGroupField?: string | undefined;
  /**
   * Resource views add an "Unassigned" column (a timeline a row) first, for events on no known resource. Default false.
   * @default false
   */
  readonly showUnassigned?: boolean;
  /**
   * A timeline's rows: the resources (by id) whose children are hidden. Default: everything open.
   * @default []
   */
  readonly collapsedResources?: readonly string[];
  /**
   * A timeline's rows: the groups (by their `resourceGroupField` value) shut. Default: everything open.
   * @default []
   */
  readonly collapsedGroups?: readonly string[];
  /**
   * The hours a place is open: shaded outside in the time grid and checked by `rules`. One rule (`{ daysOfWeek, start, end, timeZone? }`), several, `true` for Monday to Friday 09:00–17:00, or `false` for none.
   */
  readonly businessHours?: BusinessHoursInput;
  /**
   * Bookable slots drawn in the time grid (compared by identity: a new array redraws).
   * @default null
   */
  readonly availableSlots?: readonly AvailableSlot[] | null;
  /**
   * Weekdays no view shows (ISO: 6 and 7 for the weekend), unless a view names its own.
   * @default []
   */
  readonly hiddenDays?: readonly Weekday[];
}

/** What a title written by the application is given: the first and last days shown. */
export interface TitleFormatArg {
  readonly start: PlainDate;
  /** The last day shown. */
  readonly end: PlainDate;
  /** The view's type. */
  readonly view: string;
  readonly locale: string;
}
/** How the title is written: the platform's date-format options (a range when the first and last days differ), or a function. */
export type TitleFormat = Intl.DateTimeFormatOptions | ((arg: TitleFormatArg) => string);

export interface KernelOptions extends ModelOptions {
  /** @default {browserZone} */
  readonly timeZone: ZoneId;
  /** @default {pageLanguage} */
  readonly locale: string;
  /**
   * Default: the locale's.
   * @default {localeWeek}
   */
  readonly firstDay?: Weekday;
  /**
   * How the title is written; default: the month, a week's days, a day in full.
   * @default {titlePerView}
   */
  readonly titleFormat?: TitleFormat;
  /**
   * Default: today in `timeZone`.
   * @default {today}
   */
  readonly initialDate?: PlainDate;
  /** @default {firstView} */
  readonly initialView?: string;
  /** Added to (and overriding) the built-in views: a whole spec, or settings (`{ family: 'timeGrid', visibleRange }`) the rest filled in, the type its key. */
  readonly views?: Readonly<Record<string, ViewSpec | ViewSettings>>;
  /** A store to share: four kernels on one store show the same events in four zones. */
  readonly store?: EventStore;
  /** Loaded as an array source named "events"; replaced with `setEvents`. */
  readonly events?: readonly EventInput[];
  /**
   * Injectable for tests. Default: the system clock.
   * @internal
   */
  readonly now?: () => Instant;
  /** What edits are checked against (business hours come from `businessHours`). */
  readonly rules?: Omit<RulesContext, 'displayZone' | 'businessHours'>;
  /**
   * Undo entries kept. Default 200.
   * @default 200
   */
  readonly historyLimit?: number;
  /** Fetched as the calendar moves (`kernel.sources` adds, removes, refetches). */
  readonly sources?: readonly EventSourceSpec[];
  /** Loading, fetch errors, problems in a delivery, saves refused. */
  readonly onSource?: (n: SourceNotice) => void;
  /**
   * For retries; injectable for tests. Default: the global timers.
   * @internal
   */
  readonly timers?: Timers;
  /** What resource views show as columns (`setResources` replaces them). */
  readonly resources?: readonly ResourceInput[];
}

export interface KernelState {
  readonly date: PlainDate;
  readonly view: ViewSpec;
  readonly range: ViewRange;
  readonly timeZone: ZoneId;
  readonly locale: string;
  readonly firstDay: Weekday;
  readonly title: string;
  readonly today: PlainDate;
}

/** What a family's model is built from, and how it follows the store. */
export interface ModelFamily<M = unknown> {
  build(
    range: ViewRange,
    snap: StoreSnapshot,
    ctx: {
      readonly displayZone: ZoneId;
      readonly view: ViewSpec;
      readonly options: ModelOptions;
      /** The calendar's resources, in order; `columns` is what a resource view shows (groups included). */
      readonly resources: ResourceTree;
      readonly columns: ColumnResources;
    },
  ): M;
  /** Optional fine update after a store change; absent means rebuild. */
  update?(prev: M, snap: StoreSnapshot, change: StoreChange): M;
  /**
   * True: the model reads only the events of its range (every built-in). A
   * store change that touches nothing in the range (a large load's later
   * weeks, a neighbouring chunk) then keeps the model and redraws nothing; a
   * family that reads beyond its range (an "upcoming" list) leaves it out and
   * is rebuilt after every change.
   */
  readonly rangeOnly?: boolean;
}

const FAMILIES = new Map<string, ModelFamily>();

/** Built-ins register here; so do the Pro's timeline and custom families. */
export function registerModelFamily<M>(family: string, f: ModelFamily<M>): void {
  FAMILIES.set(family, f as ModelFamily);
}

/** A resource view's columns, for the families that draw them ("Unassigned" first when asked: the groups move one along). */
function resourceOpts(view: ViewSpec, columns: ColumnResources, options: ModelOptions) {
  if (!view.resources) return {};
  if (!options.showUnassigned) return { resources: columns.resources, resourceGroups: columns.groups };
  return { resources: [UNASSIGNED_RESOURCE, ...columns.resources], resourceGroups: columns.groups.map((g) => ({ ...g, from: g.from + 1 })) };
}

registerModelFamily<TimeGridModel>('timeGrid', {
  build: (range, snap, { displayZone, view, options, columns }) =>
    buildTimeGridModel(range, snap, {
      ...options.timeGrid,
      displayZone,
      ...(options.businessHours !== undefined && { businessHours: options.businessHours }),
      ...(options.availableSlots && { availableSlots: options.availableSlots }),
      ...resourceOpts(view, columns, options),
    }),
  update: updateTimeGridModel,
  rangeOnly: true,
});
registerModelFamily<DayGridModel>('dayGrid', {
  build: (range, snap, { displayZone, view, options, columns }) =>
    buildDayGridModel(range, snap, {
      ...options.dayGrid,
      displayZone,
      showNonCurrentDates: view.showNonCurrentDates,
      ...(options.businessHours !== undefined && { businessHours: options.businessHours }),
      ...resourceOpts(view, columns, options),
    }),
  update: updateDayGridModel,
  rangeOnly: true,
});

/** The model of the current view; `family` tells a renderer what `model` is. */
export interface ViewModel<M = unknown> {
  readonly family: string;
  readonly model: M;
}

export type StateCause = 'navigate' | 'view' | 'zone' | 'locale' | 'options' | 'today' | 'resources';

export type KernelEvent =
  | {
      readonly type: 'state';
      readonly state: KernelState;
      /** Every cause since the last event: a batch of three changes is one event with three causes. */
      readonly causes: readonly StateCause[];
      /** Which way the dates moved, when they moved. */
      readonly direction?: 'prev' | 'next' | 'other';
    }
  | {
      readonly type: 'store';
      readonly change: StoreChange;
      /** Nothing it touched is in the period shown (nor any series): the view's model is the same, nothing to redraw. */
      readonly offscreen?: true;
      /** The command that made it (`run`): with `validated`, what a person asked — a gesture, a menu, the keyboard, the editor. */
      readonly command?: Command;
      readonly validated?: boolean;
    }
  /** From the sources: loading, a failed fetch, problems in a delivery, a save. */
  | { readonly type: 'source'; readonly notice: SourceNotice };

export interface CalendarKernel {
  readonly store: EventStore;
  getState(): KernelState;
  setView(type: string, date?: PlainDate): void;
  /** The spec registered under `type`, so a renderer can refuse a family before anything changes. */
  getViewSpec(type: string): ViewSpec | undefined;
  navigate(dir: NavDirection): void;
  setTimeZone(zone: ZoneId): void;
  /** Titles, and the first weekday unless one was given, follow the new locale. */
  setLocale(locale: string): void;
  /**
   * Shallow-merged per key (`timeGrid`, `dayGrid`) over the current options. `silent`: the model is made again
   * but no state event is told — for a renderer adjusting options while it handles a state event it is about to draw.
   */
  setOptions(options: ModelOptions, how?: { readonly silent?: boolean }): void;
  /** The week's first day (ISO, Monday = 1); null: the locale's again. A view whose range moves redraws. */
  setFirstDay(day: Weekday | null): void;
  /** How the title is written from now on (null: the default again). */
  setTitleFormat(format: TitleFormat | null): void;
  /** The rules gestures and checked commands are held to (constraint, overlap, allow, valid range…), replacing those given. */
  setRules(rules: KernelOptions['rules']): void;
  /** The options in force (what `setOptions` merged). */
  getOptions(): ModelOptions;
  /**
   * Replaces the "events" source. Unchanged events keep their objects and
   * revisions (the store diffs), so a framework passing a new array with the
   * same content redraws nothing.
   */
  setEvents(events: readonly EventInput[]): NormalizationReport;
  /** Several changes, one `state` event at the end. */
  batch(fn: () => void): void;
  /** Re-reads today from the clock (call it from a timer). True when it changed. */
  refreshToday(): boolean;
  /** Memoized; after a store change only what changed is rebuilt (where the family can). */
  viewModel(): ViewModel;
  /**
   * Another view or date, as it would be shown — its state (range, title) and
   * its model — without changing what is shown (printing, exports). Null for
   * an unknown view. Not memoized; its events are whatever the store holds
   * (`sources.hold` the range first).
   */
  stateAt(type: string, date: PlainDate): KernelState | null;
  /** `over`: the families' own options laid over those in force, key by key (a print lifts the "+N" caps). */
  modelAt(type: string, date: PlainDate, over?: Pick<ModelOptions, 'timeGrid' | 'dayGrid' | 'timeline'>): ViewModel | null;
  now(): Instant;
  /** What the last `events`/`setEvents` load reported. */
  getProblems(): NormalizationReport | null;
  /**
   * Resolves when every event of the `events` option is loaded: at once for
   * up to 2 000 events, else when the weeks beyond the shown period are in
   * (they load while the page is idle; any read of `store` finishes them first).
   */
  whenLoaded(): Promise<void>;
  /**
   * Replaces the resources (a `state` event, cause 'resources'): resource
   * views redraw their columns, rules read the new ones. Returns what could
   * not be read — never throws.
   */
  setResources(resources: readonly ResourceInput[]): readonly Problem[];
  /** The resources in force, as a tree in order. */
  getResources(): ResourceTree;
  /** What the last `resources`/`setResources` reported. */
  getResourceProblems(): readonly Problem[];
  /**
   * Runs a command through the history: undoable; series created here take
   * the locale's first day as WKST. `validate` checks it against the rules
   * (constraint, overlap, allow, editable) — what a person's gesture asks for;
   * the application's own calls and server pushes are not refused by them.
   */
  /** `validate`: checked as a gesture is; `external`: it comes from outside this calendar (told to the rules' `allow`). */
  run(cmd: Command, opts?: { readonly validate?: boolean; readonly external?: boolean }): CommandResult;
  /** What gestures are checked against now: the zone, business hours, the rules given. */
  rules(): RulesContext;
  readonly history: History;
  /** The sources: fetched for what the view shows, kept in step with the store. */
  readonly sources: SourceManager;
  subscribe(fn: (e: KernelEvent) => void): () => void;
  destroy(): void;
}

const systemNow = (): Instant => Temporal.Now.instant();

/** A timeline's scale and lanes that cannot be taken are a configuration error, said before anything changes. */
export function assertTimeline(t: NonNullable<ModelOptions['timeline']>): void {
  const s = t.slot;
  if (s !== undefined && s !== 'day' && !(Number.isInteger(s) && s >= 1 && 1440 % s === 0)) throw new RangeError(`timeline.slot must be whole minutes dividing a day (5, 15, 30, 60…) or 'day': ${String(s)}`);
  for (const k of ['maxLanes', 'fillLanes'] as const) {
    const v = t[k];
    if (v !== undefined && !(Number.isInteger(v) && v >= 1)) throw new RangeError(`timeline.${k} must be a whole number ≥ 1: ${String(v)}`);
  }
}

/** A time grid's ticks and labels that cannot be taken: said before anything changes, never thrown while drawing. */
export function assertTimeGrid(t: NonNullable<ModelOptions['timeGrid']>): void {
  for (const k of ['slotMinutes', 'labelMinutes'] as const) {
    const v = t[k];
    if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= 1440)) throw new RangeError(`timeGrid.${k} must be whole minutes from 1 to 1440: ${String(v)}`);
  }
}

/** Two id lists are the same set. */
const sameIds = (a: readonly string[] | undefined, b: readonly string[] | undefined) => [...(a ?? [])].sort().join('\u0000') === [...(b ?? [])].sort().join('\u0000');

/** Two orders are the same when they are the same function, or the same fields. */
const sameOrder = (a: ResourceOrder | undefined, b: ResourceOrder | undefined) =>
  a === b || (typeof a !== 'function' && typeof b !== 'function' && a !== undefined && b !== undefined && [a].flat().join() === [b].flat().join());

/**
 * The calendar without a screen: date, view, zone, locale, options,
 * navigation, title, and the view model kept in step with the store. Shared
 * by the DOM, Angular and the native ports. It has no timer of its own.
 */
export function createKernel(o: KernelOptions): CalendarKernel {
  if (!isValidZone(o.timeZone)) throw new RangeError(`timeZone is not a time zone: ${o.timeZone}`);
  if (o.businessHours !== undefined) assertBusinessHours(o.businessHours);
  if (o.timeline) assertTimeline(o.timeline);
  if (o.timeGrid) assertTimeGrid(o.timeGrid);
  const views: Record<string, ViewSpec> = { ...BUILTIN_VIEWS, ...registeredViewSpecs() };
  for (const [type, v] of Object.entries(o.views ?? {})) {
    // A member a framework left `undefined` does not erase a default.
    const given = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as ViewSettings;
    // Aligned on what its duration counts (months on the 1st, weeks on the week's first day), else on the date.
    let alignment: ViewSpec['alignment'] = 'none';
    try {
      const d = Temporal.Duration.from((given.duration ?? { days: 1 }) as never);
      alignment = d.years ? 'year' : d.months ? 'month' : d.weeks ? 'week' : 'none';
    } catch {
      /* said by assertViewSpec below */
    }
    const spec: ViewSpec = { type, duration: { days: 1 }, alignment, fixedWeekCount: true, hiddenDays: [], showNonCurrentDates: true, ...given };
    assertViewSpec(spec);
    views[type] = spec;
  }
  const now = o.now ?? systemNow;
  // A face handed back (`store: cal.kernel.store`) is the store it shows.
  const store = rawOf(o.store ?? createEventStore());
  const listeners = new Set<(e: KernelEvent) => void>();

  let timeZone = o.timeZone;
  let locale = o.locale;
  /** The first day given (null: the locale's), and the rules: both changeable later (setFirstDay, setRules). */
  let firstDayGiven: Weekday | null = o.firstDay ?? null;
  let titleFormat: TitleFormat | null = o.titleFormat ?? null;
  let rulesGiven = o.rules;
  let firstDay = firstDayGiven ?? weekRulesFor(locale).firstDay;
  let options: ModelOptions = {
    ...(o.timeGrid && { timeGrid: o.timeGrid }),
    ...(o.dayGrid && { dayGrid: o.dayGrid }),
    ...(o.timeline && { timeline: o.timeline }),
    ...(o.businessHours !== undefined && { businessHours: o.businessHours }),
    ...(o.hiddenDays && { hiddenDays: o.hiddenDays }),
    ...(o.availableSlots && { availableSlots: o.availableSlots }),
    ...(o.resourceOrder !== undefined && { resourceOrder: o.resourceOrder }),
    ...(o.resourceGroupField !== undefined && { resourceGroupField: o.resourceGroupField }),
    ...(o.showUnassigned !== undefined && { showUnassigned: o.showUnassigned }),
    ...(o.collapsedResources && { collapsedResources: o.collapsedResources }),
    ...(o.collapsedGroups && { collapsedGroups: o.collapsedGroups }),
  };
  const todayIn = (zone: ZoneId) => now().toZonedDateTimeISO(zone).toPlainDate();
  let date = o.initialDate ?? todayIn(timeZone);
  /** A view by its type: own entries only (`toString` is not a view). */
  const ownView = (type: unknown): ViewSpec | undefined => (typeof type === 'string' && Object.hasOwn(views, type) ? views[type] : undefined);
  const viewOf = (type: string) => {
    const spec = ownView(type);
    if (!spec) throw new RangeError(`unknown view: ${type}`);
    return spec;
  };
  let raw = viewOf(o.initialView ?? 'timeGridWeek');
  // The spec in force: the calendar's hidden days laid on a view that names none. Cached, so its identity holds.
  const effective = new WeakMap<ViewSpec, { key: string; spec: ViewSpec }>();
  const effectiveOf = (spec: ViewSpec): ViewSpec => {
    const hidden = spec.hiddenDays.length > 0 ? null : (options.hiddenDays ?? null);
    if (!hidden || hidden.length === 0) return spec;
    const key = [...hidden].sort().join(',');
    const hit = effective.get(spec);
    if (hit?.key === key) return hit.spec;
    const made = { ...spec, hiddenDays: [...hidden].sort() as Weekday[] };
    effective.set(spec, { key, spec: made });
    return made;
  };
  let view = effectiveOf(raw);

  let resourceInputs: readonly ResourceInput[] = o.resources ?? [];
  let resourceTree: ResourceTree;
  let resourceProblems: readonly Problem[];
  let columns: ColumnResources;
  const buildResources = () => {
    const built = buildResourceTree(resourceInputs, options.resourceOrder !== undefined ? { orderBy: options.resourceOrder } : {});
    resourceTree = built.tree;
    resourceProblems = built.problems;
    columns = columnResources(resourceTree, options.resourceGroupField);
  };
  buildResources();

  let problems: NormalizationReport | null = null;
  const idGen = createIdGenerator('ev');
  /** A large `events` option still loading (owner, 18h), and the chunks the last load wrote. */
  let deferred: DeferredEvents | null = null;
  let eventChunks: ReadonlyMap<string, string> = new Map();
  /** Who waits for everything to be loaded (`whenLoaded`). */
  let waiting: (() => void)[] = [];
  const settle = () => {
    if (deferred && !deferred.done) return;
    const w = waiting;
    waiting = [];
    for (const f of w) f();
  };
  /** Whatever is still to load, now: a read or a change that needs every event calls it first. */
  const finishEvents = () => {
    if (deferred && !deferred.done) deferred.flush();
  };
  const unpend = pendingOn(store, { finish: finishEvents, load: (from, to) => deferred?.load(from, to) });
  /** A range's days as plain ISO (another calendar's dates, written in ISO: what the load's weeks are keyed by). */
  const isoDay = (d: PlainDate) => d.withCalendar('iso8601').toString().slice(0, 10);
  /** What a period shows, loaded from every load on this store (this calendar's, a sharing one's). */
  const ensureShown = (range: ViewRange) => loadPeriod(store, isoDay(range.start), isoDay(range.end));
  const loadEvents = (events: readonly EventInput[]): NormalizationReport => {
    deferred?.cancel();
    deferred = null;
    // Who waited for the cancelled load waits for this one (told at its end, or now when it is small).
    const ctx = { displayZone: timeZone, newId: idGen };
    // Large: the shown period now, the rest while the page is idle (its problems told when done).
    if (events.length > DEFER_ABOVE) {
      const d = loadDeferred(store, 'events', events, ctx, { from: isoDay(state.range.start), to: isoDay(state.range.end) }, o.timers ?? idleTimers(globalTimers), eventChunks, (report) => {
        problems = report;
        // After the store has it all (`done` is true by now): who waits is told on the next turn.
        void Promise.resolve().then(settle);
        if (report.problems.length === 0) return;
        const notice = { type: 'problems', sourceId: 'events', report } as const;
        o.onSource?.(notice);
        emit({ type: 'source', notice });
      });
      deferred = d;
      eventChunks = d.chunks;
      return (problems = d.report);
    }
    const stale = [...eventChunks.keys()];
    if (stale.length === 0) problems = loadStaticSource(store, arraySource('events', events), ctx).report;
    else {
      // A large load before: its months emptied in the same change.
      const { items, report } = normalizeMany(events, ctx, 'events');
      store.replaceSourceChunks('events', [['*', items], ...stale.map((k) => [k, []] as [string, readonly Normalized[]])]);
      problems = report;
    }
    eventChunks = new Map();
    settle();
    return problems;
  };

  const nav = (): NavContext => ({ firstDay, today: todayIn(timeZone) });
  let validating = false;
  let externalRun = false;
  /** The command `run` is applying: what its store change came from. */
  let running: Command | null = null;
  const rulesNow = (): RulesContext => ({
    displayZone: timeZone,
    ...(options.businessHours !== undefined && { businessHours: options.businessHours }),
    ...(resourceTree.order.length > 0 && { resources: resourceTree }),
    ...rulesGiven,
  });
  // Read at every command: the zone, the locale's first day and the rules may have changed since.
  const history = createHistory(
    store,
    (): CommandContext => ({
      normalize: { displayZone: timeZone, newId: idGen },
      weekStart: firstDay,
      ...(validating && { rules: rulesNow() }),
      ...(validating && externalRun && { external: true }),
    }),
    { limit: o.historyLimit ?? 200 },
  );
  const sources = createSourceManager({
    store: writerFace(store),
    normalize: () => ({ displayZone: timeZone, newId: idGen }),
    now,
    // The `events` option is its own array source, loaded apart.
    reserved: ['events'],
    notify: (notice) => {
      o.onSource?.(notice);
      emit({ type: 'source', notice });
    },
    ...(o.timers && { timers: o.timers }),
  });
  let state = computeState();
  let model: ViewModel | null = null;
  const fetchShown = () => sources.setRange(state.range.start, state.range.end, timeZone);
  let held = 0;
  let pending: StateCause[] = [];
  let direction: 'prev' | 'next' | 'other' | undefined;

  /** Formats already reported: a broken one is said once, not at every title. */
  const reported = new WeakSet<object>();
  const reportOnce = (fmt: object, err: unknown) => {
    if (reported.has(fmt)) return;
    reported.add(fmt);
    void Promise.reject(err);
  };
  function titleFor(range: ViewRange, spec: ViewSpec): string {
    // A month's or a year's period is its own days, not the grid's padding ones (28 September opens October's grid).
    const own = spec.alignment === 'month' || spec.alignment === 'year' || spec.visibleRange !== undefined;
    const first = own ? range.activeStart : (range.dates[0] ?? range.activeStart);
    const last = own ? range.activeEnd.subtract({ days: 1 }) : (range.dates[range.dates.length - 1] ?? range.activeEnd.subtract({ days: 1 }));
    if (titleFormat) {
      const fmt = titleFormat;
      try {
        if (typeof fmt === 'function') {
          const out = fmt({ start: first, end: last, view: spec.type, locale });
          if (typeof out === 'string') return out;
          reportOnce(fmt, new TypeError('dzcalendar: titleFormat returned no text'));
        } else return first.equals(last) ? formatTemporal(first, fmt, locale) : formatRangeTitle(first, last, fmt, locale);
      } catch (err) {
        // The application's bug is reported (once for that format); the title is written as by default.
        reportOnce(fmt, err);
      }
    }
    switch (spec.alignment) {
      case 'month': {
        // The months the period covers *as the locale writes them*: a Gregorian
        // month in a Hijri display spans two Hijri months, and says so.
        const last = range.activeEnd.subtract({ days: 1 });
        const one = formatTemporal(range.activeStart, { month: 'long', year: 'numeric' }, locale);
        return one === formatTemporal(last, { month: 'long', year: 'numeric' }, locale)
          ? one
          : formatRangeTitle(range.activeStart, last, { month: 'short', year: 'numeric' }, locale);
      }
      case 'year': {
        const last = range.activeEnd.subtract({ days: 1 });
        const one = formatTemporal(range.activeStart, { year: 'numeric' }, locale);
        return one === formatTemporal(last, { year: 'numeric' }, locale) ? one : formatRangeTitle(range.activeStart, last, { year: 'numeric' }, locale);
      }
      default: {
        return first.equals(last)
          ? formatTemporal(first, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, locale)
          : formatRangeTitle(first, last, { day: 'numeric', month: 'short', year: 'numeric' }, locale);
      }
    }
  }

  function computeState(at = date, spec = view): KernelState {
    const ctx = nav();
    const range = computeViewRange(at, spec, ctx);
    return { date: at, view: spec, range, timeZone, locale, firstDay, title: titleFor(range, spec), today: ctx.today };
  }

  // One subscriber that throws must not starve the others (nor, on a shared
  // store, the other kernels): its error is reported, after the round.
  const emit = (e: KernelEvent) => {
    for (const fn of [...listeners]) {
      try {
        fn(e);
      } catch (err) {
        // Reported as an unhandled rejection: visible, and after the round.
        void Promise.reject(err);
      }
    }
  };
  const flush = () => {
    if (held > 0 || pending.length === 0) return;
    const causes = [...new Set(pending)];
    pending = [];
    const dir = direction;
    direction = undefined;
    emit({ type: 'state', state, causes, ...(dir && { direction: dir }) });
  };
  const changeState = (cause: StateCause) => {
    state = computeState();
    // A period beyond what is loaded: the weeks it needs first (the rest stays for idle time).
    ensureShown(state.range);
    model = null;
    fetchShown();
    pending.push(cause);
    flush();
  };

  if (o.events) loadEvents(o.events);
  /** The period shown in epoch ms and epoch days, a day wider each side (zones): what a change must touch to matter here. */
  let shownFor: KernelState | null = null;
  let shown = { lo: 0, hi: 0, loDay: 0, hiDay: 0 };
  const offscreen = (change: StoreChange): boolean => {
    if (change.seriesTouched.length > 0) return false;
    if (shownFor !== state) {
      shownFor = state;
      const lo = state.range.start.toZonedDateTime(timeZone).epochMilliseconds - 86_400_000;
      const hi = state.range.end.toZonedDateTime(timeZone).epochMilliseconds + 86_400_000;
      shown = { lo, hi, loDay: Math.floor(lo / 86_400_000), hiDay: Math.ceil(hi / 86_400_000) };
    }
    return change.dirtySpans.every((x) => x.e <= shown.lo || x.s >= shown.hi) && change.dirtyDays.every((x) => x.e <= shown.loDay || x.s >= shown.hiDay);
  };
  const unsubscribe = store.subscribe((change) => {
    // Elsewhere than shown (a large load's later weeks, a neighbouring chunk): the model stands, the view need not redraw.
    if (change.cause !== 'command' && change.cause !== 'undo' && change.cause !== 'redo' && model && FAMILIES.get(model.family)?.rangeOnly === true && offscreen(change)) {
      emit({ type: 'store', change, offscreen: true });
      return;
    }
    const family = model ? FAMILIES.get(model.family) : undefined;
    model = model && family?.update ? { family: model.family, model: family.update(model.model, store.snapshot, change) } : null;
    emit(change.cause === 'command' && running ? { type: 'store', change, command: running, validated: validating } : { type: 'store', change });
  });
  fetchShown();
  for (const spec of o.sources ?? []) sources.add(spec);

  return {
    store: storeFace(store),
    getState: () => state,
    getViewSpec: (type) => ownView(type),
    setView(type, at) {
      const spec = viewOf(type);
      if (spec === raw && (!at || at.equals(date))) return;
      // The next state first: a view whose range cannot be made (every day of a fixed period hidden) changes nothing.
      const nextView = effectiveOf(spec);
      computeState(at ?? date, nextView);
      raw = spec;
      view = nextView;
      if (at) date = at;
      direction ??= 'other';
      changeState('view');
    },
    navigate(dir) {
      const next = navigate(date, view, dir, nav());
      if (next.equals(date)) return;
      direction ??= dir === 'prev' || dir === 'next' ? dir : 'other';
      date = next;
      changeState('navigate');
    },
    setTimeZone(zone) {
      if (!isValidZone(zone)) throw new RangeError(`not a time zone: ${zone}`);
      if (zone === timeZone) return;
      // Not a store change: every column's days are different days now.
      timeZone = zone;
      changeState('zone');
    },
    setLocale(next) {
      if (next === locale) return;
      locale = next;
      if (firstDayGiven === null) firstDay = weekRulesFor(next).firstDay;
      changeState('locale');
    },
    setFirstDay(day) {
      if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 7)) throw new RangeError(`firstDay is an ISO weekday, 1 (Monday) to 7 (Sunday): ${day}`);
      firstDayGiven = day;
      const next = day ?? weekRulesFor(locale).firstDay;
      if (next === firstDay) return;
      // Weeks start elsewhere: the range moves, every grid's columns too.
      firstDay = next;
      changeState('options');
    },
    setTitleFormat(format) {
      titleFormat = format;
      changeState('options');
    },
    setRules(rules) {
      // Read at every gesture and command: nothing to redraw.
      rulesGiven = rules;
    },
    setOptions(next, how = {}) {
      if (next.businessHours !== undefined) assertBusinessHours(next.businessHours);
      if (next.timeGrid) assertTimeGrid(next.timeGrid);
      if (next.timeline) assertTimeline(next.timeline);
      // Equal values (per key, one level deep) change nothing and say nothing.
      const same = (a: object | undefined, b: object | undefined) =>
        a === b || (a !== undefined && b !== undefined && Object.entries(b).every(([k, v]) => (a as Record<string, unknown>)[k] === v));
      if (
        (!next.timeGrid || same(options.timeGrid, next.timeGrid)) &&
        (!next.dayGrid || same(options.dayGrid, next.dayGrid)) &&
        (!next.timeline || same(options.timeline, next.timeline)) &&
        (!('businessHours' in next) || next.businessHours === options.businessHours) &&
        (!('availableSlots' in next) || next.availableSlots === options.availableSlots) &&
        (!('hiddenDays' in next) || [...(next.hiddenDays ?? [])].sort().join() === [...(options.hiddenDays ?? [])].sort().join()) &&
        (!('resourceOrder' in next) || sameOrder(next.resourceOrder, options.resourceOrder)) &&
        (!('resourceGroupField' in next) || next.resourceGroupField === options.resourceGroupField) &&
        (!('showUnassigned' in next) || next.showUnassigned === options.showUnassigned) &&
        (!('collapsedResources' in next) || sameIds(next.collapsedResources, options.collapsedResources)) &&
        (!('collapsedGroups' in next) || sameIds(next.collapsedGroups, options.collapsedGroups))
      ) {
        return;
      }
      if (next.hiddenDays && new Set(next.hiddenDays).size >= 7) throw new RangeError('hiddenDays: every day of the week is hidden');
      const was = options;
      options = {
        ...options,
        ...(next.timeGrid && { timeGrid: { ...options.timeGrid, ...next.timeGrid } }),
        ...(next.dayGrid && { dayGrid: { ...options.dayGrid, ...next.dayGrid } }),
        ...(next.timeline && { timeline: { ...options.timeline, ...next.timeline } }),
        ...('businessHours' in next && { businessHours: next.businessHours }),
        ...('hiddenDays' in next && { hiddenDays: next.hiddenDays }),
        ...('availableSlots' in next && { availableSlots: next.availableSlots }),
        ...('resourceOrder' in next && { resourceOrder: next.resourceOrder }),
        ...('resourceGroupField' in next && { resourceGroupField: next.resourceGroupField }),
        ...('showUnassigned' in next && { showUnassigned: next.showUnassigned }),
        ...('collapsedResources' in next && { collapsedResources: next.collapsedResources }),
        ...('collapsedGroups' in next && { collapsedGroups: next.collapsedGroups }),
      } as ModelOptions;
      // The view as these options make it, tried first: a fixed period whose days all become hidden changes nothing.
      const nextView = effectiveOf(raw);
      try {
        computeState(date, nextView);
      } catch (err) {
        options = was;
        throw err;
      }
      if ('resourceOrder' in next || 'resourceGroupField' in next) buildResources();
      view = nextView;
      if (how.silent) {
        state = computeState();
        model = null;
      } else changeState('options');
    },
    setEvents(events) {
      return loadEvents(events);
    },
    getOptions: () => options,
    batch(fn) {
      held++;
      try {
        fn();
      } finally {
        held--;
        flush();
      }
    },
    refreshToday() {
      if (todayIn(timeZone).equals(state.today)) return false;
      changeState('today');
      return true;
    },
    stateAt(type, at) {
      const raw = ownView(type);
      const spec = raw && effectiveOf(raw);
      return spec ? computeState(at, spec) : null;
    },
    modelAt(type, at, over) {
      // The view as shown would be: hidden days and weekends applied.
      const raw = ownView(type);
      const spec = raw && effectiveOf(raw);
      const family = spec && FAMILIES.get(spec.family);
      if (!spec || !family) return null;
      if (over?.timeline) assertTimeline(over.timeline);
      const range = computeState(at, spec).range;
      ensureShown(range);
      const opts: ModelOptions = !over
        ? options
        : {
            ...options,
            ...(over.timeGrid && { timeGrid: { ...options.timeGrid, ...over.timeGrid } }),
            ...(over.dayGrid && { dayGrid: { ...options.dayGrid, ...over.dayGrid } }),
            ...(over.timeline && { timeline: { ...options.timeline, ...over.timeline } }),
          };
      return { family: spec.family, model: family.build(range, store.snapshot, { displayZone: timeZone, view: spec, options: opts, resources: resourceTree, columns }) };
    },
    viewModel() {
      if (model) return model;
      const family = FAMILIES.get(view.family);
      if (!family) throw new Error(`no model family registered for ${view.family}`);
      // Another calendar's load on a shared store may not have reached this period yet.
      ensureShown(state.range);
      model = { family: view.family, model: family.build(state.range, store.snapshot, { displayZone: timeZone, view, options, resources: resourceTree, columns }) };
      return model;
    },
    now,
    getProblems: () => problems,
    whenLoaded: () => (deferred && !deferred.done ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve()),
    setResources(next) {
      resourceInputs = next;
      buildResources();
      changeState('resources');
      return resourceProblems;
    },
    getResources: () => resourceTree,
    getResourceProblems: () => resourceProblems,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    run(cmd, opts = {}) {
      finishEvents();
      validating = opts.validate === true;
      externalRun = opts.external === true;
      running = cmd;
      try {
        return history.run(cmd);
      } finally {
        validating = false;
        externalRun = false;
        running = null;
      }
    },
    rules: rulesNow,
    // What a person's undo or redo touches is loaded first (identity checks against what is stored).
    history: {
      get canUndo() {
        return history.canUndo;
      },
      get canRedo() {
        return history.canRedo;
      },
      run: (cmd) => (finishEvents(), history.run(cmd)),
      undo: () => (finishEvents(), history.undo()),
      redo: () => (finishEvents(), history.redo()),
      revert: (applied) => (finishEvents(), history.revert(applied)),
      transaction: (label, fn) => (finishEvents(), history.transaction(label, fn)),
      clear: () => history.clear(),
      destroy: () => history.destroy(),
    } satisfies typeof history,
    sources,
    destroy() {
      deferred?.cancel();
      deferred = null;
      // Who waits for the load is let go (an unmounting wrapper).
      settle();
      unpend();
      sources.destroy();
      unsubscribe();
      history.destroy();
      listeners.clear();
    },
  };
}
