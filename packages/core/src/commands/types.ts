import type { Problem } from '../event/problems.js';
import type { EventId, EventInput } from '../event/types.js';
import type { NormalizeContext } from '../event/normalize.js';
import type { Mutation } from '../store/changes.js';

/** Everything an update may change. The id is the command's, not the patch's. */
export type EventPatch = Omit<EventInput, 'id' | 'rrule' | 'exdate' | 'rdate'>;

/**
 * What a person or a program asks the calendar to do — plain data, so it can
 * be logged, sent over a wire, or emitted by an assistant (Phase 18 publishes
 * a JSON Schema). Move, resize and series commands arrive with Phases 6–7.
 */
export type Command =
  | { readonly type: 'event.create'; readonly event: EventInput }
  | { readonly type: 'event.update'; readonly id: EventId; readonly patch: EventPatch }
  | { readonly type: 'event.delete'; readonly id: EventId }
  | { readonly type: 'batch'; readonly label?: string; readonly commands: readonly Command[] };

export interface CommandContext {
  readonly normalize: NormalizeContext;
}

export type CommandResult =
  | { readonly ok: true; readonly mutations: readonly Mutation[]; readonly problems: readonly Problem[] }
  | { readonly ok: false; readonly problems: readonly Problem[] };
