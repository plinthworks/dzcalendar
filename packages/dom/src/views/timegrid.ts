import { formatTemporal, locateNow } from '@dzcalendar/core';
import type { AllDayBar, AxisBand, Instant, KernelState, PlacedTimed, TimeGridColumn, TimeGridModel, ZoneId } from '@dzcalendar/core';
import type { DzMessages } from '../messages.js';
import type { MotionAdapter } from '../motion.js';
import { KeyedList, h } from '../render/reconcile.js';

export interface Ctx {
  readonly doc: Document;
  messages: DzMessages;
  locale: string;
  zone: ZoneId;
  motion: MotionAdapter;
}

const HM = { hour: '2-digit', minute: '2-digit' } as const;

const unitFormats = new Map<string, Intl.NumberFormat>();

/** "2 h", "1 h 30 min", "45 min" in the reader's language. */
function formatMinutes(minutes: number, locale: string): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const unit = (n: number, u: 'hour' | 'minute') => {
    const key = `${locale}|${u}`;
    let f = unitFormats.get(key);
    if (!f) unitFormats.set(key, (f = new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'short' })));
    return f.format(n);
  };
  if (h === 0) return unit(m, 'minute');
  return m === 0 ? unit(h, 'hour') : `${unit(h, 'hour')} ${unit(m, 'minute')}`;
}

/** Stable small ids for model objects: a column whose object did not change is not redrawn. */
const ids = new WeakMap<object, number>();
let nextId = 0;
const idOf = (o: object) => {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = ++nextId));
  return id;
};

interface ColumnItem {
  readonly key: string;
  readonly sig: string;
  readonly column: TimeGridColumn;
  readonly today: boolean;
}

interface EventItem {
  readonly key: string;
  readonly sig: string;
  readonly placed: PlacedTimed;
}

/** One rendered column: its own lists, so updating it never touches the others. */
interface ColumnParts {
  readonly bands: HTMLElement;
  readonly events: KeyedList<EventItem>;
  readonly background: KeyedList<EventItem>;
}

export interface TimeGridView {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  render(model: TimeGridModel, state: KernelState): HTMLElement[];
  renderNow(now: Instant): void;
  /** Words or locale changed: everything that carries text is redrawn. */
  relabel(messages: DzMessages, locale: string): void;
  scrollToMinutes(minutes: number): void;
}

