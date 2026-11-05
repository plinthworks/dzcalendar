/**
 * One release, one version: sets it on every package and on the workspace's own dependencies between them
 * (the build pins those as `^version` in each dist manifest). `npm run version:set -- 0.1.0`
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('Usage: npm run version:set -- 0.1.0');
  process.exit(1);
}
for (const dir of readdirSync(join(root, 'packages'))) {
  const file = join(root, 'packages', dir, 'package.json');
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const pkg = JSON.parse(text);
  pkg.version = version;
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(pkg[field] ?? {})) if (name.startsWith('@dzcalendar/')) pkg[field][name] = version;
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`${pkg.name} → ${version}`);
}
