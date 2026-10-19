import type { PlainDate, StateCause, ZoneId } from '@dzcalendar/core';

/** What made event nodes appear or go. */
export interface MotionEnter {
  readonly cause: 'command' | 'undo' | 'redo';
  /** The selection the new event was made from (on screen), when there was one. */
  readonly from?: DOMRect;
}

/** One side of a change. */
export interface MotionSide {
  readonly view: string;
  readonly family: string;
  readonly date: PlainDate;
  readonly zone: ZoneId;
  readonly title: string;
  /** The days the view shows (1 for a day view). */
  readonly days: number;
}

/**
 * A change of what the calendar shows — dates, view, zone, locale — as an
 * adapter sees it: what it was, what it becomes. `beforeChange` is called
 * with the old screen still drawn, `afterChange` with the new one. Every
 * state change comes through (`options` and `resources` too, after a
 * measure): an adapter picks by `causes`.
 */
export interface MotionChange {
  readonly causes: readonly StateCause[];
  /** Which way the dates moved, when they moved ("other": a jump, today). */
  readonly direction?: 'prev' | 'next' | 'other';
  readonly from: MotionSide;
  readonly to: MotionSide;
  /** Days from `from.date` to `to.date` (signed: a jump back is negative). */
  readonly days: number;
  /** The calendar's root (`.dz-cal`). */
  readonly root: HTMLElement;
  /** Right to left. */
  readonly rtl: boolean;
}

/**
 * Where motion plugs in. The DOM never depends on an animation library: it
 * calls these hooks, and an adapter (`@dzcalendar/motion-gsap`, or your own)
 * decides what moves. Without one, the light WAAPI base (`WAAPI_MOTION`):
 * the period slides, events and menus fade in. `NO_MOTION`: nothing.
 * Adapters must honour `prefers-reduced-motion`.
 */
export interface MotionAdapter {
  /**
   * Before a change redraws (the old screen still there): what the adapter
   * needs of it (places, a cell). Returned to `afterChange`.
   */
  beforeChange?(change: MotionChange): unknown;
  /**
   * After the redraw: `true` when the adapter animated the change itself
   * (then `viewChange` and `eventsEnter` are not called for it).
   */
  afterChange?(state: unknown, change: MotionChange, body: HTMLElement): boolean | void;
  /** The title's words changed (the element already says the new ones: animate its look only, never its text). */
  titleChange?(title: HTMLElement, from: string, to: string, change: MotionChange): void;
  /** The "now" line just moved (once a minute). */
  nowTick?(nodes: readonly HTMLElement[]): void;
  /** The body after navigating: `dir` says which way the dates moved. */
  viewChange?(body: HTMLElement, dir: 'prev' | 'next' | 'other'): void;
  /**
   * Event nodes that just appeared (not on the first paint). `info.cause`:
   * what made them (`undo` brings back what was deleted); `info.from`: the
   * selection they were made from, on screen when they were.
   */
  eventsEnter?(nodes: readonly HTMLElement[], info?: MotionEnter): void;
  /**
   * Event nodes a person's change took away (a delete, an undo): copies of
   * them as they were, where they were (in a `.dz-leave` layer, marked
   * `aria-hidden`, without ids: `data-dz-gone` says whose). The adapter
   * animates them; the calendar removes them when the returned promise
   * settles, or after 2 s. Without this hook (or with `wantsLeave()` false)
   * no copy is made.
   */
  eventsLeave?(copies: readonly HTMLElement[], info: MotionEnter): Promise<void> | void;
  /** False when `eventsLeave` would do nothing now (reduced motion, the effect off): nothing is captured. */
  wantsLeave?(): boolean;
  /** The seats left of a bookable slot changed (its text already says the new count). */
  seatsChange?(nodes: readonly HTMLElement[]): void;
  /**
   * A view scrolls to a place after a change (back to today: to now). The
   * element is still where it was; `true` when the adapter moves it there.
   */
  scroll?(el: HTMLElement, to: { readonly top: number; readonly left: number }): boolean;
  /**
   * A drag began: the ghosts that follow the pointer (lift them). The array
   * is the live one (ghosts come and go as the drag crosses weeks); their
   * place is in `--gx` / `--gy`. `kind`: a move or a resize.
   */
  dragStart?(ghosts: readonly HTMLElement[], kind?: 'move' | 'resize'): void;
  /** A drop the rules refused: take the ghosts back to `to` (the event's place), then the calendar removes them. */
  dropRejected?(ghosts: readonly HTMLElement[], to: DOMRect | null): Promise<void>;
  /** Before a committed change redraws: the event nodes' places (FLIP: first). */
  captureLayout?(nodes: readonly HTMLElement[]): unknown;
  /** After the redraw: move the nodes from where they were (FLIP: last, invert, play). */
  animateLayout?(state: unknown): void;
  /** The event just dropped, now at its place: land it from where the ghost was. */
  dropSettle?(node: HTMLElement, from: DOMRect): void;
  /** A menu, a "+N" panel or a dialog opened; `origin`: what it was opened from (the clicked element, the pointer's point). */
  overlayOpen?(el: HTMLElement, origin?: DOMRect): void;
  /** A dialog closes back into `origin` (resolved when it may be removed). Menus and panels close at once. */
  overlayClose?(el: HTMLElement, origin?: DOMRect): Promise<void>;
  destroy?(): void;
}

export const NO_MOTION: MotionAdapter = {};
