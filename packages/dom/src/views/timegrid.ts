import { formatTemporal, locateNow } from '@dzcalendar/core';
import type { AllDayBar, AxisBand, PlacedTimed, Segment, TimeGridColumn, TimeGridModel } from '@dzcalendar/core';
import type { ViewController, ViewCtx } from '../host.js';
import { registerView } from '../host.js';
import { attachMenuTriggers } from '../menu.js';
import { applyEventLook, fillEvent, formatMinutes, timeLabels, timedContent, unmountEvent } from '../render/event.js';
import { KeyedList, contentsHost, h } from '../render/reconcile.js';

const HM = { hour: '2-digit', minute: '2-digit' } as const;

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
  /** Position: written as CSS variables only. */
  readonly sig: string;
  /** Content: the event's revision, its readings, the words in force. */
  readonly content: string;
  readonly placed: PlacedTimed;
}

interface ColumnParts {
  readonly hours: HTMLElement;
  readonly bands: HTMLElement;
  readonly events: KeyedList<EventItem>;
  readonly background: KeyedList<EventItem>;
}

export interface TimeGridController extends ViewController {
  columnFor(key: string): HTMLElement | undefined;
}

export function createTimeGridView(ctx: ViewCtx): TimeGridController {
  const { doc } = ctx;
  const root = h(doc, 'div', 'dz-tg');
  const head = h(doc, 'div', 'dz-tg__row dz-tg__head');
  head.append(h(doc, 'div', 'dz-tg__corner'));
  const headsHost = contentsHost(doc, 'dz-tg__heads');
  head.append(headsHost);
  const allday = h(doc, 'div', 'dz-tg__row dz-tg__allday');
  const alldayLabel = h(doc, 'div', 'dz-tg__allday-label');
  const track = h(doc, 'div', 'dz-tg__allday-track');
  allday.append(alldayLabel, track);
  const body = h(doc, 'div', 'dz-tg__body');
  const grid = h(doc, 'div', 'dz-tg__row dz-tg__grid');
  const gutter = h(doc, 'div', 'dz-tg__gutter');
  gutter.setAttribute('aria-hidden', 'true');
  // Columns get their own host after the gutter: a KeyedList owns its container.
  const colsHost = contentsHost(doc, 'dz-tg__cols');
  grid.append(gutter, colsHost);
  body.append(grid);
  root.append(head, allday, body);

  let model: TimeGridModel | null = null;
  let gutterEpoch = -1;
  const parts = new Map<string, ColumnParts>();
  let nowEl: HTMLElement | null = null;
  let created: HTMLElement[] = [];

  // ── headers ────────────────────────────────────────────────────────────────
  const heads = new KeyedList<ColumnItem>(
    headsHost,
    () => h(doc, 'div', 'dz-tg__dayhead'),
    (el, it) => {
      const { date, axis } = it.column;
      el.setAttribute('role', 'columnheader');
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

  // ── all-day row ────────────────────────────────────────────────────────────
  interface BarItem {
    readonly key: string;
    readonly sig: string;
    readonly content: string;
    readonly bar: AllDayBar;
    readonly bg: boolean;
  }
  const bars = new KeyedList<BarItem>(
    track,
    () => h(doc, 'div', 'dz-bar'),
    (el, it, changed) => {
      const s = it.bar.segment;
      const ev = s.instance.event;
      el.classList.toggle('dz-bar--bg', it.bg);
      el.classList.toggle('dz-bar--cont-start', !s.startsHere);
      el.classList.toggle('dz-bar--cont-end', !s.endsHere);
      el.style.setProperty('--lane', String(it.bar.lane));
      el.style.setProperty('--col', String(s.dayIndex));
      el.style.setProperty('--span', String(s.dayCount));
      if (!changed.content) return;
      applyEventLook(el, ev);
      if (it.bg) {
        el.replaceChildren();
        el.setAttribute('aria-hidden', 'true');
        return;
      }
      const title = ev.title || ctx.messages.untitled;
      fillEvent(ctx, el, { instance: s.instance, segment: s, timeText: ctx.messages.allDay, displayZone: ctx.zone, family: 'timeGrid' }, () => [doc.createTextNode(title)], changed.created);
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: ctx.messages.allDay }));
    },
    (el) => unmountEvent(ctx, el),
  );

  // ── columns ────────────────────────────────────────────────────────────────
  const columns = new KeyedList<ColumnItem>(
    colsHost,
    (it) => {
      const el = h(doc, 'div', 'dz-tg__col');
      el.setAttribute('role', 'group');
      const hours = contentsHost(doc, 'dz-tg__hours');
      const bands = contentsHost(doc, 'dz-tg__bands');
      const bgHost = contentsHost(doc, 'dz-tg__bg');
      const evHost = contentsHost(doc, 'dz-tg__events');
      el.append(hours, bands, bgHost, evHost);
      parts.set(it.key, {
        hours,
        bands,
        events: new KeyedList<EventItem>(evHost, () => h(doc, 'div', 'dz-ev'), (n, e, c) => drawEvent(n, e.placed, false, c), (n) => unmountEvent(ctx, n)),
        background: new KeyedList<EventItem>(bgHost, () => h(doc, 'div', 'dz-ev dz-ev--bg'), (n, e, c) => drawEvent(n, e.placed, true, c)),
      });
      return el;
    },
    (el, it) => drawColumn(el, it),
    // A column leaving (navigation) takes its events' hooks with it.
    (el) => {
      const p = parts.get(el.dataset['date'] ?? '');
      p?.events.clear();
      p?.background.clear();
    },
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
      p.hours.replaceChildren();
      p.bands.replaceChildren(h(doc, 'span', 'dz-tg__folded-label', ctx.messages.dayDoesNotExist));
      p.events.sync([]);
      p.background.sync([]);
      return;
    }
    // Hour lines fall on the wall clock's hours: a grid from 08:30 starts half an hour before the first one.
    el.style.setProperty('--dz-line-offset', String((60 - column.axis.start.toZonedDateTimeISO(ctx.zone).minute) % 60));
    p.hours.replaceChildren(
      ...column.offHours.map((o) => {
        const x = h(doc, 'div', 'dz-off');
        x.style.setProperty('--t', String(o.top));
        x.style.setProperty('--h', String(o.height));
        x.setAttribute('aria-hidden', 'true');
        return x;
      }),
    );
    p.bands.replaceChildren(...column.axis.bands.map((b) => drawBand(b)));
    p.background.sync(column.background.map(itemOf));
    created.push(...p.events.sync(column.events.map(itemOf)));
  }

  function drawBand(b: AxisBand): HTMLElement {
    const el = h(doc, 'div', `dz-band dz-band--${b.kind}`);
    el.style.setProperty('--t', String(b.from));
    el.style.setProperty('--h', String(b.to - b.from));
    const [a, z] = b.kind === 'gap' ? [b.transition.wallBefore, b.transition.wallAfter] : [b.transition.wallAfter, b.transition.wallBefore];
    const words = { from: formatTemporal(a.toPlainTime(), HM, ctx.locale), to: formatTemporal(z.toPlainTime(), HM, ctx.locale) };
    el.textContent = b.kind === 'gap' ? ctx.messages.gapBand(words) : ctx.messages.repeatBand(words);
    el.setAttribute('role', 'note');
    return el;
  }

  const itemOf = (placed: PlacedTimed): EventItem => ({
    key: placed.segment.key,
    sig: [placed.top, placed.visualHeight, placed.left, placed.width, placed.z].join('|'),
    content: [
      placed.segment.instance.event.revision,
      placed.segment.startsHere,
      placed.segment.endsHere,
      placed.startReading?.pass ?? '',
      placed.endReading?.pass ?? '',
      placed.realMinutes ?? '',
      ctx.epoch,
    ].join('|'),
    placed,
  });

  function drawEvent(el: HTMLElement, p: PlacedTimed, bg: boolean, changed: { pos: boolean; content: boolean; created: boolean }): void {
    if (changed.pos) {
      el.style.setProperty('--t', String(p.top));
      el.style.setProperty('--h', String(p.visualHeight));
      el.style.setProperty('--l', String(p.left));
      el.style.setProperty('--w', String(p.width));
      el.style.zIndex = bg ? '' : String(1 + p.z);
    }
    if (!changed.content) return;
    const seg = p.segment;
    const ev = seg.instance.event;
    el.classList.toggle('dz-ev--cont-start', !seg.startsHere);
    el.classList.toggle('dz-ev--cont-end', !seg.endsHere);
    applyEventLook(el, ev);
    if (bg || ev.allDay) {
      el.replaceChildren();
      el.setAttribute('aria-hidden', 'true');
      return;
    }
    const labels = timeLabels(ctx, ev, {
      ...(p.startReading && { start: p.startReading }),
      ...(p.endReading && { end: p.endReading }),
      ...(p.realMinutes !== undefined && { realMinutes: p.realMinutes }),
    });
    const title = ev.title || ctx.messages.untitled;
    fillEvent(ctx, el, { instance: seg.instance, segment: seg, timeText: labels.text, displayZone: ctx.zone, family: 'timeGrid' }, () => timedContent(ctx, labels, title, seg.startsHere), changed.created);
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
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

  // ── context menu: an event, or the moment under the pointer in a column ────
  attachMenuTriggers(ctx, root, (target, point) => {
    if (!model) return null;
    const evEl = target.closest<HTMLElement>('.dz-ev:not(.dz-ev--bg), .dz-bar:not(.dz-bar--bg)');
    if (evEl) {
      const seg = findSegment(model, evEl.dataset['key'] ?? '');
      return seg ? { target: { kind: 'event', instance: seg.instance }, anchor: evEl } : null;
    }
    const colEl = target.closest<HTMLElement>('.dz-tg__col');
    if (!colEl) return null;
    const col = model.columns.find((c) => c.key === colEl.dataset['date']);
    if (!col || col.folded) return null;
    // A pointer gives a moment; the keyboard gives the column's first hour.
    let minutes = 0;
    if (point) {
      const rect = colEl.getBoundingClientRect();
      const px = col.axis.length > 0 ? rect.height / col.axis.length : 0;
      minutes = px > 0 ? (point.y - rect.top) / px : 0;
    }
    // On the slot grid: a right-click at 10:37 means the 10:30 slot.
    const snap = ctx.snapMinutes > 0 ? ctx.snapMinutes : 1;
    const snapped = Math.floor(minutes / snap) * snap;
    const at = col.axis.fromPosition(Math.max(0, Math.min(col.axis.length, snapped)));
    return {
      target: { kind: 'slot', date: col.date, instant: at.instant, exists: at.exists, ambiguous: at.ambiguous, alternative: at.alternative },
      anchor: colEl,
    };
  });

  return {
    element: root,
    body,

    render(next, state) {
      const m = next as TimeGridModel;
      created = [];
      const epoch = ctx.epoch;
      const cols = m.columns.map((column): ColumnItem => ({ key: column.key, sig: `${idOf(column)}|${epoch}`, column, today: column.date.equals(state.today) }));
      root.style.setProperty('--dz-cols', String(m.columns.length));
      alldayLabel.textContent = ctx.messages.allDay;
      heads.sync(cols.map((c) => ({ ...c, sig: `${idOf(c.column.axis)}|${c.today}|${epoch}` })));
      bars.sync([
        ...m.allDay.background.map((segment) => ({
          key: `bg:${segment.key}`,
          sig: `${segment.dayIndex}|${segment.dayCount}`,
          content: `${segment.instance.event.revision}|${epoch}`,
          bar: { segment, lane: 0 },
          bg: true,
        })),
        ...m.allDay.bars.map((bar) => ({
          key: bar.segment.key,
          sig: `${bar.lane}|${bar.segment.dayIndex}|${bar.segment.dayCount}`,
          content: `${bar.segment.instance.event.revision}|${bar.segment.startsHere}|${bar.segment.endsHere}|${epoch}`,
          bar,
          bg: false,
        })),
      ]);
      if (!model || model.gutter !== m.gutter || gutterEpoch !== epoch) drawGutter(m);
      gutterEpoch = epoch;
      columns.sync(cols.map((c) => ({ ...c, sig: `${c.sig}|${c.today}` })));
      for (const key of parts.keys()) if (!cols.some((c) => c.key === key)) parts.delete(key);
      model = m;
      return created;
    },

    tick(now) {
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

    scrollTo(minutes) {
      if (!model) return;
      // The real scale, measured once: --dz-minute may be written in rem or calc().
      const col = model.columns.find((c) => !c.folded);
      const el = col ? columns.get(col.key) : undefined;
      const px = el && col && col.axis.length > 0 ? el.getBoundingClientRect().height / col.axis.length : 0;
      body.scrollTop = minutes * (px || 0.8);
    },

    columnFor: (key) => columns.get(key),

    destroy() {
      bars.clear();
      for (const p of parts.values()) {
        p.events.clear();
        p.background.clear();
      }
      columns.clear();
      parts.clear();
      root.remove();
    },
  };
}

function findSegment(model: TimeGridModel, key: string): Segment | undefined {
  for (const c of model.columns) {
    const hit = c.events.find((e) => e.segment.key === key);
    if (hit) return hit.segment;
  }
  return model.allDay.bars.find((b) => b.segment.key === key)?.segment;
}

registerView('timeGrid', createTimeGridView);
