import { Directive, TemplateRef, inject, input } from '@angular/core';
import type { CalEvent } from '@dzcalendar/core';
import type {
  AllDayLabelCtx,
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

/** What an event's template sees: `let-event="event" let-ctx="ctx"` (or the event as `$implicit`). */
export interface EventContentContext {
  $implicit: CalEvent;
  event: CalEvent;
  ctx: EventContentCtx;
}

/**
 * `<ng-template dzEventContent let-event="event" let-ctx="ctx">…</ng-template>`
 * inside `<dz-calendar>`: the content of every event. Each event's view is
 * checked on its own, and only when that event's content changed.
 */
@Directive({ selector: 'ng-template[dzEventContent]', standalone: true })
export class DzEventContent {
  readonly template = inject<TemplateRef<EventContentContext>>(TemplateRef);

  static ngTemplateContextGuard(_dir: DzEventContent, ctx: unknown): ctx is EventContentContext {
    return true;
  }
}

/** What a day's head template sees: `let-day` (or the day as `$implicit`): its date, resource, length, the calendar's words. */
export interface DayHeaderContext {
  $implicit: DayHeaderCtx;
  day: DayHeaderCtx;
  /** The same day, as every other element's template names it (`let-ctx="ctx"`). */
  ctx: DayHeaderCtx;
}

/**
 * `<ng-template dzDayHeader let-day>…</ng-template>` inside `<dz-calendar>`:
 * every day's head (a week's or a day's date, a month's weekday) — a mark, a
 * count, a button. Each head's view is checked on its own.
 */
@Directive({ selector: 'ng-template[dzDayHeader]', standalone: true })
export class DzDayHeader {
  readonly template = inject<TemplateRef<DayHeaderContext>>(TemplateRef);

  static ngTemplateContextGuard(_dir: DzDayHeader, ctx: unknown): ctx is DayHeaderContext {
    return true;
  }
}


/** What the templates added in 18f-2 see: `let-ctx` (or the context as `$implicit`). */
export interface ElementContext<C> {
  $implicit: C;
  ctx: C;
}

/** A day's cell in a month, in place of its number: `<ng-template dzDayCell let-ctx>` (date, outside, length…). */
@Directive({ selector: 'ng-template[dzDayCell]', standalone: true })
export class DzDayCell {
  readonly template = inject<TemplateRef<ElementContext<DayCellCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzDayCell, ctx: unknown): ctx is ElementContext<DayCellCtx> {
    return true;
  }
}
/** A time label in a time grid's gutter. */
@Directive({ selector: 'ng-template[dzSlotLabel]', standalone: true })
export class DzSlotLabel {
  readonly template = inject<TemplateRef<ElementContext<SlotLabelCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzSlotLabel, ctx: unknown): ctx is ElementContext<SlotLabelCtx> {
    return true;
  }
}
/** The all-day row's label. */
@Directive({ selector: 'ng-template[dzAllDayLabel]', standalone: true })
export class DzAllDayLabel {
  readonly template = inject<TemplateRef<ElementContext<AllDayLabelCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzAllDayLabel, ctx: unknown): ctx is ElementContext<AllDayLabelCtx> {
    return true;
  }
}
/** "+N". */
@Directive({ selector: 'ng-template[dzMoreLink]', standalone: true })
export class DzMoreLink {
  readonly template = inject<TemplateRef<ElementContext<MoreLinkCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzMoreLink, ctx: unknown): ctx is ElementContext<MoreLinkCtx> {
    return true;
  }
}
/** The line at the current time. */
@Directive({ selector: 'ng-template[dzNowIndicator]', standalone: true })
export class DzNowIndicator {
  readonly template = inject<TemplateRef<ElementContext<NowIndicatorCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzNowIndicator, ctx: unknown): ctx is ElementContext<NowIndicatorCtx> {
    return true;
  }
}
/** A week's number. */
@Directive({ selector: 'ng-template[dzWeekNumber]', standalone: true })
export class DzWeekNumber {
  readonly template = inject<TemplateRef<ElementContext<WeekNumberCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzWeekNumber, ctx: unknown): ctx is ElementContext<WeekNumberCtx> {
    return true;
  }
}
/** The list's "nothing to show". */
@Directive({ selector: 'ng-template[dzNoEvents]', standalone: true })
export class DzNoEvents {
  readonly template = inject<TemplateRef<ElementContext<NoEventsCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzNoEvents, ctx: unknown): ctx is ElementContext<NoEventsCtx> {
    return true;
  }
}
/** A list's day heading. */
@Directive({ selector: 'ng-template[dzListDayHeader]', standalone: true })
export class DzListDayHeader {
  readonly template = inject<TemplateRef<ElementContext<ListDayHeaderCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzListDayHeader, ctx: unknown): ctx is ElementContext<ListDayHeaderCtx> {
    return true;
  }
}
/** A month's title in a year. */
@Directive({ selector: 'ng-template[dzMonthHeader]', standalone: true })
export class DzMonthHeader {
  readonly template = inject<TemplateRef<ElementContext<MonthHeaderCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzMonthHeader, ctx: unknown): ctx is ElementContext<MonthHeaderCtx> {
    return true;
  }
}
/** A resource's head (a column, a timeline row's title). */
@Directive({ selector: 'ng-template[dzResource]', standalone: true })
export class DzResource {
  readonly template = inject<TemplateRef<ElementContext<ResourceContentCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzResource, ctx: unknown): ctx is ElementContext<ResourceContentCtx> {
    return true;
  }
}
/** A group's head (resource views, a timeline). */
@Directive({ selector: 'ng-template[dzResourceGroupHeader]', standalone: true })
export class DzResourceGroupHeader {
  readonly template = inject<TemplateRef<ElementContext<ResourceGroupCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzResourceGroupHeader, ctx: unknown): ctx is ElementContext<ResourceGroupCtx> {
    return true;
  }
}
/** A timeline's resource column head. */
@Directive({ selector: 'ng-template[dzResourceAreaHeader]', standalone: true })
export class DzResourceAreaHeader {
  readonly template = inject<TemplateRef<ElementContext<ResourceAreaHeaderCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzResourceAreaHeader, ctx: unknown): ctx is ElementContext<ResourceAreaHeaderCtx> {
    return true;
  }
}

/**
 * `<ng-template dzHeaderItem="filter" let-ctx>…</ng-template>` inside
 * `<dz-calendar>`: the application's place named `filter` in `headerToolbar`
 * (a menu, a filter, a badge); `ctx` holds the view and the title.
 */
@Directive({ selector: 'ng-template[dzHeaderItem]', standalone: true })
export class DzHeaderItem {
  readonly name = input.required<string>({ alias: 'dzHeaderItem' });
  readonly template = inject<TemplateRef<ElementContext<HeaderItemCtx>>>(TemplateRef);
  static ngTemplateContextGuard(_d: DzHeaderItem, ctx: unknown): ctx is ElementContext<HeaderItemCtx> {
    return true;
  }
}
