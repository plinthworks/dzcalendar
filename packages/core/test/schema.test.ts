import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { Temporal, createKernel } from '../src/index.js';
import { findSlots } from '@dzcalendar/slots';
// @ts-expect-error a script, not a typed module
import { generate } from '../../../scripts/gen-schema.mjs';

const shipped = JSON.parse(readFileSync(new URL('../../../site/commands.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
const command = ajv.compile(shipped);
const event = ajv.compile({ $ref: `${shipped.$id}#/$defs/EventInput` });
const slots = ajv.compile({ $ref: `${shipped.$id}#/$defs/SlotQuery` });
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');

// Written by hand, as an assistant would from the schema's descriptions.
const GOOD = [
  { type: 'event.create', event: { id: 'c1', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: 'PT45M', extendedProps: { patient: 'p-12' } } },
  { type: 'event.create', event: { id: 'w', title: 'Garde', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4' } },
  { type: 'event.update', id: 'c1', patch: { title: 'Contrôle', tone: 'amber' } },
  { type: 'event.move', id: 'c1', start: '2026-10-22T10:00[Europe/Paris]' },
  { type: 'event.resize', id: 'c1', edge: 'end', to: '2026-10-22T11:00[Europe/Paris]' },
  { type: 'event.move', id: 'w', key: '2026-10-21T08:00:00+02:00[Europe/Paris]', scope: 'this', start: '2026-10-21T10:00[Europe/Paris]' },
  { type: 'batch', label: 'Two at once', commands: [{ type: 'event.create', event: { id: 'd', title: 'Day off', start: '2026-10-23', allDay: true } }, { type: 'event.delete', id: 'd' }] },
  // Cut at the 28th (19, 21, 26 stay in w), then "this and following" from the 26th.
  { type: 'series.split', id: 'w', at: '2026-10-28T08:00:00+01:00[Europe/Paris]', patch: { title: 'Rounds, from the 28th' } },
  { type: 'event.update', id: 'w', key: '2026-10-26T08:00:00+01:00[Europe/Paris]', scope: 'following', patch: { title: 'Rounds (new room)' } },
  { type: 'event.create', event: { id: 'r', title: 'Clinic', start: '2026-11-02T14:00[Europe/Paris]', duration: 'PT1H', rrule: ['FREQ=WEEKLY;BYDAY=MO'], exdate: ['2026-11-09T14:00[Europe/Paris]'], resourceIds: ['dr-a', 'dr-b'] } },
  { type: 'series.rule', id: 'r', rrule: 'FREQ=WEEKLY;BYDAY=MO,TH' },
  { type: 'series.rule', id: 'r', rrule: null },
  { type: 'event.create', event: { id: 's', title: 'Standup', start: '2026-10-21T09:30[Europe/Paris]', duration: { minutes: 15 } } },
  { type: 'event.repeat', id: 's', rrule: 'FREQ=DAILY;COUNT=5' },
  { type: 'event.resize', id: 'c1', edge: 'start', to: '2026-10-22T09:30[Europe/Paris]' },
  { type: 'event.move', id: 'r', start: '2026-11-02T15:00[Europe/Paris]', resourceIds: ['dr-b'] },
  { type: 'batch', commands: [] },
  { type: 'batch', label: 'Nested', commands: [{ type: 'batch', commands: [{ type: 'event.delete', id: 'r' }] }] },
  // null takes a field away; a key written without its offset names the occurrence too.
  { type: 'event.update', id: 'c1', patch: { tone: null, url: null, end: null } },
  { type: 'event.update', id: 'w', key: '2026-10-19T08:00[Europe/Paris]', scope: 'this', patch: { title: 'Rounds, first' } },
  { type: 'series.delete', id: 'w' },
];

describe('commands.schema.json', () => {
  it('is what the types say (npm run gen:schema writes it)', () => {
    expect(JSON.stringify(generate())).toBe(JSON.stringify(shipped));
  });

  it('accepts the commands an assistant would write, and each of them runs', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now });
    const results = GOOD.map((c) => [command(c) ? 'valid' : JSON.stringify(command.errors?.slice(0, 2)), k.run(c as never).ok]);
    expect(results).toEqual(GOOD.map(() => ['valid', true]));
  });

  it('refuses what is not a command: an unknown type, a missing id, a JS-style date object, an extra field', () => {
    const bad = [
      { type: 'event.teleport', id: 'a' },
      { type: 'event.move', start: '2026-10-22T10:00[Europe/Paris]' },
      { type: 'event.create', event: { title: 'x', start: { year: 2026, month: 10, day: 21 } } },
      { type: 'event.delete', id: 'a', force: true },
      { type: 'event.resize', id: 'a', edge: 'middle', to: '2026-10-22T11:00[Europe/Paris]' },
      // A rule or excluded dates are not a patch's (series.rule, event.repeat say them).
      { type: 'event.update', id: 'a', patch: { rrule: 'FREQ=DAILY' } },
      { type: 'event.update', id: 'a', patch: { exdate: ['2026-10-22'] } },
      // A whole series has no scope.
      { type: 'series.delete', id: 'w', scope: 'this' },
      { type: 'event.update', id: 'a', scope: 'sometimes', patch: {} },
      // An event without a start is always refused (missing-start).
      { type: 'event.create', event: { title: 'No start' } },
      { type: 'event.repeat', id: 's', rrule: null },
      { type: 'event.delete', id: 'w', key: '2026-10-21T08:00[Europe/Paris]', scope: 'thisAndFollowing' },
      { type: 'event.create', event: { title: 'x', start: '2026-10-21', duration: { hours: 1.5 } } },
    ];
    expect(bad.map((c) => command(c))).toEqual(bad.map(() => false));
  });

  it('an event and a slot query: valid ones pass, and the slot query finds its slots', () => {
    const q = { availability: { timeZone: 'Asia/Riyadh', weekly: [{ days: [7, 1, 2, 3, 4], from: '08:00', to: '12:00' }] }, from: '2026-10-25T00:00[Asia/Riyadh]', to: '2026-10-26T00:00[Asia/Riyadh]', duration: 30 };
    // Sunday 25 October 2026 in Riyadh (+03:00, no DST): 08:00 to 12:00 in 30 minutes, eight slots.
    expect([event({ title: 'x', start: '2026-10-21' }), event({ start: 42 }), slots(q), slots({ ...q, duration: '30' }), findSlots(q as never).slots.length]).toEqual([true, false, true, false, 8]);
  });
});
