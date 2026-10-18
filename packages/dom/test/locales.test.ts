import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { EN, FR, createCalendar, defineLocale, messagesForLocale } from '../src/index.js';
import type { CalendarInstance, DzMessages } from '../src/index.js';
import { AR } from '../src/locales/ar.js';
import { ES } from '../src/locales/es.js';
import { DE } from '../src/locales/de.js';

const LOCALES: Record<string, DzMessages> = { ar: AR, es: ES, de: DE };

/** Sample parameters for every function key: each must say something. */
const SAMPLES: Record<string, unknown> = {
  gapBand: { from: '02:00', to: '03:00' },
  repeatBand: { from: '02:00', to: '03:00' },
  realDuration: { duration: '3 h' },
  eventLabel: { title: 'T', time: '09:00 – 10:00' },
  moreLink: { count: 3 },
  moreLabel: { count: 3, date: 'D' },
  newEventAt: { time: '09:00' },
  newEventOn: { date: 'D' },
  dayLabel: { date: 'D', count: 2 },
  eventMoved: { title: 'T', time: '09:00' },
  eventResized: { title: 'T', time: '09:00' },
  movedIntoGap: { time: '03:00' },
  whichReading: { time: '02:30' },
  reading: { time: '02:30', offset: '+02:00', first: true },
  eventResizedStart: { title: 'T', time: '09:00' },
  cursorSlot: { date: 'D', time: '09:00' },
  cursorAllDay: { date: 'D' },
  range: { from: 'A', to: 'B' },
  selected: { span: 'S' },
  violation: 'overlap',
  grabbed: { title: 'T' },
  eventDeleted: { title: 'T', undo: 'Ctrl+Z' },
  saveFailed: { title: 'T', reverted: true },
  weekShort: { week: 43 },
  weekLabel: { week: 43 },
  becomesTimed: { length: '1 h' },
};

describe('locales: every word, in every language', () => {
  for (const [code, m] of Object.entries(LOCALES)) {
    it(`${code}: the same keys as English, every function says something`, () => {
      expect(Object.keys(m).sort()).toEqual(Object.keys(EN).sort());
      expect(Object.keys(m.views).sort()).toEqual(Object.keys(EN.views).sort());
      for (const [key, value] of Object.entries(m)) {
        if (typeof value === 'string') expect(value.length, key).toBeGreaterThan(0);
        if (typeof value === 'function') {
          expect(key in SAMPLES, `${key} has a sample`).toBe(true);
          const out = (value as (p: unknown) => string)(SAMPLES[key]);
          expect(typeof out === 'string' && out.length > 0, key).toBe(true);
          // No unfilled template and no "undefined" leaking from a missing parameter.
          expect(out, key).not.toMatch(/undefined|\$\{/);
        }
      }
    });
  }

  it('Arabic counts take their six plural forms; digits are the ones Intl gives for ar', () => {
    const forms = [0, 1, 2, 3, 11, 100].map((c) => AR.dayLabel({ date: 'D', count: c }));
    expect(new Set(forms).size).toBe(6);
    expect(AR.dayLabel({ date: 'D', count: 1 })).toContain('حدث واحد');
    expect(AR.dayLabel({ date: 'D', count: 2 })).toContain('حدثان');
    const digits = new Intl.NumberFormat('ar').format(11);
    expect(AR.dayLabel({ date: 'D', count: 11 })).toContain(digits);
    expect(AR.moreLabel({ count: 3, date: 'D' })).toContain(new Intl.NumberFormat('ar').format(3));
  });

  it('Arabic isolates left-to-right fragments (times, offsets) inside its sentences', () => {
    expect(AR.eventLabel({ title: 'T', time: '09:00 – 10:00' })).toContain('⁨09:00 – 10:00⁩');
    expect(AR.reading({ time: '02:30', offset: '+02:00', first: false })).toContain('⁨+02:00⁩');
  });

  it('Spanish and German: singular and plural', () => {
    expect(ES.dayLabel({ date: 'D', count: 1 })).toBe('D, 1 evento');
    expect(ES.dayLabel({ date: 'D', count: 4 })).toBe('D, 4 eventos');
    expect(DE.moreLabel({ count: 1, date: 'D' })).toBe('1 weiterer Termin, D');
    expect(DE.moreLabel({ count: 5, date: 'D' })).toBe('5 weitere Termine, D');
  });
});

describe('the registry', () => {
  it('exact tag, then language, then English; extensions ignored', () => {
    // The words are made for each locale (digits follow it), the same ones each time it is asked.
    expect(messagesForLocale('ar-SA').today).toBe(AR.today);
    expect(messagesForLocale('ar-SA')).toBe(messagesForLocale('ar-SA'));
    expect(messagesForLocale('ar-SA-u-ca-islamic-umalqura').today).toBe(AR.today);
    expect(messagesForLocale('es_MX').today).toBe(ES.today);
    expect(messagesForLocale('fr-CA')).toBe(FR);
    expect(messagesForLocale('ja-JP')).toBe(EN);
    const swiss: DzMessages = { ...DE, today: 'Hüt' };
    defineLocale('de-CH', swiss);
    expect(messagesForLocale('de-CH')).toBe(swiss);
    expect(messagesForLocale('de-AT').today).toBe(DE.today);
    defineLocale('pt', { ...EN, today: 'Hoje' });
    expect(messagesForLocale('pt-BR').today).toBe('Hoje');
  });
});

describe('numbers as the locale writes them', () => {
  it('ar-SA counts in the digits ar-SA dates use; -u-nu-latn in Latin digits', () => {
    const digits = (loc: string) => new Intl.NumberFormat(loc).format(3);
    expect(messagesForLocale('ar-SA').moreLink({ count: 3 })).toContain(digits('ar-SA'));
    expect(messagesForLocale('ar-SA-u-nu-latn').moreLink({ count: 3 })).toContain('3');
  });
});

describe('a calendar in each language', () => {
  let cal: CalendarInstance | null = null;
  afterEach(() => {
    cal?.destroy();
    cal = null;
    document.body.innerHTML = '';
  });
  const mount = (locale: string) => {
    const host = document.createElement('div');
    document.body.append(host);
    cal = createCalendar(host, { timeZone: 'Europe/Paris', locale, now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'), messages: messagesForLocale(locale) });
    return cal.element;
  };
  it('es-ES: Hoy; de: Heute; ar-SA: Arabic, right to left', () => {
    expect(mount('es-ES').querySelector('.dz-toolbar__today')!.textContent).toBe('Hoy');
    cal!.destroy();
    expect(mount('de').querySelector('.dz-toolbar__today')!.textContent).toBe('Heute');
    cal!.destroy();
    const ar = mount('ar-SA');
    expect(ar.querySelector('.dz-toolbar__today')!.textContent).toBe('اليوم');
    expect(ar.dir).toBe('rtl');
    cal = null;
  });
});
