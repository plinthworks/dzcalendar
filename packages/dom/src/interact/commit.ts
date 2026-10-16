import { commandFor } from '@dzcalendar/core';
import type { EditScope, EventInstance, Proposal, ZonedDateTime } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';

export interface CommitRequest {
  readonly instance: EventInstance;
  readonly proposal: Proposal;
  readonly kind: 'move' | 'resize';
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

/**
 * From a proposal to the calendar, the same way for every input: refused
 * (said, and shown going back), or asked how far it reaches (a series) and
 * which reading (a repeated hour), then run through the history, said, and
 * animated. Resolves true when the change was made. Never throws: an
 * application callback that fails is reported and the gesture ends cleanly.
 */
export async function commitProposal(ctx: ViewCtx, req: CommitRequest): Promise<boolean> {
  const { instance, proposal, kind } = req;
  const title = instance.event.title || ctx.messages.untitled;
  if (!proposal.valid) {
    ctx.announce(ctx.messages.dropRefused);
    ctx.live().onProposalRefused?.(proposal);
    const to = req.source?.isConnected ? req.source.getBoundingClientRect() : null;
    await (ctx.motion.dropRejected?.(req.ghosts, to) ?? Promise.resolve());
    return false;
  }

  let scope: EditScope = 'this';
  let chosen = proposal;
  if (instance.event.ref) {
    // Switching between timed and all-day is for one occurrence only (a series keeps one kind).
    if (proposal.allDay === instance.event.allDay) {
      const s = await ctx.chooseScope({ instance, proposal, kind }, req.at);
      if (!s || ctx.scope.isDisposed) return false;
      scope = s;
    }
  }
  if (proposal.ambiguity) {
    const pick = await ctx.chooseReading(proposal, req.at);
    if (!pick || ctx.scope.isDisposed) return false;
    chosen = pick;
  }

  const command = commandFor(instance, chosen, scope);
  const others = [...req.root.querySelectorAll<HTMLElement>('.dz-ev:not(.dz-ev--bg), .dz-bar:not(.dz-bar--bg)')].filter((n) => n.dataset['eventId'] !== instance.event.id);
  const layout = ctx.motion.captureLayout?.(others);
  const result = ctx.kernel.run(command, { validate: true });
  if (!result.ok) {
    ctx.refused(result, command);
    return false;
  }
  const time = timeOf(ctx, kind === 'resize' && proposal.ambiguity?.edge !== 'start' ? chosen.end : chosen.start, chosen);
  if (chosen.skipped) ctx.announce(ctx.messages.movedIntoGap({ time }));
  else if (kind === 'resize') ctx.announce(ctx.messages.eventResized({ title, time }));
  else ctx.announce(ctx.messages.eventMoved({ title, time }));
  if (layout !== undefined) ctx.motion.animateLayout?.(layout);
  const ids = result.mutations.filter((m) => m.kind === 'event' && m.after).map((m) => m.after!.id);
  const landed = req.root.querySelector<HTMLElement>(`[data-event-id="${cssEscape(ids[ids.length - 1] ?? instance.event.id)}"]`);
  if (landed && req.from) ctx.motion.dropSettle?.(landed, req.from);
  return true;
}

/** A moment as the calendar shows it, with its offset when the wall time happens twice. */
export function timeOf(ctx: ViewCtx, at: Proposal['start'], p: Proposal): string {
  if (p.allDay || !('withTimeZone' in at)) return '';
  const z = (at as ZonedDateTime).withTimeZone(ctx.zone);
  const hm = `${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`;
  return p.ambiguity ? `${hm} (${z.offset})` : hm;
}

const cssEscape = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));
