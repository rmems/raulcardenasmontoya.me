// Rejects git-sourced dependencies in the adapter's Cargo.lock.
//
//   node scripts/verify-lockfile-sources.mjs
//
// Every crate in the browser graph must resolve from the crates.io registry so
// its archive is pinned by the `Cargo.lock` checksum and can be audited. A
// `source = "git+…"` entry carries no checksum, so a `rev` could move under the
// build without any lockfile diff. This guard fails on any `git+` source that
// is not explicitly allowlisted below; `npm run validate:rust` runs it.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = resolve(import.meta.dirname, '..');
export const LOCKFILE = 'crates/neuromorphic-adapter/Cargo.lock';

/**
 * Git-sourced packages allowed while their crates.io release is unpublished.
 * Each entry is a dependency the browser package cannot audit by checksum, so
 * this map should shrink to empty and stay there.
 *
 * `plasticity-lab`: crates.io 0.2.1 requires `neuromod ^0.6`, which conflicts
 * with the adapter's `neuromod =0.7.0`, so the `plasticity` feature pins `main`
 * at a `rev`. Remove this entry once the neuromod-0.7 release ships
 * (GitHub #162, task 1) and the pin moves to crates.io.
 */
export const ALLOWED_GIT_SOURCES = new Map([
  ['plasticity-lab', 'crates.io 0.2.1 requires neuromod ^0.6; pinned to `main` until the neuromod-0.7 release ships (#162)'],
]);

/** The `[[package]]` entries of a lockfile as `{ name, version, source }`. */
export function lockfilePackages(lockfile) {
  return lockfile
    .replaceAll('\r\n', '\n')
    .split(/^\[\[package\]\]$/m)
    .slice(1)
    .map((block) => ({
      name: block.match(/^name = "([^"]+)"$/m)?.[1] ?? null,
      version: block.match(/^version = "([^"]+)"$/m)?.[1] ?? null,
      source: block.match(/^source = "([^"]+)"$/m)?.[1] ?? null,
    }))
    .filter((pkg) => pkg.name !== null);
}

/**
 * Every git source in the lockfile that is not allowlisted, as
 * `name version: source`. Empty means clean. The allowlisted ones are returned
 * separately so a caller can report them without failing.
 */
export function gitSourceViolations(lockfile, allowed = ALLOWED_GIT_SOURCES) {
  const violations = [];
  const allowlisted = [];
  for (const pkg of lockfilePackages(lockfile)) {
    if (!pkg.source?.startsWith('git+')) continue;
    if (allowed.has(pkg.name)) {
      allowlisted.push(`${pkg.name} ${pkg.version}: ${pkg.source}`);
    } else {
      violations.push(`${pkg.name} ${pkg.version}: git source ${pkg.source}`);
    }
  }
  return { violations, allowlisted };
}

async function main() {
  const lockfile = await readFile(resolve(repository, LOCKFILE), 'utf8');
  const { violations, allowlisted } = gitSourceViolations(lockfile);

  if (violations.length > 0) {
    throw new Error(
      `${LOCKFILE} resolves dependencies from git; pin them to a crates.io release so the lockfile checksum audits them:\n${violations.join('\n')}`,
    );
  }

  const note = allowlisted.length > 0 ? ` Allowlisted git sources: ${allowlisted.join('; ')}.` : '';
  process.stdout.write(`Lockfile source policy passed: no unapproved git sources in ${LOCKFILE}.${note}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
