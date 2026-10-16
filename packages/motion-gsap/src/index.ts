import { gsap } from 'gsap';
import type { MotionAdapter } from '@dzcalendar/dom';

export interface GsapMotionOptions {
  /** Seconds for a view change. Default 0.28. */
  readonly viewDuration?: number;
  /** How far the dates slide, as a percentage of the body's width. Default 4. */
  readonly slide?: number;
  /** Seconds for an event appearing. Default 0.22. */
  readonly enterDuration?: number;
}

/**
 * GSAP behind DzCalendar's motion hooks. Not a dependency of the calendar:
 * pass `motion: createGsapMotion()` to opt in.
 *
 * Only transforms and opacity move (no layout properties), and `clearProps`
 * hands every element back to its CSS when the tween ends — the calendar's
 * positions are custom properties the CSS reads, never touched here. Under
 * `prefers-reduced-motion: reduce`, nothing moves at all; `gsap.matchMedia`
 * follows the setting if it changes while the page is open.
 */
export function createGsapMotion(o: GsapMotionOptions = {}): MotionAdapter {
  const viewDuration = o.viewDuration ?? 0.28;
  const slide = o.slide ?? 4;
  const enterDuration = o.enterDuration ?? 0.22;

  let reduce = false;
  const mm = gsap.matchMedia();
  mm.add({ reduce: '(prefers-reduced-motion: reduce)', full: '(prefers-reduced-motion: no-preference)' }, (context) => {
    reduce = Boolean(context.conditions?.['reduce']);
  });

  return {
    viewChange(body, dir) {
      if (reduce) return;
      const from = dir === 'next' ? slide : dir === 'prev' ? -slide : 0;
      gsap.fromTo(
        body,
        { xPercent: from, autoAlpha: 0.35 },
        { xPercent: 0, autoAlpha: 1, duration: viewDuration, ease: 'power2.out', overwrite: true, clearProps: 'transform,opacity,visibility' },
      );
    },

    eventsEnter(nodes) {
      if (reduce || nodes.length === 0) return;
      gsap.fromTo(
        nodes,
        { scale: 0.96, autoAlpha: 0 },
        {
          scale: 1,
          autoAlpha: 1,
          duration: enterDuration,
          ease: 'power1.out',
          stagger: { each: 0.015, from: 'start' },
          overwrite: 'auto',
          clearProps: 'transform,opacity,visibility',
        },
      );
    },

    destroy() {
      mm.revert();
    },
  };
}
