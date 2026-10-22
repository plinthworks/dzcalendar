import { withLookGuard } from './render/look.js';
import { ensureStyles, unlayered, isGuarded } from './styles.js';

/** A colour, or a (light, dark) pair that follows the calendar's scheme. */
export type ThemeColor = string | readonly [light: string, dark: string];

/**
 * A theme of one's own: tzslot's palette (shared with its pickers) and the
 * calendar's own tokens. Anything left out keeps the theme's value.
 */
export interface ThemeTokens {
  readonly bg?: ThemeColor;
  readonly bgRaised?: ThemeColor;
  readonly fg?: ThemeColor;
  readonly fgMuted?: ThemeColor;
  readonly border?: ThemeColor;
  readonly accent?: ThemeColor;
  readonly accentFg?: ThemeColor;
  readonly danger?: ThemeColor;
  readonly warning?: ThemeColor;
  readonly radius?: string;
  readonly font?: string;
  readonly todayBg?: ThemeColor;
  readonly now?: ThemeColor;
  readonly eventBg?: ThemeColor;
  readonly eventFg?: ThemeColor;
  readonly eventAccent?: ThemeColor;
  /** Named tones for events (`tone: 'brand'` → `--dz-tone-brand`). */
  readonly tones?: Readonly<Record<string, ThemeColor>>;
}

const PALETTE = new Set(['bg', 'bgRaised', 'fg', 'fgMuted', 'border', 'accent', 'accentFg', 'danger', 'warning', 'radius', 'font']);
/** The calendar's own tokens a theme may set (everything else is refused: a key becomes a property name). */
const OWN = new Set(['todayBg', 'now', 'eventBg', 'eventFg', 'eventAccent']);
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** Nothing that could close the rule or open another: a configuration error, said at once. */
const safe = (v: string, what: string): string => {
  if (/[;{}<>\\\n]|\/\*|url\(/i.test(v)) throw new RangeError(`defineTheme: ${what} is not a CSS value: ${v}`);
  return v;
};
/** One side of a colour: 0 light, 1 dark (a single value is both). */
const sideOf = (c: ThemeColor, i: 0 | 1, what: string) => safe(typeof c === 'string' ? c : c[i], what);

const THEMES = new Map<string, string>();

/** The ready-made families of @dzcalendar/theme (its `$themes`, plus 'standard'). */
export const THEME_NAMES = ['standard', 'slate', 'night', 'pastel', 'frost', 'solar', 'contrast'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

/** True for a family of the theme CSS or one made with `defineTheme`. */
export const isKnownTheme = (name: string): boolean => (THEME_NAMES as readonly string[]).includes(name) || THEMES.has(name);

/** A theme's CSS (made with `defineTheme`), to include yourself under `injectStyles: false`. */
export function themeCss(name: string): string | undefined {
  return THEMES.get(name);
}

/**
 * `defineTheme('clinic', { accent: ['#0a7d5a', '#3ddc97'] })`, then
 * `theme: 'clinic'`: the calendar's ready-made families are made the same way.
 * In the `dzcalendar.theme` layer, so a page's own rules still win.
 */
export function defineTheme(name: string, tokens: ThemeTokens): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new RangeError(`defineTheme: a theme name is lowercase letters, digits and dashes: ${name}`);
  if ((THEME_NAMES as readonly string[]).includes(name)) throw new RangeError(`defineTheme: ${name} is a ready-made family; give yours another name`);
  // Declarations for one side (0 light, 1 dark). The palette goes to --dzp-* (the family's
  // defaults: a page's own --tz-* still wins), the calendar's own tokens to --dz-*.
  const decls = (side: 0 | 1): string => {
    const out: string[] = [];
    for (const [k, v] of Object.entries(tokens)) {
      if (v === undefined) continue;
      if (k === 'tones') {
        for (const [tone, c] of Object.entries(v as Record<string, ThemeColor>)) {
          if (!/^[a-z0-9_-]+$/i.test(tone)) throw new RangeError(`defineTheme: tone names are letters, digits, _ and -: ${tone}`);
          out.push(`--dz-tone-${tone}: ${sideOf(c, side, `tones.${tone}`)};`);
        }
        continue;
      }
      if (!PALETTE.has(k) && !OWN.has(k)) throw new RangeError(`defineTheme: unknown token ${k}`);
      out.push(`--${PALETTE.has(k) ? 'dzp' : 'dz'}-${kebab(k)}: ${sideOf(v as ThemeColor, side, k)};`);
    }
    return out.join(' ');
  };
  const light = decls(0);
  const dark = decls(1);
  // The same switches as the theme's families: the calendar's scheme, the page's [data-theme], the system.
  const sel = `.dz-cal[data-dz-theme='${name}']`;
  const rules = [
    `${sel} { ${light} }`,
    `@media (prefers-color-scheme: dark) { ${sel}:not([data-dz-scheme='light']) { ${dark} } }`,
    `[data-theme='light'] ${sel}:not([data-dz-scheme='dark']) { ${light} }`,
    `[data-theme='dark'] ${sel}:not([data-dz-scheme='light']) { ${dark} }`,
    `${sel}[data-dz-scheme='light'] { ${light} }`,
    `${sel}[data-dz-scheme='dark'] { ${dark} }`,
  ].join('\n');
  const css = `@layer dzcalendar.base, dzcalendar.theme;\n@layer dzcalendar.theme {\n${rules}\n}`;
  THEMES.set(name, css);
  // Defined again while calendars use it: every sheet it was put in follows now (documents and shadow roots).
  for (const ref of ROOTS.get(name) ?? []) {
    const root = ref.deref();
    const style = root?.querySelector<HTMLStyleElement>(`style[data-dzcalendar="theme-${name}"]`);
    if (style) refresh(style, css);
  }
}

/** Where each theme's sheet went: a document's head, or a shadow root. */
const ROOTS = new Map<string, Set<WeakRef<ParentNode>>>();

/** The CSS of a theme defined with `defineTheme`, inserted once beside the calendar. */
export function ensureTheme(host: HTMLElement, name: string, layers = true): void {
  const css = THEMES.get(name);
  if (!css) return;
  ensureStyles(host, `theme-${name}`, css, layers);
  const where = host.getRootNode() instanceof ShadowRoot ? (host.getRootNode() as ShadowRoot) : host.ownerDocument.head;
  const set = ROOTS.get(name) ?? new Set<WeakRef<ParentNode>>();
  if (![...set].some((r) => r.deref() === where)) set.add(new WeakRef(where));
  ROOTS.set(name, set);
  // Defined again since: the new tokens.
  const style = where.querySelector<HTMLStyleElement>(`style[data-dzcalendar="theme-${name}"]`);
  if (style) refresh(style, css);
}

/** A theme's sheet given its CSS again, in the form it was put in (layered or not). */
function refresh(style: HTMLStyleElement, css: string): void {
  // Where an unstyled calendar is, its sheets are guarded: compared, and written again, guarded.
  const guarded = isGuarded(style.parentNode) ? withLookGuard(css) : css;
  const text = style.dataset['dzLayers'] === 'off' ? unlayered(guarded) : guarded;
  if (style.textContent !== text) style.textContent = text;
}
