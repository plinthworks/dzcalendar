import { describe, it, expect, afterEach } from 'vitest';
import { Temporal, UNASSIGNED } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance } from '@dzcalendar/dom';
import '../../src/index.js';

// The timeline in jsdom: what it draws and says, the tree, the keyboard. (No layout here: everything is mounted.)
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const resources: ResourceInput[] = [
  { id: 'card', title: 'Cardiologie', service: 'Médecine' },
  { id: 'a', title: 'Dre A', parentId: 'card', room: 'B12' },
  { id: 'b', title: 'Dr B', parentId: 'card', room: 'B13' },
  { id: 'irm', title: 'IRM', service: 'Plateau', room: 'S1' },
];
const mount = (events: EventInput[], over: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    now,
    events,
    resources,
    initialView: 'resourceTimelineDay',
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
const rowIds = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.dz-tl__row')].map((r) => r.dataset['resource'] ?? `[${r.textContent}]`);
const ev = (id: string) => cal!.kernel.store.snapshot.getEvent(id)!;

describe('the timeline draws', () => {
  it('a treegrid: rows in tree order, levels and expansion said, the area’s columns', () => {
    const host = mount([], { viewOptions: { timeline: { areaColumns: [{ field: 'title', header: 'Ressource' }, { field: 'room', header: 'Salle' }] } } });
    const sheet = host.querySelector('.dz-tl__sheet')!;
    expect([sheet.getAttribute('role'), sheet.getAttribute('aria-rowcount')]).toEqual(['treegrid', '5']);
    expect(rowIds(host)).toEqual(['card', 'a', 'b', 'irm']);
    const card = host.querySelector<HTMLElement>('.dz-tl__row[data-resource="card"]')!;
    const a = host.querySelector<HTMLElement>('.dz-tl__row[data-resource="a"]')!;
    expect([card.getAttribute('aria-level'), card.getAttribute('aria-expanded'), a.getAttribute('aria-level'), a.hasAttribute('aria-expanded')]).toEqual(['1', 'true', '2', false]);
    expect([...a.querySelectorAll('.dz-tl__cell')].map((c) => [c.getAttribute('role'), c.textContent])).toEqual([
      ['rowheader', 'Dre A'],
      ['gridcell', 'B12'],
    ]);
    expect([...host.querySelectorAll('.dz-tl__colhead')].map((c) => c.textContent)).toEqual(['Ressource', 'Salle']);
  });

  it('events at their place on the axis, on each of their resources’ rows; past three lanes, "+N"', () => {
    const host = mount([
      { id: 'm', title: 'RDV', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 }, resourceIds: ['a', 'b'] },
      ...['09:00', '09:10', '09:20', '09:30'].map((t, i) => ({ id: `i${i}`, title: `IRM ${i}`, start: `2026-10-21T${t}[Europe/Paris]`, duration: { minutes: 40 }, resourceId: 'irm' })),
    ]);
    const bars = [...host.querySelectorAll<HTMLElement>('.dz-tl__ev[data-event-id="m"]')];
    // 09:00 is 18 half hours in; an hour is two of them.
    expect(bars.map((b) => [b.closest<HTMLElement>('.dz-tl__row')!.dataset['resource'], b.style.getPropertyValue('--x'), b.style.getPropertyValue('--w')])).toEqual([
      ['a', '18', '2'],
      ['b', '18', '2'],
    ]);
    expect(bars[0]!.getAttribute('aria-label')).toBe('RDV, 09:00 – 10:00');
    const irm = host.querySelector<HTMLElement>('.dz-tl__row[data-resource="irm"]')!;
    expect(irm.querySelectorAll('.dz-tl__ev').length).toBe(2);
    const more = irm.querySelector<HTMLButtonElement>('.dz-more--tl')!;
    expect(more.textContent).toBe('+2 autres');
    more.click();
    expect([...document.querySelectorAll('.dz-pop .dz-bar')].map((n) => n.getAttribute('aria-label'))).toEqual(['IRM 2, 09:20 – 10:00', 'IRM 3, 09:30 – 10:10']);
  });

  it('25 October in Paris: 50 half hours, the second 02:00 and 02:30 marked, both named with their offsets', () => {
    const host = mount([], { initialDate: Temporal.PlainDate.from('2026-10-25'), initialView: 'timelineDay' });
    const slots = [...host.querySelectorAll<HTMLElement>('.dz-tl__slot')];
    expect(slots.length).toBe(50);
    // Seen (hidden from screen readers when it differs) and said: the mark, then the offset.
    expect(slots.slice(4, 8).map((s) => [s.firstChild!.textContent, s.querySelector('.dz-tl__sr')?.textContent])).toEqual([
      ['02:00', '02:00 (+02:00)'],
      ['02:30', '02:30 (+02:00)'],
      ['02:00*', '02:00 (+01:00)'],
      ['02:30*', '02:30 (+01:00)'],
    ]);
  });

  it('a timeline without resources: one row of every event', () => {
    const host = mount([{ id: 'x', title: 'X', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'a' }, { id: 'y', title: 'Y', start: '2026-10-21T10:00[Europe/Paris]' }], { initialView: 'timelineDay' });
    expect([host.querySelectorAll('.dz-tl__row').length, host.querySelectorAll('.dz-tl__ev').length, host.querySelector('.dz-tl--resources')]).toEqual([1, 2, null]);
  });

  it('"Unassigned" (showUnassigned): the events of no known resource, in a row of their own', () => {
    const host = mount([{ id: 'n', title: 'N', start: '2026-10-21T09:00[Europe/Paris]' }, { id: 'z', title: 'Z', start: '2026-10-21T10:00[Europe/Paris]', resourceId: 'nobody' }], { showUnassigned: true });
    const un = host.querySelector<HTMLElement>('.dz-tl__row--unassigned')!;
    expect([un.dataset['resource'] === UNASSIGNED, un.querySelector('.dz-tl__title')!.textContent, [...un.querySelectorAll<HTMLElement>('.dz-tl__ev')].map((e) => e.dataset['eventId'])]).toEqual([true, 'Non assigné', ['n', 'z']]);
  });

  it('a month counted in days: each day a slot, the weekend shaded as closed', () => {
    const host = mount([], { initialView: 'resourceTimelineMonth', businessHours: { daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } });
    expect(host.querySelectorAll('.dz-tl__slot').length).toBe(31);
    // October 2026: the 3rd and 4th are a Saturday and a Sunday — the first closed days, each shaded whole.
    const offs = [...host.querySelectorAll<HTMLElement>('.dz-tl__row[data-resource="a"] .dz-tl__off')].slice(0, 2);
    expect(offs.map((o) => [o.style.getPropertyValue('--x'), o.style.getPropertyValue('--w')])).toEqual([
      ['2', '1'],
      ['3', '1'],
    ]);
  });
});

