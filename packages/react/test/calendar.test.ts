import { describe, it, expect, afterEach, vi } from 'vitest';
import { StrictMode, act, createContext, createElement as h, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Temporal } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { CalendarController, DzCalendar, DzCalendarProvider, useCalendarController, useCalendarState, useParentCalendarController } from '../src/index.js';
import { same } from '../src/same.js';
import type { DzCalendarHandle, DzCalendarProps } from '../src/index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const P = 'Europe/Paris';
const d = (s: string) => Temporal.PlainDate.from(s);
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const events: EventInput[] = [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' }];

let root: Root | null = null;
let el: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
const render = (node: ReactNode) => {
  el = document.body.appendChild(document.createElement('div'));
  root = createRoot(el);
  act(() => root!.render(node));
};
const base: DzCalendarProps = { timeZone: P, locale: 'fr-FR', defaultView: 'timeGridWeek', defaultDate: d('2026-10-21'), events, initial: { now } };

describe('<DzCalendar>', () => {
  it('draws the events given; a new array with the same events redraws nothing; a changed title is drawn', () => {
    let set!: (e: EventInput[]) => void;
    function App() {
      const [list, setList] = useState(events);
      set = setList;
      return h(DzCalendar, { ...base, events: list });
    }
    render(h(App));
    const node = () => el.querySelector('[data-event-id="a"]');
    const first = node();
    expect(first?.textContent).toContain('Consultation');
    act(() => set([{ ...events[0]! }]));
    expect(node()).toBe(first);
    act(() => set([{ ...events[0]!, title: 'Contrôle' }]));
    expect(node()?.textContent).toContain('Contrôle');
  });

  it('the controller drives it and is read with hooks; view and date changes are said once each', () => {
    const said: string[] = [];
    let ctl!: CalendarController;
    function Header() {
      const s = useCalendarState(ctl);
      return h('p', { id: 'state' }, `${s.view} ${String(s.date)} ${s.canUndo}`);
    }
    function App() {
      ctl = useCalendarController();
      return h('div', null, h(Header), h(DzCalendar, { ...base, controller: ctl, onViewChange: (v) => said.push(`view ${v}`), onDateChange: (x) => said.push(`date ${x}`) }));
    }
    render(h(App));
    expect(el.querySelector('#state')!.textContent).toBe('timeGridWeek 2026-10-21 false');
    act(() => ctl.next());
    act(() => ctl.changeView('dayGridMonth'));
    // A week later: Wednesday 28 October.
    expect([el.querySelector('#state')!.textContent, said]).toEqual(['dayGridMonth 2026-10-28 false', ['date 2026-10-28', 'view dayGridMonth']]);
    act(() => void ctl.dispatch({ type: 'event.update', id: 'a', patch: { title: 'Moved' } } as never));
    expect(el.querySelector('#state')!.textContent).toBe('dayGridMonth 2026-10-28 true');
  });

  it('view given: the calendar follows the prop; a refused view is reported, the rest applied', () => {
    const errors: unknown[] = [];
    let setView!: (v: string) => void;
    let setWeekends!: (w: boolean) => void;
    let handle: DzCalendarHandle | null = null;
    function App() {
      const [view, sv] = useState('timeGridWeek');
      const [weekends, sw] = useState(true);
      setView = sv;
      setWeekends = sw;
      return h(DzCalendar, { ...base, view, weekends, onError: (e) => errors.push(e), ref: (r: DzCalendarHandle | null) => void (handle = r) });
    }
    render(h(App));
    act(() => setView('dayGridMonth'));
    expect(handle!.instance!.kernel.getState().view.type).toBe('dayGridMonth');
    act(() => {
      setView('nope');
      setWeekends(false);
    });
    expect([handle!.instance!.kernel.getState().view.type, handle!.instance!.getOptions().weekends, errors.length]).toEqual(['dayGridMonth', false, 1]);
  });

  it('renderEventContent: the application’s components, in its tree (its context reaches them), drawn again with its state', async () => {
    const Theme = createContext('clair');
    function Badge(props: { title: string }) {
      return h('b', { className: 'badge' }, `${useContext(Theme)} · ${props.title}`);
    }
    let setTheme!: (t: string) => void;
    function App() {
      const [theme, st] = useState('clair');
      setTheme = st;
      return h(Theme.Provider, { value: theme }, h(DzCalendar, { ...base, renderEventContent: (e) => h(Badge, { title: e.title }) }));
    }
    // The portals are drawn in a microtask (before the browser paints): an async act waits for it.
    await act(async () => render(h(App)));
    const badge = () => el.querySelector('[data-event-id="a"] .badge')?.textContent;
    expect(badge()).toBe('clair · Consultation');
    await act(async () => setTheme('sombre'));
    expect(badge()).toBe('sombre · Consultation');
  });

  it('a component that reads the calendar while rendering it with literals written again each time: no endless render', () => {
    let renders = 0;
    function App() {
      const cal = useCalendarController();
      const s = useCalendarState(cal);
      renders++;
      return h(DzCalendar, { ...base, controller: cal, resources: [{ id: 'r', title: 'Salle' }], businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' }, hiddenDays: [], className: s.title ? 'ready' : '' });
    }
    render(h(App));
    expect([renders < 10, el.querySelector('.ready') !== null]).toEqual([true, true]);
  });

  it('under StrictMode (mounted twice): one calendar, its events, no leak', () => {
    render(h(StrictMode, null, h(DzCalendar, base)));
    expect([el.querySelectorAll('.dz-cal').length, el.querySelectorAll('[data-event-id="a"]').length]).toEqual([1, 1]);
  });

  it('events that cannot be read are reported (onProblems), the others drawn', () => {
    const reports: string[] = [];
    render(h(DzCalendar, { ...base, events: [...events, { id: 'x', title: 'X' } as EventInput], onProblems: (r) => reports.push(...r.problems.map((p) => p.code)) }));
    expect([reports, el.querySelectorAll('[data-event-id]').length]).toEqual([['missing-start'], 1]);
  });

  it('defaults from a provider; the motion made once per calendar; own props win', () => {
    const made = vi.fn(() => ({}));
    render(h(DzCalendarProvider, { defaults: { timeZone: 'America/Chicago', locale: 'en-US' }, motion: made }, h(DzCalendar, { defaultView: 'timeGridWeek', defaultDate: d('2026-10-21'), locale: 'fr-FR', initial: { now }, ref: (r: DzCalendarHandle | null) => void (r && (handle = r)) })));
    expect([handle!.instance!.kernel.getState().timeZone, handle!.instance!.kernel.getState().locale, made.mock.calls.length]).toEqual(['America/Chicago', 'fr-FR', 1]);
  });

  it('"Open" is offered only while onEventOpen is given', () => {
    let setOpen!: (b: boolean) => void;
    function App() {
      const [open, so] = useState(false);
      setOpen = so;
      return h(DzCalendar, { ...base, ref: (r: DzCalendarHandle | null) => void (r && (handle = r)), ...(open && { onEventOpen: () => {} }) });
    }
    render(h(App));
    const offered = () => typeof handle!.instance!.getOptions().onEventOpen === 'function';
    const before = offered();
    act(() => setOpen(true));
    const during = offered();
    act(() => setOpen(false));
    expect([before, during, offered()]).toEqual([false, true, false]);
  });
});

let handle: DzCalendarHandle | null = null;

describe('after the 18c review', () => {
  it('view given: the parent follows a person’s change, then sets it back — the calendar goes back', () => {
    let setView!: (v: string) => void;
    let ctl!: CalendarController;
    function App() {
      const [view, sv] = useState('timeGridWeek');
      setView = sv;
      ctl = useCalendarController();
      return h(DzCalendar, { ...base, controller: ctl, view, onViewChange: sv });
    }
    render(h(App));
    act(() => ctl.changeView('dayGridMonth'));
    act(() => setView('timeGridWeek'));
    expect(ctl.getSnapshot().view).toBe('timeGridWeek');
  });

  it('a refused view is given back to the parent (onViewChange with the real one)', () => {
    const said: string[] = [];
    let setView!: (v: string) => void;
    function App() {
      const [view, sv] = useState('timeGridWeek');
      setView = sv;
      return h(DzCalendar, { ...base, view, onViewChange: (v: string) => (said.push(v), sv(v)), onError: () => {} });
    }
    render(h(App));
    act(() => setView('nope'));
    expect(said).toEqual(['timeGridWeek']);
  });

  it('the events’ content reaches its calendar’s controller; data-* and aria-* go on the element', async () => {
    let seen: CalendarController | null = null;
    let ctl!: CalendarController;
    function Probe() {
      seen = useParentCalendarController();
      return null;
    }
    function App() {
      ctl = useCalendarController();
      return h(DzCalendar, { ...base, controller: ctl, 'data-testid': 'agenda', 'aria-label': 'Agenda', renderEventContent: () => h(Probe) });
    }
    await act(async () => render(h(App)));
    const host = el.querySelector('[data-testid="agenda"]');
    expect([seen === ctl, host?.getAttribute('aria-label'), host?.querySelector('.dz-cal') !== null]).toEqual([true, 'Agenda', true]);
  });

  it('same(): a value that holds itself does not loop; Temporal values by what they print', () => {
    const a: Record<string, unknown> = { x: 1 };
    a['self'] = a;
    const b: Record<string, unknown> = { x: 1 };
    b['self'] = b;
    expect([same(a, b), same(d('2026-10-21'), d('2026-10-21')), same(d('2026-10-21'), d('2026-10-22')), same([1, { y: 2 }], [1, { y: 2 }])]).toEqual([true, true, false, true]);
  });
});

describe('after the 18c code review', () => {
  it('view given and forced back by the parent: the prop wins; a fixed date sends the calendar back after controller.next()', () => {
    let ctl!: CalendarController;
    function App() {
      const [view, setView] = useState('timeGridWeek');
      ctl = useCalendarController();
      return h(DzCalendar, { ...base, controller: ctl, view, date: d('2026-10-21'), onViewChange: (v: string) => setView(v === 'dayGridMonth' ? 'timeGridWeek' : v) });
    }
    render(h(App));
    act(() => ctl.changeView('dayGridMonth'));
    act(() => ctl.next());
    expect([ctl.getSnapshot().view, String(ctl.getSnapshot().date)]).toEqual(['timeGridWeek', '2026-10-21']);
  });

  it('given, then free, then given again with the same value: the calendar goes back to it', () => {
    let setView!: (v: string | undefined) => void;
    let ctl!: CalendarController;
    function App() {
      const [view, sv] = useState<string | undefined>('timeGridWeek');
      setView = sv;
      ctl = useCalendarController();
      return h(DzCalendar, { ...base, controller: ctl, ...(view !== undefined && { view }) });
    }
    render(h(App));
    act(() => setView(undefined));
    act(() => ctl.changeView('dayGridMonth'));
    act(() => setView('timeGridWeek'));
    expect(ctl.getSnapshot().view).toBe('timeGridWeek');
  });

  it('another controller given: the calendar is handed over (the old one let go)', () => {
    const c1 = new CalendarController();
    const c2 = new CalendarController();
    let set!: (c: CalendarController) => void;
    function App() {
      const [c, sc] = useState(c1);
      set = sc;
      return h(DzCalendar, { ...base, controller: c });
    }
    render(h(App));
    act(() => set(c2));
    act(() => c2.next());
    expect([c1.getSnapshot().instance, String(c2.getSnapshot().date)]).toEqual([null, '2026-10-28']);
  });

  it('same(): JS Dates by their milliseconds; other class instances by identity', () => {
    class K {
      constructor(readonly v: number) {}
      toJSON() {
        return this.v;
      }
    }
    expect([same(new Date(1000), new Date(1500)), same(new Date(1000), new Date(1000)), same(new K(1), new K(1))]).toEqual([false, true, false]);
  });
});

describe('after Sehhaty’s test (React)', () => {
  const evs = [
    { id: 'v', title: 'Vacances', start: '2026-10-23', end: '2026-10-25', allDay: true, display: 'background' as const },
    { id: 'p', title: '', start: '2026-10-21T12:00[Europe/Paris]', duration: { hours: 1 }, display: 'background' as const },
  ];
  it('renderDayHeader: the application’s mark in a day’s head; renderEventContent labels a background, null leaves it mute', async () => {
    function App() {
      return h(DzCalendar, {
        ...base,
        events: evs,
        renderDayHeader: (day) => (String(day.date) === '2026-10-23' ? h('button', { className: 'mark' }, `Fermé · ${day.text}`) : day.text),
        renderEventContent: (e, ctx) => (ctx.background ? (e.title ? h('b', null, e.title) : null) : e.title),
      });
    }
    await act(async () => render(h(App)));
    const labels = [...el.querySelectorAll('.dz-tg__col .dz-ev--bg')].map((b) => b.textContent ?? '').sort();
    expect([el.querySelector('.dz-tg__dayhead .mark')?.textContent, labels]).toEqual(['Fermé · ven. 23', ['', 'Vacances', 'Vacances']]);
  });
});
