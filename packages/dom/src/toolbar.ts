import type { CalendarKernel, KernelState } from '@dzcalendar/core';
import type { DzMessages } from './messages.js';
import type { Scope } from './render/scope.js';
import { h } from './render/reconcile.js';
import { guard } from './render/event.js';

/** What the header holds, in three places: names separated by a space for separate groups, by a comma for buttons joined into one (docs/behaviors/header-toolbar.md). */
export interface HeaderToolbar {
  readonly start?: string;
  readonly center?: string;
  readonly end?: string;
}

/** A button of the application's in the header. */
export interface CustomButton {
  /** Its words, and its accessible name. */
  readonly text?: string;
  /** On hover; the accessible name when there is no text. */
  readonly hint?: string;
  /** A class of the application's (an icon font, a mask) put on an `aria-hidden` span before the words. */
  readonly icon?: string;
  readonly click: (event: MouseEvent, el: HTMLElement) => void;
  /** A toggle (`aria-pressed`), drawn pressed when true; a function is re-read each time the calendar draws. */
  readonly active?: boolean | (() => boolean);
}

export interface Toolbar {
  /** The title (`h2`, a polite live region): what a motion adapter animates. */
  readonly title: HTMLElement;
  readonly element: HTMLElement;
  /** Words, direction, the pressed buttons. */
  draw(state: KernelState, messages: DzMessages, rtl: boolean): void;
  /** Another layout and buttons (drawn at the next `draw`). */
  setLayout(layout: HeaderToolbar, buttons: Readonly<Record<string, CustomButton>>): void;
  /** The same buttons with other functions (a framework's new closures): nothing redrawn, the new `click` and `active` used from now on. */
  setButtons(buttons: Readonly<Record<string, CustomButton>>): void;
}

/** Whether two sets of buttons look the same (words, hint, icon, a toggle or not): only then can the nodes stay. */
export function sameLook(a: Readonly<Record<string, CustomButton>>, b: Readonly<Record<string, CustomButton>>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const x = a[k];
    const y = b[k];
    return !!x && !!y && x.text === y.text && x.hint === y.hint && x.icon === y.icon && (x.active === undefined) === (y.active === undefined);
  });
}

const BUILT_IN = new Set(['prev', 'next', 'today', 'title']);

/**
 * The header: previous / today / next, the title (a polite live region,
 * rewritten only when it changes), the view buttons (the current one
 * `aria-pressed`) and the application's buttons, laid out in three places.
 */
