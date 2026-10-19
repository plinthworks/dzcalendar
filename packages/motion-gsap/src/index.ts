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
  /** A dragged event leans with the gesture's speed and glides from slot to slot (magnetic). */
  readonly drag?: boolean;
  /** A deleted event dissolves; undone, it gathers back. */
  readonly leave?: boolean;
  /** A new event pours out of the selection it was made from; others arrive as a wave. */
  readonly enter?: boolean;
  /** Menus, "+N" panels and the editor open from what they were opened from (and the editor closes back into it). */
  readonly overlay?: boolean;
  /** A slot's seats left pop when they change. */
  readonly seats?: boolean;
  /** Scrolls after a change (back to today: to now) are eased. */
  readonly scroll?: boolean;
  /** A timeline's resource rows open and close as an accordion. */
  readonly rows?: boolean;
}

/**
 * GSAP plugins the application gives (owner's decision: nothing loaded
 * behind its back). Without one, its effect is done more simply.
 */
export interface MotionPlugins {
  /** A dropped event lands with the speed it was thrown with. */
  readonly InertiaPlugin?: object;
  /** Eased scrolls through the plugin (else the scroll properties are tweened directly). */
  readonly ScrollToPlugin?: object;
}

export interface GsapMotionOptions extends Partial<MotionPreset> {
  /** "sober" (default) or "expressive"; any value here is laid over it. */
  readonly preset?: PresetName;
  readonly effects?: MotionEffects;
  readonly plugins?: MotionPlugins;
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
function fromRect(node: HTMLElement, was: DOMRect, now: DOMRect, vars: gsap.TweenVars, start: gsap.TweenVars = {}): gsap.core.Tween | null {
  if (now.width === 0 || now.height === 0) return null;
  return gsap.fromTo(
    node,
    { x: was.left - now.left, y: was.top - now.top, scaleX: was.width / now.width, scaleY: was.height / now.height, transformOrigin: '0 0', ...start },
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
  /** A timeline's rows before they fold or unfold. */
  readonly rows?: Map<string, DOMRect>;
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
  const inertia = Boolean(o.plugins?.InertiaPlugin);
  const scrollTo = Boolean(o.plugins?.ScrollToPlugin);
  if (o.plugins?.InertiaPlugin) gsap.registerPlugin(o.plugins.InertiaPlugin as gsap.Plugin);
  if (o.plugins?.ScrollToPlugin) gsap.registerPlugin(o.plugins.ScrollToPlugin as gsap.Plugin);
  /** The dragged ghosts' speed (px/s), read each frame while they follow the pointer: what a drop lands with. */
  let speed = { x: 0, y: 0 };
  let following: (() => void) | null = null;
  /** Events just dissolved, per calendar, by id: an undo gathers them back (within a minute). */
  const gone = new WeakMap<HTMLElement, Map<string, number>>();
  const goneIn = (root: HTMLElement): Map<string, number> => {
    let m = gone.get(root);
    if (!m) gone.set(root, (m = new Map()));
    const old = Date.now() - 60_000;
    for (const [id, at] of m) if (at < old) m.delete(id);
    return m;
  };

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
      // A timeline's rows folding or unfolding (an option): where each row is now.
      if (on('rows') && causes.includes('options') && to.family === 'timeline' && from.view === to.view) {
        const rows = new Map<string, DOMRect>();
        for (const r of root.querySelectorAll<HTMLElement>('.dz-tl__row')) rows.set(r.dataset['key'] ?? r.dataset['resource'] ?? '', r.getBoundingClientRect());
        return { rows };
      }
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
      if (before?.rows) {
        // The rows that stay slide to their new places; the rows that open unroll from the top.
        const moves: [HTMLElement, DOMRect, DOMRect][] = [];
        const opened: HTMLElement[] = [];
        for (const r of root.querySelectorAll<HTMLElement>('.dz-tl__row')) {
          const was = before.rows.get(r.dataset['key'] ?? r.dataset['resource'] ?? '');
          const at = r.getBoundingClientRect();
          if (!was) opened.push(r);
          else if (moved(was, at) && moves.length < MAX_GLIDE) moves.push([r, was, at]);
        }
        // Only a fold or an unfold (rows come or go), not a measure that moved them all by a lane.
        const closed = [...before.rows.keys()].some((k) => !root.querySelector(`.dz-tl__row[data-key="${k.replace(/["\\]/g, '\\$&')}"]`));
        if (opened.length === 0 && !closed) return false;
        if (moves.length === 0 && opened.length === 0) return false;
        // One ease, together: what slides and what unrolls move as one accordion.
        for (const [r, was, at] of moves) gsap.fromTo(r, { y: was.top - at.top }, { y: 0, duration: p.view, ease: p.move, overwrite: true, clearProps: CLEAR });
        if (opened.length > 0 && opened.length <= MAX_GLIDE) gsap.fromTo(opened, { scaleY: 0, transformOrigin: '50% 0%', opacity: 0 }, { scaleY: 1, opacity: 1, duration: p.view, ease: p.move, overwrite: true, clearProps: CLEAR });
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

    eventsEnter(nodes, info) {
      if (!watching() || nodes.length === 0 || nodes.length > MAX_GLIDE) return;
      const root = nodes[0]!.closest<HTMLElement>('.dz-cal');
      if (root) lastRoot = root;
      if (on('leave') && root && info && (info.cause === 'undo' || info.cause === 'redo')) {
        // Undone: what had dissolved (in this calendar, a minute ago at most) gathers back — the reverse of leaving.
        const left = goneIn(root);
        const back = nodes.filter((n) => left.has(n.dataset['eventId'] ?? ''));
        if (back.length > 0) {
          for (const n of back) left.delete(n.dataset['eventId'] ?? '');
          gsap.fromTo(back, { opacity: 0, scale: 0.86, y: -6 }, { opacity: 1, scale: 1, y: 0, duration: p.leave * 1.2, ease: p.settle, stagger: p.stagger, overwrite: true, clearProps: CLEAR });
          return;
        }
      }
      if (on('enter') && info?.from && nodes.length <= 3) {
        // Made from a selection: it pours out of it, the selection's box becoming the event's.
        const from = info.from;
        const now = nodes.map((n) => n.getBoundingClientRect());
        nodes.forEach((n, i) => fromRect(n, from, now[i]!, { duration: p.morph, ease: p.settle, opacity: 1 }, { opacity: 0.55 }));
        return;
      }
      // A wave: top to bottom, then column after column (the places read once; the whole wave a third of a second at most).
      const at = new Map(nodes.map((n) => [n, n.getBoundingClientRect()] as const));
      const order = [...nodes].sort((x, y) => {
        const a = at.get(x)!;
        const b = at.get(y)!;
        return Math.round(a.left / 40) - Math.round(b.left / 40) || a.top - b.top;
      });
      gsap.fromTo(order, { scale: 0.96, opacity: 0 }, { scale: 1, opacity: 1, duration: p.enter, ease: p.pop, stagger: { amount: Math.min(0.35, p.stagger * order.length), from: 'start' }, overwrite: 'auto', clearProps: CLEAR });
    },

    dragStart(ghosts, kind) {
      if (!watching() || ghosts.length === 0) return;
      const root = ghosts[0]!.closest<HTMLElement>('.dz-cal');
      if (root) lastRoot = root;
      // Picked up: a little larger — the ghost follows the pointer by its own position (custom properties), untouched here.
      gsap.fromTo(ghosts, { scale: 0.97, opacity: 0.6 }, { scale: 1.02, opacity: 1, duration: 0.16, ease: 'back.out(2)', overwrite: 'auto' });
      // A resize stretches; only a move leans and glides.
      if (!on('drag') || kind === 'resize') return;
      following?.();
      // The place the pointer gives the lead ghost: its --gx / --gy (no layout read, no rotation in it, no scroll).
      const placeOf = (g: HTMLElement) => ({ x: parseFloat(g.style.getPropertyValue('--gx')) || 0, y: parseFloat(g.style.getPropertyValue('--gy')) || 0 });
      let lead: HTMLElement | null = ghosts[0]!;
      let last = placeOf(lead);
      let t = performance.now();
      let rotation = 0;
      let empty = 0;
      speed = { x: 0, y: 0 };
      const step = () => {
        // The live array: ghosts come and go as the drag crosses weeks or leaves the grid; the loop lives on.
        const g = ghosts[0] ?? null;
        if (!g) {
          if (++empty > 30) stop();
          return;
        }
        empty = 0;
        const at = placeOf(g);
        if (g !== lead) {
          lead = g;
          last = at;
        }
        const now = performance.now();
        const dt = Math.max(1, now - t) / 1000;
        const mx = at.x - last.x;
        const my = at.y - last.y;
        speed = { x: speed.x * 0.6 + (mx / dt) * 0.4, y: speed.y * 0.6 + (my / dt) * 0.4 };
        // Leaning with its speed, eased each frame towards it.
        rotation += (Math.max(-p.tilt, Math.min(p.tilt, speed.x / 120)) - rotation) * 0.2;
        gsap.set(ghosts, { rotation });
        // A jump to the next slot: glided from where it was seen (magnetic), not snapped.
        if (Math.abs(my) > 3 || Math.abs(mx) > 3) gsap.fromTo(ghosts, { x: -mx, y: -my }, { x: 0, y: 0, duration: 0.12, ease: 'power2.out', overwrite: 'auto' });
        last = at;
        t = now;
      };
      gsap.ticker.add(step);
      const stop = () => {
        gsap.ticker.remove(step);
        if (following === stop) following = null;
      };
      following = stop;
    },

    dropRejected(ghosts, to) {
      following?.();
      if (!watching() || ghosts.length === 0) return Promise.resolve();
      const first = ghosts[0]!.getBoundingClientRect();
      const tl = gsap.timeline();
      // A short "no", then back where the event still is (relative to where it is seen), upright, fading.
      tl.to(ghosts, { x: '+=6', duration: 0.05, ease: 'power1.inOut', yoyo: true, repeat: 3, overwrite: 'auto' });
      tl.to(ghosts, { x: to ? `+=${to.left - first.left}` : '+=0', y: to ? `+=${to.top - first.top}` : '+=0', rotation: 0, scale: 1, opacity: 0, duration: 0.28, ease: 'power2.in' });
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
      const thrown = speed;
      following?.();
      speed = { x: 0, y: 0 };
      if (!watching()) return;
      const at = node.getBoundingClientRect();
      if (inertia && on('drag') && at.width > 0 && Math.hypot(thrown.x, thrown.y) > 200) {
        // Thrown: it lands with the speed it was let go with (InertiaPlugin), slowing to its place.
        // Whole (an entrance it interrupts may have left it smaller) and upright.
        gsap.set(node, { x: from.left - at.left, y: from.top - at.top, opacity: 1, scale: 1, rotation: 0 });
        gsap.to(node, { inertia: { x: { velocity: thrown.x, end: 0 }, y: { velocity: thrown.y, end: 0 }, duration: { min: 0.2, max: p.drop * 2 } }, overwrite: true, onComplete: () => void gsap.set(node, { clearProps: CLEAR }) } as gsap.TweenVars);
        return;
      }
      // Visible from the first frame: a node the redraw just created may still be in its entrance tween (killed by overwrite).
      fromRect(node, from, at, { duration: p.drop, ease: p.settle, opacity: 1 });
    },

    overlayOpen(el, origin) {
      if (!watching()) return;
      const r = el.getBoundingClientRect();
      if (on('overlay') && origin && r.width > 0) {
        if (el.matches('.dz-editor')) {
          // A dialog comes out of what it was opened from: from that box's place and size to its own (the way it closes back).
          const box = origin.width > 0 ? origin : new DOMRect(origin.left - 20, origin.top - 10, 40, 20);
          gsap.fromTo(
            el,
            { x: box.left + box.width / 2 - (r.left + r.width / 2), y: box.top + box.height / 2 - (r.top + r.height / 2), scale: Math.max(0.05, Math.min(1, box.width / r.width)), opacity: 0 },
            { x: 0, y: 0, scale: 1, opacity: 1, duration: p.morph, ease: p.settle, overwrite: true, clearProps: CLEAR },
          );
          const backdrop = el.parentElement;
          if (backdrop) gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: p.morph * 0.6, ease: p.ease, overwrite: true, clearProps: 'opacity' });
          return;
        }
        // A menu or a panel grows out of that point (or box), its items cascading in.
        const ox = Math.max(0, Math.min(r.width, origin.left + origin.width / 2 - r.left));
        const oy = Math.max(0, Math.min(r.height, origin.top + origin.height / 2 - r.top));
        gsap.fromTo(el, { opacity: 0, scale: 0.88, transformOrigin: `${ox}px ${oy}px` }, { opacity: 1, scale: 1, duration: 0.18, ease: p.pop, overwrite: true, clearProps: CLEAR });
        const items = [...el.querySelectorAll<HTMLElement>('.dz-ev, .dz-bar, [role="menuitem"]')].slice(0, 30);
        if (items.length > 0) gsap.fromTo(items, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.18, delay: 0.04, ease: p.ease, stagger: p.stagger * 2, overwrite: true, clearProps: CLEAR });
        return;
      }
      gsap.fromTo(el, { opacity: 0, y: -4, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.14, ease: p.pop, overwrite: true, clearProps: CLEAR });
    },

