import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { DZ_CSS, createCalendar, defineTheme } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-dzcalendar^="theme-"]').forEach((s) => s.remove());
});
const mount = (over: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialView: 'dayGridMonth', initialDate: Temporal.PlainDate.from('2026-10-21'), ...over });
  return cal.element;
};

describe('the cascade: a page’s rules win without a fight', () => {
  it('the calendar’s CSS sits in the dzcalendar.base layer, declared before the theme’s', () => {
    expect(DZ_CSS.trimStart().startsWith('@layer dzcalendar.base, dzcalendar.theme;')).toBe(true);
    expect(DZ_CSS).toContain('@layer dzcalendar.base {');
  });
});

describe('theme, scheme, density', () => {
  it('are attributes of the calendar; the defaults leave only the theme (the families are keyed on it)', () => {
    const root = mount();
    expect([root.dataset['dzTheme'], root.dataset['dzScheme'], root.dataset['dzDensity']]).toEqual(['standard', undefined, undefined]);
    cal!.update({ theme: 'night', scheme: 'dark', density: 'compact' });
    expect([root.dataset['dzTheme'], root.dataset['dzScheme'], root.dataset['dzDensity']]).toEqual(['night', 'dark', 'compact']);
    cal!.update({ theme: 'standard', scheme: 'auto', density: 'comfortable' });
    expect(root.dataset['dzTheme']).toBe('standard');
    expect(root.hasAttribute('data-dz-scheme') || root.hasAttribute('data-dz-density')).toBe(false);
  });

  it('defineTheme: a theme of one’s own, in the theme layer, light and dark; redefined, updated', () => {
    defineTheme('clinic', { accent: ['#0a7d5a', '#3ddc97'], radius: '2px', tones: { brand: '#0a7d5a' } });
    mount({ theme: 'clinic' });
    const style = document.head.querySelector('style[data-dzcalendar="theme-clinic"]')!;
    expect(style.textContent).toContain('@layer dzcalendar.theme');
    // Defaults (--dzp-*), light then dark, switched like the ready-made families.
    expect(style.textContent).toContain(".dz-cal[data-dz-theme='clinic'] { --dzp-accent: #0a7d5a; --dzp-radius: 2px; --dz-tone-brand: #0a7d5a; }");
    expect(style.textContent).toContain(".dz-cal[data-dz-theme='clinic'][data-dz-scheme='dark'] { --dzp-accent: #3ddc97; --dzp-radius: 2px; --dz-tone-brand: #0a7d5a; }");
    expect(style.textContent).not.toContain('light-dark(');
    defineTheme('clinic', { accent: '#123456' });
    // Redefined: the sheet in place follows at once, no theme switch needed.
    expect(style.textContent).toContain('--dzp-accent: #123456;');
  });

  it('defineTheme refuses what is not a name or a CSS value', () => {
    expect(() => defineTheme('Bad Name', {})).toThrow(RangeError);
    expect(() => defineTheme('x', { accent: 'red; } body { display: none' })).toThrow(RangeError);
  });
});

describe('cssLayers: false (pages whose reset is unlayered: Tailwind 3, Bootstrap)', () => {
  it('injects the same CSS outside any layer, first in the head, and the views follow', () => {
    for (const st of document.head.querySelectorAll('style[data-dzcalendar]')) st.remove();
    const page = document.createElement('style');
    page.id = 'page';
    document.head.append(page);
    defineTheme('flat', { accent: '#123456' });
    mount({ cssLayers: false, theme: 'flat' });
    const core = document.head.querySelector<HTMLStyleElement>('style[data-dzcalendar="core"]')!;
    expect(core.textContent).not.toContain('@layer');
    expect(core.textContent).toContain('.dz-cal {');
    const theme = document.head.querySelector<HTMLStyleElement>('style[data-dzcalendar="theme-flat"]')!;
    expect(theme.textContent).not.toContain('@layer');
    // Ours first, in their own order; the page's after them, so a page rule of the same weight wins.
    const order = [...document.head.children].map((el) => (el as HTMLElement).dataset['dzcalendar'] ?? el.id);
    expect(order.indexOf('core')).toBeLessThan(order.indexOf('theme-flat'));
    expect(order.indexOf('theme-flat')).toBeLessThan(order.indexOf('page'));
    defineTheme('flat', { accent: '#654321' });
    expect(theme.textContent).toContain('--dzp-accent: #654321;');
    expect(theme.textContent).not.toContain('@layer');
    page.remove();
    for (const st of document.head.querySelectorAll('style[data-dzcalendar]')) st.remove();
  });
});

