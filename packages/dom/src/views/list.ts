import { formatTemporal, registerModelFamily } from '@dzcalendar/core';
import type { CalEvent, Command, EventInstance, KernelState, Segment } from '@dzcalendar/core';
import { buildListModel } from '@dzcalendar/core/views';
import type { ListDay, ListEntry, ListModel } from '@dzcalendar/core/views';
import { KeyedList, applyEventLook, attachMenuTriggers, ensureStyles, fillEvent, formatMinutes, h, registerView, startReadingOf, timeLabels, unmountEvent } from '@dzcalendar/dom/toolkit';
import type { ViewController, ViewCtx } from '@dzcalendar/dom/toolkit';

/** Layout only; the look comes with the CSS pass. */
export const LIST_CSS = `
.dz-list { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--dz-border, var(--tz-border, GrayText)); border-radius: var(--dz-radius, var(--tz-radius, 0.375rem)); }
.dz-list__head { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; gap: 0.5rem; margin: 0; padding: 0.375rem 0.75rem; font-size: 0.875rem; font-weight: 600; background: var(--dz-bg-raised, var(--tz-bg-raised, Canvas)); border-block-end: 1px solid var(--dz-border, var(--tz-border, GrayText)); }
.dz-list__date { all: unset; cursor: pointer; }
.dz-list__date:focus-visible, .dz-list__ev:focus-visible { outline: 2px solid var(--dz-accent, var(--tz-accent, Highlight)); outline-offset: -2px; }
.dz-list__len { font-weight: 400; color: var(--tz-fg-muted, GrayText); }
.dz-list__items { list-style: none; margin: 0; padding: 0; }
.dz-list__ev { display: flex; align-items: baseline; gap: 0.75rem; padding: 0.375rem 0.75rem; cursor: pointer; border-block-end: 1px solid var(--dz-border, var(--tz-border, GrayText)); }
.dz-list__time { flex: none; min-inline-size: 9rem; color: var(--tz-fg-muted, GrayText); font-variant-numeric: tabular-nums; }
.dz-list__time .dz-ev__offset, .dz-list__time .dz-ev__real { color: var(--dz-fg, var(--tz-fg, CanvasText)); font-size: 0.6875rem; }
.dz-list__dot { flex: none; align-self: center; inline-size: 0.625rem; block-size: 0.625rem; border-radius: 50%; background: var(--dz-event-accent, var(--tz-accent, Highlight)); }
.dz-list__empty { padding: 2rem 1rem; text-align: center; color: var(--tz-fg-muted, GrayText); }
`;

interface DayItem {
  readonly key: string;
  readonly sig: string;
  readonly day: ListDay;
}

interface EntryItem {
  readonly key: string;
  readonly sig: string;
  readonly content: string;
  readonly entry: ListEntry;
  /** The day's place in the list, for the hooks' segment. */
  readonly index: number;
}

/** The entry as a one-day segment, for the content hooks. */
const segmentOf = (e: ListEntry, index: number): Segment => ({
  key: e.key,
  instance: e.instance,
  dayIndex: index,
  dayCount: 1,
  part: 0,
  startsHere: e.startsHere,
  endsHere: e.endsHere,
  from: e.start ? e.start.toInstant() : (e.instance.event.start as Segment['from']),
  to: e.end ? e.end.toInstant() : (e.instance.event.end as Segment['to']),
});

/**
 * The period as a list of days, each with its events in reading order. One
 * tab stop (roving) over the events; arrows go from event to event, PageUp
 * and PageDown from day to day.
 */
