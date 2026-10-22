/**
 * The unstyled mode (`look: 'none'`, docs/styling.md): the calendar's CSS
 * split, declaration by declaration, into its structure (what a layout
 * needs: display, grids, positions, sizes, overflow…) and its look
 * (colours, borders, shadows, type, motion). The look's rules are kept for
 * every calendar but one marked `data-dz-look="none"`, with a condition of
 * no weight (`:where`): an application's rules meet the same specificity as
 * before.
 */

/** Properties a layout needs: they stay in an unstyled calendar. Custom properties (`--…`) stay too. */
const STRUCTURE =
  /^(all|appearance|-webkit-appearance|forced-color-adjust|(-webkit-)?print-color-adjust|line-height|opacity|display|position|inset(-.*)?|top|right|bottom|left|(min-|max-)?(width|height|block-size|inline-size)|grid(-.*)?|flex(-.*)?|order|align-.*|justify-.*|place-.*|gap|row-gap|column-gap|overflow(-.*)?|overscroll-behavior(-.*)?|scrollbar-gutter|scroll-.*|z-index|box-sizing|margin(-.*)?|padding(-.*)?|contain(-.*)?|content-visibility|pointer-events|visibility|(-webkit-)?user-select|-webkit-touch-callout|touch-action|white-space|text-overflow|overflow-wrap|word-break|isolation|aspect-ratio|vertical-align|float|clear|writing-mode|direction|unicode-bidi|resize|will-change|transform|translate|clip|clip-path|content|cursor|container(-.*)?|table-layout|list-style(-.*)?)$/;

/**
 * A value of no colour of ours: a reset (0, none, transparent, inherit…) or
 * the platform's own colours (Canvas, CanvasText…). Such a declaration stays
 * in an unstyled calendar: a button reset to plain text, a sticky head or a
 * dialog filled with the page's colour (the styled look, after it, puts the
 * theme's).
 */
const NEUTRAL = /^(?:[\s,/()%.\d-]|0|none|transparent|inherit|initial|unset|revert|currentcolor|solid|in|srgb|oklab|color-mix|canvas|canvastext|field|fieldtext|buttonface|buttontext|buttonborder|graytext|highlight|highlighttext|linktext|mark|marktext|accentcolor|accentcolortext|!important)+$/i;

/** Properties that carry a colour of ours: a neutral value there (a reset, Canvas) stays. */
const COLOURED = /^(color|background(-color|-image)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-(color|style|width))?|outline(-(color|style|width))?|box-shadow|text-decoration(-color)?|fill|stroke|caret-color|accent-color)$/;

/** Only outside an unstyled calendar: no weight, and before a pseudo-element (which must end a selector). */
const GUARD = ':where(:not([data-dz-look="none"], [data-dz-look="none"] *))';

function guarded(selectors: string): string {
  return splitTop(selectors, ',')
    .map((s) => {
      const sel = s.trim();
      const pseudo = sel.search(/::[a-z-]+|:(?:before|after|first-line|first-letter)\b/);
      return pseudo < 0 ? sel + GUARD : sel.slice(0, pseudo) + GUARD + sel.slice(pseudo);
    })
    .join(', ');
}

/** `text` split on `sep` outside parentheses, brackets and quoted strings. */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(from, i));
      from = i + 1;
    }
  }
  out.push(text.slice(from));
  return out;
}

/** A rule's declarations split into structure and look (a string inside a value — `content: 'x'` — kept whole). */
function splitDeclarations(body: string): { structure: string; look: string } {
  const structure: string[] = [];
  const look: string[] = [];
  for (const d of splitTop(body, ';')) {
    const decl = d.trim();
    if (!decl) continue;
    const colon = decl.indexOf(':');
    const prop = colon < 0 ? '' : decl.slice(0, colon).trim().toLowerCase();
    const value = colon < 0 ? '' : decl.slice(colon + 1).trim();
    // A neutral value counts only where a colour would be ours (colours, fills, borders) or for a font reset; a weight or a radius in digits is a look.
    const neutral = (COLOURED.test(prop) && NEUTRAL.test(value)) || (/^font(-family)?$/.test(prop) && /^inherit$/i.test(value));
    (prop.startsWith('--') || STRUCTURE.test(prop) || neutral ? structure : look).push(decl);
  }
  return { structure: structure.join('; '), look: look.join('; ') };
}

/** The block's text from `open` (just after its `{`) to its matching `}`. */
function blockEnd(css: string, open: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return css.length;
}

/** Rules and at-rules walked; a style rule split in two; `@media`, `@supports`, `@layer`, `@container` walked into; others kept. */
function walk(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    const semi = css.indexOf(';', i);
    // A statement without a block (`@layer a, b;`, `@import …;`).
    if (semi >= 0 && (open < 0 || semi < open) && css.slice(i, semi).trim().startsWith('@')) {
      out += css.slice(i, semi + 1);
      i = semi + 1;
      continue;
    }
    if (open < 0) {
      out += css.slice(i);
      break;
    }
    const head = css.slice(i, open).trim();
    const close = blockEnd(css, open + 1);
    const body = css.slice(open + 1, close);
    if (head.startsWith('@')) {
      out += /^@(media|supports|layer|container)\b/.test(head) ? `${head} {${walk(body)}}\n` : `${head} {${body}}\n`;
    } else if (head) {
      const { structure, look } = splitDeclarations(body);
      if (structure) out += `${head} { ${structure}; }\n`;
      if (look) out += `${guarded(head)} { ${look}; }\n`;
    }
    i = close + 1;
  }
  return out;
}

const DONE = new Map<string, string>();

/** The calendar's CSS with its look guarded (the same rules everywhere but in an unstyled calendar). Memoized. */
export function withLookGuard(css: string): string {
  // Guarded already (a sheet written again, a page's own call): as it is.
  if (css.includes(GUARD)) return css;
  let out = DONE.get(css);
  if (out === undefined) {
    out = walk(css.replace(/\/\*[\s\S]*?\*\//g, ''));
    DONE.set(css, out);
  }
  return out;
}
