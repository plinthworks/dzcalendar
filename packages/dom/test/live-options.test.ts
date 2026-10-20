import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';

// Options read once at creation before Phase 18e (Sehhaty's feedback): now live.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const make = (o: object = {}) => createCalendar(document.body.appendChild(document.createElement('div')), { timeZone: 'Europe/Paris', locale: 'fr-FR', initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), now, ...o });
afterEach(() => (document.body.innerHTML = ''));

describe('options changed after creation', () => {
  it('firstDay: Wednesday 21 October 2026 is in Monday 19 – Sunday 25, then in Sunday 18 – Saturday 24; null gives the locale’s back', () => {
    const cal = make();
    const range = () => `${cal.kernel.getState().range.start}..${cal.kernel.getState().range.end}`;
    const a = range();
    cal.update({ firstDay: 7 });
    const b = range();
    cal.update({ firstDay: null });
    expect([a, b, range()]).toEqual(['2026-10-19..2026-10-26', '2026-10-18..2026-10-25', '2026-10-19..2026-10-26']);
  });

  it('nowIndicator off and on again', () => {
    const cal = make();
    const hidden = () => cal.element.classList.contains('dz-cal--no-now');
    const a = hidden();
    cal.update({ nowIndicator: false });
    const b = hidden();
    cal.update({ nowIndicator: true });
    expect([a, b, hidden(), cal.element.querySelector('.dz-now') !== null]).toEqual([false, true, false, true]);
  });

  it('dayMaxLanes and eventMaxStack reach the models; a bad value is refused, nothing changed', () => {
    const cal = make({ initialView: 'dayGridMonth' });
    cal.update({ dayMaxLanes: 2, eventMaxStack: null });
    const o = cal.kernel.getOptions();
    expect([o.dayGrid?.maxLanes, o.timeGrid?.maxStack]).toEqual([2, null]);
    expect(() => cal.update({ dayMaxLanes: 0 })).toThrow(RangeError);
    expect(() => cal.update({ eventMaxStack: 1.5 })).toThrow(RangeError);
    expect(() => cal.update({ firstDay: 8 as never })).toThrow(RangeError);
    expect(cal.kernel.getOptions().dayGrid?.maxLanes).toBe(2);
  });

  it('rules replaced: a move outside the valid range is refused once it is set', () => {
    const cal = make({ events: [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }] });
    const move = () => cal.run({ type: 'event.move', id: 'a', start: '2026-10-30T09:00[Europe/Paris]' }, { validate: true }).ok;
    const before = move();
    cal.run({ type: 'event.move', id: 'a', start: '2026-10-21T09:00[Europe/Paris]' });
    cal.update({ rules: { validRange: { end: Temporal.PlainDate.from('2026-10-25') } } });
    expect([before, move()]).toEqual([true, false]);
  });
});

describe('allDaySlot and displayEventTime (Sehhaty)', () => {
  it('allDaySlot false folds the row and leaves its events out; displayEventTime false leaves the time out, live both', () => {
    const cal = make({ events: [{ id: 'd', title: 'Congrès', start: '2026-10-23', allDay: true }, { id: 't', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 30 } }] });
    const row = () => cal.element.querySelector('.dz-tg__allday')!;
    const time = () => cal.element.querySelector('[data-event-id="t"] .dz-ev__time')?.textContent ?? '';
    const before = [row().classList.contains('dz-tg__allday--none'), cal.element.querySelector('[data-event-id="d"]') !== null, time()];
    cal.update({ allDaySlot: false, displayEventTime: false });
    const after = [row().classList.contains('dz-tg__allday--none'), cal.element.querySelector('[data-event-id="d"]') !== null, time(), cal.element.querySelector('[data-event-id="t"]')?.textContent];
    expect([before, after]).toEqual([[false, true, '09:00 – 09:30'], [true, false, '', 'Consultation']]);
  });
});

