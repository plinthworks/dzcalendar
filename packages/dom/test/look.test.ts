import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '../src/index.js';
import { withLookGuard } from '../src/render/look.js';
import '../src/list.js';

// The unstyled mode (look: 'none', docs/styling.md): the CSS split into its structure and its look.
const G = ':where(:not([data-dz-look="none"], [data-dz-look="none"] *))';
afterEach(() => (document.body.innerHTML = ''));

describe('withLookGuard', () => {
  it('a rule split: its structure as it was, its look guarded with no weight', () => {
    expect(withLookGuard('.a { display: grid; color: red; grid-template-columns: 1fr 2fr; border: 1px solid; }').trim()).toBe(
      `.a { display: grid; grid-template-columns: 1fr 2fr; }\n.a${G} { color: red; border: 1px solid; }`,
    );
  });

  it('every selector of a list guarded; a pseudo-element kept last', () => {
    expect(withLookGuard('.a, .b:hover::before { color: red; }').trim()).toBe(`.a${G}, .b:hover${G}::before { color: red; }`);
  });

  it('@media, @layer walked; a layer statement kept; a string with a colon or a semicolon left whole', () => {
    const out = withLookGuard(`@layer x, y;\n@layer x { @media print { .a { position: absolute; background: red; } } }\n.c::after { content: 'a: b; c'; color: red; }`);
    expect(out).toContain('@layer x, y;');
    expect(out).toContain('.a { position: absolute; }');
    expect(out).toContain(`.a${G} { background: red; }`);
    expect(out).toContain(`.c::after { content: 'a: b; c'; }`);
    expect(out).toContain(`.c${G}::after { color: red; }`);
  });

  it('a reset or the platform’s own colours stay (no colour of ours): a button as plain text, a sticky head filled with Canvas', () => {
    expect(withLookGuard('.b { border: 0; color: inherit; background-color: Canvas; background: var(--dz-bg); }').trim()).toBe(`.b { border: 0; color: inherit; background-color: Canvas; }\n.b${G} { background: var(--dz-bg); }`);
  });

  it('a single-colon pseudo-element kept last too; a sheet guarded already is left as it is', () => {
    const once = withLookGuard('.a:before { color: red; }');
    expect([once.trim(), withLookGuard(once)]).toEqual([`.a${G}:before { color: red; }`, once]);
  });

  it('custom properties are structure (the tokens stay for a rule of yours)', () => {
    expect(withLookGuard('.a { --dz-accent: red; }').trim()).toBe('.a { --dz-accent: red; }');
  });
});

describe('the look option', () => {
  const make = (o: Record<string, unknown>) =>
    createCalendar(document.body.appendChild(document.createElement('div')), { timeZone: 'Europe/Paris', initialDate: Temporal.PlainDate.from('2026-10-21'), ...o });
  it("'none' marks the calendar, live; anything else is refused", () => {
    const c = make({ look: 'none' });
    const first = c.element.getAttribute('data-dz-look');
    c.update({ look: 'styled' });
    expect([first, c.element.hasAttribute('data-dz-look'), () => c.update({ look: 'bare' as never })].slice(0, 2)).toEqual(['none', false]);
    expect(() => c.update({ look: 'bare' as never })).toThrow(RangeError);
    c.destroy();
  });

  it('a page with no unstyled calendar pays nothing; the first one guards the sheets already there and those to come', () => {
    // A shadow root of its own: its sheets are its own, untouched by the other tests' calendars.
    const shadow = document.body.appendChild(document.createElement('div')).attachShadow({ mode: 'open' });
    const inside = (o: Record<string, unknown>) => createCalendar(shadow.appendChild(document.createElement('div')), { timeZone: 'Europe/Paris', initialDate: Temporal.PlainDate.from('2026-10-21'), ...o });
    const styled = inside({});
    const before = shadow.querySelector('style[data-dzcalendar="core"]')?.textContent ?? '';
    const bare = inside({ look: 'none', initialView: 'listWeek' });
    const after = shadow.querySelector('style[data-dzcalendar="core"]')?.textContent ?? '';
    const list = shadow.querySelector('style[data-dzcalendar="list"]')?.textContent ?? '';
    expect([before.length > 0, before.includes('[data-dz-look="none"]'), after.includes('[data-dz-look="none"]'), list === '' || list.includes('[data-dz-look="none"]')]).toEqual([true, false, true, true]);
    styled.destroy();
    bare.destroy();
  });
});
