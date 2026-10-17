import type { NormalizationReport } from './event/normalize.js';
import type { EventInput } from './event/types.js';
import { formatRangeTitle, formatTemporal } from './format/intl.js';
import { weekRulesFor } from './format/week.js';
import { createIdGenerator } from './ids.js';
import { assertBusinessHours } from './rules/business-hours.js';
import type { BusinessHoursInput } from './rules/business-hours.js';
import { arraySource, loadStaticSource } from './source/array-source.js';
import { createSourceManager } from './source/manager.js';
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
import { BUILTIN_VIEWS } from './views/builtin.js';
import { buildDayGridModel, updateDayGridModel } from './views/daygrid.js';
import type { DayGridModel, DayGridOptions } from './views/daygrid.js';
import { navigate } from './views/nav.js';
import type { NavDirection } from './views/nav.js';
import { computeViewRange } from './views/range.js';
import type { NavContext, ViewRange, ViewSpec } from './views/spec.js';
import { buildTimeGridModel, updateTimeGridModel } from './views/timegrid.js';
import type { TimeGridModel, TimeGridOptions } from './views/timegrid.js';
import { isValidZone } from './zone.js';

/** Options that shape the models; changeable at any time with `setOptions`. */
export interface ModelOptions {
  readonly timeGrid?: Omit<TimeGridOptions, 'displayZone' | 'businessHours'>;
  readonly dayGrid?: Omit<DayGridOptions, 'displayZone' | 'businessHours' | 'showNonCurrentDates'>;
  readonly businessHours?: BusinessHoursInput;
  /** Weekdays no view shows (ISO: 6 and 7 for the weekend), unless a view names its own. */
  readonly hiddenDays?: readonly Weekday[];
}

export interface KernelOptions extends ModelOptions {
  readonly timeZone: ZoneId;
  readonly locale: string;
  /** Default: the locale's. */
  readonly firstDay?: Weekday;
  /** Default: today in `timeZone`. */
  readonly initialDate?: PlainDate;
  readonly initialView?: string;
  /** Added to (and overriding) the built-in views. */
  readonly views?: Readonly<Record<string, ViewSpec>>;
  /** A store to share: four kernels on one store show the same events in four zones. */
  readonly store?: EventStore;
  /** Loaded as an array source named "events"; replaced with `setEvents`. */
  readonly events?: readonly EventInput[];
  /** Injectable for tests. Default: the system clock. */
  readonly now?: () => Instant;
  /** What edits are checked against (business hours come from `businessHours`). */
  readonly rules?: Omit<RulesContext, 'displayZone' | 'businessHours'>;
  /** Undo entries kept. Default 200. */
  readonly historyLimit?: number;
  /** Fetched as the calendar moves (`kernel.sources` adds, removes, refetches). */
  readonly sources?: readonly EventSourceSpec[];
  /** Loading, fetch errors, problems in a delivery, saves refused. */
  readonly onSource?: (n: SourceNotice) => void;
  /** For retries; injectable for tests. Default: the global timers. */
  readonly timers?: Timers;
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
  build(range: ViewRange, snap: StoreSnapshot, ctx: { readonly displayZone: ZoneId; readonly view: ViewSpec; readonly options: ModelOptions }): M;
  /** Optional fine update after a store change; absent means rebuild. */
  update?(prev: M, snap: StoreSnapshot, change: StoreChange): M;
}

const FAMILIES = new Map<string, ModelFamily>();

/** Built-ins register here; so do the Pro's timeline and custom families. */
export function registerModelFamily<M>(family: string, f: ModelFamily<M>): void {
  FAMILIES.set(family, f as ModelFamily);
}

registerModelFamily<TimeGridModel>('timeGrid', {
  build: (range, snap, { displayZone, options }) =>
    buildTimeGridModel(range, snap, {
      ...options.timeGrid,
      displayZone,
      ...(options.businessHours !== undefined && { businessHours: options.businessHours }),
    }),
  update: updateTimeGridModel,
});
registerModelFamily<DayGridModel>('dayGrid', {
  build: (range, snap, { displayZone, view, options }) =>
    buildDayGridModel(range, snap, {
      ...options.dayGrid,
      displayZone,
      showNonCurrentDates: view.showNonCurrentDates,
      ...(options.businessHours !== undefined && { businessHours: options.businessHours }),
    }),
  update: updateDayGridModel,
});

