import type { CalendarKernel, KernelState } from '@dzcalendar/core';
import type { DzMessages } from './messages.js';
import type { Scope } from './render/scope.js';
import { h } from './render/reconcile.js';

export interface Toolbar {
  readonly element: HTMLElement;
  /** Words, direction, the view switcher's pressed button. */
  draw(state: KernelState, messages: DzMessages, rtl: boolean): void;
  /** Another set of view buttons (drawn at the next `draw`). */
  setViews(views: readonly string[]): void;
}

/**
 * Previous / today / next, the title (a polite live region, rewritten only
 * when it changes), and the view switcher: one button per view in `views`
 * that this renderer can draw, the current one `aria-pressed`.
 */
export function createToolbar(
  doc: Document,
  scope: Scope,
  kernel: CalendarKernel,
  views: readonly string[],
  go: (dir: 'prev' | 'next' | 'today') => void,
  switchTo: (view: string) => void,
): Toolbar {
  const bar = h(doc, 'div', 'dz-toolbar');
  const btn = (cls: string, onClick: () => void) => {
    const b = h(doc, 'button', `dz-toolbar__btn ${cls}`) as HTMLButtonElement;
    b.type = 'button';
    scope.on(b, 'click', onClick);
    return b;
  };
  const prev = btn('dz-toolbar__prev', () => go('prev'));
  const today = btn('dz-toolbar__today', () => go('today'));
  const next = btn('dz-toolbar__next', () => go('next'));
  const title = h(doc, 'h2', 'dz-toolbar__title');
  title.setAttribute('aria-live', 'polite');
  const switcher = h(doc, 'div', 'dz-toolbar__views');
  switcher.setAttribute('role', 'group');
  let viewButtons: HTMLButtonElement[] = [];
  const setViews = (list: readonly string[]) => {
    viewButtons = list.map((v) => {
      const b = h(doc, 'button', 'dz-toolbar__btn dz-toolbar__view') as HTMLButtonElement;
      b.type = 'button';
      // On the button itself: it goes with its node when the set changes.
      b.addEventListener('click', () => switchTo(v));
      b.dataset['view'] = v;
      return b;
    });
    switcher.replaceChildren(...viewButtons);
    if (viewButtons.length > 1) bar.append(switcher);
    else switcher.remove();
  };
  bar.append(prev, today, next, title);
  setViews(views);

  return {
    element: bar,
    setViews,
    draw(state, messages, rtl) {
      // Rewriting an aria-live title, even with the same words, announces it again.
      if (title.textContent !== state.title) title.textContent = state.title;
      prev.textContent = rtl ? '›' : '‹';
      prev.setAttribute('aria-label', messages.previous);
      next.textContent = rtl ? '‹' : '›';
      next.setAttribute('aria-label', messages.next);
      today.textContent = messages.today;
      switcher.setAttribute('aria-label', messages.viewSwitcher);
      for (const b of viewButtons) {
        const v = b.dataset['view']!;
        b.textContent = messages.views[v] ?? kernel.getViewSpec(v)?.type ?? v;
        b.setAttribute('aria-pressed', String(v === state.view.type));
      }
    },
  };
}
