import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Capability probes for tests that need OS features not every dev machine has.
 * Each returns `false` when supported, or a skip reason string (usable as the
 * `skip` option of `node:test`). On CI nothing is skipped: an unsupported
 * capability there fails the test instead of hiding it.
 */
function probe(reason, attempt) {
  if (process.env.CI) return false;
  const directory = mkdtempSync(join(tmpdir(), 'capability-probe-'));
  try {
    return attempt(directory) ? false : reason;
  } catch {
    return reason;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export const skipWithoutSymlinks = probe(
  'symlinks are unavailable (Windows needs Developer Mode or admin rights)',
  (directory) => {
    writeFileSync(join(directory, 'target'), '');
    symlinkSync(join(directory, 'target'), join(directory, 'link'));
    return true;
  },
);

export const skipWithoutCargo = probe(
  'cargo is not on PATH; install the Rust toolchain from AGENTS.md to run this test',
  () => {
    // Mirror scripts/verify-browser-dependencies.mjs, which runs the pinned toolchain from CARGO_HOME.
    const cargo = join(process.env.CARGO_HOME || join(homedir(), '.cargo'), 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
    if (!statSync(cargo).isFile()) return false;
    return spawnSync(cargo, ['+1.99.0', '--version'], {
      stdio: 'ignore',
      // Keep the probe offline: never let rustup download the toolchain just to decide on a skip.
      env: { ...process.env, RUSTUP_AUTO_INSTALL: '0' },
    }).status === 0;
  },
);
