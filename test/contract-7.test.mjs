// Contract 7 (RM-2355): the 48-neuron, 288-synapse audited topology behind a
// contract bump. Everything contract 6 does (the projection once, detached
// snapshots across the worker) now runs on the larger network, and the bridge
// audits it against the projection generated from the crate. Contract 8 has
// since taken the live slot (the same RM-2355 work); this file pins contract 7
// against the committed package, which still accepts [7, mode].
import assert from 'node:assert/strict';
import test from 'node:test';
import { bridge, contractBank, wasmSession } from './contract-bank.mjs';

const kit = await contractBank({
  contract: 7,
  neurons: 48,
  fanOut: 6,
  badStates: [
    ['a contract-6 state from a contract-7 adapter', { contract_version: 6 }],
    ['a 16-neuron potential vector', { membrane_potentials: new Float32Array(16) }],
  ],
  foreignContracts: [6],
});

kit.registerSharedTests();

test('contract 7 is no longer the live contract but keeps its 48 / 288 projection and worker path', async () => {
  assert.notEqual(wasmSession.LIVE_ADAPTER_OPTIONS.contractVersion, 7);
  assert.equal(bridge.topologySentOnce(7), true);
  const audited = bridge.auditedBrowserTopology(7);
  assert.equal(audited.contractVersion, 7, 'contract 7 keeps its own projection');
  assert.equal(audited.digest, kit.digest);
  assert.equal(audited.nodeIds.length, 48);
  assert.equal(audited.edgeSources.length, 288);
  assert.notEqual(bridge.auditedBrowserTopology(8).digest, audited.digest, 'contract 8 runs its own 64 / 512 topology');
  // A contract-7 adapter still rejects the contract-8 projection, and vice versa.
  const eight = bridge.auditedBrowserTopology(8);
  await assert.rejects(
    bridge.initNeuromorphicAdapter(
      kit.fakeModule({ topology: kit.rawTopology({ topology_digest: eight.digest }) }).module,
      9n,
      { contractVersion: 7 },
    ),
    /invalid topology/,
  );
});
