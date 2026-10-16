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
 * type-ahead, Escape giving focus back. Disabled entries stay, with their reason.
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

  const items = () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const focusAt = (i: number) => {
    const all = items();
    if (all.length === 0) return;
    all[(i + all.length) % all.length]!.focus();
  };

  const close = (focusBack = true) => {
    if (menu.hidden) return;
    const pop = menu as HTMLElement & { hidePopover?: () => void };
    try {
      pop.hidePopover?.();
    } catch {
      /* not shown as a popover */
    }
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

  menu.addEventListener('keydown', (e) => {
    const all = items();
    const i = all.indexOf(doc.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        focusAt(i + 1);
        break;
      case 'ArrowUp':
        focusAt(i - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(-1);
        break;
      case 'Escape':
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
          if (hit !== undefined) focusAt(hit);
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
      menu.replaceChildren(
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
          b.addEventListener('click', () => {
            if (!item.enabled) return;
            close();
            item.run?.();
          });
          return b;
        }),
      );
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
      const rtl = container.closest('[dir]')?.getAttribute('dir') === 'rtl';
      // Under an anchor — clamped to the viewport, since a column's bottom may be far below it.
      const x = r ? (rtl ? r.right - box.width : r.left) : (at as { x: number }).x;
      const y = r ? Math.min(r.bottom, vh) : (at as { y: number }).y;
      menu.style.left = `${Math.max(0, Math.min(x, vw - box.width))}px`;
      menu.style.top = `${Math.max(0, Math.min(y + box.height > vh ? y - box.height : y, vh - box.height))}px`;
      doc.addEventListener('pointerdown', outside, true);
      doc.defaultView?.addEventListener('scroll', onScroll, true);
      doc.defaultView?.addEventListener('resize', onScroll);
      focusAt(0);
    },
    close,
  };
}
