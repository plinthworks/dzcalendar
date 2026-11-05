/**
 * Publishing every DzCalendar package, and then asking the registry whether each arrived.
 *
 * tzslot's lesson (its scripts/publish.mjs, three releases): a release that leaves some packages off npm is
 * uninstallable — the ones that arrived ask for the missing ones by version. So: dependencies before dependents,
 * one one-time code passed to every publish (`--otp`), and a release is finished when the registry says each
 * package is there and its tarball can be fetched, not when `npm publish` printed something.
 *
 * Never a republish (owner, 2026-11-05): a package whose version the registry already has is skipped, not sent
 * again — so the same command, run again after a failure, publishes what is missing and nothing else.
 *
 *   npm run publish:dry                     # what would go, nothing sent
 *   npm run publish:latest -- --otp=123456  # build, check, publish what is missing, verify
 *   npm run publish:verify                  # just the registry's answer, after the fact
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Dependencies before dependents: a release stopped half-way is still coherent. */
export const ORDER = ['rrule', 'core', 'ical', 'slots', 'dom', 'theme', 'motion-gsap', 'pro', 'element', 'compat-fullcalendar', 'migrate', 'react', 'vue', 'angular', 'pro-react', 'pro-vue', 'pro-angular'];

const manifest = (name) => JSON.parse(readFileSync(join(root, 'packages', name, 'dist', 'package.json'), 'utf8'));
const otpArg = process.argv.find((a) => a.startsWith('--otp='));
const otp = otpArg?.slice('--otp='.length) ?? process.env.NPM_OTP;
const verifyOnly = process.argv.includes('--verify-only');
const dry = process.argv.includes('--dry-run');

/** What the registry says, past every cache (npm view reads a local one that can be a version behind). */
async function published(pkgName, version) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (response.status === 404) return { versions: [], latest: null, tarball: null };
  if (!response.ok) throw new Error(`the registry answered ${response.status} for ${pkgName}`);
  const body = await response.json();
  return { versions: Object.keys(body.versions ?? {}), latest: body['dist-tags']?.latest ?? null, tarball: body.versions?.[version]?.dist?.tarball ?? null };
}

/** Whether the tarball the metadata promises can be fetched (they propagate apart: up to minutes). */
async function fetchable(url, waitMs = 180_000) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const head = url ? await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null) : null;
    if (head?.ok) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resume) => setTimeout(resume, 5_000));
  }
}

/** Waits for a version in the registry's listing: a publish is processed after the command returns. */
async function listed(pkgName, version, waitMs = 600_000) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const state = await published(pkgName, version).catch(() => null);
    if (state?.versions.includes(version)) return state;
    if (Date.now() > deadline) return state;
    await new Promise((resume) => setTimeout(resume, 10_000));
  }
}

if (!verifyOnly) {
  console.log('\nBuilding, and checking what a bundler does with the result.\n');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  execFileSync('npm', ['run', 'check:entries'], { cwd: root, stdio: 'inherit' });
  const versions = new Set(ORDER.map((n) => manifest(n).version));
  if (versions.size !== 1) {
    console.error(`\n✖ The packages are at different versions (${[...versions].join(', ')}): one release, one version.\n`);
    process.exit(1);
  }
  const [version] = versions;
  if (version === '0.0.0') {
    console.error('\n✖ Version 0.0.0: set the release first — npm run version:set -- 0.1.0\n');
    process.exit(1);
  }
  if (!otp && !dry) console.log('\nNo --otp given: npm will ask for a code at each package. Once instead: npm run publish:latest -- --otp=123456\n');
  for (const name of ORDER) {
    const m = manifest(name);
    const before = await published(m.name, m.version).catch(() => null);
    if (before?.versions.includes(m.version)) {
      console.log(`  = ${m.name}@${m.version} is already on npm: not sent again`);
      continue;
    }
    console.log(`\n${dry ? 'Would publish' : 'Publishing'} ${m.name}@${m.version}`);
    const args = ['publish', join('packages', name, 'dist'), '--access', 'public'];
    if (dry) args.push('--dry-run');
    if (otp) args.push(`--otp=${otp}`);
    const run = spawnSync('npm', args, { cwd: root, stdio: 'inherit' });
    if (run.status !== 0) {
      console.error(
        `\n✖ ${m.name} did not publish. Those before it did, those after did not — a release that cannot be\n` +
          `  installed yet. Fix the cause and run the same command again: what is already on npm is skipped.\n`,
      );
      process.exit(1);
    }
  }
  if (dry) {
    console.log('\nDry run: nothing was sent.\n');
    process.exit(0);
  }
}

console.log('\nAsking the registry what actually arrived (it publishes asynchronously: this waits).\n');
let missing = 0;
for (const name of ORDER) {
  const m = manifest(name);
  const state = await listed(m.name, m.version);
  if (!state?.versions.includes(m.version)) {
    console.error(`  ✖ ${m.name}@${m.version} is NOT on npm (latest there: ${state?.latest ?? 'nothing'})`);
    missing++;
    continue;
  }
  if (!(await fetchable(state.tarball))) {
    console.error(`  ✖ ${m.name}@${m.version} is listed, but its tarball cannot be fetched — nobody can install it`);
    missing++;
    continue;
  }
  console.log(state.latest === m.version ? `  ✔ ${m.name}@${m.version} is there and installable` : `  ! ${m.name}@${m.version} is installable, but latest is ${state.latest}`);
}
if (missing > 0) {
  console.error(`\n${missing} of ${ORDER.length} packages are missing: the others ask for them by version. Not done — publish the rest first.\n`);
  process.exit(1);
}
console.log(`\nAll ${ORDER.length} packages are on npm at the built version.\n`);
