import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The core's promise — and rrule's, which it depends on — enforced by reading
 * their sources: no `Date`, no global `Temporal`, no polyfill imported behind
 * tzslot's back, no DOM.
 * Comments are stripped first — they are allowed to talk about `Date`.
 */
const SRC = new URL('../src', import.meta.url).pathname;
const RRULE = new URL('../../rrule/src', import.meta.url).pathname;
const ICAL = new URL('../../ical/src', import.meta.url).pathname;
const SLOTS = new URL('../../slots/src', import.meta.url).pathname;
const PRO = new URL('../../pro/src', import.meta.url).pathname;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

const FORBIDDEN: [string, RegExp][] = [
  ['new Date', /\bnew\s+Date\b/],
  ['Date.now / parse / UTC', /\bDate\.(now|parse|UTC)\b/],
  ['instanceof Date', /instanceof\s+Date\b/],
  ['a Date type', /[:<|,]\s*Date\b/],
  ['global Temporal', /globalThis\.Temporal/],
  ['polyfill imported directly', /from\s+['"]temporal-polyfill/],
  // Globals used, not words: a field may be called `window` (a ViewWindow).
  // DOM *types* are already a compile error — the core builds with lib ES2023 only.
  ['DOM globals', /(?<![.\w])(document|window|navigator)\s*\./],
];

describe('core purity', () => {
  const all = [...files(SRC), ...files(RRULE), ...files(ICAL), ...files(SLOTS)];

  it('finds the sources', () => {
    expect(all.length).toBeGreaterThan(5);
  });

  for (const [what, re] of FORBIDDEN) {
    it(`no ${what}`, () => {
      const offenders = all.filter((f) => re.test(code(readFileSync(f, 'utf8'))));
      expect(offenders).toEqual([]);
    });
  }

  it('only temporal.ts imports @tzslot/core for Temporal itself', () => {
    const importers = all.filter((f) => /import\s*\{[^}]*\bTemporal\b[^}]*\}\s*from\s*['"]@tzslot\/core['"]/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => f.replace(SRC, 'core').replace(RRULE, 'rrule'))).toEqual(['core/temporal.ts', 'rrule/temporal.ts']);
  });

  it('slots reads no clock (now is an input) and stands on core and rrule only, never the DOM', () => {
    const slots = files(SLOTS).map((f) => [f, code(readFileSync(f, 'utf8'))] as const);
    expect(slots.filter(([, t]) => /Temporal\.Now\b/.test(t)).map(([f]) => f)).toEqual([]);
    const imports = slots.flatMap(([, t]) => [...t.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)).filter((x) => !x.startsWith('.'));
    expect([...new Set(imports)].sort()).toEqual(['@dzcalendar/core', '@dzcalendar/rrule']);
  });

  it("the timeline's model (pro/model) reads no clock, no Date, no DOM, and stands on core only", () => {
    const model = ['model-entry.ts', 'timeline/axis.ts', 'timeline/model.ts', 'timeline/family.ts'].map((f) => [f, code(readFileSync(`${PRO}/${f}`, 'utf8'))] as const);
    expect(model.filter(([, t]) => /Temporal\.Now\b|\bnew Date\b|\bDate\.now\b|\bdocument\b|\bwindow\b|HTMLElement/.test(t)).map(([f]) => f)).toEqual([]);
    const imports = model.flatMap(([, t]) => [...t.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)).filter((x) => !x.startsWith('.'));
    expect([...new Set(imports)]).toEqual(['@dzcalendar/core']);
  });
});
