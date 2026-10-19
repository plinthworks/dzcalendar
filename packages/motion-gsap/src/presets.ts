/** How the motion feels (owner's decision: two presets, "sober" by default, every value adjustable). */
export interface MotionPreset {
  /** Seconds. */
  readonly view: number;
  readonly enter: number;
  readonly drop: number;
  /** A zone change: events gliding to their new times. */
  readonly zone: number;
  /** Month → day: the cell opening into the day. */
  readonly morph: number;
  /** The title's words rolling. */
  readonly odometer: number;
  /** The repeated hour unfolding. */
  readonly dst: number;
  /** Percent of the body's width a period slides. */
  readonly slide: number;
  /** Eases: things arriving, things moving from a place to another, things landing, things popping. */
  readonly ease: string;
  readonly move: string;
  readonly settle: string;
  readonly pop: string;
  /** Seconds between two items of a wave. */
  readonly stagger: number;
}

/** Soft curves, 200–350 ms, no bounce: a health app's calm. */
export const SOBER: MotionPreset = {
  view: 0.3,
  enter: 0.22,
  drop: 0.3,
  zone: 0.5,
  morph: 0.42,
  odometer: 0.32,
  dst: 0.45,
  slide: 4,
  ease: 'power2.out',
  move: 'power2.inOut',
  settle: 'power3.out',
  pop: 'power2.out',
  stagger: 0.012,
};

/** Springs, a little squash, bounces: alive. */
export const EXPRESSIVE: MotionPreset = {
  view: 0.42,
  enter: 0.34,
  drop: 0.45,
  zone: 0.7,
  morph: 0.55,
  odometer: 0.45,
  dst: 0.6,
  slide: 7,
  ease: 'back.out(1.4)',
  move: 'power3.inOut',
  settle: 'elastic.out(1, 0.6)',
  pop: 'back.out(2.2)',
  stagger: 0.022,
};

export const PRESETS = { sober: SOBER, expressive: EXPRESSIVE } as const;
export type PresetName = keyof typeof PRESETS;
