import { Temporal, eventHit, formatTemporal, grabStep, heldEvent, intentFor, isUnchanged, resolveWall, selectionBetween, slotInstant, stepHit } from '@dzcalendar/core';
import type { AvailableSlot, CalEvent, Command, EventInstance, Hit, Intent, PlainDate, Proposal, Selection, Step, ZonedDateTime } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';
import { formatMinutes } from '../render/event.js';
import { commitProposal, timeOf } from './commit.js';
import { clearGhosts, syncGhosts } from './ghosts.js';
import type { InteractionShared } from './host.js';

export interface KeyboardHandle {
  /** Grab mode on an event, from the context menu's "Move…" or "Change duration…". */
  grab(instance: EventInstance, kind: 'move' | 'resize'): void;
  /** After a change made elsewhere (undo, a drop) took the focused node away: the event where it now is, else the cursor. */
  refocus(eventId: string | null): void;
}

/** What grab mode holds between two presses. */
interface Held {
  readonly instance: EventInstance;
  /** The event as the last step left it. */
  event: CalEvent;
  proposal: Proposal | null;
  /** What Enter puts down: the last thing done (a move, or a resize of one edge). */
  kind: 'move' | 'resize';
  edge: 'start' | 'end';
  readonly ghosts: HTMLElement[];
  sources: HTMLElement[];
  readonly node: HTMLElement | null;
  /** In a resource view, the column it is in now (where it was taken, then where each step put it). */
  resourceId: string | undefined;
  /** How it was taken: to move it (M, "Move…") or to change its length ("Change duration…"). */
  readonly mode: 'move' | 'resize';
}

const HM = { hour: '2-digit', minute: '2-digit' } as const;
const sameHit = (a: Hit, b: Hit) =>
  a.kind === b.kind &&
  a.date.equals(b.date) &&
  a.resourceId === b.resourceId &&
  (a.kind === 'slot' ? b.kind === 'slot' && a.instant.equals(b.instant) : b.kind === 'day' && a.allDayRow === b.allDayRow);
const DAY = { weekday: 'long', day: 'numeric', month: 'long' } as const;

/**
 * The keyboard on a view (ARCHITECTURE D.3, D.6). The cursor is a Hit, moved
 * by `stepHit` and drawn by the view; Shift extends a selection from where it
 * started (`selectionBetween`, as a pointer drag); on an event, M or
 * Alt+Enter holds it: each arrow is a `grabStep` (the pointer's proposals),
 * Enter puts it down through `commitProposal` — refusal, scope, reading,
 * history, announcement — exactly as a drop. Every step is said.
 */
