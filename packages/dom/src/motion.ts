import type { PlainDate, StateCause, ZoneId } from '@dzcalendar/core';

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
  /** Event nodes that just appeared (not on the first paint). */
  eventsEnter?(nodes: readonly HTMLElement[]): void;
  /** A drag began: the ghosts that follow the pointer (lift them). */
  dragStart?(ghosts: readonly HTMLElement[]): void;
  /** A drop the rules refused: take the ghosts back to `to` (the event's place), then the calendar removes them. */
  dropRejected?(ghosts: readonly HTMLElement[], to: DOMRect | null): Promise<void>;
  /** Before a committed change redraws: the event nodes' places (FLIP: first). */
  captureLayout?(nodes: readonly HTMLElement[]): unknown;
  /** After the redraw: move the nodes from where they were (FLIP: last, invert, play). */
  animateLayout?(state: unknown): void;
  /** The event just dropped, now at its place: land it from where the ghost was. */
  dropSettle?(node: HTMLElement, from: DOMRect): void;
  /** A menu or a "+N" panel opened. */
  overlayOpen?(el: HTMLElement): void;
  destroy?(): void;
}

export const NO_MOTION: MotionAdapter = {};
