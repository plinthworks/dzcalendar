/**
 * Every option of createCalendar has its page in English and in French (owner,
 * 18j), its facts generated from the types: the generated file is what the
 * types say; each written page names its option and every member of a group;
 * an option without pages yet is listed as pending, and nothing else is.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a script of the repository, plain JavaScript
import { generate, GROUPS } from '../../scripts/gen-options.mjs';
import { FACTS } from '../src/i18n/facts';

const site = fileURLToPath(new URL('..', import.meta.url));
const docs = join(site, 'src', 'content', 'docs');
const shipped = JSON.parse(readFileSync(join(site, 'src', 'generated', 'options.json'), 'utf8')) as { options: { name: string; default: { token?: string } | null; members?: { name: string; default: { token?: string } | null }[] }[] };
const pending: string[] = JSON.parse(readFileSync(join(site, 'src', 'data', 'pending-options.json'), 'utf8')).pending;
const slug = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const page = (lang: '' | 'fr', name: string) => join(docs, lang, 'options', `${slug(name)}.mdx`);
const factsOn = (text: string) => [...text.matchAll(/<OptionFacts name="([^"]+)"/g)].map((m) => m[1]);

describe('the option pages (18j)', () => {
  it('src/generated/options.json is what the types say (npm run gen:options)', () => {
    expect(shipped.options.length).toBeGreaterThan(50);
    expect(JSON.stringify(generate())).toBe(JSON.stringify(shipped));
  }, 60_000);

  it('every option has its two pages or is pending — never both, nothing pending that does not exist', () => {
    const names = shipped.options.map((o) => o.name);
    expect(pending.filter((n) => !names.includes(n))).toEqual([]);
    const missing = names.filter((n) => !pending.includes(n) && (!existsSync(page('', n)) || !existsSync(page('fr', n))));
    const writtenYetPending = pending.filter((n) => existsSync(page('', n)) || existsSync(page('fr', n)));
    expect({ missing, writtenYetPending }).toEqual({ missing: [], writtenYetPending: [] });
    expect(names.filter((n) => !pending.includes(n)).length + pending.length).toBe(names.length);
  });

  it('no page for an option that does not exist', () => {
    for (const lang of ['', 'fr'] as const) {
      const slugs = readdirSync(join(docs, lang, 'options')).filter((f) => f.endsWith('.mdx') && f !== 'index.mdx').map((f) => f.replace('.mdx', ''));
      expect(slugs.filter((s) => !shipped.options.some((o) => slug(o.name) === s))).toEqual([]);
    }
  });

  it('each written page: titled with its option, its facts and its members’ facts, the same in both languages, an example in the four flavours', () => {
    const wrong: string[] = [];
    for (const o of shipped.options.filter((x) => !pending.includes(x.name))) {
      const en = readFileSync(page('', o.name), 'utf8');
      const fr = readFileSync(page('fr', o.name), 'utf8');
      const expected = [o.name, ...(GROUPS.includes(o.name) ? (o.members ?? []).map((m) => `${o.name}.${m.name}`) : [])].sort();
      for (const [lang, text] of [['en', en], ['fr', fr]] as const) {
        if (!new RegExp(`^---\\ntitle: ${o.name}\\n`).test(text)) wrong.push(`${lang} ${o.name}: title`);
        if (JSON.stringify([...new Set(factsOn(text))].sort()) !== JSON.stringify(expected)) wrong.push(`${lang} ${o.name}: facts ${JSON.stringify(factsOn(text))}`);
        // A tab with code the examples' compiler reads (scripts/docs-examples.mjs), not only a tab.
        for (const slot of ['js', 'angular', 'react', 'vue']) if (!new RegExp(`<Fragment slot="${slot}">\\s*\`\`\`(ts|tsx|vue)\\n`).test(text)) wrong.push(`${lang} ${o.name}: no ${slot} example`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('a link from an option page to another option goes to a page that is written (a pending one would be a 404)', () => {
    const broken: string[] = [];
    for (const lang of ['', 'fr'] as const) {
      const dir = join(docs, lang, 'options');
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.mdx'))) {
        for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/\]\(\.\.\/([a-z-]+)\/(?:#[^)]*)?\)/g)) {
          if (!existsSync(join(dir, `${m[1]}.mdx`))) broken.push(`${lang || 'en'} ${f} → ${m[1]}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('every default the code cannot write has its words in both languages', () => {
    const tokens = shipped.options.flatMap((o) => [o.default, ...(o.members ?? []).map((m) => m.default)]).flatMap((d) => (d?.token ? [d.token] : []));
    expect(tokens.filter((t) => !FACTS.en.tokens[t] || !FACTS.fr.tokens[t])).toEqual([]);
  });
});
