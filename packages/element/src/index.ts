/**
 * @dzcalendar/element — DzCalendar as a Web Component, for any page or
 * framework (React, Vue, Svelte, plain HTML).
 *
 * ```html
 * <script type="module">import '@dzcalendar/element/define';</script>
 * <dz-calendar view="timeGridWeek" time-zone="Europe/Paris" locale="fr-FR"></dz-calendar>
 * ```
 *
 * In the page by default (the page's CSS, a theme, Tailwind apply as they
 * do to the calendar anywhere); `shadow` isolates it in a shadow root, styled
 * then by the `--tz-*` / `--dz-*` palette, a `stylesheet` URL and
 * `::part(calendar | toolbar)`. Callbacks are DOM events (`dz-select`,
 * `dz-event-click`…, composed: they cross the shadow root). Bad input never
 * throws: it is a `dz-problem` event.
 */
import { Temporal, isValidZone } from '@dzcalendar/core';
import type { EventInput, EventSourceSpec, PlainDate, Problem, ResourceInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance, CalendarOptions, CalendarUpdate } from '@dzcalendar/dom';

/** An attribute and the option it sets (read as a string, a boolean, a number or a date). */
const ATTRIBUTES = {
  view: ['view', 'string'],
  date: ['date', 'date'],
  'time-zone': ['timeZone', 'string'],
  locale: ['locale', 'string'],
  theme: ['theme', 'string'],
  scheme: ['scheme', 'string'],
  density: ['density', 'string'],
  editable: ['editable', 'boolean'],
  selectable: ['selectable', 'boolean'],
  'week-numbers': ['weekNumbers', 'boolean'],
  weekends: ['weekends', 'boolean'],
  'now-indicator': ['nowIndicator', 'boolean'],
} as const;
type Attr = keyof typeof ATTRIBUTES;

/** The calendar's callbacks, as the DOM events the element dispatches (their `detail` is the callback's argument). */
const EVENTS = {
  onSelect: 'dz-select',
  onUnselect: 'dz-unselect',
  onDateClick: 'dz-date-click',
  onEventClick: 'dz-event-click',
  onEventOpen: 'dz-event-open',
  onCreateRequest: 'dz-create-request',
  onSlotClick: 'dz-slot-click',
  onCommandRefused: 'dz-command-refused',
  onProposalRefused: 'dz-proposal-refused',
  onResourceProblems: 'dz-resource-problems',
} as const;

/** What could not be read: where (`attribute:time-zone`, `property:options`), and a short code (`unknown-zone`…). */
const problem = (path: string, detail: string): Problem => ({ code: 'invalid-option', severity: 'error', path, detail });

/** A boolean attribute taken away: back to the calendar's own default. */
const DEFAULTS: Record<string, boolean> = { editable: false, selectable: false, weekNumbers: false, weekends: true, nowIndicator: true };

/** On a server (no DOM), a class to extend all the same: importing the element never throws; defining it does nothing there. */
const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

/**
 * Options a calendar takes live (`update`): changing one in `options` changes
 * it in place — events, edits and the undo history stay. Any other key makes
 * the calendar again (on its store: events and edits kept), with `dz-remade`.
 */
const LIVE = new Set(['messages', 'locale', 'timeZone', 'motion', 'hooks', 'businessHours', 'availableSlots', 'hiddenDays', 'resourceOrder', 'resourceGroupField', 'showUnassigned', 'timeline', 'collapsedResources', 'collapsedGroups', 'timeGrid', 'weekends', 'weekNumbers', 'multiMonthMaxColumns', 'headerViews', 'headerToolbar', 'customButtons', 'theme', 'scheme', 'density', 'displayCalendar', 'secondaryCalendar', 'viewOptions', 'editable', 'contextMenu', 'snapMinutes', 'selectable', 'chooseScope', 'dragEdgeNavigate', 'eventResizableFromStart', 'keyboardUndo']);

/**
 * The callbacks whose presence changes what the calendar offers ("Open" in
 * the menu, "New event here", slots as buttons): passed only when the page
 * listens to their event (or gives the callback in `options`).
 */
const OFFERS: Record<string, string> = { onEventOpen: 'dz-event-open', onCreateRequest: 'dz-create-request', onSlotClick: 'dz-slot-click' };

/** At most this many problems kept on `problems` (the oldest go). */
const KEEP = 100;

/** The callbacks whose second argument matters too: their event's detail is both. */
const PAIRS: Record<string, readonly [string, string]> = { onCommandRefused: ['result', 'command'] };

export class DzCalendarElement extends Base {
  static readonly observedAttributes = Object.keys(ATTRIBUTES);

