import { written } from './formats.js';
import { decorate, undecorate } from './hooks.js';
import { Temporal, formatTemporal, resolveWall } from '@dzcalendar/core';
import type { Instant, CalEvent, PlainDate, PlainDateTime, Reading, Segment } from '@dzcalendar/core';
import type { EventContentCtx, ViewCtx } from '../host.js';
import { h } from './reconcile.js';

const HM = { hour: '2-digit', minute: '2-digit' } as const;
const unitFormats = new Map<string, Intl.NumberFormat>();

/** "2 h", "1 h 30 min", "45 min" in the reader's language. */
export function formatMinutes(minutes: number, locale: string): string {
  const hours = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const unit = (n: number, u: 'hour' | 'minute') => {
    const key = `${locale}|${u}`;
    let f = unitFormats.get(key);
    if (!f) unitFormats.set(key, (f = new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'short' })));
    return f.format(n);
  };
  if (hours === 0) return unit(m, 'minute');
  return m === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(m, 'minute')}`;
}

export interface TimeLabels {
  /** Shown: "02:30* – 03:00". */
  readonly text: string;
  /** Heard: offsets instead of marks, the real length, the event's own zone. */
  readonly spoken: string;
  /** "7 h real", when the clock faces do not tell the real length. */
  readonly real: string;
  /** The offset that tells a second-pass start apart, if any. */
  readonly offset: string | null;
}

/**
 * The words for a timed event's hours in the display zone. An end is read as
 * an end: one at the fall-back instant closes the first pass at 03:00.
 */
export function timeLabels(ctx: ViewCtx, ev: CalEvent, r: { start?: Reading; end?: Reading; realMinutes?: number }): TimeLabels {
  if (ev.allDay) return { text: ctx.messages.allDay, spoken: ctx.messages.allDay, real: '', offset: null };
  const startWall = ev.start.withTimeZone(ctx.zone).toPlainDateTime();
  const endWall: PlainDateTime = ev.end.equals(ev.start)
    ? startWall
    : ev.end.toInstant().subtract({ milliseconds: 1 }).toZonedDateTimeISO(ctx.zone).toPlainDateTime().add({ milliseconds: 1 });
  const hm = (w: PlainDateTime) => formatTemporal(w, HM, ctx.locale);
  const mark = (x?: Reading) => (x?.pass === 'second' ? ctx.messages.secondPassMark : '');
  // What is seen: the application's formats if given (each hour, or the whole); what is said keeps the full words below.
  const seen = (w: PlainDateTime) => written(ctx, ctx.formats.eventTime, w, () => ({ time: w, event: ev, locale: ctx.locale }), () => hm(w));
  const startText = `${seen(startWall)}${mark(r.start)}`;
  const endText = `${seen(endWall)}${mark(r.end)}`;
  const range = ctx.formats.eventTimeRange;
  const text =
    range === undefined
      ? `${startText} – ${endText}`
      : typeof range === 'function'
        ? written(ctx, range, startWall, () => ({ start: ev.start.withTimeZone(ctx.zone), end: ev.end.withTimeZone(ctx.zone), startText, endText, event: ev, locale: ctx.locale }), () => `${startText} – ${endText}`)
        : `${written(ctx, range, startWall, () => null as never, () => hm(startWall))}${mark(r.start)} – ${written(ctx, range, endWall, () => null as never, () => hm(endWall))}${mark(r.end)}`;
  let real = '';
  if (r.realMinutes !== undefined) {
    const wall = startWall.until(endWall, { largestUnit: 'minutes' }).total({ unit: 'minutes' });
    if (Math.round(wall) !== Math.round(r.realMinutes)) real = ctx.messages.realDuration({ duration: formatMinutes(r.realMinutes, ctx.locale) });
  }
  const spoken = [
    `${hm(startWall)}${r.start?.pass ? ` (${r.start.offset})` : ''} – ${hm(endWall)}${r.end?.pass ? ` (${r.end.offset})` : ''}`,
    real,
    ev.start.timeZoneId !== ctx.zone ? ev.start.timeZoneId : '',
  ]
    .filter(Boolean)
    .join(', ');
  return { text, spoken, real, offset: r.start?.pass ? r.start.offset : null };
}

/**
 * Which pass of a repeated hour an event starts in, for views whose model
 * does not carry readings (the month): a start that reads the same twice in
 * the display zone is told apart — "02:30" and "02:30*".
 */
export function startReadingOf(ev: CalEvent, zone: string): Reading | undefined {
  if (ev.allDay) return undefined;
  const z = ev.start.withTimeZone(zone);
  const r = resolveWall(z.toPlainDate(), z.toPlainTime(), zone, 'earlier');
  if (!r.ambiguous || !r.instant) return undefined;
  return { offset: z.offset, pass: r.instant.equals(ev.start.toInstant()) ? 'first' : 'second' };
}

/** The event's own classes, swapped as a set; its tone as its own variable (no cycle). */
/**
 * "+N"'s words: the count first, the rest in its own span, which a narrow
 * "+N" drops (`@container dz-more`) — "+3" stays read where "+3 autres"
 * would end in "+…". Words with no space are written whole.
 */
export function moreText(el: HTMLElement, text: string): void {
  const m = /^(\S+)(\s.+)$/su.exec(text);
  if (!m) {
    el.textContent = text;
    return;
  }
  const rest = el.ownerDocument.createElement('span');
  rest.className = 'dz-more__rest';
  rest.textContent = m[2]!;
  el.replaceChildren(m[1]!, rest);
}

/** The calendar's now, read once per drawing (a microtask): not once per event drawn. */
const NOWS = new WeakMap<object, Instant>();
export function drawNow(ctx: ViewCtx): Instant {
  let now = NOWS.get(ctx.kernel);
  if (!now) {
    now = ctx.kernel.now();
    NOWS.set(ctx.kernel, now);
    queueMicrotask(() => NOWS.delete(ctx.kernel));
  }
  return now;
}

/** A state as an attribute (`data-today`…, docs/styling.md): present when true, gone when not — for `[data-today]` and Tailwind's `data-[today]:`. */
export function state(el: HTMLElement, name: string, on: boolean): void {
  // Nothing written when nothing changed (no style invalidation, no mutation record).
  el.toggleAttribute(`data-${name}`, on);
}

/**
 * A day's states as attributes (docs/styling.md): its date and ISO weekday;
 * today, past, future (against the calendar's today); outside (a month's
 * padding day); closed (business hours); folded (a day that did not exist).
 */
export function dayStates(el: HTMLElement, date: PlainDate, today: PlainDate | null | undefined, outside: boolean, closed: boolean, folded: boolean): void {
  const c = today ? Temporal.PlainDate.compare(date, today) : null;
  el.dataset['date'] = String(date);
  el.dataset['weekday'] = String(date.dayOfWeek);
  state(el, 'today', c === 0);
  state(el, 'past', c !== null && c < 0);
  state(el, 'future', c !== null && c > 0);
  state(el, 'outside', outside);
  state(el, 'closed', closed);
  state(el, 'folded', folded);
}

/**
 * The event's own look and states on its node (any view): its classes, its
 * tone (\`--dz-event-accent\`, \`data-tone\`), all-day, background, and — when
 * \`now\` is given — past or future (read when it is drawn).
 */
export function applyEventLook(el: HTMLElement, ev: CalEvent, now?: Instant): void {
  state(el, 'all-day', ev.allDay);
  state(el, 'background', ev.display === 'background' || ev.display === 'inverse-background');
  if (ev.tone) el.dataset['tone'] = ev.tone;
  else delete el.dataset['tone'];
  if (now) {
    const ms = now.epochMilliseconds;
    const end = ev.allDay ? null : (ev.end as { epochMilliseconds: number }).epochMilliseconds;
    const start = ev.allDay ? null : (ev.start as { epochMilliseconds: number }).epochMilliseconds;
    state(el, 'past', end !== null && end <= ms);
    state(el, 'future', start !== null && start > ms);
  }
  const before = el.dataset['dzClasses'];
  if (before) for (const c of before.split(' ')) el.classList.remove(c);
  for (const c of ev.classNames) el.classList.add(c);
  if (ev.classNames.length > 0) el.dataset['dzClasses'] = ev.classNames.join(' ');
  else delete el.dataset['dzClasses'];
  if (ev.tone) {
    el.style.setProperty('--dz-event-accent', `var(--dz-tone-${ev.tone})`);
    // A tone may say its own text colour on a solid block (an application's pale tone): unset, the theme's is used.
    el.style.setProperty('--dz-tone-on', `var(--dz-tone-${ev.tone}-on)`);
  }
  else {
    el.style.removeProperty('--dz-event-accent');
    el.style.removeProperty('--dz-tone-on');
  }
  el.dataset['eventId'] = ev.id;
  // An occurrence: its id is `series@start`; the series is what an application looks up.
  if (ev.ref) el.dataset['seriesId'] = ev.ref.seriesId;
  else delete el.dataset['seriesId'];
}


/**
 * Fills an event node: the application's content if its hook returns one,
 * else ours. Called only when the event's content changed, never because a
 * neighbour moved.
 */
/** An application hook that throws must not take the calendar down: reported, and the default used. */
/** An application's hook that throws: reported (an unhandled rejection), the calendar's own drawing kept. */
export function guard<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    void Promise.reject(err);
    return fallback;
  }
}

export function fillEvent(ctx: ViewCtx, el: HTMLElement, content: EventContentCtx, fallback: () => Node[], _created: boolean): void {
  // The same four members as every element: mounted once in the page, let go with the hooks that mounted it.
  decorate(ctx, ctx.hooks.event, el, content, () => el.replaceChildren(...fallback()));
}

/** Before an event node leaves the DOM (or goes back to a pool). */
export function unmountEvent(_ctx: ViewCtx, el: HTMLElement): void {
  undecorate(el);
}

/** The default content of a timed event: hours (with badges) and title. */
export function timedContent(ctx: ViewCtx, labels: TimeLabels, title: string, startsHere: boolean): Node[] {
  const time = h(ctx.doc, 'span', 'dz-ev__time', startsHere && ctx.displayEventTime ? labels.text : '');
  time.dir = 'ltr';
  if (startsHere && labels.offset) time.append(h(ctx.doc, 'span', 'dz-ev__offset', labels.offset));
  if (startsHere && labels.real) time.append(h(ctx.doc, 'span', 'dz-ev__real', labels.real));
  return [time, h(ctx.doc, 'span', 'dz-ev__title', title)];
}