export function createTimeGridView(ctx: Ctx): TimeGridView {
  const { doc } = ctx;
  const root = h(doc, 'div', 'dz-tg');
  const head = h(doc, 'div', 'dz-tg__row dz-tg__head');
  const corner = h(doc, 'div', 'dz-tg__corner');
  head.append(corner);
  const allday = h(doc, 'div', 'dz-tg__row dz-tg__allday');
  const alldayLabel = h(doc, 'div', 'dz-tg__allday-label');
  const track = h(doc, 'div', 'dz-tg__allday-track');
  allday.append(alldayLabel, track);
  const body = h(doc, 'div', 'dz-tg__body');
  const grid = h(doc, 'div', 'dz-tg__row dz-tg__grid');
  const gutter = h(doc, 'div', 'dz-tg__gutter');
  gutter.setAttribute('aria-hidden', 'true');
  grid.append(gutter);
  body.append(grid);
  root.append(head, allday, body);

  let model: TimeGridModel | null = null;
  const parts = new Map<string, ColumnParts>();
  let nowEl: HTMLElement | null = null;
  let created: HTMLElement[] = [];

  // ── headers ────────────────────────────────────────────────────────────────
  const heads = new KeyedList<ColumnItem>(
    headHost(head),
    () => h(doc, 'div', 'dz-tg__dayhead'),
    (el, it) => {
      const { date, axis } = it.column;
      el.classList.toggle('dz-tg__dayhead--today', it.today);
      el.replaceChildren(
        h(doc, 'span', 'dz-tg__dayhead-weekday', formatTemporal(date, { weekday: 'short' }, ctx.locale)),
        h(doc, 'span', 'dz-tg__dayhead-date', formatTemporal(date, { day: 'numeric' }, ctx.locale)),
      );
      // A day that is not 24 hours long says so where the eye lands first.
      if (axis.day.lengthMinutes !== 1440) {
        el.append(h(doc, 'span', 'dz-tg__dayhead-note', axis.day.lengthMinutes === 0 ? '—' : formatMinutes(axis.day.lengthMinutes, ctx.locale)));
      }
      if (it.today) el.setAttribute('aria-current', 'date');
      else el.removeAttribute('aria-current');
    },
  );

  function headHost(container: HTMLElement): HTMLElement {
    // Day headers live after the corner cell; a wrapper with display:contents keeps the grid.
    const host = h(doc, 'div', 'dz-tg__heads');
    host.style.display = 'contents';
    container.append(host);
    return host;
  }

  // ── all-day row ────────────────────────────────────────────────────────────
  interface BarItem {
    readonly key: string;
    readonly sig: string;
    readonly bar: AllDayBar;
    readonly bg: boolean;
  }
  const bars = new KeyedList<BarItem>(
    track,
    () => h(doc, 'div', 'dz-bar'),
    (el, it) => {
      const s = it.bar.segment;
      const ev = s.instance.event;
      el.classList.toggle('dz-bar--bg', it.bg);
      el.classList.toggle('dz-bar--cont-start', !s.startsHere);
      el.classList.toggle('dz-bar--cont-end', !s.endsHere);
      el.style.setProperty('--lane', String(it.bar.lane));
      el.style.setProperty('--col', String(s.dayIndex));
      el.style.setProperty('--span', String(s.dayCount));
      applyEventClasses(el, ev.classNames, ev.tone);
      el.textContent = it.bg ? '' : ev.title || ctx.messages.untitled;
      if (!it.bg) {
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', ctx.messages.eventLabel({ title: ev.title || ctx.messages.untitled, time: ctx.messages.allDay }));
      } else {
        el.setAttribute('aria-hidden', 'true');
      }
    },
  );

  // ── columns ────────────────────────────────────────────────────────────────
  // Columns get their own host after the gutter: the list inserts before its
  // first child, and that must never be the gutter (it ended up on the right).
  const colsHost = h(doc, 'div', 'dz-tg__cols');
  colsHost.style.display = 'contents';
  grid.append(colsHost);
  const columns = new KeyedList<ColumnItem>(
    colsHost,
    (it) => {
      const el = h(doc, 'div', 'dz-tg__col');
      el.setAttribute('role', 'group');
      const bands = h(doc, 'div', 'dz-tg__bands');
      const bgHost = h(doc, 'div', 'dz-tg__bg');
      const evHost = h(doc, 'div', 'dz-tg__events');
      for (const x of [bands, bgHost, evHost]) x.style.display = 'contents';
      el.append(bands, bgHost, evHost);
      parts.set(it.key, {
        bands,
        events: new KeyedList<EventItem>(evHost, () => h(doc, 'div', 'dz-ev'), (n, e) => drawEvent(n, e.placed, false)),
        background: new KeyedList<EventItem>(bgHost, () => h(doc, 'div', 'dz-ev dz-ev--bg'), (n, e) => drawEvent(n, e.placed, true)),
      });
      return el;
    },
    (el, it) => drawColumn(el, it),
  );

  function drawColumn(el: HTMLElement, it: ColumnItem): void {
    const { column } = it;
    const p = parts.get(it.key)!;
    el.dataset['date'] = column.key;
    el.setAttribute('aria-label', formatTemporal(column.date, { weekday: 'long', day: 'numeric', month: 'long' }, ctx.locale));
    el.classList.toggle('dz-tg__col--today', it.today);
    el.classList.toggle('dz-tg__col--folded', column.folded);
    el.style.setProperty('--dz-len', String(column.axis.length));
    if (column.folded) {
      p.bands.replaceChildren(h(doc, 'span', 'dz-tg__folded-label', ctx.messages.dayDoesNotExist));
      p.events.sync([]);
      p.background.sync([]);
      return;
    }
    // Hour lines fall on the wall clock's hours: a grid from 08:30 starts half an hour before the first one.
    el.style.setProperty('--dz-line-offset', String((60 - column.axis.start.toZonedDateTimeISO(ctx.zone).minute) % 60));
    p.bands.replaceChildren(...column.axis.bands.map((b) => drawBand(b)));
    p.background.sync(column.background.map(itemOf));
    created.push(...p.events.sync(column.events.map(itemOf)));
  }

  function drawBand(b: AxisBand): HTMLElement {
    const el = h(doc, 'div', `dz-band dz-band--${b.kind}`);
    el.style.setProperty('--t', String(b.from));
    el.style.setProperty('--h', String(b.to - b.from));
    const [a, z] = b.kind === 'gap' ? [b.transition.wallBefore, b.transition.wallAfter] : [b.transition.wallAfter, b.transition.wallBefore];
    const parts2 = { from: formatTemporal(a.toPlainTime(), HM, ctx.locale), to: formatTemporal(z.toPlainTime(), HM, ctx.locale) };
    el.textContent = b.kind === 'gap' ? ctx.messages.gapBand(parts2) : ctx.messages.repeatBand(parts2);
    el.setAttribute('role', 'note');
    return el;
  }

  const itemOf = (placed: PlacedTimed): EventItem => ({
    key: placed.segment.key,
    sig: [
      placed.segment.instance.event.revision,
      placed.top,
      placed.visualHeight,
      placed.left,
      placed.width,
      placed.segment.startsHere,
      placed.segment.endsHere,
      placed.z,
      placed.startReading?.pass ?? '',
      placed.endReading?.pass ?? '',
      placed.realMinutes ?? '',
    ].join('|'),
    placed,
  });

  function drawEvent(el: HTMLElement, p: PlacedTimed, bg: boolean): void {
    const seg = p.segment;
    const ev = seg.instance.event;
    // Toggled one by one: state classes added later (selected, dragging) survive a redraw.
    el.classList.toggle('dz-ev--bg', bg);
    el.classList.toggle('dz-ev--cont-start', !seg.startsHere);
    el.classList.toggle('dz-ev--cont-end', !seg.endsHere);
    applyEventClasses(el, ev.classNames, ev.tone);
    el.style.setProperty('--t', String(p.top));
    el.style.setProperty('--h', String(p.visualHeight));
    el.style.setProperty('--l', String(p.left));
    el.style.setProperty('--w', String(p.width));
    el.style.zIndex = bg ? '' : String(1 + p.z);
    if (bg || ev.allDay) {
      el.replaceChildren();
      return;
    }
    // Clock faces in the display zone. An end is read as an end: one at the
    // fall-back instant closes the first pass at 03:00, not the second's 02:00.
    const startWall = ev.start.withTimeZone(ctx.zone).toPlainDateTime();
    const endWall = ev.end.equals(ev.start)
      ? startWall
      : ev.end.toInstant().subtract({ milliseconds: 1 }).toZonedDateTimeISO(ctx.zone).toPlainDateTime().add({ milliseconds: 1 });
    const mark = (r: PlacedTimed['startReading']) => (r?.pass === 'second' ? ctx.messages.secondPassMark : '');
    const hm = (w: typeof startWall) => formatTemporal(w, HM, ctx.locale);
    const timeText = `${hm(startWall)}${mark(p.startReading)} – ${hm(endWall)}${mark(p.endReading)}`;
    const title = ev.title || ctx.messages.untitled;

    const time = h(doc, 'span', 'dz-ev__time', seg.startsHere ? timeText : '');
    // Times stay left-to-right inside a right-to-left calendar.
    time.dir = 'ltr';
    // Which reading of a repeated hour this is, as the offset that tells them apart.
    if (seg.startsHere && p.startReading?.pass) time.append(h(doc, 'span', 'dz-ev__offset', p.startReading.offset));
    // The axis shows clock time; when that is not the real length, say the real one.
    let real = '';
    if (p.realMinutes !== undefined) {
      const wall = startWall.until(endWall, { largestUnit: 'minutes' }).total({ unit: 'minutes' });
      if (Math.round(wall) !== Math.round(p.realMinutes)) real = ctx.messages.realDuration({ duration: formatMinutes(p.realMinutes, ctx.locale) });
    }
    if (seg.startsHere && real) time.append(h(doc, 'span', 'dz-ev__real', real));
    el.replaceChildren(time, h(doc, 'span', 'dz-ev__title', title));
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    // Said, not marked: the offsets instead of "*", the real length, the
    // event's own zone when it is not the one on screen.
    const spoken = [
      `${hm(startWall)}${p.startReading?.pass ? ` (${p.startReading.offset})` : ''} – ${hm(endWall)}${p.endReading?.pass ? ` (${p.endReading.offset})` : ''}`,
      real,
      ev.start.timeZoneId !== ctx.zone ? ev.start.timeZoneId : '',
    ].filter(Boolean);
    el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: spoken.join(', ') }));
  }

  function applyEventClasses(el: HTMLElement, classNames: readonly string[], tone: string | undefined): void {
    // The event's own classes, swapped as a set: what the last draw added goes first.
    const before = el.dataset['dzClasses'];
    if (before) for (const c of before.split(' ')) el.classList.remove(c);
    for (const c of classNames) el.classList.add(c);
    if (classNames.length > 0) el.dataset['dzClasses'] = classNames.join(' ');
    else delete el.dataset['dzClasses'];
    // Its own variable: `--dz-accent: var(--dz-accent…)` on one element is a cycle, and invalid.
    if (tone) el.style.setProperty('--dz-event-accent', `var(--dz-tone-${tone})`);
    else el.style.removeProperty('--dz-event-accent');
  }

  function drawGutter(m: TimeGridModel): void {
    const first = m.columns.find((c) => !c.folded);
    gutter.style.setProperty('--dz-len', String(first ? first.axis.length : 0));
    gutter.replaceChildren(
      ...m.gutter.map((t) => {
        const el = h(doc, 'span', 'dz-tick', t.major ? formatTemporal(t.label, HM, ctx.locale) : '');
        el.style.setProperty('--t', String(t.position));
        return el;
      }),
    );
  }

  return {
    element: root,
    body,

    render(next, state) {
      created = [];
      const cols = next.columns.map((column): ColumnItem => ({ key: column.key, sig: `${idOf(column)}`, column, today: column.date.equals(state.today) }));
      root.style.setProperty('--dz-cols', String(next.columns.length));
      alldayLabel.textContent = ctx.messages.allDay;
      heads.sync(cols.map((c) => ({ ...c, sig: `${c.sig}|${c.today}` })));
      if (!model || model.allDay !== next.allDay) {
        bars.sync([
          ...next.allDay.background.map((segment) => ({ key: `bg:${segment.key}`, sig: `${segment.instance.event.revision}|${segment.dayIndex}|${segment.dayCount}`, bar: { segment, lane: 0 }, bg: true })),
          ...next.allDay.bars.map((bar) => ({ key: bar.segment.key, sig: `${bar.segment.instance.event.revision}|${bar.lane}|${bar.segment.dayIndex}|${bar.segment.dayCount}`, bar, bg: false })),
        ]);
      }
      if (!model || model.gutter !== next.gutter) drawGutter(next);
      columns.sync(cols.map((c) => ({ ...c, sig: `${c.sig}|${c.today}` })));
      for (const key of parts.keys()) if (!cols.some((c) => c.key === key)) parts.delete(key);
      model = next;
      return created;
    },

    renderNow(now) {
      const at = model ? locateNow(model, now) : null;
      if (!at || !model) {
        nowEl?.remove();
        nowEl = null;
        return;
      }
      const colEl = columns.get(model.columns[at.column]!.key);
      if (!colEl) return;
      nowEl ??= h(doc, 'div', 'dz-now');
      nowEl.setAttribute('aria-hidden', 'true');
      nowEl.style.setProperty('--t', String(at.position));
      if (nowEl.parentElement !== colEl) colEl.append(nowEl);
    },

    relabel(messages, locale) {
      ctx.messages = messages;
      ctx.locale = locale;
      heads.clear();
      bars.clear();
      columns.clear();
      parts.clear();
      model = null;
    },

    scrollToMinutes(minutes) {
      // The real scale, measured once: --dz-minute may be written in rem or calc().
      const col = model?.columns.find((c) => !c.folded);
      const el = col ? columns.get(col.key) : undefined;
      const px = el && col && col.axis.length > 0 ? el.getBoundingClientRect().height / col.axis.length : 0;
      body.scrollTop = minutes * (px || 0.8);
    },
  };
}
