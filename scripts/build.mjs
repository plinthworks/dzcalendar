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

// fileURLToPath, not .pathname: a folder with a space would come back as %20.
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = (name) => join(root, 'packages', name);
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

const PACKAGES = ['core', 'dom', 'motion-gsap'];
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
    sideEffects: name === 'dom' ? ['./views/*.js', './calendar.js'] : false,
    main: './index.js',
    module: './index.js',
    types: './index.d.ts',
    exports: {
      '.': { types: './index.d.ts', default: './index.js' },
      './package.json': './package.json',
    },
    ...(source.dependencies && { dependencies: internal(source.dependencies) }),
    ...(source.peerDependencies && { peerDependencies: source.peerDependencies }),
  };
  writeFileSync(join(dir, 'dist', 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  extras(name);
}

for (const name of PACKAGES) typescript(name);
theme();

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

for (const name of PACKAGES) {
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
  if (name === 'core' && tz !== TZSLOT_RANGE) {
    console.error(`packages/${name} depends on @tzslot/core ${tz}, expected ${TZSLOT_RANGE}`);
    process.exit(1);
  }
}
console.log(`\nBuilt: packages/{${[...PACKAGES, 'theme'].join(',')}}/dist`);
