import { describe, it, expect, afterEach, vi } from 'vitest';
import { createApp, defineComponent, h, inject, nextTick, provide, ref, shallowRef } from 'vue';
import type { App } from 'vue';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, PlainTime, ZonedDateTime } from '@dzcalendar/core';
import { DzCalendar, DzCalendarPlugin, createCalendarController, injectCalendarController } from '../src/index.js';
import type { CalendarController } from '../src/index.js';

const P = 'Europe/Paris';
const d = (s: string) => Temporal.PlainDate.from(s);
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const events: EventInput[] = [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' }];
const base = { timeZone: P, locale: 'fr-FR', view: 'timeGridWeek', date: d('2026-10-21'), events, initial: { now } };

let app: App | null = null;
let el: HTMLElement;
afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});
const mount = async (root: ReturnType<typeof defineComponent>, setup?: (a: App) => void) => {
  el = document.body.appendChild(document.createElement('div'));
  app = createApp(root);
  setup?.(app);
  app.mount(el);
  await nextTick();
  await nextTick();
};

describe('<DzCalendar> (Vue)', () => {
  it('draws the events given; the same events again redraw nothing; a changed title is drawn', async () => {
    const list = shallowRef(events);
    await mount(defineComponent({ setup: () => () => h(DzCalendar, { ...base, events: list.value }) }));
    const node = () => el.querySelector('[data-event-id="a"]');
    const first = node();
    expect(first?.textContent).toContain('Consultation');
    list.value = [{ ...events[0]! }];
    await nextTick();
    expect(node()).toBe(first);
    list.value = [{ ...events[0]!, title: 'Contrôle' }];
    await nextTick();
    expect(node()?.textContent).toContain('Contrôle');
  });

  it('v-model:view and v-model:date follow the calendar; the controller drives it and is read as refs', async () => {
    const view = ref('timeGridWeek');
    const date = ref<PlainDate>(d('2026-10-21'));
    const cal = createCalendarController();
    await mount(
      defineComponent({
        setup: () => () =>
          h('div', [
            h('p', { id: 'state' }, `${cal.view.value} ${String(cal.date.value)} ${cal.canUndo.value}`),
            h(DzCalendar, { ...base, controller: cal, view: view.value, date: date.value, 'onUpdate:view': (v: string) => (view.value = v), 'onUpdate:date': (x: PlainDate) => (date.value = x) }),
          ]),
      }),
    );
    expect(el.querySelector('#state')!.textContent).toBe('timeGridWeek 2026-10-21 false');
    cal.next();
    cal.changeView('dayGridMonth');
    await nextTick();
    // A week later: Wednesday 28 October.
    expect([el.querySelector('#state')!.textContent, view.value, String(date.value)]).toEqual(['dayGridMonth 2026-10-28 false', 'dayGridMonth', '2026-10-28']);
    cal.dispatch({ type: 'event.update', id: 'a', patch: { title: 'Moved' } } as never);
    await nextTick();
    expect(el.querySelector('#state')!.textContent).toBe('dayGridMonth 2026-10-28 true');
    // The binding moved: the calendar follows it.
    date.value = d('2026-12-02');
    await nextTick();
    expect(String(cal.date.value)).toBe('2026-12-02');
  });

  it('a refused view is reported (@error), the rest applied, the binding given the real view back', async () => {
    const errors: unknown[] = [];
    const view = ref('timeGridWeek');
    const weekends = ref(true);
    const cal = createCalendarController();
    await mount(defineComponent({ setup: () => () => h(DzCalendar, { ...base, controller: cal, view: view.value, weekends: weekends.value, onError: (e: unknown) => errors.push(e), 'onUpdate:view': (v: string) => (view.value = v) }) }));
    view.value = 'nope';
    weekends.value = false;
    await nextTick();
    await nextTick();
    expect([cal.view.value, cal.instance.value!.getOptions().weekends, errors.length, view.value]).toEqual(['timeGridWeek', false, 1, 'timeGridWeek']);
  });

  it('#event-content: the application’s components, in its tree (provide/inject reaches them), drawn again with its state', async () => {
    const theme = ref('clair');
    const Badge = defineComponent({ props: { title: String }, setup: (p) => { const t = inject<{ value: string }>('theme')!; return () => h('b', { class: 'badge' }, `${t.value} · ${p.title}`); } });
    await mount(
      defineComponent({
        setup() {
          provide('theme', theme);
          return () => h(DzCalendar, base, { 'event-content': ({ event }: { event: { title: string } }) => [h(Badge, { title: event.title })] });
        },
      }),
    );
    const badge = () => el.querySelector('[data-event-id="a"] .badge')?.textContent;
    expect(badge()).toBe('clair · Consultation');
    theme.value = 'sombre';
    await nextTick();
    expect(badge()).toBe('sombre · Consultation');
  });

  it('inside it, injectCalendarController() is its controller', async () => {
    let seen: CalendarController | null = null;
    const Probe = defineComponent({ setup: () => { seen = injectCalendarController(); return () => h('i'); } });
    const cal = createCalendarController();
    await mount(defineComponent({ setup: () => () => h(DzCalendar, { ...base, controller: cal }, { 'event-content': () => [h(Probe)] }) }));
    expect(seen).toBe(cal);
  });

  it('events that cannot be read are reported (@problems), the others drawn', async () => {
    const reports: string[] = [];
    await mount(defineComponent({ setup: () => () => h(DzCalendar, { ...base, events: [...events, { id: 'x', title: 'X' } as EventInput], onProblems: (r: { problems: readonly { code: string }[] }) => reports.push(...r.problems.map((p) => p.code)) }) }));
    expect([reports, el.querySelectorAll('[data-event-id]').length]).toEqual([['missing-start'], 1]);
  });

  it('defaults from the plugin; the motion made once per calendar; own props win', async () => {
    const made = vi.fn(() => ({}));
    const cal = createCalendarController();
    await mount(defineComponent({ setup: () => () => h(DzCalendar, { view: 'timeGridWeek', date: d('2026-10-21'), locale: 'fr-FR', controller: cal, initial: { now } }) }), (a) => a.use(DzCalendarPlugin, { defaults: { timeZone: 'America/Chicago', locale: 'en-US' }, motion: made }));
    const s = cal.instance.value!.kernel.getState();
    expect([s.timeZone, s.locale, made.mock.calls.length]).toEqual(['America/Chicago', 'fr-FR', 1]);
  });

  it('"Open" is offered only while @event-open is listened to', async () => {
    const open = ref(false);
    const cal = createCalendarController();
    await mount(defineComponent({ setup: () => () => h(DzCalendar, { ...base, controller: cal, ...(open.value && { onEventOpen: () => {} }) }) }));
    const offered = () => typeof cal.instance.value!.getOptions().onEventOpen === 'function';
    const before = offered();
    open.value = true;
    await nextTick();
    await nextTick();
    const during = offered();
    open.value = false;
    await nextTick();
    await nextTick();
    expect([before, during, offered()]).toEqual([false, true, false]);
  });

  it('unmounted: the calendar is destroyed, the controller let go', async () => {
    const cal = createCalendarController();
    await mount(defineComponent({ setup: () => () => h(DzCalendar, { ...base, controller: cal }) }));
    const exposed = cal.instance.value;
    app!.unmount();
    app = null;
    expect([exposed !== null, cal.instance.value, el.querySelector('.dz-cal')]).toEqual([true, null, null]);
  });
});

