import { Injectable, computed, signal } from '@angular/core';
import type { Command, CommandResult, KernelState, NormalizationReport, PlainDate, ViewRange } from '@dzcalendar/core';
import type { CalendarInstance } from '@dzcalendar/dom';

/** What `dispatch` answers before the calendar is drawn: the refusal React's and Vue's controllers give. */
const NOT_ATTACHED: CommandResult = { ok: false, problems: [{ code: 'invalid-option', severity: 'error', path: 'calendar', detail: 'not-mounted' }] };

/**
 * The calendar as signals, for what sits around it: a header of one's own,
 * a side panel, a status line. Provided by each `<dz-calendar>`; a child
 * component or a template reference reaches it with `inject(CalendarController)`.
 */
@Injectable()
export class CalendarController {
  private readonly current = signal<CalendarInstance | null>(null);
  /** The DOM calendar, for what the signals do not cover. */
  readonly instance = this.current.asReadonly();
  readonly state = signal<KernelState | null>(null);
  readonly title = computed(() => this.state()?.title ?? '');
  readonly range = computed<ViewRange | null>(() => this.state()?.range ?? null);
  readonly view = computed(() => this.state()?.view.type ?? null);
  readonly date = computed<PlainDate | null>(() => this.state()?.date ?? null);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  /** A source is fetching. */
  readonly loading = signal(false);
  /** What the last load of events or delivery of a source reported. */
  readonly problems = signal<NormalizationReport | null>(null);

  /** Runs a call into the calendar outside Angular's zone (zone.js); a plain call zoneless. */
  private outside: <T>(fn: () => T) => T = (fn) => fn();

  /** @internal Called by `<dz-calendar>` once its DOM calendar exists. */
  attach(instance: CalendarInstance, outside?: <T>(fn: () => T) => T): void {
    this.current.set(instance);
    if (outside) this.outside = outside;
    this.read(instance);
  }

  /** @internal The calendar is destroyed: the controller no longer reaches it. */
  detach(): void {
    this.current.set(null);
  }

  /** @internal Reads the kernel again after one of its events. */
  read(instance: CalendarInstance): void {
    const k = instance.kernel;
    const s = k.getState();
    if (this.state() !== s) this.state.set(s);
    this.canUndo.set(k.history.canUndo);
    this.canRedo.set(k.history.canRedo);
  }

  /**
   * Calls the calendar outside the zone, then reads what can be undone at once (not a microtask later).
   * No calendar attached yet (or any more): `none`, as React's and Vue's controllers answer — nothing thrown.
   */
  private call<T>(fn: (c: CalendarInstance) => T, none: T): T {
    const c = this.current();
    if (!c) return none;
    const r = this.outside(() => fn(c));
    this.read(c);
    return r;
  }

  dispatch(cmd: Command, opts?: { readonly validate?: boolean }): CommandResult {
    return this.call((c) => c.run(cmd, opts), NOT_ATTACHED);
  }
  undo(): boolean {
    return this.call((c) => c.undo(), false);
  }
  redo(): boolean {
    return this.call((c) => c.redo(), false);
  }
  prev(): void {
    this.call((c) => c.navigate('prev'), undefined);
  }
  next(): void {
    this.call((c) => c.navigate('next'), undefined);
  }
  today(): void {
    this.call((c) => c.navigate('today'), undefined);
  }
  goTo(date: PlainDate): void {
    this.call((c) => c.update({ date }), undefined);
  }
  changeView(view: string): void {
    this.call((c) => c.update({ view }), undefined);
  }
  refetch(sourceId?: string): void {
    this.call((c) => c.refetch(sourceId), undefined);
  }
}
