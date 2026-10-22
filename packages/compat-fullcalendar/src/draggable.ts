import { makeDraggable } from '@dzcalendar/dom/drag';
import type { EventInput } from '@dzcalendar/core';
import { minutesOf } from './dates.js';

type Rec = Record<string, unknown>;

/** What their `eventData` gives (an object, or a function of the element). */
export interface DraggableSettings {
  /** Their delegation: every element matching it inside the container, those added later too. */
  readonly itemSelector?: string;
  readonly eventData?: Rec | ((el: HTMLElement) => Rec);
}

/** Their event data as our input: a duration as they write it ("00:30", { minutes: 30 }), `className` / `classNames`, `create`. */
function inputOf(d: Rec): { input: EventInput; create: boolean } {
  const { duration, className, classNames, create, startTime: _st, ...rest } = d;
  const m = duration === undefined ? null : minutesOf(duration);
  const classes = [...(typeof className === 'string' ? className.split(/\s+/) : Array.isArray(className) ? className : []), ...(Array.isArray(classNames) ? classNames : typeof classNames === 'string' ? classNames.split(/\s+/) : [])].filter(
    (x): x is string => typeof x === 'string' && x !== '',
  );
  return {
    input: { ...(rest as EventInput), ...(m !== null && m > 0 && { duration: { minutes: Math.round(m) } }), ...(classes.length > 0 && { classNames: classes }) },
    create: create !== false,
  };
}

/**
 * Their `Draggable` (from their interaction plugin), on ours
 * (`makeDraggable`): the container itself, or every `itemSelector` in it —
 * those added later as well. `destroy()` takes everything back.
 */
export class Draggable {
  readonly #offs = new Map<HTMLElement, () => void>();
  readonly #observer: MutationObserver | null = null;

  constructor(
    readonly containerEl: HTMLElement,
    readonly settings: DraggableSettings = {},
  ) {
    const sel = settings.itemSelector;
    const take = (el: HTMLElement) => {
      if (this.#offs.has(el)) return;
      const data = () => {
        const e = settings.eventData;
        return typeof e === 'function' ? e(el) : (e ?? { title: el.textContent?.trim() ?? '' });
      };
      // Read when the drag starts: a card whose data changed is dropped as it is now.
      const first = inputOf(data());
      this.#offs.set(el, makeDraggable(el, { event: () => inputOf(data()).input, data: el, ...(!first.create && { create: false }) }));
    };
    if (!sel) take(containerEl);
    else {
      for (const el of containerEl.querySelectorAll<HTMLElement>(sel)) take(el);
      const Observer = containerEl.ownerDocument.defaultView?.MutationObserver;
      if (Observer) {
        this.#observer = new Observer(() => {
          for (const el of containerEl.querySelectorAll<HTMLElement>(sel)) take(el);
          // An item gone from the list lets go of what was put on it.
          for (const [el, off] of this.#offs) if (!containerEl.contains(el)) (off(), this.#offs.delete(el));
        });
        this.#observer.observe(containerEl, { childList: true, subtree: true });
      }
    }
  }

  destroy(): void {
    this.#observer?.disconnect();
    for (const off of this.#offs.values()) off();
    this.#offs.clear();
  }
}