export function attachKeyboard<G>(ctx: ViewCtx, shared: InteractionShared<G>): KeyboardHandle {
  const surface = shared.surface;
  const keys = surface.keys;
  if (!keys) return { grab() {}, refocus() {} };
  const root = surface.root;
  const doc = ctx.doc;
  const grid = surface.family === 'timeGrid' ? 'time' : 'day';
  const m = () => ctx.messages;
  const rtl = () => root.closest('[dir]')?.getAttribute('dir') === 'rtl';
  const zone = () => ctx.kernel.getState().timeZone;

  /** Where Shift started: the selection runs from here to the cursor. */
  let anchor: Hit | null = null;
  let held: Held | null = null;

  // ── words ───────────────────────────────────────────────────────────────
  const dayWords = (d: PlainDate) => formatTemporal(d, DAY, ctx.locale);
  /** A moment as the calendar shows it; its offset when the wall time happens twice. */
  function timeWords(z: ZonedDateTime): string {
    const hm = formatTemporal(z.toPlainTime(), HM, ctx.locale);
    const r = resolveWall(z.toPlainDate(), z.toPlainTime(), z.timeZoneId, 'earlier');
    return r.ambiguous ? `${hm} (${z.offset})` : hm;
  }
  /** The free slot (availableSlots) the cursor stands in, if any: Enter books it. */
  function freeSlotAt(hit: Hit): AvailableSlot | null {
    if (hit.kind !== 'slot') return null;
    const t = hit.instant.epochMilliseconds;
    // The latest start at or before the cursor: where slots overlap, the one drawn there.
    let best: AvailableSlot | null = null;
    let bestStart = -Infinity;
    for (const x of ctx.kernel.getOptions().availableSlots ?? []) {
      const s = slotInstant(x?.start)?.epochMilliseconds;
      const e = slotInstant(x?.end)?.epochMilliseconds;
      if (s !== undefined && e !== undefined && s <= t && t < e && s > bestStart) {
        best = x;
        bestStart = s;
      }
    }
    return best;
  }
  /** In a resource view, whose column the cursor is in: said first ("Dr Ali, Wednesday…"). */
  const titleOf = (id: string) => ctx.kernel.getResources().byId.get(id)?.resource.title || id;
  function hitLabel(hit: Hit): string {
    const place = placeLabel(hit);
    return hit.resourceId === undefined ? place : m().ofResource({ resource: titleOf(hit.resourceId), place });
  }
  function placeLabel(hit: Hit): string {
    if (hit.kind === 'day') return hit.allDayRow ? m().cursorAllDay({ date: dayWords(hit.date) }) : dayWords(hit.date);
    const label = m().cursorSlot({ date: dayWords(hit.date), time: timeWords(hit.instant.toZonedDateTimeISO(zone())) });
    const free = freeSlotAt(hit);
    if (!free) return label;
    const words = (x: AvailableSlot['start']) => timeWords(slotInstant(x)!.toZonedDateTimeISO(zone()));
    return `${label}, ${m().freeSlot({ time: `${words(free.start)}–${words(free.end)}` })}`;
  }
  function spanWords(s: { readonly start: Selection['start']; readonly end: Selection['end']; readonly allDay: boolean }): string {
    if (s.allDay) {
      const first = s.start as PlainDate;
      const last = (s.end as PlainDate).subtract({ days: 1 });
      return first.equals(last) ? dayWords(first) : m().range({ from: dayWords(first), to: dayWords(last) });
    }
    const a = (s.start as ZonedDateTime).withTimeZone(zone());
    const b = (s.end as ZonedDateTime).withTimeZone(zone());
    const sameDay = a.toPlainDate().equals(b.toPlainDate()) || (b.hour === 0 && b.minute === 0 && a.toPlainDate().add({ days: 1 }).equals(b.toPlainDate()));
    return sameDay
      ? `${dayWords(a.toPlainDate())}, ${m().range({ from: timeWords(a), to: timeWords(b) })}`
      : m().range({ from: `${dayWords(a.toPlainDate())} ${timeWords(a)}`, to: `${dayWords(b.toPlainDate())} ${timeWords(b)}` });
  }
  function proposalWords(p: Proposal, was: CalEvent): string {
    // Onto other resources: their names first ("Dr Martin, Wednesday…").
    const moved = p.resourceIds.join('\u0000') !== was.resourceIds.join('\u0000');
    const span = spanWords(p);
    let text = moved && p.resourceIds.length > 0 ? p.resourceIds.reduceRight((place, id) => m().ofResource({ resource: titleOf(id), place }), span) : span;
    if (p.allDay !== was.allDay) text += `. ${p.allDay ? m().becomesAllDay : m().becomesTimed({ length: lengthWords(p) })}`;
    if (p.skipped) text += `. ${m().skippedHour}`;
    if (!p.valid) text += `. ${m().dropRefused}${p.violations.length > 0 ? ` : ${[...new Set(p.violations.map((v) => m().violation(v.code)))].join(', ')}` : ''}`;
    return text;
  }

  /** The undo key as this platform writes it; none when the calendar's undo keys are off. */
  const undoKey = () => (ctx.live().keyboardUndo === false ? '' : /Mac|iPhone|iPad/.test(doc.defaultView?.navigator.platform ?? '') ? '⌘Z' : 'Ctrl+Z');
  const lengthWords = (p: Proposal) => formatMinutes(((p.end as ZonedDateTime).epochMilliseconds - (p.start as ZonedDateTime).epochMilliseconds) / 60_000, ctx.locale);

  // ── where a step lands in this view ─────────────────────────────────────
  /**
   * A stepped hit, kept inside what the view draws: another period when it
   * left this one (the view changes), past a day that has no time, and in a
   * time grid between the all-day row and the hours. Null: nowhere to go.
   */
  function land(from: Hit, to: Hit, step: Step): Hit | null {
    if (grid === 'time' && step.slots !== 0 && from.kind === 'day') return step.slots > 0 ? (keys!.firstSlot?.(from.date, from.resourceId) ?? null) : null;
    let target = to;
    // Up to six more days: past a skipped day, or the hidden days of a week.
    for (let tries = 0; tries < 7; tries++) {
      let f = keys!.fit(target);
      if (f === 'prev' || f === 'next') {
        ctx.kernel.navigate(f);
        f = keys!.fit(target);
      }
      if (f && typeof f === 'object') {
        // Up from the first slot of a day: its all-day row.
        if (grid === 'time' && keys!.allDayRow && step.slots < 0 && from.kind === 'slot' && f.kind === 'slot' && f.instant.equals(from.instant)) {
          return { kind: 'day', date: from.date, allDayRow: true };
        }
        return f;
      }
      // A day its zone skipped (Apia, 30 December 2011), or a hidden day: one more day the same way.
      if (f !== null || step.days === 0) return null;
      // From where it started, one day further each time: the wall time is kept from there.
      target = stepHit(shared.interaction(null), from, { days: step.days + Math.sign(step.days) * (tries + 1), slots: step.slots });
    }
    return null;
  }

  // ── the cursor ──────────────────────────────────────────────────────────
  function show(hit: Hit): void {
    keys!.showCursor(hit, hitLabel(hit));
  }

  function moveCursor(from: Hit, to: Hit | null, extend: boolean): boolean {
    if (!to) {
      ctx.announce(m().noFurther);
      return true;
    }
    const selectable = ctx.live().selectable === true;
    if (extend && selectable) anchor ??= from;
    else if (anchor || shared.selection) {
      anchor = null;
      shared.showSelection(null);
    }
    show(to);
    if (anchor) {
      const sel = selectionBetween(shared.interaction(null), anchor, to);
      shared.showSelection(sel);
      ctx.announce(m().selected({ span: spanWords(sel) }));
    }
    return true;
  }

  function activate(at: Hit): boolean {
    const live = ctx.live();
    if (anchor && shared.selection) {
      live.onSelect?.(shared.selection);
      return true;
    }
    const free = live.onSlotClick ? freeSlotAt(at) : null;
    if (free) {
      live.onSlotClick!(free);
      return true;
    }
    const resource = at.resourceId !== undefined ? { resourceId: at.resourceId } : {};
    live.onDateClick?.(at.kind === 'slot' ? { allDay: false, date: at.date, instant: at.instant, ...resource } : { allDay: true, date: at.date, ...resource });
    // The keyboard's tap: the slot is selected, for "new event here" through `onSelect`.
    if (live.selectable) {
      const sel = selectionBetween(shared.interaction(null), at, at);
      shared.showSelection(sel);
      live.onSelect?.(sel);
    }
    return true;
  }

  function onCursor(intent: Intent, at: Hit): boolean {
    switch (intent.kind) {
      case 'move':
        return moveCursor(at, land(at, stepHit(shared.interaction(null), at, intent.step), intent.step), intent.extend);
      case 'line':
        return moveCursor(at, keys!.lineEdge(at, intent.edge), intent.extend);
      case 'across': {
        // Not a resource view: Alt+arrows are not the calendar's.
        const to = keys!.stepAcross?.(at, intent.delta);
        return to === undefined ? false : moveCursor(at, to, false);
      }
      case 'period': {
        // The cursor's date moves by the view's own step (a month: the 31st becomes the 30th), the way the view did.
        const before = ctx.kernel.getState();
        const spec = before.view;
        ctx.kernel.navigate(intent.dir);
        const sign = intent.dir === 'next' ? 1 : -1;
        const step = spec.dayCount === undefined || spec.dateIncrement !== undefined ? Temporal.Duration.from(spec.dateIncrement ?? spec.duration) : null;
        const target = step
          ? at.date.add(sign > 0 ? step : step.negated())
          : at.date.add({ days: before.range.start.until(ctx.kernel.getState().range.start, { largestUnit: 'days' }).days });
        const moved = stepHit(shared.interaction(null), at, { days: at.date.until(target, { largestUnit: 'days' }).days, slots: 0 });
        const f = keys!.fit(moved);
        return moveCursor(at, f && typeof f === 'object' ? f : keys!.home(), false);
      }
      case 'enter': {
        const items = keys!.itemsAt(at);
        if (items.length > 0) {
          items[0]!.focus();
          return true;
        }
        return activate(at);
      }
      case 'activate':
        return activate(at);
      case 'cancel':
        if (!anchor && !shared.selection) return false;
        anchor = null;
        shared.showSelection(null);
        return true;
      default:
        return false;
    }
  }

  // ── on an event ─────────────────────────────────────────────────────────
  function onEvent(intent: Intent, node: HTMLElement): boolean {
    const inst = surface.instanceOf(node);
    if (!inst) return false;
    switch (intent.kind) {
      case 'open': {
        const live = ctx.live();
        (live.onEventClick ?? live.onEventOpen)?.(inst);
        return true;
      }
      case 'grab':
        startGrab(inst, node, 'move');
        return true;
      case 'delete':
        void remove(inst, node);
        return true;
      case 'cancel': {
        const back = keys!.cursorFor(node);
        if (!back) return false;
        show(back);
        return true;
      }
      case 'item': {
        const items = keys!.itemsAround(node);
        const next = items[items.indexOf(node) + intent.delta];
        next?.focus();
        return true;
      }
      default:
        return false;
    }
  }

  const editable = (inst: EventInstance) => ctx.live().editable === true && (inst.event.perms.start || inst.event.perms.duration) && inst.event.display !== 'background';

  async function remove(inst: EventInstance, node: HTMLElement): Promise<void> {
    if (ctx.live().editable !== true) return ctx.announce(m().notEditable);
    const ev = inst.event;
    const r = node.getBoundingClientRect();
    let command: Command = { type: 'event.delete', id: ev.id };
    if (ev.ref) {
      const scope = await ctx.chooseScope({ instance: inst, kind: 'delete' }, { x: r.left, y: r.bottom });
      if (!scope || ctx.scope.isDisposed) return;
      command = { type: 'event.delete', id: ev.ref.seriesId, key: ev.ref.key, scope };
    }
    const back = keys!.cursorFor(node);
    const result = ctx.kernel.run(command, { validate: true });
    if (!result.ok) return ctx.refused(result, command);
    ctx.announce(m().eventDeleted({ title: ev.title || m().untitled, undo: undoKey() }));
    if (back) show(back);
  }

  // ── grab mode: the keyboard's drag ──────────────────────────────────────
  function startGrab(inst: EventInstance, node: HTMLElement | null, kind: 'move' | 'resize'): void {
    if (held || shared.busy) return;
    if (!editable(inst)) return ctx.announce(m().notEditable);
    const id = inst.event.id;
    const taken = node ?? keys!.nodeFor(id);
    // A resource view: the column it was taken in; from the menu, its first resource that has a column. Elsewhere none.
    const resourceId = ctx.kernel.getState().view.resources
      ? (taken?.closest<HTMLElement>('[data-resource]')?.dataset['resource'] ?? inst.event.resourceIds.find((r) => ctx.kernel.getResources().byId.has(r)))
      : undefined;
    held = { instance: inst, event: inst.event, proposal: null, kind, edge: 'end', ghosts: [], sources: [], node: taken, mode: kind, resourceId };
    shared.holding = true;
    shared.showSelection(null);
    anchor = null;
    root.classList.add('dz-grabbing');
    drawHeld(held);
    ctx.motion.dragStart?.(held.ghosts);
    const title = inst.event.title || m().untitled;
    const start = ctx.live().eventResizableFromStart === true && inst.event.perms.duration ? ` ${m().grabHelpStart}` : '';
    ctx.announce(`${m().grabbed({ title })} ${kind === 'resize' ? m().grabHelpResize : m().grabHelp}${start}`);
  }

  const sourcesOf = (id: string) => [...root.querySelectorAll<HTMLElement>(':is(.dz-ev, .dz-bar)[data-event-id]')].filter((n) => n.dataset['eventId'] === id);

  function drawHeld(h: Held): void {
    const ev = h.event;
    // Another period drew other nodes for it: those are dimmed now.
    for (const n of h.sources) n.classList.remove('dz-ev--source');
    h.sources = sourcesOf(h.instance.event.id);
    for (const n of h.sources) n.classList.add('dz-ev--source');
    const edgeHit = eventHit(ev, h.kind === 'resize' ? h.edge : 'start', { displayZone: zone(), grid });
    keys!.reveal(h.resourceId !== undefined ? { ...edgeHit, resourceId: h.resourceId } : edgeHit);
    const geo = surface.measure(shared.layerOrigin());
    const span = { start: ev.start, end: ev.end, allDay: ev.allDay, resourceIds: ev.resourceIds };
    const p = h.proposal;
    syncGhosts(shared.layer, h.ghosts, surface.boxesFor(geo, span, 0), { kind: 'event', node: h.node, instance: h.instance, title: h.instance.event.title || m().untitled }, {
      invalid: p ? !p.valid : false,
      time: p ? timeOf(ctx, h.kind === 'resize' && h.edge === 'end' ? p.end : p.start, p) : '',
    });
  }

  /** Alt+Left/Right while holding: the next resource, the same day and time. */
  function across(delta: 1 | -1): void {
    const h = held!;
    const ic = shared.interaction(h.instance);
    let landed: Hit | null | undefined = null;
    const p = grabStep(ic, grid, h.event, { kind: 'move', step: { days: 0, slots: 0 } }, (_to, from) => (landed = keys!.stepAcross?.(from, delta)) ?? null, h.resourceId);
    if (!p) return ctx.announce(m().noFurther);
    const to = landed as Hit | null | undefined;
    if (to?.resourceId !== undefined) h.resourceId = to.resourceId;
    h.event = heldEvent(p);
    h.proposal = { ...p, event: h.instance.event };
    h.kind = 'move';
    drawHeld(h);
    ctx.announce(proposalWords(p, h.instance.event));
  }

  function step(kind: 'move' | 'resize', edge: 'start' | 'end', by: Step): void {
    const h = held!;
    const ev = h.instance.event;
    if (kind === 'move' && !ev.perms.start) return ctx.announce(m().cannotMove);
    if (kind === 'resize') {
      // A timed event in a month only moves (its hours are not drawn there), as under the pointer.
      const resizable = ev.perms.duration && (edge === 'end' || ctx.live().eventResizableFromStart === true) && (grid === 'time' || h.event.allDay);
      if (!resizable) return ctx.announce(m().cannotResize);
    }
    const ic = shared.interaction(h.instance);
    let landed: Hit | null = null;
    const p = grabStep(ic, grid, h.event, kind === 'move' ? { kind, step: by } : { kind, edge, step: by }, (to, from) => (landed = land(from, to, by)), h.resourceId);
    if (!p) return ctx.announce(m().noFurther);
    // Set in the callback: TypeScript cannot see it, hence the cast.
    const to = landed as Hit | null;
    if (kind === 'move' && to?.resourceId !== undefined) h.resourceId = to.resourceId;
    h.event = heldEvent(p);
    h.proposal = { ...p, event: ev };
    h.kind = kind;
    h.edge = edge;
    drawHeld(h);
    ctx.announce(proposalWords(p, ev));
  }

  function release(h: Held): void {
    held = null;
    shared.holding = false;
    root.classList.remove('dz-grabbing');
    for (const n of h.sources) n.classList.remove('dz-ev--source');
    clearGhosts(h.ghosts);
  }

  /** After a grab: the event where it is now, else where it was, else the cursor. */
  function refocus(eventId: string, date: PlainDate | null, fallback: HTMLElement | null, resourceId?: string): void {
    const node = (date && keys!.nodeFor(eventId, date, resourceId)) || keys!.nodeFor(eventId) || (fallback?.isConnected ? fallback : null);
    if (node) return node.focus();
    const home = keys!.home();
    if (home) show(home);
  }

  function letGo(said: boolean): void {
    const h = held;
    if (!h) return;
    release(h);
    if (said) ctx.announce(m().grabCancelled);
    refocus(h.instance.event.id, null, h.node);
  }

  async function commit(): Promise<void> {
    const h = held!;
    const p = h.proposal;
    if (!p || isUnchanged(p)) return letGo(true);
    shared.busy = true;
    const box = h.ghosts[0]?.getBoundingClientRect() ?? null;
    const r = box ?? root.getBoundingClientRect();
    let outcome: Awaited<ReturnType<typeof commitProposal>> | null = null;
    try {
      outcome = await commitProposal(ctx, {
        instance: h.instance,
        proposal: p,
        kind: h.kind,
        ...(h.kind === 'resize' && { edge: h.edge }),
        at: { x: r.left + Math.min(r.width, 160) / 2, y: r.top + Math.min(r.height, 24) },
        from: box,
        source: h.node?.isConnected ? h.node : null,
        ghosts: h.ghosts,
        root,
      });
    } catch (err) {
      // An application callback failed: grab mode still ends, the error stays visible.
      void Promise.reject(err);
    } finally {
      shared.busy = false;
      release(h);
    }
    if (ctx.scope.isDisposed) return;
    const at = p.start instanceof Temporal.PlainDate ? p.start : (p.start as ZonedDateTime).withTimeZone(zone()).toPlainDate();
    if (outcome?.done && outcome.eventId) refocus(outcome.eventId, at, null, h.resourceId);
    else refocus(h.instance.event.id, null, h.node);
  }

  // ── keys ────────────────────────────────────────────────────────────────
  ctx.scope.on(root, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (held || ke.defaultPrevented || !(ke.target instanceof Element)) return;
    const at = keys.cursorAt(ke.target);
    // The event itself, not a link or a field an application put inside it: those keep their keys.
    const node = at ? null : ke.target.matches('[data-event-id][tabindex]') ? (ke.target as HTMLElement) : null;
    if (!at && !node) return;
    if (at) {
      // The period changed under a focused cursor (the application navigated): it starts again at home.
      const f = keys.fit(at);
      if (!f || typeof f !== 'object') {
        const home = keys.home();
        if (home && intentFor(ke, { mode: 'cursor', rtl: rtl(), grid })) {
          show(home);
          ke.preventDefault();
          ke.stopPropagation();
        }
        return;
      }
    }
    const intent = intentFor(ke, { mode: at ? 'cursor' : 'event', rtl: rtl(), grid });
    // Undo and redo are the calendar's, wherever the focus is in it.
    if (!intent || intent.kind === 'undo' || intent.kind === 'redo') return;
    if (at ? onCursor(intent, at) : onEvent(intent, node!)) {
      ke.preventDefault();
      ke.stopPropagation();
    }
  });

  // Grab mode listens on the document: the held event's node may go away (another period), the keys must not.
  ctx.scope.on(
    doc,
    'keydown',
    (e) => {
      const ke = e as KeyboardEvent;
      if (!held || shared.busy) return;
      const intent = intentFor(ke, { mode: 'grab', rtl: rtl(), grid });
      if (!intent) {
        // No undo while an event is held (the history would move under it), no history.back on Alt+arrow.
        if (((ke.ctrlKey || ke.metaKey) && /^[zy]$/i.test(ke.key)) || (ke.altKey && ke.key.startsWith('Arrow'))) ke.preventDefault();
        return;
      }
      if (ke.key === 'Tab') {
        // Tab lets go, and still moves the focus on.
        letGo(true);
        return;
      }
      ke.preventDefault();
      ke.stopPropagation();
      // Held to change its length ("Change duration…"): plain arrows pull the end.
      if (intent.kind === 'move' && held.mode === 'resize') step('resize', 'end', intent.step);
      else if (intent.kind === 'move') step('move', 'start', intent.step);
      else if (intent.kind === 'resize') step('resize', intent.edge, intent.step);
      else if (intent.kind === 'across') across(intent.delta);
      else if (intent.kind === 'commit') void commit();
      else if (intent.kind === 'cancel') letGo(true);
    },
    { capture: true },
  );
  // A held event and a press on the calendar's time: it goes there, as if dragged — the single-pointer
  // way to move (WCAG 2.5.7: "Move…" in the context menu, then a click). A press anywhere else lets go.
  ctx.scope.on(
    doc,
    'pointerdown',
    (e) => {
      const pe = e as PointerEvent;
      if (!held || shared.busy) return;
      const t = pe.target;
      if (!(t instanceof Element) || !root.contains(t) || !surface.accepts(t) || (pe.pointerType === 'mouse' && pe.button !== 0)) return letGo(true);
      pe.preventDefault();
      pe.stopPropagation();
      // The click that follows this press is not a click on what lies there (a "+N" link, a day number).
      const swallow = (c: Event) => {
        c.stopPropagation();
        c.preventDefault();
      };
      doc.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => doc.removeEventListener('click', swallow, { capture: true }), 600);
      const hit = surface.hitAt(surface.measure(shared.layerOrigin()), pe.clientX, pe.clientY, 0);
      if (!hit) return;
      const h = held;
      const ic = shared.interaction(h.instance);
      const ev = h.event;
      const p = h.kind === 'resize' ? grabStep(ic, grid, ev, { kind: 'resize', edge: h.edge, step: { days: 0, slots: 0 } }, () => hit, h.resourceId) : grabStep(ic, grid, ev, { kind: 'move', step: { days: 0, slots: 0 } }, () => hit, h.resourceId);
      if (!p) return;
      if (hit.resourceId !== undefined && h.kind === 'move') h.resourceId = hit.resourceId;
      h.event = heldEvent(p);
      h.proposal = { ...p, event: h.instance.event };
      drawHeld(h);
      void commit();
    },
    { capture: true },
  );

  // Tabbing into the grid: the cursor takes its place (today, at the hour in view) if it has none here.
  ctx.scope.on(root, 'focusin', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || held || !keys.isCursor(t)) return;
    const at = keys.cursorAt(t);
    const f = at ? keys.fit(at) : null;
    if (at && f && typeof f === 'object' && sameHit(f, at)) return;
    const place = f && typeof f === 'object' ? f : keys.home();
    if (place) show(place);
  });

  // The focus left the calendar without a press (a script, another window): holding ends, the keys are the page's again.
  ctx.scope.on(doc, 'focusin', (e) => {
    if (held && !shared.busy && e.target instanceof Node && !root.contains(e.target) && !ctx.popoverElement.parentElement?.contains(e.target)) letGo(true);
  });
  ctx.scope.on(doc.defaultView!, 'blur', () => held && !shared.busy && letGo(true));

  // A screen reader activates a button by a bare click (no pointer, no key): the same as Enter.
  ctx.scope.on(root, 'click', (e) => {
    const me = e as MouseEvent;
    if (me.detail !== 0 || held || !(me.target instanceof Element)) return;
    const at = keys.cursorAt(me.target);
    if (at) return void activate(at);
    const node = me.target.closest<HTMLElement>('[data-event-id][tabindex]');
    if (node) onEvent({ kind: 'open' }, node);
  });

  ctx.scope.add(() => {
    if (held) release(held);
  });
  // The resources changed under a held event: the column it is over may be gone. It is let go, said.
  ctx.scope.add(
    ctx.kernel.subscribe((e) => {
      if (held && !shared.busy && e.type === 'state' && e.causes.includes('resources')) letGo(true);
    }),
  );

  return {
    grab(instance, kind) {
      startGrab(instance, keys.nodeFor(instance.event.id), kind);
    },
    refocus(eventId) {
      if (eventId) refocus(eventId, null, null);
      else {
        const home = keys.home();
        if (home) show(home);
      }
    },
  };
}
