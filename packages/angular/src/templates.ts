import { Directive, TemplateRef, inject } from '@angular/core';
import type { CalEvent } from '@dzcalendar/core';
import type { EventContentCtx } from '@dzcalendar/dom';

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
