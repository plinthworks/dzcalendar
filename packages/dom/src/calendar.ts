import { createKernel, Temporal } from '@dzcalendar/core';
import type { CalendarKernel, DurationLike, KernelOptions, NavDirection, PlainDate, ZoneId } from '@dzcalendar/core';
import { EN, FR } from './messages.js';
import type { DzMessages } from './messages.js';
import { NO_MOTION } from './motion.js';
import type { MotionAdapter } from './motion.js';
import { h } from './render/reconcile.js';
import { DZ_CSS, ensureStyles } from './styles.js';
import { createTimeGridView } from './views/timegrid.js';
import type { TimeGridView } from './views/timegrid.js';

export interface CalendarOptions extends Partial<KernelOptions> {
  /** A kernel built elsewhere (shared store, tests). Otherwise one is made from the options. */
  readonly kernel?: CalendarKernel;
  /** Default: FR for French locales, EN otherwise. */
  readonly messages?: DzMessages;
  /** False under a CSP without inline styles: include `DZ_CSS` yourself. */
  readonly injectStyles?: boolean;
  /** The calendar owns it from here: it is destroyed with the calendar, or when replaced. */
  readonly motion?: MotionAdapter;
  /** Where the time grid is scrolled to on first paint. Default PT8H. */
  readonly scrollTime?: DurationLike;
  /** The line at the current time, refreshed every minute. Default true. */
  readonly nowIndicator?: boolean;
}

export interface CalendarUpdate {
  readonly messages?: DzMessages;
  readonly locale?: string;
  readonly timeZone?: ZoneId;
  readonly view?: string;
  readonly date?: PlainDate;
  readonly motion?: MotionAdapter;
}

export interface CalendarInstance {
  readonly kernel: CalendarKernel;
  readonly element: HTMLElement;
  /**
   * Changes what was asked to change and nothing else, and draws once. A
   * value equal to the current one is a no-op — a framework hands options back
   * after every change, and the screen must not flicker, lose its scroll
   * position or the focused event.
   */
  update(changes: CalendarUpdate): void;
  navigate(dir: NavDirection): void;
  destroy(): void;
}

const messagesFor = (locale: string) => (locale.toLowerCase().startsWith('fr') ? FR : EN);

/** Right-to-left for Arabic, Hebrew, Persian…: from the locale, as tzslot does (method or getter). */
function directionOf(locale: string): 'ltr' | 'rtl' {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getTextInfo?: () => { direction?: string }; textInfo?: { direction?: string } };
    const info = typeof l.getTextInfo === 'function' ? l.getTextInfo() : l.textInfo;
    return info?.direction === 'rtl' ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

/** The families this renderer draws today. dayGrid joins in Phase 4. */
const DRAWN = new Set(['timeGrid']);

/**
 * A calendar in `host`. Read-only in this phase: the time grid (week and
 * day), its DST bands and readings, the all-day row, navigation, the line at
 * the current time.
 */
