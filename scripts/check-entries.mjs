/**
 * The entries that plug the recurrence engine in on import (ical, the Pro editor, the compat, the element) keep it
 * once an application is bundled from the dists by Rollup (Vite), which skips a side-effect-free barrel: a repeating
 * event read through them must still be a series. Run after `npm run build` (18i review: Vite had dropped it).
 */
import { build } from 'vite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = (p) => join(root, 'packages', p, 'dist');
const dir = mkdtempSync(join(tmpdir(), 'dz-entries-'));
const ICS = 'BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nBEGIN:VEVENT\\r\\nUID:r1\\r\\nDTSTART;TZID=Europe/Paris:20261021T090000\\r\\nDTEND;TZID=Europe/Paris:20261021T093000\\r\\nRRULE:FREQ=DAILY;COUNT=3\\r\\nSUMMARY:Rounds\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR\\r\\n';
const cases = {
  ical: `import { parseICal } from '@dzcalendar/ical'; import { createKernel } from '@dzcalendar/core';
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
      build: { outDir: out, emptyOutDir: true, minify: true, lib: { entry, formats: ['es'], fileName: 'bundle' } },
    });
    const m = await import(pathToFileURL(join(out, 'bundle.js')).href);
    const ok = m.series === 1 && m.problems.length === 0;
    console.log(`${ok ? '✓' : '✗'} ${name}: a repeating event read through it, bundled by Rollup from the dists — series ${m.series}, problems [${m.problems}]`);
    if (!ok) failed++;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
