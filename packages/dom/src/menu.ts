import type { ActionItem, ActionTarget } from '@dzcalendar/core';
import type { ViewCtx } from './host.js';
import { h } from './render/reconcile.js';

export type ResolveTarget = (el: Element, point: { x: number; y: number } | null) => { target: ActionTarget; anchor: HTMLElement } | null;

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 8;

/**
 * The three ways to ask for actions on what is under the pointer or the
 * focus: right-click, a touch long press (cancelled by any scroll movement,
 * so it never blocks scrolling), and the Menu key / Shift+F10.
 */
export function attachMenuTriggers(ctx: ViewCtx, root: HTMLElement, resolve: ResolveTarget): void {
  const open = (el: Element, point: { x: number; y: number } | null): boolean => {
    const hit = resolve(el, point);
    if (!hit) return false;
    const focus = (hit.anchor.matches('[tabindex]') ? hit.anchor : ctx.doc.activeElement) as HTMLElement | null;
    return ctx.openMenu(hit.target, point ?? hit.anchor, focus);
  };

  ctx.scope.on(root, 'contextmenu', (e) => {
    const me = e as MouseEvent;
    if (me.target instanceof Element && open(me.target, { x: me.clientX, y: me.clientY })) me.preventDefault();
  });

  let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
  const cancel = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  ctx.scope.on(root, 'pointerdown', (e) => {
    const pe = e as PointerEvent;
    if (pe.pointerType !== 'touch' || !(pe.target instanceof Element)) return;
    const target = pe.target;
    cancel();
    press = { x: pe.clientX, y: pe.clientY, timer: setTimeout(() => {
      const p = press;
      press = null;
      if (p) open(target, { x: p.x, y: p.y });
    }, LONG_PRESS_MS) };
  });
  ctx.scope.on(root, 'pointermove', (e) => {
    const pe = e as PointerEvent;
    if (press && Math.hypot(pe.clientX - press.x, pe.clientY - press.y) > MOVE_TOLERANCE) cancel();
  });
  for (const type of ['pointerup', 'pointercancel', 'scroll'] as const) ctx.scope.on(root, type, cancel, { capture: true, passive: true });
  ctx.scope.add(cancel);

  ctx.scope.on(root, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    const isMenuKey = ke.key === 'ContextMenu' || (ke.key === 'F10' && ke.shiftKey);
    if (!isMenuKey || !(ke.target instanceof Element)) return;
    if (open(ke.target, null)) ke.preventDefault();
  });
}

export interface MenuHost {
  open(items: readonly ActionItem[], at: { x: number; y: number } | HTMLElement, returnFocus: HTMLElement | null, label: string): void;
  /** `focusBack: false` when the calendar changes or goes away: focus is not handed to a stale node. */
  close(focusBack?: boolean): void;
  readonly element: HTMLElement;
}

/**
 * The menu itself: a native popover inside the calendar (so it carries the
 * theme, `color-scheme` and `dir`), `role="menu"` with arrow keys, Home/End,
 * type-ahead, Escape giving focus back. Disabled entries stay, with their
 * reason. An entry with `children` opens a sub-menu (the recurrence scope:
 * this one / this and following / all): the arrow towards it opens it, the
 * arrow back or Escape closes it and returns to its entry.
 */
