import { it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ARCHITECTURE J (Phase 17): GSAP is never in @dzcalendar/dom — only in the optional motion-gsap adapter.
it('no file of @dzcalendar/dom imports gsap, and its manifest does not depend on it', () => {
  const root = join(process.cwd(), 'packages/dom/src');
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.ts') && files.push(join(d, f))));
  walk(root);
  const importing = files.filter((f) => /from\s+['"]gsap|import\(\s*['"]gsap/.test(readFileSync(f, 'utf8')));
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'packages/dom/package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
  expect([files.length > 20, importing, ['dependencies', 'peerDependencies', 'optionalDependencies'].filter((k) => pkg[k]?.['gsap'])]).toEqual([true, [], []]);
});