export function createCalendar(host: HTMLElement, options: CalendarOptions = {}): CalendarInstance {
  const doc = host.ownerDocument;
  if (options.injectStyles !== false) ensureStyles(host, 'core', DZ_CSS);

  const owned = !options.kernel;
  // Defaults go after the spread: `timeZone: undefined` (a framework's unset
  // input) or `locale: ''` (an empty lang attribute) must not erase them.
  const kernel =
    options.kernel ??
    createKernel({
      ...options,
      timeZone: options.timeZone || Temporal.Now.timeZoneId(),
      locale: options.locale || doc.documentElement.lang || 'en',
    } as KernelOptions);

  const initialView = kernel.getState().view;
  if (!DRAWN.has(initialView.family)) throw new RangeError(`the ${initialView.family} family is drawn from Phase 4`);

  let messages = options.messages ?? messagesFor(kernel.getState().locale);
  let messagesGiven = options.messages !== undefined;
  let motion = options.motion ?? NO_MOTION;

  const root = h(doc, 'div', 'dz-cal');
  root.dir = directionOf(kernel.getState().locale);
  const toolbar = h(doc, 'div', 'dz-toolbar');
  const btn = (cls: string, onClick: () => void) => {
    const b = h(doc, 'button', `dz-toolbar__btn ${cls}`) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  const prev = btn('dz-toolbar__prev', () => go('prev'));
  const today = btn('dz-toolbar__today', () => go('today'));
  const next = btn('dz-toolbar__next', () => go('next'));
  const title = h(doc, 'h2', 'dz-toolbar__title');
  title.setAttribute('aria-live', 'polite');
  toolbar.append(prev, today, next, title);
  root.append(toolbar);

  const ctx = { doc, messages, locale: kernel.getState().locale, zone: kernel.getState().timeZone, motion };
  let view: TimeGridView | null = null;
  let pendingDir: 'prev' | 'next' | 'other' | null = null;
  let firstPaint = true;
  /** While `update` applies several changes, the kernel's events wait for one paint at the end. */
  let holding = false;
  let dirty = false;

  function labels(): void {
    // Chevrons follow the reading direction: "previous" points back in either script.
    const rtl = root.dir === 'rtl';
    prev.textContent = rtl ? '›' : '‹';
    prev.setAttribute('aria-label', messages.previous);
    next.textContent = rtl ? '‹' : '›';
    next.setAttribute('aria-label', messages.next);
    today.textContent = messages.today;
  }

  function paint(): void {
    if (holding) {
      dirty = true;
      return;
    }
    const state = kernel.getState();
    // Rewriting an aria-live title, even with the same words, announces it again.
    if (title.textContent !== state.title) title.textContent = state.title;
    const vm = kernel.viewModel();
    if (vm.family !== 'timeGrid') throw new Error(`${vm.family} is drawn from Phase 4`);
    ctx.zone = state.timeZone;
    if (!view) {
      view = createTimeGridView(ctx);
      root.append(view.element);
    }
    const created = view.render(vm.model, state);
    if (options.nowIndicator !== false) view.renderNow(kernel.now());
    if (pendingDir && !firstPaint) motion.viewChange?.(view.body, pendingDir);
    else if (!firstPaint && created.length > 0) motion.eventsEnter?.(created);
    pendingDir = null;
    if (firstPaint) {
      firstPaint = false;
      const scroll = Temporal.Duration.from(options.scrollTime ?? 'PT8H').total({ unit: 'minutes' });
      // From the model, so a kernel handed in with its own slotMin scrolls right too.
      const slotMin = vm.model.options.slotMin;
      const min = slotMin ? Temporal.Duration.from(slotMin).total({ unit: 'minutes' }) : 0;
      view.scrollToMinutes(Math.max(0, scroll - min));
    }
  }

  function go(dir: NavDirection): void {
    pendingDir = dir === 'prev' || dir === 'next' ? dir : 'other';
    kernel.navigate(dir);
  }

  const unsubscribe = kernel.subscribe(() => paint());

  // Once a minute, aligned on the minute: the now line moves, and past
  // midnight the kernel moves "today" too.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const untilNextMinute = () => 60000 - (kernel.now().epochMilliseconds % 60000);
  const tick = () => {
    if (!kernel.refreshToday()) view?.renderNow(kernel.now());
    timer = setTimeout(tick, untilNextMinute());
  };
  if (options.nowIndicator !== false) timer = setTimeout(tick, untilNextMinute());

  labels();
  host.append(root);
  paint();

  return {
    kernel,
    element: root,
    update(changes) {
      const state = kernel.getState();
      holding = true;
      try {
        if (changes.motion && changes.motion !== motion) {
          motion.destroy?.();
          motion = ctx.motion = changes.motion;
        }
        const newLocale = changes.locale !== undefined && changes.locale !== '' && changes.locale !== state.locale ? changes.locale : null;
        const newMessages = changes.messages !== undefined && changes.messages !== messages ? changes.messages : null;
        if (newLocale) {
          kernel.setLocale(newLocale);
          root.dir = directionOf(newLocale);
        }
        if (newMessages) messagesGiven = true;
        if (newMessages || newLocale) {
          messages = newMessages ?? (messagesGiven ? messages : messagesFor(newLocale ?? state.locale));
          labels();
          view?.relabel(messages, kernel.getState().locale);
          dirty = true;
        }
        if (changes.timeZone && changes.timeZone !== state.timeZone) kernel.setTimeZone(changes.timeZone);
        const viewType = changes.view ?? state.view.type;
        const sameView = viewType === state.view.type;
        const sameDate = changes.date === undefined || changes.date.equals(state.date);
        if (!(sameView && sameDate)) {
          // Refused before anything moves: the kernel could build the model, but nothing here would draw it.
          const spec = kernel.getViewSpec(viewType);
          if (!spec) throw new RangeError(`unknown view: ${viewType}`);
          if (!DRAWN.has(spec.family)) throw new RangeError(`the ${spec.family} family is drawn from Phase 4`);
          pendingDir = 'other';
          kernel.setView(viewType, changes.date);
        }
      } finally {
        holding = false;
      }
      if (dirty) {
        dirty = false;
        paint();
      }
    },
    navigate: go,
    destroy() {
      clearTimeout(timer);
      unsubscribe();
      motion.destroy?.();
      if (owned) kernel.destroy();
      root.remove();
    },
  };

}
