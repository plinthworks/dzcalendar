import { Node, Project, SyntaxKind } from 'ts-morph';
import { migrateTemplate } from './template.js';
import type { Edited } from './template.js';

/** The other library's type names this one exports under the same names (the import's source changes, nothing else). */
const TYPES = new Set(['CalendarOptions', 'EventInput', 'EventSourceInput', 'EventApi', 'ViewApi', 'EventClickArg', 'DateClickArg', 'DateSelectArg', 'EventChangeArg', 'EventDropArg', 'EventResizeDoneArg', 'EventAddArg', 'EventRemoveArg', 'DatesSetArg', 'EventContentArg', 'EventMountArg']);
/** Plugins: built in (nothing to import), or an import of their own here. */
const PLUGINS: Record<string, string | null> = {
  '@fullcalendar/daygrid': null,
  '@fullcalendar/timegrid': null,
  '@fullcalendar/interaction': null,
  '@fullcalendar/rrule': null,
  '@fullcalendar/icalendar': null,
  '@fullcalendar/resource': null,
  '@fullcalendar/resource-timegrid': null,
  '@fullcalendar/resource-daygrid': null,
  '@fullcalendar/scrollgrid': null,
  '@fullcalendar/adaptive': null,
  '@fullcalendar/list': '@dzcalendar/dom/list',
  '@fullcalendar/multimonth': '@dzcalendar/dom/multimonth',
  '@fullcalendar/timeline': '@dzcalendar/pro',
  '@fullcalendar/resource-timeline': '@dzcalendar/pro',
};
/** The languages that are an import here (English and French are built in). */
const LOCALES = new Set(['ar', 'es', 'de']);
/** A calendar's calls with a direct translation. */
const CALLS: Record<string, (args: string[]) => string | null> = {
  next: () => `navigate('next')`,
  prev: () => `navigate('prev')`,
  today: () => `navigate('today')`,
  refetchEvents: () => `refetch()`,
  unselect: () => `select(null)`,
  changeView: (a) => (a.length === 1 ? `update({ view: ${a[0]} })` : null),
  destroy: () => `destroy()`,
};

const MARK = (s: string) => `// dz-migrate: ${s}`;

/** The statement a note goes above. */
const statementOf = (node: Node): Node =>
  node.getFirstAncestor((a) => Node.isStatement(a) && a.getParent() !== undefined && (Node.isBlock(a.getParent()!) || Node.isSourceFile(a.getParent()!))) ?? node;

/** A string's text written back in its own quotes, escaped as they need. */
function literal(text: string, quote: string): string {
  const body = text.replace(/\\/g, '\\\\');
  if (quote === '`') return '`' + body.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
  return quote + body.replace(new RegExp(quote, 'g'), `\\${quote}`).replace(/\n/g, '\\n').replace(/\r/g, '\\r') + quote;
}

