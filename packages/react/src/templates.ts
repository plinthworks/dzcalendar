import type { ReactNode } from 'react';
import type { CalEvent } from '@dzcalendar/core';
import type {
  AllDayLabelCtx,
  CalendarHooks,
  DayCellCtx,
  DayHeaderCtx,
  EventContentCtx,
  HeaderItemCtx,
  ListDayHeaderCtx,
  MonthHeaderCtx,
  MoreLinkCtx,
  NoEventsCtx,
  NowIndicatorCtx,
  ResourceAreaHeaderCtx,
  ResourceContentCtx,
  ResourceGroupCtx,
  SlotLabelCtx,
  WeekNumberCtx,
} from '@dzcalendar/dom';
import type { TemplateSource } from '@dzcalendar/dom/toolkit';

/** The elements with a content an application can draw, and the prop that draws it (docs/behaviors/render-hooks.md). */
export const TEMPLATES = {
  dayHeader: 'renderDayHeader',
  dayCell: 'renderDayCell',
  slotLabel: 'renderSlotLabel',
  allDayLabel: 'renderAllDayLabel',
  moreLink: 'renderMoreLink',
  nowIndicator: 'renderNowIndicator',
  weekNumber: 'renderWeekNumber',
  noEvents: 'renderNoEvents',
  listDayHeader: 'renderListDayHeader',
  monthHeader: 'renderMonthHeader',
  resource: 'renderResource',
  resourceGroupHeader: 'renderResourceGroupHeader',
  resourceAreaHeader: 'renderResourceAreaHeader',
} as const;
/** The elements with a template besides the event. */
export type TemplateElement = keyof typeof TEMPLATES;

/** The render props: each element's content drawn by the application's components, in its tree. */
export interface TemplateProps {
  /** Each event's content (in its tree: its context, state and router reach it). */
  readonly renderEventContent?: (event: CalEvent, ctx: EventContentCtx) => ReactNode;
  /** Each day's head (a week's or a day's date, a month's weekday): a mark, a count, a button. */
  readonly renderDayHeader?: (day: DayHeaderCtx) => ReactNode;
  /** A month's day, in place of its number (the events stay). */
  readonly renderDayCell?: (day: DayCellCtx) => ReactNode;
  readonly renderSlotLabel?: (slot: SlotLabelCtx) => ReactNode;
  readonly renderAllDayLabel?: (label: AllDayLabelCtx) => ReactNode;
  /** "+N". */
  readonly renderMoreLink?: (more: MoreLinkCtx) => ReactNode;
  readonly renderNowIndicator?: (now: NowIndicatorCtx) => ReactNode;
  readonly renderWeekNumber?: (week: WeekNumberCtx) => ReactNode;
  /** The list's "nothing to show". */
  readonly renderNoEvents?: (ctx: NoEventsCtx) => ReactNode;
  readonly renderListDayHeader?: (day: ListDayHeaderCtx) => ReactNode;
  /** A month's title in a year. */
  readonly renderMonthHeader?: (month: MonthHeaderCtx) => ReactNode;
  /** A resource's head (a column, a timeline row's title). */
  readonly renderResource?: (resource: ResourceContentCtx) => ReactNode;
  readonly renderResourceGroupHeader?: (group: ResourceGroupCtx) => ReactNode;
  readonly renderResourceAreaHeader?: (head: ResourceAreaHeaderCtx) => ReactNode;
  /** The application's places in the header, named in `headerToolbar`: a node, or a function of the view and title. */
  readonly headerItems?: Readonly<Record<string, ReactNode | ((ctx: HeaderItemCtx) => ReactNode)>>;
  /** Classes and mounts (and a content where no template is given) for any element: merged with the templates. */
  readonly hooks?: CalendarHooks;
}

/** One element's content: where it goes, what it is told. */
export interface Portal {
  readonly key: string;
  readonly span: HTMLElement;
  ctx: unknown;
}

/** What the shared builder is told about these props (read when called: the latest ones). */
export const sourceOf = (latest: { readonly current: TemplateProps }): TemplateSource => ({
  has: (el) => Boolean(el === 'event' ? latest.current.renderEventContent : latest.current[TEMPLATES[el as TemplateElement]]),
  app: () => latest.current.hooks,
  items: () => Object.entries(latest.current.headerItems ?? {}).filter(([, v]) => v !== undefined).map(([k]) => k),
  blankBackground: (ctx) => {
    const out = latest.current.renderEventContent?.(ctx.instance.event, ctx);
    return out === null || out === undefined || out === false;
  },
});
