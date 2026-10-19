/**
 * Builds every package into its own dist/, ready for `npm publish dist`.
 *
 * Same shape as tzslot's: package.json in the repository points at the
 * TypeScript sources (what the workspace and tests need); what npm receives is
 * compiled JavaScript with declarations and a manifest written here. Packages
 * join the list as their phase arrives.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minifyCssLiteral } from './css-literal.mjs';

// fileURLToPath, not .pathname: a folder with a space would come back as %20.
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = (name) => join(root, 'packages', name);
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

const PACKAGES = ['rrule', 'core', 'ical', 'slots', 'dom', 'pro', 'motion-gsap'];
const TZSLOT_RANGE = '^2.1.0';

const shared = (name) => ({
  license: read(join(pkg(name), 'package.json')).license,
  keywords: ['calendar', 'scheduler', 'agenda', 'timezone', 'dst', 'temporal', 'events'],
});

/** The workspace's own packages, pinned to the versions being built together. */
const internal = (deps = {}) =>
  Object.fromEntries(
    Object.entries(deps).map(([name, version]) =>
      name.startsWith('@dzcalendar/') ? [name, `^${read(join(pkg(name.slice(12)), 'package.json')).version}`] : [name, version],
    ),
  );

function extras(name) {
  for (const file of ['README.md', 'LICENSE']) {
    const own = join(pkg(name), file);
    const top = join(root, file);
    const source = existsSync(own) ? own : existsSync(top) ? top : null;
    if (source) cpSync(source, join(pkg(name), 'dist', file));
  }
}

function typescript(name) {
  const dir = pkg(name);
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  run('npx', ['tsc', '-p', join(dir, 'tsconfig.build.json')]);
  const source = read(join(dir, 'package.json'));
  const manifest = {
    name: source.name,
    version: source.version,
    description: source.description,
    ...shared(name),
    type: 'module',
    // The DOM's built-in views register themselves on import: a bundler must keep those modules.
    // The Pro registers its family and views on import: kept too.
    sideEffects:
      name === 'dom' ? ['./views/*.js', './calendar.js', './list.js', './multimonth.js', './custom.js', './locales/*.js'] : name === 'pro' ? ['./index.js', './model-entry.js', './timeline/family.js', './timeline/view.js'] : false,
    main: './index.js',
    module: './index.js',
    types: './index.d.ts',
    exports: {
      '.': { types: './index.d.ts', default: './index.js' },
      // Views paid for only when imported: `import '@dzcalendar/dom/list'` registers the family.
      ...(name === 'dom' && {
        './list': { types: './list.d.ts', default: './list.js' },
        './multimonth': { types: './multimonth.d.ts', default: './multimonth.js' },
        './custom': { types: './custom.d.ts', default: './custom.js' },
        './toolkit': { types: './toolkit.d.ts', default: './toolkit.js' },
        // Languages, one import each: `import '@dzcalendar/dom/locales/ar'`.
        ...Object.fromEntries(['ar', 'es', 'de'].map((l) => [`./locales/${l}`, { types: `./locales/${l}.d.ts`, default: `./locales/${l}.js` }])),
      }),
      ...(name === 'core' && { './views': { types: './views.d.ts', default: './views.js' } }),
      // The timeline without a screen (a server, a worker): `@dzcalendar/pro/model`.
      ...(name === 'pro' && { './model': { types: './model-entry.d.ts', default: './model-entry.js' } }),
      './package.json': './package.json',
    },
    ...(source.dependencies && { dependencies: internal(source.dependencies) }),
    ...(source.peerDependencies && { peerDependencies: source.peerDependencies }),
  };
  writeFileSync(join(dir, 'dist', 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  extras(name);
}

for (const name of PACKAGES) typescript(name);
// The structural CSS as it ships: comments and spaces out.
for (const file of [join(pkg('dom'), 'dist', 'styles.js'), join(pkg('pro'), 'dist', 'timeline', 'styles.js')]) writeFileSync(file, await minifyCssLiteral(readFileSync(file, 'utf8')));
theme();
angular();

/**
 * ng-packagr compiles the Angular package against core's and dom's built
 * declarations (`tsconfig.lib.json` paths), so it comes after them.
 */
function angular() {
  const dir = pkg('angular');
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  run('npx', ['ng-packagr', '-p', 'ng-package.json', '-c', 'tsconfig.lib.json'], dir);
  // ng-packagr writes its own manifest from the source one: take out what only
  // makes sense in the repository, and pin the internal dependencies.
  const file = join(dir, 'dist', 'package.json');
  const manifest = read(file);
  delete manifest.main;
  delete manifest.types;
  Object.assign(manifest, shared('angular'));
  manifest.dependencies = internal(manifest.dependencies);
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  extras('angular');
}

/** The theme ships its CSS and SCSS as they are, compiled first. */
function theme() {
  const dir = pkg('theme');
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  mkdirSync(join(dir, 'dist'));
  run('npm', ['run', 'build:theme', '--silent']);
  const source = read(join(dir, 'package.json'));
  for (const file of source.files) cpSync(join(dir, file), join(dir, 'dist', file));
  const { files: _files, ...manifest } = source;
  writeFileSync(join(dir, 'dist', 'package.json'), JSON.stringify({ ...manifest, ...shared('theme') }, null, 2) + '\n');
  extras('theme');
}

for (const name of [...PACKAGES, 'angular']) {
  const manifest = read(join(pkg(name), 'dist', 'package.json'));
  // A published manifest that points at src/ points at a file npm never received.
  // Only the entry points are checked: a description may well say "src/".
  const entries = JSON.stringify([manifest.main, manifest.module, manifest.types, manifest.exports]);
  if (entries.includes('src/')) {
    console.error(`packages/${name}/dist/package.json still points at src/`);
    process.exit(1);
  }
  // One Temporal for tzslot and DzCalendar: the range is a decision, not an accident.
  const tz = manifest.dependencies?.['@tzslot/core'];
  if ((name === 'core' || name === 'rrule') && tz !== TZSLOT_RANGE) {
    console.error(`packages/${name} depends on @tzslot/core ${tz}, expected ${TZSLOT_RANGE}`);
    process.exit(1);
  }
}
console.log(`\nBuilt: packages/{${[...PACKAGES, 'theme', 'angular'].join(',')}}/dist`);