describe('after the 18c review (Vue)', () => {
  it('a refused value without @error goes to the application’s error handler', async () => {
    const handled: unknown[] = [];
    const view = ref('timeGridWeek');
    await mount(defineComponent({ setup: () => () => h(DzCalendar, { ...base, view: view.value }) }), (a) => void (a.config.errorHandler = (e) => void handled.push(e)));
    view.value = 'nope';
    await nextTick();
    expect(handled.length).toBe(1);
  });

  it('#event-content added later (v-if): the events are drawn with it', async () => {
    const show = ref(false);
    await mount(defineComponent({ setup: () => () => h(DzCalendar, base, show.value ? { 'event-content': ({ event }: { event: { title: string } }) => [h('i', { class: 'late' }, event.title)] } : {}) }));
    show.value = true;
    await nextTick();
    await nextTick();
    await nextTick();
    expect(el.querySelector('[data-event-id="a"] .late')?.textContent).toBe('Consultation');
  });
});

describe('after the 18c code review (Vue)', () => {
  it('a view bound and not updated: the binding wins (the calendar goes back to it)', async () => {
    const cal = createCalendarController();
    await mount(defineComponent({ setup: () => () => h(DzCalendar, { ...base, controller: cal }) }));
    cal.changeView('dayGridMonth');
    await nextTick();
    await nextTick();
    expect(cal.view.value).toBe('timeGridWeek');
  });
});


