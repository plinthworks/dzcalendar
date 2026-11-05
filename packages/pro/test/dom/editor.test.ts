import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, EventInstance } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance } from '@dzcalendar/dom';
import { editorHandlers, editorMessagesFor, openEventEditor } from '../../src/editor-entry.js';
import type { Problem } from '@dzcalendar/core';
import { TIMELINE_CSS } from '../../src/timeline/styles.js';
import { unlayered } from '../../../dom/src/styles.js';

// The editor in jsdom: what it shows, what it saves through the calendar's history.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const mount = (events: EventInput[], over: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, events, initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), editable: true, ...over });
  return host;
};
const dialog = () => document.querySelector<HTMLElement>('.dz-editor')!;
const $ = <T extends HTMLElement>(sel: string) => dialog().querySelector<T>(sel)!;
const byLabel = <T extends HTMLElement>(text: string) => {
  const l = [...dialog().querySelectorAll('label')].find((x) => x.textContent?.trim() === text)!;
  return document.getElementById(l.htmlFor) as T;
};
const instanceOf = (key: string): EventInstance => {
  const all = cal!.kernel.store.snapshot.queryInstances({ start: Temporal.Instant.from('2026-10-01T00:00:00Z'), end: Temporal.Instant.from('2026-12-31T00:00:00Z'), startDate: Temporal.PlainDate.from('2026-10-01'), endDate: Temporal.PlainDate.from('2026-12-31') } as never);
  return all.find((i) => i.key === key)!;
};
const submit = () => $<HTMLButtonElement>('button[type="submit"]').click();
const ev = (id: string) => cal!.kernel.store.snapshot.getEvent(id);

