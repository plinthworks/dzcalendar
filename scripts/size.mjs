/**
 * `npm run size`: what each package costs an application, minified and
 * gzipped, against size-budget.json. Exits 1 over budget.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minifyCssLiteral } from './css-literal.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = (p) => join(root, 'packages', p, 'src', 'index.ts');
const alias = { '@dzcalendar/core': src('core'), '@dzcalendar/dom': src('dom'), '@dzcalendar/rrule': src('rrule'), '@dzcalendar/ical': src('ical'), '@dzcalendar/slots': src('slots'), '@dzcalendar/pro': src('pro') };
/** What `npm run build` ships: the structural CSS minified. */
const shippedCss = {
  name: 'shipped-css',
  setup(b) {
    b.onLoad({ filter: /[\\/]dom[\\/]src[\\/]styles\.ts$/ }, async (a) => ({ contents: await minifyCssLiteral(readFileSync(a.path, 'utf8')), loader: 'ts' }));
  },
};

/** `entry` is a file, or `{ code }`: a module written here (resolved from the repository's root). */
async function bundle(entry, external) {
  // An alias would resolve a package before `external` sees its name and
  // bundle it anyway (it once counted all of core inside dom): alias only
  // what is not meant to stay out.
  const kept = Object.fromEntries(Object.entries(alias).filter(([name]) => !external.includes(name)));
  const input = typeof entry === 'string' ? { entryPoints: [entry] } : { stdin: { contents: entry.code, resolveDir: root, loader: 'ts' } };
  const r = await build({ ...input, bundle: true, minify: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], write: false, external, alias: kept, plugins: [shippedCss], logLevel: 'error' });
  return gzipSync(r.outputFiles[0].contents, { level: 9 }).length;
}

const poly = ['temporal-polyfill', 'temporal-polyfill/full'];
const results = {
  // rrule is a dependency of core with its own line: each is counted once.
  'core (without polyfill)': await bundle(src('core'), ['@dzcalendar/rrule', ...poly]),
  'rrule (without polyfill)': await bundle(src('rrule'), ['@tzslot/core', ...poly]),
  'ical (without core)': await bundle(src('ical'), ['@dzcalendar/core', '@dzcalendar/rrule', ...poly]),
  'slots (without core)': await bundle(src('slots'), ['@dzcalendar/core', '@dzcalendar/rrule', ...poly]),
  'dom (without core)': await bundle(src('dom'), ['@dzcalendar/core', ...poly]),
  'pro (without core, dom)': await bundle(src('pro'), ['@dzcalendar/core', '@dzcalendar/dom', '@dzcalendar/dom/toolkit', ...poly]),
  // The view models share core's modules: what they add beyond it.
  'core/views (beyond core)':
    (await bundle({ code: `export * from './packages/core/src/index.ts'; export * from './packages/core/src/views.ts';` }, ['@dzcalendar/rrule', ...poly])) -
    (await bundle(src('core'), ['@dzcalendar/rrule', ...poly])),
  'dom/list (without dom)': await bundle(join(root, 'packages/dom/src/list.ts'), ['@dzcalendar/core', '@dzcalendar/core/views', '@dzcalendar/dom', '@dzcalendar/dom/toolkit', ...poly]),
  'dom/multimonth (without dom)': await bundle(join(root, 'packages/dom/src/multimonth.ts'), ['@dzcalendar/core', '@dzcalendar/core/views', '@dzcalendar/dom', '@dzcalendar/dom/toolkit', ...poly]),
  'dom/custom (without dom)': await bundle(join(root, 'packages/dom/src/custom.ts'), ['@dzcalendar/core', '@dzcalendar/core/views', '@dzcalendar/dom', '@dzcalendar/dom/toolkit', ...poly]),
  'dom/locales/ar (without dom)': await bundle(join(root, 'packages/dom/src/locales/ar.ts'), ['@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  'dom/locales/es (without dom)': await bundle(join(root, 'packages/dom/src/locales/es.ts'), ['@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  'dom/locales/de (without dom)': await bundle(join(root, 'packages/dom/src/locales/de.ts'), ['@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  // ng-packagr's bundle: run `npm run build` first.
  'angular (without Angular, core, dom)': await bundle(join(root, 'packages/angular/dist/fesm2022/dzcalendar-angular.mjs'), ['@angular/core', '@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  'theme css': gzipSync(readFileSync(join(root, 'packages/theme/dzcalendar.css')), { level: 9 }).length,
  'motion-gsap (without gsap)': await bundle(src('motion-gsap'), ['gsap', '@dzcalendar/dom']),
  'temporal polyfill': (await bundle(src('core'), ['@dzcalendar/rrule'])) - (await bundle(src('core'), ['@dzcalendar/rrule', ...poly])),
};
const budgets = JSON.parse(readFileSync(join(root, 'size-budget.json'), 'utf8'));
// A budget is a guide (owner, 2026-10-16: "a little over is fine"): over it
// warns, only more than 5 % over fails — as ARCHITECTURE G.1 says.
let over = 0;
for (const [name, bytes] of Object.entries(results)) {
  const budget = budgets[name];
  const within = budget === undefined || bytes <= budget;
  const tolerated = !within && bytes <= budget * 1.05;
  if (!within && !tolerated) over++;
  const mark = within ? '✓' : tolerated ? '!' : '✗';
  console.log(`${mark} ${name.padEnd(28)} ${(bytes / 1000).toFixed(1).padStart(6)} kB   budget ${(budget / 1000).toFixed(1)} kB${tolerated ? '   (over, within 5 %)' : ''}`);
}
process.exit(over ? 1 : 0);
