/**
 * The theme's CSS: the SCSS compiled by Sass, then its look guarded as the
 * calendar's own sheets are (`look: 'none'`, packages/dom/src/render/look.ts —
 * one implementation, transpiled here). `npm run build:theme` writes it; the
 * theme's test checks the files are what this produces.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { transform } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const theme = join(root, 'packages/theme');

async function guard() {
  const ts = readFileSync(join(root, 'packages/dom/src/render/look.ts'), 'utf8');
  const { code } = await transform(ts, { loader: 'ts', format: 'esm' });
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).withLookGuard;
}

/** One file of the theme as it should be: `dzcalendar` or `unlayered`. */
export async function themeCss(name) {
  const sass = execFileSync(join(root, 'node_modules/.bin/sass'), ['--no-source-map', '--style=expanded', join(theme, `${name}.scss`)], { encoding: 'utf8' });
  return (await guard())(sass);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const name of ['dzcalendar', 'unlayered']) writeFileSync(join(theme, `${name}.css`), await themeCss(name));
  console.log('theme: dzcalendar.css, unlayered.css');
}
