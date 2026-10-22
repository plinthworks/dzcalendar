/**
 * The styling contract (docs/styling.md): every `.dz-*` part the calendar
 * draws and every `--dz-*` token, found in the sources — what the test
 * holds the document to (a part added, renamed or dropped must be said there).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// The element's `dz-*` words are its DOM events' names, not classes: it draws nothing of its own.
const SOURCES = ['packages/dom/src', 'packages/pro/src', 'packages/motion-gsap/src', 'packages/theme/dzcalendar.scss'];
/** Words with the prefix that are not classes: events, ids, attributes, comment markers. */
const NOT_CLASSES = new Set(['dz-drop', 'dz-header', 'dz-pop-*', 'dz-editor-*']);
/** Tokens named in comments as examples (a tone, the reading order), not read. */
const NOT_TOKENS = new Set();
/** The calendar's own data-* hooks, not states for a page (positions, keys, its bookkeeping). */
export const INTERNAL_DATA = new Set(['key', 'segment', 'col', 'resize-end', 'resize-start', 'dz-classes', 'item', 'button', 'tick', 'kind']);

const files = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => files(join(p, f))) : /\.(ts|scss)$/.test(p) && !p.endsWith('.d.ts') ? [p] : []);

export function inventory(root) {
  const classes = new Map();
  const tokens = new Map();
  const data = new Map();
  const add = (map, name, file) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(relative(root, file));
  };
  for (const src of SOURCES) {
    for (const f of files(join(root, src))) {
      // Comments name parts as examples: they are not a use.
      const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');
      // A class: the prefix not glued to a word, a dash, a bracket or a quote of an attribute name (data-dz-…).
      for (const m of text.matchAll(/(?<![\w\-[])dz-[a-z0-9]+(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--(?:[a-z0-9]+(?:-[a-z0-9]+)*|\$\{))?(?:-\$\{)?/g)) {
        let name = m[0];
        if (name.endsWith('${')) name = name.slice(0, -2).replace(/-*$/, '') + (name.includes('--') ? '--*' : '-*');
        if (NOT_CLASSES.has(name)) continue;
        add(classes, name, f);
      }
      // data-* the calendar writes: as an attribute name, or through dataset (camelCase).
      for (const m of text.matchAll(/(?:setAttribute|toggleAttribute|removeAttribute|hasAttribute)\(\s*[`'"]data-([a-z0-9-]+)|\[data-([a-z0-9-]+)|state\([^,]+,\s*'([a-z-]+)'|dataset\[\s*'([a-zA-Z]+)'\]|dataset\.([a-zA-Z]+)/g)) {
        const raw = m[1] ?? m[2] ?? m[3] ?? (m[4] ?? m[5]).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
        add(data, raw, f);
      }
      for (const m of text.matchAll(/--dz-[a-z0-9]+(?:-[a-z0-9]+)*(-\$\{|-#\{)?/g)) {
        const name = m[1] ? m[0].slice(0, -m[1].length) + '-*' : m[0];
        if (!NOT_TOKENS.has(name)) add(tokens, name, f);
      }
    }
  }
  return { classes, tokens, data };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { classes, tokens } = inventory(process.cwd());
  for (const [k, v] of [...classes].sort()) console.log(`.${k}\t${[...v].join(' ')}`);
  console.log(`-- ${classes.size} parts`);
  for (const [k, v] of [...tokens].sort()) console.log(`${k}\t${[...v].join(' ')}`);
  console.log(`-- ${tokens.size} tokens`);
}