    overlayClose(el, origin) {
      if (!watching() || !on('overlay')) return Promise.resolve();
      const r = el.getBoundingClientRect();
      if (r.width === 0) return Promise.resolve();
      // Back into where it came from (or simply away), the backdrop fading with it.
      const vars: gsap.TweenVars = origin
        ? { x: origin.left + origin.width / 2 - (r.left + r.width / 2), y: origin.top + origin.height / 2 - (r.top + r.height / 2), scale: Math.max(0.05, Math.min(1, origin.width / r.width)), opacity: 0 }
        : { scale: 0.96, opacity: 0 };
      const backdrop = el.parentElement;
      if (backdrop && el.matches('.dz-editor')) gsap.to(backdrop, { opacity: 0, duration: p.morph * 0.8, ease: p.ease, overwrite: true });
      return new Promise<void>((resolve) => void gsap.to(el, { ...vars, duration: p.morph * 0.8, ease: p.move, overwrite: true, onComplete: resolve }));
    },

    wantsLeave: () => watching() && on('leave'),

    eventsLeave(copies) {
      if (!watching() || !on('leave') || copies.length === 0) return;
      const root = copies[0]!.closest<HTMLElement>('.dz-cal');
      if (root) {
        lastRoot = root;
        const left = goneIn(root);
        for (const c of copies) left.set(c.dataset['dzGone'] ?? '', Date.now());
      }
      // Dissolving: a little smaller and lighter, then nothing (expressive: it lifts and turns a little as it goes).
      const lift = p.tilt > 5;
      return new Promise<void>((resolve) => {
        gsap.to(copies, { opacity: 0, scale: lift ? 0.8 : 0.92, y: lift ? -10 : -3, rotation: lift ? () => gsap.utils.random(-6, 6) : 0, duration: p.leave, ease: 'power2.in', stagger: p.stagger, onComplete: resolve });
      });
    },

