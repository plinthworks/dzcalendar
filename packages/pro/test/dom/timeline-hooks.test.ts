import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { ResourceInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance } from '@dzcalendar/dom';
import '../../src/index.js';

// The timeline's elements given to the application's hooks (docs/behaviors/render-hooks.md).
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const resources: ResourceInput[] = [
  { id: 'a', title: 'Dre A', service: 'Médecine', room: 'B12' },
  { id: 'b', title: 'Dr B', service: 'Médecine', room: 'B13' },
  { id: 'irm', title: 'IRM', service: 'Plateau', room: 'S1' },
];
const mount = (over: Record<string, unknown>) =>
  (cal = createCalendar(document.body.appendChild(document.createElement('div')), {
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    now,
    resources,
    initialView: 'resourceTimelineDay',
    initialDate: Temporal.PlainDate.from('2026-10-21'),
    ...over,
  }));

describe('timeline hooks', () => {
  it('resource: content in the title cell, classes on the cell; resourceLane: classes on the row’s lane', () => {
    const c = mount({ hooks: { resource: { class: 'who', content: (x: { resource: { title: string } }) => `« ${x.resource.title} »` }, resourceLane: { class: (x: { resource: { id: string } }) => `lane-${x.resource.id}` } } });
    const titles = [...c.element.querySelectorAll('.dz-tl__cell.who .dz-tl__title')].map((t) => t.textContent);
    const lanes = [...c.element.querySelectorAll<HTMLElement>('.dz-tl__lane')].map((l) => [...l.classList].find((k) => k.startsWith('lane-')));
    expect([titles, lanes]).toEqual([['« Dre A »', '« Dr B »', '« IRM »'], ['lane-a', 'lane-b', 'lane-irm']]);
  });

  it('resourceGroupHeader and resourceGroupLane: told the field and the value', () => {
    const seen: string[] = [];
    const c = mount({
      resourceGroupField: 'service',
      hooks: { resourceGroupHeader: { content: (x: { field: string; value: string }) => (seen.push(`${x.field}=${x.value}`), x.value.toUpperCase()) }, resourceGroupLane: { class: 'grp-lane' } },
    });
    expect([seen, [...c.element.querySelectorAll('.dz-tl__group-name')].map((n) => n.textContent), c.element.querySelectorAll('.dz-tl__lane.grp-lane').length]).toEqual([
      ['service=Médecine', 'service=Plateau'],
      ['MÉDECINE', 'PLATEAU'],
      2,
    ]);
  });

  it('resourceAreaHeader: each column’s head, by its field', () => {
    const c = mount({ viewOptions: { timeline: { areaColumns: [{ field: 'title', header: 'Qui' }, { field: 'room', header: 'Salle' }] } }, hooks: { resourceAreaHeader: { content: (x: { field: string; text: string }) => `${x.text} (${x.field})` } } });
    expect([...c.element.querySelectorAll('.dz-tl__colhead')].map((h) => h.textContent)).toEqual(['Qui (title)', 'Salle (room)']);
  });

  it('a resource’s hooks let go of its row when the resources change', () => {
    const gone: string[] = [];
    const c = mount({ hooks: { resourceLane: { willUnmount: ({ ctx }: { ctx: { resource: { id: string } } }) => void gone.push(ctx.resource.id) } } });
    c.update({ resources: resources.slice(0, 2) });
    expect(gone).toEqual(['irm']);
  });
});