export function createMenu(doc: Document, container: HTMLElement): MenuHost {
  const menu = h(doc, 'div', 'dz-menu');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('popover', 'manual');
  menu.hidden = true;
  container.append(menu);
  let returnTo: HTMLElement | null = null;
  let typed = '';
  let typedAt = 0;

  const rtl = () => container.closest('[dir]')?.getAttribute('dir') === 'rtl';
  /** The entries of one level only: a sub-menu's are not its parent's. */
  const itemsOf = (level: Element) => [...level.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]')];
  const levelOf = (el: Element | null): HTMLElement => (el?.closest('[role="menu"]') as HTMLElement | null) ?? menu;
  const focusAt = (level: Element, i: number) => {
    const all = itemsOf(level);
    if (all.length === 0) return;
    all[(i + all.length) % all.length]!.focus();
  };

  const closeSubs = (level: Element) => {
    for (const sub of level.querySelectorAll<HTMLElement>(':scope > .dz-menu__sub')) {
      closeSubs(sub);
      sub.hidden = true;
    }
    for (const b of itemsOf(level)) if (b.hasAttribute('aria-haspopup')) b.setAttribute('aria-expanded', 'false');
  };

  const close = (focusBack = true) => {
    if (menu.hidden) return;
    const pop = menu as HTMLElement & { hidePopover?: () => void };
    try {
      pop.hidePopover?.();
    } catch {
      /* not shown as a popover */
    }
    closeSubs(menu);
    menu.hidden = true;
    doc.removeEventListener('pointerdown', outside, true);
    doc.defaultView?.removeEventListener('scroll', onScroll, true);
    doc.defaultView?.removeEventListener('resize', onScroll);
    const back = returnTo;
    returnTo = null;
    if (focusBack && back?.isConnected) back.focus();
  };
  // A fixed menu would float away from what it was opened on.
  const onScroll = (e: Event) => {
    if (!(e.target instanceof Node) || !menu.contains(e.target)) close(false);
  };
  const outside = (e: Event) => {
    if (!(e.target instanceof Node) || !menu.contains(e.target)) close();
  };

  /** Opens the sub-menu of `entry` (built on demand), its first entry focused when asked. */
  function openSub(entry: HTMLElement, children: readonly ActionItem[], label: string, focus: boolean) {
    const level = levelOf(entry);
    closeSubs(level);
    let sub = entry.nextElementSibling as HTMLElement | null;
    if (!sub || !sub.classList.contains('dz-menu__sub')) {
      sub = h(doc, 'div', 'dz-menu dz-menu__sub');
      sub.setAttribute('role', 'menu');
      sub.setAttribute('aria-label', label);
      entry.after(sub);
    }
    build(sub, children);
    sub.hidden = false;
    entry.setAttribute('aria-expanded', 'true');
    // Beside its entry, inside the menu's box: positioned against the level.
    sub.style.top = `${entry.offsetTop}px`;
    if (focus) focusAt(sub, 0);
  }

  function build(level: HTMLElement, entries: readonly ActionItem[]) {
    level.replaceChildren(
      ...entries.map((item) => {
        const b = h(doc, 'button', 'dz-menu__item') as HTMLButtonElement;
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.tabIndex = -1;
        b.dataset['action'] = item.id;
        b.append(h(doc, 'span', 'dz-menu__label', item.label));
        if (item.reason) b.append(h(doc, 'span', 'dz-menu__reason', item.reason));
        if (item.shortcut) b.append(h(doc, 'kbd', 'dz-menu__shortcut', item.shortcut));
        if (!item.enabled) b.setAttribute('aria-disabled', 'true');
        const children = item.children && item.children.length > 0 ? item.children : null;
        if (children) {
          b.setAttribute('aria-haspopup', 'menu');
          b.setAttribute('aria-expanded', 'false');
          b.append(h(doc, 'span', 'dz-menu__chevron', rtl() ? '‹' : '›'));
        }
        b.addEventListener('click', () => {
          if (!item.enabled) return;
          if (children) {
            openSub(b, children, item.label, true);
            return;
          }
          close();
          item.run?.();
        });
        return b;
      }),
    );
  }

  menu.addEventListener('keydown', (e) => {
    const active = doc.activeElement as HTMLElement | null;
    const level = levelOf(active);
    const all = itemsOf(level);
    const i = active ? all.indexOf(active) : -1;
    const inward = rtl() ? 'ArrowLeft' : 'ArrowRight';
    const outward = rtl() ? 'ArrowRight' : 'ArrowLeft';
    switch (e.key) {
      case 'ArrowDown':
        focusAt(level, i + 1);
        break;
      case 'ArrowUp':
        focusAt(level, i - 1);
        break;
      case 'Home':
        focusAt(level, 0);
        break;
      case 'End':
        focusAt(level, -1);
        break;
      case inward:
        if (active?.getAttribute('aria-haspopup') === 'menu' && active.getAttribute('aria-disabled') !== 'true') active.click();
        else return;
        break;
      case outward:
      case 'Escape': {
        if (level !== menu) {
          // Back to the entry that opened this sub-menu.
          const entry = level.previousElementSibling as HTMLElement | null;
          level.hidden = true;
          entry?.setAttribute('aria-expanded', 'false');
          entry?.focus();
        } else if (e.key === 'Escape') close();
        else return;
        break;
      }
      case 'Tab':
        close();
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const ch = e.key.toLowerCase();
          typed = Date.now() - typedAt > 700 ? ch : typed + ch;
          typedAt = Date.now();
          // The same letter again moves on to the next entry starting with it.
          const query = [...typed].every((c) => c === ch) ? ch : typed;
          const order = all.map((_, k) => (i + 1 + k) % all.length);
          const hit = order.find((k) => (all[k]!.textContent ?? '').toLowerCase().startsWith(query));
          if (hit !== undefined) focusAt(level, hit);
          else return;
        } else {
          return;
        }
    }
    e.preventDefault();
    e.stopPropagation();
  });

  return {
    element: menu,
    open(entries, at, focusBack, label) {
      close();
      returnTo = focusBack;
      menu.setAttribute('aria-label', label);
      build(menu, entries);
      menu.hidden = false;
      const pop = menu as HTMLElement & { showPopover?: () => void };
      try {
        pop.showPopover?.();
      } catch {
        /* popover unsupported: shown as a positioned element */
      }
      // Place at the pointer, or under the anchor; then keep it on screen.
      const view = doc.defaultView;
      const r = at instanceof HTMLElement ? at.getBoundingClientRect() : null;
      const vw = view?.innerWidth ?? Infinity;
      const vh = view?.innerHeight ?? Infinity;
      const box = menu.getBoundingClientRect();
      const isRtl = rtl();
      // Under an anchor — clamped to the viewport, since a column's bottom may be far below it.
      const x = r ? (isRtl ? r.right - box.width : r.left) : (at as { x: number }).x;
      const y = r ? Math.min(r.bottom, vh) : (at as { y: number }).y;
      menu.style.left = `${Math.max(0, Math.min(x, vw - box.width))}px`;
      menu.style.top = `${Math.max(0, Math.min(y + box.height > vh ? y - box.height : y, vh - box.height))}px`;
      // Sub-menus open towards the side with room.
      menu.dataset['subSide'] = (isRtl ? x - box.width < 0 : x + box.width * 2 > vw) ? 'start' : 'end';
      doc.addEventListener('pointerdown', outside, true);
      doc.defaultView?.addEventListener('scroll', onScroll, true);
      doc.defaultView?.addEventListener('resize', onScroll);
      focusAt(menu, 0);
    },
    close,
  };
}
