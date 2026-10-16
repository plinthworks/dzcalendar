/**
 * The DOM's structural CSS ships as a string (`DZ_CSS`, injected at runtime).
 * Written readable — comments say why each rule is there — and minified for
 * what an application downloads: by `npm run build` in dist/, and by
 * `npm run size` so the budget measures what ships.
 */
import { transform } from 'esbuild';

const LITERAL = /export const DZ_CSS = `([^`$]*)`;/;

/** `source` with its DZ_CSS template literal minified (unchanged when there is none). */
export async function minifyCssLiteral(source) {
  const m = LITERAL.exec(source);
  if (!m) {
    // Never ship it unminified in silence: a `${…}` or a backtick inside the CSS breaks the pattern.
    if (source.includes('export const DZ_CSS')) throw new Error('css-literal: DZ_CSS is not a plain template literal any more (no ${} or backtick allowed)');
    return source;
  }
  const css = (await transform(m[1], { loader: 'css', minify: true })).code.trim();
  return source.replace(m[0], `export const DZ_CSS = ${JSON.stringify(css)};`);
}