export function createToolbar(
  doc: Document,
  scope: Scope,
  kernel: CalendarKernel,
  /** Whether a view can be drawn here (one that cannot is left out, and said by the caller). */
  drawable: (view: string) => boolean,
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
  // The built-in pieces are made once and moved: the title keeps its live region, the arrows their listeners.
  const prev = btn('dz-toolbar__prev', () => go('prev'));
  const today = btn('dz-toolbar__today', () => go('today'));
  const next = btn('dz-toolbar__next', () => go('next'));
  const title = h(doc, 'h2', 'dz-toolbar__title');
  title.setAttribute('aria-live', 'polite');
  let viewButtons: HTMLButtonElement[] = [];
  let switchers: HTMLElement[] = [];
  let customs: { b: HTMLButtonElement; name: string }[] = [];
  /** The buttons in force: a click reads its function here, so new closures need no new node. */
  let specs: Readonly<Record<string, CustomButton>> = {};
  const said = new Set<string>();
  const sayOnce = (key: string, message: string) => {
    if (said.has(key)) return;
    said.add(key);
    console.warn(`dzcalendar: ${message}`);
  };
  const pressed = () => {
    for (const { b, name } of customs) {
      const active = specs[name]?.active;
      if (active === undefined) continue;
      const on = typeof active === 'function' ? guard(active, false) : active;
      b.setAttribute('aria-pressed', String(on === true));
    }
  };

  const viewButton = (v: string) => {
    const b = h(doc, 'button', 'dz-toolbar__btn dz-toolbar__view') as HTMLButtonElement;
    b.type = 'button';
    // On the button itself: it goes with its node when the layout changes.
    b.addEventListener('click', () => switchTo(v));
    b.dataset['view'] = v;
    viewButtons.push(b);
    return b;
  };
  const customButton = (name: string, spec: CustomButton) => {
    const b = h(doc, 'button', 'dz-toolbar__btn dz-toolbar__custom') as HTMLButtonElement;
    b.type = 'button';
    b.dataset['button'] = name;
    const icon = typeof spec.icon === 'string' ? spec.icon.trim() : '';
    if (icon) {
      const i = h(doc, 'span', 'dz-toolbar__icon');
      i.className = `dz-toolbar__icon ${icon}`;
      i.setAttribute('aria-hidden', 'true');
      b.append(i);
    }
    const text = typeof spec.text === 'string' ? spec.text : '';
    const hint = typeof spec.hint === 'string' ? spec.hint : '';
    if (text) b.append(h(doc, 'span', 'dz-toolbar__text', text));
    else {
      // A name is needed: the hint, else the button's own name (said: it is not words a person reads).
      if (!hint) sayOnce(`noname:${name}`, `the header button ${name} has no text and no hint: its accessible name is "${name}"`);
      b.setAttribute('aria-label', hint || name);
    }
    if (hint) b.title = hint;
    // The function in force at the click (and the toggle re-read right after).
    b.addEventListener('click', (e) => {
      const now = specs[name];
      if (now) guard(() => now.click(e, b), undefined);
      pressed();
    });
    customs.push({ b, name });
    return b;
  };
  /** A button the header can draw: an object with a `click` function; anything else is left out and said once. */
  const usable = (name: string, spec: unknown): spec is CustomButton => {
    if (spec && typeof spec === 'object' && typeof (spec as CustomButton).click === 'function') return true;
    sayOnce(`bad:${name}`, `customButtons.${name} needs a click function: left out`);
    return false;
  };

  const setLayout = (layout: HeaderToolbar, buttons: Readonly<Record<string, CustomButton>>) => {
    viewButtons = [];
    switchers = [];
    customs = [];
    specs = buttons;
    const piece = (name: string): HTMLElement | null => {
      if (Object.hasOwn(buttons, name)) return usable(name, buttons[name]) ? customButton(name, buttons[name]) : null;
      if (name === 'prev') return prev;
      if (name === 'next') return next;
      if (name === 'today') return today;
      if (name === 'title') return title;
      if (kernel.getViewSpec(name) && drawable(name)) return viewButton(name);
      // A view known to the kernel but not drawn here is said by the caller, with its import.
      if (!kernel.getViewSpec(name)) sayOnce(`unknown:${name}`, `nothing called ${name} for the header (a view, prev, next, today, title, or one of customButtons)`);
      return null;
    };
    const place = (where: 'start' | 'center' | 'end') => {
      const section = h(doc, 'div', `dz-toolbar__section dz-toolbar__section--${where}`);
      const asked = layout[where];
      if (asked !== undefined && typeof asked !== 'string') sayOnce(`place:${where}`, `headerToolbar.${where} is not a string: left empty`);
      for (const group of (typeof asked === 'string' ? asked : '').split(/\s+/).filter(Boolean)) {
        const names = group.split(',').filter(Boolean);
        const items = names.map(piece).filter((x): x is HTMLElement => x !== null);
        if (items.length === 0) continue;
        // One button, or the title, stands alone; joined buttons are one piece.
        if (items.length === 1) {
          section.append(items[0]!);
          continue;
        }
        // Only views make the view switcher: a named group; other joined buttons are one piece to the eye only.
        const views = names.every((n) => !Object.hasOwn(buttons, n) && !BUILT_IN.has(n));
        const g = h(doc, 'div', views ? 'dz-toolbar__group dz-toolbar__views' : 'dz-toolbar__group');
        if (views) {
          g.setAttribute('role', 'group');
          switchers.push(g);
        }
        g.append(...items);
        section.append(g);
      }
      return section;
    };
    // A focused piece moved by the new layout keeps the focus (moving a node takes it away).
    const focused = bar.contains(doc.activeElement) ? (doc.activeElement as HTMLElement) : null;
    bar.replaceChildren(place('start'), place('center'), place('end'));
    if (focused?.isConnected && doc.activeElement !== focused) focused.focus();
  };

  return {
    element: bar,
    title,
    setLayout,
    setButtons(buttons) {
      specs = buttons;
      pressed();
    },
    draw(state, messages, rtl) {
      // Rewriting an aria-live title, even with the same words, announces it again.
      if (title.textContent !== state.title) title.textContent = state.title;
      prev.textContent = rtl ? '›' : '‹';
      prev.setAttribute('aria-label', messages.previous);
      next.textContent = rtl ? '‹' : '›';
      next.setAttribute('aria-label', messages.next);
      today.textContent = messages.today;
      for (const s of switchers) s.setAttribute('aria-label', messages.viewSwitcher);
      for (const b of viewButtons) {
        const v = b.dataset['view']!;
        b.textContent = messages.views[v] ?? kernel.getViewSpec(v)?.type ?? v;
        b.setAttribute('aria-pressed', String(v === state.view.type));
      }
      pressed();
    },
  };
}

/** The header as it was before `headerToolbar`: the arrows and "today" with the title at the start, the views at the end (a lone view: no switcher). */
export const defaultLayout = (views: readonly string[]): HeaderToolbar => ({ start: 'prev today next title', end: views.length > 1 ? views.join(',') : '' });
