/**
 * Where motion plugs in. The DOM never depends on an animation library: it
 * calls these hooks, and an adapter (`@dzcalendar/motion-gsap`, or your own)
 * decides what moves. Without one, nothing animates beyond CSS transitions.
 * Adapters must honour `prefers-reduced-motion`.
 */
export interface MotionAdapter {
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
