import { describe, it, expect } from 'vitest';
// @ts-expect-error -- a plain script, no types
import { themeCss } from '../../../scripts/build-theme.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(`${dir}/dzcalendar.css`, 'utf8');
const tzslotPalette = ['bg', 'bg-raised', 'fg', 'fg-muted', 'border', 'accent', 'accent-fg', 'danger', 'warning'];

describe('@dzcalendar/theme', () => {
  it('the compiled CSS is what the SCSS produces — one theme, not two', async () => {
    // The SCSS compiled, its look guarded for `look: 'none'` (scripts/build-theme.mjs).
    expect(css.trim()).toBe((await themeCss('dzcalendar')).trim());
  });

  // The family's values are defaults (--dzp-*): the calendar reads --tz-* first, so a page's own palette wins.
  const block = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };
  const light = block(".dz-cal[data-dz-theme=standard]");
  const dark = block(".dz-cal[data-dz-theme=standard][data-dz-scheme=dark]");

  it('gives tzslot’s nine palette colours as defaults, light and dark, without light-dark() (Safari 15.4)', () => {
    for (const name of tzslotPalette) {
      expect(light).toMatch(new RegExp(`--dzp-${name}: #`));
      expect(dark).toMatch(new RegExp(`--dzp-${name}: #`));
    }
    expect(css).not.toContain('light-dark(');
    expect(css).not.toMatch(/--tz-(bg|fg|accent|border)\b[^-]*:/);
  });

  it('the palette values are tzslot’s own, so both libraries look alike', () => {
    expect(light).toContain('--dzp-accent: #2563eb');
    expect(dark).toContain('--dzp-accent: #60a5fa');
    expect(light).toContain('--dzp-bg: #ffffff');
    expect(dark).toContain('--dzp-bg: #18181b');
  });

  it('named tones exist and adapt to the scheme', () => {
    expect(light).toContain('--dz-tone-green: #15803d');
    expect(dark).toContain('--dz-tone-green: #4ade80');
  });

  it('the system’s dark mode and [data-theme] switch the family, unless the calendar forces its scheme', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*\.dz-cal\[data-dz-theme=standard\]:not\(\[data-dz-scheme=light\]\)/);
    expect(css).toContain('[data-theme=dark] .dz-cal[data-dz-theme=standard]:not([data-dz-scheme=light])');
  });

  it('unlayered.css is what unlayered.scss produces: the same rules, outside any layer', async () => {
    const plain = readFileSync(`${dir}/unlayered.css`, 'utf8');
    expect(plain.trim()).toBe((await themeCss('unlayered')).trim());
    expect(plain).not.toContain('@layer');
    expect(plain).toContain('.dz-cal[data-dz-theme=slate] {');
    expect(readFileSync(`${dir}/tailwind3.css`, 'utf8')).toContain("@import './unlayered.css';");
  });

  it('data-theme forces a scheme on any subtree', () => {
    expect(css).toMatch(/\[data-theme=light\]\s*\{\s*--tz-color-scheme: light;/);
    expect(css).toMatch(/\[data-theme=dark\]\s*\{\s*--tz-color-scheme: dark;/);
  });
});

describe("eventStyle 'solid': every tone readable on every theme (Sehhaty, 2026-10-20)", () => {
  // The solid block is the tone, its text the theme's background (styles.ts): their contrast, WCAG 2.x, AA for text is 4.5:1.
  const scss = readFileSync(new URL('../dzcalendar.scss', import.meta.url), 'utf8');
  const pairs = (block: string) => [...block.matchAll(/'?([\w-]+)'?:\s*\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)].map((m) => [m[1]!, m[2]!, m[3]!] as const);
  const tones = pairs(/\$tones:\s*\(([\s\S]*?)\)\s*!default/.exec(scss)![1]!);
  const bgs = [['standard', ...(/\$bg:\s*\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/i.exec(scss)!.slice(1, 3))], ...[...scss.matchAll(/'([\w-]+)':\s*\(\s*bg:\s*\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)].map((m) => [m[1]!, m[2]!, m[3]!])] as [string, string, string][];
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  it('six tones, the standard background and the families read from the stylesheet', () => {
    expect([tones.length, bgs.length >= 2]).toEqual([6, true]);
  });
  it('light and dark: each tone against the text written on it (--dz-on-tone) ≥ 4.5', () => {
    const [onLight, onDark] = /\$on-tone:\s*\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/i.exec(scss)!.slice(1, 3) as [string, string];
    const low = tones.flatMap(([tone, tl, td]) => [[`light ${tone}`, ratio(tl, onLight)], [`dark ${tone}`, ratio(td, onDark)]] as const).filter(([, r]) => r < 4.5).map(([n, r]) => `${n} ${r.toFixed(2)}`);
    expect(low).toEqual([]);
  });
  it('the tones are the same on every family (the families change backgrounds, not tones): one check holds for all', () => {
    expect(scss.match(/\$tones:/g)?.length).toBe(1);
  });
});
