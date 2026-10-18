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

  it('unlayered.css is what unlayered.scss produces: the same rules, outside any layer', () => {
    const plain = readFileSync(`${dir}/unlayered.css`, 'utf8');
    const fresh = execFileSync(`${dir}/../../node_modules/.bin/sass`, ['--no-source-map', '--style=expanded', `${dir}/unlayered.scss`], { encoding: 'utf8' });
    expect(plain.trim()).toBe(fresh.trim());
    expect(plain).not.toContain('@layer');
    expect(plain).toContain('.dz-cal[data-dz-theme=slate] {');
    expect(readFileSync(`${dir}/tailwind3.css`, 'utf8')).toContain("@import './unlayered.css';");
  });

  it('data-theme forces a scheme on any subtree', () => {
    expect(css).toMatch(/\[data-theme=light\]\s*\{\s*--tz-color-scheme: light;/);
    expect(css).toMatch(/\[data-theme=dark\]\s*\{\s*--tz-color-scheme: dark;/);
  });
});
