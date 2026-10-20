import { describe, it, expect, afterEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import { Temporal } from '@dzcalendar/core';
import { DzCalendar, createCalendarController } from '@dzcalendar/vue';
import '@dzcalendar/pro';
import { useDzExport, useEventEditor } from '../src/index.js';
import type { EditorOutcome } from '../src/index.js';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const date = Temporal.PlainDate.from('2026-10-21');
let app: App | null = null;
let el: HTMLElement;
afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});
const wait = async (ok: () => boolean) => {
  for (let i = 0; i < 50 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
};

describe('@dzcalendar/pro-vue', () => {
  it('useEventEditor: "Open" opens the editor (fetched then), onClosed says how it closed; the timeline is known once imported', async () => {
    const closed: EditorOutcome[] = [];
    const cal = createCalendarController();
    el = document.body.appendChild(document.createElement('div'));
    app = createApp(
      defineComponent({
        setup() {
          useEventEditor(cal, { onClosed: (o) => closed.push(o) });
          return () => h(DzCalendar, { controller: cal, view: 'resourceTimelineDay', date, timeZone: 'Europe/Paris', locale: 'fr-FR', editable: true, initial: { now }, events: [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'r' }], resources: [{ id: 'r', title: 'Salle' }] });
        },
      }),
    );
    app.mount(el);
    await nextTick();
    expect(el.querySelector('.dz-tl')).not.toBeNull();
    el.querySelector<HTMLElement>('.dz-tl__ev[data-event-id="a"]')!.focus();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    el.querySelector<HTMLButtonElement>('.dz-menu [data-action="event.open"]')!.click();
    await wait(() => !!el.querySelector('.dz-editor'));
    const dialog = el.querySelector<HTMLElement>('.dz-editor')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    dialog.querySelector<HTMLButtonElement>('.dz-editor__btn:not(.dz-editor__btn--primary):not(.dz-editor__btn--danger)')!.click();
    await wait(() => closed.length > 0);
    expect(closed).toEqual(['cancelled']);
  });

  it('useDzExport: an ICS of the week (the series whole); a calendar not mounted is a problem, not a throw', async () => {
    const cal = createCalendarController();
    el = document.body.appendChild(document.createElement('div'));
    app = createApp(defineComponent({ setup: () => () => h(DzCalendar, { controller: cal, view: 'timeGridWeek', date, timeZone: 'Europe/Paris', initial: { now }, events: [{ id: 'a', title: 'Garde', start: '2026-10-21T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=2' }] }) }));
    app.mount(el);
    await nextTick();
    const r = await useDzExport(cal).ics();
    const text = await r.blob!.text();
    const none = await useDzExport(createCalendarController()).xlsx();
    expect([r.problems.length, /RRULE:FREQ=DAILY;COUNT=2/.test(text), none.blob, none.problems.map((p) => p.detail)]).toEqual([0, true, null, ['not-attached']]);
  });
});

describe('after the 18c code review (pro-vue)', () => {
  it('the editor keeps "Open" while the parent adds or takes away its own listeners; given back when its component goes', async () => {
    const { ref } = await import('vue');
    const slots = ref(false);
    const cal = createCalendarController();
    const Editor = defineComponent({ setup: () => (useEventEditor(cal), () => null) });
    const withEditor = ref(true);
    el = document.body.appendChild(document.createElement('div'));
    app = createApp(defineComponent({ setup: () => () => [withEditor.value ? h(Editor) : null, h(DzCalendar, { controller: cal, view: 'timeGridWeek', date, timeZone: 'Europe/Paris', initial: { now }, onEventOpen: () => {}, ...(slots.value && { onSlotClick: () => {} }) })] }));
    app.mount(el);
    await nextTick();
    const open = () => cal.instance.value!.getOptions().onEventOpen;
    const first = open();
    slots.value = true;
    await nextTick();
    await nextTick();
    const kept = open() === first;
    withEditor.value = false;
    await nextTick();
    expect([kept, open() !== first && typeof open() === 'function']).toEqual([true, true]);
  });
});
