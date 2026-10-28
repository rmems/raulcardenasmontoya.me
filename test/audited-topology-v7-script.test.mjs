// `scripts/audited-topology-v7.mjs` reads the generated contract-7 and
// contract-8 projections as data for the scripts that cannot import
// TypeScript (the WASM smoke tests and the browser performance harness). It
// must agree with the TypeScript modules and fail closed on anything that is
// not the generated shape.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAuditedTopologyV7, parseAuditedTopologyV8, readAuditedTopologyV7, readAuditedTopologyV8 } from '../scripts/audited-topology-v7.mjs';
import { loadTsModule, readSource } from './load-ts-module.mjs';

const generatedV7 = await loadTsModule('../src/runtime/audited-topology-v7.ts');
const sourceV7 = readSource('../src/runtime/audited-topology-v7.ts');
const generatedV8 = await loadTsModule('../src/runtime/audited-topology-v8.ts');
const sourceV8 = readSource('../src/runtime/audited-topology-v8.ts');

test('the script reader returns exactly what the contract-7 TypeScript module exports', async () => {
  const module = generatedV7.AUDITED_TOPOLOGY_V7;
  for (const parsed of [parseAuditedTopologyV7(sourceV7), await readAuditedTopologyV7()]) {
    assert.equal(parsed.digest, module.digest);
    assert.equal(parsed.neurons, module.neurons);
    assert.equal(parsed.fanOut, module.fanOut);
    assert.equal(parsed.maxDelay, module.maxDelay);
    for (const key of ['edgeTargets', 'edgeDelays', 'polarities', 'weightBits']) {
      assert.deepEqual(parsed[key], [...module[key]], key);
    }
  }
  assert.equal(parseAuditedTopologyV7(sourceV7).edgeTargets.length, 288);
});

test('the script reader returns exactly what the contract-8 TypeScript module exports', async () => {
  const module = generatedV8.AUDITED_TOPOLOGY_V8;
  for (const parsed of [parseAuditedTopologyV8(sourceV8), await readAuditedTopologyV8()]) {
    assert.equal(parsed.digest, module.digest);
    assert.equal(parsed.neurons, module.neurons);
    assert.equal(parsed.fanOut, module.fanOut);
    assert.equal(parsed.maxDelay, module.maxDelay);
    for (const key of ['edgeTargets', 'edgeDelays', 'polarities', 'weightBits']) {
      assert.deepEqual(parsed[key], [...module[key]], key);
    }
  }
  assert.equal(parseAuditedTopologyV8(sourceV8).edgeTargets.length, 512);
});

// The mutations match either line ending: the generated modules are checked
// out CRLF on Windows and LF on CI.
test('the script reader fails closed on a contract-7 module that is not the generated shape', () => {
  const broken = (edit) => () => parseAuditedTopologyV7(edit(sourceV7));
  assert.throws(broken((s) => s.replace(/digest: '[^']+'/, "digest: 'nope'")), /no digest/);
  assert.throws(broken((s) => s.replace(/neurons: 48/, 'neurons: 0')), /no neurons/);
  assert.throws(broken((s) => s.replace(/maxDelay: 4,/, '')), /no maxDelay/);
  assert.throws(broken((s) => s.replace(/edgeTargets: \[/, 'edgeTargets: [\n    99,')), /edgeTargets does not hold 288 entries/);
  assert.throws(broken((s) => s.replace(/edgeTargets: \[\r?\n {4}1,/, 'edgeTargets: [\n    48,')), /outside the network/);
  assert.throws(broken((s) => s.replace(/edgeDelays: \[\r?\n {4}3,/, 'edgeDelays: [\n    9,')), /delay outside/);
  assert.throws(broken((s) => s.replace(/polarities: \[\r?\n {4}1,/, 'polarities: [\n    2,')), /polarity other than/);
  assert.throws(broken((s) => s.replace(/weightBits: \[\r?\n {4}(\d+),/, 'weightBits: [\n    -1,')), /non-integer/);
  assert.throws(broken((s) => s.replace(/weightBits: \[\r?\n {4}(\d+),/, 'weightBits: [\n    x,')), /non-integer/);
});

test('the script reader fails closed on a contract-8 module that is not the generated shape', () => {
  const broken = (edit) => () => parseAuditedTopologyV8(edit(sourceV8));
  assert.throws(broken((s) => s.replace(/digest: '[^']+'/, "digest: 'nope'")), /no digest/);
  assert.throws(broken((s) => s.replace(/neurons: 64/, 'neurons: 0')), /no neurons/);
  assert.throws(broken((s) => s.replace(/maxDelay: 4,/, '')), /no maxDelay/);
  assert.throws(broken((s) => s.replace(/edgeTargets: \[/, 'edgeTargets: [\n    99,')), /edgeTargets does not hold 512 entries/);
  assert.throws(broken((s) => s.replace(/edgeTargets: \[\r?\n {4}1,/, 'edgeTargets: [\n    64,')), /outside the network/);
  assert.throws(broken((s) => s.replace(/edgeDelays: \[\r?\n {4}3,/, 'edgeDelays: [\n    9,')), /delay outside/);
  assert.throws(broken((s) => s.replace(/polarities: \[\r?\n {4}1,/, 'polarities: [\n    2,')), /polarity other than/);
  assert.throws(broken((s) => s.replace(/weightBits: \[\r?\n {4}(\d+),/, 'weightBits: [\n    -1,')), /non-integer/);
  assert.throws(broken((s) => s.replace(/weightBits: \[\r?\n {4}(\d+),/, 'weightBits: [\n    x,')), /non-integer/);
});

test('both smoke scripts and the browser harness read the projections through the shared reader', () => {
  for (const script of ['../scripts/verify-neuromorphic-wasm.mjs', '../scripts/verify-neuromorphic-browser.mjs']) {
    assert.match(readSource(script), /readAuditedTopologyV7/, script);
    assert.match(readSource(script), /readAuditedTopologyV8/, script);
    assert.doesNotMatch(readSource(script), /function auditedTopology/, script);
  }
  assert.match(readSource('../scripts/perf/measure-browser.mjs'), /readAuditedTopologyV8/);
  assert.doesNotMatch(readSource('../scripts/perf/measure-browser.mjs'), /readAuditedTopologyV7/);
});
