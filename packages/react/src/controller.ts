import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { Command, CommandResult, CreateRequest, EventInstance, KernelState, NormalizationReport, PlainDate, ViewRange } from '@dzcalendar/core';
import type { CalendarInstance } from '@dzcalendar/dom';

/** What the calendar is now, as one immutable value (a new one on every change). */
export interface CalendarSnapshot {
  /** The DOM calendar, for what the snapshot does not cover; null before mounting and after. */
  readonly instance: CalendarInstance | null;
  readonly state: KernelState | null;
  readonly title: string;
  readonly view: string | null;
  readonly date: PlainDate | null;
  readonly range: ViewRange | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** A source is fetching. */
  readonly loading: boolean;
  /** What the last load of events or delivery of a source reported. */
  readonly problems: NormalizationReport | null;
}

/** What a `takeOver` hands over. */
export interface TakenOver {
  readonly onEventOpen?: (instance: EventInstance) => void;
  readonly onCreateRequest?: (request: CreateRequest) => void;
}

const EMPTY: CalendarSnapshot = { instance: null, state: null, title: '', view: null, date: null, range: null, canUndo: false, canRedo: false, loading: false, problems: null };

/**
 * The calendar for what sits around it — a header of one's own, a side
 * panel, a status line: `const cal = useCalendarController()`, then
 * `<DzCalendar controller={cal} />` and `useCalendarState(cal)` wherever it is
 * read. Its methods are stable (pass them as handlers as they are).
 */
export class CalendarController {
  private snap: CalendarSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private taken: TakenOver | null = null;
  private reoffer: (() => void) | null = null;

  /**
   * "Open" and "New event here" handed to someone else while it is active
   * (the Pro's editor): they win over the calendar's own `onEventOpen` and
   * `onCreateRequest`, whatever the props do. Returns how to give them back.
   */
  takeOver(handlers: TakenOver): () => void {
    this.taken = handlers;
    this.reoffer?.();
    return () => {
      if (this.taken !== handlers) return;
      this.taken = null;
      this.reoffer?.();
    };
  }
  /** @internal What `<DzCalendar>` offers first. */
  get takenOver(): TakenOver | null {
    return this.taken;
  }
  /** @internal `<DzCalendar>` says how to offer again (null: no calendar). */
  onReoffer(fn: (() => void) | null): void {
    this.reoffer = fn;
  }

  /** @internal For `useSyncExternalStore`. */
  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  readonly getSnapshot = (): CalendarSnapshot => this.snap;

  private set(next: Partial<CalendarSnapshot>): void {
    let changed = false;
    for (const [k, v] of Object.entries(next)) if (this.snap[k as keyof CalendarSnapshot] !== v) changed = true;
    if (!changed) return;
    this.snap = { ...this.snap, ...next };
    for (const fn of [...this.listeners]) fn();
  }

  /** @internal Called by `<DzCalendar>` once its DOM calendar exists. */
  attach(instance: CalendarInstance): void {
    this.set({ instance });
    this.read();
  }
  /** @internal The calendar is destroyed: the controller no longer reaches it. */
  detach(instance: CalendarInstance): void {
    if (this.snap.instance === instance) this.snap = { ...EMPTY };
    for (const fn of [...this.listeners]) fn();
  }
  /** @internal Reads the kernel again after one of its events. */
  read(): void {
    const c = this.snap.instance;
    if (!c) return;
    const s = c.kernel.getState();
    this.set({ state: s, title: s.title, view: s.view.type, date: s.date, range: s.range, canUndo: c.kernel.history.canUndo, canRedo: c.kernel.history.canRedo });
  }
  /** @internal */
  setLoading(loading: boolean): void {
    this.set({ loading });
  }
  /** @internal */
  setProblems(problems: NormalizationReport | null): void {
    this.set({ problems });
  }

  /** Calls the calendar, then reads what can be undone at once; before mounting, nothing (and `fallback`). */
  private call<T>(fn: (c: CalendarInstance) => T, fallback: T): T {
    const c = this.snap.instance;
    if (!c) return fallback;
    const r = fn(c);
    this.read();
    return r;
  }

  readonly dispatch = (cmd: Command, opts?: { readonly validate?: boolean }): CommandResult =>
    this.call((c) => c.run(cmd, opts), { ok: false, problems: [{ code: 'invalid-option', severity: 'error', path: 'calendar', detail: 'not-mounted' }] });
  readonly undo = (): boolean => this.call((c) => c.undo(), false);
  readonly redo = (): boolean => this.call((c) => c.redo(), false);
  readonly prev = (): void => this.call((c) => c.navigate('prev'), undefined);
  readonly next = (): void => this.call((c) => c.navigate('next'), undefined);
  readonly today = (): void => this.call((c) => c.navigate('today'), undefined);
  readonly goTo = (date: PlainDate): void => this.call((c) => c.update({ date }), undefined);
  readonly changeView = (view: string): void => this.call((c) => c.update({ view }), undefined);
  readonly refetch = (sourceId?: string): void => this.call((c) => c.refetch(sourceId), undefined);
}

/** A controller for this component's life (stable across renders). */
export function useCalendarController(): CalendarController {
  return useMemo(() => new CalendarController(), []);
}

/** The calendar now; the component renders again when it changes. */
export function useCalendarState(controller: CalendarController): CalendarSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

/** @internal The controller of the `<DzCalendar>` around: given to what it renders (the events' content). */
export const CalendarControllerContext = createContext<CalendarController | null>(null);

/**
 * In what a `<DzCalendar>` renders (an event's content): that calendar's
 * controller; null elsewhere. (`useCalendarController()` makes a new one.)
 */
export function useParentCalendarController(): CalendarController | null {
  return useContext(CalendarControllerContext);
}

