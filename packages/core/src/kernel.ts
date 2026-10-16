import type { NormalizationReport } from './event/normalize.js';
import type { EventInput } from './event/types.js';
import { formatRangeTitle, formatTemporal } from './format/intl.js';
import { weekRulesFor } from './format/week.js';
import { createIdGenerator } from './ids.js';
import { arraySource, loadStaticSource } from './source/array-source.js';
import type { StoreChange } from './store/changes.js';
import { createEventStore } from './store/store.js';
import type { EventStore } from './store/store.js';
import { Temporal } from './temporal.js';
import type { Instant, PlainDate, Weekday, ZoneId } from './temporal.js';
import { BUILTIN_VIEWS } from './views/builtin.js';
import { buildDayGridModel } from './views/daygrid.js';
import type { DayGridModel, DayGridOptions } from './views/daygrid.js';
import { navigate } from './views/nav.js';
import type { NavDirection } from './views/nav.js';
import { computeViewRange } from './views/range.js';
import type { NavContext, ViewRange, ViewSpec } from './views/spec.js';
import { buildTimeGridModel, updateTimeGridModel } from './views/timegrid.js';
import type { TimeGridModel, TimeGridOptions } from './views/timegrid.js';
import { isValidZone } from './zone.js';

export interface KernelOptions {
  readonly timeZone: ZoneId;
  readonly locale: string;
  /** Default: the locale's. */
  readonly firstDay?: Weekday;
  /** Default: today in `timeZone`. */
  readonly initialDate?: PlainDate;
  readonly initialView?: string;
  /** Added to (and overriding) the built-in views. */
  readonly views?: Readonly<Record<string, ViewSpec>>;
  /**
   * A store to share: four kernels on one store show the same events in four
   * zones. Default: a store of the kernel's own.
   */
  readonly store?: EventStore;
  /** Loaded as an array source named "events". */
  readonly events?: readonly EventInput[];
  /** Injectable for tests. Default: the system clock. */
  readonly now?: () => Instant;
  readonly timeGrid?: Omit<TimeGridOptions, 'displayZone'>;
  readonly dayGrid?: Omit<DayGridOptions, 'displayZone'>;
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

export type ViewModel =
  | { readonly family: 'timeGrid'; readonly model: TimeGridModel }
  | { readonly family: 'dayGrid'; readonly model: DayGridModel };

export type KernelEvent = { readonly type: 'state'; readonly state: KernelState } | { readonly type: 'store'; readonly change: StoreChange };

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
   * Re-reads today from the clock. Call it from a timer: past midnight, the
   * highlighted day must move with the now line. True when it changed.
   */
  refreshToday(): boolean;
  /** Memoized; after a store change only the touched columns are rebuilt. */
  viewModel(): ViewModel;
  now(): Instant;
  /** What loading `events` reported: rejected inputs and every guess made. */
  getProblems(): NormalizationReport | null;
  subscribe(fn: (e: KernelEvent) => void): () => void;
  destroy(): void;
}

const systemNow = (): Instant => Temporal.Now.instant();

/**
 * The calendar without a screen: date, view, zone, navigation, title, and the
 * view model kept in step with the store. Shared by the DOM, Angular and the
 * native ports, so none of them re-implements memoization or titles.
 *
 * Commands, history, selection and the source manager join in their phases.
 */
export function createKernel(o: KernelOptions): CalendarKernel {
  if (!isValidZone(o.timeZone)) throw new RangeError(`timeZone is not a time zone: ${o.timeZone}`);
  const views = { ...BUILTIN_VIEWS, ...o.views };
  const now = o.now ?? systemNow;
  const store = o.store ?? createEventStore();
  let locale = o.locale;
  let firstDay = o.firstDay ?? weekRulesFor(locale).firstDay;
  const listeners = new Set<(e: KernelEvent) => void>();

  let timeZone = o.timeZone;
  const todayIn = (zone: ZoneId) => now().toZonedDateTimeISO(zone).toPlainDate();
  let date = o.initialDate ?? todayIn(timeZone);
  const viewOf = (type: string) => {
    const spec = views[type];
    if (!spec) throw new RangeError(`unknown view: ${type}`);
    return spec;
  };
  let view = viewOf(o.initialView ?? 'timeGridWeek');

  let problems: NormalizationReport | null = null;
  if (o.events) {
    problems = loadStaticSource(store, arraySource('events', o.events), { displayZone: timeZone, newId: createIdGenerator('ev') }).report;
  }

  const nav = (): NavContext => ({ firstDay, today: todayIn(timeZone) });
  let state = computeState();
  let model: ViewModel | null = null;

  function titleFor(range: ViewRange, spec: ViewSpec): string {
    const last = range.activeEnd.subtract({ days: 1 });
    switch (spec.alignment) {
      case 'month':
        return formatTemporal(range.activeStart, { month: 'long', year: 'numeric' }, locale);
      case 'year':
        return formatTemporal(range.activeStart, { year: 'numeric' }, locale);
      default: {
        const first = range.dates[0] ?? range.activeStart;
        const lastShown = range.dates[range.dates.length - 1] ?? last;
        return first.equals(lastShown)
          ? formatTemporal(first, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, locale)
          : formatRangeTitle(first, lastShown, { day: 'numeric', month: 'short', year: 'numeric' }, locale);
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
  const changeState = () => {
    state = computeState();
    model = null;
    emit({ type: 'state', state });
  };

  const unsubscribe = store.subscribe((change) => {
    if (model?.family === 'timeGrid') model = { family: 'timeGrid', model: updateTimeGridModel(model.model, store.snapshot, change) };
    else model = null;
    emit({ type: 'store', change });
  });

  return {
    store,
    getState: () => state,
    setView(type, at) {
      view = viewOf(type);
      if (at) date = at;
      changeState();
    },
    navigate(dir) {
      date = navigate(date, view, dir, nav());
      changeState();
    },
    setTimeZone(zone) {
      if (!isValidZone(zone)) throw new RangeError(`not a time zone: ${zone}`);
      // Not a store change: every column's days are different days now.
      timeZone = zone;
      changeState();
    },
    getViewSpec: (type) => views[type],
    setLocale(next) {
      locale = next;
      if (o.firstDay === undefined) firstDay = weekRulesFor(next).firstDay;
      changeState();
    },
    refreshToday() {
      if (todayIn(timeZone).equals(state.today)) return false;
      changeState();
      return true;
    },
    viewModel() {
      if (model) return model;
      const snap = store.snapshot;
      if (view.family === 'timeGrid') {
        model = { family: 'timeGrid', model: buildTimeGridModel(state.range, snap, { ...o.timeGrid, displayZone: timeZone }) };
      } else if (view.family === 'dayGrid') {
        model = { family: 'dayGrid', model: buildDayGridModel(state.range, snap, { ...o.dayGrid, displayZone: timeZone }) };
      } else {
        throw new Error(`the ${view.family} family is drawn from a later phase`);
      }
      return model;
    },
    now,
    getProblems: () => problems,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      unsubscribe();
      listeners.clear();
    },
  };
}
