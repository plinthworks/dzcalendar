import type { Weekday } from '@dzcalendar/rrule';
import type { Problem } from '../event/problems.js';
import type { EventId, EventInput, RecurrenceKey, ResourceId, SeriesId, TemporalInput } from '../event/types.js';
import type { NormalizeContext } from '../event/normalize.js';
import type { EditScope } from '../recurrence/edit.js';
import type { RulesContext, Violation } from '../rules/validate.js';
import type { Mutation } from '../store/changes.js';

type Patchable = Omit<EventInput, 'id' | 'rrule' | 'exdate' | 'rdate'>;
/** What a patch can take away: `null` clears it (an end back to the default length, no tone, no url, no group). */
type Clearable = 'end' | 'groupId' | 'tone' | 'url';
/** Everything an update may change. The id is the command's, not the patch's; a field left out is kept. */
export type EventPatch = Omit<Patchable, Clearable> & { readonly [K in Clearable]?: Patchable[K] | null };

/**
 * Which occurrence of a series a command is about, and how far it reaches.
 * `id` may be the series id (with `key`), an occurrence's instance key
 * (`series@start`, `scope` defaults to `this`), or an override event's id.
 */
export interface Reach {
  readonly scope?: EditScope;
  /**
   * The occurrence's original start, when `id` is the series': as the series
   * writes it (`2026-10-21T08:00:00+02:00[Europe/Paris]`, a date for an
   * all-day series), or the wall time without its offset
   * (`2026-10-21T08:00[Europe/Paris]`), or an instant.
   */
  readonly key?: RecurrenceKey;
}

/**
 * What a person or a program asks the calendar to do — plain data, so it can
 * be logged, sent over a wire, or emitted by an assistant (`commands.schema.json`
 * describes them). `event.create` with an `rrule` creates a series.
 */
export type Command =
  | { readonly type: 'event.create'; readonly event: EventInput }
  | ({ readonly type: 'event.update'; readonly id: EventId; readonly patch: EventPatch } & Reach)
  /** A new start; the length is kept unless `end` is given. */
  | ({ readonly type: 'event.move'; readonly id: EventId; readonly start: TemporalInput; readonly end?: TemporalInput; readonly resourceIds?: readonly ResourceId[] } & Reach)
  /** One edge to a new moment; the other stays. */
  | ({ readonly type: 'event.resize'; readonly id: EventId; readonly edge: 'start' | 'end'; readonly to: TemporalInput } & Reach)
  | ({ readonly type: 'event.delete'; readonly id: EventId } & Reach)
  /** The whole series, every occurrence and every override. */
  | { readonly type: 'series.delete'; readonly id: SeriesId }
  /** "This and following" without the drag: the series is cut at `at` (an occurrence's start, written as `key` is), the patch applied from there. */
  | { readonly type: 'series.split'; readonly id: SeriesId; readonly at: RecurrenceKey; readonly patch?: EventPatch }
  /**
   * A new rule for the whole series (the editor's "repeats"): its excluded and
   * added dates and its overridden occurrences are kept; a rule given without
   * WKST keeps the series' own. `null`: it stops repeating — its first
   * occurrence becomes the event (same id, every field, its source), each
   * moved occurrence an event of its own; the excluded dates go with the rule.
   */
  | { readonly type: 'series.rule'; readonly id: SeriesId; readonly rrule: string | readonly string[] | null }
  /**
   * A single event made to repeat: the same id, every field kept (its
   * source too), now a series. WKST as for a rule created here.
   */
  | { readonly type: 'event.repeat'; readonly id: EventId; readonly rrule: string | readonly string[] }
  | { readonly type: 'batch'; readonly label?: string; readonly commands: readonly Command[] };

export interface CommandContext {
  readonly normalize: NormalizeContext;
  /**
   * The locale's first day of the week, written as WKST into a rule created
   * without one (owner's decision: a rule read from elsewhere keeps RFC's Monday).
   */
  readonly weekStart?: Weekday;
  /** When given, moves and edits are checked against it (constraint, overlap, allow, editable). */
  readonly rules?: RulesContext;
}

export type CommandResult =
  | { readonly ok: true; readonly mutations: readonly Mutation[]; readonly problems: readonly Problem[] }
  | { readonly ok: false; readonly problems: readonly Problem[]; readonly violations?: readonly Violation[] };
