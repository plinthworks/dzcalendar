import { normalizeEvent } from '../event/normalize.js';
import { problem } from '../event/problems.js';
import type { Problem } from '../event/problems.js';
import type { CalEvent, EventInput } from '../event/types.js';
import { deleteOccurrence, deleteSeries, editOccurrence, editedOccurrence, firstKey, startOfKey } from '../recurrence/edit.js';
import type { EditScope, OccurrenceRef } from '../recurrence/edit.js';
import { materialize, parseInstanceKey } from '../recurrence/series.js';
import type { Series } from '../recurrence/series.js';
import { expandSeries } from '../recurrence/expand.js';
import { viewWindow } from '../store/store.js';
import { validateProposal } from '../rules/validate.js';
import type { Violation } from '../rules/validate.js';
import type { Mutation } from '../store/changes.js';
import type { StoreSnapshot } from '../store/store.js';
import type { Command, CommandContext, CommandResult, EventPatch, Reach } from './types.js';
import { patchEvent, toInput } from './patch.js';
import { parseRRule } from '@dzcalendar/rrule';

const WKST = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/** A rule created here without WKST gets the locale's first day, written out (owner's decision). */
function withWeekStart(input: EventInput, ctx: CommandContext): EventInput {
  if (ctx.weekStart === undefined || input.rrule === undefined) return input;
  const add = (t: unknown) => {
    if (typeof t !== 'string') return t;
    // The rule's own parts, as the parser reads them: an optional RRULE: prefix, spaces, a trailing ';'.
    const body = t.trim().replace(/^RRULE:/i, '').replace(/;\s*$/, '').trim();
    if (body.split(';').some((part) => /^\s*WKST\s*=/i.test(part))) return t;
    return `${body};WKST=${WKST[ctx.weekStart! - 1]}`;
  };
  const rrule = typeof input.rrule === 'string' ? add(input.rrule) : Array.isArray(input.rrule) ? input.rrule.map(add) : input.rrule;
  return { ...input, rrule } as EventInput;
}

/** What a command's id names: a plain event, or an occurrence of a series with how far the edit reaches. */
type Target = { readonly kind: 'event'; readonly event: CalEvent } | { readonly kind: 'occurrence'; readonly ref: OccurrenceRef; readonly scope: EditScope };

/**
 * Turns a command into the mutations that carry it out, against a snapshot.
 * Pure: nothing is applied here, so a command can be checked, previewed, or
 * refused without touching the store. All or nothing — a batch with one bad
 * command yields no mutation at all.
 */
