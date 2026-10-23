import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import root from '../vite.config';

const page = (p: string) => fileURLToPath(new URL(`./${p}/index.html`, import.meta.url));

// As an application ships them: minified, and DzCalendar as npm gives it — each package's dist/ (built by
// scripts/bench-public.mjs first: `npm run build`), not its sources (whose CSS literals are not minified).
const fromSources = (root as { resolve: { alias: Record<string, string> } }).resolve.alias;
const alias: Record<string, string> = {};
for (const [name, file] of Object.entries(fromSources)) {
  const built = file.replace('/src/', '/dist/').replace(/\.ts$/, '.js');
  if (!name.startsWith('@dzcalendar/')) alias[name] = file;
  else if (existsSync(built)) alias[name] = built;
  // A dist missing would mix sources and dists (two copies of a registry): said, never measured.
  else if (/\/(dom|core|rrule)\//.test(file)) throw new Error(`${built} is missing: run npm run build`);
  else alias[name] = file;
}
// Reached only through the packages' own imports.
alias['@dzcalendar/rrule'] = fileURLToPath(new URL('../packages/rrule/dist/index.js', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  resolve: { alias },
  build: { outDir: 'dist', emptyOutDir: true, minify: true, sourcemap: false, rollupOptions: { input: { dz: page('dz'), fc6: page('fc6'), fc7: page('fc7') } } },
  logLevel: 'warn',
});
