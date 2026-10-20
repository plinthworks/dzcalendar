import { Directive, TemplateRef, inject } from '@angular/core';
import type { CalEvent } from '@dzcalendar/core';
import type { DayHeaderCtx, EventContentCtx } from '@dzcalendar/dom';

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