export function createListView(ctx: ViewCtx): ViewController {
  const { doc } = ctx;
  if (ctx.injectStyles) ensureStyles(ctx.popoverElement, 'list', LIST_CSS);
  const root = h(doc, 'div', 'dz-list');
  const body = h(doc, 'div', 'dz-list__body');
  const empty = h(doc, 'p', 'dz-list__empty');
  /** The entries' keys in order at the last render: where a vanished entry stood. */
  let prevOrder: string[] = [];
  root.append(body);
  let model: ListModel | null = null;
  let created: HTMLElement[] = [];
  /** The entry holding the tab stop; `refocus` asks for it to take the focus once drawn. */
  let cursorKey: string | null = null;
  let refocus = false;
  const entryLists = new Map<string, KeyedList<EntryItem>>();
  const byKey = new Map<string, ListEntry>();

  const dayView = () => (ctx.kernel.getViewSpec('timeGridDay') ? 'timeGridDay' : ctx.kernel.getViewSpec('dayGridDay') ? 'dayGridDay' : null);
  const longDate = (day: ListDay) => formatTemporal(day.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, ctx.locale);

  const days = new KeyedList<DayItem>(
    body,
    (it) => {
      const section = h(doc, 'section', 'dz-list__day');
      const head = h(doc, 'h3', 'dz-list__head');
      const items = h(doc, 'ul', 'dz-list__items');
      section.append(head, items);
      entryLists.set(it.key, new KeyedList<EntryItem>(items, () => {
        const li = h(doc, 'li', 'dz-list__li');
        const ev = h(doc, 'div', 'dz-list__ev');
        ev.setAttribute('role', 'button');
        li.append(ev);
        return li;
      }, (li, e, changed) => drawEntry(li.firstElementChild as HTMLElement, e, changed.created), (li) => unmountEvent(ctx, li.firstElementChild as HTMLElement)));
      return section;
    },
    (section, it) => drawDay(section, it),
    (section) => {
      const key = section.dataset['key'] ?? '';
      entryLists.get(key)?.clear();
      entryLists.delete(key);
    },
  );

  function drawDay(section: HTMLElement, it: DayItem): void {
    const { day } = it;
    section.dataset['date'] = String(day.date);
    const head = section.firstElementChild as HTMLElement;
    const view = dayView();
    const date = h(doc, view ? 'button' : 'span', 'dz-list__date', longDate(day));
    if (view) {
      (date as HTMLButtonElement).type = 'button';
      // The events are the list's tab stop; the date is reached by pointer and screen-reader browsing.
      date.tabIndex = -1;
      date.addEventListener('click', () => ctx.kernel.setView(view, day.date));
    }
    head.replaceChildren(date);
    // A 23- or 25-hour day says how long it really is.
    if (day.lengthMinutes !== 1440) head.append(h(doc, 'span', 'dz-list__len', formatMinutes(day.lengthMinutes, ctx.locale)));
  }

  /** Each day's events, every render: a day's heading may be unchanged while its events are not. */
  function syncEntries(day: ListDay, index: number): void {
    const list = entryLists.get(String(day.date));
    if (!list) return;
    created.push(
      ...list
        .sync(
          day.entries.map((entry) => ({
            key: entry.key,
            sig: '',
            content: `${entry.instance.event.revision}|${entry.allDay}|${entry.start}|${entry.end}|${index}|${ctx.epoch}`,
            entry,
            index,
          })),
        )
        .map((li) => li.firstElementChild as HTMLElement),
    );
  }

  /** The hours of the part on this day, with offsets where a repeated hour makes them ambiguous. */
  function labelsOf(e: ListEntry) {
    const ev = e.instance.event;
    if (e.allDay || ev.allDay || !e.start || !e.end) return { text: ctx.messages.allDay, spoken: ctx.messages.allDay, real: '', offset: null };
    const zone = ev.start.timeZoneId;
    const part = { ...ev, start: e.start.withTimeZone(zone), end: e.end.withTimeZone(zone) } as CalEvent;
    const start = startReadingOf(part, ctx.zone);
    const end = startReadingOf({ ...part, start: part.end } as CalEvent, ctx.zone);
    // The real length, said and shown when the clock faces do not tell it (a 25-hour day).
    const realMinutes = (e.end.epochMilliseconds - e.start.epochMilliseconds) / 60_000;
    return timeLabels(ctx, part, { ...(start && { start }), ...(end && { end }), realMinutes });
  }

  function drawEntry(el: HTMLElement, it: EntryItem, created: boolean): void {
    const e = it.entry;
    const ev = e.instance.event;
    byKey.set(e.key, e);
    applyEventLook(el, ev);
    el.dataset['segment'] = e.key;
    el.tabIndex = e.key === cursorKey ? 0 : -1;
    const title = ev.title || ctx.messages.untitled;
    const labels = labelsOf(e);
    el.setAttribute('aria-label', ctx.messages.eventLabel({ title, time: labels.spoken }));
    const fallback = () => {
      const time = h(doc, 'span', 'dz-list__time', labels.text);
      time.dir = 'ltr';
      if (labels.offset) time.append(h(doc, 'span', 'dz-ev__offset', labels.offset));
      if (labels.real) time.append(h(doc, 'span', 'dz-ev__real', labels.real));
      const dot = h(doc, 'span', 'dz-list__dot');
      dot.setAttribute('aria-hidden', 'true');
      return [time, dot, h(doc, 'span', 'dz-list__title', title)];
    };
    fillEvent(ctx, el, { instance: e.instance, segment: segmentOf(e, it.index), timeText: labels.text, displayZone: ctx.zone, family: 'list' }, fallback, created);
  }

  // ── what the person does ──────────────────────────────────────────────
  const entries = () => [...body.querySelectorAll<HTMLElement>('.dz-list__ev')];
  const instanceOf = (el: Element | null): { el: HTMLElement; instance: EventInstance } | null => {
    const node = el?.closest<HTMLElement>('.dz-list__ev');
    const e = node ? byKey.get(node.dataset['segment'] ?? '') : undefined;
    return node && e ? { el: node, instance: e.instance } : null;
  };

  function rove(key: string | null, focus: boolean): void {
    cursorKey = key;
    for (const n of entries()) n.tabIndex = n.dataset['segment'] === key ? 0 : -1;
    if (focus && key) entries().find((n) => n.dataset['segment'] === key)?.focus();
  }

  const activate = (instance: EventInstance) => {
    const live = ctx.live();
    if (live.onEventClick) live.onEventClick(instance);
    else live.onEventOpen?.(instance);
  };

  const undoKey = () => (ctx.live().keyboardUndo === false ? '' : /Mac|iPhone|iPad/.test(doc.defaultView?.navigator.platform ?? '') ? '⌘Z' : 'Ctrl+Z');

  async function remove(instance: EventInstance, node: HTMLElement): Promise<void> {
    if (ctx.live().editable !== true) return ctx.announce(ctx.messages.notEditable);
    const ev = instance.event;
    let command: Command = { type: 'event.delete', id: ev.id };
    if (ev.ref) {
      const r = node.getBoundingClientRect();
      const scope = await ctx.chooseScope({ instance, kind: 'delete' }, { x: r.left, y: r.bottom });
      if (!scope || ctx.scope.isDisposed) return;
      command = { type: 'event.delete', id: ev.ref.seriesId, key: ev.ref.key, scope };
    }
    // The focus goes on to the next event (or the one before) once this one is gone.
    const all = entries();
    const at = all.indexOf(node);
    const next = all[at + 1] ?? all[at - 1];
    const result = ctx.kernel.run(command, { validate: true });
    if (!result.ok) return ctx.refused(result, command);
    ctx.announce(ctx.messages.eventDeleted({ title: ev.title || ctx.messages.untitled, undo: undoKey() }));
    cursorKey = next?.dataset['segment'] ?? null;
    refocus = true;
    // Drawn already if the store change painted at once; otherwise at the next render.
    if (cursorKey && entries().some((n) => n.dataset['segment'] === cursorKey)) {
      refocus = false;
      rove(cursorKey, true);
    }
  }

  ctx.scope.on(root, 'click', (e) => {
    const hit = instanceOf(e.target as Element);
    if (!hit) return;
    rove(hit.el.dataset['segment'] ?? null, false);
    activate(hit.instance);
  });
  ctx.scope.on(root, 'focusin', (e) => {
    const hit = instanceOf(e.target as Element);
    if (hit && hit.el.dataset['segment'] !== cursorKey) rove(hit.el.dataset['segment'] ?? null, false);
  });
  ctx.scope.on(root, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    const hit = instanceOf(ke.target as Element);
    if (!hit || ke.altKey || ke.ctrlKey || ke.metaKey) return;
    const all = entries();
    const at = all.indexOf(hit.el);
    const dayStart = (dir: 1 | -1) => {
      const section = hit.el.closest('.dz-list__day');
      const sections = [...body.querySelectorAll<HTMLElement>('.dz-list__day')];
      const target = sections[sections.indexOf(section as HTMLElement) + dir];
      return target?.querySelector<HTMLElement>('.dz-list__ev') ?? null;
    };
    let to: HTMLElement | null | undefined;
    switch (ke.key) {
      case 'ArrowDown':
        to = all[at + 1];
        break;
      case 'ArrowUp':
        to = all[at - 1];
        break;
      case 'Home':
        to = all[0];
        break;
      case 'End':
        to = all[all.length - 1];
        break;
      case 'PageDown':
        to = dayStart(1);
        break;
      case 'PageUp':
        to = dayStart(-1);
        break;
      case 'Enter':
      case ' ':
        ke.preventDefault();
        activate(hit.instance);
        return;
      case 'Delete':
      case 'Backspace':
        ke.preventDefault();
        void remove(hit.instance, hit.el);
        return;
      default:
        return;
    }
    ke.preventDefault();
    if (to) rove(to.dataset['segment'] ?? null, true);
  });

  attachMenuTriggers(ctx, root, (target) => {
    const hit = instanceOf(target);
    if (hit) return { target: { kind: 'event', instance: hit.instance }, anchor: hit.el };
    const section = target.closest<HTMLElement>('.dz-list__day');
    const head = target.closest<HTMLElement>('.dz-list__head');
    if (!section || !head || !model) return null;
    const day = model.days.find((d) => String(d.date) === section.dataset['date']);
    return day ? { target: { kind: 'day', date: day.date }, anchor: (head.querySelector<HTMLElement>('.dz-list__date') ?? head) } : null;
  });

  return {
    element: root,
    body,
    render(next: unknown, s: KernelState) {
      const m = next as ListModel;
      model = m;
      created = [];
      root.setAttribute('aria-label', s.title);
      const focused = root.contains(doc.activeElement);
      byKey.clear();
      days.sync(m.days.map((day) => ({ key: String(day.date), sig: `${day.lengthMinutes}|${ctx.epoch}`, day })));
      m.days.forEach(syncEntries);
      // Every entry redrawn or not is known by its key for the handlers.
      for (const day of m.days) for (const e of day.entries) byKey.set(e.key, e);
      if (m.days.length === 0) {
        empty.textContent = ctx.messages.noEvents;
        if (!empty.isConnected) root.append(empty);
      } else empty.remove();
      // The tab stop stays on its entry while it is listed; else on the same event (moved to
      // another day), else at the place it held; else the first.
      if (!cursorKey || !byKey.has(cursorKey)) {
        const all = m.days.flatMap((d) => d.entries);
        const was = prevOrder.indexOf(cursorKey ?? '');
        const instance = cursorKey?.slice(0, cursorKey.lastIndexOf('|'));
        cursorKey = (all.find((e) => e.instance.key === instance) ?? all[Math.min(Math.max(was, 0), all.length - 1)])?.key ?? null;
      }
      prevOrder = m.days.flatMap((d) => d.entries.map((e) => e.key));
      const lost = focused && !root.contains(doc.activeElement);
      rove(cursorKey, refocus || lost);
      // Nothing left to focus: the empty message holds it, so it does not fall to the page.
      if (lost && !cursorKey) {
        empty.tabIndex = -1;
        empty.focus();
      }
      refocus = false;
      return created;
    },
    tick() {
      /* nothing moves with the minute */
    },
    destroy() {
      days.clear();
      root.remove();
    },
  };
}

registerModelFamily<ListModel>('list', {
  build: (range, snap, { displayZone }) => buildListModel(range, snap, { displayZone }),
});
registerView('list', createListView);