    seatsChange(nodes) {
      if (!watching() || !on('seats') || nodes.length === 0) return;
      // One seat fewer (or more): the count rolls in from above, the slot answering with a small pop.
      gsap.fromTo(nodes, { scale: 1.06, yPercent: -18, opacity: 0.5 }, { scale: 1, yPercent: 0, opacity: 1, duration: p.enter * 1.4, ease: p.settle, overwrite: true, clearProps: CLEAR });
    },

    scroll(el, to) {
      if (!watching() || !on('scroll')) return false;
      // Only the scroll is replaced ('auto': a period's slide on the same element plays on); a person's own scroll stops it.
      const tween = scrollTo
        ? gsap.to(el, { scrollTo: { y: to.top, x: to.left, autoKill: true }, duration: 0.7, ease: 'power2.inOut', overwrite: 'auto' } as gsap.TweenVars)
        : gsap.to(el, { scrollTop: to.top, scrollLeft: to.left, duration: 0.7, ease: 'power2.inOut', overwrite: 'auto' });
      const stop = () => {
        tween.kill();
        for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) el.removeEventListener(type, stop);
      };
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) el.addEventListener(type, stop, { once: true, passive: true });
      tween.eventCallback('onComplete', stop);
      return true;
    },

    destroy() {
      // Finished, not left running on nodes that are gone; the media watched again by the next calendar.
      rolling?.progress(1);
      following?.();
      // Finished (their clearProps run), not killed: a killed tween leaves its inline transform and opacity behind.
      if (lastRoot) for (const t of gsap.getTweensOf(lastRoot.querySelectorAll('*'))) t.progress(1).kill();
      lastRoot = null;
      mm?.revert();
      mm = null;
      reduce = true;
    },
  };
}