/** The model of the current view; `family` tells a renderer what `model` is. */
export interface ViewModel<M = unknown> {
  readonly family: string;
  readonly model: M;
}

export type StateCause = 'navigate' | 'view' | 'zone' | 'locale' | 'options' | 'today';

export type KernelEvent =
  | {
      readonly type: 'state';
      readonly state: KernelState;
      /** Every cause since the last event: a batch of three changes is one event with three causes. */
      readonly causes: readonly StateCause[];
      /** Which way the dates moved, when they moved. */
      readonly direction?: 'prev' | 'next' | 'other';
    }
  | { readonly type: 'store'; readonly change: StoreChange }
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
  /** Shallow-merged per key (`timeGrid`, `dayGrid`) over the current options. */
  setOptions(options: ModelOptions): void;
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
  now(): Instant;
  /** What the last `events`/`setEvents` load reported. */
  getProblems(): NormalizationReport | null;
  /**
   * Runs a command through the history: undoable; series created here take
   * the locale's first day as WKST. `validate` checks it against the rules
   * (constraint, overlap, allow, editable) — what a person's gesture asks for;
   * the application's own calls and server pushes are not refused by them.
   */
  run(cmd: Command, opts?: { readonly validate?: boolean }): CommandResult;
  /** What gestures are checked against now: the zone, business hours, the rules given. */
  rules(): RulesContext;
  readonly history: History;
  /** The sources: fetched for what the view shows, kept in step with the store. */
  readonly sources: SourceManager;
  subscribe(fn: (e: KernelEvent) => void): () => void;
  destroy(): void;
}

const systemNow = (): Instant => Temporal.Now.instant();

/**
 * The calendar without a screen: date, view, zone, locale, options,
 * navigation, title, and the view model kept in step with the store. Shared
 * by the DOM, Angular and the native ports. It has no timer of its own.
 */
