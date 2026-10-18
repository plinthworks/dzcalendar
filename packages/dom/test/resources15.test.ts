import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';

// Resource views in jsdom: one column (or cell) per resource and date, whose words say whose it is,
// and the keyboard going from one resource to the next. (Layout is jsdom's: zero sizes.)

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const doctors: ResourceInput[] = [
  { id: 'a', title: 'Dre A', service: 'Cardio' },
  { id: 'b', title: 'Dr B', service: 'Cardio' },
  { id: 'c', title: 'Dr C', service: 'Dermato' },
];
const mount = (events: EventInput[], over: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    now,
    events,
    resources: doctors,
    initialView: 'resourceTimeGridDay',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    ...over,
  });
  return host;
};
const press = (k: string, mods: KeyboardEventInit = {}) =>
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
const active = () => document.activeElement as HTMLElement;
const said = async () => {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  return document.querySelector('.dz-live')!.textContent ?? '';
};
const texts = (els: Iterable<Element>) => [...els].map((e) => e.textContent);

describe('resource time grid', () => {
  it('a day: one column per resource, named for it; the heads are the resources (no date row)', () => {
    const host = mount([{ id: 'm', title: 'RDV', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'b' }]);
    const cols = [...host.querySelectorAll<HTMLElement>('.dz-tg__col')];
    expect(cols.map((c) => c.dataset['resource'])).toEqual(['a', 'b', 'c']);
    expect(cols[1]!.getAttribute('aria-label')).toBe('Dr B, mercredi 21 octobre');
    expect(texts(host.querySelectorAll('.dz-tg__resource'))).toEqual(['Dre A', 'Dr B', 'Dr C']);
    expect(host.querySelectorAll('.dz-tg__dayhead')).toHaveLength(0);
    // The event in its resource's column only.
    expect(cols.map((c) => c.querySelectorAll('.dz-ev').length)).toEqual([0, 1, 0]);
  });

  it('a week, grouped: groups over resources over dates, each placed on its columns', () => {
    const host = mount([], { initialView: 'resourceTimeGridWeek', resourceGroupField: 'service' });
    expect(host.querySelectorAll('.dz-tg__col')).toHaveLength(21);
    const groups = [...host.querySelectorAll<HTMLElement>('.dz-tg__group')];
    expect(groups.map((g) => [g.textContent, g.style.gridRow, g.style.gridColumn])).toEqual([
      ['Cardio', '1', '2 / span 14'],
      ['Dermato', '1', '16 / span 7'],
    ]);
    const heads = [...host.querySelectorAll<HTMLElement>('.dz-tg__resource')];
    expect(heads.map((h) => [h.style.gridRow, h.style.gridColumn])).toEqual([
      ['2', '2 / span 7'],
      ['2', '9 / span 7'],
      ['2', '16 / span 7'],
    ]);
    const days = [...host.querySelectorAll<HTMLElement>('.dz-tg__dayhead')];
    expect([days.length, days[7]!.style.gridRow, days[7]!.style.gridColumn]).toEqual([21, '3', '9']);
    // Where a resource's days start, a stronger line.
    const starts = [...host.querySelectorAll<HTMLElement>('.dz-tg__col')].flatMap((c, i) => (c.classList.contains('dz-tg__col--resource-start') ? [i] : []));
    expect(starts).toEqual([7, 14]);
  });

  it("an all-day event sits over its resource's columns; the now line is in every resource's column of today", () => {
    const host = mount([{ id: 'leave', title: 'Congé', start: '2026-10-20', end: '2026-10-22', allDay: true, resourceId: 'c' }], { initialView: 'resourceTimeGridWeek' });
    const bar = host.querySelector<HTMLElement>('.dz-bar[data-event-id="leave"]')!;
    // c's Tuesday: 2 × 7 + 1.
    expect([bar.style.getPropertyValue('--col'), bar.style.getPropertyValue('--span')]).toEqual(['15', '2']);
    const lines = [...host.querySelectorAll('.dz-now')].map((n) => (n.closest('.dz-tg__col') as HTMLElement).dataset['key']);
    expect(lines).toEqual(['2026-10-21|a', '2026-10-21|b', '2026-10-21|c']);
  });

  it('the cursor says whose column it is in; Alt+left and Alt+right go from one resource to the next', () => {
    const clicks: unknown[] = [];
    const host = mount([], { onDateClick: (c: unknown) => clicks.push(c) });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowDown');
    expect(active().getAttribute('aria-label')).toBe('Dre A, mercredi 21 octobre, 00:15');
    press('ArrowRight', { altKey: true });
    expect(active().getAttribute('aria-label')).toBe('Dr B, mercredi 21 octobre, 00:15');
    press('ArrowRight', { altKey: true });
    press('ArrowRight', { altKey: true });
    // Past the last resource: nowhere to go, said.
    expect(active().getAttribute('aria-label')).toBe('Dr C, mercredi 21 octobre, 00:15');
    press(' ');
    const c = clicks[0] as { allDay: boolean; date: unknown; instant: unknown; resourceId: string };
    // 00:15 in Paris (+02:00) is 22:15 UTC the day before.
    expect([clicks.length, c.allDay, String(c.date), String(c.instant), c.resourceId]).toEqual([1, false, '2026-10-21', '2026-10-20T22:15:00Z', 'c']);
  });

  it('M, then Alt+right: the event goes to the next resource, said with its name; Enter puts it there', async () => {
    const host = mount([{ id: 'm', title: 'RDV', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 30 }, resourceIds: ['a', 'c'] }], { editable: true });
    host.querySelector<HTMLElement>('.dz-tg__col[data-resource="a"] .dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowRight', { altKey: true });
    expect(await said()).toContain('Dr B, Dr C, mercredi 21 octobre');
    press('Enter');
    // Taken in a's column, put in b's: a swapped for b, c kept.
    expect(cal!.kernel.store.snapshot.getEvent('m')!.resourceIds).toEqual(['b', 'c']);
    expect(String(cal!.kernel.store.snapshot.getEvent('m')!.start)).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
    // The focus follows it into b's column (after the drop's frame).
    await said();
    expect(active().closest<HTMLElement>('.dz-tg__col')?.dataset['resource']).toBe('b');
  });

  it("a resource's own rule refuses a keyboard move onto it", async () => {
    const host = mount([{ id: 'm', title: 'RDV', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 30 }, resourceId: 'a' }, { id: 'x', title: 'X', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'b' }], {
      editable: true,
      resources: [{ id: 'a', title: 'Dre A' }, { id: 'b', title: 'Dr B', eventOverlap: false }],
    });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowRight', { altKey: true });
    expect(await said()).toContain('chevauche un autre événement');
    press('Enter');
    expect(cal!.kernel.store.snapshot.getEvent('m')!.resourceIds).toEqual(['a']);
  });

  it('Ctrl+Z puts a moved event back on its resource; resourceEditable: false refuses the move', async () => {
    const host = mount([{ id: 'm', title: 'RDV', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'a' }, { id: 'f', title: 'Fixe', start: '2026-10-21T11:00[Europe/Paris]', resourceId: 'a', resourceEditable: false }], { editable: true });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowRight', { altKey: true });
    press('Enter');
    await said();
    expect(cal!.kernel.store.snapshot.getEvent('m')!.resourceIds).toEqual(['b']);
    press('z', { ctrlKey: true });
    expect(cal!.kernel.store.snapshot.getEvent('m')!.resourceIds).toEqual(['a']);
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="f"]')!.focus();
    press('m');
    press('ArrowRight', { altKey: true });
    expect(await said()).toContain('Impossible ici : non modifiable');
    press('Enter');
    expect(cal!.kernel.store.snapshot.getEvent('f')!.resourceIds).toEqual(['a']);
  });

  it('resources that cannot be read are handed to onResourceProblems, at creation and on update', () => {
    const got: string[][] = [];
    mount([], { resources: [{ id: 'a' }, { title: 'no id' }], onResourceProblems: (ps: readonly { code: string; path: string }[]) => got.push(ps.map((p) => `${p.code}@${p.path}`)) });
    cal!.update({ resources: [{ id: 'a' }, { id: 'a' }] });
    cal!.update({ resources: [{ id: 'ok' }] });
    expect(got).toEqual([['invalid-resource@resources[1].id'], ['duplicate-id@resources[1].id']]);
  });

  it('outside a resource view, an event with a resource moves by keyboard as any other (review: regression)', async () => {
    const host = mount([{ id: 'm', title: 'RDV', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 30 }, resourceId: 'a' }], { editable: true, initialView: 'timeGridDay' });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowDown');
    expect(await said()).toBe('mercredi 21 octobre, 09:15 à 09:45');
    press('Enter');
    await said();
    expect([String(cal!.kernel.store.snapshot.getEvent('m')!.start), cal!.kernel.store.snapshot.getEvent('m')!.resourceIds]).toEqual(['2026-10-21T09:15:00+02:00[Europe/Paris]', ['a']]);
  });

  it("an all-day event on two resources, taken from the second one's bar, swaps that one (review)", async () => {
    const host = mount([{ id: 'L', title: 'Congé', start: '2026-10-21', end: '2026-10-22', allDay: true, resourceIds: ['a', 'b'] }], { editable: true });
    const bars = [...host.querySelectorAll<HTMLElement>('.dz-bar[data-event-id="L"]')];
    expect(bars.map((b) => b.dataset['resource'])).toEqual(['a', 'b']);
    bars[1]!.focus();
    press('m');
    press('ArrowRight', { altKey: true });
    expect(await said()).toContain('Dre A, Dr C, mercredi 21 octobre');
    press('Enter');
    await said();
    expect(cal!.kernel.store.snapshot.getEvent('L')!.resourceIds).toEqual(['a', 'c']);
  });

  it('resources changing under a held event let it go; under the cursor, the cursor starts again (review)', async () => {
    const host = mount([{ id: 'm', title: 'RDV', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'a' }], { editable: true });
    host.querySelector<HTMLElement>('.dz-ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowRight', { altKey: true });
    press('ArrowRight', { altKey: true });
    cal!.update({ resources: doctors.slice(0, 2) });
    expect(await said()).toBe('Déplacement annulé');
    press('Enter');
    expect(cal!.kernel.store.snapshot.getEvent('m')!.resourceIds).toEqual(['a']);
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowDown');
    press('ArrowRight', { altKey: true });
    expect(active().getAttribute('aria-label')).toContain('Dr B, ');
    cal!.update({ resources: doctors.slice(0, 1) });
    // Dr B's column is gone: the cursor is placed again, in a column that exists.
    expect(active().classList.contains('dz-cursor')).toBe(true);
    expect(active().getAttribute('aria-label')).toContain('Dre A, ');
  });

  it("plain arrows stay in one resource's days, in a week and past its end; Alt+arrows keep the day", () => {
    const host = mount([], { initialView: 'resourceTimeGridWeek' });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowDown');
    press('ArrowRight', { altKey: true });
    expect(active().getAttribute('aria-label')).toBe('Dr B, mercredi 21 octobre, 00:15');
    for (let i = 0; i < 4; i++) press('ArrowRight');
    // Sunday 25th: Dr B's last day of the week (the 25-hour day: 00:15 is still there).
    expect(active().getAttribute('aria-label')).toBe('Dr B, dimanche 25 octobre, 00:15');
    press('ArrowRight');
    // The next week, still Dr B.
    expect([active().getAttribute('aria-label'), cal!.kernel.getState().range.start.toString()]).toEqual(['Dr B, lundi 26 octobre, 00:15', '2026-10-26']);
  });

  it('a resource view without resources says so, and draws its columns once they come', () => {
    const host = mount([], { resources: [] });
    expect([host.querySelector('.dz-empty')?.textContent, host.querySelectorAll('.dz-tg__col').length]).toEqual(['Aucune ressource à afficher', 0]);
    cal!.update({ resources: doctors });
    expect([host.querySelector('.dz-empty'), host.querySelectorAll('.dz-tg__col').length]).toEqual([null, 3]);
    cal!.update({ view: 'resourceDayGridMonth', resources: [] });
    expect(host.querySelector('.dz-empty')?.textContent).toBe('Aucune ressource à afficher');
  });

  it("the context menu's new event carries the resource of the column", () => {
    const created: unknown[] = [];
    const host = mount([], { onCreateRequest: (r: { resourceId?: string }) => created.push(r.resourceId) });
    host.querySelector<HTMLElement>('.dz-cursor')!.focus();
    press('ArrowDown');
    press('ArrowRight', { altKey: true });
    press('F10', { shiftKey: true });
    host.querySelector<HTMLButtonElement>('.dz-menu [data-action="event.create"]')!.click();
    expect(created).toEqual(['b']);
  });

  it('update: a new resources array redraws the columns, the same one changes nothing; a head hook draws its content', () => {
    const host = mount([], { hooks: { resource: { content: ({ resource }: { resource: { id: string } }) => `★ ${resource.id}` } } });
    expect(texts(host.querySelectorAll('.dz-tg__resource'))).toEqual(['★ a', '★ b', '★ c']);
    const first = host.querySelector('.dz-tg__col');
    cal!.update({ resources: doctors });
    expect(host.querySelector('.dz-tg__col')).toBe(first);
    cal!.update({ resources: [{ id: 'z', title: 'Dr Z' }] });
    expect([...host.querySelectorAll<HTMLElement>('.dz-tg__col')].map((c) => c.dataset['resource'])).toEqual(['z']);
    cal!.update({ resourceOrder: '-id', resources: doctors });
    expect([...host.querySelectorAll<HTMLElement>('.dz-tg__col')].map((c) => c.dataset['resource'])).toEqual(['c', 'b', 'a']);
  });

  it('the view switcher names resource views in the locale', () => {
    const host = mount([], { headerViews: ['resourceTimeGridDay', 'resourceTimeGridWeek', 'resourceDayGridMonth'] });
    expect(texts(host.querySelectorAll('.dz-toolbar__views button'))).toEqual(['Jour', 'Semaine', 'Mois']);
  });
});

