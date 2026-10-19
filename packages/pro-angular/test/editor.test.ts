import { Component, provideZonelessChangeDetection, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Temporal } from '@dzcalendar/core';
import { DzCalendar, provideDzCalendar } from '@dzcalendar/angular';
import '@dzcalendar/pro';
import { DzEventEditor } from '../src/index.js';
import type { EditorOutcome } from '../src/index.js';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');

@Component({
  standalone: true,
  imports: [DzCalendar, DzEventEditor],
  template: `<dz-calendar dzEventEditor (editorClosed)="closed.push($event)" view="resourceTimelineDay" [date]="date" timeZone="Europe/Paris" locale="fr-FR" [editable]="true"
    [events]="events" [resources]="resources" />`,
})
class Host {
  readonly date = Temporal.PlainDate.from('2026-10-21');
  readonly events = [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'r' }];
  readonly resources = [{ id: 'r', title: 'Salle' }];
  readonly closed: EditorOutcome[] = [];
  readonly cal = viewChild.required(DzCalendar);
}

describe('@dzcalendar/pro-angular', () => {
  it('the timeline is known once imported; dzEventEditor opens the editor on "Open", (editorClosed) says how it closed', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideDzCalendar({ now })] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.dz-tl')).not.toBeNull();
    el.querySelector<HTMLElement>('.dz-tl__ev[data-event-id="a"]')!.focus();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    el.querySelector<HTMLButtonElement>('.dz-menu [data-action="event.open"]')!.click();
    // Fetched on this first opening.
    for (let i = 0; i < 50 && !el.querySelector('.dz-editor'); i++) await new Promise((r) => setTimeout(r, 10));
    const dialog = el.querySelector<HTMLElement>('.dz-editor')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    dialog.querySelector<HTMLButtonElement>('.dz-editor__btn:not(.dz-editor__btn--primary):not(.dz-editor__btn--danger)')!.click();
    await new Promise((r) => setTimeout(r));
    expect(f.componentInstance.closed).toEqual(['cancelled']);
  });
});
