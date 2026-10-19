import { commandFor } from '@dzcalendar/core';
import { BACKGROUND_NODE, EVENT_NODE } from './handles.js';
import type { EditScope, EventInstance, Proposal, ZonedDateTime } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';
import { formatMinutes } from '../render/event.js';

export interface CommitRequest {
  readonly instance: EventInstance;
  readonly proposal: Proposal;
  readonly kind: 'move' | 'resize';
  /** The edge a resize pulled (what is announced: "now starts at" or "now ends at"). */
  readonly edge?: 'start' | 'end';
  /** Where the choosers open (the drop point, or the focused event for the keyboard). */
  readonly at: { readonly x: number; readonly y: number };
  /** The preview's box, for the event to land from (null: no landing motion). */
  readonly from: DOMRect | null;
  /** The event's node before the change (a refused drop flies back to it, if still there). */
  readonly source: HTMLElement | null;
  /** The preview nodes; the caller removes them after `commitProposal` settles. */
  readonly ghosts: readonly HTMLElement[];
  /** Searched for the landed node and the others that make room. */
  readonly root: HTMLElement;
}

/** How a drop ended: made or not, and the event where it now is (its id may change: an occurrence edited becomes an override). */
export interface CommitOutcome {
  readonly done: boolean;
  readonly eventId: string | null;
  readonly landed: HTMLElement | null;
}

const NOT_DONE: CommitOutcome = { done: false, eventId: null, landed: null };

/**
 * From a proposal to the calendar, the same way for every input: refused
 * (said, and shown going back), or asked how far it reaches (a series) and
 * which reading (a repeated hour), then run through the history, said, and
 * animated. Never throws: an
 * application callback that fails is reported and the gesture ends cleanly.
 */
export async function commitProposal(ctx: ViewCtx, req: CommitRequest): Promise<CommitOutcome> {
  const { instance, proposal, kind } = req;
  const title = instance.event.title || ctx.messages.untitled;
  if (!proposal.valid) {
    ctx.announce(ctx.messages.dropRefused);
    ctx.live().onProposalRefused?.(proposal);
    const to = req.source?.isConnected ? req.source.getBoundingClientRect() : null;
    await (ctx.motion.dropRejected?.(req.ghosts, to) ?? Promise.resolve());
    return NOT_DONE;
  }

  let scope: EditScope = 'this';
  let chosen = proposal;
  if (instance.event.ref) {
    // Switching between timed and all-day is for one occurrence only (a series keeps one kind).
    if (proposal.allDay === instance.event.allDay) {
      const s = await ctx.chooseScope({ instance, proposal, kind }, req.at);
      if (!s || ctx.scope.isDisposed) return NOT_DONE;
      scope = s;
    }
  }
  if (proposal.ambiguity) {
    const pick = await ctx.chooseReading(proposal, req.at);
    if (!pick || ctx.scope.isDisposed) return NOT_DONE;
    chosen = pick;
  }

  const command = commandFor(instance, chosen, scope);
  const others = [...req.root.querySelectorAll<HTMLElement>(`:is(${EVENT_NODE}):not(${BACKGROUND_NODE})`)].filter((n) => n.dataset['eventId'] !== instance.event.id);
  const layout = ctx.motion.captureLayout?.(others);
  const result = ctx.kernel.run(command, { validate: true });
  if (!result.ok) {
    ctx.refused(result, command);
    return NOT_DONE;
  }
  const startEdge = kind === 'resize' && (req.edge === 'start' || proposal.ambiguity?.edge === 'start');
  const time = timeOf(ctx, kind === 'resize' && !startEdge ? chosen.end : chosen.start, chosen);
  let said = chosen.skipped
    ? ctx.messages.movedIntoGap({ time })
    : kind === 'resize'
      ? startEdge ? ctx.messages.eventResizedStart({ title, time }) : ctx.messages.eventResized({ title, time })
      : ctx.messages.eventMoved({ title, time });
  // Timed ↔ all-day is a change of kind, not only of place: said too.
  if (chosen.allDay !== instance.event.allDay) said += `. ${chosen.allDay ? ctx.messages.becomesAllDay : ctx.messages.becomesTimed({ length: formatMinutes((ms(chosen.end) - ms(chosen.start)) / 60_000, ctx.locale) })}`;
  ctx.announce(said);
  if (layout !== undefined) ctx.motion.animateLayout?.(layout);
  const ids = result.mutations.filter((m) => m.kind === 'event' && m.after).map((m) => m.after!.id);
  const eventId = ids[ids.length - 1] ?? instance.event.id;
  // What is drawn (not a month cell's hidden item for the keyboard).
  const landed = req.root.querySelector<HTMLElement>(`:is(${EVENT_NODE})[data-event-id="${cssEscape(eventId)}"]`);
  if (landed && req.from) ctx.motion.dropSettle?.(landed, req.from);
  return { done: true, eventId, landed };
}

/** A moment as the calendar shows it, with its offset when the wall time happens twice. */
export function timeOf(ctx: ViewCtx, at: Proposal['start'], p: Proposal): string {
  if (p.allDay || !('withTimeZone' in at)) return '';
  const z = (at as ZonedDateTime).withTimeZone(ctx.zone);
  const hm = `${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`;
  return p.ambiguity ? `${hm} (${z.offset})` : hm;
}

const ms = (x: Proposal['start']) => (x as ZonedDateTime).epochMilliseconds;
const cssEscape = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));
