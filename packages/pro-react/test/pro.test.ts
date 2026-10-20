import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Temporal } from '@dzcalendar/core';
import { CalendarController, DzCalendar, useCalendarController } from '@dzcalendar/react';
import '@dzcalendar/pro';
import { useDzExport, useEventEditor } from '../src/index.js';
import type { DzExports, EditorOutcome } from '../src/index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const date = Temporal.PlainDate.from('2026-10-21');
let root: Root | null = null;
let el: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
const wait = async (ok: () => boolean) => {
  for (let i = 0; i < 50 && !ok(); i++) await act(() => new Promise((r) => setTimeout(r, 10)));
};

describe('@dzcalendar/pro-react', () => {
  it('useEventEditor: "Open" opens the editor (fetched then), onClosed says how it closed; the timeline is known once imported', async () => {
    const closed: EditorOutcome[] = [];
    function App() {
      const cal = useCalendarController();
      useEventEditor(cal, { onClosed: (o) => closed.push(o) });
      return h(DzCalendar, { controller: cal, defaultView: 'resourceTimelineDay', defaultDate: date, timeZone: 'Europe/Paris', locale: 'fr-FR', editable: true, initial: { now }, events: [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'r' }], resources: [{ id: 'r', title: 'Salle' }] });
    }
    el = document.body.appendChild(document.createElement('div'));
    root = createRoot(el);
    await act(async () => root!.render(h(App)));
    expect(el.querySelector('.dz-tl')).not.toBeNull();
    el.querySelector<HTMLElement>('.dz-tl__ev[data-event-id="a"]')!.focus();
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })));
    act(() => el.querySelector<HTMLButtonElement>('.dz-menu [data-action="event.open"]')!.click());
    await wait(() => !!el.querySelector('.dz-editor'));
    const dialog = el.querySelector<HTMLElement>('.dz-editor')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    act(() => dialog.querySelector<HTMLButtonElement>('.dz-editor__btn:not(.dz-editor__btn--primary):not(.dz-editor__btn--danger)')!.click());
    await wait(() => closed.length > 0);
    expect(closed).toEqual(['cancelled']);
  });

  it('useDzExport: an ICS of the week (the series whole); a calendar not mounted is a problem, not a throw', async () => {
    let exports!: DzExports;
    function App() {
      const cal = useCalendarController();
      exports = useDzExport(cal);
      return h(DzCalendar, { controller: cal, defaultView: 'timeGridWeek', defaultDate: date, timeZone: 'Europe/Paris', initial: { now }, events: [{ id: 'a', title: 'Garde', start: '2026-10-21T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=2' }] });
    }
    el = document.body.appendChild(document.createElement('div'));
    root = createRoot(el);
    await act(async () => root!.render(h(App)));
    const r = await exports.ics();
    const text = await r.blob!.text();
    const none = await useDzExportOf(new CalendarController()).xlsx();
    expect([r.problems.length, /RRULE:FREQ=DAILY;COUNT=2/.test(text), none.blob, none.problems.map((p) => p.detail)]).toEqual([0, true, null, ['not-attached']]);
  });
});

/** The hook's object outside a component (it only memoizes). */
function useDzExportOf(c: CalendarController): DzExports {
  let out!: DzExports;
  function Probe() {
    out = useDzExport(c);
    return null;
  }
  const r = createRoot(document.createElement('div'));
  act(() => r.render(h(Probe)));
  act(() => r.unmount());
  return out;
}

describe('after the 18c code review (pro-react)', () => {
  it('the editor keeps "Open" and "New event here" while the parent adds or takes away its own offers', async () => {
    let setSlots!: (b: boolean) => void;
    let cal!: CalendarController;
    const { useState } = await import('react');
    function App() {
      cal = useCalendarController();
      const [slots, ss] = useState(false);
      setSlots = ss;
      useEventEditor(cal);
      return h(DzCalendar, { controller: cal, defaultView: 'timeGridWeek', defaultDate: date, timeZone: 'Europe/Paris', initial: { now }, onEventOpen: () => {}, ...(slots && { onSlotClick: () => {} }) });
    }
    el = document.body.appendChild(document.createElement('div'));
    root = createRoot(el);
    await act(async () => root!.render(h(App)));
    const theEditors = () => cal.getSnapshot().instance!.getOptions().onEventOpen === cal.takenOver?.onEventOpen;
    const before = theEditors();
    await act(async () => setSlots(true));
    const after = theEditors();
    await act(async () => root!.render(h('div')));
    expect([before, after]).toEqual([true, true]);
  });
});
