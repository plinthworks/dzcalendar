import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import type { MotionAdapter, MotionChange } from '@dzcalendar/dom';
import { PRESETS } from './presets.js';
import type { MotionPreset, PresetName } from './presets.js';

gsap.registerPlugin(Flip);

export { SOBER, EXPRESSIVE, PRESETS } from './presets.js';
export type { MotionPreset, PresetName } from './presets.js';

/** The effects, each on by default; `false` turns one off. */
export interface MotionEffects {
  /** A zone change: every event glides to its new time (the instant stays, the clock changes). */
  readonly zone?: boolean;
  /** The repeated hour of a 25-hour day unfolds, a 23-hour day's skipped hour folds in, as the day comes into view. */
  readonly dst?: boolean;
  /** The "now" line glides to its next minute and pulses. */
  readonly now?: boolean;
  /** A grid of day cells (a month, a year's month) → one day: that day's cell opens into the day, its events settling in. */
  readonly morph?: boolean;
  /** The title's changed words roll like an odometer. */
  readonly odometer?: boolean;
  /** "Today" far away: a quick run, then a soft stop. */
  readonly today?: boolean;
  /** Heads and body slide at different speeds. */
  readonly depth?: boolean;
}

export interface GsapMotionOptions extends Partial<MotionPreset> {
  /** "sober" (default) or "expressive"; any value here is laid over it. */
  readonly preset?: PresetName;
  readonly effects?: MotionEffects;
  /** @deprecated `view`. */
  readonly viewDuration?: number;
  /** @deprecated `enter`. */
  readonly enterDuration?: number;
  /** @deprecated `drop`. */
  readonly dropDuration?: number;
}

const EVENTS = '.dz-ev, .dz-bar, .dz-tl__ev';
const HEADS = '.dz-tg__heads, .dz-dg__head, .dz-tl__head, .dz-list__head';
const CLEAR = 'transform,transformOrigin,opacity,visibility';

/** An event node's occurrence: its segment key up to the first "|" (the instance), and which piece of it. */
function occurrenceKeys(root: ParentNode): Map<string, DOMRect> {
  const seen = new Map<string, number>();
  const out = new Map<string, DOMRect>();
  for (const n of root.querySelectorAll<HTMLElement>(EVENTS)) {
    const inst = (n.dataset['key'] ?? n.dataset['eventId'] ?? '').split('|')[0]!;
    if (!inst) continue;
    const i = seen.get(inst) ?? 0;
    seen.set(inst, i + 1);
    const r = n.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.set(`${inst}#${i}`, r);
  }
  return out;
}

function nodesByKey(root: ParentNode): Map<string, HTMLElement> {
  const seen = new Map<string, number>();
  const out = new Map<string, HTMLElement>();
  for (const n of root.querySelectorAll<HTMLElement>(EVENTS)) {
    const inst = (n.dataset['key'] ?? n.dataset['eventId'] ?? '').split('|')[0]!;
    if (!inst) continue;
    const i = seen.get(inst) ?? 0;
    seen.set(inst, i + 1);
    out.set(`${inst}#${i}`, n);
  }
  return out;
}

/** Plays a node from where a rectangle was to where it is now, measured beforehand (FLIP by hand: the nodes may be new). */
function fromRect(node: HTMLElement, was: DOMRect, now: DOMRect, vars: gsap.TweenVars): gsap.core.Tween | null {
  if (now.width === 0 || now.height === 0) return null;
  return gsap.fromTo(
    node,
    { x: was.left - now.left, y: was.top - now.top, scaleX: was.width / now.width, scaleY: was.height / now.height, transformOrigin: '0 0' },
    { x: 0, y: 0, scaleX: 1, scaleY: 1, overwrite: true, clearProps: CLEAR, ...vars },
  );
}

/** Moved by more than half a pixel, or resized. */
const moved = (a: DOMRect, b: DOMRect) => Math.abs(a.left - b.left) > 0.5 || Math.abs(a.top - b.top) > 0.5 || Math.abs(a.width - b.width) > 0.5 || Math.abs(a.height - b.height) > 0.5;

/** At most this many nodes glide (a busy month): the others simply are where they are. */
const MAX_GLIDE = 150;