describe('the editor', () => {
  it('a new event: an accessible modal, the title focused; saved with an hour, in the calendar’s zone', async () => {
    mount([]);
    const done = openEventEditor(cal!, { create: { allDay: false, start: Temporal.Instant.from('2026-10-21T07:00:00Z') } });
    expect([dialog().getAttribute('role'), dialog().getAttribute('aria-modal'), document.getElementById(dialog().getAttribute('aria-labelledby')!)!.textContent]).toEqual(['dialog', 'true', 'Nouvel événement']);
    expect(document.activeElement).toBe(byLabel('Titre'));
    byLabel<HTMLInputElement>('Titre').value = 'Consultation';
    submit();
    expect(await done).toBe('saved');
    const made = [...cal!.kernel.store.snapshot.allEvents()];
    expect(made.map((e) => [e.title, String(e.start), String(e.end)])).toEqual([['Consultation', '2026-10-21T09:00:00+02:00[Europe/Paris]', '2026-10-21T10:00:00+02:00[Europe/Paris]']]);
    expect(document.querySelector('.dz-editor')).toBeNull();
  });

  it('an event edited: title and colour; Ctrl+Z (the calendar’s history) undoes it', async () => {
    mount([{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]' }]);
    const done = openEventEditor(cal!, { instance: instanceOf('a') });
    expect(byLabel<HTMLInputElement>('Titre').value).toBe('A');
    byLabel<HTMLInputElement>('Titre').value = 'B';
    byLabel<HTMLSelectElement>('Couleur').value = 'green';
    submit();
    expect(await done).toBe('saved');
    expect([ev('a')!.title, ev('a')!.tone]).toEqual(['B', 'green']);
    cal!.undo();
    expect([ev('a')!.title, ev('a')!.tone]).toEqual(['A', undefined]);
  });

  it('made to repeat: every week on Monday and Wednesday, ten times — a series with the same id, WKST written', async () => {
    mount([{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]' }]);
    const done = openEventEditor(cal!, { instance: instanceOf('a') });
    const freq = byLabel<HTMLSelectElement>('Fréquence');
    freq.value = 'WEEKLY';
    freq.dispatchEvent(new Event('change'));
    const days = [...dialog().querySelectorAll<HTMLInputElement>('.dz-editor__days input')];
    // Monday first (French week): Monday and Wednesday.
    days[0]!.checked = true;
    days[2]!.checked = true;
    dialog().querySelector<HTMLInputElement>('input[value="count"]')!.checked = true;
    submit();
    expect(await done).toBe('saved');
    const s = cal!.kernel.store.snapshot.getSeries('a')!;
    expect([s.set.rules[0]!.freq, s.set.rules[0]!.byDay!.map((d) => d.weekday), s.set.rules[0]!.count, s.set.rules[0]!.wkst, ev('a')]).toEqual(['WEEKLY', [1, 3], 10, 1, undefined]);
  });

  it('an occurrence: how far is asked; its repeat only with "all events"; "this event" makes an override', async () => {
    mount([{ id: 's', title: 'S', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=5' }]);
    const occ = instanceOf('s@2026-10-21T09:00:00+02:00[Europe/Paris]');
    const done = openEventEditor(cal!, { instance: occ });
    const repeat = dialog().querySelector<HTMLElement>('select option[value="DAILY"]')!.closest('fieldset')!;
    expect(repeat.hidden).toBe(true);
    dialog().querySelector<HTMLInputElement>('input[value="all"]')!.click();
    expect(repeat.hidden).toBe(false);
    dialog().querySelector<HTMLInputElement>('input[value="this"]')!.click();
    byLabel<HTMLInputElement>('Titre').value = 'Seule';
    submit();
    expect(await done).toBe('saved');
    const titles = cal!.kernel.store.snapshot.queryInstances({ start: Temporal.Instant.from('2026-10-19T00:00:00Z'), end: Temporal.Instant.from('2026-10-25T00:00:00Z'), startDate: Temporal.PlainDate.from('2026-10-19'), endDate: Temporal.PlainDate.from('2026-10-25') } as never).map((i) => i.event.title);
    expect(titles).toEqual(['S', 'S', 'Seule', 'S', 'S']);
  });

  it('"all events" with another rule: the series takes it (series.rule), its id kept', async () => {
    mount([{ id: 's', title: 'S', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=5' }]);
    const done = openEventEditor(cal!, { instance: instanceOf('s@2026-10-19T09:00:00+02:00[Europe/Paris]') });
    dialog().querySelector<HTMLInputElement>('input[value="all"]')!.click();
    const interval = dialog().querySelector<HTMLInputElement>('.dz-editor__num')!;
    interval.value = '2';
    submit();
    expect(await done).toBe('saved');
    const r = cal!.kernel.store.snapshot.getSeries('s')!.set.rules[0]!;
    expect([r.freq, r.interval, r.count]).toEqual(['DAILY', 2, 5]);
  });

  it('a rule beyond the form is shown as custom and kept as it is', async () => {
    mount([{ id: 's', title: 'S', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;BYHOUR=9,17;COUNT=4' }]);
    const done = openEventEditor(cal!, { instance: instanceOf('s@2026-10-19T09:00:00+02:00[Europe/Paris]') });
    dialog().querySelector<HTMLInputElement>('input[value="all"]')!.click();
    expect([byLabel<HTMLSelectElement>('Fréquence').value, /^Règle personnalisée : FREQ=DAILY;.*BYHOUR=9,17/.test(dialog().querySelector('.dz-editor__note')!.textContent!)]).toEqual(['custom', true]);
    byLabel<HTMLInputElement>('Titre').value = 'T';
    submit();
    expect(await done).toBe('saved');
    expect(cal!.kernel.store.snapshot.getSeries('s')!.set.rules[0]!.byHour).toEqual([9, 17]);
  });

  it('delete: a single event; an occurrence with "this event"', async () => {
    mount([{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]' }, { id: 's', title: 'S', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=3' }]);
    let done = openEventEditor(cal!, { instance: instanceOf('a') });
    $<HTMLButtonElement>('.dz-editor__btn--danger').click();
    expect([await done, ev('a')]).toEqual(['deleted', undefined]);
    done = openEventEditor(cal!, { instance: instanceOf('s@2026-10-20T09:00:00+02:00[Europe/Paris]') });
    $<HTMLButtonElement>('.dz-editor__btn--danger').click();
    expect(await done).toBe('deleted');
    expect(cal!.kernel.store.snapshot.getSeries('s')!.set.exdates.map(String)).toEqual(['2026-10-20T07:00:00Z']);
  });

  it('Escape cancels and gives the focus back; Tab stays inside', async () => {
    mount([]);
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const done = openEventEditor(cal!, { create: { allDay: true, start: Temporal.PlainDate.from('2026-10-21') } });
    const focusable = [...dialog().querySelectorAll<HTMLElement>('input, select, button')].filter((n) => !n.closest('[hidden]') && n.tabIndex >= 0);
    focusable[focusable.length - 1]!.focus();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(focusable[0]);
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect([await done, document.activeElement, cal!.kernel.store.snapshot.counts.events]).toEqual(['cancelled', before, 0]);
  });

  it('only what changed is sent: a title on an event already overlapping another is saved; a resource refused by the rules (an overlap there) is said, the dialog stays', async () => {
    mount([{ id: 'x', title: 'X', start: '2026-10-21T09:00[Europe/Paris]' }, { id: 'y', title: 'Y', start: '2026-10-21T09:00[Europe/Paris]' }], {
      rules: { overlap: false, allow: (p: { resourceIds: readonly string[] }) => !p.resourceIds.includes('b') },
      resources: [{ id: 'a', title: 'Dre A' }, { id: 'b', title: 'Dr B' }],
    });
    let done = openEventEditor(cal!, { instance: instanceOf('y') });
    byLabel<HTMLInputElement>('Titre').value = 'Y2';
    submit();
    expect([await done, ev('y')!.title]).toEqual(['saved', 'Y2']);
    done = openEventEditor(cal!, { instance: instanceOf('x') });
    [...dialog().querySelectorAll<HTMLInputElement>('.dz-editor__checks input')].find((b) => b.value === 'b')!.checked = true;
    submit();
    expect([$('.dz-editor__error').textContent, document.querySelector('.dz-editor') !== null, ev('x')!.resourceIds]).toEqual(['Non enregistré : chevauche un autre événement', true, []]);
  });

  it('editorHandlers: "Open" and "New event here" open it', () => {
    mount([{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]' }]);
    cal!.update(editorHandlers(cal!));
    cal!.element.querySelector<HTMLElement>('.dz-ev[data-event-id="a"]')!.focus();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    cal!.element.querySelector<HTMLButtonElement>('.dz-menu [data-action="event.open"]')!.click();
    expect(byLabel<HTMLInputElement>('Titre').value).toBe('A');
  });

  it('a title alone on a series written another way (own WKST, COUNT) changes neither its rule nor its WKST', async () => {
    mount([{ id: 's', title: 'S', start: '2026-10-06T09:00[Europe/Paris]', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=6;WKST=SU' }]);
    const done = openEventEditor(cal!, { instance: instanceOf('s@2026-10-06T09:00:00+02:00[Europe/Paris]') });
    dialog().querySelector<HTMLInputElement>('input[value="all"]')!.click();
    byLabel<HTMLInputElement>('Titre').value = 'S2';
    submit();
    expect(await done).toBe('saved');
    const r = cal!.kernel.store.snapshot.getSeries('s')!.set.rules[0]!;
    expect([r.wkst, r.count, r.interval, r.byDay!.map((d) => d.weekday), cal!.kernel.store.snapshot.getSeries('s')!.base.title]).toEqual([7, 6, 2, [2, 4], 'S2']);
  });

  it('"does not repeat" on a series: its first occurrence becomes the event, its fields and moved occurrences kept', async () => {
    mount([{ id: 's', title: 'S', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=3', url: 'https://x.test', extendedProps: { room: 'B12' } }]);
    const done = openEventEditor(cal!, { instance: instanceOf('s@2026-10-20T09:00:00+02:00[Europe/Paris]') });
    dialog().querySelector<HTMLInputElement>('input[value="all"]')!.click();
    const freq = byLabel<HTMLSelectElement>('Fréquence');
    freq.value = 'none';
    freq.dispatchEvent(new Event('change'));
    submit();
    expect(await done).toBe('saved');
    const e = ev('s')!;
    expect([cal!.kernel.store.snapshot.getSeries('s'), String(e.start), e.url, e.props]).toEqual([undefined, '2026-10-19T09:00:00+02:00[Europe/Paris]', 'https://x.test', { room: 'B12' }]);
  });

  it('a flight Paris → Tokyo keeps its two zones when only its title changes', async () => {
    mount([{ id: 'f', title: 'Vol', start: '2026-10-21T10:00[Europe/Paris]', end: '2026-10-22T07:00[Asia/Tokyo]' }]);
    const done = openEventEditor(cal!, { instance: instanceOf('f') });
    byLabel<HTMLInputElement>('Titre').value = 'Vol AF276';
    submit();
    expect(await done).toBe('saved');
    expect([ev('f')!.title, String(ev('f')!.start), String(ev('f')!.end)]).toEqual(['Vol AF276', '2026-10-21T10:00:00+02:00[Europe/Paris]', '2026-10-22T07:00:00+09:00[Asia/Tokyo]']);
  });

  it('"ends on a date" left empty, or before the start, is said and its field marked; no weekday is said too', async () => {
    mount([]);
    void openEventEditor(cal!, { create: { allDay: false, start: Temporal.Instant.from('2026-10-21T07:00:00Z') } });
    const freq = byLabel<HTMLSelectElement>('Fréquence');
    freq.value = 'WEEKLY';
    freq.dispatchEvent(new Event('change'));
    dialog().querySelector<HTMLInputElement>('input[value="until"]')!.checked = true;
    submit();
    const until = dialog().querySelector<HTMLInputElement>('input[type="date"]')!;
    expect([$('.dz-editor__error').textContent, until.getAttribute('aria-invalid'), document.activeElement === until]).toEqual(['Indiquez la dernière date', 'true', true]);
    until.value = '2026-10-01';
    submit();
    expect($('.dz-editor__error').textContent).toBe('La dernière date est avant la première');
    for (const b of dialog().querySelectorAll<HTMLInputElement>('.dz-editor__days input')) b.checked = false;
    submit();
    expect([$('.dz-editor__error').textContent, cal!.kernel.store.snapshot.counts.events + cal!.kernel.store.snapshot.counts.series]).toEqual(['Choisissez au moins un jour', 0]);
  });

  it('nothing changed: nothing written (no empty override); a second open gets the first; destroying the calendar closes it', async () => {
    mount([{ id: 's', title: 'S', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=3' }]);
    const occ = instanceOf('s@2026-10-20T09:00:00+02:00[Europe/Paris]');
    let done = openEventEditor(cal!, { instance: occ });
    expect(openEventEditor(cal!, { instance: occ })).toBe(done);
    submit();
    expect([await done, cal!.kernel.store.snapshot.getSeries('s')!.overrides.size, cal!.kernel.history.canUndo]).toEqual(['saved', 0, false]);
    done = openEventEditor(cal!, { instance: occ });
    cal!.destroy();
    cal = null;
    expect([await done, document.querySelector('.dz-editor')]).toEqual(['cancelled', null]);
  });
});

describe('the editor reads editable (1.1): an event the person may not change opens read-only', () => {
  const buttons = () => [...dialog().querySelectorAll<HTMLButtonElement>('.dz-editor__actions button')].map((b) => b.textContent);

  it('a calendar not editable: the event is shown, nothing offered but Close; Enter writes nothing', async () => {
    mount([{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]' }], { editable: false });
    const done = openEventEditor(cal!, { instance: instanceOf('a') });
    const note = document.getElementById(dialog().getAttribute('aria-describedby')!)!;
    expect([note.textContent, buttons()]).toEqual(['Lecture seule', ['Fermer']]);
    const title = byLabel<HTMLInputElement>('Titre');
    // Readable and focusable, not changeable; the colour and the zone disabled.
    expect([title.readOnly, title.disabled, document.activeElement === title, byLabel<HTMLSelectElement>('Couleur').disabled, byLabel<HTMLSelectElement>('Fuseau horaire').disabled]).toEqual([true, false, true, true, true]);
    // tzslot's range: its fields and its whole-day switch disabled (its hidden step buttons aside).
    const when = [...$('.dz-editor__when').querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')];
    expect([when.length > 0, when.filter((n) => !n.disabled && !n.hidden).map((n) => n.outerHTML.slice(0, 80))]).toEqual([true, []]);
    title.value = 'B';
    dialog().querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.dz-editor')).not.toBeNull();
    $<HTMLButtonElement>('.dz-editor__actions button').click();
    expect([await done, ev('a')!.title, cal!.kernel.history.canUndo]).toEqual(['cancelled', 'A', false]);
  });

  it('an event editable: false in an editable calendar: read-only; an occurrence of such a series is asked no scope', async () => {
    mount([
      { id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', editable: false },
      { id: 's', title: 'S', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=3', editable: false },
    ]);
    let done = openEventEditor(cal!, { instance: instanceOf('a') });
    expect([dialog().classList.contains('dz-editor--readonly'), buttons()]).toEqual([true, ['Fermer']]);
    $<HTMLButtonElement>('.dz-editor__actions button').click();
    expect(await done).toBe('cancelled');
    done = openEventEditor(cal!, { instance: instanceOf('s@2026-10-20T09:00:00+02:00[Europe/Paris]') });
    expect([dialog().querySelector('input[type="radio"][value="following"]'), buttons()]).toEqual([null, ['Fermer']]);
    $<HTMLButtonElement>('.dz-editor__actions button').click();
    expect(await done).toBe('cancelled');
  });

  it('an event saying editable: true in a calendar that is not: edited and deleted as in the menu', async () => {
    mount([{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', editable: true }, { id: 'b', title: 'B', start: '2026-10-22T09:00[Europe/Paris]', editable: true }], { editable: false });
    let done = openEventEditor(cal!, { instance: instanceOf('a') });
    expect([dialog().hasAttribute('aria-describedby'), buttons()]).toEqual([false, ['Supprimer', 'Annuler', 'Enregistrer']]);
    byLabel<HTMLInputElement>('Titre').value = 'A2';
    submit();
    expect([await done, ev('a')!.title]).toEqual(['saved', 'A2']);
    done = openEventEditor(cal!, { instance: instanceOf('b') });
    $<HTMLButtonElement>('.dz-editor__btn--danger').click();
    expect([await done, ev('b')]).toEqual(['deleted', undefined]);
  });

  it('startEditable: false alone: not read-only (its length may change) but its times fixed, its title saved; startEditable and durationEditable false: read-only', async () => {
    mount([
      { id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', startEditable: false },
      { id: 'b', title: 'B', start: '2026-10-22T09:00[Europe/Paris]', startEditable: false, durationEditable: false },
    ]);
    let done = openEventEditor(cal!, { instance: instanceOf('a') });
    // Its start fixed: the times and the zone shown, not offered; the title and the rest editable.
    expect([buttons(), byLabel<HTMLSelectElement>('Fuseau horaire').disabled, byLabel<HTMLSelectElement>('Couleur').disabled, byLabel<HTMLInputElement>('Titre').readOnly]).toEqual([['Supprimer', 'Annuler', 'Enregistrer'], true, false, false]);
    byLabel<HTMLInputElement>('Titre').value = 'A2';
    submit();
    expect([await done, ev('a')!.title]).toEqual(['saved', 'A2']);
    done = openEventEditor(cal!, { instance: instanceOf('b') });
    expect(buttons()).toEqual(['Fermer']);
    $<HTMLButtonElement>('.dz-editor__actions button').click();
    expect(await done).toBe('cancelled');
  });

  it('creating is the application’s request, as the menu’s "New event here": a calendar not editable still creates', async () => {
    mount([], { editable: false });
    const done = openEventEditor(cal!, { create: { allDay: false, start: Temporal.Instant.from('2026-10-21T07:00:00Z') } });
    expect([dialog().hasAttribute('aria-describedby'), buttons()]).toEqual([false, ['Annuler', 'Enregistrer']]);
    byLabel<HTMLInputElement>('Titre').value = 'N';
    submit();
    expect([await done, cal!.kernel.store.snapshot.counts.events]).toEqual(['saved', 1]);
  });

  it('the word in the five built-in languages, and English for a set defined before it existed', () => {
    expect(['en', 'fr', 'ar', 'es', 'de'].map((l) => [editorMessagesFor(l).readOnly, editorMessagesFor(l).close])).toEqual([
      ['Read only', 'Close'],
      ['Lecture seule', 'Fermer'],
      ['للقراءة فقط', 'إغلاق'],
      ['Solo lectura', 'Cerrar'],
      ['Schreibgeschützt', 'Schließen'],
    ]);
  });
});

describe('a new event from a range (1.1): the create target’s end', () => {
  const made = () => [...cal!.kernel.store.snapshot.allEvents()].map((e) => [String(e.start), String(e.end), e.allDay]);

  it('three whole days selected (21 to 24 exclusive) make a three-day event', async () => {
    mount([]);
    const done = openEventEditor(cal!, { create: { allDay: true, start: Temporal.PlainDate.from('2026-10-21'), end: Temporal.PlainDate.from('2026-10-24') } });
    submit();
    expect([await done, made()]).toEqual(['saved', [['2026-10-21', '2026-10-24', true]]]);
  });

  it('a timed range: the selection’s ZonedDateTime end, or an Instant; across the night Paris goes back to winter time (25 October 2026)', async () => {
    mount([]);
    let done = openEventEditor(cal!, { create: { allDay: false, start: Temporal.Instant.from('2026-10-21T07:00:00Z'), end: Temporal.ZonedDateTime.from('2026-10-21T10:30:00+02:00[Europe/Paris]') } });
    submit();
    expect(await done).toBe('saved');
    // 01:00 summer time (23:00Z) to 04:00 winter time (03:00Z): four hours elapsed, the 02:00–03:00 hour twice.
    done = openEventEditor(cal!, { create: { allDay: false, start: Temporal.Instant.from('2026-10-24T23:00:00Z'), end: Temporal.Instant.from('2026-10-25T03:00:00Z') } });
    submit();
    expect(await done).toBe('saved');
    expect(made()).toEqual([
      ['2026-10-21T09:00:00+02:00[Europe/Paris]', '2026-10-21T10:30:00+02:00[Europe/Paris]', false],
      ['2026-10-25T01:00:00+02:00[Europe/Paris]', '2026-10-25T04:00:00+01:00[Europe/Paris]', false],
    ]);
  });

  it('an end that cannot be used is left out with a warning, never thrown: the defaults then', async () => {
    mount([]);
    const told: Problem[] = [];
    const onProblem = (p: Problem) => told.push(p);
    // Not after the start (a whole day ending where it starts): one day.
    let done = openEventEditor(cal!, { create: { allDay: true, start: Temporal.PlainDate.from('2026-10-21'), end: Temporal.PlainDate.from('2026-10-21') } }, { onProblem });
    submit();
    expect(await done).toBe('saved');
    // Another kind (a date for a timed event): defaultMinutes.
    done = openEventEditor(cal!, { create: { allDay: false, start: Temporal.Instant.from('2026-10-22T07:00:00Z'), end: Temporal.PlainDate.from('2026-10-23') as never } }, { onProblem, defaultMinutes: 30 });
    submit();
    expect(await done).toBe('saved');
    // Before the start: an hour.
    done = openEventEditor(cal!, { create: { allDay: false, start: Temporal.Instant.from('2026-10-23T07:00:00Z'), end: Temporal.Instant.from('2026-10-23T06:00:00Z') } }, { onProblem });
    submit();
    expect(await done).toBe('saved');
    expect(told.map((p) => [p.code, p.severity, p.path])).toEqual([
      ['end-before-start', 'warning', 'create.end'],
      ['invalid-end', 'warning', 'create.end'],
      ['end-before-start', 'warning', 'create.end'],
    ]);
    expect(made()).toEqual([
      ['2026-10-21', '2026-10-22', true],
      ['2026-10-22T09:00:00+02:00[Europe/Paris]', '2026-10-22T09:30:00+02:00[Europe/Paris]', false],
      ['2026-10-23T09:00:00+02:00[Europe/Paris]', '2026-10-23T10:00:00+02:00[Europe/Paris]', false],
    ]);
  });
});

describe('the scope and refusal words follow the calendar’s messages (1.1)', () => {
  it('scope labels and a refusal’s reason in the application’s words', async () => {
    mount([{ id: 'x', title: 'X', start: '2026-10-21T09:00[Europe/Paris]' }, { id: 'y', title: 'Y', start: '2026-10-21T09:00[Europe/Paris]' }, { id: 's', title: 'S', start: '2026-10-19T09:00[Europe/Paris]', rrule: 'FREQ=DAILY;COUNT=3' }], {
      rules: { overlap: false, allow: (p: { resourceIds: readonly string[] }) => !p.resourceIds.includes('b') },
      resources: [{ id: 'a', title: 'Dre A' }, { id: 'b', title: 'Dr B' }],
      messages: { scopeThis: 'Juste celle-ci', scopeFollowing: 'Celle-ci et après', scopeAll: 'Toute la série', violation: (code: string) => `refus ${code}` },
    });
    let done = openEventEditor(cal!, { instance: instanceOf('s@2026-10-20T09:00:00+02:00[Europe/Paris]') });
    expect([...dialog().querySelectorAll<HTMLInputElement>('input[type="radio"][name$="-scope"]')].map((r) => r.parentElement!.textContent!.trim())).toEqual(['Juste celle-ci', 'Celle-ci et après', 'Toute la série']);
    $<HTMLButtonElement>('.dz-editor__actions button:not(.dz-editor__btn--danger):not([type="submit"])').click();
    expect(await done).toBe('cancelled');
    done = openEventEditor(cal!, { instance: instanceOf('x') });
    [...dialog().querySelectorAll<HTMLInputElement>('.dz-editor__checks input')].find((b) => b.value === 'b')!.checked = true;
    submit();
    expect($('.dz-editor__error').textContent).toBe('Non enregistré : refus overlap');
  });
});

describe('the editor’s sheet in the calendar’s cascade layers (18j-3, batch 4 review)', () => {
  const sheet = () => document.head.querySelector<HTMLStyleElement>('style[data-dzcalendar="editor"]')!;
  const fresh = () => document.head.querySelectorAll('style[data-dzcalendar]').forEach((s) => s.remove());
  it('layered by default: in dzcalendar.base, so a page’s plain rule wins over it', () => {
    fresh();
    mount([]);
    void openEventEditor(cal!, { create: { allDay: true, start: Temporal.PlainDate.from('2026-10-21') } });
    expect(sheet().textContent).toContain('@layer dzcalendar.base {');
    expect(sheet().dataset['dzLayers']).toBeUndefined();
  });
  it('cssLayers: false: outside any layer, as the calendar’s own sheets (before the page’s)', () => {
    fresh();
    mount([], { cssLayers: false });
    void openEventEditor(cal!, { create: { allDay: true, start: Temporal.PlainDate.from('2026-10-21') } });
    expect(sheet().textContent).not.toContain('@layer');
    expect(sheet().dataset['dzLayers']).toBe('off');
    expect(sheet().previousElementSibling?.getAttribute('data-dzcalendar')).not.toBeNull();
  });
  it('the timeline’s sheet is layered too, and comes out whole without its layer', () => {
    expect(TIMELINE_CSS.trimStart().startsWith('@layer dzcalendar.base, dzcalendar.theme;\n@layer dzcalendar.base {')).toBe(true);
    expect(unlayered(TIMELINE_CSS)).not.toContain('@layer');
    expect(unlayered(TIMELINE_CSS)).toContain('.dz-tl {');
  });
});
