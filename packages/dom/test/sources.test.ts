import { describe, it, expect, afterEach } from 'vitest';
import { Temporal, fnSource } from '@dzcalendar/core';
import type { EventInput, EventSourceSpec, SourceNotice } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';

// Sources as the DOM shows them: busy while loading, a refused save said and put back.

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const mount = (over: Record<string, unknown>) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialView: 'timeGridWeek', ...over });
  return cal.element;
};
const said = async () => {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  return document.querySelector('.dz-live')!.textContent ?? '';
};
const tick = () => new Promise((r) => setTimeout(r, 0));
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
}
const meeting: EventInput = { id: 'm', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T10:00[Europe/Paris]' };

describe('sources in the calendar', () => {
  it('is aria-busy while a source loads, and shows its events after', async () => {
    const answer = deferred<readonly EventInput[]>();
    const root = mount({ sources: [fnSource('s', () => answer.promise)] });
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(root.classList.contains('dz-loading')).toBe(true);
    answer.resolve([meeting]);
    await cal!.kernel.sources.idle();
    await tick();
    expect(root.hasAttribute('aria-busy')).toBe(false);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(root.querySelector('.dz-ev[data-event-id="m"]')).not.toBeNull();
  });

  it('a refused save puts the event back and says so; onSource hears it', async () => {
    const heard: SourceNotice['type'][] = [];
    const save = deferred<void>();
    mount({ editable: true, onSource: (n: SourceNotice) => heard.push(n.type), sources: [fnSource('s', () => [meeting], { save: () => save.promise })] });
    expect(cal!.run({ type: 'event.move', id: 'm', start: '2026-10-22T09:00[Europe/Paris]' }).ok).toBe(true);
    expect(String(cal!.kernel.store.snapshot.getEvent('m')!.start)).toBe('2026-10-22T09:00:00+02:00[Europe/Paris]');
    save.reject(new Error('403'));
    await cal!.kernel.sources.idle();
    expect(String(cal!.kernel.store.snapshot.getEvent('m')!.start)).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
    expect(await said()).toBe('« Réunion » n’a pas pu être enregistré. Il est revenu comme avant.');
    expect(heard).toContain('save-error');
  });

  it('a failed fetch is said', async () => {
    mount({ sources: [fnSource('s', () => Promise.reject(new Error('down')))] });
    await cal!.kernel.sources.idle();
    expect(await said()).toBe('Des événements n’ont pas pu être chargés.');
  });

  it('update({ sources }) removes the sources not listed and adds the new ones', () => {
    const a: EventSourceSpec = fnSource('a', () => [meeting]);
    const b: EventSourceSpec = fnSource('b', () => [{ ...meeting, id: 'n', title: 'Autre' }]);
    mount({ sources: [a] });
    cal!.update({ sources: [a, b] });
    expect(cal!.kernel.sources.ids()).toEqual(['a', 'b']);
    cal!.update({ sources: [b] });
    expect(cal!.kernel.sources.ids()).toEqual(['b']);
    expect(cal!.kernel.store.snapshot.getEvent('m')).toBeUndefined();
    expect(cal!.kernel.store.snapshot.getEvent('n')).toBeDefined();
  });

  it('refetch asks the source again', () => {
    let calls = 0;
    mount({ sources: [fnSource('s', () => (calls++, [meeting]))] });
    cal!.refetch();
    expect(calls).toBe(2);
  });

  it('messages written before Phase 9 still announce a refused save (defaults fill the new keys)', async () => {
    const { FR } = await import('../src/messages.js');
    const { saveFailed: _a, loadFailed: _b, ...old } = FR;
    mount({ messages: old, sources: [fnSource('s', () => [meeting], { save: () => Promise.reject(new Error('x')) })] });
    cal!.run({ type: 'event.move', id: 'm', start: '2026-10-22T09:00[Europe/Paris]' });
    await cal!.kernel.sources.idle();
    expect(await said()).toContain('n’a pas pu être enregistré');
  });
});