describe('calendars of the dates', () => {
  it('displayCalendar: titles and day numbers in the Hijri calendar (Umm al-Qura), the grid still Gregorian', () => {
    const root = mount({ locale: 'en-US', displayCalendar: 'islamic-umalqura' });
    const expected = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', { day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 21));
    expect(root.querySelector('.dz-dg__cell[data-date="2026-10-21"] .dz-dg__num')!.textContent).toBe(expected);
    expect(cal!.kernel.getState().title).toMatch(/AH/);
    cal!.update({ displayCalendar: null });
    expect(root.querySelector('.dz-dg__cell[data-date="2026-10-21"] .dz-dg__num')!.textContent).toBe('21');
  });

  it('secondaryCalendar: the Hijri day beside each Gregorian one, with its month on the 1st; said in the cell’s name', () => {
    const root = mount({ locale: 'fr-FR', secondaryCalendar: 'islamic-umalqura' });
    const alts = [...root.querySelectorAll<HTMLElement>('.dz-dg__cell:not(.dz-dg__cell--outside) .dz-dg__alt')];
    expect(alts).toHaveLength(31);
    const long = new Intl.DateTimeFormat('fr-FR-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 21));
    expect(root.querySelector('.dz-dg__cell[data-date="2026-10-21"]')!.getAttribute('aria-label')).toContain(long);
    // Exactly one Hijri month begins in October 2026 (a lunar month is 29 or 30 days): its cell shows the month name.
    expect(alts.filter((a) => /\D/.test(a.textContent!.replace(/\s/g, ''))).length).toBeGreaterThanOrEqual(1);
    cal!.update({ secondaryCalendar: null });
    expect(root.querySelector('.dz-dg__alt')).toBeNull();
  });

  it('a second calendar that is the one shown is not shown twice', () => {
    const root = mount({ locale: 'fr-FR', secondaryCalendar: 'gregory' });
    expect(root.querySelector('.dz-dg__alt')).toBeNull();
    cal!.update({ displayCalendar: 'islamic-umalqura' });
    expect(root.querySelector('.dz-dg__cell[data-date="2026-10-21"] .dz-dg__alt')!.textContent).toBe('21');
  });

  it('an unknown calendar is refused', () => {
    expect(() => mount({ displayCalendar: 'not-a-calendar!' })).toThrow(RangeError);
  });
});

describe('review fixes (Phase 13)', () => {
  it('words given by the application survive a change of language; the rest follows the new one', async () => {
    await import('../src/locales/ar.js');
    const root = mount({ messages: { today: 'Maintenant' } });
    expect(root.querySelector('.dz-toolbar__today')!.textContent).toBe('Maintenant');
    cal!.update({ locale: 'ar-SA' });
    expect(root.querySelector('.dz-toolbar__today')!.textContent).toBe('Maintenant');
    expect(root.querySelector<HTMLElement>('.dz-toolbar__prev')!.getAttribute('aria-label')).not.toBe('Précédent');
    expect(root.dir).toBe('rtl');
  });

  it('a bad theme, scheme or density is refused before any change; unknown token keys too', () => {
    expect(() => mount({ theme: 'nope' })).toThrow(RangeError);
    document.body.innerHTML = '';
    mount();
    expect(() => cal!.update({ scheme: 'sepia' as never, view: 'timeGridWeek' })).toThrow(RangeError);
    expect(cal!.kernel.getState().view.type).toBe('dayGridMonth');
    const evil = { ['x: 1; } body { color: red']: 'red' } as unknown as Parameters<typeof defineTheme>[1];
    expect(() => defineTheme('k', evil)).toThrow(RangeError);
    expect(() => defineTheme('standard', {})).toThrow(RangeError);
  });

  it('a Gregorian month in Hijri is titled with the Hijri months it covers', () => {
    mount({ locale: 'en-US', displayCalendar: 'islamic-umalqura' });
    const first = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 1));
    const last = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 31));
    const title = cal!.kernel.getState().title;
    expect(title).toContain(first);
    expect(title).toContain(last);
  });

  it('themeCss gives a defined theme’s CSS for a CSP setup', async () => {
    const { themeCss } = await import('../src/index.js');
    defineTheme('csp', { accent: '#123456' });
    expect(themeCss('csp')).toContain('--dzp-accent: #123456;');
    expect(themeCss('missing')).toBeUndefined();
  });
});

