import type { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { chain, SchematicsException } from '@angular-devkit/schematics';
import { addDependency, addRootProvider, ExistingBehavior, InstallBehavior, readWorkspace, updateWorkspace } from '@schematics/angular/utility';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface NgAddOptions {
  readonly project?: string;
  readonly gsap?: boolean;
  readonly pro?: boolean;
  readonly example?: boolean;
  readonly skipInstall?: boolean;
}

/** Each package's own range at this release (written by the build), else this package's version for all. */
const OWN: string = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')).version;
const VERSIONS: Record<string, string> = (() => {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', 'versions.json'), 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
})();
const rangeOf = (pkg: string) => VERSIONS[pkg] ?? `^${OWN}`;
const THEME = 'node_modules/@dzcalendar/theme/dzcalendar.css';

/** `ng add @dzcalendar/angular`: the packages, the theme in the build's styles, `provideDzCalendar()` — then what was asked for. */
export function ngAdd(o: NgAddOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const workspace = await readWorkspace(tree);
    // The application asked for, else the first application with a build (not a library, not an e2e project).
    const name = o.project ?? [...workspace.projects].find(([, p]) => p.extensions['projectType'] === 'application' && p.targets.has('build'))?.[0];
    const project = name ? workspace.projects.get(name) : undefined;
    if (!name || !project) throw new SchematicsException(o.project ? `No project named ${o.project}.` : 'No Angular application in this workspace: name one with --project.');
    const install = o.skipInstall ? InstallBehavior.None : InstallBehavior.Auto;
    // Ours at this release; a peer the application already has (gsap, @tzslot/dom) kept as it is.
    const ours = (list: readonly string[]) => list.map((pkg) => addDependency(pkg, rangeOf(pkg), { install }));
    const peer = (pkg: string, range: string) => addDependency(pkg, range, { install, existing: ExistingBehavior.Skip });
    const root = project.sourceRoot ?? `${project.root ? `${project.root}/` : ''}src`;
    // Already added (ng add run again): the providers are not written twice. Read where they go only (the bootstrap,
    // app.config, a root module), not a spec or a comment elsewhere.
    const has = (text: string) => {
      let found = false;
      tree.getDir(root).visit((path) => {
        if (!found && /(^|\/)(main|app\.config|app\.module)\.ts$/.test(path) && tree.readText(path).includes(text)) found = true;
      });
      return found;
    };
    return chain([
      ...ours(['@dzcalendar/core', '@dzcalendar/dom', '@dzcalendar/theme']),
      ...(o.gsap ? [peer('gsap', '^3.13.0'), ...ours(['@dzcalendar/motion-gsap'])] : []),
      ...(o.pro ? [...ours(['@dzcalendar/pro', '@dzcalendar/pro-angular']), peer('@tzslot/dom', '^2.2.0')] : []),
      // The theme in the application's styles (once).
      updateWorkspace((ws) => {
        const build = ws.projects.get(name)?.targets.get('build');
        if (!build) return;
        const options = (build.options ??= {}) as Record<string, unknown>;
        const styles = Array.isArray(options['styles']) ? (options['styles'] as unknown[]) : [];
        if (!styles.some((s) => (typeof s === 'string' ? s : (s as { input?: string }).input) === THEME)) options['styles'] = [THEME, ...styles];
      }),
      ...(has('provideDzCalendar(') ? [] : [addRootProvider(name, ({ code, external }) => code`${external('provideDzCalendar', '@dzcalendar/angular')}({})`)]),
      ...(o.gsap && !has('provideDzMotion(') ? [addRootProvider(name, ({ code, external }) => code`${external('provideDzMotion', '@dzcalendar/angular')}(() => ${external('createGsapMotion', '@dzcalendar/motion-gsap')}())`)] : []),
      ...(o.example === false ? [] : [example(`${root}/app/agenda.ts`, Boolean(o.pro))]),
      () => {
        context.logger.info(`DzCalendar added to ${name}: the theme in its styles, provideDzCalendar() in its providers${o.gsap ? ', GSAP motion' : ''}${o.pro ? ', the Pro' : ''}.`);
        if (o.example !== false) context.logger.info(`An example: ${root}/app/agenda.ts — import Agenda and put <app-agenda /> in a template.`);
      },
    ]);
  };
}

/** A standalone component showing a week, ready to be used: `<app-agenda />`. */
function example(path: string, pro: boolean): Rule {
  return (tree: Tree) => {
    if (tree.exists(path)) return;
    tree.create(
      path,
      `import { Component, signal } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
${pro ? "import { DzEventEditor } from '@dzcalendar/pro-angular';\n" : ''}import { Temporal } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';

/** DzCalendar, added by \`ng add\`: a week, each event in its own time zone. */
@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [DZ_CALENDAR${pro ? ', DzEventEditor' : ''}],
  template: \`<dz-calendar${pro ? ' dzEventEditor' : ''} view="timeGridWeek" [date]="date" [events]="events()" [editable]="true" [selectable]="true" style="height: 40rem" />\`,
})
export class Agenda {
  /** The week the examples are in. */
  readonly date = Temporal.PlainDate.from('2026-10-21');
  readonly events = signal<EventInput[]>([
    { id: 'standup', title: 'Stand-up', start: '2026-10-19T09:30[Europe/Paris]', duration: { minutes: 15 }, rrule: 'FREQ=DAILY;COUNT=5' },
    { id: 'tokyo', title: 'Call with Tokyo', start: '2026-10-21T17:00[Asia/Tokyo]', duration: { hours: 1 } },
  ]);
}
`,
    );
  };
}
