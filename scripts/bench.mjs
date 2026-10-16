/**
 * `npm run bench`: bundles perf/bench-entry.ts minified (as an app's bundler
 * would), runs it with the garbage collector exposed, and compares the
 * medians with perf/budgets.json. Exits 1 over budget.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'node_modules', '.cache', 'dzcalendar', 'bench.mjs');
mkdirSync(join(out, '..'), { recursive: true });

await build({
  entryPoints: [join(root, 'perf', 'bench-entry.ts')],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  outfile: out,
  logLevel: 'error',
});

const results = JSON.parse(execFileSync(process.execPath, ['--expose-gc', out], { encoding: 'utf8' }));
const budgets = JSON.parse(readFileSync(join(root, 'perf', 'budgets.json'), 'utf8'));

let over = 0;
for (const [name, value] of Object.entries(results)) {
  const budget = budgets[name];
  const ok = budget === undefined || value <= budget;
  if (!ok) over++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(26)} ${value.toFixed(value < 10 ? 3 : 1).padStart(9)}   budget ${budget ?? '—'}`);
}
process.exit(over ? 1 : 0);
