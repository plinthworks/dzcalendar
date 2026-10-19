import { Directive, NgZone, effect, inject, input, output, untracked } from '@angular/core';
import type { CreateRequest, EventInstance } from '@dzcalendar/core';
import { CalendarController } from '@dzcalendar/angular';
import type { EditorOptions, EditorOutcome } from '@dzcalendar/pro/editor';

/** The editor and tzslot's widget are fetched on the first opening, not with the application. */
const editor = () => import('@dzcalendar/pro/editor').then((m) => m.openEventEditor);

/**
 * `<dz-calendar dzEventEditor>`: "Open" on an event and "New event here" from
 * the context menu open the Pro's editor (a modal dialog, the usual
 * recurrences). `[dzEventEditor]="options"` sets its options; `(editorClosed)`
 * says how it closed. It takes over `onEventOpen` and `onCreateRequest`: the
 * calendar's `(eventOpen)` and `(createRequest)` no longer fire.
 */
@Directive({ selector: 'dz-calendar[dzEventEditor]', standalone: true })
export class DzEventEditor {
  /** The editor's options; the bare attribute takes the defaults. */
  readonly dzEventEditor = input<EditorOptions | '' | null | undefined>(undefined);
  /** Saved, deleted, or cancelled. */
  readonly editorClosed = output<EditorOutcome>();

  private readonly controller = inject(CalendarController);
  private readonly zone = inject(NgZone);

  /** What closing says, back in Angular; a chunk that fails to load is reported (and "cancelled" said), not lost. */
  private run(p: Promise<EditorOutcome>): void {
    p.then(
      (o) => this.zone.run(() => this.editorClosed.emit(o)),
      (err: unknown) => {
        this.zone.run(() => this.editorClosed.emit('cancelled'));
        void Promise.reject(err);
      },
    );
  }

  constructor() {
    effect(() => {
      const cal = this.controller.instance();
      const options = this.dzEventEditor() || {};
      if (!cal) return;
      // The calendar is called outside Angular; what the editor says comes back in.
      untracked(() =>
        this.zone.runOutsideAngular(() =>
          cal.update({
            onEventOpen: (instance: EventInstance) => this.run(editor().then((open) => open(cal, { instance }, options))),
            onCreateRequest: (request: CreateRequest) => this.run(editor().then((open) => open(cal, { create: request }, options))),
          }),
        ),
      );
    });
  }
}
