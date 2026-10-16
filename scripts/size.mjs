/**
 * `npm run size`: what each package costs an application, minified and
 * gzipped, against size-budget.json. Exits 1 over budget.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = (p) => join(root, 'packages', p, 'src', 'index.ts');
const alias = { '@dzcalendar/core': src('core'), '@dzcalendar/dom': src('dom') };

async function bundle(entry, external) {
  // An alias would resolve a package before `external` sees its name and
  // bundle it anyway (it once counted all of core inside dom): alias only
  // what is not meant to stay out.
  const kept = Object.fromEntries(Object.entries(alias).filter(([name]) => !external.includes(name)));
  const r = await build({ entryPoints: [entry], bundle: true, minify: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], write: false, external, alias: kept, logLevel: 'error' });
  return gzipSync(r.outputFiles[0].contents, { level: 9 }).length;
}

const poly = ['temporal-polyfill', 'temporal-polyfill/full'];
const results = {
  'core (without polyfill)': await bundle(src('core'), poly),
  'dom (without core)': await bundle(src('dom'), ['@dzcalendar/core', ...poly]),
  'theme css': gzipSync(readFileSync(join(root, 'packages/theme/dzcalendar.css')), { level: 9 }).length,
  'motion-gsap (without gsap)': await bundle(src('motion-gsap'), ['gsap', '@dzcalendar/dom']),
  'temporal polyfill': (await bundle(src('core'), [])) - (await bundle(src('core'), poly)),
};
const budgets = JSON.parse(readFileSync(join(root, 'size-budget.json'), 'utf8'));
let over = 0;
for (const [name, bytes] of Object.entries(results)) {
  const budget = budgets[name];
  const ok = budget === undefined || bytes <= budget;
  if (!ok) over++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(28)} ${(bytes / 1000).toFixed(1).padStart(6)} kB   budget ${(budget / 1000).toFixed(1)} kB`);
}
process.exit(over ? 1 : 0);
