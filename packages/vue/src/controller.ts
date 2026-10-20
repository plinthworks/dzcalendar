import { computed, inject, shallowRef } from 'vue';
import type { ComputedRef, InjectionKey, ShallowRef } from 'vue';
import type { Command, CommandResult, CreateRequest, EventInstance, KernelState, NormalizationReport, PlainDate, ViewRange } from '@dzcalendar/core';
import type { CalendarInstance } from '@dzcalendar/dom';

/**
 * The calendar as refs, for what sits around it — a header of one's own, a
 * side panel, a status line. `createCalendarController()` beside the calendar
 * (`<DzCalendar :controller="cal">`), or `injectCalendarController()` in a
 * component inside it.
 */
export interface CalendarController {
  /** The DOM calendar, for what the refs do not cover; null before mounting and after. */
  readonly instance: Readonly<ShallowRef<CalendarInstance | null>>;
  readonly state: Readonly<ShallowRef<KernelState | null>>;
  readonly title: ComputedRef<string>;
  readonly view: ComputedRef<string | null>;
  readonly date: ComputedRef<PlainDate | null>;
  readonly range: ComputedRef<ViewRange | null>;
  readonly canUndo: Readonly<ShallowRef<boolean>>;
  readonly canRedo: Readonly<ShallowRef<boolean>>;
  /** A source is fetching. */
  readonly loading: Readonly<ShallowRef<boolean>>;
  /** What the last load of events or delivery of a source reported. */
  readonly problems: Readonly<ShallowRef<NormalizationReport | null>>;
  dispatch(cmd: Command, opts?: { readonly validate?: boolean }): CommandResult;
  undo(): boolean;
  redo(): boolean;
  prev(): void;
  next(): void;
  today(): void;
  goTo(date: PlainDate): void;
  changeView(view: string): void;
  refetch(sourceId?: string): void;
  /**
   * "Open" and "New event here" handed to someone else while it is active
   * (the Pro's editor): they win over the calendar's own `@event-open` and
   * `@create-request`. Returns how to give them back.
   */
  takeOver(handlers: TakenOver): () => void;
}

/** What a `takeOver` hands over. */
export interface TakenOver {
  readonly onEventOpen?: (instance: EventInstance) => void;
  readonly onCreateRequest?: (request: CreateRequest) => void;
}

/** @internal What `<DzCalendar>` writes. */
export interface ControllerWrites {
  attach(c: CalendarInstance): void;
  detach(c: CalendarInstance): void;
  read(): void;
  setLoading(b: boolean): void;
  setProblems(p: NormalizationReport | null): void;
  /** What was taken over (`takeOver`), and how `<DzCalendar>` offers again when it changes. */
  taken(): TakenOver | null;
  onReoffer(fn: (() => void) | null): void;
}

const WRITES = new WeakMap<CalendarController, ControllerWrites>();
/** @internal */
export const writesOf = (c: CalendarController): ControllerWrites => WRITES.get(c)!;

export const CALENDAR_CONTROLLER: InjectionKey<CalendarController> = Symbol('dzcalendar.controller');

export function createCalendarController(): CalendarController {
  const instance = shallowRef<CalendarInstance | null>(null);
  const state = shallowRef<KernelState | null>(null);
  const canUndo = shallowRef(false);
  const canRedo = shallowRef(false);
  const loading = shallowRef(false);
  const problems = shallowRef<NormalizationReport | null>(null);
  const read = () => {
    const c = instance.value;
    if (!c) return;
    state.value = c.kernel.getState();
    canUndo.value = c.kernel.history.canUndo;
    canRedo.value = c.kernel.history.canRedo;
  };
  /** Calls the calendar, then reads what can be undone at once; before mounting, nothing (and `fallback`). */
  const call = <T>(fn: (c: CalendarInstance) => T, fallback: T): T => {
    const c = instance.value;
    if (!c) return fallback;
    const r = fn(c);
    read();
    return r;
  };
  let taken: TakenOver | null = null;
  let reoffer: (() => void) | null = null;
  const controller: CalendarController = {
    instance,
    state,
    title: computed(() => state.value?.title ?? ''),
    view: computed(() => state.value?.view.type ?? null),
    date: computed(() => state.value?.date ?? null),
    range: computed(() => state.value?.range ?? null),
    canUndo,
    canRedo,
    loading,
    problems,
    dispatch: (cmd, opts) => call((c) => c.run(cmd, opts), { ok: false, problems: [{ code: 'invalid-option', severity: 'error', path: 'calendar', detail: 'not-mounted' }] }),
    undo: () => call((c) => c.undo(), false),
    redo: () => call((c) => c.redo(), false),
    prev: () => call((c) => c.navigate('prev'), undefined),
    next: () => call((c) => c.navigate('next'), undefined),
    today: () => call((c) => c.navigate('today'), undefined),
    goTo: (date) => call((c) => c.update({ date }), undefined),
    changeView: (view) => call((c) => c.update({ view }), undefined),
    refetch: (sourceId) => call((c) => c.refetch(sourceId), undefined),
    takeOver(handlers) {
      taken = handlers;
      reoffer?.();
      return () => {
        if (taken !== handlers) return;
        taken = null;
        reoffer?.();
      };
    },
  };
  WRITES.set(controller, {
    attach(c) {
      instance.value = c;
      read();
    },
    detach(c) {
      if (instance.value !== c) return;
      instance.value = null;
      state.value = null;
      canUndo.value = canRedo.value = loading.value = false;
      problems.value = null;
    },
    read,
    setLoading: (b) => void (loading.value = b),
    setProblems: (p) => void (problems.value = p),
    taken: () => taken,
    onReoffer: (fn) => void (reoffer = fn),
  });
  return controller;
}

/** In a component inside a `<DzCalendar>` (an event's content): that calendar's controller; null outside one. */
export function injectCalendarController(): CalendarController | null {
  return inject(CALENDAR_CONTROLLER, null);
}