describe('the tree', () => {
  it('the expander folds a resource (its state in the kernel), and a group head folds its group', () => {
    const host = mount([], { resourceGroupField: 'service' });
    expect(rowIds(host)).toEqual(['[▾Médecine (3)]', 'card', 'a', 'b', '[▾Plateau (1)]', 'irm']);
    host.querySelector<HTMLButtonElement>('.dz-tl__row[data-resource="card"] .dz-tl__expander')!.click();
    expect([rowIds(host), cal!.kernel.getOptions().collapsedResources]).toEqual([['[▾Médecine (3)]', 'card', '[▾Plateau (1)]', 'irm'], ['card']]);
    host.querySelector<HTMLButtonElement>('.dz-tl__row--group .dz-tl__expander')!.click();
    expect(rowIds(host)).toEqual(['[▸Médecine (3)]', '[▾Plateau (1)]', 'irm']);
  });

  it('from the keyboard: the row heads are one tab stop; down, left folds, right unfolds then goes into the time', async () => {
    const host = mount([]);
    const heads = () => [...host.querySelectorAll<HTMLElement>('.dz-tl__cell[role="rowheader"]')];
    expect(heads().filter((c) => c.tabIndex === 0).length).toBe(1);
    heads()[0]!.focus();
    press('ArrowLeft');
    expect(rowIds(host)).toEqual(['card', 'irm']);
    press('ArrowRight');
    expect(rowIds(host)).toEqual(['card', 'a', 'b', 'irm']);
    press('ArrowDown');
    expect(active().closest<HTMLElement>('.dz-tl__row')!.dataset['resource']).toBe('a');
    press('ArrowRight');
    // Into the time of Dre A's row: the cursor, named for where it stands.
    expect([active().classList.contains('dz-cursor'), active().getAttribute('aria-label')?.startsWith('Dre A, mercredi 21 octobre')]).toEqual([true, true]);
  });

  it('a column’s width from the keyboard (its separator), said in aria-valuenow', () => {
    const host = mount([]);
    const grip = host.querySelector<HTMLElement>('.dz-tl__resizer')!;
    grip.focus();
    press('ArrowRight');
    expect([grip.getAttribute('aria-valuenow'), host.querySelector<HTMLElement>('.dz-tl')!.style.getPropertyValue('--dz-tl-area')]).toEqual(['176', '176px']);
  });
});

