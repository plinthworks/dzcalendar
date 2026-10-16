import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import type { MotionAdapter } from '@dzcalendar/dom';

gsap.registerPlugin(Flip);

export interface GsapMotionOptions {
  /** Seconds for a view change. Default 0.28. */
  readonly viewDuration?: number;
  /** How far the dates slide, as a percentage of the body's width. Default 4. */
  readonly slide?: number;
  /** Seconds for an event appearing. Default 0.22. */
  readonly enterDuration?: number;
  /** Seconds for a dropped event landing and the others making room. Default 0.3. */
  readonly dropDuration?: number;
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
  const dropDuration = o.dropDuration ?? 0.3;

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

    dragStart(ghosts) {
      if (reduce || ghosts.length === 0) return;
      // Picked up: a little larger, a deeper shadow — the ghost follows the pointer by its own position, untouched here.
      gsap.fromTo(ghosts, { scale: 0.97, autoAlpha: 0.6 }, { scale: 1.02, autoAlpha: 1, duration: 0.16, ease: 'back.out(2)', overwrite: 'auto' });
    },

    dropRejected(ghosts, to) {
      if (reduce || ghosts.length === 0) return Promise.resolve();
      const first = ghosts[0]!.getBoundingClientRect();
      const tl = gsap.timeline();
      // A short "no", then back where the event still is, fading.
      tl.to(ghosts, { x: '+=6', duration: 0.05, ease: 'power1.inOut', yoyo: true, repeat: 3 });
      tl.to(ghosts, {
        x: to ? to.left - first.left : 0,
        y: to ? to.top - first.top : 0,
        scale: 1,
        autoAlpha: 0,
        duration: 0.28,
        ease: 'power2.in',
      });
      return new Promise<void>((resolve) => {
        tl.eventCallback('onComplete', () => resolve());
      });
    },

    captureLayout(nodes) {
      if (reduce || nodes.length === 0) return undefined;
      return Flip.getState(nodes as HTMLElement[]);
    },

    animateLayout(state) {
      if (reduce || !state) return;
      // The same nodes (the calendar keeps them by key), now at their new places: slide from the old ones.
      Flip.from(state as Flip.FlipState, { duration: dropDuration, ease: 'power2.inOut', simple: true, prune: true });
    },

    dropSettle(node, from) {
      if (reduce) return;
      const to = node.getBoundingClientRect();
      if (to.width === 0 || to.height === 0) return;
      gsap.fromTo(
        node,
        // Visible from the first frame: a node the redraw just created may still be in its entrance tween (killed by overwrite).
        { x: from.left - to.left, y: from.top - to.top, scaleX: from.width / to.width, scaleY: from.height / to.height, transformOrigin: '0 0', autoAlpha: 1 },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, autoAlpha: 1, duration: dropDuration, ease: 'power3.out', overwrite: true, clearProps: 'transform,transformOrigin,opacity,visibility' },
      );
    },

    overlayOpen(el) {
      if (reduce) return;
      gsap.fromTo(el, { autoAlpha: 0, y: -4, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.14, ease: 'power2.out', overwrite: true, clearProps: 'transform,opacity,visibility' });
    },

    destroy() {
      mm.revert();
    },
  };
}
