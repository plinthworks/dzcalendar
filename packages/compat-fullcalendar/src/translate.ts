import { Temporal, fnSource, jsonSource } from '@dzcalendar/core';
import type { CalEvent, EventInput, Series, EventInstance, EventSourceSpec, Instant, PlainDate, Problem, ResourceInput, StoreChange, ZonedDateTime, ZoneId } from '@dzcalendar/core';
import type { CalendarInstance, CalendarOptions, DateClick } from '@dzcalendar/dom';
import { icalSource } from '@dzcalendar/ical';
import { dateOf10, duration, minutesOf, momentOf, said, weekday, weekdays, zoneOf } from './dates.js';
import { toEvent, toEvents } from './events.js';
import type { EventDefaults } from './events.js';

type Fn = (...a: unknown[]) => unknown;
type Rec = Record<string, unknown>;

/** What a translation gives: the options, what was said, and the callbacks that need the calendar once made. */
export interface Translation {
  readonly options: CalendarOptions;
  readonly problems: readonly Problem[];
  /** Wires what follows the calendar's changes (`datesSet`, `eventDrop`, `loading`…); returns the way to unwire. */
  attach(calendar: CalendarInstance): () => void;
}

/** Options with nothing to do here (everything is built in), left out silently. */
const NOTHING = new Set(['plugins', 'schedulerLicenseKey', 'themeSystem', 'lazyFetching', 'progressiveEventRendering', 'handleWindowResize', 'windowResizeDelay', 'rerenderDelay', 'selectMirror']);
/** Options the theme or the page decide: said with why. */
const CSS = new Set(['height', 'contentHeight', 'aspectRatio', 'expandRows', 'stickyHeaderDates', 'stickyFooterScrollbar', 'dayMinWidth']);
const TONE = new Set(['eventColor', 'eventBackgroundColor', 'eventBorderColor', 'eventTextColor']);
const FORMAT = new Set(['eventTimeFormat', 'slotLabelFormat', 'dayHeaderFormat', 'titleFormat', 'dayPopoverFormat', 'weekNumberFormat', 'listDayFormat', 'listDaySideFormat']);
/** The other library's `display` for every event. */
const DISPLAY: Record<string, EventInput['display']> = { background: 'background', 'inverse-background': 'inverse-background', none: 'none', auto: 'auto', block: 'auto', 'list-item': 'auto' };

const at = (x: Instant | ZonedDateTime | PlainDate, zone: ZoneId): number =>
  x instanceof Temporal.PlainDate ? x.toZonedDateTime({ timeZone: zone }).epochMilliseconds : x.epochMilliseconds;
/** A JS Date for the callbacks (what the other library hands its callbacks). */
const dateOf = (x: Instant | ZonedDateTime | PlainDate, zone: ZoneId): Date => new Date(at(x, zone));
const strOf = (x: Instant | ZonedDateTime | PlainDate, zone: ZoneId): string =>
  x instanceof Temporal.PlainDate ? x.toString() : (x instanceof Temporal.Instant ? x.toZonedDateTimeISO(zone) : x).toString({ timeZoneName: 'never' });

/** What the callbacks get for `jsEvent`: the calendar hands no native event to these, so a stand-in whose `preventDefault` is heard. */
export interface JsEventLike {
  readonly type: string;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}
const jsEvent = (type: string): JsEventLike => {
  const e = { type, defaultPrevented: false, preventDefault: () => void (e.defaultPrevented = true), stopPropagation: () => undefined };
  return e;
};

/** An event as a plain object the other library's callbacks read (no methods: a change is a command). */
export function eventInfo(ev: CalEvent, zone: ZoneId): Rec {
  return {
    id: ev.id,
    groupId: ev.groupId ?? '',
    title: ev.title,
    start: dateOf(ev.start, zone),
    end: dateOf(ev.end, zone),
    startStr: strOf(ev.start, zone),
    endStr: strOf(ev.end, zone),
    allDay: ev.allDay,
    url: ev.url ?? '',
    classNames: [...ev.classNames],
    display: ev.display,
    extendedProps: { ...ev.props },
    resourceIds: [...ev.resourceIds],
  };
}