/** One TypeScript or JavaScript file rewritten (its inline Angular templates too). */
export async function migrateSource(text: string, fileName = 'file.ts'): Promise<Edited> {
  if (!text.includes('@fullcalendar/')) return { text, notes: [], changed: false };
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  const file = project.createSourceFile(fileName, text, { overwrite: true });
  const notes: string[] = [];
  const calendarNames = new Set<string>();
  const removedValues = new Set<string>();
  const sideEffects = new Set<string>();
  const add: { module: string; names: string[]; types?: boolean }[] = [];
  /** A locale's default import → its code ('fr'); the FullCalendarModule's local name; the variables holding a calendar. */
  const localeNames = new Map<string, string>();
  let angularModule: string | null = null;
  const instanceNames = new Set<string>();
  /** Notes for a person, put above their statements once everything else is done. */
  const marks: { node: Node; note: string }[] = [];
  const mark = (node: Node, note: string) => {
    notes.push(note);
    marks.push({ node: statementOf(node), note });
  };

  for (const imp of file.getImportDeclarations()) {
    const from = imp.getModuleSpecifierValue();
    if (!from.startsWith('@fullcalendar/')) continue;
    if (imp.getNamespaceImport()) {
      // `import * as FC`: what it is used for cannot be told apart safely; left, said.
      notes.push(`${from}: import * as ${imp.getNamespaceImport()!.getText()} — not migrated (import the names instead)`);
      continue;
    }
    if (from === '@fullcalendar/core/locales-all') {
      // Every language: the ones that are an import here (English and French are built in).
      for (const l of LOCALES) sideEffects.add(`@dzcalendar/dom/locales/${l}`);
      const def = imp.getDefaultImport()?.getText();
      if (def) removedValues.add(def);
      notes.push(`${from}: English, French built in; Arabic, Spanish, German imported; other languages: defineLocale`);
      imp.remove();
      continue;
    }
    const locale = /^@fullcalendar\/core\/locales\/([\w-]+)/.exec(from);
    if (locale) {
      const def = imp.getDefaultImport()?.getText();
      if (def) removedValues.add(def);
      if (def) localeNames.set(def, locale[1]!);
      if (LOCALES.has(locale[1]!.split('-')[0]!)) sideEffects.add(`@dzcalendar/dom/locales/${locale[1]!.split('-')[0]}`);
      imp.remove();
      continue;
    }
    if (from in PLUGINS) {
      const def = imp.getDefaultImport()?.getText();
      if (def) removedValues.add(def);
      const types: string[] = [];
      for (const n of imp.getNamedImports()) {
        const name = n.getName();
        const local = n.getAliasNode()?.getText() ?? name;
        // A type the plugin exports (DateClickArg from interaction…): the same name here.
        if (TYPES.has(name)) {
          types.push(local === name ? name : `${name} as ${local}`);
          continue;
        }
        removedValues.add(local);
        notes.push(`${from}: ${name} has no equivalent (dropped)`);
      }
      if (types.length > 0) add.push({ module: '@dzcalendar/compat-fullcalendar', names: types, types: true });
      const to = PLUGINS[from];
      if (to) sideEffects.add(to);
      imp.remove();
      continue;
    }
    if (from === '@fullcalendar/core') {
      const types: string[] = [];
      for (const n of imp.getNamedImports()) {
        const name = n.getName();
        const local = n.getAliasNode()?.getText() ?? name;
        if (name === 'Calendar') {
          calendarNames.add(local);
          add.push({ module: '@dzcalendar/compat-fullcalendar', names: ['createFromFullCalendar'] });
        } else if (TYPES.has(name)) types.push(local === name ? name : `${name} as ${local}`);
        else notes.push(`@fullcalendar/core: ${name} has no equivalent`);
      }
      if (types.length > 0) add.push({ module: '@dzcalendar/compat-fullcalendar', names: types, types: true });
      imp.remove();
      continue;
    }
    if (from === '@fullcalendar/angular') {
      for (const n of imp.getNamedImports()) {
        const name = n.getName();
        if (name === 'FullCalendarModule') angularModule = n.getAliasNode()?.getText() ?? name;
        else notes.push(`@fullcalendar/angular: ${name} — use <dz-calendar>'s CalendarController (inject it, or #cal then cal.controller)`);
      }
      if (angularModule) add.push({ module: '@dzcalendar/angular', names: ['DZ_CALENDAR'] }, { module: '@dzcalendar/angular/fullcalendar', names: ['DzFullCalendar'] });
      imp.remove();
      continue;
    }
    notes.push(`${from}: not migrated (React and Vue arrive with Phase 18c)`);
  }

  // The plugins and the locales arrays: their entries are gone (built in), the property too when empty.
  for (const prop of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const name = prop.getName();
    const init = prop.getInitializer();
    if ((name === 'plugins' || name === 'locales') && init && Node.isArrayLiteralExpression(init)) {
      for (const el of init.getElements()) if (Node.isIdentifier(el) && removedValues.has(el.getText())) init.removeElement(el);
      if (init.getElements().length === 0) prop.remove();
    } else if (name === 'locales' && init && Node.isIdentifier(init) && removedValues.has(init.getText())) {
      prop.remove();
    } else if (name === 'locale' && init && Node.isIdentifier(init) && localeNames.has(init.getText())) {
      init.replaceWithText(`'${localeNames.get(init.getText())}'`);
    }
  }
  // An Angular component's or module's imports: FullCalendarModule → the calendar and the options directive.
  if (angularModule) {
    for (const id of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() !== angularModule || !Node.isArrayLiteralExpression(id.getParent())) continue;
      id.replaceWithText('DZ_CALENDAR, DzFullCalendar');
    }
  }
  // The type `Calendar` (a field, a variable): the calendar here.
  for (const ref of file.getDescendantsOfKind(SyntaxKind.TypeReference)) {
    if (!calendarNames.has(ref.getTypeName().getText())) continue;
    ref.replaceWithText('CalendarInstance');
    add.push({ module: '@dzcalendar/dom', names: ['CalendarInstance'], types: true });
  }
  // new Calendar(el, options) → createFromFullCalendar(el, options).calendar; the calls on it.
  for (const ne of [...file.getDescendantsOfKind(SyntaxKind.NewExpression)]) {
    if (ne.wasForgotten() || !calendarNames.has(ne.getExpression().getText())) continue;
    const made = `createFromFullCalendar(${ne.getArguments().map((a) => a.getText()).join(', ')}).calendar`;
    // `new Calendar(…).render()`: drawn when made.
    const access = ne.getParentIfKind(SyntaxKind.PropertyAccessExpression);
    const chained = access?.getName() === 'render' ? access.getParentIfKind(SyntaxKind.CallExpression) : undefined;
    // Who holds it: `const c = …`, a field, or `this.c = …` / `c = …`.
    const decl = ne.getFirstAncestorByKind(SyntaxKind.VariableDeclaration) ?? ne.getFirstAncestorByKind(SyntaxKind.PropertyDeclaration);
    const assigned = ne.getFirstAncestorByKind(SyntaxKind.BinaryExpression);
    const owner = decl?.getName() ?? (assigned?.getOperatorToken().getKind() === SyntaxKind.EqualsToken ? assigned.getLeft().getText().replace(/^this\./, '') : undefined);
    (chained ?? ne).replaceWithText(made);
    if (owner) instanceNames.add(owner);
  }
  for (const call of [...file.getDescendantsOfKind(SyntaxKind.CallExpression)].reverse()) {
    if (call.wasForgotten()) continue;
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const target = callee.getExpression().getText().replace(/^this\./, '');
    if (!instanceNames.has(target)) continue;
    const method = callee.getName();
    if (method === 'render') {
      const st = call.getParentIfKind(SyntaxKind.ExpressionStatement);
      if (st) st.remove();
      continue;
    }
    const to = CALLS[method]?.(call.getArguments().map((a) => a.getText()));
    if (to) call.replaceWithText(`${callee.getExpression().getText()}.${to}`);
    // Names only this calendar has pass; the other library's (`select(start, end)` too) are marked.
    else if (!['run', 'undo', 'redo', 'update', 'navigate', 'refetch'].includes(method)) mark(call, `${method}() — see docs/migrating-from-fullcalendar.md`);
  }
  // Inline Angular templates.
  for (const prop of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (prop.getName() !== 'template') continue;
    const init = prop.getInitializer();
    if (!init || !(Node.isStringLiteral(init) || Node.isNoSubstitutionTemplateLiteral(init))) continue;
    const t = await migrateTemplate(init.getLiteralText(), `${fileName}#template`);
    if (!t.changed) continue;
    notes.push(...t.notes);
    init.replaceWithText(literal(t.text, Node.isNoSubstitutionTemplateLiteral(init) ? '`' : init.getQuoteKind()));
  }
  // The notes, above their statements (once: a second run finds them there), from the end so places hold.
  const at = marks
    .map((m) => ({ pos: m.node.getStart(), indent: m.node.getIndentationText(), line: MARK(m.note), has: m.node.getFullText().includes(MARK(m.note)) }))
    .filter((m) => !m.has)
    .sort((a, b) => b.pos - a.pos);
  if (at.length > 0) {
    let t = file.getFullText();
    for (const m of at) t = `${t.slice(0, m.pos)}${m.line}\n${m.indent}${t.slice(m.pos)}`;
    file.replaceWithText(t);
  }
  // The new imports, merged per module, after the others.
  const by = new Map<string, { names: Set<string>; types: boolean }>();
  for (const a of add) {
    const k = `${a.module}|${a.types ? 't' : 'v'}`;
    const e = by.get(k) ?? { names: new Set<string>(), types: Boolean(a.types) };
    a.names.forEach((n) => e.names.add(n));
    by.set(k, e);
  }
  for (const [k, e] of by) file.addImportDeclaration({ moduleSpecifier: k.split('|')[0]!, namedImports: [...e.names], isTypeOnly: e.types });
  for (const s of sideEffects) file.addImportDeclaration({ moduleSpecifier: s });
  const out = file.getFullText();
  return { text: out, notes, changed: out !== text };
}
