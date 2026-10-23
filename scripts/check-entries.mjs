/**
 * The entries that plug the recurrence engine in on import (ical, the Pro editor, the compat, the element) keep it
 * once an application is bundled from the dists by Rollup (Vite), which skips a side-effect-free barrel: a repeating
 * event read through them must still be a series. Run after `npm run build` (18i review: Vite had dropped it).
 */
import { build, loadConfigFromFile } from 'vite';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = (p) => join(root, 'packages', p, 'dist');
const dir = mkdtempSync(join(tmpdir(), 'dz-entries-'));
const ICS = 'BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nBEGIN:VEVENT\\r\\nUID:r1\\r\\nDTSTART;TZID=Europe/Paris:20261021T090000\\r\\nDTEND;TZID=Europe/Paris:20261021T093000\\r\\nRRULE:FREQ=DAILY;COUNT=3\\r\\nSUMMARY:Rounds\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR\\r\\n';
const cases = {
  ical: `import { parseICal } from '@dzcalendar/ical'; import { createKernel, loadTemporal } from '@dzcalendar/core';
    await loadTemporal();
    const p = parseICal('${ICS}'); const k = createKernel({ timeZone: 'Europe/Paris', events: p.events });
    export const series = [...k.store.snapshot.allSeries()].length, problems = (k.getProblems()?.problems ?? []).map((x) => x.code);`,
};
let failed = 0;
try {
  for (const [name, code] of Object.entries(cases)) {
    const entry = join(dir, `${name}.mjs`);
    writeFileSync(entry, code);
    const out = join(dir, `${name}-out`);
    await build({
      logLevel: 'silent',
      configFile: false,
      resolve: { alias: { '@dzcalendar/ical': join(dist('ical'), 'index.js'), '@dzcalendar/core/recurrence': join(dist('core'), 'recurrence-entry.js'), '@dzcalendar/core': join(dist('core'), 'index.js'), '@dzcalendar/rrule': join(dist('rrule'), 'index.js') } },
      build: { outDir: out, emptyOutDir: true, minify: true, target: 'es2022', lib: { entry, formats: ['es'], fileName: 'bundle' } },
    });
    const m = await import(pathToFileURL(join(out, 'bundle.js')).href);
    const ok = m.series === 1 && m.problems.length === 0;
    console.log(`${ok ? '✓' : '✗'} ${name}: a repeating event read through it, bundled by Rollup from the dists — series ${m.series}, problems [${m.problems}]`);
    if (!ok) failed++;
    // The polyfill is a chunk of its own, fetched by loadTemporal() where Temporal is missing (node here), never in the
    // bundle itself (18i: tzslot's /lazy entry; one import of tzslot's default entry would put it back for everyone).
    const main = readFileSync(join(out, 'bundle.js'), 'utf8');
    const chunks = readdirSync(out).filter((f) => f.endsWith('.js') && f !== 'bundle.js');
    const apart = !/Non-positive|Cannot convert/.test(main) && chunks.some((f) => /Non-positive/.test(readFileSync(join(out, f), 'utf8')));
    console.log(`${apart ? '✓' : '✗'} ${name}: the Temporal polyfill a chunk apart (${chunks.join(', ') || 'none'}), loaded on demand`);
    if (!apart) failed++;
  }
  // Every entry imported before Temporal is there (Safari, until loadTemporal() resolves): none may read it as it
  // is imported — the suites load the polyfill first, so only this sees such a read (18i review).
  const { config } = await loadConfigFromFile({ command: 'build', mode: 'production' }, join(root, 'vite.config.ts'));
  const toDist = Object.fromEntries(
    Object.entries(config.resolve.alias)
      .filter(([name]) => name.startsWith('@dzcalendar/'))
      .map(([name, file]) => [name, file.replace('/src/', '/dist/').replace(/\.ts$/, '.js')]),
  );
  toDist['@dzcalendar/rrule'] = join(dist('rrule'), 'index.js');
  const ENTRIES = ['core', 'core/recurrence', 'ical', 'slots', 'dom', 'dom/base', 'dom/timegrid', 'dom/daygrid', 'dom/list', 'dom/multimonth', 'dom/toolkit', 'pro', 'pro/model', 'compat-fullcalendar'];
  const entry = join(dir, 'before.mjs');
  writeFileSync(entry, ENTRIES.map((e, i) => `export * as e${i} from '@dzcalendar/${e}';`).join('\n'));
  const out = join(dir, 'before-out');
  await build({
    logLevel: 'silent',
    configFile: false,
    resolve: { alias: toDist },
    build: { outDir: out, emptyOutDir: true, minify: true, target: 'es2022', lib: { entry, formats: ['es'], fileName: 'bundle' }, rollupOptions: { external: ['gsap'] } },
  });
  // Each bundle has its own copy of tzslot's state, and the polyfill is never installed as a global: still nothing.
  if (typeof globalThis.Temporal !== 'undefined') throw new Error('check-entries: run on a node without Temporal of its own');
  try {
    const m = await import(pathToFileURL(join(out, 'bundle.js')).href);
    console.log(`✓ ${Object.keys(m).length} entries imported from the dists with no Temporal loaded: none reads it on import`);
  } catch (e) {
    console.log(`✗ an entry reads Temporal as it is imported: ${String(e).slice(0, 200)}`);
    failed++;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
