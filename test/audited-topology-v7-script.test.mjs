// `scripts/audited-topology-v7.mjs` reads the generated contract-7 projection as
// data for the scripts that cannot import TypeScript (the WASM smoke tests and
// the browser performance harness). It must agree with the TypeScript module
// and fail closed on anything that is not the generated shape.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAuditedTopologyV7, readAuditedTopologyV7 } from '../scripts/audited-topology-v7.mjs';
import { loadTsModule, readSource } from './load-ts-module.mjs';

const generated = await loadTsModule('../src/runtime/audited-topology-v7.ts');
const source = readSource('../src/runtime/audited-topology-v7.ts');

test('the script reader returns exactly what the TypeScript module exports', async () => {
  const module = generated.AUDITED_TOPOLOGY_V7;
  for (const parsed of [parseAuditedTopologyV7(source), await readAuditedTopologyV7()]) {
    assert.equal(parsed.digest, module.digest);
    assert.equal(parsed.neurons, module.neurons);
    assert.equal(parsed.fanOut, module.fanOut);
    assert.equal(parsed.maxDelay, module.maxDelay);
    for (const key of ['edgeTargets', 'edgeDelays', 'polarities', 'weightBits']) {
      assert.deepEqual(parsed[key], [...module[key]], key);
    }
  }
  assert.equal(parseAuditedTopologyV7(source).edgeTargets.length, 288);
});

test('the script reader fails closed on a module that is not the generated shape', () => {
  const broken = (edit) => () => parseAuditedTopologyV7(edit(source));
  assert.throws(broken((s) => s.replace(/digest: '[^']+'/, "digest: 'nope'")), /no digest/);
  assert.throws(broken((s) => s.replace(/neurons: 48/, 'neurons: 0')), /no neurons/);
  assert.throws(broken((s) => s.replace(/maxDelay: 4,/, '')), /no maxDelay/);
  assert.throws(broken((s) => s.replace(/edgeTargets: \[/, 'edgeTargets: [\n    99,')), /edgeTargets does not hold 288 entries/);
  assert.throws(broken((s) => s.replace(/edgeTargets: \[\n {4}1,/, 'edgeTargets: [\n    48,')), /outside the network/);
  assert.throws(broken((s) => s.replace(/edgeDelays: \[\n {4}3,/, 'edgeDelays: [\n    9,')), /delay outside/);
  assert.throws(broken((s) => s.replace(/polarities: \[\n {4}1,/, 'polarities: [\n    2,')), /polarity other than/);
  assert.throws(broken((s) => s.replace(/weightBits: \[\n {4}(\d+),/, 'weightBits: [\n    -1,')), /non-integer/);
  assert.throws(broken((s) => s.replace(/weightBits: \[\n {4}(\d+),/, 'weightBits: [\n    x,')), /non-integer/);
});

test('both smoke scripts and the browser harness read the projection through the shared reader', () => {
  for (const script of ['../scripts/verify-neuromorphic-wasm.mjs', '../scripts/verify-neuromorphic-browser.mjs', '../scripts/perf/measure-browser.mjs']) {
    assert.match(readSource(script), /readAuditedTopologyV7/, script);
    assert.doesNotMatch(readSource(script), /function auditedTopologyV7/, script);
  }
});
