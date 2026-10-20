import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error a script, not a typed module
import { generate } from '../../../scripts/gen-llms.mjs';

const site = (f: string) => readFileSync(new URL(`../../../site/${f}`, import.meta.url), 'utf8');

describe('llms.txt', () => {
  it('llms.txt and llms-full.txt are what docs/ says (npm run gen:llms writes them)', () => {
    const out = generate() as Record<string, string>;
    expect([out['llms.txt'] === site('llms.txt'), out['llms-full.txt'] === site('llms-full.txt')]).toEqual([true, true]);
  });

  it('every link of the index points at a file of the repository; every package named exists', () => {
    const index = site('llms.txt');
    const links = [...index.matchAll(/dzcalendar\/main\/([^)]+)\)/g)].map((m) => m[1]!);
    const names = [...index.matchAll(/^- `(@dzcalendar\/[\w-]+)`/gm)].map((m) => m[1]!.slice(12));
    expect([links.length > 10, links.filter((l) => !existsSync(new URL(`../../../${l}`, import.meta.url))), names.filter((n) => !existsSync(new URL(`../../${n}/package.json`, import.meta.url)))]).toEqual([true, [], []]);
  });
});