describe('an all-day background washes its column (Sehhaty; docs/behaviors/allday-background.md)', () => {
  it('Friday 23 and Saturday 24 closed: their columns tinted at every hour, the other days not; with allDaySlot false too', () => {
    const cal = make({ events: [{ id: 'closed', title: 'Fermé · Congrès', start: '2026-10-23', end: '2026-10-25', allDay: true, display: 'background' }] });
    const washed = () =>
      [...cal.element.querySelectorAll<HTMLElement>('.dz-tg__col')].map((col) => {
        const bg = col.querySelector<HTMLElement>('.dz-ev--bg');
        return bg ? `${bg.style.getPropertyValue('--t')}+${bg.style.getPropertyValue('--h')}` : '-';
      });
    // The week of Monday 19 October: Friday and Saturday from the top (0) for the whole 24-hour axis (1 440 minutes).
    const expected = ['-', '-', '-', '-', '0+1440', '0+1440', '-'];
    const a = washed();
    cal.update({ allDaySlot: false });
    expect([a, washed()]).toEqual([expected, expected]);
  });
});

describe('the day-header hook (Sehhaty: "Fermé · Congrès" and a count to move)', () => {
  it('week and month heads take the application’s content, with the day’s info; read by assistive technology then; let go when they go', () => {
    const seen: string[] = [];
    const gone: string[] = [];
    const hooks = {
      dayHeader: {
        content: (c: { date: { toString(): string }; text: string; lengthMinutes: number; view: string }) => {
          seen.push(`${c.view} ${c.date} ${c.lengthMinutes}`);
          if (String(c.date) !== '2026-10-23') return null;
          const b = document.createElement('button');
          b.textContent = `Fermé · ${c.text}`;
          return b;
        },
        willUnmount: ({ el }: { el: HTMLElement }) => void gone.push(el.textContent ?? ''),
      },
    };
    const cal = make({ hooks });
    const head = [...cal.element.querySelectorAll<HTMLElement>('.dz-tg__dayhead')].find((el) => el.querySelector('button'));
    // Paris: Sunday 25 October 2026 is 25 hours long (1 500 minutes).
    expect([head?.textContent, head?.getAttribute('aria-hidden'), seen.filter((x) => x.startsWith('timeGridWeek')).at(-1)]).toEqual(['Fermé · ven. 23', null, 'timeGridWeek 2026-10-25 1500']);
    cal.update({ view: 'dayGridMonth' });
    // The month's heads name weekdays: Monday's is the grid's first date, 28 September.
    expect([gone.includes('Fermé · ven. 23'), seen.some((x) => x === 'dayGridMonth 2026-09-28 1440')]).toEqual([true, true]);
  });
});

describe('onEventChange: what a person changed, to persist, and its revert', () => {
  const two = () => make({ events: [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }, { id: 'b', title: 'B', start: '2026-10-22T09:00[Europe/Paris]', duration: { hours: 1 } }] });
  it('a validated command (as a gesture) is said with before and after; the program’s own run is not', () => {
    const said: string[] = [];
    const cal = two();
    cal.update({ onEventChange: (c) => void said.push(`${c.command?.type} ${String(c.before?.start).slice(11, 16)}→${String(c.after?.start).slice(11, 16)}`) });
    cal.run({ type: 'event.move', id: 'a', start: '2026-10-21T10:00[Europe/Paris]' }, { validate: true });
    cal.run({ type: 'event.move', id: 'b', start: '2026-10-22T11:00[Europe/Paris]' });
    expect(said).toEqual(['event.move 09:00→10:00']);
  });

  it('revert takes back exactly its change, after another one too; refused when the event moved again', () => {
    const changes: { revert(): boolean }[] = [];
    const cal = two();
    cal.update({ onEventChange: (c) => void changes.push(c) });
    cal.run({ type: 'event.move', id: 'a', start: '2026-10-21T10:00[Europe/Paris]' }, { validate: true });
    cal.run({ type: 'event.move', id: 'b', start: '2026-10-22T11:00[Europe/Paris]' }, { validate: true });
    // The server refuses the first drag after the second was made: the first is taken back, the second stays.
    const first = changes[0]!.revert();
    const at = (id: string) => String(cal.kernel.store.snapshot.getEvent(id)!.start).slice(11, 16);
    const after = [at('a'), at('b')];
    cal.run({ type: 'event.move', id: 'b', start: '2026-10-22T12:00[Europe/Paris]' }, { validate: true });
    // b's second drag moved it again: its first change can no longer be taken back.
    expect([first, after, changes[1]!.revert(), at('b')]).toEqual([true, ['09:00', '11:00'], false, '12:00']);
  });
});

