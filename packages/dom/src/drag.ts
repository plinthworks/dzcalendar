import type { EventInput } from '@dzcalendar/core';
// A separate entry (`@dzcalendar/dom/drag`): what it shares with the calendar comes from the package, not copied in.
import { EN } from '@dzcalendar/dom';
import { anyTarget, heldOn, holdOn, targetAt } from '@dzcalendar/dom/toolkit';
import type { Carried, DropTarget, PageHold } from '@dzcalendar/dom/toolkit';

/** What an element becomes when dropped on a calendar (docs/behaviors/external-drag.md). */
export interface DraggableSpec {
  /** The event it becomes, without its start (the place dropped gives it): read when the drag starts. */
  readonly event: EventInput | (() => EventInput);
  /** The application's own data, given back to `onDrop` (a patient's id): read when the drag starts. */
  readonly data?: unknown;
  /** False: no event is made, `onDrop` alone is told (the application makes what it wants). Default true. */
  readonly create?: boolean;
}

/** Pixels a press travels before it is a drag (a mouse, a pen); a finger holds still this long instead. */
const THRESHOLD = 4;
const HOLD_MS = 300;
const WOBBLE = 8;

/** One polite live region per page, for what is said before a calendar is reached. */
const REGIONS = new WeakMap<Document, HTMLElement>();
function say(doc: Document, text: string): void {
  let r = REGIONS.get(doc);
  if (!r?.isConnected) {
    r = doc.createElement('div');
    r.setAttribute('aria-live', 'polite');
    r.setAttribute('role', 'status');
    // Visually hidden, read by assistive technology.
    r.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
    doc.body.append(r);
    REGIONS.set(doc, r);
  }
  // Written anew: the same words twice are said twice.
  r.textContent = '';
  const region = r;
  doc.defaultView?.setTimeout(() => (region.textContent = text), 30);
}

/** The words of a calendar of the page (its language), else English. */
const words = (doc: Document) => anyTarget(doc)?.ctx.messages ?? EN;

/**
 * An element of the page that can be dropped on a calendar (`droppable`) as
 * the event `spec` describes: by a pointer (a finger holds it 300 ms first),
 * or the keyboard (Enter picks it up, Tab to a calendar, the arrows, Enter
 * puts it down, Escape cancels). Returns the clean-up: nothing is left on
 * the element after it.
 */
