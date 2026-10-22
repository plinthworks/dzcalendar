import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';

// The header's layout and the application's buttons (docs/behaviors/header-toolbar.md).
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const make = (o: Record<string, unknown> = {}) =>
  (cal = createCalendar(document.body.appendChild(document.createElement('div')), {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    initialView: 'timeGridWeek',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    now,
    ...o,
  }));
/** Each place's pieces: a group in brackets, a button by its words, the title as "T". */
const layout = (c: CalendarInstance) =>
  [...c.element.querySelectorAll<HTMLElement>('.dz-toolbar__section')].map((s) =>
    [...s.children]
      .map((x) => (x.classList.contains('dz-toolbar__group') ? `[${[...x.children].map((b) => b.textContent).join(',')}]` : x.tagName === 'H2' ? 'T' : x.textContent))
      .join(' '),
  );

describe('the header', () => {
  it('without headerToolbar: as before — arrows, today, the title at the start; month, week, day joined at the end', () => {
    expect(layout(make())).toEqual(["‹ Aujourd'hui › T", '', '[Mois,Semaine,Jour]']);
  });

  it('three places, a space between groups, a comma inside one', () => {
    const c = make({ headerToolbar: { start: 'prev,next today', center: 'title', end: 'dayGridMonth,timeGridWeek timeGridDay' } });
    expect(layout(c)).toEqual(['[‹,›] Aujourd\'hui', 'T', '[Mois,Semaine] Jour']);
    // The week is the current view: pressed.
    expect([...c.element.querySelectorAll('.dz-toolbar__view[aria-pressed="true"]')].map((b) => b.textContent)).toEqual(['Semaine']);
  });

  it('false: no header; a layout given later puts it back where it was', () => {
    const c = make({ headerToolbar: false });
    const none = c.element.querySelector('.dz-toolbar');
    c.update({ headerToolbar: { start: 'title' } });
    const bar = c.element.querySelector('.dz-toolbar')!;
    expect([none, bar.nextElementSibling?.classList.contains('dz-toolbar') ?? false, layout(c)[0]]).toEqual([null, false, 'T']);
    // Before the view, as the header always is.
    expect(bar.compareDocumentPosition(c.element.querySelector('.dz-tg')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('an application’s button: its words, hint, icon; a click handed the event and the button', () => {
    const clicks: string[] = [];
    const c = make({
      headerToolbar: { end: 'reload' },
      customButtons: { reload: { text: 'Recharger', hint: 'Recharger les rendez-vous', icon: 'ic-refresh', click: (e: MouseEvent, el: HTMLElement) => void clicks.push(`${e.type} ${el.dataset['button']}`) } },
    });
    const b = c.element.querySelector<HTMLButtonElement>('.dz-toolbar__custom')!;
    b.click();
    expect([b.textContent, b.title, b.querySelector('.ic-refresh')?.getAttribute('aria-hidden'), clicks]).toEqual(['Recharger', 'Recharger les rendez-vous', 'true', ['click reload']]);
  });

  it('a button without words is named by its hint', () => {
    const c = make({ headerToolbar: { end: 'blocked' }, customButtons: { blocked: { hint: 'Créneaux bloqués', icon: 'ic-lock', click: () => {} } } });
    expect(c.element.querySelector('.dz-toolbar__custom')!.getAttribute('aria-label')).toBe('Créneaux bloqués');
  });

  it('active: a toggle, re-read each time the calendar draws', () => {
    let mode = '';
    const c = make({ headerToolbar: { end: 'blocked' }, customButtons: { blocked: { text: 'Créneaux bloqués', active: () => mode === 'blocked', click: () => void (mode = mode ? '' : 'blocked') } } });
    const b = () => c.element.querySelector('.dz-toolbar__custom')!;
    const before = b().getAttribute('aria-pressed');
    (b() as HTMLElement).click();
    c.navigate('next');
    expect([before, b().getAttribute('aria-pressed')]).toEqual(['false', 'true']);
  });

  it('a button under a built-in name takes its place; an unknown name is left out and said once', () => {
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (m: string) => void warned.push(m);
    try {
      const c = make({ headerToolbar: { start: 'today nope nope' }, customButtons: { today: { text: 'Maintenant', click: () => {} } } });
      expect([layout(c)[0], warned.filter((w) => w.includes('nope')).length]).toEqual(['Maintenant', 1]);
    } finally {
      console.warn = warn;
    }
  });

  it('a click that throws is reported; the calendar goes on', async () => {
    const reported: unknown[] = [];
    const on = (e: unknown) => void reported.push(e);
    process.on('unhandledRejection', on as never);
    const c = make({ headerToolbar: { start: 'boom next' }, customButtons: { boom: { text: 'x', click: () => { throw new Error('app bug'); } } } });
    c.element.querySelector<HTMLElement>('.dz-toolbar__custom')!.click();
    c.element.querySelector<HTMLElement>('.dz-toolbar__next')!.click();
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', on as never);
    expect([reported.length, String(c.kernel.getState().range.start)]).toEqual([1, '2026-10-26']);
  });

  it('live: the same layout and functions again redraw nothing; new ones redraw', () => {
    const click = () => {};
    const c = make({ headerToolbar: { end: 'reload' }, customButtons: { reload: { text: 'A', click } } });
    const first = c.element.querySelector('.dz-toolbar__custom');
    c.update({ headerToolbar: { end: 'reload' }, customButtons: { reload: { text: 'A', click } } });
    const same = c.element.querySelector('.dz-toolbar__custom') === first;
    c.update({ customButtons: { reload: { text: 'B', click } } });
    expect([same, c.element.querySelector('.dz-toolbar__custom')!.textContent]).toEqual([true, 'B']);
  });
});

describe('after the 18f-1b review', () => {
  it('new closures that look the same (a framework’s render): the node stays focused, the new click is used', () => {
    const log: string[] = [];
    const c = make({ headerToolbar: { end: 'reload' }, customButtons: { reload: { text: 'R', click: () => void log.push('first') } } });
    const b = c.element.querySelector<HTMLButtonElement>('.dz-toolbar__custom')!;
    b.focus();
    c.update({ customButtons: { reload: { text: 'R', click: () => void log.push('second') } } });
    b.click();
    expect([c.element.querySelector('.dz-toolbar__custom') === b, document.activeElement === b, log]).toEqual([true, true, ['second']]);
  });

  it('a click re-reads the toggle at once', () => {
    let on = false;
    const c = make({ headerToolbar: { end: 'blocked' }, customButtons: { blocked: { text: 'B', active: () => on, click: () => void (on = !on) } } });
    const b = c.element.querySelector<HTMLElement>('.dz-toolbar__custom')!;
    b.click();
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });

  it('bad input: a button without click, a null one, a number for an icon, a place that is not a string, a layout that is not an object — nothing thrown, said', () => {
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (m: string) => void warned.push(m);
    try {
      const c = make({
        headerToolbar: { start: 'a b c', end: 7 },
        customButtons: { a: { text: 'A' }, b: null, c: { text: 'C', icon: 3, click: () => {} } },
      });
      const first = layout(c);
      c.update({ headerToolbar: 'title' as never });
      expect([first, layout(c)[2], warned.length >= 4]).toEqual([['C', '', ''], '[Mois,Semaine,Jour]', true]);
    } finally {
      console.warn = warn;
    }
  });

  it('only views make a named group; other joined buttons have no group role', () => {
    const c = make({ headerToolbar: { start: 'prev,next', end: 'dayGridMonth,timeGridWeek' } });
    const groups = [...c.element.querySelectorAll('.dz-toolbar__group')].map((g) => `${g.getAttribute('role')} ${g.getAttribute('aria-label')}`);
    expect(groups).toEqual(['null null', 'group Vue']);
  });

  it('a view this page cannot draw is said once, not at each new layout', () => {
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (m: string) => void warned.push(m);
    try {
      const c = make({ headerToolbar: { end: 'listWeek timeGridDay' } });
      c.update({ headerToolbar: { end: 'listWeek timeGridWeek' } });
      expect(warned.filter((w) => w.includes('listWeek')).length).toBe(1);
    } finally {
      console.warn = warn;
    }
  });
});
