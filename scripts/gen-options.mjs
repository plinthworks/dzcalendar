/**
 * `npm run gen:options`: website/src/generated/options.json, the facts of every
 * option of `createCalendar` read from the TypeScript types (owner, 18j: the
 * facts generated, the text written) — its type as written, its comment, its
 * default (the JSDoc `@default`: a code literal, or a `{token}` the site
 * translates), whether `update()` changes it (a key of `CalendarUpdate`; the
 * first view and date through `view` and `date`), where it is declared. The
 * groups (`timeGrid`, `dayGrid`, `timeline`, `hooks`) carry their members.
 * Read with the compiler the repository already has, as gen:schema does.
 * `--check` fails when the file differs.
 */
import ts from 'typescript';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const OUT = join(root, 'website', 'src', 'generated', 'options.json');
const ENTRY = join(root, 'scripts', 'options', 'entry.ts');
/** Options a person sets once, changed afterwards through another key of `update()`. */
export const ALIASES = { initialView: 'view', initialDate: 'date', titleFormat: 'formats' };
/** Options whose members get their own sections on the option's page. */
export const GROUPS = ['timeGrid', 'timeline', 'hooks'];
/**
 * What createCalendar sets itself from another option, whatever is given (the kernel's own setting, not the
 * calendar's): left out of the pages, the option that decides it named instead. An option all of whose members are
 * so is left out whole.
 */
export const OVERRIDDEN = { 'dayGrid.maxLanes': 'dayMaxLanes', 'timeGrid.maxStack': 'eventMaxStack' };
const LIVE = new Set(['yes', 'no', 'next-view']);
const KNOWN_TAGS = new Set(['default', 'live', 'internal']);

export function generate() {
  const program = ts.createProgram([ENTRY], { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, noEmit: true, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'] });
  const checker = program.getTypeChecker();
  const exportsOf = checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(ENTRY)));
  const typeOf = (name) => checker.getDeclaredTypeOfSymbol(checker.getAliasedSymbol(exportsOf.find((s) => s.name === name)));
  const live = new Set(checker.getPropertiesOfType(typeOf('CalendarUpdate')).map((p) => p.name));
  for (const [option, key] of Object.entries(ALIASES)) if (!live.has(key)) throw new Error(`${option} is said to change as \`${key}\`, which update() does not take`);

  const tag = (sym, name) => sym.getJsDocTags(checker).find((t) => t.name === name);
  const tagText = (t) => (t ? ts.displayPartsToString(t.text).trim() : null);
  const doc = (sym) => ts.displayPartsToString(sym.getDocumentationComment(checker)).replace(/\s+/g, ' ').trim();
  // The file only: a line added above an option changes no fact.
  const where = (sym) => {
    const d = sym.declarations?.[0];
    return d ? relative(root, d.getSourceFile().fileName) : null;
  };
  /**
   * The type spelled out when it is written as one name that hides its values (`Weekday` → `1 | 2 | … | 7`), if
   * short enough to read. Only then: a union written out (`number | 'auto' | null`) is already what it is.
   */
  const resolved = (sym, written) => {
    if (!/^[A-Z]\w*$/.test(written)) return null;
    const t = checker.typeToString(checker.getNonNullableType(checker.getTypeOfSymbol(sym)), undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias);
    return t !== written && t.length <= 120 && !/^\{/.test(t) ? t : null;
  };
  const written = (sym) => {
    const d = sym.declarations?.[0];
    return d && 'type' in d && d.type ? d.type.getText().replace(/\s+/g, ' ').replace(/; }/g, ' }').replace(/\s*\/\*\*.*?\*\/\s*/g, ' ') : checker.typeToString(checker.getTypeOfSymbol(sym));
  };
  const record = (sym) => {
    const def = tagText(tag(sym, 'default'));
    for (const t of sym.getJsDocTags(checker)) if (!KNOWN_TAGS.has(t.name)) throw new Error(`${sym.name}: an unknown JSDoc tag @${t.name} (a stray "@" cuts the comment: write \`@scope/package\`)`);
    const text = doc(sym);
    if (def === null && /\bdefault\b/i.test(text)) throw new Error(`${sym.name}: its comment speaks of a default and has no @default tag`);
    const type = written(sym);
    return {
      name: sym.name,
      type,
      resolved: resolved(sym, type),
      doc: text,
      default: def === null ? null : /^\{[a-zA-Z]+\}$/.test(def) ? { token: def.slice(1, -1) } : { code: def },
      source: where(sym),
    };
  };

  const options = [];
  for (const sym of checker.getPropertiesOfType(typeOf('CalendarOptions'))) {
    if (tag(sym, 'internal')) continue;
    const members = checker.getPropertiesOfType(checker.getNonNullableType(checker.getTypeOfSymbol(sym))).filter((m) => !tag(m, 'internal'));
    if (members.length > 0 && members.every((m) => OVERRIDDEN[`${sym.name}.${m.name}`])) continue;
    const r = record(sym);
    const liveTag = tagText(tag(sym, 'live'));
    if (liveTag !== null && !LIVE.has(liveTag)) throw new Error(`${sym.name}: @live ${liveTag} (one of ${[...LIVE].join(', ')})`);
    r.live = ALIASES[sym.name] ? { as: ALIASES[sym.name] } : liveTag ?? (live.has(sym.name) ? 'yes' : 'no');
    if (GROUPS.includes(sym.name)) {
      r.members = members.filter((m) => !OVERRIDDEN[`${sym.name}.${m.name}`]).map(record).sort((a, b) => (a.name < b.name ? -1 : 1));
      if (r.members.length === 0) throw new Error(`${sym.name} is a group with no member`);
    }
    options.push(r);
  }
  for (const g of GROUPS) if (!options.some((o) => o.name === g)) throw new Error(`the group ${g} is not an option any more`);
  // Code-point order: the same on every machine, whatever its locale.
  options.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { generatedBy: 'scripts/gen-options.mjs', options };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const text = JSON.stringify(generate(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    let shipped = '';
    try {
      shipped = readFileSync(OUT, 'utf8');
    } catch {}
    if (shipped !== text) {
      console.error('website/src/generated/options.json differs from the types: run npm run gen:options');
      process.exit(1);
    }
    console.log('✓ website/src/generated/options.json matches the types');
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
    const { options } = JSON.parse(text);
    console.log(`website/src/generated/options.json: ${options.length} options, ${options.filter((o) => o.members).map((o) => `${o.name} (${o.members.length})`).join(', ')}`);
  }
}