describe('after Sehhaty’s test (Vue)', () => {
  it('#day-header: the application’s mark; #event-content labels a background, an empty v-if leaves it mute', async () => {
    const evs = [
      { id: 'v', title: 'Vacances', start: '2026-10-23', end: '2026-10-25', allDay: true, display: 'background' as const },
      { id: 'p', title: '', start: '2026-10-21T12:00[Europe/Paris]', duration: { hours: 1 }, display: 'background' as const },
    ];
    await mount(
      defineComponent({
        setup: () => () =>
          h(DzCalendar, { ...base, events: evs }, {
            'day-header': ({ day }: { day: { date: unknown; text: string } }) => (String(day.date) === '2026-10-23' ? [h('button', { class: 'mark' }, `Fermé · ${day.text}`)] : [day.text as never]),
            'event-content': ({ event, ctx }: { event: { title: string }; ctx: { background?: boolean } }) => (ctx.background ? (event.title ? [h('b', event.title)] : []) : [event.title as never]),
          }),
      }),
    );
    await nextTick();
    const labels = [...el.querySelectorAll('.dz-tg__col .dz-ev--bg')].map((b) => b.textContent ?? '').sort();
    expect([el.querySelector('.dz-tg__dayhead .mark')?.textContent, labels]).toEqual(['Fermé · ven. 23', ['', 'Vacances', 'Vacances']]);
  });
});

describe('slots for every element (18f-2, Vue)', () => {
  it('#slot-label, #all-day-label, #now-indicator: the application’s nodes in their place, its provides reach them', async () => {
    const Label = defineComponent({ props: { text: String }, setup: (p) => () => h('b', `${p.text} ${inject('who', '')}`) });
    await mount(
      defineComponent({
        setup: () => {
          provide('who', 'ctx');
          return () =>
            h(DzCalendar, { ...base }, {
              'slot-label': ({ ctx }: { ctx: { time: PlainTime; text: string } }) => (ctx.time.hour === 9 && ctx.time.minute === 0 ? [h(Label, { text: ctx.text })] : [ctx.text as never]),
              'all-day-label': () => [h('i', 'Journée entière')],
              'now-indicator': ({ ctx }: { ctx: { now: ZonedDateTime } }) => [h('span', { class: 'now' }, ctx.now.toPlainTime().toString().slice(0, 5))],
            });
        },
      }),
    );
    await nextTick();
    expect([el.querySelector('.dz-tick b')?.textContent, el.querySelector('.dz-tg__allday-label i')?.textContent, el.querySelector('.dz-now .now')?.textContent]).toEqual(['09:00 ctx', 'Journée entière', '10:00']);
  });

  it('#day-cell in a month, :hooks merged give the classes; #header-item-filter in its named place', async () => {
    await mount(
      defineComponent({
        setup: () => () =>
          h(
            DzCalendar,
            { ...base, view: 'dayGridMonth', options: { headerToolbar: { start: 'title', end: 'filter' } }, hooks: { dayCell: { class: (c: { outside: boolean }) => (c.outside ? 'muted' : null) } } },
            {
              'day-cell': ({ ctx }: { ctx: { date: PlainDate } }) => [h('em', `j${ctx.date.day}`)],
              'header-item-filter': ({ ctx }: { ctx: { name: string } }) => [h('select', { 'aria-label': 'Médecin' }, [h('option', `Tous (${ctx.name})`)])],
            },
          ),
      }),
    );
    await nextTick();
    const cell = el.querySelector('.dz-dg__cell[data-date="2026-10-21"]')!;
    expect([
      cell.querySelector('.dz-dg__num em')?.textContent,
      cell.querySelectorAll('.dz-dg__item').length,
      el.querySelector('.dz-dg__cell[data-date="2026-09-28"]')?.classList.contains('muted'),
      el.querySelector('.dz-toolbar__item select option')?.textContent,
    ]).toEqual(['j21', 1, true, 'Tous (filter)']);
  });
});
