import { Directive, NgZone, effect, inject, input, isDevMode, output, untracked } from '@angular/core';
import type { Problem } from '@dzcalendar/core';
import { CalendarController } from '@dzcalendar/angular';
import { applyFullCalendar } from '@dzcalendar/compat-fullcalendar';
import type { FullCalendarOptions } from '@dzcalendar/compat-fullcalendar';

/**
 * `<dz-calendar [dzFullCalendar]="calendarOptions">`: the options an
 * application wrote for FullCalendar, translated and laid on this calendar
 * (again when they change). Their callbacks run in Angular's zone;
 * `(fullCalendarProblems)` says what was guessed or has no equivalent.
 */
@Directive({ selector: 'dz-calendar[dzFullCalendar]', standalone: true })
export class DzFullCalendar {
  readonly dzFullCalendar = input<FullCalendarOptions | null | undefined>(undefined);
  readonly fullCalendarProblems = output<readonly Problem[]>();

  private readonly controller = inject(CalendarController);
  private readonly zone = inject(NgZone);
  private detach: (() => void) | null = null;
  /** The first options decide the view and the date; later ones do not send the calendar back. */
  private applied = false;

  constructor() {
    effect((onCleanup) => {
      const cal = this.controller.instance();
      const given = this.dzFullCalendar();
      if (!cal || !given) return;
      untracked(() => {
        // The application's callbacks back in its zone (the calendar runs outside it).
        const inZone = Object.fromEntries(Object.entries(given).map(([k, v]) => [k, typeof v === 'function' ? (...a: unknown[]) => this.zone.run(() => (v as (...x: unknown[]) => unknown)(...a)) : v]));
        const r = applyFullCalendar(cal, inZone, { initial: !this.applied });
        this.applied = true;
        this.detach = r.detach;
        if (r.problems.length > 0) {
          this.fullCalendarProblems.emit(r.problems);
          if (isDevMode()) console.warn(`dzcalendar (from FullCalendar): ${r.problems.length} problem(s)\n${r.problems.map((p) => `  ${p.severity} ${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''}`).join('\n')}`);
        }
      });
      onCleanup(() => {
        this.detach?.();
        this.detach = null;
      });
    });
  }
}
