/**
 * `npm run gen:schema`: commands.schema.json from the TypeScript types
 * (ARCHITECTURE B.14) — every command, an event, a slot query — so that an
 * assistant in the host application can write them. Temporal values are ISO
 * strings there (what `normalize` reads); the comments on the types become
 * descriptions. Read with the compiler the repository already has: no
 * generator of its own to trust. `--check` fails when the file differs.
 */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(root, 'site', 'commands.schema.json');
const ENTRY = join(root, 'scripts', 'schema', 'entry.ts');
const NAMES = ['Command', 'EventInput', 'SlotQuery'];
/** Aliases used in many places: one definition each, referred to (an assistant reads them once). */
const SHARED = new Set(['TemporalInput', 'Moment', 'WallTime', 'DurationLike']);

/** Temporal values as the strings `normalize` reads. */
const TEMPORAL = {
  ZonedDateTime: { description: 'A wall time in a zone, ISO 8601 with the IANA name: 2026-10-21T09:00[Europe/Paris] (an offset may be given: 2026-10-21T09:00+02:00[Europe/Paris]).', examples: ['2026-10-21T09:00[Europe/Paris]'] },
  PlainDate: { description: 'A date, ISO 8601: 2026-10-21.', examples: ['2026-10-21'] },
  PlainDateTime: { description: 'A wall time without a zone, read in the event’s or the calendar’s zone: 2026-10-21T09:00.', examples: ['2026-10-21T09:00'] },
  Instant: { description: 'An instant, ISO 8601 in UTC or with an offset: 2026-10-21T07:00:00Z.', examples: ['2026-10-21T07:00:00Z'] },
  PlainTime: { description: 'A wall time of day, HH:mm: 08:30 (24:00 as an end is the next midnight).', examples: ['08:30'] },
  Duration: { description: 'An ISO 8601 duration: PT45M, P1D.', examples: ['PT45M'] },
};

