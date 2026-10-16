import type { Command } from '../commands/types.js';
import type { EventInstance } from '../store/store.js';
import type { Instant, PlainDate, ZoneId } from '../temporal.js';

/**
 * Where a context menu was opened: a moment in a time grid, a whole day, or
 * an event. A moment carries its reading, so a menu on the repeated 02:30 can
 * offer both, and one in a skipped hour can say where it lands.
 */
export type ActionTarget =
  | {
      readonly kind: 'slot';
      readonly date: PlainDate;
      readonly instant: Instant;
      readonly exists: boolean;
      readonly ambiguous: boolean;
      /** The other reading of a repeated wall time. */
      readonly alternative: Instant | null;
      readonly resourceId?: string;
    }
  | { readonly kind: 'day'; readonly date: PlainDate; readonly resourceId?: string }
  | { readonly kind: 'event'; readonly instance: EventInstance };

/**
 * One menu entry, as data: the calendar renders it (themed, RTL, accessible),
 * the application may keep, reorder, replace or add entries. Disabled entries
 * stay visible with their reason.
 */
export interface ActionItem {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason?: string;
  readonly shortcut?: string;
  /** A name the theme can draw an icon for. */
  readonly icon?: string;
  readonly children?: readonly ActionItem[];
  /**
   * The edit this entry stands for, when it is one (Phases 6–7): validated and
   * undoable like any command. An application's entries usually carry `run`.
   */
  readonly command?: Command;
  /** What runs. The built-ins call back into the calendar; an app's own entries carry their own. */
  readonly run?: () => void;
}

/**
 * "New event here", as the application receives it: a moment in a time
 * grid, a date in a month — a whole day is not "midnight", which some days do
 * not have (São Paulo, 4 November 2018).
 */
export type CreateRequest =
  | { readonly allDay: false; readonly start: Instant; readonly resourceId?: string }
  | { readonly allDay: true; readonly start: PlainDate; readonly resourceId?: string };

/** The words for the built-in entries, from the DOM's messages. */
export interface ActionLabels {
  newEventAt(parts: { time: string }): string;
  /** A whole-day event, from a month cell. */
  newEventOn(parts: { date: string }): string;
  readonly goToDay: string;
  readonly openEvent: string;
  readonly skippedHour: string;
}

export interface ActionContext {
  readonly displayZone: ZoneId;
  readonly labels: ActionLabels;
  /** Formats a moment for an entry, with its offset when it needs telling apart. */
  readonly formatTime: (i: Instant, withOffset: boolean) => string;
  readonly formatDate: (d: PlainDate) => string;
  /** Callbacks the built-ins run. Editing entries join in Phases 6–7. */
  readonly onCreateRequest?: (request: CreateRequest) => void;
  readonly onGoToDay?: (d: PlainDate) => void;
  readonly onOpen?: (instance: EventInstance) => void;
}

/**
 * The built-in entries for a target. Phase 4: read actions and the requests
 * an application handles itself; Phases 6–8 add editing (move, resize,
 * delete, series scope) as commands.
 */
export function actionsFor(target: ActionTarget, ctx: ActionContext): ActionItem[] {
  const out: ActionItem[] = [];
  if (target.kind === 'slot') {
    if (ctx.onCreateRequest) {
      const create = ctx.onCreateRequest;
      // A repeated hour has two moments: offer both, told apart by offset.
      const moments = target.ambiguous && target.alternative ? [target.instant, target.alternative] : [target.instant];
      for (const [i, m] of moments.entries()) {
        out.push({
          id: moments.length > 1 ? `event.create.${i}` : 'event.create',
          label: ctx.labels.newEventAt({ time: ctx.formatTime(m, moments.length > 1) }),
          enabled: true,
          ...(!target.exists && { reason: ctx.labels.skippedHour }),
          run: () => create({ allDay: false, start: m, ...(target.resourceId !== undefined && { resourceId: target.resourceId }) }),
        });
      }
    }
    if (ctx.onGoToDay) out.push({ id: 'view.goToDay', label: ctx.labels.goToDay, enabled: true, run: () => ctx.onGoToDay!(target.date) });
  } else if (target.kind === 'day') {
    if (ctx.onCreateRequest) {
      const create = ctx.onCreateRequest;
      out.push({
        id: 'event.create',
        label: ctx.labels.newEventOn({ date: ctx.formatDate(target.date) }),
        enabled: true,
        run: () => create({ allDay: true, start: target.date, ...(target.resourceId !== undefined && { resourceId: target.resourceId }) }),
      });
    }
    if (ctx.onGoToDay) out.push({ id: 'view.goToDay', label: ctx.labels.goToDay, enabled: true, run: () => ctx.onGoToDay!(target.date) });
  } else if (ctx.onOpen) {
    const open = ctx.onOpen;
    out.push({ id: 'event.open', label: ctx.labels.openEvent, enabled: true, run: () => open(target.instance) });
  }
  return out;
}
