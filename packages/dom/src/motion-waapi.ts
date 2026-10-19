import type { MotionAdapter } from './motion.js';

/**
 * The light motion the calendar has without an animation library (owner's
 * decision): the period slides in its direction, new events fade in, a menu
 * or a panel opens. Web Animations only (on the compositor: transform and
 * opacity), nothing under `prefers-reduced-motion`, nothing where
 * `Element.animate` is missing.
 */
export function createWaapiMotion(): MotionAdapter {
  const off = (el: Element) => {
    const win = el.ownerDocument.defaultView;
    return typeof (el as HTMLElement).animate !== 'function' || !win?.matchMedia || win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  const ease = 'cubic-bezier(0.2, 0, 0, 1)';
  return {
    viewChange(body, dir) {
      if (off(body)) return;
      // "Next" comes from the end side: the right, or the left right to left.
      const rtl = body.ownerDocument.defaultView?.getComputedStyle(body).direction === 'rtl';
      const sign = (dir === 'next' ? 1 : dir === 'prev' ? -1 : 0) * (rtl ? -1 : 1);
      const x = `${3 * sign}%`;
      body.animate([{ transform: `translateX(${x})`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: ease });
    },
    eventsEnter(nodes) {
      if (nodes.length === 0 || off(nodes[0]!)) return;
      // A few dozen: past them (a month in a big calendar), no animation per node.
      if (nodes.length > 60) return;
      nodes.forEach((n, i) => n.animate([{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 200, delay: Math.min(i, 20) * 12, easing: ease, fill: 'backwards' }));
    },
    overlayOpen(el) {
      if (off(el)) return;
      el.animate([{ opacity: 0, transform: 'translateY(-4px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 140, easing: ease });
    },
  };
}

/** The calendar's motion when none is given. */
export const WAAPI_MOTION: MotionAdapter = createWaapiMotion();