describe('the keyboard in the time', () => {
  it('the cursor: up and down go from resource to resource, left and right along time', () => {
    const host = mount([]);
    host.querySelector<HTMLElement>('.dz-tl__cursor')!.focus();
    // Now is 10:00 in Paris: the cursor starts there, on the first row.
    expect(active().getAttribute('aria-label')).toBe('Cardiologie, mercredi 21 octobre, 10:00');
    press('ArrowDown');
    expect(active().getAttribute('aria-label')).toBe('Dre A, mercredi 21 octobre, 10:00');
    press('ArrowRight');
    expect(active().getAttribute('aria-label')).toBe('Dre A, mercredi 21 octobre, 10:15');
  });

  it('M, down, Enter: the event goes to the next resource, at the same time; Ctrl+Z puts it back', async () => {
    const host = mount([{ id: 'm', title: 'RDV', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 30 }, resourceId: 'a' }], { editable: true });
    host.querySelector<HTMLElement>('.dz-tl__ev[data-event-id="m"]')!.focus();
    press('m');
    press('ArrowDown');
    expect(await said()).toContain('Dr B, mercredi 21 octobre, 09:00 à 09:30');
    press('ArrowRight');
    press('Enter');
    await said();
    expect([ev('m').resourceIds, String(ev('m').start)]).toEqual([['b'], '2026-10-21T09:15:00+02:00[Europe/Paris]']);
    press('z', { ctrlKey: true });
    expect([ev('m').resourceIds, String(ev('m').start)]).toEqual([['a'], '2026-10-21T09:00:00+02:00[Europe/Paris]']);
  });

  it('out of "Unassigned" onto a resource: assigned to it', async () => {
    const host = mount([{ id: 'n', title: 'N', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 30 } }], { editable: true, showUnassigned: true });
    host.querySelector<HTMLElement>('.dz-tl__ev[data-event-id="n"]')!.focus();
    press('m');
    press('ArrowDown');
    press('Enter');
    await said();
    expect(ev('n').resourceIds).toEqual(['card']);
  });

  it("the context menu's new event, from the cursor, carries its row's resource", () => {
    const got: unknown[] = [];
    const host = mount([], { onCreateRequest: (r: { resourceId?: string }) => got.push(r.resourceId) });
    host.querySelector<HTMLElement>('.dz-tl__cursor')!.focus();
    press('ArrowDown');
    press('F10', { shiftKey: true });
    host.querySelector<HTMLButtonElement>('.dz-menu [data-action="event.create"]')!.click();
    expect(got).toEqual(['a']);
  });

  it('counted in days (a month): left and right go a day at a time', () => {
    const host = mount([], { initialView: 'resourceTimelineMonth' });
    host.querySelector<HTMLElement>('.dz-tl__cursor')!.focus();
    expect(active().getAttribute('aria-label')).toBe('Cardiologie, mercredi 21 octobre');
    press('ArrowRight');
    expect(active().getAttribute('aria-label')).toBe('Cardiologie, jeudi 22 octobre');
  });
});