/** The other library's options as DzCalendar's (see docs/behaviors/fullcalendar-options.md). Never throws. */
export function translate(given: unknown, how: { readonly zone?: ZoneId } = {}): Translation {
  const problems: Problem[] = [];
  const raw: Rec = given && typeof given === 'object' ? (given as Rec) : {};
  if (given === null || typeof given !== 'object') problems.push(said('invalid-option', 'options', typeof given, 'error'));
  // `views: { timeGrid: {…}, timeGridWeek: {…} }`: what concerns the first view laid over the rest; the others said.
  const fc: Rec = { ...raw };
  if (raw['views'] && typeof raw['views'] === 'object') {
    const first = typeof raw['initialView'] === 'string' ? raw['initialView'] : 'dayGridMonth';
    for (const [name, o] of Object.entries(raw['views'] as Rec)) {
      if (o && typeof o === 'object' && first.startsWith(name)) {
        const { type: _t, duration: _d, buttonText: _b, ...rest } = o as Rec;
        Object.assign(fc, rest);
      } else problems.push(said('compat-unsupported', `views.${name}`, 'per-view'));
    }
    delete fc['views'];
  }
  const out: Rec = {};
  const timeGrid: Rec = {};
  const rules: Rec = {};
  let cal: CalendarInstance | null = null;
  // Their options rarely name a zone (theirs is the browser's): the calendar's then (the application's defaults), the browser's only when there is none — said.
  const named = zoneOf(fc['timeZone'], problems);
  const zone = named ?? how.zone ?? Temporal.Now.timeZoneId();
  if (named === undefined && how.zone === undefined) problems.push(said('zone-guessed', 'timeZone', `browser:${zone}`));
  if (named !== undefined || how.zone === undefined) out['timeZone'] = zone;
  const doc = (): Document | null => cal?.element.ownerDocument ?? (typeof document === 'undefined' ? null : document);
  const view = () => {
    const s = cal?.kernel.getState();
    // Their active range is the grid shown (a month's padding days too); their current range the month itself.
    if (s) return { type: s.view.type, title: s.title, activeStart: dateOf(s.range.start, zone), activeEnd: dateOf(s.range.end, zone), currentStart: dateOf(s.range.activeStart, zone), currentEnd: dateOf(s.range.activeEnd, zone) };
    // While the calendar is being made (its first drawing calls the hooks): what the options say, never null (theirs is not).
    const d = out['initialDate'] instanceof Temporal.PlainDate ? dateOf(out['initialDate'], zone) : new Date(NaN);
    return { type: typeof out['initialView'] === 'string' ? out['initialView'] : 'dayGridMonth', title: '', activeStart: d, activeEnd: d, currentStart: d, currentEnd: d };
  };
  const nodeOf = (id: string) => cal?.element.querySelector<HTMLElement>(`[data-event-id="${id.replace(/["\\]/g, '\\$&')}"]`) ?? null;
  const fn = (k: string) => (typeof fc[k] === 'function' ? (fc[k] as Fn) : null);
  const used = new Set<string>(['timeZone']);
  const take = (k: string) => (used.add(k), fc[k]);
  const minutes = (k: string) => (fc[k] === undefined ? null : minutesOf(take(k)) ?? (problems.push(said('invalid-option', k, 'unreadable', 'error')), null));
  /** Whole minutes in [lo, hi], said when bent. */
  const whole = (k: string, m: number, lo: number, hi: number) => {
    const w = Math.min(hi, Math.max(lo, Math.round(m)));
    if (w !== m) problems.push(said('invalid-option', k, `rounded:${w}`));
    return w;
  };
  const date = (k: string, x: unknown) => {
    const m = momentOf(x, zone, k, problems);
    return m ? dateOf10(m) : null;
  };

  for (const k of ['initialView', 'locale', 'editable', 'selectable', 'nowIndicator', 'weekNumbers', 'weekends', 'eventMaxStack', 'allDaySlot', 'displayEventTime'] as const) if (fc[k] !== undefined) out[k] = take(k);
  if (fc['initialDate'] !== undefined) {
    const d = date('initialDate', take('initialDate'));
    if (d) out['initialDate'] = d;
  }
  if (fc['firstDay'] !== undefined) {
    const d = weekday(take('firstDay'));
    if (d) out['firstDay'] = d;
    else problems.push(said('invalid-option', 'firstDay', 'not-a-day', 'error'));
  }
  if (fc['hiddenDays'] !== undefined) {
    const d = weekdays(take('hiddenDays'));
    if (d) out['hiddenDays'] = d;
    else problems.push(said('invalid-option', 'hiddenDays', 'not-a-list', 'error'));
  }
  if (fc['direction'] !== undefined && take('direction') === 'rtl') problems.push(said('compat-unsupported', 'direction', 'from-locale'));
  // Theirs shows every event of a day unless told otherwise: the weeks grow (dayMaxLanes null).
  out['dayMaxLanes'] = null;
  for (const k of ['dayMaxEventRows', 'dayMaxEvents']) {
    const v = take(k);
    if (typeof v === 'number') out['dayMaxLanes'] = v;
    else if (v === true) out['dayMaxLanes'] = 'auto';
  }
  // The hours of a time grid; a timeline's slot.
  for (const [k, to] of [['slotMinTime', 'slotMin'], ['slotMaxTime', 'slotMax']] as const) {
    const m = minutes(k);
    if (m !== null) timeGrid[to] = duration(m);
  }
  const slot = minutes('slotDuration');
  if (slot !== null) {
    if (/timeline/i.test(String(out['initialView'] ?? ''))) out['timeline'] = { slot: slot >= 1440 ? 'day' : whole('slotDuration', slot, 1, 1440) };
    else timeGrid['slotMinutes'] = whole('slotDuration', slot, 1, 1440);
  }
  const snap = minutes('snapDuration');
  if (snap !== null) out['snapMinutes'] = whole('snapDuration', snap, 1, 1440);
  const scroll = minutes('scrollTime');
  if (scroll !== null) out['scrollTime'] = duration(scroll);
  if (Object.keys(timeGrid).length > 0) out['timeGrid'] = timeGrid;
  // Business hours: the same shape, Monday = 1.
  const bh = (x: unknown, path: string): unknown => {
    if (x === true || x === false) return x;
    if (Array.isArray(x)) return x.map((y, i) => bh(y, `${path}[${i}]`)).filter((y) => y !== undefined);
    if (!x || typeof x !== 'object') return void problems.push(said('invalid-option', path, typeof x, 'error'));
    const o = x as Rec;
    const start = o['startTime'] === undefined ? 540 : minutesOf(o['startTime']);
    const end = o['endTime'] === undefined ? 1020 : minutesOf(o['endTime']);
    if (start === null || end === null) return void problems.push(said('invalid-option', path, 'unreadable', 'error'));
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    return { daysOfWeek: weekdays(o['daysOfWeek']) ?? [1, 2, 3, 4, 5], start: hhmm(start), end: hhmm(end) };
  };
  if (fc['businessHours'] !== undefined) {
    const b = bh(take('businessHours'), 'businessHours');
    if (b !== undefined) out['businessHours'] = b;
  }
  // The rules (made with the calendar).
  if (fc['eventConstraint'] !== undefined) {
    const c = take('eventConstraint');
    if (c === 'businessHours' || (c && typeof c === 'object' && 'groupId' in (c as Rec))) rules['constraint'] = c;
    else problems.push(said('compat-unsupported', 'eventConstraint', 'shape'));
  }
  if (fc['eventOverlap'] !== undefined) {
    const o = take('eventOverlap');
    rules['overlap'] = typeof o === 'function' ? (still: CalEvent, moving: CalEvent) => Boolean((o as Fn)(eventInfo(still, zone), eventInfo(moving, zone))) : Boolean(o);
  }
  const allow = fn('eventAllow') ?? fn('selectAllow');
  if (allow) {
    used.add('eventAllow').add('selectAllow');
    rules['allow'] = (p: { start: ZonedDateTime | PlainDate; end: ZonedDateTime | PlainDate; resourceId?: string; event?: CalEvent }) =>
      Boolean(allow({ start: dateOf(p.start, zone), end: dateOf(p.end, zone), startStr: strOf(p.start, zone), endStr: strOf(p.end, zone), allDay: p.start instanceof Temporal.PlainDate, resource: p.resourceId ? { id: p.resourceId } : null }, p.event ? eventInfo(p.event, zone) : null));
  }
  if (fc['validRange'] && typeof fc['validRange'] === 'object') {
    const v = take('validRange') as Rec;
    const s = date('validRange.start', v['start']);
    const e = date('validRange.end', v['end']);
    rules['validRange'] = { ...(s && { start: s }), ...(e && { end: e }) };
  }
  if (Object.keys(rules).length > 0) out['rules'] = rules;
  // The toolbar's views: the view switch (whether each can be drawn is checked on the calendar).
  const bar = take('headerToolbar');
  if (bar && typeof bar === 'object') {
    const named = Object.values(bar as Rec).flatMap((v) => (typeof v === 'string' ? v.split(/[ ,]+/) : [])).filter((x) => x && !['prev', 'next', 'today', 'title', 'prevYear', 'nextYear'].includes(x));
    if (named.length > 0) out['headerViews'] = named;
  }
  // What every event takes when it does not say.
  const defaults: { -readonly [K in keyof EventDefaults]: EventDefaults[K] } = {};
  for (const [k, field] of [['eventStartEditable', 'startEditable'], ['eventDurationEditable', 'durationEditable'], ['eventResourceEditable', 'resourceEditable']] as const) if (fc[k] !== undefined) defaults[field] = Boolean(take(k));
  if (fc['eventClassNames'] !== undefined) {
    const c = take('eventClassNames');
    if (typeof c === 'string') defaults.classNames = c.split(/\s+/).filter(Boolean);
    else if (Array.isArray(c)) defaults.classNames = c.filter((x): x is string => typeof x === 'string');
    else problems.push(said('compat-unsupported', 'eventClassNames', 'function'));
  }
  if (typeof fc['eventDisplay'] === 'string') defaults.display = DISPLAY[take('eventDisplay') as string] ?? 'auto';
  // Events and sources.
  const inline: EventInput[] = [];
  const sources: EventSourceSpec[] = [];
  const source = (s: unknown, i: number, path = `eventSources[${i - 1}]`) => {
    const id = `fc-${i}`;
    if (Array.isArray(s)) return void inline.push(...toEvents(s, zone, path, problems, defaults));
    if (typeof s === 'string') return void sources.push(jsonSource(id, { url: s, map: (r) => ({ events: toEvents(r, zone, id, [], defaults) }) }));
    if (typeof s === 'function') return void sources.push(fnSource(id, fetcher(s as Fn)));
    if (!s || typeof s !== 'object') return void problems.push(said('invalid-event', path, typeof s, 'error'));
    const o = s as Rec;
    const sid = typeof o['id'] === 'string' || typeof o['id'] === 'number' ? String(o['id']) : id;
    const own: EventDefaults = { ...defaults, ...(o['editable'] !== undefined && { startEditable: Boolean(o['editable']), durationEditable: Boolean(o['editable']) }), ...(classesOf(o['classNames']) && { classNames: classesOf(o['classNames'])! }) };
    for (const c of ['color', 'backgroundColor', 'borderColor', 'textColor']) if (o[c] !== undefined) problems.push(said('compat-unsupported', `${path}.${c}`, 'tone'));
    if (o['format'] === 'ics' && typeof o['url'] === 'string') return void sources.push(icalSource(sid, { url: o['url'], defaultZone: zone }));
    if (o['googleCalendarId'] !== undefined) return void problems.push(said('compat-unsupported', `${path}.googleCalendarId`, 'google'));
    if (Array.isArray(o['events'])) return void inline.push(...toEvents(o['events'], zone, `${path}.events`, problems, own));
    if (typeof o['events'] === 'function') return void sources.push(fnSource(sid, fetcher(o['events'] as Fn, own)));
    const url = typeof o['url'] === 'string' ? o['url'] : typeof o['events'] === 'string' ? o['events'] : null;
    if (!url) return void problems.push(said('invalid-event', path, 'no-events', 'error'));
    let extra: unknown = o['extraParams'];
    if (typeof extra === 'function') {
      try {
        extra = (extra as Fn)();
      } catch {
        problems.push(said('invalid-option', `${path}.extraParams`, 'threw', 'error'));
        extra = undefined;
      }
    }
    sources.push(
      jsonSource(sid, {
        url,
        ...(typeof extra === 'object' && extra !== null ? { params: Object.fromEntries(Object.entries(extra as Rec).map(([k, v]) => [k, String(v)])) } : {}),
        ...(typeof o['startParam'] === 'string' && { startParam: o['startParam'] }),
        ...(typeof o['endParam'] === 'string' && { endParam: o['endParam'] }),
        ...(typeof o['timeZoneParam'] === 'string' && { zoneParam: o['timeZoneParam'] }),
        ...(String(o['method']).toUpperCase() === 'POST' && { method: 'POST' as const }),
        map: (r) => ({ events: toEvents(r, zone, sid, [], own) }),
      }),
    );
  };
  function classesOf(x: unknown): string[] | null {
    return typeof x === 'string' ? x.split(/\s+/).filter(Boolean) : Array.isArray(x) ? x.filter((c): c is string => typeof c === 'string') : null;
  }
  /** A function source: given the dates (as the other library's fetch info), answering by callbacks or a promise. */
  function fetcher(f: Fn, own: EventDefaults = defaults) {
    return (req: { window: { start: Instant; end: Instant } | null }) =>
      new Promise<{ events: EventInput[]; problems: Problem[] }>((resolve, reject) => {
        const w = req.window;
        const info = w ? { start: dateOf(w.start, zone), end: dateOf(w.end, zone), startStr: strOf(w.start, zone), endStr: strOf(w.end, zone), timeZone: zone } : {};
        const done = (list: unknown) => {
          const ps: Problem[] = [];
          resolve({ events: toEvents(list, zone, 'events', ps, own), problems: ps });
        };
        const r = f(info, done, reject);
        if (r && typeof (r as Promise<unknown>).then === 'function') (r as Promise<unknown>).then(done, reject);
      });
  }
  const evs = take('events');
  if (evs !== undefined) source(evs, 0, 'events');
  if (Array.isArray(fc['eventSources'])) (take('eventSources') as unknown[]).forEach((s, i) => source(s, i + 1));
  if (inline.length > 0 || Array.isArray(evs)) out['events'] = inline;
  if (sources.length > 0) out['sources'] = sources;
  // Resources (a tree given nested: flattened with their parent), their columns.
  const resources: ResourceInput[] = [];
  const flat = (r: unknown, parent: string | undefined, path: string) => {
    if (!r || typeof r !== 'object' || (typeof (r as Rec)['id'] !== 'string' && typeof (r as Rec)['id'] !== 'number')) return void problems.push(said('invalid-resource', path, 'no-id', 'error'));
    const { children, eventColor, eventBackgroundColor, businessHours, ...rest } = r as Rec;
    if (eventColor !== undefined || eventBackgroundColor !== undefined) problems.push(said('compat-unsupported', `${path}.eventColor`, 'tone'));
    const b = businessHours === undefined ? undefined : bh(businessHours, `${path}.businessHours`);
    resources.push({ ...(rest as unknown as ResourceInput), id: String(rest['id']), ...(parent !== undefined && { parentId: parent }), ...(b !== undefined && { businessHours: b as never }) });
    if (Array.isArray(children)) children.forEach((c, i) => flat(c, String(rest['id']), `${path}.children[${i}]`));
  };
  if (Array.isArray(fc['resources'])) (take('resources') as unknown[]).forEach((r, i) => flat(r, undefined, `resources[${i}]`));
  else if (fc['resources'] !== undefined) (take('resources'), problems.push(said('compat-unsupported', 'resources', 'not-a-list')));
  if (resources.length > 0) out['resources'] = resources;
  for (const k of ['resourceGroupField', 'resourceOrder'] as const) if (fc[k] !== undefined) out[k] = take(k);
  if (Array.isArray(fc['resourceAreaColumns'])) {
    const cols = (take('resourceAreaColumns') as unknown[]).filter((c): c is Rec => !!c && typeof c === 'object').map((c) => ({ field: String(c['field'] ?? 'title'), ...(typeof c['headerContent'] === 'string' && { header: c['headerContent'] }), ...(typeof c['width'] === 'number' && { width: c['width'] }) }));
    out['viewOptions'] = { timeline: { areaColumns: cols } };
  }
  // Render hooks: a function, or what one would return (text, { html }, { domNodes }).
  const hook = (k: string): Fn | null => {
    const v = take(k);
    if (v === undefined) return null;
    if (typeof v === 'function') return v as Fn;
    if (k.endsWith('Content')) return () => v;
    problems.push(said('invalid-option', k, typeof v, 'error'));
    return null;
  };
  const content = hook('eventContent');
  const didMount = hook('eventDidMount');
  const willUnmount = hook('eventWillUnmount');
  const label = hook('resourceLabelContent');
  const dayContent = hook('dayHeaderContent');
  const dayDidMount = hook('dayHeaderDidMount');
  const dayWillUnmount = hook('dayHeaderWillUnmount');
  /** A day head's argument, as the other library gives it. */
  const dayArg = (d: { date: PlainDate; text: string; today: boolean; resource: { id: string } | null }, el: HTMLElement) => {
    const today = cal?.kernel.getState().today ?? Temporal.Now.plainDateISO(zone);
    const c = Temporal.PlainDate.compare(d.date, today);
    return { date: dateOf(d.date, zone), text: d.text, isToday: d.today, isPast: c < 0, isFuture: c > 0, resource: d.resource ? { id: d.resource.id } : undefined, el, view: view() };
  };
  const arg = (inst: EventInstance, el: HTMLElement, timeText: string) => ({ event: eventInfo(inst.event, zone), el, timeText, view: view(), isStart: true, isEnd: true });
  const rendered = (r: unknown): string | Node | null => {
    if (r === undefined || r === null || r === true || r === false) return null;
    if (typeof r === 'string') return r;
    const d = doc();
    if (d && r instanceof d.defaultView!.Node) return r as Node;
    const o = r as Rec;
    if (d && o['html'] !== undefined) {
      const t = d.createElement('template');
      t.innerHTML = String(o['html']);
      return t.content;
    }
    if (d && Array.isArray(o['domNodes'])) {
      const f = d.createDocumentFragment();
      f.append(...(o['domNodes'] as Node[]));
      return f;
    }
    return null;
  };
  if (content || didMount || willUnmount || label || dayContent || dayDidMount || dayWillUnmount) {
    type Ctx = { instance: EventInstance; timeText: string };
    out['hooks'] = {
      ...((content || didMount || willUnmount) && {
        event: {
          ...(content && { content: (ctx: Ctx, el: HTMLElement) => rendered(content(arg(ctx.instance, el, ctx.timeText))) }),
          ...(didMount && { didMount: ({ el, ctx }: { el: HTMLElement; ctx: Ctx }) => void didMount(arg(ctx.instance, el, ctx.timeText)) }),
          ...(willUnmount && { willUnmount: ({ el, ctx }: { el: HTMLElement; ctx: Ctx }) => void willUnmount(arg(ctx.instance, el, ctx.timeText)) }),
        },
      }),
      ...((dayContent || dayDidMount || dayWillUnmount) && {
        dayHeader: {
          ...(dayContent && { content: (d: never, el: HTMLElement) => rendered(dayContent(dayArg(d, el))) }),
          ...(dayDidMount && { didMount: ({ el, ctx }: { el: HTMLElement; ctx: never }) => void dayDidMount(dayArg(ctx, el)) }),
          ...(dayWillUnmount && { willUnmount: ({ el, ctx }: { el: HTMLElement; ctx: never }) => void dayWillUnmount(dayArg(ctx, el)) }),
        },
      }),
      ...(label && { resource: { content: (ctx: { resource: { id: string; title: string } }) => rendered(label({ resource: { id: ctx.resource.id, title: ctx.resource.title }, fieldValue: ctx.resource.title })) } }),
    };
  }
  // Callbacks the calendar calls.
  const eventClick = fn('eventClick');
  const dateClick = fn('dateClick');
  const select = fn('select');
  const unselect = fn('unselect');
  used.add('eventClick').add('dateClick').add('select').add('unselect');
  // A click on an event with a url follows it, unless eventClick said no (returned false, or prevented the stand-in).
  out['onEventClick'] = (inst: EventInstance) => {
    const e = jsEvent('click');
    const r = eventClick?.({ event: eventInfo(inst.event, zone), el: nodeOf(inst.event.id), jsEvent: e, view: view() });
    const url = inst.event.url;
    if (url && r !== false && !e.defaultPrevented) doc()?.defaultView?.open(url, '_self');
  };
  if (dateClick)
    out['onDateClick'] = (c: DateClick) => {
      const t = c.allDay ? c.date : c.instant;
      dateClick({ date: dateOf(t, zone), dateStr: strOf(t, zone), allDay: c.allDay, resource: c.resourceId ? { id: c.resourceId } : undefined, jsEvent: jsEvent('click'), view: view() });
    };
  if (select)
    out['onSelect'] = (s: { start: ZonedDateTime | PlainDate; end: ZonedDateTime | PlainDate; allDay: boolean; resourceId?: string }) =>
      select({ start: dateOf(s.start, zone), end: dateOf(s.end, zone), startStr: strOf(s.start, zone), endStr: strOf(s.end, zone), allDay: s.allDay, resource: s.resourceId ? { id: s.resourceId } : undefined, jsEvent: jsEvent('pointerup'), view: view() });
  if (unselect) out['onUnselect'] = () => unselect({ jsEvent: jsEvent('pointerdown'), view: view() });
  // Callbacks that follow the calendar (wired by attach).
  const after = { datesSet: fn('datesSet'), eventDrop: fn('eventDrop'), eventResize: fn('eventResize'), eventChange: fn('eventChange'), eventAdd: fn('eventAdd'), eventRemove: fn('eventRemove'), eventsSet: fn('eventsSet'), loading: fn('loading') };
  for (const k of Object.keys(after)) used.add(k);
  // What is left: CSS, nothing to do, colours, formats, or no equivalent.
  for (const k of Object.keys(fc)) {
    if (used.has(k) || k in out || NOTHING.has(k)) continue;
    problems.push(said('compat-unsupported', k, CSS.has(k) ? 'css' : TONE.has(k) ? 'tone' : FORMAT.has(k) ? 'locale' : 'none'));
  }

  return {
    options: out as CalendarOptions,
    problems,
    attach(calendar) {
      cal = calendar;
      const offs: (() => void)[] = [];
      const k = calendar.kernel;
      if (after.datesSet) {
        // Once per view and dates, as the other library does: a title or a locale changing is not new dates.
        let last = '';
        const say = () => {
          const s = k.getState();
          const key = `${s.view.type}|${s.range.start}|${s.range.end}`;
          if (key === last) return;
          last = key;
          after.datesSet!({ start: dateOf(s.range.start, zone), end: dateOf(s.range.end, zone), startStr: s.range.start.toString(), endStr: s.range.end.toString(), timeZone: zone, view: view() });
        };
        offs.push(k.subscribe((e) => e.type === 'state' && say()));
        say();
      }
      if (after.loading) offs.push(k.subscribe((e) => void (e.type === 'source' && e.notice.type === 'loading' && after.loading!(e.notice.loading))));
      if (after.eventsSet) {
        // Once per burst of changes (a source's chunks come in several).
        let queued = false;
        offs.push(
          k.subscribe((e) => {
            if (e.type !== 'store' || queued) return;
            queued = true;
            queueMicrotask(() => {
              queued = false;
              if (cal === calendar) after.eventsSet!([...k.store.snapshot.allEvents()].map((x) => eventInfo(x, zone)));
            });
          }),
        );
      }
      if (after.eventDrop || after.eventResize || after.eventChange || after.eventAdd || after.eventRemove) {
        offs.push(
          k.subscribe((e) => {
            if (e.type !== 'store') return;
            const change: StoreChange = e.change;
            // A person's change (a validated command: a gesture, the keyboard, the menu, the editor), as the other library says it —
            // not the application's own run, a source's delivery nor an undo.
            if (change.cause !== 'command' || !e.validated) return;
            // Exactly this change (a late refusal of the first of two drags takes back the first), not the last undo.
            const revert = () => void k.history.revert(change.applied);
            // An occurrence moved alone becomes an event of its own (an override): to the other library, the series' event changed.
            const occurrence = new Map<string, { series: Series; key: string }>();
            for (const m of change.applied) {
              if (m.kind !== 'series' || !m.after) continue;
              for (const [key, id] of m.after.overrides) if (!m.before?.overrides.has(key)) occurrence.set(id, { series: m.after, key });
            }
            for (const m of change.applied) {
              if (m.kind !== 'event') continue;
              const was = m.before as CalEvent | undefined;
              const now = m.after as CalEvent | undefined;
              const of = now && !was ? occurrence.get(now.id) : undefined;
              if (of && now) {
                const base = eventInfo(of.series.base, zone);
                const start = momentOf(of.key, zone, 'key', []);
                const s0 = start ? (start.length === 10 ? Temporal.PlainDate.from(start) : Temporal.ZonedDateTime.from(start)) : of.series.base.start;
                const length = at(of.series.base.end, zone) - at(of.series.base.start, zone);
                const oldEvent = { ...base, id: of.series.id, start: dateOf(s0, zone), end: new Date(at(s0, zone) + length), startStr: strOf(s0, zone) };
                const event: Rec = { ...eventInfo(now, zone), id: of.series.id };
                const info = { event, oldEvent, relatedEvents: [], revert, view: view() };
                if (oldEvent.startStr !== event['startStr'] || base['resourceIds']!.toString() !== now.resourceIds.join()) after.eventDrop?.({ ...info, delta: null, jsEvent: jsEvent('pointerup') });
                else after.eventResize?.({ ...info, startDelta: null, endDelta: null, jsEvent: jsEvent('pointerup') });
                after.eventChange?.(info);
              } else if (!was && now) after.eventAdd?.({ event: eventInfo(now, zone), relatedEvents: [], revert });
              else if (was && !now) after.eventRemove?.({ event: eventInfo(was, zone), relatedEvents: [], revert });
              else if (was && now) {
                const info = { event: eventInfo(now, zone), oldEvent: eventInfo(was, zone), relatedEvents: [], revert, view: view() };
                const moved = String(was.start) !== String(now.start) || was.resourceIds.join() !== now.resourceIds.join();
                if (moved) after.eventDrop?.({ ...info, delta: null, jsEvent: jsEvent('pointerup') });
                else if (String(was.end) !== String(now.end)) after.eventResize?.({ ...info, startDelta: null, endDelta: null, jsEvent: jsEvent('pointerup') });
                after.eventChange?.(info);
              }
            }
          }),
        );
      }
      return () => {
        for (const off of offs) off();
        if (cal === calendar) cal = null;
      };
    },
  };
}

export { toEvent };
