import { normalizeEvent } from '../event/normalize.js';
import { problem } from '../event/problems.js';
import type { Problem } from '../event/problems.js';
import type { CalEvent, EventInput } from '../event/types.js';
import { deleteOccurrence, deleteSeries, editOccurrence, editedOccurrence, firstKey, startOfKey } from '../recurrence/edit.js';
import type { EditScope, OccurrenceRef } from '../recurrence/edit.js';
import { materialize, parseInstanceKey } from '../recurrence/series.js';
import { validateProposal } from '../rules/validate.js';
import type { Violation } from '../rules/validate.js';
import type { Mutation } from '../store/changes.js';
import type { StoreSnapshot } from '../store/store.js';
import type { Command, CommandContext, CommandResult, EventPatch, Reach } from './types.js';
import { patchEvent } from './patch.js';

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
