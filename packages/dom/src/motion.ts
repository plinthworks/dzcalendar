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
  destroy?(): void;
}

export const NO_MOTION: MotionAdapter = {};