describe('resource day grid', () => {
  it('a week: every resource’s days in one row, each cell named for its resource; bars in their resource’s cells', () => {
    const host = mount([{ id: 'e', title: 'Congé', start: '2026-10-21', allDay: true, resourceId: 'b' }], { initialView: 'resourceDayGridWeek' });
    const cells = [...host.querySelectorAll<HTMLElement>('.dz-dg__cell')];
    expect(cells.length).toBe(21);
    expect([cells[7]!.dataset['date'], cells[7]!.dataset['resource'], cells[7]!.classList.contains('dz-dg__cell--resource-start')]).toEqual(['2026-10-19', 'b', true]);
    expect(cells[9]!.getAttribute('aria-label')).toBe('Dr B, mercredi 21 octobre 2026, 1 événement');
    expect(host.querySelector<HTMLElement>('.dz-bar[data-segment^="e"]')!.style.getPropertyValue('--col')).toBe('9');
    expect(host.querySelectorAll('.dz-dg__weekday')).toHaveLength(21);
  });

  it('a day: the cursor is one cell per resource; Alt+right goes to the next resource, Enter into its events', () => {
    const host = mount([{ id: 'e', title: 'Congé', start: '2026-10-21', allDay: true, resourceId: 'b' }], { initialView: 'resourceDayGridDay' });
    // The resources are the columns: no weekday row.
    expect(host.querySelectorAll('.dz-dg__weekday')).toHaveLength(0);
    const stops = [...host.querySelectorAll<HTMLElement>('.dz-dg__cell')].filter((c) => c.tabIndex === 0);
    expect(stops.map((c) => c.dataset['resource'])).toEqual(['a']);
    stops[0]!.focus();
    press('ArrowRight', { altKey: true });
    expect(active().dataset['resource']).toBe('b');
    press('Enter');
    expect([active().dataset['eventId'], active().closest<HTMLElement>('.dz-dg__cell')!.dataset['resource']]).toEqual(['e', 'b']);
    press('Escape');
    press('ArrowRight', { altKey: true });
    press('ArrowRight', { altKey: true });
    expect(active().dataset['resource']).toBe('c');
  });

  it('the month: each row holds every resource’s week', () => {
    const host = mount([], { initialView: 'resourceDayGridMonth' });
    const row = host.querySelector('.dz-dg__week')!;
    expect(row.querySelectorAll('.dz-dg__cell')).toHaveLength(21);
    expect(texts(host.querySelectorAll('.dz-dg__resource'))).toEqual(['Dre A', 'Dr B', 'Dr C']);
  });
});