describe('from the owner’s side-by-side screenshots', () => {
  it('dayMaxLanes null: every event of a month day, the weeks grow (no "+N")', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, title: `RDV ${i}`, start: `2026-10-21T${String(8 + i).padStart(2, '0')}:00[Europe/Paris]`, duration: { minutes: 30 } }));
    const cal = make({ initialView: 'dayGridMonth', events: many, dayMaxLanes: 2 });
    const capped = [cal.element.querySelectorAll('.dz-dg [data-event-id]').length < 9, cal.element.querySelector('.dz-dg--grow') !== null];
    cal.update({ dayMaxLanes: null });
    const ids = new Set([...cal.element.querySelectorAll<HTMLElement>('.dz-dg__week [data-event-id]')].map((el) => el.dataset['eventId']));
    expect([capped, [ids.size, cal.element.querySelector('.dz-dg__week .dz-more') !== null, cal.element.querySelector('.dz-dg--grow') !== null]]).toEqual([[true, false], [9, false, true]]);
  });

  it('eventStyle solid on the calendar’s element, live; a bad one refused', () => {
    const cal = make({ eventStyle: 'solid' });
    const a = cal.element.dataset['dzEventStyle'];
    cal.update({ eventStyle: 'tinted' });
    expect([a, cal.element.dataset['dzEventStyle'], (() => { try { cal.update({ eventStyle: 'neon' as never }); return 'taken'; } catch (e) { return (e as Error).name; } })()]).toEqual(['solid', undefined, 'RangeError']);
  });

  it('a background event carries the content hook’s label in its column (said then); null leaves it mute', () => {
    const cal = make({
      events: [{ id: 'v', title: 'Vacances', start: '2026-10-23', end: '2026-10-25', allDay: true, display: 'background' }, { id: 'p', title: 'Pause', start: '2026-10-21T12:00[Europe/Paris]', duration: { hours: 1 }, display: 'background' }],
      hooks: { event: { content: (c: { background?: boolean; instance: { event: { id: string; title: string } } }) => (c.background && c.instance.event.id === 'v' ? c.instance.event.title : null) } },
    });
    const bgs = [...cal.element.querySelectorAll<HTMLElement>('.dz-tg__col .dz-ev--bg')].map((el) => `${el.textContent}|${el.getAttribute('aria-hidden')}|${el.classList.contains('dz-ev--labelled')}`);
    expect(bgs.sort()).toEqual(['Vacances|null|true', 'Vacances|null|true', '|true|false'].sort());
  });
});

describe('a day-header hook that throws', () => {
  it('is reported, the calendar drawn with its own words', async () => {
    const reported: unknown[] = [];
    const on = (e: PromiseRejectionEvent | { reason: unknown }) => void reported.push((e as { reason: unknown }).reason);
    process.on('unhandledRejection', on as never);
    const cal = make({ hooks: { dayHeader: { content: () => { throw new Error('app bug'); } } } });
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', on as never);
    expect([cal.element.querySelectorAll('.dz-tg__dayhead').length, reported.length > 0]).toEqual([7, true]);
  });
});

describe('after the 18e review', () => {
  const one = () => make({ events: [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }] });
  it('a person’s undo and redo are said (cause), their revert is the other way; a revert is not said itself', () => {
    const said: string[] = [];
    const changes: { cause: string; revert(): boolean }[] = [];
    const cal = one();
    cal.update({ onEventChange: (c) => void (said.push(`${c.cause} ${String(c.after?.start).slice(11, 16)}`), changes.push(c)) });
    cal.run({ type: 'event.move', id: 'a', start: '2026-10-21T10:00[Europe/Paris]' }, { validate: true });
    cal.undo();
    cal.redo();
    // The redo refused by the server: taken back (an undo), not said again.
    changes[2]!.revert();
    expect([said, String(cal.kernel.store.snapshot.getEvent('a')!.start).slice(11, 16)]).toEqual([['command 10:00', 'undo 09:00', 'redo 10:00'], '09:00']);
  });

  it('a command inside a transaction is not taken back alone (false, nothing changed)', () => {
    const changes: { revert(): boolean }[] = [];
    const cal = one();
    cal.update({ onEventChange: (c) => void changes.push(c) });
    cal.kernel.history.transaction('two', () => {
      cal.run({ type: 'event.move', id: 'a', start: '2026-10-21T10:00[Europe/Paris]' }, { validate: true });
      cal.run({ type: 'event.update', id: 'a', patch: { title: 'B' } }, { validate: true });
    });
    const e = cal.kernel.store.snapshot.getEvent('a')!;
    expect([changes[0]!.revert(), String(e.start).slice(11, 16), e.title]).toEqual([false, '10:00', 'B']);
  });

  it('Algiers (+01:00 all year): Sunday 25 October 2026 is 24 hours there — no "25 h" note (Sehhaty’s check A)', () => {
    const cal = make({ timeZone: 'Africa/Algiers' });
    expect(cal.element.querySelectorAll('.dz-tg__dayhead-note').length).toBe(0);
    cal.update({ timeZone: 'Europe/Paris' });
    expect([...cal.element.querySelectorAll('.dz-tg__dayhead-note')].map((n) => n.textContent)).toEqual(['25\u202fh']);
  });
});