describe('review fixes (Phase 13, code review)', () => {
  it('a bad locale is refused before anything changes, naming the locale; later updates work', () => {
    mount({ locale: 'en', displayCalendar: 'islamic-umalqura' });
    expect(() => cal!.update({ locale: 'en_US' })).toThrow(/not a locale: en_US/);
    expect(() => cal!.update({ weekNumbers: true })).not.toThrow();
    expect(cal!.kernel.getState().locale).toBe('en-u-ca-islamic-umalqura');
  });

  it('an unrelated update does not put back a locale changed elsewhere (shared kernel)', () => {
    mount({ locale: 'en' });
    const a = cal!;
    const host = document.createElement('div');
    document.body.append(host);
    const b = createCalendar(host, { kernel: a.kernel, timeZone: 'Europe/Paris' });
    a.update({ locale: 'de' });
    b.update({ weekNumbers: true });
    expect(a.kernel.getState().locale).toBe('de');
    a.kernel.setLocale('es');
    a.update({ weekNumbers: false });
    expect(a.kernel.getState().locale).toBe('es');
    b.destroy();
  });

  it('a display calendar asked with a shared kernel applies at creation, on that kernel’s locale', () => {
    mount({ locale: 'de' });
    const host = document.createElement('div');
    document.body.append(host);
    const c = createCalendar(host, { kernel: cal!.kernel, timeZone: 'Europe/Paris', displayCalendar: 'islamic-umalqura' });
    expect(cal!.kernel.getState().locale).toBe('de-u-ca-islamic-umalqura');
    c.destroy();
  });

  it('calendar names in another case or an alias are taken as Intl takes them', () => {
    mount({ locale: 'en', displayCalendar: 'Islamic-Umalqura' });
    expect(cal!.kernel.getState().locale).toBe('en-u-ca-islamic-umalqura');
    cal!.update({ displayCalendar: 'islamicc' });
    expect(cal!.kernel.getState().locale).toBe('en-u-ca-islamic-civil');
  });

  it('the Hijri month is shown on its 1st where the day carries a suffix (ja: 1日)', () => {
    // 12 October 2026 is 1 Jumada al-Ula 1448 in the Umm al-Qura table.
    const root = mount({ locale: 'ja', secondaryCalendar: 'islamic-umalqura' });
    const alt = root.querySelector('.dz-dg__cell[data-date="2026-10-12"] .dz-dg__alt')!.textContent!;
    const month = new Intl.DateTimeFormat('ja-u-ca-islamic-umalqura', { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 12));
    expect(alt).toContain(month);
  });

  it('a theme defined again reaches the shadow roots it was put in', () => {
    defineTheme('sh', { accent: '#111111' });
    const outer = document.createElement('div');
    document.body.append(outer);
    const shadow = outer.attachShadow({ mode: 'open' });
    const host = document.createElement('div');
    shadow.append(host);
    cal = createCalendar(host, { timeZone: 'Europe/Paris', theme: 'sh' });
    defineTheme('sh', { accent: '#222222' });
    expect(shadow.querySelector('style[data-dzcalendar="theme-sh"]')!.textContent).toContain('--dzp-accent: #222222;');
  });
});
