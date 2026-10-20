/**
 * `npm run gen:llms`: site/llms.txt (an index, llmstxt.org) and
 * site/llms-full.txt (the whole documentation in one file) from docs/ and the
 * packages' manifests. `--check` fails when either differs.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const REPO = 'https://raw.githubusercontent.com/plinthworks/dzcalendar/main';
/** In reading order; notes for other projects stay out. */
const DOCS = ['getting-started', 'angular', 'react', 'vue', 'element', 'resources', 'timeline', 'slots', 'editor', 'export', 'motion', 'i18n', 'theming', 'migrating-from-fullcalendar'];
const PACKAGES = ['core', 'dom', 'theme', 'rrule', 'ical', 'slots', 'angular', 'react', 'vue', 'element', 'pro', 'pro-angular', 'pro-react', 'pro-vue', 'motion-gsap', 'compat-fullcalendar', 'migrate'];

const RULES = `Rules an assistant writing DzCalendar code should keep:

- Moments are Temporal values or ISO 8601 strings with IANA zones — \`2026-10-21T09:00[Europe/Paris]\`, a date \`2026-10-21\` for all-day. Never a JS \`Date\` (it is refused: \`date-object-rejected\`).
- Every event keeps its own zone; the calendar draws in its \`timeZone\`. Days of 23 h or 25 h are shown for what they are: the missing hour marked, the repeated hour twice, real lengths said; \`timeGrid: { axis: 'elapsed' }\` draws them to scale.
- Weekdays are ISO: Monday = 1 … Sunday = 7.
- Every change is a command (\`calendar.run({ type: 'event.move', … })\`), plain data described by \`commands.schema.json\`; undo and redo come with it.
- Bad data never throws: an event or a command that cannot be taken becomes a Problem \`{ code, severity, path, detail }\` (\`run()\` returns \`{ ok: false, problems }\`; \`kernel.getProblems()?.problems\` for the last events loaded), every guess a warning. Options are the exception: \`createCalendar\` and \`update\` throw a \`RangeError\` on one they cannot take.
- Colours are tones (\`tone: 'amber'\`; the themes have blue, green, red, amber, violet, slate), themes decide what they look like.`;

/** Where a doc's first paragraph does not say what it holds. */
const SUMMARY = {
  motion: 'Animation hooks on every change (WAAPI by default, nothing with prefers-reduced-motion) and the optional GSAP adapter with its presets and effects.',
  i18n: 'Locales: the words of the calendar (English and French built in; Arabic, Spanish, German as imports; defineLocale), right to left, Hijri and other display calendars.',
  'migrating-from-fullcalendar': 'dz-migrate rewrites FullCalendar code (imports, new Calendar, calls, Angular templates); @dzcalendar/compat-fullcalendar translates its options at run time, every guess said.',
};
const title = (text) => text.split('\n')[0].replace(/^#\s*/, '').replace(/`/g, '');
/** A doc's first paragraph after its title, as one line. */
const summary = (text) => text.split(/\n\s*\n/).slice(1).find((p) => !p.startsWith('```') && !p.startsWith('#'))?.replace(/\s+/g, ' ').trim() ?? '';
const manifest = (p) => JSON.parse(readFileSync(join(root, 'packages', p, 'package.json'), 'utf8'));

export function generate() {
  const docs = DOCS.map((d) => ({ d, text: readFileSync(join(root, 'docs', `${d}.md`), 'utf8') }));
  const present = new Set(readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)));
  for (const { d } of docs) if (!present.has(d)) throw new Error(`docs/${d}.md is missing`);
  const packages = PACKAGES.map((p) => `- \`${manifest(p).name}\`: ${manifest(p).description}`).join('\n');
  const head = `# DzCalendar

> A calendar and scheduler written on Temporal: every event keeps its own time zone, days of 23 h, 25 h or 23 h 30 are shown for what they are, recurrence is RFC 5545, and every change is a serializable command. Vanilla JS, Angular, React, Vue and a Web Component; resources, a timeline, bookable slots, an editor, printing and exports. MIT.

${RULES}`;
  const index = `${head}

## Docs

${docs.map(({ d, text }) => `- [${title(text)}](${REPO}/docs/${d}.md): ${SUMMARY[d] ?? summary(text)}`).join('\n')}

- [commands.schema.json](${REPO}/site/commands.schema.json): every command, an event and a slot query as JSON Schema — what \`calendar.run()\` and \`findSlots()\` take (also \`@dzcalendar/core/commands.schema.json\` in the published package).

## Packages

${packages}

## Optional

- [llms-full.txt](${REPO}/site/llms-full.txt): this documentation in one file.
`;
  const full = `${head}

## Packages

${packages}

${docs.map(({ d, text }) => `---\n\n<!-- docs/${d}.md -->\n\n${text.trim()}\n`).join('\n')}`;
  return { 'llms.txt': index, 'llms-full.txt': full };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = generate();
  let stale = 0;
  for (const [file, text] of Object.entries(out)) {
    const path = join(root, 'site', file);
    if (process.argv.includes('--check')) {
      let shipped = '';
      try {
        shipped = readFileSync(path, 'utf8');
      } catch {}
      if (shipped !== text) (stale++, console.error(`site/${file} differs from docs/: run npm run gen:llms`));
    } else writeFileSync(path, text);
  }
  if (stale) process.exit(1);
  console.log(process.argv.includes('--check') ? '✓ site/llms.txt and llms-full.txt match docs/' : `site/llms.txt (${out['llms.txt'].length} chars), site/llms-full.txt (${out['llms-full.txt'].length} chars)`);
}
