import { h } from './render/reconcile.js';
import { activeIn, targetOf } from './focus.js';

let popoverIds = 0;

export interface PopoverHost {
  /** Shows `content` under `anchor`, titled; focus moves in, and back to the anchor on close. */
  open(anchor: HTMLElement, title: string, content: Node[], closeLabel: string, onClose?: () => void): void;
  /** `focusBack: false` when the calendar changes or goes away. */
  close(focusBack?: boolean): void;
  readonly element: HTMLElement;
}

/**
 * The panel behind a "+N" link. A native popover inside the calendar, so it
 * inherits the theme, `color-scheme` and `dir`; Escape closes it, Tab stays
 * inside, and focus returns to the link that opened it.
 */
export function createPopover(doc: Document, container: HTMLElement): PopoverHost {
  const panel = h(doc, 'div', 'dz-pop');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('popover', 'manual');
  panel.hidden = true;
  const header = h(doc, 'div', 'dz-pop__head');
  const title = h(doc, 'h2', 'dz-pop__title');
  title.id = `dz-pop-${++popoverIds}`;
  panel.setAttribute('aria-labelledby', title.id);
  const closeBtn = h(doc, 'button', 'dz-pop__close', '×') as HTMLButtonElement;
  closeBtn.type = 'button';
  const list = h(doc, 'div', 'dz-pop__list');
  header.append(title, closeBtn);
  panel.append(header, list);
  container.append(panel);
  let returnTo: HTMLElement | null = null;
  let closed: (() => void) | undefined;

  const focusables = () => [...panel.querySelectorAll<HTMLElement>('button, [tabindex="0"]')];
  const close = (focusBack = true) => {
    if (panel.hidden) return;
    try {
      (panel as HTMLElement & { hidePopover?: () => void }).hidePopover?.();
    } catch {
      /* not shown as a popover */
    }
    panel.hidden = true;
    doc.removeEventListener('pointerdown', outside, true);
    const back = returnTo;
    returnTo = null;
    const done = closed;
    closed = undefined;
    done?.();
    if (focusBack && back?.isConnected) back.focus();
  };
  const outside = (e: Event) => {
    const t = targetOf(e);
    if (!(t instanceof Node) || !panel.contains(t)) close();
  };
  closeBtn.addEventListener('click', () => close());
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const all = focusables();
      if (all.length === 0) return;
      const i = all.indexOf(activeIn(panel) as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? all.length - 1 : i - 1) : (i + 1) % all.length;
      all[next]!.focus();
      e.preventDefault();
    }
  });

  return {
    element: panel,
    open(anchor, text, content, closeLabel, onClose) {
      close(false);
      returnTo = anchor;
      closed = onClose;
      title.textContent = text;
      closeBtn.setAttribute('aria-label', closeLabel);
      list.replaceChildren(...content);
      panel.hidden = false;
      try {
        (panel as HTMLElement & { showPopover?: () => void }).showPopover?.();
      } catch {
        /* popover unsupported: shown as a positioned element */
      }
      const view = doc.defaultView;
      const r = anchor.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      const vw = view?.innerWidth ?? Infinity;
      const vh = view?.innerHeight ?? Infinity;
      const rtl = container.closest('[dir]')?.getAttribute('dir') === 'rtl';
      const x = rtl ? r.right - box.width : r.left;
      panel.style.left = `${Math.max(0, Math.min(x, vw - box.width))}px`;
      panel.style.top = `${Math.max(0, r.bottom + box.height > vh ? r.top - box.height : r.bottom)}px`;
      doc.addEventListener('pointerdown', outside, true);
      (focusables().find((x) => x !== closeBtn) ?? closeBtn).focus();
    },
    close,
  };
}