  #cal: CalendarInstance | null = null;
  #options: CalendarOptions = {};
  #events: readonly EventInput[] | undefined;
  #resources: readonly ResourceInput[] | undefined;
  #sources: readonly EventSourceSpec[] | undefined;
  #stylesheet: HTMLLinkElement | null = null;
  /** The mode chosen at the first connection (an element does not change sides afterwards). */
  #shadow: boolean | null = null;
  #problemsSeen: Problem[] = [];

  /** Every problem seen so far (also each a `dz-problem` event): what a page that listened late can read. */
  get problems(): readonly Problem[] {
    return this.#problemsSeen;
  }

  constructor() {
    super();
    // Properties set before the element was defined (a framework rendering first): taken back through the setters.
    for (const prop of ['options', 'events', 'resources', 'sources'] as const) {
      if (Object.hasOwn(this, prop)) {
        const v = (this as unknown as Record<string, unknown>)[prop];
        delete (this as unknown as Record<string, unknown>)[prop];
        (this as unknown as Record<string, unknown>)[prop] = v;
      }
    }
  }

  /** The DOM calendar (null while the element is not in the document): everything the attributes do not cover. */
  get calendar(): CalendarInstance | null {
    return this.#cal;
  }

  /** Every other option (`resources`, `businessHours`, `hooks`, `motion`…); the attributes win over it. */
  get options(): CalendarOptions {
    return this.#options;
  }
  set options(o: CalendarOptions) {
    if (o === null || typeof o !== 'object' || Array.isArray(o)) {
      this.#problem(problem('property:options', 'not-an-object'));
      return;
    }
    // What changed, by value (a framework handing a new object each render changes nothing).
    const was = this.#options as Record<string, unknown>;
    const now = o as Record<string, unknown>;
    const changed = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((k) => was[k] !== now[k]);
    this.#options = o;
    if (!this.#cal || changed.length === 0) return;
    // Callbacks are read when they run; the offering ones are given or taken back.
    const offers = changed.filter((k) => k in OFFERS);
    const rest = changed.filter((k) => !(k in EVENTS));
    if (offers.length > 0) this.#offer();
    if (rest.length === 0) return;
    if (rest.every((k) => LIVE.has(k))) {
      try {
        this.#cal.update(Object.fromEntries(rest.map((k) => [k, now[k]])) as CalendarUpdate);
      } catch {
        this.#problem(problem('property:options', 'refused'));
      }
      return;
    }
    // Made again, on the same store (its events and edits kept), the view and date it showed; said.
    const s = this.#cal.kernel.getState();
    const store = this.#cal.kernel.store;
    this.#unmount();
    this.#mount({ view: s.view.type, date: s.date, store });
    if (this.#cal) this.dispatchEvent(new CustomEvent('dz-remade', { detail: { calendar: this.#cal }, bubbles: true, composed: true }));
  }

  get events(): readonly EventInput[] | undefined {
    return this.#events;
  }
  set events(list: readonly EventInput[] | undefined) {
    if (list !== undefined && list !== null && !Array.isArray(list)) {
      this.#problem(problem('property:events', 'not-a-list'));
      return;
    }
    this.#events = list ?? undefined;
    // What could not be read is said (as the Angular wrapper's problems output does).
    if (this.#cal) this.#problems(this.#cal.kernel.setEvents(list ?? []).problems);
  }

  get resources(): readonly ResourceInput[] | undefined {
    return this.#resources;
  }
  set resources(list: readonly ResourceInput[] | undefined) {
    if (list !== undefined && list !== null && !Array.isArray(list)) {
      this.#problem(problem('property:resources', 'not-a-list'));
      return;
    }
    this.#resources = list ?? undefined;
    if (this.#cal) this.#problems(this.#cal.kernel.setResources(list ?? []));
  }

  get sources(): readonly EventSourceSpec[] | undefined {
    return this.#sources;
  }
  set sources(list: readonly EventSourceSpec[] | undefined) {
    if (list !== undefined && list !== null && !Array.isArray(list)) {
      this.#problem(problem('property:sources', 'not-a-list'));
      return;
    }
    this.#sources = list ?? undefined;
    if (!this.#cal) return;
    for (const id of this.#cal.kernel.sources.ids()) if (id !== 'events') this.#cal.kernel.sources.remove(id);
    this.#sources = this.#addSources(this.#cal, list ?? []);
  }

  /** Adds each source; one that cannot be read is a problem, and left out (the next calendar is not made with it). */
  #addSources(cal: CalendarInstance, list: readonly EventSourceSpec[]): EventSourceSpec[] {
    const kept: EventSourceSpec[] = [];
    list.forEach((spec, i) => {
      try {
        cal.kernel.sources.add(spec);
        kept.push(spec);
      } catch {
        this.#problem(problem(`property:sources[${i}]`, 'refused'));
      }
    });
    return kept;
  }

  /** Who listens to what: an offering callback is given to the calendar once its event is listened to. */
  #listened = new Set<string>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
    super.addEventListener(type, listener, options);
    if (Object.values(OFFERS).includes(type) && !this.#listened.has(type)) {
      this.#listened.add(type);
      if (this.#cal) this.#offer();
    }
  }

  /** The offering callbacks the page wants: listened to, or given in `options`. */
  #offers(): Record<string, (...a: unknown[]) => void> {
    const out: Record<string, (...a: unknown[]) => void> = {};
    for (const [cb, type] of Object.entries(OFFERS)) if (this.#listened.has(type) || typeof (this.#options as Record<string, unknown>)[cb] === 'function') out[cb] = this.#callback(cb);
    return out;
  }
  #offer(): void {
    const want = this.#offers();
    try {
      this.#cal?.update(Object.fromEntries(Object.keys(OFFERS).map((cb) => [cb, want[cb]])) as CalendarUpdate);
    } catch {
      /* a calendar being destroyed */
    }
  }

  /** A callback: the page told (a dz-* event), then the application's own in `options` (read when it runs). */
  #callback(cb: string): (...a: unknown[]) => void {
    const type = (EVENTS as Record<string, string>)[cb]!;
    return (...a: unknown[]) => {
      const pair = PAIRS[cb];
      const detail = pair ? { [pair[0]]: a[0], [pair[1]]: a[1] } : a[0];
      this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
      ((this.#options as Record<string, unknown>)[cb] as ((...x: unknown[]) => unknown) | undefined)?.(...a);
    };
  }

  connectedCallback(): void {
    // Not a block by itself (a custom element is inline): the calendar takes the width it is given.
    if (this.#shadow === null && !this.style.display && this.ownerDocument.defaultView?.getComputedStyle(this).display === 'inline') this.style.display = 'block';
    if (!this.#cal) this.#mount();
  }

  disconnectedCallback(): void {
    // Moved within the document, the element is connected again in the same task: kept.
    queueMicrotask(() => {
      if (!this.isConnected) this.#unmount();
    });
  }

  attributeChangedCallback(name: string, was: string | null, now: string | null): void {
    if (!this.#cal || was === now) return;
    const changes = this.#read([name as Attr]);
    if (changes === null) return;
    if (typeof changes['timeZone'] === 'string' && !isValidZone(changes['timeZone'])) return this.#problem(problem(`attribute:${name}`, 'unknown-zone'));
    if (typeof changes['view'] === 'string' && !this.#cal.kernel.getViewSpec(changes['view'])) return this.#problem(problem(`attribute:${name}`, 'unknown-view'));
    try {
      this.#cal.update(changes as CalendarUpdate);
    } catch {
      this.#problem(problem(`attribute:${name}`, 'refused'));
    }
  }

  navigate(dir: 'prev' | 'next' | 'today'): void {
    this.#cal?.navigate(dir);
  }
  update(changes: CalendarUpdate): void {
    try {
      this.#cal?.update(changes);
    } catch {
      this.#problem(problem('update', 'refused'));
    }
  }
  undo(): boolean {
    return this.#cal?.undo() ?? false;
  }
  redo(): boolean {
    return this.#cal?.redo() ?? false;
  }

  /** The options the attributes say (each read; one that cannot be is a problem, left out). */
  #read(names: readonly Attr[]): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    for (const name of names) {
      const [key, kind] = ATTRIBUTES[name] ?? [];
      if (!key) continue;
      const raw = this.getAttribute(name);
      if (kind === 'boolean') {
        // Present (or "true"): on; "false": off; taken away after the start: the calendar's default again.
        if (raw !== null) out[key] = raw !== 'false';
        else if (this.#cal) out[key] = DEFAULTS[key] ?? false;
        continue;
      }
      if (raw === null || raw === '') continue;
      if (kind === 'date') {
        try {
          out[key] = Temporal.PlainDate.from(raw) as PlainDate;
        } catch {
          this.#problem(problem(`attribute:${name}`, 'not-a-date'));
        }
        continue;
      }
      out[key] = raw;
    }
    return names.length === 1 && Object.keys(out).length === 0 && ATTRIBUTES[names[0]!]?.[1] !== 'boolean' ? null : out;
  }

  #mount(keep: { view: string; date: PlainDate; store?: CalendarInstance['kernel']['store'] } | null = null): void {
    // An Angular <dz-calendar> already drew here (the same tag name): left alone.
    if (!this.shadowRoot && this.querySelector(':scope > .dz-cal')) return this.#problem(problem('element', 'already-a-calendar'));
    const shadow = (this.#shadow ??= this.hasAttribute('shadow'));
    let host: HTMLElement = this;
    if (shadow) {
      const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      root.replaceChildren();
      // The theme the page names (a URL), inside the shadow root: the page's own sheets do not reach in.
      const href = this.getAttribute('stylesheet');
      if (href) {
        this.#stylesheet = this.ownerDocument.createElement('link');
        this.#stylesheet.rel = 'stylesheet';
        this.#stylesheet.href = href;
        root.append(this.#stylesheet);
      }
      // A block by default, as in the page.
      const base = this.ownerDocument.createElement('style');
      base.textContent = ':host { display: block; }';
      root.append(base);
      host = this.ownerDocument.createElement('div');
      host.style.display = 'contents';
      root.append(host);
    }
    const attrs = this.#read(Object.keys(ATTRIBUTES) as Attr[]) ?? {};
    const { view: asked, date: askedDate, ...rest } = attrs as { view?: string; date?: PlainDate } & Record<string, unknown>;
    const view = keep?.view ?? asked;
    const date = keep?.date ?? askedDate;
    // What would make no calendar at all (an unknown zone) is left out, said, and the calendar drawn without it.
    if (typeof rest['timeZone'] === 'string' && !isValidZone(rest['timeZone'])) {
      this.#problem(problem('attribute:time-zone', 'unknown-zone'));
      delete rest['timeZone'];
    }
    // Every callback but the offering ones, which wait for a listener (no "Open" with nobody to open it).
    const callbacks = Object.fromEntries(Object.keys(EVENTS).filter((cb) => !(cb in OFFERS)).map((cb) => [cb, this.#callback(cb)]));
    const make = (o: { view: boolean; data: boolean }) =>
      createCalendar(host, {
        ...this.#options,
        ...rest,
        ...(view && o.view && { initialView: view }),
        ...(date && { initialDate: date }),
        // Made again: on the store it had (its events and edits), the events not given anew over them.
        ...(keep?.store ? { store: keep.store } : this.#events && { events: this.#events }),
        ...(o.data && this.#resources && { resources: this.#resources }),
        ...callbacks,
        ...this.#offers(),
      } as CalendarOptions);
    // Drawn whatever is wrong: first as given; then without the sources and resources (each said); then without the view.
    const attempts: { view: boolean; data: boolean; blame: () => void }[] = [
      { view: true, data: true, blame: () => {} },
      { view: true, data: false, blame: () => this.#problem(problem(this.#resources ? 'property:resources' : 'property:sources', 'refused')) },
      { view: false, data: false, blame: () => view && this.#problem(problem('attribute:view', 'unknown-view')) },
    ];
    for (const a of attempts) {
      try {
        this.#cal = make(a);
        if (a !== attempts[0]) a.blame();
        break;
      } catch {
        host.replaceChildren();
        this.#cal = null;
      }
    }
    if (!this.#cal) {
      this.#problem(problem('property:options', 'refused'));
      return;
    }
    // The sources, one by one (one that cannot be read is said and left out); what the events had to say.
    if (this.#sources) this.#sources = this.#addSources(this.#cal, this.#sources);
    this.#problems(this.#cal.kernel.getProblems()?.problems ?? []);
    if (shadow) {
      this.#cal.element.setAttribute('part', 'calendar');
      this.#cal.element.querySelector('.dz-toolbar')?.setAttribute('part', 'toolbar');
    }
    // What the dates and the view now are, once drawn and on every move.
    const say = () => {
      const s = this.#cal?.kernel.getState();
      if (s) this.dispatchEvent(new CustomEvent('dz-dates-set', { detail: { view: s.view.type, date: s.date, range: s.range, title: s.title, timeZone: s.timeZone }, bubbles: true, composed: true }));
    };
    this.#cal.kernel.subscribe((e) => e.type === 'state' && say());
    say();
  }

  #unmount(): void {
    this.#cal?.destroy();
    this.#cal = null;
    this.#stylesheet = null;
    if (this.shadowRoot) this.shadowRoot.replaceChildren();
  }

  #problems(ps: readonly Problem[]): void {
    if (ps.length === 0) return;
    this.#problemsSeen.push(...ps);
    if (this.#problemsSeen.length > KEEP) this.#problemsSeen.splice(0, this.#problemsSeen.length - KEEP);
    // After the current task: an element upgraded as the page is parsed has no listener yet.
    queueMicrotask(() => this.dispatchEvent(new CustomEvent('dz-problem', { detail: ps, bubbles: true, composed: true })));
  }
  #problem(p: Problem): void {
    this.#problems([p]);
  }
}

/** Defines the element under `name` (once; `dz-calendar` by default). */
export function defineDzCalendar(name = 'dz-calendar'): void {
  if (typeof customElements === 'undefined' || customElements.get(name)) return;
  customElements.define(name, class extends DzCalendarElement {});
}