describe('after the 18e execution review: revert by its own entry', () => {
  const two = () => make({ events: [{ id: 'a', title: 'A', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }, { id: 'b', title: 'B', start: '2026-10-22T09:00[Europe/Paris]', duration: { hours: 1 } }] });
  const at = (cal: ReturnType<typeof make>, id: string) => String(cal.kernel.store.snapshot.getEvent(id)!.start).slice(11, 16);
  it('the undo of b refused after the undo of a: b goes back to 10:00, a stays at 09:00', () => {
    const ch: { revert(): boolean }[] = [];
    const cal = two();
    cal.update({ onEventChange: (c) => void ch.push(c) });
    cal.run({ type: 'event.move', id: 'a', start: '2026-10-21T10:00[Europe/Paris]' }, { validate: true });
    cal.run({ type: 'event.move', id: 'b', start: '2026-10-22T10:00[Europe/Paris]' }, { validate: true });
    cal.undo(); // b → 09:00 (ch[2])
    cal.undo(); // a → 09:00 (ch[3])
    expect([ch[2]!.revert(), at(cal, 'a'), at(cal, 'b')]).toEqual([true, '09:00', '10:00']);
  });

  it('the redo of a refused after the redo of b: a goes back to 09:00, b stays at 10:00', () => {
    const ch: { revert(): boolean }[] = [];
    const cal = two();
    cal.update({ onEventChange: (c) => void ch.push(c) });
    cal.run({ type: 'event.move', id: 'a', start: '2026-10-21T10:00[Europe/Paris]' }, { validate: true });
    cal.run({ type: 'event.move', id: 'b', start: '2026-10-22T10:00[Europe/Paris]' }, { validate: true });
    cal.undo();
    cal.undo();
    cal.redo(); // a → 10:00 (ch[4])
    cal.redo(); // b → 10:00 (ch[5])
    expect([ch[4]!.revert(), at(cal, 'a'), at(cal, 'b')]).toEqual([true, '09:00', '10:00']);
  });

  it('a revert inside the callback (a confirm refused): the change taken back, nothing left to undo', () => {
    const cal = two();
    cal.update({ onEventChange: (c) => void c.revert() });
    cal.run({ type: 'event.move', id: 'a', start: '2026-10-21T10:00[Europe/Paris]' }, { validate: true });
    expect([at(cal, 'a'), cal.kernel.history.canUndo]).toEqual(['09:00', false]);
  });
});

describe('the day-header hook in day grids (execution review)', () => {
  it('a resource week: each head its column’s resource; a week’s Sunday 25 October in Paris: 1 500 minutes', () => {
    const seen: string[] = [];
    make({
      initialView: 'resourceDayGridWeek',
      resources: [{ id: 'r1', title: 'R1' }, { id: 'r2', title: 'R2' }],
      hooks: { dayHeader: { content: (c: { date: unknown; resource: { id: string } | null; lengthMinutes: number }) => (seen.push(`${c.resource?.id ?? '-'} ${c.date} ${c.lengthMinutes}`), null) } },
    });
    // Drawn twice at creation (the first paint, then once the lanes are measured): the heads, once each.
    const heads = [...new Set(seen)];
    expect([heads.length, heads.filter((x) => x.startsWith('r1')).length, heads.filter((x) => x.startsWith('r2')).length, heads.includes('r2 2026-10-25 1500')]).toEqual([14, 7, 7, true]);
  });
});
