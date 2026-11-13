import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ALLOWED_GIT_SOURCES, gitSourceViolations, LOCKFILE, lockfilePackages } from '../scripts/verify-lockfile-sources.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = (name) => readFileSync(new URL(`./fixtures/cargo-lock/${name}`, import.meta.url), 'utf8');

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

test('the guard accepts a registry-only lockfile', () => {
  assert.deepEqual(gitSourceViolations(fixture('registry-only.lock')), { violations: [], allowlisted: [] });
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

test('the git-source guard runs from validate:rust and CI', () => {
  const packageJson = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/quality.yml');

  assert.match(packageJson.scripts['validate:rust'], /node scripts\/verify-lockfile-sources\.mjs/);
  assert.match(workflow, /node scripts\/verify-lockfile-sources\.mjs/);
});