describe('after the reviews', () => {
  it('"Unassigned" never reaches the application: a date click or a selection on its row carries no resource', () => {
    const clicks: { resourceId?: string }[] = [];
    const sels: { resourceId?: string }[] = [];
    const host = mount([], { showUnassigned: true, selectable: true, onDateClick: (c: { resourceId?: string }) => clicks.push(c), onSelect: (x: { resourceId?: string }) => sels.push(x) });
    host.querySelector<HTMLElement>('.dz-tl__cursor')!.focus();
    // Home is the first row: "Unassigned".
    expect(active().getAttribute('aria-label')).toBe('Non assigné, mercredi 21 octobre, 10:00');
    press(' ');
    expect([clicks.length, 'resourceId' in clicks[0]!, sels.length, 'resourceId' in sels[0]!]).toEqual([1, false, 1, false]);
  });

  it('an all-day event held in a timeline counted in hours stays all-day: each arrow moves it a day', async () => {
    const host = mount([{ id: 'L', title: 'Congé', start: '2026-10-21', allDay: true, resourceId: 'a' }], { editable: true, initialView: 'resourceTimelineWeek' });
    host.querySelector<HTMLElement>('.dz-tl__ev[data-event-id="L"]')!.focus();
    press('m');
    press('ArrowRight');
    press('ArrowRight');
    press('Enter');
    await said();
    expect([ev('L').allDay, String(ev('L').start), String(ev('L').end)]).toEqual([true, '2026-10-23', '2026-10-24']);
  });

  it('grouped, a resource is a level below its group; cells and heads carry their column index', () => {
    const host = mount([], { resourceGroupField: 'service' });
    const row = (id: string) => host.querySelector<HTMLElement>(`.dz-tl__row[data-resource="${id}"]`)!;
    expect([host.querySelector('.dz-tl__row--group')!.getAttribute('aria-level'), row('card').getAttribute('aria-level'), row('a').getAttribute('aria-level')]).toEqual(['1', '2', '3']);
    expect([host.querySelector('.dz-tl__sheet')!.getAttribute('aria-colcount'), row('a').querySelector('.dz-tl__lane')!.getAttribute('aria-colindex'), host.querySelector('.dz-tl__colhead')!.textContent]).toEqual(['2', '2', 'Ressource']);
  });

  it('folding reports the tree to onResourceToggle; a fold taking the cursor’s row keeps a focused cursor', () => {
    const got: unknown[] = [];
    const host = mount([], { onResourceToggle: (x: unknown) => got.push(x) });
    host.querySelector<HTMLElement>('.dz-tl__cursor')!.focus();
    press('ArrowDown');
    expect(active().getAttribute('aria-label')).toContain('Dre A, ');
    host.querySelector<HTMLButtonElement>('.dz-tl__row[data-resource="card"] .dz-tl__expander')!.click();
    expect(got).toEqual([{ collapsedResources: ['card'], collapsedGroups: [] }]);
    expect(host.querySelectorAll('.dz-tl__cursor').length).toBe(1);
  });

  it('another scale: the cursor starts again (no place of the old scale kept)', () => {
    const host = mount([]);
    host.querySelector<HTMLElement>('.dz-tl__cursor')!.focus();
    press('ArrowRight');
    expect(active().getAttribute('aria-label')).toContain('10:15');
    cal!.update({ view: 'resourceTimelineWeek' });
    expect([active().classList.contains('dz-tl__cursor'), active().closest('.dz-tl__lane') !== null]).toEqual([true, true]);
  });

  it('a dragged width belongs to its field: other columns do not inherit it', () => {
    const host = mount([]);
    const grip = host.querySelector<HTMLElement>('.dz-tl__resizer')!;
    grip.focus();
    press('ArrowRight');
    cal!.update({ viewOptions: { timeline: { areaColumns: [{ field: 'room', header: 'Salle' }] } } });
    expect(host.querySelector<HTMLElement>('.dz-tl')!.style.getPropertyValue('--dz-tl-area')).toBe('160px');
  });

  it('a day the zone skipped is said; a slot that does not divide a day is refused by update()', () => {
    const host = mount([], { timeZone: 'Pacific/Apia', initialDate: Temporal.PlainDate.from('2011-12-30') });
    expect(host.querySelector('.dz-tl .dz-empty, .dz-empty')?.textContent).toBe("Ce jour n'existe pas dans ce fuseau");
    expect(() => cal!.update({ timeline: { slot: 7 } })).toThrow(RangeError);
  });
});
