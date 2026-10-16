import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The core's promise, enforced by reading its sources: no `Date`, no global
 * `Temporal`, no polyfill imported behind tzslot's back, no DOM.
 * Comments are stripped first — they are allowed to talk about `Date`.
 */
const SRC = new URL('../src', import.meta.url).pathname;

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
  const all = files(SRC);

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
    expect(importers.map((f) => f.slice(SRC.length + 1))).toEqual(['temporal.ts']);
  });
});
