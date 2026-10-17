import { registerModelFamily } from '@dzcalendar/core';
import type { DurationLike, EventInstance, KernelState, ViewRange, ViewSpec, Weekday } from '@dzcalendar/core';
import { buildListModel } from '@dzcalendar/core/views';
import type { ListDay, ListModel } from '@dzcalendar/core/views';
import { h, registerView } from '@dzcalendar/dom/toolkit';
import type { DzMessages, ViewCtx } from '@dzcalendar/dom/toolkit';

/** What a custom view draws from: the period, its days (empty ones too) and their events. */
export interface CustomViewData {
  readonly range: ViewRange;
  /** Every shown day of the period, each with its events in the display zone (a long event on each day it touches). */
  readonly days: readonly ListDay[];
  /** Each event once, in order. */
  readonly instances: readonly EventInstance[];
  readonly state: KernelState;
  readonly zone: string;
  readonly locale: string;
  readonly messages: DzMessages;
}

/** What a custom view may do with the calendar around it. */
export interface CustomViewApi {
  readonly kernel: ViewCtx['kernel'];
  /** What a click on an event does elsewhere: `onEventClick`, else `onEventOpen`. */
  open(instance: EventInstance): void;
  /** The calendar's context menu for an event or a day, anchored to an element. */
  menu(target: { kind: 'event'; instance: EventInstance } | { kind: 'day'; date: ViewRange['start'] }, anchor: HTMLElement): void;
  announce(text: string): void;
}

export interface CustomViewDef {
  readonly type: string;
  readonly duration: DurationLike;
  readonly alignment?: ViewSpec['alignment'];
  readonly dateIncrement?: DurationLike;
  readonly dayCount?: number;
  readonly hiddenDays?: readonly Weekday[];
  /** Draws the period into `el` (called again on every change; `el` is kept). */
  render(el: HTMLElement, data: CustomViewData, api: CustomViewApi): void;
  /** Before `el` leaves (another view, or the calendar destroyed). */
  destroy?(el: HTMLElement): void;
}

interface CustomModel {
  readonly list: ListModel;
  readonly instances: readonly EventInstance[];
}

/**
 * A view of one's own without writing a view family: the calendar keeps the
 * toolbar, the title, navigation and the sources; `render` draws the days.
 * Returns the spec to list in `views` (`views: { agenda: defineView({…}) }`).
 * For full control (gestures, keyboard), `registerView` takes a family.
 */
const BUILT_IN = new Set(['dayGrid', 'timeGrid', 'list', 'multiMonth', 'timeline', 'custom']);
/** The definition in force per type: a type names one view for the page, the last definition wins. */
const DEFS = new Map<string, CustomViewDef>();

export function defineView(def: CustomViewDef): ViewSpec {
  // Its family is its type: a built-in family's name would replace that family for every calendar.
  if (BUILT_IN.has(def.type)) throw new RangeError(`defineView: ${def.type} names a built-in view family`);
  const family = def.type;
  const known = DEFS.has(family);
  DEFS.set(family, def);
  if (known) return specOf(def);
  registerModelFamily<CustomModel>(family, {
    build: (range, snap, { displayZone }) => {
      const list = buildListModel(range, snap, { displayZone, includeEmpty: true });
      const seen = new Set<string>();
      const instances: EventInstance[] = [];
      for (const d of list.days) for (const e of d.entries) if (!seen.has(e.instance.key)) (seen.add(e.instance.key), instances.push(e.instance));
      return { list, instances };
    },
  });
  registerView(family, (ctx) => {
    const el = h(ctx.doc, 'div', 'dz-custom');
    el.setAttribute('role', 'region');
    const api: CustomViewApi = {
      kernel: ctx.kernel,
      open: (instance) => {
        const live = ctx.live();
        if (live.onEventClick) live.onEventClick(instance);
        else live.onEventOpen?.(instance);
      },
      menu: (target, anchor) => void ctx.openMenu(target, anchor, anchor),
      announce: (text) => ctx.announce(text),
    };
    return {
      element: el,
      body: el,
      render(model, state) {
        const m = model as CustomModel;
        el.setAttribute('aria-label', state.title);
        // The application's drawing may throw: reported, and what was drawn stays.
        try {
          DEFS.get(family)!.render(el, { range: m.list.range, days: m.list.days, instances: m.instances, state, zone: ctx.zone, locale: ctx.locale, messages: ctx.messages }, api);
        } catch (err) {
          void Promise.reject(err);
        }
        return [];
      },
      tick() {},
      destroy() {
        try {
          DEFS.get(family)!.destroy?.(el);
        } catch (err) {
          void Promise.reject(err);
        }
        el.remove();
      },
    };
  });
  return specOf(def);
}

function specOf(def: CustomViewDef): ViewSpec {
  const family = def.type;
  return {
    type: def.type,
    family,
    duration: def.duration,
    alignment: def.alignment ?? 'day',
    fixedWeekCount: true,
    hiddenDays: def.hiddenDays ?? [],
    showNonCurrentDates: true,
    ...(def.dateIncrement && { dateIncrement: def.dateIncrement }),
    ...(def.dayCount !== undefined && { dayCount: def.dayCount }),
  };
}
