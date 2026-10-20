#!/usr/bin/env node
/**
 * dz-migrate [paths…] [--write]
 *
 * Reads the TypeScript, JavaScript and Angular template files under the
 * paths (default: src), rewrites what uses FullCalendar, and reports each
 * file and what needs a person (marked `// dz-migrate:` in the code). Without
 * --write, nothing is written: the report says what would change.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { migrateSource } from './source.js';
import { migrateTemplate } from './template.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('dz-migrate [paths…] [--write]\n\nRewrites what uses FullCalendar under the paths (default: src) for DzCalendar.\nWithout --write nothing is written: the report says what would change.\nWhat needs a person is marked // dz-migrate: in the code.');
  process.exit(0);
}
const write = args.includes('--write');
const roots = args.filter((a) => !a.startsWith('--'));
const SKIP = new Set(['node_modules', 'dist', '.angular', '.git']);
const files: string[] = [];
const walk = (p: string) => {
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) if (!SKIP.has(f)) walk(join(p, f));
  } else if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html'].includes(extname(p)) && !p.endsWith('.d.ts')) files.push(p);
};
for (const r of roots.length > 0 ? roots : ['src']) walk(r);

let changed = 0;
let marked = 0;
let failed = 0;
const imported = new Set<string>();
for (const f of files) {
  let r: Awaited<ReturnType<typeof migrateSource>>;
  try {
    const text = readFileSync(f, 'utf8');
    r = extname(f) === '.html' ? await migrateTemplate(text, f) : await migrateSource(text, f);
  } catch (e) {
    // One file that cannot be read or parsed does not stop the others.
    failed++;
    console.log(`failed  ${relative(process.cwd(), f)}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    continue;
  }
  for (const m of r.text.matchAll(/from ["'](@dzcalendar\/[\w-]+)|import ["'](@dzcalendar\/[\w-]+)/g)) imported.add(m[1] ?? m[2]!);
  if (!r.changed && r.notes.length === 0) continue;
  changed += r.changed ? 1 : 0;
  marked += r.notes.length;
  console.log(`${r.changed ? (write ? 'rewritten' : 'would change') : 'notes'}  ${relative(process.cwd(), f)}`);
  for (const n of r.notes) console.log(`    · ${n}`);
  if (write && r.changed) writeFileSync(f, r.text);
}
const install = [...new Set(['@dzcalendar/core', '@dzcalendar/dom', '@dzcalendar/theme', ...imported])].sort();
console.log(`\n${changed} file(s) ${write ? 'rewritten' : 'to rewrite (run again with --write)'}, ${marked} note(s)${failed ? `, ${failed} failed` : ''}. Then: npm install ${install.join(' ')}, and remove @fullcalendar/*.`);
process.exitCode = failed > 0 ? 1 : 0;
