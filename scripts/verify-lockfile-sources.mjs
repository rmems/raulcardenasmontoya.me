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
import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = realpathSync(resolve(import.meta.dirname, '..'));
export const LOCKFILE = 'crates/neuromorphic-adapter/Cargo.lock';

/**
 * Git-sourced packages allowed while their crates.io release is unpublished,
 * keyed by package name and pinned to the exact reviewed `source` string. A
 * different URL or `rev` is a different dependency, so it fails the guard and
 * must be reviewed as a new allowlist entry.
 *
 * The map is empty: every adapter dependency resolves from crates.io. Adding an
 * entry means an unreviewable git pin is back in the browser graph, so pair it
 * with the tracking issue that removes it.
 */
export const ALLOWED_GIT_SOURCES = new Map();

/** The unquoted value of `key = "value"`, or null when the line is not that. */
function quotedValue(line, key) {
  const eq = line.indexOf('=');
  if (eq === -1 || line.slice(0, eq).trim() !== key) return null;
  const value = line.slice(eq + 1).trim();
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : null;
}

/**
 * The `[[package]]` entries of a lockfile as `{ name, version, source }`. A
 * line scan rather than a regex, so indented or space-padded keys (valid TOML)
 * still parse and no pattern can backtrack on a crafted lockfile.
 */
export function lockfilePackages(lockfile) {
  const packages = [];
  let current = null;
  for (const rawLine of lockfile.replaceAll('\r\n', '\n').split('\n')) {
    const line = rawLine.trim();
    if (line === '[[package]]') {
      current = { name: null, version: null, source: null };
      packages.push(current);
      continue;
    }
    if (current === null) continue;
    // A different table header ends the package block.
    if (line.startsWith('[')) {
      current = null;
      continue;
    }
    for (const key of ['name', 'version', 'source']) {
      const value = quotedValue(line, key);
      if (value !== null) current[key] = value;
    }
  }
  return packages.filter((pkg) => pkg.name !== null);
}

/**
 * Every git source in the lockfile that is not an allowlisted name pinned to
 * exactly its reviewed source, as `name version: …`. Empty means clean. The
 * allowlisted ones are returned separately so a caller can report them without
 * failing.
 */
export function gitSourceViolations(lockfile, allowed = ALLOWED_GIT_SOURCES) {
  const violations = [];
  const allowlisted = [];
  for (const pkg of lockfilePackages(lockfile)) {
    if (!pkg.source?.startsWith('git+')) continue;
    const entry = allowed.get(pkg.name);
    if (entry?.source === pkg.source) {
      allowlisted.push(`${pkg.name} ${pkg.version}: ${pkg.source}`);
    } else if (entry) {
      violations.push(`${pkg.name} ${pkg.version}: git source ${pkg.source} is not the reviewed allowlisted source ${entry.source}`);
    } else {
      violations.push(`${pkg.name} ${pkg.version}: git source ${pkg.source}`);
    }
  }
  return { violations, allowlisted };
}

export async function main(lockfilePath) {
  // Resolve the real path inside the repository and refuse anything that
  // escapes it (including a symlink), so the CLI argument cannot read an
  // arbitrary file.
  const label = lockfilePath ?? LOCKFILE;
  const path = realpathSync(resolve(repository, lockfilePath ?? LOCKFILE));
  if (path !== repository && !path.startsWith(repository + sep)) {
    throw new Error(`Refusing to read a lockfile outside the repository: ${label}`);
  }
  const lockfile = await readFile(path, 'utf8');
  const { violations, allowlisted } = gitSourceViolations(lockfile);

  if (violations.length > 0) {
    throw new Error(
      `${label} resolves dependencies from git; pin them to a crates.io release so the lockfile checksum audits them:\n${violations.join('\n')}`,
    );
  }

  const note = allowlisted.length > 0 ? ` Allowlisted git sources: ${allowlisted.join('; ')}.` : '';
  process.stdout.write(`Lockfile source policy passed: no unapproved git sources in ${label}.${note}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv[2]);
}
