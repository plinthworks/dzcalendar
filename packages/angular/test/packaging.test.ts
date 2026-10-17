// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A package reaches its neighbours by name. In tzslot, one
 * `'../../dom/src/index.js'` pulled the whole DOM package into the Angular
 * library's compilation and crashed ng-packagr with a message naming nothing;
 * the tests stayed green, because vitest resolves either spelling.
 */
const packages = fileURLToPath(new URL('../..', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('how the packages reach each other', () => {
  it('by name, never by a path into another package’s sources', () => {
    const reaching = ['rrule', 'core', 'ical', 'dom', 'angular', 'motion-gsap']
      .flatMap((name) => files(join(packages, name, 'src')))
      .filter((f) => /from '(\.\.\/)+(rrule|core|ical|dom|angular|motion-gsap)\/src/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(packages, ''));
    expect(reaching).toEqual([]);
  });

  it('the Angular package imports no zone.js and no NgZone-only API', () => {
    const text = files(join(packages, 'angular', 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(text).not.toMatch(/from 'zone\.js'/);
    expect(text).not.toMatch(/ApplicationRef|\.tick\(/);
  });
});
