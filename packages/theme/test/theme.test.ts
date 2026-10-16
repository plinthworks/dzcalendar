import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(`${dir}/dzcalendar.css`, 'utf8');
const tzslotPalette = ['bg', 'bg-raised', 'fg', 'fg-muted', 'border', 'accent', 'accent-fg', 'danger', 'warning'];

describe('@dzcalendar/theme', () => {
  it('the compiled CSS is what the SCSS produces — one theme, not two', () => {
    const fresh = execFileSync(`${dir}/../../node_modules/.bin/sass`, ['--no-source-map', '--style=expanded', `${dir}/dzcalendar.scss`], { encoding: 'utf8' });
    expect(css.trim()).toBe(fresh.trim());
  });

  it('declares tzslot’s nine palette colours under their tzslot names, light and dark', () => {
    for (const name of tzslotPalette) expect(css).toMatch(new RegExp(`--tz-${name}: light-dark\\(`));
  });

  it('the palette values are tzslot’s own, so both libraries look alike', () => {
    expect(css).toContain('--tz-accent: light-dark(#2563eb, #60a5fa)');
    expect(css).toContain('--tz-bg: light-dark(#ffffff, #18181b)');
  });

  it('named tones exist and adapt to the scheme', () => {
    expect(css).toContain('--dz-tone-green: light-dark(#15803d, #4ade80)');
  });

  it('data-theme forces a scheme on any subtree', () => {
    expect(css).toMatch(/\[data-theme=light\]\s*\{\s*--tz-color-scheme: light;/);
    expect(css).toMatch(/\[data-theme=dark\]\s*\{\s*--tz-color-scheme: dark;/);
  });
});
