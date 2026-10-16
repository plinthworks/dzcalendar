import { normalizeEvent } from '../event/normalize.js';
import { problem } from '../event/problems.js';
import type { Problem } from '../event/problems.js';
import type { CalEvent, EventInput } from '../event/types.js';
import { eventEquals } from '../store/diff.js';
import { Temporal } from '../temporal.js';
import type { Duration } from '../temporal.js';
import type { Mutation } from '../store/changes.js';
import type { StoreSnapshot } from '../store/store.js';
import type { Command, CommandContext, CommandResult, EventPatch } from './types.js';

/** How long an event lasts: real elapsed time if timed, calendar days if all-day. */
function lengthOf(e: CalEvent): Duration {
  return e.allDay
    ? Temporal.Duration.from({ days: e.start.until(e.end, { largestUnit: 'days' }).days })
    : Temporal.Duration.from({ milliseconds: e.end.epochMilliseconds - e.start.epochMilliseconds });
}

/** A stored event written back as input, so a patch can be laid over it and normalized again. */
function toInput(e: CalEvent): EventInput {
  // Every field of CalEvent that an input can express; diff.test.ts checks
  // that a full round trip through here changes nothing.
  return {
    id: e.id,
    ...(e.groupId !== undefined && { groupId: e.groupId }),
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    resourceIds: e.resourceIds,
    display: e.display,
    status: e.status,
    busy: e.busy,
    startEditable: e.perms.start,
    durationEditable: e.perms.duration,
    resourceEditable: e.perms.resource,
    classNames: e.classNames,
    ...(e.tone !== undefined && { tone: e.tone }),
    ...(e.url !== undefined && { url: e.url }),
    extendedProps: e.props,
  };
}

/**
 * The stored event as input, made ready for `patch` to be laid over it: every
 * field the patch derives from (permissions from `editable`, `busy` from
 * `status`, the moments from `allDay` or `timeZone`) is cleared or converted,
 * so an update means what the same fields mean in a create.
 */
function patchedBase(before: CalEvent, p: EventPatch): EventInput {
  const base = toInput(before);
  const has = (k: keyof EventPatch) => k in p;

  if (has('editable')) {
    delete base.startEditable;
    delete base.durationEditable;
    delete base.resourceEditable;
  }
  // `busy` follows `status` unless it was set against it on purpose.
  if (has('status') && !has('busy') && before.busy === (before.status !== 'cancelled')) delete base.busy;
  if (has('resourceId') || has('resourceIds')) delete base.resourceIds;

  const toAllDay = p.allDay === true && !before.allDay;
  const toTimed = p.allDay === false && before.allDay;
  if (!before.allDay && p.allDay === true) {
    // The days the event touches: an end at 01:00 still covers that day.
    const startDate = before.start.toPlainDate();
    const endWall = before.end.withTimeZone(before.start.timeZoneId);
    let endDate = endWall.toPlainDate();
    if (endWall.toPlainTime().toString() !== '00:00:00' || Temporal.PlainDate.compare(endDate, startDate) <= 0) endDate = endDate.add({ days: 1 });
    base.start = startDate;
    base.end = endDate;
  } else if (toTimed) {
    // Midnight of its first day, for the default timed length.
    delete base.end;
  } else if (has('timeZone') && !before.allDay && !has('start') && !has('end')) {
    // Same clock times, another place.
    base.start = before.start.toPlainDateTime();
    base.end = before.end.withTimeZone(before.start.timeZoneId).toPlainDateTime();
  }

  // A new start (or a new duration) without a new end keeps the event's
  // length rather than its old end — elapsed time for a timed event, whole
  // days for an all-day one. This is not yet a "move" (Phase 6), but it never
  // turns an edit into end-before-start.
  if ((has('start') || has('duration')) && !has('end') && !toTimed && !toAllDay) {
    delete base.end;
    base.duration = p.duration ?? lengthOf(before);
  }
  // A wall time written without a zone is read in the event's own zone —
  // unless that zone was itself a guess, which keeps following the calendar.
  if (!before.allDay && !before.zoneGuessed && !has('timeZone') && !toAllDay) base.timeZone = before.start.timeZoneId;
  return base;
}

/**
 * Turns a command into the mutations that carry it out, against a snapshot.
 * Pure: nothing is applied here, so a command can be checked, previewed, or
 * refused without touching the store. All or nothing — a batch with one bad
 * command yields no mutation at all.
 */
export function applyCommand(snap: StoreSnapshot, cmd: Command, ctx: CommandContext): CommandResult {
  const problems: Problem[] = [];
  const mutations: Mutation[] = [];
  let current = snap;

  const run = (c: Command, path: string): boolean => {
    switch (c.type) {
      case 'event.create': {
        const r = normalizeEvent(c.event, ctx.normalize, path);
        problems.push(...r.problems);
        if (!r.ok) return false;
        if (current.getEvent(r.value.event.id)) {
          problems.push(problem('duplicate-id', 'error', `${path}.id`, r.value.event.id));
          return false;
        }
        return push({ kind: 'event', after: r.value.event });
      }
      case 'event.update': {
        const before = current.getEvent(c.id);
        if (!before) {
          problems.push(problem('unknown-event', 'error', `${path}.id`, c.id));
          return false;
        }
        const p = c.patch;
        const base = patchedBase(before, p);
        const r = normalizeEvent({ ...base, ...p, id: c.id }, ctx.normalize, path);
        problems.push(...r.problems);
        if (!r.ok) return false;
        let next = r.value.event;
        // Written back as a ZonedDateTime, a guessed zone reads as a named one.
        // Untouched moments keep the guess, so the event still follows the calendar.
        const movesTime = 'start' in p || 'end' in p || 'timeZone' in p || 'allDay' in p;
        if (!movesTime && !before.allDay && !next.allDay && before.zoneGuessed) next = { ...next, zoneGuessed: true };
        if (before.sourceId !== undefined) next = { ...next, sourceId: before.sourceId };
        if (eventEquals(before, next)) return true;
        return push({ kind: 'event', before, after: Object.freeze(next) as CalEvent });
      }
      case 'event.delete': {
        const before = current.getEvent(c.id);
        if (!before) {
          problems.push(problem('unknown-event', 'error', `${path}.id`, c.id));
          return false;
        }
        return push({ kind: 'event', before });
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

  return run(cmd, 'command') ? { ok: true, mutations, problems } : { ok: false, problems };
}