export function applyCommand(snap: StoreSnapshot, cmd: Command, ctx: CommandContext): CommandResult {
  const problems: Problem[] = [];
  const violations: Violation[] = [];
  const mutations: Mutation[] = [];
  let current = snap;

  /** Resolves `id` (+ `key`, `scope`) against the current state; reports and returns null when it names nothing editable. */
  function target(id: string, reach: Reach, path: string, deleting = false): Target | null {
    const ev = current.getEvent(id);
    if (ev) {
      // An override stands for its occurrence: deleting it, or reaching past it, goes through the series.
      if (ev.ref && (deleting || (reach.scope !== undefined && reach.scope !== 'this'))) return { kind: 'occurrence', ref: ev.ref, scope: reach.scope ?? 'this' };
      return { kind: 'event', event: ev };
    }
    const sr = current.getSeries(id);
    // No key: the series as a whole, anchored on its first start (even when DTSTART itself is excluded or off-rule).
    if (sr) return { kind: 'occurrence', ref: { seriesId: id, key: reach.key ?? firstKey(sr) }, scope: reach.scope ?? (reach.key === undefined ? 'all' : 'this') };
    const k = parseInstanceKey(id);
    if ('seriesId' in k && current.getSeries(k.seriesId)) return { kind: 'occurrence', ref: { seriesId: k.seriesId, key: k.key }, scope: reach.scope ?? 'this' };
    problems.push(problem('unknown-event', 'error', `${path}.id`, id));
    return null;
  }

  /** The event a target shows now: for checks and for patches that need the current moments. */
  function shown(t: Target): CalEvent | undefined {
    if (t.kind === 'event') return t.event;
    const sr = current.getSeries(t.ref.seriesId)!;
    const own = sr.overrides.get(t.ref.key);
    if (own !== undefined) return current.getEvent(own);
    try {
      return materialize(sr, startOfKey(sr, t.ref.key));
    } catch {
      return undefined;
    }
  }

  /**
   * Checks the edit against the calendar's rules before anything is written —
   * on the very event the edit will write (for a series, the occurrence it
   * produces, not its override). When the whole series moves, its other
   * occurrences move too: they are not in the way.
   */
  function allowed(t: Target, patch: EventPatch, path: string): boolean {
    if (!ctx.rules || !('start' in patch || 'end' in patch || 'duration' in patch || 'resourceIds' in patch || 'resourceId' in patch || 'allDay' in patch)) return true;
    let pair: { before: CalEvent; after: CalEvent } | null;
    if (t.kind === 'event') {
      const after = patchEvent(t.event, patch, ctx.normalize, path, []);
      pair = after ? { before: t.event, after } : null;
    } else pair = editedOccurrence(current, t.ref, patch, t.scope, ctx.normalize);
    if (!pair) return true; // the edit itself will report why
    const found = validateProposal(
      current,
      { event: pair.before, start: pair.after.start, end: pair.after.end, resourceIds: pair.after.resourceIds },
      ctx.rules,
      t.kind === 'occurrence' && t.scope !== 'this' ? { movingSeries: t.ref.seriesId } : {},
    );
    violations.push(...found);
    return found.length === 0;
  }

  /**
   * A series a person makes or changes (a new one, a single event made to
   * repeat, another rule) meets the rules on its occurrences — a year of them,
   * 500 at most — as a moved event does; its own occurrences are not in the way.
   */
  function seriesAllowed(sr: Series): boolean {
    if (!ctx.rules) return true;
    const zone = ctx.rules.displayZone;
    const d0 = sr.base.allDay ? sr.base.start : sr.base.start.withTimeZone(zone).toPlainDate();
    const { occurrences } = expandSeries(sr, viewWindow(d0, d0.add({ days: 366 }), zone), { limit: 500 });
    for (const occ of occurrences) {
      const found = validateProposal(current, { event: occ, start: occ.start, end: occ.end, resourceIds: occ.resourceIds }, ctx.rules, { movingSeries: sr.id });
      if (found.length > 0) {
        violations.push(...found);
        return false;
      }
    }
    return true;
  }

  /** A rule that can never give an occurrence (an UNTIL before the start…): said, as a warning. */
  function warnIfEmpty(sr: Series, path: string): void {
    const zone = ctx.normalize.displayZone;
    const d0 = sr.base.allDay ? sr.base.start : sr.base.start.withTimeZone(zone).toPlainDate();
    if (expandSeries(sr, viewWindow(d0, d0.add({ years: 10 }), zone), { limit: 1 }).occurrences.length === 0) problems.push(problem('invalid-rrule', 'warning', `${path}.rrule`, 'no occurrence'));
  }

  function edit(id: string, patch: EventPatch, reach: Reach, path: string): boolean {
    const t = target(id, reach, path);
    if (!t) return false;
    if (!allowed(t, patch, path)) return false;
    if (t.kind === 'event') {
      const next = patchEvent(t.event, patch, ctx.normalize, path, problems);
      if (!next) return false;
      return next === t.event || push({ kind: 'event', before: t.event, after: next });
    }
    const r = editOccurrence(current, t.ref, patch, t.scope, ctx.normalize, path, problems);
    return r.ok && pushAll(r.mutations);
  }

  const run = (c: Command, path: string): boolean => {
    switch (c.type) {
      case 'event.create': {
        const r = normalizeEvent(withWeekStart(c.event, ctx), ctx.normalize, path);
        problems.push(...r.problems);
        if (!r.ok) return false;
        const item = r.value;
        const id = item.kind === 'event' ? item.event.id : item.series.id;
        // A person's new event (the editor) meets the rules too; the application's own creations do not ask.
        if (item.kind === 'series') {
          if (!seriesAllowed(item.series)) return false;
        } else if (ctx.rules) {
          const ev = item.event;
          const found = validateProposal(current, { event: ev, start: ev.start, end: ev.end, resourceIds: ev.resourceIds }, ctx.rules);
          if (found.length > 0) {
            violations.push(...found);
            return false;
          }
        }
        // The store keeps events and series apart, but a command refuses an id
        // used by either: `event.update('x')` must never be ambiguous.
        if (current.getEvent(id) || current.getSeries(id)) {
          problems.push(problem('duplicate-id', 'error', `${path}.id`, id));
          return false;
        }
        return push(item.kind === 'event' ? { kind: 'event', after: item.event } : { kind: 'series', after: item.series });
      }
      case 'event.update':
        return edit(c.id, c.patch, c, path);
      case 'event.move': {
        const patch: EventPatch = { start: c.start, ...(c.end !== undefined && { end: c.end }), ...(c.resourceIds !== undefined && { resourceIds: c.resourceIds }) };
        return edit(c.id, patch, c, path);
      }
      case 'event.resize': {
        const t = target(c.id, c, path);
        if (!t) return false;
        const now = shown(t);
        if (!now) return false;
        // The other edge stays where it is.
        const patch: EventPatch = c.edge === 'start' ? { start: c.to, end: now.end } : { end: c.to };
        return edit(c.id, patch, c, path);
      }
      case 'event.delete': {
        const t = target(c.id, c, path, true);
        if (!t) return false;
        if (t.kind === 'event') return push({ kind: 'event', before: t.event });
        const r = deleteOccurrence(current, t.ref, t.scope, path, problems);
        return r.ok && pushAll(r.mutations);
      }
      case 'series.delete': {
        const sr = current.getSeries(c.id);
        if (!sr) {
          problems.push(problem('unknown-event', 'error', `${path}.id`, c.id));
          return false;
        }
        return pushAll(deleteSeries(current, sr));
      }
      case 'series.split': {
        if (!current.getSeries(c.id)) {
          problems.push(problem('unknown-event', 'error', `${path}.id`, c.id));
          return false;
        }
        const r = editOccurrence(current, { seriesId: c.id, key: c.at }, c.patch ?? {}, 'following', ctx.normalize, path, problems, {}, true);
        return r.ok && pushAll(r.mutations);
      }
      case 'event.repeat': {
        const ev = current.getEvent(c.id);
        if (!ev || ev.ref) {
          problems.push(problem('unknown-event', 'error', `${path}.id`, c.id));
          return false;
        }
        const r = normalizeEvent(withWeekStart({ ...toInput(ev), rrule: c.rrule } as EventInput, ctx), ctx.normalize, path);
        problems.push(...r.problems);
        if (!r.ok || r.value.kind !== 'series') return false;
        const series = ev.sourceId !== undefined ? { ...r.value.series, sourceId: ev.sourceId } : r.value.series;
        push({ kind: 'event', before: ev });
        // Checked once the single event is gone: it is not in the way of its own occurrences.
        if (!seriesAllowed(series)) return false;
        warnIfEmpty(series, path);
        return push({ kind: 'series', after: series });
      }
      case 'series.rule': {
        const sr = current.getSeries(c.id);
        if (!sr) {
          problems.push(problem('unknown-event', 'error', `${path}.id`, c.id));
          return false;
        }
        if (c.rrule === null || (Array.isArray(c.rrule) && c.rrule.length === 0)) {
          // It stops repeating: the first occurrence is the event, a moved one an event of its own.
          for (const oid of sr.overrides.values()) {
            const o = current.getEvent(oid);
            if (!o) continue;
            const { ref: _ref, ...own } = o;
            push({ kind: 'event', before: o, after: Object.freeze(own) as CalEvent });
          }
          push({ kind: 'series', before: sr });
          const { ref: _r, ...base } = sr.base;
          return push({ kind: 'event', after: Object.freeze({ ...base, ...(sr.sourceId !== undefined && { sourceId: sr.sourceId }) }) as CalEvent });
        }
        // A rule given without WKST keeps the series' own (not the reader's locale).
        const own = sr.set.rules[0]?.wkst;
        const written = withWeekStart({ start: sr.base.start, rrule: c.rrule } as EventInput, own !== undefined ? { ...ctx, weekStart: own } : ctx).rrule;
        const texts = typeof written === 'string' ? [written] : Array.isArray(written) ? written : [];
        const rules = [];
        for (const [i, text] of texts.entries()) {
          const r = typeof text === 'string' ? parseRRule(text) : null;
          const sub = texts.length > 1 ? `${path}.rrule[${i}]` : `${path}.rrule`;
          if (!r || !r.ok) {
            problems.push(problem('invalid-rrule', 'error', sub, r && !r.ok ? r.problem.detail : String(text)));
            return false;
          }
          if (sr.base.allDay && (r.rule.freq === 'HOURLY' || r.rule.freq === 'MINUTELY' || r.rule.freq === 'SECONDLY')) {
            problems.push(problem('invalid-rrule', 'error', sub, `FREQ=${r.rule.freq}`));
            return false;
          }
          rules.push(r.rule);
        }
        if (rules.length === 0) {
          problems.push(problem('invalid-rrule', 'error', `${path}.rrule`, String(c.rrule)));
          return false;
        }
        const next = { ...sr, set: { ...sr.set, rules } };
        if (!seriesAllowed(next)) return false;
        warnIfEmpty(next, path);
        return push({ kind: 'series', before: sr, after: next });
      }
      case 'batch':
        return c.commands.every((sub, i) => run(sub, `${path}.commands[${i}]`));
    }
  };

  // Each step sees the state the previous ones made: create then update works.
  function push(m: Mutation): boolean {
    mutations.push(m);
    current = current.withMutations([m]).next;
    return true;
  }
  function pushAll(ms: readonly Mutation[]): boolean {
    for (const m of ms) push(m);
    return true;
  }

  if (run(cmd, 'command')) return { ok: true, mutations, problems };
  return violations.length > 0 ? { ok: false, problems, violations } : { ok: false, problems };
}
