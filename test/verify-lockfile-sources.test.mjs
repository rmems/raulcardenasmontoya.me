import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import test from 'node:test';

import { ALLOWED_GIT_SOURCES, gitSourceViolations, LOCKFILE, lockfilePackages, main } from '../scripts/verify-lockfile-sources.mjs';
import { skipWithoutSymlinks } from './platform-capabilities.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = (name) => readFileSync(new URL(`./fixtures/cargo-lock/${name}`, import.meta.url), 'utf8');
const fixtureRelative = (name) => `test/fixtures/cargo-lock/${name}`;
const guardScript = fileURLToPath(new URL('../scripts/verify-lockfile-sources.mjs', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

test('the allowlist is empty, so every adapter dependency resolves from crates.io', () => {
  assert.equal(ALLOWED_GIT_SOURCES.size, 0);
});

test('the committed adapter lockfile resolves every package from crates.io', () => {
  const { violations, allowlisted } = gitSourceViolations(read(LOCKFILE));

  assert.deepEqual(violations, []);
  assert.deepEqual(allowlisted, [], 'no git sources remain allowlisted');
});

test('the guard fails on a lockfile that carries a git source', () => {
  const { violations, allowlisted } = gitSourceViolations(fixture('git-source.lock'));

  assert.deepEqual(violations, [
    'sneaky-lab 0.3.0: git source git+https://github.com/example/sneaky-lab.git?rev=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef#deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  ]);
  assert.deepEqual(allowlisted, []);
});

test('the guard rejects an indented or spaced-out source field', () => {
  const lockfile = [
    '[[package]]',
    '  name = "sneaky-lab"',
    '  version  =  "0.3.0"',
    '  source   =   "git+https://github.com/example/sneaky-lab.git?rev=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef#deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"',
    '',
  ].join('\n');

  const { violations } = gitSourceViolations(lockfile);
  assert.equal(violations.length, 1, 'indented source is still detected');
  assert.match(violations[0], /^sneaky-lab 0\.3\.0: git source git\+/);
});

test('the guard accepts a registry-only lockfile', () => {
  assert.deepEqual(gitSourceViolations(fixture('registry-only.lock')), { violations: [], allowlisted: [] });
});

test('the CLI entrypoint exits non-zero on a git source and zero on a registry-only lockfile', () => {
  const failing = spawnSync(process.execPath, [guardScript, fixtureRelative('git-source.lock')], { encoding: 'utf8' });
  assert.notEqual(failing.status, 0, 'a git source fails the guard');
  assert.match(failing.stderr, /resolves dependencies from git/);

  const passing = spawnSync(process.execPath, [guardScript, fixtureRelative('registry-only.lock')], { encoding: 'utf8' });
  assert.equal(passing.status, 0, 'a registry-only lockfile passes');
  assert.match(passing.stdout, /Lockfile source policy passed/);

  const committed = spawnSync(process.execPath, [guardScript], { encoding: 'utf8' });
  assert.equal(committed.status, 0, 'the committed lockfile passes');
});

test('main reads inside the repository and refuses a path that escapes it', async () => {
  await assert.doesNotReject(main(fixtureRelative('registry-only.lock')));
  await assert.rejects(main(fixtureRelative('git-source.lock')), /resolves dependencies from git/);
  await assert.rejects(main('../../../../etc/passwd'), /outside the repository/);
});

test('main refuses a symlink that points outside the repository', { skip: skipWithoutSymlinks }, async () => {
  const outside = mkdtempSync(join(tmpdir(), 'lockfile-guard-'));
  const target = join(outside, 'external.lock');
  writeFileSync(target, '[[package]]\nname = "outside"\n');
  const link = join(repositoryRoot, 'test', 'fixtures', `escape-${process.pid}.lock`);
  symlinkSync(target, link);
  try {
    await assert.rejects(main(link), /outside the repository/);
  } finally {
    rmSync(link, { force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('an allowlist entry is bound to the exact reviewed source, not just the name', () => {
  const allowed = new Map([
    ['plasticity-lab', { source: 'git+https://github.com/Limen-Neural/plasticity-lab.git?rev=aaaa#aaaa', reason: 'test fixture (#162)' }],
  ]);
  const lockfile = [
    '[[package]]',
    'name = "plasticity-lab"',
    'version = "0.3.0"',
    'source = "git+https://github.com/Limen-Neural/plasticity-lab.git?rev=aaaa#aaaa"',
    '',
    '[[package]]',
    'name = "plasticity-lab"',
    'version = "0.3.0"',
    'source = "git+https://github.com/example/plasticity-lab.git?rev=bbbb#bbbb"',
    '',
  ].join('\n');
  const { violations, allowlisted } = gitSourceViolations(lockfile, allowed);

  assert.deepEqual(allowlisted, ['plasticity-lab 0.3.0: git+https://github.com/Limen-Neural/plasticity-lab.git?rev=aaaa#aaaa']);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /plasticity-lab 0\.3\.0: git source .* is not the reviewed allowlisted source/);
});

test('lockfilePackages reads name, version, and source for every package', () => {
  const packages = lockfilePackages(fixture('git-source.lock'));

  assert.deepEqual(packages.map(({ name, version }) => [name, version]), [
    ['corpus-ipc', '0.2.1'],
    ['neuromorphic-adapter', '0.1.0'],
    ['sneaky-lab', '0.3.0'],
  ]);
  assert.equal(packages[1].source, null);
  assert.match(packages[2].source, /^git\+/);
});

test('the git-source guard runs before any cargo command in validate:rust and CI', () => {
  const packageJson = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/quality.yml');

  const script = packageJson.scripts['validate:rust'];
  const guardAt = script.indexOf('node scripts/verify-lockfile-sources.mjs');
  const cargoAt = script.indexOf('cargo ');
  assert.notEqual(guardAt, -1, 'validate:rust runs the guard');
  assert.ok(guardAt < cargoAt, 'the guard runs before cargo resolves the adapter graph');

  const workflowGuardAt = workflow.indexOf('node scripts/verify-lockfile-sources.mjs');
  const firstCargo = workflow.search(/^\s+cargo\s/m);
  assert.notEqual(workflowGuardAt, -1, 'CI runs the guard');
  assert.notEqual(firstCargo, -1, 'CI runs cargo');
  assert.ok(workflowGuardAt < firstCargo, 'CI rejects git sources before any cargo command resolves the graph');
});