export function generate() {
  const program = ts.createProgram([ENTRY], { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, noEmit: true, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'] });
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(ENTRY);
  const exportsOf = checker.getExportsOfModule(checker.getSymbolAtLocation(file));
  const top = new Map();
  for (const name of NAMES) {
    const sym = exportsOf.find((s) => s.name === name);
    if (!sym) throw new Error(`${name} is not exported by ${ENTRY}`);
    top.set(checker.getDeclaredTypeOfSymbol(checker.getAliasedSymbol(sym)), name);
  }
  const doc = (sym) => (sym ? ts.displayPartsToString(sym.getDocumentationComment(checker)).replace(/\s+/g, ' ').trim() : '');
  const temporalOf = (t) => {
    const name = t.getSymbol()?.getName();
    if (!name || !(name in TEMPORAL)) return null;
    const decl = t.getSymbol().getDeclarations()?.[0]?.getSourceFile().fileName ?? '';
    return /temporal|tzslot/i.test(decl) ? name : null;
  };

  /** A schema for `t`; `depth` 0 is a definition's own body (not turned back into a reference). */
  const shared = {};
  function convert(t, depth = 1) {
    if (depth > 0 && top.has(t)) return { $ref: `#/$defs/${top.get(t)}` };
    const alias = t.aliasSymbol?.getName();
    if (alias && SHARED.has(alias)) {
      if (!(alias in shared)) {
        shared[alias] = null;
        shared[alias] = convertBody(t, depth);
      }
      return { $ref: `#/$defs/${alias}` };
    }
    return convertBody(t, depth);
  }
  function convertBody(t, depth) {
    const f = t.getFlags();
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
    if (f & ts.TypeFlags.StringLiteral) return { const: t.value };
    if (f & ts.TypeFlags.NumberLiteral) return { const: t.value };
    if (f & ts.TypeFlags.BooleanLiteral) return { const: t.intrinsicName === 'true' };
    if (f & ts.TypeFlags.String) return { type: 'string' };
    if (f & ts.TypeFlags.Number) return { type: 'number' };
    if (f & ts.TypeFlags.Boolean) return { type: 'boolean' };
    if (f & ts.TypeFlags.Null) return { type: 'null' };
    const tem = temporalOf(t);
    if (tem) return { type: 'string', ...TEMPORAL[tem] };
    if (t.isUnion()) {
      const parts = t.types.filter((x) => !(x.getFlags() & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
      // `true | false` is boolean.
      if (parts.length === 2 && parts.every((x) => x.getFlags() & ts.TypeFlags.BooleanLiteral)) return { type: 'boolean' };
      if (parts.length > 0 && parts.every((x) => x.getFlags() & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral))) return { enum: parts.map((x) => x.value) };
      const out = [];
      for (const p of parts) {
        const s = convert(p, depth + 1);
        // Several Temporal kinds (or a string beside them): one string.
        if (s.type === 'string' && out.some((o) => o.type === 'string')) {
          const i = out.findIndex((o) => o.type === 'string');
          out[i] = mergeStrings(out[i], s);
          continue;
        }
        if (!out.some((o) => JSON.stringify(o) === JSON.stringify(s))) out.push(s);
      }
      return out.length === 1 ? out[0] : { anyOf: out };
    }
    if (t.isIntersection()) {
      const parts = t.types.map((x) => convert(x, depth + 1));
      if (parts.every((p) => p.type === 'object')) {
        const o = objectOf(parts.flatMap((p) => Object.entries(p.properties ?? {})), parts.flatMap((p) => p.required ?? []), parts.find((p) => p.description)?.description);
        // Closed when every part is: an extra field is refused, as on any other command.
        if (parts.every((p) => p.additionalProperties === false)) o.additionalProperties = false;
        return o;
      }
      return { allOf: parts };
    }
    if (checker.isArrayType(t) || checker.isTupleType(t)) {
      const [item] = checker.getTypeArguments(t);
      return { type: 'array', items: item ? convert(item, depth + 1) : {} };
    }
    if (f & ts.TypeFlags.Object) {
      const index = checker.getIndexInfosOfType(t)[0];
      const props = checker.getPropertiesOfType(t);
      const entries = [];
      const required = [];
      for (const p of props) {
        // The type as written (an alias kept: `start?: TemporalInput`), else as resolved (`undefined` of an optional left out below).
        const node = p.valueDeclaration && ts.isPropertySignature(p.valueDeclaration) ? p.valueDeclaration.type : undefined;
        const written = node ? checker.getTypeFromTypeNode(node) : null;
        const pt = written && written.aliasSymbol && SHARED.has(written.aliasSymbol.getName()) ? written : checker.getTypeOfSymbol(p);
        // Functions are not data: an assistant cannot write them.
        if (pt.getCallSignatures().length > 0) continue;
        const s = convert(pt, depth + 1);
        const d = doc(p);
        entries.push([p.getName(), d && !s.$ref ? { ...s, description: s.description ? `${d} ${s.description}` : d } : s]);
        if (!(p.getFlags() & ts.SymbolFlags.Optional)) required.push(p.getName());
      }
      const o = objectOf(entries, required);
      if (index) o.additionalProperties = convert(index.type, depth + 1);
      else if (entries.length > 0) o.additionalProperties = false;
      return o;
    }
    return {};
  }
  const mergeStrings = (a, b) => ({ type: 'string', description: [a.description, b.description].filter(Boolean).join(' Or: '), ...((a.examples || b.examples) && { examples: [...(a.examples ?? []), ...(b.examples ?? [])] }) });
  const objectOf = (entries, required, description) => ({ type: 'object', ...(description && { description }), properties: Object.fromEntries(entries), ...(required.length > 0 && { required: [...new Set(required)] }) });

  const $defs = {};
  for (const [t, name] of top) {
    const alias = exportsOf.find((s) => s.name === name);
    const d = doc(checker.getAliasedSymbol(alias));
    $defs[name] = { ...(d && { description: d }), ...convert(t, 0) };
  }
  Object.assign($defs, shared);
  // A duration's fields are whole numbers (Temporal refuses { hours: 1.5 }: write { minutes: 90 }).
  for (const o of $defs.DurationLike?.anyOf ?? []) for (const f of Object.values(o.properties ?? {})) if (f.type === 'number') f.type = 'integer';
  // Optional in the type (a source may complete it), never in a command: an event without a start is refused (missing-start).
  $defs.EventInput.required = ['start'];
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://raw.githubusercontent.com/plinthworks/dzcalendar/main/site/commands.schema.json',
    title: 'DzCalendar commands',
    description: 'What an assistant can ask a DzCalendar to do (calendar.run(command)), an event, and a slot query (findSlots). Dates and times are ISO 8601 strings with IANA zones; nothing here is a JS Date. Generated from the TypeScript types by scripts/gen-schema.mjs.',
    $ref: '#/$defs/Command',
    $defs,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = JSON.stringify(generate(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    let shipped = '';
    try {
      shipped = readFileSync(OUT, 'utf8');
    } catch {}
    if (shipped !== text) {
      console.error('site/commands.schema.json differs from the types: run npm run gen:schema');
      process.exit(1);
    }
    console.log('✓ site/commands.schema.json matches the types');
  } else {
    writeFileSync(OUT, text);
    console.log(`site/commands.schema.json: ${Object.keys(JSON.parse(text).$defs).join(', ')}`);
  }
}