interface Before {
  /** The events' places before a zone change or a morph. */
  readonly places?: Map<string, DOMRect>;
  /** Month → day: the cell of the day opening. */
  readonly cell?: DOMRect;
}

/**
 * GSAP behind DzCalendar's motion hooks. Not a dependency of the calendar:
 * pass `motion: createGsapMotion()` to opt in (`{ preset: 'expressive' }`
 * for springs).
 *
 * Only transforms and opacity move (no layout properties), and `clearProps`
 * hands every element back to its CSS when the tween ends — the calendar's
 * positions are custom properties the CSS reads, never touched here. Under
 * `prefers-reduced-motion: reduce`, nothing moves at all; `gsap.matchMedia`
 * follows the setting if it changes while the page is open.
 */
export function createGsapMotion(o: GsapMotionOptions = {}): MotionAdapter {
  const p: MotionPreset = {
    ...PRESETS[o.preset ?? 'sober'],
    ...Object.fromEntries(Object.entries(o).filter(([k, v]) => k in PRESETS.sober && v !== undefined)),
    ...(o.viewDuration !== undefined && o.view === undefined && { view: o.viewDuration }),
    ...(o.enterDuration !== undefined && o.enter === undefined && { enter: o.enterDuration }),
    ...(o.dropDuration !== undefined && o.drop === undefined && { drop: o.dropDuration }),
  };
  const on = (k: keyof MotionEffects) => o.effects?.[k] !== false;

  // The setting followed live, from the first hook on (not at creation: an adapter made at a module's top,
  // or on a server, reads no media yet), and again after a destroy (one adapter may serve calendar after calendar).
  let reduce = true;
  let mm: gsap.MatchMedia | null = null;
  const watching = (): boolean => {
    if (!mm) {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
      mm = gsap.matchMedia();
      mm.add({ reduce: '(prefers-reduced-motion: reduce)', full: '(prefers-reduced-motion: no-preference)' }, (context) => {
        reduce = Boolean(context.conditions?.['reduce']);
      });
    }
    return !reduce;
  };
  /** The last calendar root seen: what a destroy stops the tweens of. */
  let lastRoot: HTMLElement | null = null;
  /** The odometer rolling now: one at a time (a second one finishes the first at once). */
  let rolling: gsap.core.Timeline | null = null;
  /** Where each "now" line was a minute ago. */
  const nowWas = new WeakMap<HTMLElement, number>();

  /** A period sliding in its direction ("next" from the end side: the left, right to left), the heads less than the body (depth). */
  function slide(body: HTMLElement, root: ParentNode | null, dir: 'prev' | 'next' | 'other', far = false): void {
    const amount = far ? p.slide * 5 : p.slide;
    const rtl = body.ownerDocument.defaultView?.getComputedStyle(body).direction === 'rtl';
    const from = (dir === 'next' ? amount : dir === 'prev' ? -amount : 0) * (rtl ? -1 : 1);
    gsap.fromTo(body, { xPercent: from, opacity: far ? 0 : 0.35 }, { xPercent: 0, opacity: 1, duration: far ? p.view * 1.5 : p.view, ease: far ? 'expo.out' : p.ease, overwrite: true, clearProps: CLEAR });
    if (!on('depth') || !root || from === 0) return;
    // The heads travel half the body's way: inside the sliding body, held back by half; outside it, moved by half.
    for (const h of root.querySelectorAll<HTMLElement>(HEADS)) {
      if (h === body) continue;
      const x = body.contains(h) ? -from * 0.5 : from * 0.5;
      gsap.fromTo(h, { xPercent: x }, { xPercent: 0, duration: p.view * 1.1, ease: p.ease, overwrite: 'auto', clearProps: CLEAR });
    }
  }

  /** The repeated or skipped hours in view: unfold (a 25-hour day) or fold in (a 23-hour day); the day's "25 h" note pops. */
  function dst(body: HTMLElement, delay: number): void {
    if (!on('dst')) return;
    const notes = [...(body.closest('.dz-cal') ?? body).querySelectorAll<HTMLElement>('.dz-tg__dayhead-note')];
    if (notes.length > 0) gsap.fromTo(notes, { scale: 0.4, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: p.dst, delay, ease: p.pop, overwrite: 'auto', clearProps: CLEAR });
    const repeat = [...body.querySelectorAll<HTMLElement>('.dz-band--repeat')];
    const gap = [...body.querySelectorAll<HTMLElement>('.dz-band--gap')];
    if (repeat.length > 0) gsap.fromTo(repeat, { scaleY: 0, transformOrigin: '50% 0%', opacity: 0.2 }, { scaleY: 1, opacity: 1, duration: p.dst, delay, ease: p.settle, stagger: 0.04, overwrite: 'auto', clearProps: CLEAR });
    if (gap.length > 0) gsap.fromTo(gap, { scaleY: 2.4, transformOrigin: '50% 50%', opacity: 0 }, { scaleY: 1, opacity: 1, duration: p.dst, delay, ease: p.move, stagger: 0.04, overwrite: 'auto', clearProps: CLEAR });
  }

  return {
    beforeChange(change: MotionChange): Before | undefined {
      if (!watching()) return undefined;
      const { root, causes, from, to } = change;
      lastRoot = root;
      // A zone change, and only that (the same view and dates): the same events, other clocks — where each is now.
      if (on('zone') && causes.includes('zone') && from.view === to.view && from.date.equals(to.date)) return { places: occurrenceKeys(root) };
      // A grid of days → a single day: that day's cell opens into it.
      if (on('morph') && causes.includes('view') && to.days === 1 && from.days > 1) {
        const cell = root.querySelector<HTMLElement>(`.dz-dg__cell[data-date="${to.date.toString()}"]`);
        const r = cell?.getBoundingClientRect();
        // On screen only (a year's month scrolled away has its cells out of sight: then a plain slide).
        const box = root.getBoundingClientRect();
        if (r && r.width > 0 && r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right) return { cell: r };
      }
      return undefined;
    },

    afterChange(state, change, body) {
      if (!watching()) return false;
      const before = state as Before | undefined;
      const { causes, from, to, root } = change;
      if (before?.places && causes.includes('zone')) {
        // Each event from its old place to its new one: the instant stays, its hour on the wall changes.
        // All the places read first (one layout), then the tweens written; what did not move is left alone.
        const now = nodesByKey(root);
        // A glide still running (two zone changes in a row): ended first, so the new places are read without it.
        const nodes = [...now.values()];
        gsap.killTweensOf(nodes);
        gsap.set(nodes, { clearProps: CLEAR });
        const fresh: HTMLElement[] = [];
        const moves: [HTMLElement, DOMRect, DOMRect][] = [];
        for (const [k, node] of now) {
          const was = before.places.get(k);
          if (!was) fresh.push(node);
          else {
            const at = node.getBoundingClientRect();
            if (moved(was, at) && moves.length < MAX_GLIDE) moves.push([node, was, at]);
          }
        }
        moves.forEach(([node, was, at], i) => fromRect(node, was, at, { duration: p.zone, ease: p.move, delay: Math.min(i, 30) * p.stagger }));
        if (fresh.length > 0) gsap.fromTo(fresh, { opacity: 0 }, { opacity: 1, duration: p.enter, delay: p.zone * 0.5, overwrite: 'auto', clearProps: CLEAR });
        dst(body, p.zone * 0.6);
        return true;
      }
      if (before?.cell) {
        // The day opens out of its cell; its events come from where they were drawn in it.
        const b = body.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) {
          gsap.fromTo(
            body,
            { x: before.cell.left - b.left, y: before.cell.top - b.top, scaleX: before.cell.width / b.width, scaleY: before.cell.height / b.height, transformOrigin: '0 0', opacity: 0.3 },
            { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, duration: p.morph, ease: p.move, overwrite: true, clearProps: CLEAR },
          );
          // Its events settle in as the day opens.
          const events = [...body.querySelectorAll<HTMLElement>(EVENTS)];
          if (events.length > 0) gsap.fromTo(events, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: p.enter, delay: p.morph * 0.55, ease: p.pop, stagger: p.stagger * 2, overwrite: 'auto', clearProps: CLEAR });
          dst(body, p.morph * 0.8);
          return true;
        }
      }
      if (causes.includes('navigate') && change.direction) {
        // A jump far away ("today" from another month): a quick run that way, then a soft stop.
        const dir = change.direction !== 'other' ? change.direction : change.days === 0 ? 'other' : change.days > 0 ? 'next' : 'prev';
        const far = on('today') && change.direction === 'other' && Math.abs(change.days) > 45;
        slide(body, root, dir, far);
        dst(body, p.view * 0.7);
        return true;
      }
      return false;
    },

    viewChange(body, dir) {
      if (!watching()) return;
      slide(body, body.closest('.dz-cal'), dir);
      dst(body, p.view * 0.7);
    },

    titleChange(title, from, to, change) {
      // Dates and views roll; a new locale or zone simply says its words.
      if (!watching() || !on('odometer') || !title.parentElement || !(change.causes.includes('navigate') || change.causes.includes('view'))) return;
      rolling?.progress(1);
      // The real title already says the new words (and is announced): it is only hidden under a copy that rolls.
      const a = from.split(/(\s+)/);
      const b = to.split(/(\s+)/);
      const doc = title.ownerDocument;
      const roll = doc.createElement('span');
      roll.setAttribute('aria-hidden', 'true');
      roll.dataset['dzRoll'] = '';
      const cs = doc.defaultView!.getComputedStyle(title);
      Object.assign(roll.style, { position: 'absolute', width: `${title.offsetWidth}px`, height: `${title.offsetHeight}px`, font: cs.font, lineHeight: cs.lineHeight, color: cs.color, letterSpacing: cs.letterSpacing, whiteSpace: 'pre', pointerEvents: 'none', display: 'block', textAlign: cs.textAlign, direction: cs.direction, padding: cs.padding, boxSizing: 'border-box', margin: '0' });
      const down = change.direction === 'prev' || (change.direction === 'other' && change.days < 0);
      const outs: HTMLElement[] = [];
      const ins: HTMLElement[] = [];
      // A window one line high, as wide as the new word (so the copy is laid out as the title is); the old word over it, leaving.
      const pane = (old: string, word: string) => {
        const box = doc.createElement('span');
        Object.assign(box.style, { display: 'inline-block', position: 'relative', overflowX: 'visible', overflowY: 'clip', verticalAlign: 'baseline' });
        const now = doc.createElement('span');
        now.textContent = word;
        now.style.display = 'inline-block';
        const was = doc.createElement('span');
        was.textContent = old;
        Object.assign(was.style, { position: 'absolute', top: '0', insetInlineStart: '0', whiteSpace: 'pre' });
        box.append(now, was);
        roll.append(box);
        outs.push(was);
        ins.push(now);
      };
      if (a.length !== b.length) {
        // Other words, not the same ones changed ("19–25 oct." → "26 oct. – 1 nov."): the title rolls whole.
        pane(from, to);
      } else {
        b.forEach((word, i) => {
          if (a[i] === word || /^\s+$/.test(word)) roll.append(doc.createTextNode(word));
          else pane(a[i] ?? '', word);
        });
      }
      if (ins.length === 0) return;
      const parent = title.parentElement;
      // Positioned for the copy while it rolls, then as it was.
      const placed = doc.defaultView!.getComputedStyle(parent).position === 'static';
      if (placed) parent.style.position = 'relative';
      // Over the title, wherever its parent puts it (measured, not offsetLeft: the offset parent may be another).
      const t = title.getBoundingClientRect();
      const q = parent.getBoundingClientRect();
      Object.assign(roll.style, { left: `${t.left - q.left - parent.clientLeft + parent.scrollLeft}px`, top: `${t.top - q.top - parent.clientTop + parent.scrollTop}px` });
      parent.append(roll);
      gsap.set(title, { opacity: 0 });
      const tl = gsap.timeline({
        onComplete: () => {
          roll.remove();
          if (placed) parent.style.position = '';
          gsap.set(title, { clearProps: 'opacity' });
          if (rolling === tl) rolling = null;
        },
      });
      rolling = tl;
      tl.fromTo(outs, { yPercent: 0, opacity: 1 }, { yPercent: down ? 100 : -100, opacity: 0, duration: p.odometer, ease: p.move, stagger: 0.04 }, 0);
      tl.fromTo(ins, { yPercent: down ? -100 : 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: p.odometer, ease: p.settle, stagger: 0.04 }, 0);
    },

    nowTick(nodes) {
      if (!watching() || !on('now')) return;
      for (const n of nodes) {
        // Its place in its column (not on the screen: a scroll between two minutes is not a move).
        const top = n.offsetTop;
        const was = nowWas.get(n);
        nowWas.set(n, top);
        // From last minute's place to this one (a glide, not a jump), then a pulse.
        if (was !== undefined && Math.abs(was - top) < 200) gsap.fromTo(n, { y: was - top }, { y: 0, duration: 0.9, ease: 'power1.inOut', overwrite: 'auto', clearProps: 'transform' });
        gsap.fromTo(n, { opacity: 0.45 }, { opacity: 1, duration: 0.6, ease: p.ease, overwrite: false, clearProps: 'opacity,visibility' });
      }
    },

    eventsEnter(nodes) {
      if (!watching() || nodes.length === 0 || nodes.length > MAX_GLIDE) return;
      // A wave: top to bottom, then column after column.
      const order = [...nodes].sort((x, y) => {
        const a = x.getBoundingClientRect();
        const b = y.getBoundingClientRect();
        return Math.round(a.left / 40) - Math.round(b.left / 40) || a.top - b.top;
      });
      gsap.fromTo(order, { scale: 0.96, opacity: 0 }, { scale: 1, opacity: 1, duration: p.enter, ease: p.pop, stagger: { each: p.stagger, from: 'start' }, overwrite: 'auto', clearProps: CLEAR });
    },

    dragStart(ghosts) {
      if (!watching() || ghosts.length === 0) return;
      // Picked up: a little larger, a deeper shadow — the ghost follows the pointer by its own position, untouched here.
      gsap.fromTo(ghosts, { scale: 0.97, opacity: 0.6 }, { scale: 1.02, opacity: 1, duration: 0.16, ease: 'back.out(2)', overwrite: 'auto' });
    },

    dropRejected(ghosts, to) {
      if (!watching() || ghosts.length === 0) return Promise.resolve();
      const first = ghosts[0]!.getBoundingClientRect();
      const tl = gsap.timeline();
      // A short "no", then back where the event still is, fading.
      tl.to(ghosts, { x: '+=6', duration: 0.05, ease: 'power1.inOut', yoyo: true, repeat: 3 });
      tl.to(ghosts, { x: to ? to.left - first.left : 0, y: to ? to.top - first.top : 0, scale: 1, opacity: 0, duration: 0.28, ease: 'power2.in' });
      return new Promise<void>((resolve) => {
        tl.eventCallback('onComplete', () => resolve());
      });
    },

    captureLayout(nodes) {
      if (!watching() || nodes.length === 0) return undefined;
      return Flip.getState(nodes as HTMLElement[]);
    },

    animateLayout(state) {
      if (!watching() || !state) return;
      // The same nodes (the calendar keeps them by key), now at their new places: slide from the old ones.
      Flip.from(state as Flip.FlipState, { duration: p.drop, ease: p.move, simple: true, prune: true });
    },

    dropSettle(node, from) {
      if (!watching()) return;
      // Visible from the first frame: a node the redraw just created may still be in its entrance tween (killed by overwrite).
      fromRect(node, from, node.getBoundingClientRect(), { duration: p.drop, ease: p.settle, opacity: 1 });
    },

    overlayOpen(el) {
      if (!watching()) return;
      gsap.fromTo(el, { opacity: 0, y: -4, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.14, ease: p.pop, overwrite: true, clearProps: CLEAR });
    },

    destroy() {
      // Finished, not left running on nodes that are gone; the media watched again by the next calendar.
      rolling?.progress(1);
      // Finished (their clearProps run), not killed: a killed tween leaves its inline transform and opacity behind.
      if (lastRoot) for (const t of gsap.getTweensOf(lastRoot.querySelectorAll('*'))) t.progress(1).kill();
      lastRoot = null;
      mm?.revert();
      mm = null;
      reduce = true;
    },
  };
}