export function makeDraggable(el: HTMLElement, spec: DraggableSpec): () => void {
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const off: (() => void)[] = [];
  const on = (t: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
    t.addEventListener(type, fn, opts);
    off.push(() => t.removeEventListener(type, fn, opts));
  };
  const carried = (): Carried | null => {
    try {
      const input = typeof spec.event === 'function' ? spec.event() : spec.event;
      return { kind: 'outside', input: { ...input }, data: spec.data, element: el, ...(spec.create === false && { create: false }) };
    } catch (err) {
      void Promise.reject(err);
      return null;
    }
  };
  const titleOf = (c: Carried) => (c.kind === 'outside' ? c.input.title : c.instance.event.title) || words(doc).untitled;

  // A button for the keyboard and assistive technology, unless it is focusable already; what is added is taken back.
  const added: string[] = [];
  if (!el.hasAttribute('tabindex') && el.tabIndex < 0) (el.tabIndex = 0), added.push('tabindex');
  if (!el.hasAttribute('role')) el.setAttribute('role', 'button'), added.push('role');
  el.classList.add('dz-draggable');
  // A press held on it selects no text and opens no touch menu — set on it, so no stylesheet is needed.
  const style = el.style as CSSStyleDeclaration & { webkitUserSelect: string; webkitTouchCallout: string };
  const was = { userSelect: style.userSelect, webkitUserSelect: style.webkitUserSelect, webkitTouchCallout: style.webkitTouchCallout };
  style.userSelect = 'none';
  style.webkitUserSelect = 'none';
  style.webkitTouchCallout = 'none';
  /** The page's listeners, on only while a press is active (a long list of cards costs nothing at rest). */
  const during: (() => void)[] = [];
  const onDuring = (t: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
    t.addEventListener(type, fn, opts);
    during.push(() => t.removeEventListener(type, fn, opts));
  };

  // ── the pointer ────────────────────────────────────────────────────────
  let press: { id: number; x: number; y: number; type: string; timer: number } | null = null;
  let drag: { c: Carried; avatar: HTMLElement; over: DropTarget | null; x: number; y: number; frame: number; dx: number; dy: number } | null = null;

  const avatarFor = (x: number, y: number): { avatar: HTMLElement; dx: number; dy: number } => {
    const r = el.getBoundingClientRect();
    const avatar = el.cloneNode(true) as HTMLElement;
    // A picture of the card: nothing in it is focusable, named or found by id.
    for (const n of [avatar, ...avatar.querySelectorAll<HTMLElement>('*')]) {
      n.removeAttribute('id');
      n.removeAttribute('tabindex');
      n.removeAttribute('aria-pressed');
    }
    avatar.removeAttribute('role');
    avatar.setAttribute('aria-hidden', 'true');
    avatar.inert = true;
    avatar.classList.add('dz-drag-avatar');
    // Follows the pointer above everything, never under it (the place under the pointer is read through it).
    avatar.style.cssText += `;position:fixed;left:0;top:0;width:${r.width}px;margin:0;pointer-events:none;z-index:2147483647;opacity:.85;box-sizing:border-box`;
    doc.body.append(avatar);
    return { avatar, dx: x - r.left, dy: y - r.top };
  };
  const place = () => {
    const d = drag;
    if (!d) return;
    d.frame = 0;
    d.avatar.style.transform = `translate(${d.x - d.dx}px, ${d.y - d.dy}px)`;
    const t = targetAt(doc, d.x, d.y, d.c);
    if (t !== d.over) {
      d.over?.leave();
      d.over = t;
    }
    t?.over(d.c, d.x, d.y);
    // Over a calendar that takes it, the calendar shows where; elsewhere the element alone.
    d.avatar.style.visibility = t ? 'hidden' : '';
  };
  const begin = (x: number, y: number) => {
    const c = carried();
    // Its data could not be read (reported): the press ends here, not at every move after.
    if (!c) return void finish();
    if (!press) return;
    try {
      el.setPointerCapture(press.id);
    } catch {
      /* the pointer is gone */
    }
    const a = avatarFor(x, y);
    drag = { c, ...a, over: null, x, y, frame: 0 };
    el.classList.add('dz-draggable--dragging');
    place();
  };
  const finish = () => {
    const d = drag;
    drag = null;
    if (press?.timer) win.clearTimeout(press.timer);
    try {
      if (press && el.hasPointerCapture?.(press.id)) el.releasePointerCapture(press.id);
    } catch {
      /* released */
    }
    press = null;
    for (const f of during.splice(0)) f();
    el.classList.remove('dz-draggable--dragging');
    if (!d) return null;
    if (d.frame) win.cancelAnimationFrame(d.frame);
    d.avatar.remove();
    return d;
  };
  const cancel = () => finish()?.over?.leave();

  const onMove = (e: Event) => {
    const pe = e as PointerEvent;
    if (!press || pe.pointerId !== press.id) return;
    if (!drag) {
      const moved = Math.hypot(pe.clientX - press.x, pe.clientY - press.y);
      if (press.type === 'touch') {
        // Moved before the hold: a scroll, not a drag.
        if (moved > WOBBLE) finish();
        return;
      }
      if (moved < THRESHOLD) return;
      begin(press.x, press.y);
    }
    if (!drag) return;
    pe.preventDefault();
    drag.x = pe.clientX;
    drag.y = pe.clientY;
    if (!drag.frame) drag.frame = win.requestAnimationFrame(place);
  };
  const onUp = (e: Event) => {
    const pe = e as PointerEvent;
    if (!press || pe.pointerId !== press.id) return;
    const d = drag;
    if (d) {
      d.x = pe.clientX;
      d.y = pe.clientY;
      place();
    }
    const done = finish();
    // Released over a calendar (still there): put down there, its rules decide; anywhere else, nothing happens.
    if (done?.over && !done.over.ctx.scope.isDisposed) void done.over.drop(done.c);
  };
  on(el, 'pointerdown', (e) => {
    const pe = e as PointerEvent;
    if (press || drag || (pe.pointerType === 'mouse' && pe.button !== 0)) return;
    press = { id: pe.pointerId, x: pe.clientX, y: pe.clientY, type: pe.pointerType, timer: 0 };
    onDuring(doc, 'pointermove', onMove);
    onDuring(doc, 'pointerup', onUp);
    onDuring(doc, 'pointercancel', (c) => press && (c as PointerEvent).pointerId === press.id && cancel());
    onDuring(doc, 'keydown', (k) => drag && (k as KeyboardEvent).key === 'Escape' && cancel());
    onDuring(win, 'blur', () => drag && cancel());
    // While a finger drags, the page does not scroll; while it holds, no menu opens.
    onDuring(doc, 'touchmove', (t) => drag && t.cancelable && t.preventDefault(), { passive: false });
    onDuring(el, 'contextmenu', (m) => pe.pointerType === 'touch' && m.preventDefault());
    // A finger holds it still before it moves it (else it is a scroll of the list).
    if (pe.pointerType === 'touch') press.timer = win.setTimeout(() => press && !drag && begin(press.x, press.y), HOLD_MS);
  });
  // A drag does not select the page's text, nor start the browser's own drag.
  on(el, 'dragstart', (e) => e.preventDefault());

  // ── the keyboard ───────────────────────────────────────────────────────
  let mine: PageHold | null = null;
  let escape: (() => void) | null = null;
  const letGo = (said: boolean) => {
    if (!mine) return;
    if (heldOn(doc) === mine) holdOn(doc, null);
    mine = null;
    escape?.();
    escape = null;
    el.removeAttribute('aria-pressed');
    el.classList.remove('dz-draggable--held');
    if (said) say(doc, words(doc).grabCancelled);
  };
  on(el, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.defaultPrevented || ke.target !== el) return;
    if (ke.key === 'Escape' && mine) {
      ke.preventDefault();
      return letGo(true);
    }
    if (ke.key !== 'Enter' && ke.key !== ' ') return;
    ke.preventDefault();
    if (mine) return letGo(true);
    const c = carried();
    if (!c) return;
    // Another element held before: it is let go, this one taken.
    heldOn(doc)?.cancel(false);
    const hold: PageHold = {
      carried: c,
      cancel: (said) => {
        letGo(said);
        if (said && el.isConnected) el.focus();
      },
      done: () => letGo(false),
    };
    mine = hold;
    holdOn(doc, hold);
    // Escape anywhere on the page gives it back (a calendar holding it says so itself first).
    const onEscape = (k: Event) => {
      if ((k as KeyboardEvent).key !== 'Escape' || k.defaultPrevented || heldOn(doc) !== hold) return;
      hold.cancel(true);
    };
    doc.addEventListener('keydown', onEscape);
    escape = () => doc.removeEventListener('keydown', onEscape);
    el.setAttribute('aria-pressed', 'true');
    el.classList.add('dz-draggable--held');
    say(doc, words(doc).pickedUp({ title: titleOf(c) }));
  });

  return () => {
    cancel();
    letGo(false);
    for (const f of off.splice(0)) f();
    el.classList.remove('dz-draggable', 'dz-draggable--dragging', 'dz-draggable--held');
    for (const a of added) el.removeAttribute(a);
    Object.assign(style, was);
  };
}
