import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ALLOWED_GIT_SOURCES, gitSourceViolations, LOCKFILE, lockfilePackages } from '../scripts/verify-lockfile-sources.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = (name) => readFileSync(new URL(`./fixtures/cargo-lock/${name}`, import.meta.url), 'utf8');

test('the committed adapter lockfile has no unapproved git sources', () => {
  const { violations, allowlisted } = gitSourceViolations(read(LOCKFILE));

  assert.deepEqual(violations, []);
  // The only allowed git source is plasticity-lab, pending its crates.io release.
  assert.deepEqual(allowlisted.map((entry) => entry.split(' ')[0]), ['plasticity-lab']);
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

test('the guard detects the real plasticity-lab git source when it is not allowlisted', () => {
  // Proves the committed git source is actually seen: with an empty allowlist,
  // the same lockfile that passes above now fails.
  const { violations } = gitSourceViolations(read(LOCKFILE), new Map());

  assert.equal(violations.length, 1);
  assert.match(violations[0], /^plasticity-lab .*: git source git\+https:\/\/github\.com\/Limen-Neural\/plasticity-lab\.git\?rev=/);
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

test('the allowlist documents why each git source is still allowed', () => {
  for (const [name, reason] of ALLOWED_GIT_SOURCES) {
    assert.ok(reason.length > 20, `${name} needs a reason`);
    assert.match(reason, /#162/, `${name} names the tracking issue`);
  }
});
