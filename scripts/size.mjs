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
  'pro/editor (without core, dom, tzslot dom)': await bundle(join(root, 'packages/pro/src/editor-entry.ts'), ['@dzcalendar/core', '@dzcalendar/dom', '@dzcalendar/dom/toolkit', '@tzslot/dom', '@tzslot/core', ...poly]),
  'pro/export (without core, dom, ical)': await bundle(join(root, 'packages/pro/src/export-entry.ts'), ['@dzcalendar/core', '@dzcalendar/core/views', '@dzcalendar/dom', '@dzcalendar/ical', ...poly]),
  'pro/print (without core, dom)': await bundle(join(root, 'packages/pro/src/print-entry.ts'), ['@dzcalendar/core', '@dzcalendar/core/views', '@dzcalendar/dom', ...poly]),
  'pro/slots (without core, slots)': await bundle(join(root, 'packages/pro/src/slots-entry.ts'), ['@dzcalendar/core', '@dzcalendar/slots', ...poly]),
  // The view models share core's modules: what they add beyond it.
  'core/views (beyond core)':
    (await bundle({ code: `export * from './packages/core/src/index.ts'; export * from './packages/core/src/views.ts';` }, ['@dzcalendar/rrule', ...poly])) -
    (await bundle(src('core'), ['@dzcalendar/rrule', ...poly])),
  // The framework wrappers' shared template builder (in @dzcalendar/dom/toolkit, outside the dom entry's bundle).
  'dom/templates (without core)': await bundle(join(root, 'packages/dom/src/render/templates.ts'), ['@dzcalendar/core', ...poly]),
  'dom/list (without dom)': await bundle(join(root, 'packages/dom/src/list.ts'), ['@dzcalendar/core', '@dzcalendar/core/views', '@dzcalendar/dom', '@dzcalendar/dom/toolkit', ...poly]),
  'dom/multimonth (without dom)': await bundle(join(root, 'packages/dom/src/multimonth.ts'), ['@dzcalendar/core', '@dzcalendar/core/views', '@dzcalendar/dom', '@dzcalendar/dom/toolkit', ...poly]),
  'dom/custom (without dom)': await bundle(join(root, 'packages/dom/src/custom.ts'), ['@dzcalendar/core', '@dzcalendar/core/views', '@dzcalendar/dom', '@dzcalendar/dom/toolkit', ...poly]),
  'dom/locales/ar (without dom)': await bundle(join(root, 'packages/dom/src/locales/ar.ts'), ['@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  'dom/locales/es (without dom)': await bundle(join(root, 'packages/dom/src/locales/es.ts'), ['@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  'dom/locales/de (without dom)': await bundle(join(root, 'packages/dom/src/locales/de.ts'), ['@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  // ng-packagr's bundle: run `npm run build` first.
  'angular (without Angular, core, dom)': await bundle(join(root, 'packages/angular/dist/fesm2022/dzcalendar-angular.mjs'), ['@angular/core', '@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  'pro-angular (without Angular, core, dom, pro)': await bundle(join(root, 'packages/pro-angular/dist/fesm2022/dzcalendar-pro-angular.mjs'), ['@angular/core', '@dzcalendar/core', '@dzcalendar/dom', '@dzcalendar/angular', '@dzcalendar/pro', '@dzcalendar/pro/editor', ...poly]),
  'react (without React, core, dom)': await bundle(src('react'), ['react', 'react-dom', '@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  'vue (without Vue, core, dom)': await bundle(src('vue'), ['vue', '@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  // The Pro's entries are fetched on demand: left out like the framework.
  'pro-react (without React, core, dom, pro)': await bundle(src('pro-react'), ['react', '@dzcalendar/core', '@dzcalendar/dom', '@dzcalendar/react', '@dzcalendar/pro', '@dzcalendar/pro/editor', '@dzcalendar/pro/export', '@dzcalendar/pro/print', ...poly]),
  'pro-vue (without Vue, core, dom, pro)': await bundle(src('pro-vue'), ['vue', '@dzcalendar/core', '@dzcalendar/dom', '@dzcalendar/vue', '@dzcalendar/pro', '@dzcalendar/pro/editor', '@dzcalendar/pro/export', '@dzcalendar/pro/print', ...poly]),
  // What opening the editor costs, tzslot's widget included (fetched on demand).
  'pro/editor with tzslot dom (without core, dom)': await bundle(join(root, 'packages/pro/src/editor-entry.ts'), ['@dzcalendar/core', '@dzcalendar/dom', '@dzcalendar/dom/toolkit', '@tzslot/core', ...poly]),
  'theme css': gzipSync(readFileSync(join(root, 'packages/theme/dzcalendar.css')), { level: 9 }).length,
  'compat-fullcalendar (without core, dom, ical)': await bundle(src('compat-fullcalendar'), ['@dzcalendar/core', '@dzcalendar/dom', '@dzcalendar/ical', ...poly]),
  'element (without core, dom)': await bundle(join(root, 'packages/element/src/define.ts'), ['@dzcalendar/core', '@dzcalendar/dom', ...poly]),
  'motion-gsap (without gsap)': await bundle(src('motion-gsap'), ['gsap', '@dzcalendar/dom']),
  'temporal polyfill': (await bundle(src('core'), ['@dzcalendar/rrule'])) - (await bundle(src('core'), ['@dzcalendar/rrule', ...poly])),
};
const budgets = JSON.parse(readFileSync(join(root, 'size-budget.json'), 'utf8'));
// A budget is a guide (owner, 2026-10-16: "a little over is fine"): over it
// warns, only more than 5 % over fails — as ARCHITECTURE G.1 says.
let over = 0;
for (const [name, bytes] of Object.entries(results)) {
  const budget = budgets[name];
  // A package measured without a budget fails: its size would never be watched.
  const within = budget !== undefined && bytes <= budget;
  const tolerated = !within && budget !== undefined && bytes <= budget * 1.05;
  if (!within && !tolerated) over++;
  const mark = within ? '✓' : tolerated ? '!' : '✗';
  console.log(`${mark} ${name.padEnd(28)} ${(bytes / 1000).toFixed(1).padStart(6)} kB   budget ${budget === undefined ? 'none' : `${(budget / 1000).toFixed(1)} kB`}${tolerated ? '   (over, within 5 %)' : ''}`);
}
process.exit(over ? 1 : 0);