export function createKernel(o: KernelOptions): CalendarKernel {
  if (!isValidZone(o.timeZone)) throw new RangeError(`timeZone is not a time zone: ${o.timeZone}`);
  if (o.businessHours !== undefined) assertBusinessHours(o.businessHours);
  const views = { ...BUILTIN_VIEWS, ...o.views };
  const now = o.now ?? systemNow;
  const store = o.store ?? createEventStore();
  const listeners = new Set<(e: KernelEvent) => void>();

  let timeZone = o.timeZone;
  let locale = o.locale;
  let firstDay = o.firstDay ?? weekRulesFor(locale).firstDay;
  let options: ModelOptions = {
    ...(o.timeGrid && { timeGrid: o.timeGrid }),
    ...(o.dayGrid && { dayGrid: o.dayGrid }),
    ...(o.businessHours !== undefined && { businessHours: o.businessHours }),
    ...(o.hiddenDays && { hiddenDays: o.hiddenDays }),
  };
  const todayIn = (zone: ZoneId) => now().toZonedDateTimeISO(zone).toPlainDate();
  let date = o.initialDate ?? todayIn(timeZone);
  const viewOf = (type: string) => {
    const spec = views[type];
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

  let problems: NormalizationReport | null = null;
  const idGen = createIdGenerator('ev');
  const loadEvents = (events: readonly EventInput[]) =>
    (problems = loadStaticSource(store, arraySource('events', events), { displayZone: timeZone, newId: idGen }).report);
  if (o.events) loadEvents(o.events);

  const nav = (): NavContext => ({ firstDay, today: todayIn(timeZone) });
  let validating = false;
  const rulesNow = (): RulesContext => ({ displayZone: timeZone, ...(options.businessHours !== undefined && { businessHours: options.businessHours }), ...o.rules });
  // Read at every command: the zone, the locale's first day and the rules may have changed since.
  const history = createHistory(
    store,
    (): CommandContext => ({
      normalize: { displayZone: timeZone, newId: idGen },
      weekStart: firstDay,
      ...(validating && { rules: rulesNow() }),
    }),
    { limit: o.historyLimit ?? 200 },
  );
  const sources = createSourceManager({
    store,
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

  function titleFor(range: ViewRange, spec: ViewSpec): string {
    switch (spec.alignment) {
      case 'month': {
        // Several months (a list or a multi-month view of `duration: { months: 3 }`): the stretch.
        const last = range.activeEnd.subtract({ days: 1 });
        return last.month === range.activeStart.month && last.year === range.activeStart.year
          ? formatTemporal(range.activeStart, { month: 'long', year: 'numeric' }, locale)
          : formatRangeTitle(range.activeStart, last, { month: 'short', year: 'numeric' }, locale);
      }
      case 'year':
        return formatTemporal(range.activeStart, { year: 'numeric' }, locale);
      default: {
        const first = range.dates[0] ?? range.activeStart;
        const last = range.dates[range.dates.length - 1] ?? range.activeEnd.subtract({ days: 1 });
        return first.equals(last)
          ? formatTemporal(first, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, locale)
          : formatRangeTitle(first, last, { day: 'numeric', month: 'short', year: 'numeric' }, locale);
      }
    }
  }

  function computeState(): KernelState {
    const ctx = nav();
    const range = computeViewRange(date, view, ctx);
    return { date, view, range, timeZone, locale, firstDay, title: titleFor(range, view), today: ctx.today };
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
    model = null;
    fetchShown();
    pending.push(cause);
    flush();
  };

  const unsubscribe = store.subscribe((change) => {
    const family = model ? FAMILIES.get(model.family) : undefined;
    model = model && family?.update ? { family: model.family, model: family.update(model.model, store.snapshot, change) } : null;
    emit({ type: 'store', change });
  });
  fetchShown();
  for (const spec of o.sources ?? []) sources.add(spec);

  return {
    store,
    getState: () => state,
    getViewSpec: (type) => views[type],
    setView(type, at) {
      const spec = viewOf(type);
      if (spec === raw && (!at || at.equals(date))) return;
      raw = spec;
      view = effectiveOf(spec);
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
      if (o.firstDay === undefined) firstDay = weekRulesFor(next).firstDay;
      changeState('locale');
    },
    setOptions(next) {
      if (next.businessHours !== undefined) assertBusinessHours(next.businessHours);
      // Equal values (per key, one level deep) change nothing and say nothing.
      const same = (a: object | undefined, b: object | undefined) =>
        a === b || (a !== undefined && b !== undefined && Object.entries(b).every(([k, v]) => (a as Record<string, unknown>)[k] === v));
      if (
        (!next.timeGrid || same(options.timeGrid, next.timeGrid)) &&
        (!next.dayGrid || same(options.dayGrid, next.dayGrid)) &&
        (!('businessHours' in next) || next.businessHours === options.businessHours) &&
        (!('hiddenDays' in next) || [...(next.hiddenDays ?? [])].sort().join() === [...(options.hiddenDays ?? [])].sort().join())
      ) {
        return;
      }
      if (next.hiddenDays && new Set(next.hiddenDays).size >= 7) throw new RangeError('hiddenDays: every day of the week is hidden');
      options = {
        ...options,
        ...(next.timeGrid && { timeGrid: { ...options.timeGrid, ...next.timeGrid } }),
        ...(next.dayGrid && { dayGrid: { ...options.dayGrid, ...next.dayGrid } }),
        ...('businessHours' in next && { businessHours: next.businessHours }),
        ...('hiddenDays' in next && { hiddenDays: next.hiddenDays }),
      } as ModelOptions;
      view = effectiveOf(raw);
      changeState('options');
    },
    setEvents(events) {
      return loadEvents(events);
    },
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
    viewModel() {
      if (model) return model;
      const family = FAMILIES.get(view.family);
      if (!family) throw new Error(`no model family registered for ${view.family}`);
      model = { family: view.family, model: family.build(state.range, store.snapshot, { displayZone: timeZone, view, options }) };
      return model;
    },
    now,
    getProblems: () => problems,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    run(cmd, opts = {}) {
      validating = opts.validate === true;
      try {
        return history.run(cmd);
      } finally {
        validating = false;
      }
    },
    rules: rulesNow,
    history,
    sources,
    destroy() {
      sources.destroy();
      unsubscribe();
      history.destroy();
      listeners.clear();
    },
  };
}
