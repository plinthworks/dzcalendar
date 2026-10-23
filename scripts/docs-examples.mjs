/**
 * `npm run docs:examples`: every example of the documentation site's tabs
 * (`<Fragment slot="js|angular|react|vue">` in website/src/content/docs), in
 * both languages, compiled against the packages' sources (owner, 18j: the
 * examples are compiled) — JavaScript and React by tsc, Vue's templates by
 * vue-tsc, Angular's templates by ngc with strictTemplates. A shell block
 * (an install line) is not code. Exits 1 on any error, naming the page,
 * the language and the tab.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfigFromFile } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const docs = join(root, 'website', 'src', 'content', 'docs');
const out = join(root, 'website', '.examples');
/** A fence's language → the file it is compiled as; a shell line is not code; anything else in a tab is an error. */
const EXT = { ts: 'ts', typescript: 'ts', tsx: 'tsx', vue: 'vue' };
const SHELL = new Set(['sh', 'bash', 'shell', 'text']);
const SLOTS = ['js', 'angular', 'react', 'vue'];

/** Every tab's code block: `{ page, slot, lang, code, index }`, and what cannot be compiled (`problems`). */
export function extract() {
  const pages = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.mdx')) pages.push(p);
    }
  };
  walk(docs);
  const found = [];
  const problems = [];
  for (const p of pages) {
    const page = relative(docs, p).replace(/\.mdx$/, '');
    const text = readFileSync(p, 'utf8');
    let tab = 0;
    for (const m of text.matchAll(/<Fragment slot="(\w+)">([\s\S]*?)<\/Fragment>/g)) {
      const [, slot, body] = m;
      tab++;
      if (!SLOTS.includes(slot)) continue;
      const blocks = [...body.matchAll(/```(\w*)[^\n]*\n([\s\S]*?)```/g)];
      let compiled = 0;
      blocks.forEach((b, i) => {
        if (EXT[b[1]]) {
          found.push({ page, slot, lang: b[1], code: b[2], index: `${tab}-${i}` });
          compiled++;
        } else if (!SHELL.has(b[1])) problems.push(`${page} ${slot}: a \`\`\`${b[1] || '(no language)'} block is neither compiled nor a shell line`);
      });
      if (compiled === 0 && !blocks.some((b) => SHELL.has(b[1]))) problems.push(`${page} ${slot}: a tab with no code to compile`);
    }
  }
  return { found, problems };
}

/** The packages as an application imports them: the playground's aliases (vite.config.ts). */
async function paths() {
  const { config } = await loadConfigFromFile({ command: 'build', mode: 'production' }, join(root, 'vite.config.ts'));
  return Object.fromEntries(Object.entries(config.resolve.alias).filter(([name]) => name.startsWith('@dzcalendar/')).map(([name, file]) => [name, [relative(out, file)]]));
}

/** The compiler's whole output when it fails — a missing tool, a crash or a signal included, never an empty list. */
function run(cmd, args) {
  try {
    execFileSync(join(root, 'node_modules', '.bin', cmd), args, { cwd: out, stdio: 'pipe', encoding: 'utf8' });
    return [];
  } catch (e) {
    const said = `${e.stdout ?? ''}${e.stderr ?? ''}`.split('\n').filter((l) => l.trim());
    return [`${cmd} exited ${e.status ?? e.signal ?? e.code}${said.length ? '' : `: ${e.message}`}`, ...said];
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  rmSync(out, { recursive: true, force: true });
  const { found: examples, problems } = extract();
  if (examples.length === 0) problems.push('no example found under website/src/content/docs');
  if (problems.length) {
    console.error(`✗ examples that cannot be compiled:\n${problems.join('\n')}`);
    process.exit(1);
  }
  const files = { plain: [], angular: [], vue: [] };
  for (const e of examples) {
    const file = join(out, e.page, `${e.slot}-${e.index}.${EXT[e.lang]}`);
    mkdirSync(dirname(file), { recursive: true });
    // A module each (an example's names never meet another's).
    writeFileSync(file, e.lang === 'vue' ? e.code : `${e.code}\nexport {};\n`);
    (e.lang === 'vue' ? files.vue : e.slot === 'angular' ? files.angular : files.plain).push(relative(out, file));
  }
  // What an example may take as given: the element it draws in.
  writeFileSync(join(out, 'globals.d.ts'), 'declare const element: HTMLElement;\n');
  const base = { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, noEmit: true, lib: ['ES2023', 'DOM', 'DOM.Iterable'], types: [], jsx: 'react-jsx', paths: await paths() };
  writeFileSync(join(out, 'tsconfig.json'), JSON.stringify({ compilerOptions: base, files: ['globals.d.ts', ...files.plain] }, null, 2));
  writeFileSync(join(out, 'tsconfig.vue.json'), JSON.stringify({ compilerOptions: base, files: ['globals.d.ts'], include: files.vue }, null, 2));
  writeFileSync(join(out, 'tsconfig.angular.json'), JSON.stringify({ compilerOptions: { ...base, noEmit: false, outDir: 'ngc-out', declaration: false }, files: ['globals.d.ts', ...files.angular], angularCompilerOptions: { strictTemplates: true, strictInjectionParameters: true } }, null, 2));
  const errors = [
    ...run('tsc', ['-p', 'tsconfig.json']).map((l) => `tsc ${l}`),
    ...run('vue-tsc', ['-p', 'tsconfig.vue.json', '--noEmit']).map((l) => `vue-tsc ${l}`),
    ...run('ngc', ['-p', 'tsconfig.angular.json']).map((l) => `ngc ${l}`),
  ];
  const n = `${examples.length} examples (${files.plain.length} JavaScript and React, ${files.vue.length} Vue, ${files.angular.length} Angular)`;
  if (errors.length) {
    console.error(`✗ ${n}:\n${errors.join('\n')}`);
    process.exit(1);
  }
  console.log(`✓ ${n} compile against the packages`);
}
