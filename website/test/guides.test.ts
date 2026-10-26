/**
 * The guides (18j-3, owner: by tasks, the site is the reference): a guide
 * written says the same in English and French — its sections, its examples,
 * its demos, the pages it links to — and every link it gives, anchor
 * included, lands on something. A guide not written yet still says so.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'content', 'docs');
/** The guides written so far, batch by batch; the others are still stubs. */
const WRITTEN = ['events', 'event-sources', 'recurrence'];
const STUB = /:::note\[(Being written|En cours de rédaction)\]/;

const guides = readdirSync(join(docs, 'guides')).map((f) => f.replace(/\.mdx?$/, ''));
const file = (lang: '' | 'fr', dir: string, slug: string) => [join(docs, lang, dir, `${slug}.mdx`), join(docs, lang, dir, `${slug}.md`)].find(existsSync);
const read = (lang: '' | 'fr', slug: string) => readFileSync(file(lang, 'guides', slug)!, 'utf8');
/** Starlight's heading ids (github-slugger): lower case, punctuation gone, spaces to hyphens. */
const anchor = (heading: string) => heading.trim().toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
const headings = (text: string) => [...text.matchAll(/^##+ (.+)$/gm)].map((m) => m[1]!);
const shape = (text: string) => ({
  sections: headings(text).length,
  tabs: (text.match(/<CodeTabs>/g) ?? []).length,
  flavours: [...text.matchAll(/<Fragment slot="(\w+)">/g)].map((m) => m[1]),
  demos: (text.match(/<LiveDemo/g) ?? []).length,
  fences: (text.match(/^```/gm) ?? []).length,
  tables: (text.match(/^\|---/gm) ?? []).length,
  options: [...new Set([...text.matchAll(/\]\(\.\.\/\.\.\/options\/([a-z-]+)\//g)].map((m) => m[1]))].sort(),
  guides: [...new Set([...text.matchAll(/\]\(\.\.\/([a-z-]+)\//g)].map((m) => m[1]))].sort(),
});

describe('the guides (18j-3)', () => {
  it('the list names guides that exist; a written guide is not a stub, an unwritten one still is', () => {
    expect(WRITTEN.filter((g) => !guides.includes(g))).toEqual([]);
    const wrong: string[] = [];
    for (const g of guides) for (const lang of ['', 'fr'] as const) {
      const stub = STUB.test(read(lang, g));
      if (WRITTEN.includes(g) === stub) wrong.push(`${lang || 'en'} ${g}: ${stub ? 'still a stub' : 'written but not listed'}`);
    }
    expect(wrong).toEqual([]);
  });

  it('a written guide has the same shape in English and French', () => {
    for (const g of WRITTEN) expect({ g, ...shape(read('fr', g)) }).toEqual({ g, ...shape(read('', g)) });
  });

  it('every link of a guide lands on a page, and on its heading when it names one', () => {
    const broken: string[] = [];
    for (const g of WRITTEN) for (const lang of ['', 'fr'] as const) {
      for (const m of read(lang, g).matchAll(/\]\((\.\.\/(?:\.\.\/)?)([a-z-]+(?:\/[a-z-]+)?)\/(?:#([^)]+))?\)/g)) {
        const [, up, target, hash] = m;
        const [dir, slug] = up === '../../' ? (target!.split('/') as [string, string]) : ['guides', target!];
        const to = file(lang, dir, slug);
        if (!to) broken.push(`${lang || 'en'} ${g} → ${dir}/${slug}`);
        else if (hash && !headings(readFileSync(to, 'utf8')).map(anchor).includes(hash)) broken.push(`${lang || 'en'} ${g} → ${dir}/${slug}#${hash}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
