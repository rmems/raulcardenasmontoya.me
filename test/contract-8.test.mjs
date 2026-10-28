// Contract 8 (RM-2355): the 64-neuron, 512-synapse audited topology behind a
// contract bump. Everything contract 7 does (the projection once, detached
// snapshots across the worker) now runs on the larger network, and the bridge
// audits it against the projection generated from the crate. Contract 8 is
// the live contract: the demo, the committed package and the worker all run
// it by default.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource } from './load-ts-module.mjs';
import { bridge, channelModule, contractBank, wasmSession } from './contract-bank.mjs';

const kit = await contractBank({
  contract: 8,
  neurons: 64,
  fanOut: 8,
  live: true,
  badStates: [
    ['a contract-7 state from a contract-8 adapter', { contract_version: 7 }],
    ['a 48-neuron potential vector', { membrane_potentials: new Float32Array(48) }],
  ],
  foreignContracts: [6, 7],
  otherDigests: [
    { digest: bridge.auditedBrowserTopology(7).digest, message: "contract 8 runs its own topology, not contract 7's" },
  ],
});

kit.registerSharedTests();

test('contract 8 keeps its own 64 / 512 projection apart from contract 7\'s 48 / 288 one', () => {
  const seven = bridge.auditedBrowserTopology(7);
  assert.equal(seven.nodeIds.length, 48);
  assert.equal(seven.edgeSources.length, 288);
  assert.notEqual(seven.digest, kit.digest);
});

test('the live options select contract 8 and a worker session re-attaches the topology sent with ready', async () => {
  assert.equal(wasmSession.LIVE_ADAPTER_OPTIONS.contractVersion, 8);
  assert.deepEqual(wasmSession.liveAdapterConfig('rate'), [8, 2]);
  assert.equal(bridge.topologySentOnce(8), true);
  assert.equal(bridge.topologySentOnce(5), false);

  const fake = kit.fakeModule();
  const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: 8 });
  const topology = bridge.cloneTopology(adapter.topology());
  const detached = bridge.detachTopology(adapter.step());
  adapter.dispose();

  const listeners = {};
  const posted = [];
  const worker = {
    postMessage(message) {
      posted.push(message);
      const deliver = (data) => queueMicrotask(() => (worker.onmessage ?? listeners.message)?.({ data }));
      if (message.type === 'init') deliver({ id: message.id, type: 'ready', topology });
      if (message.type === 'input') deliver({ id: message.id, type: 'ack' });
      if (message.type === 'step') deliver({ id: message.id, type: 'state', state: { ...detached, completedStep: BigInt(posted.filter((m) => m.type === 'step').length) } });
    },
    addEventListener(type, listener) { listeners[type] = listener; },
    removeEventListener() {},
    terminate() {},
    onerror: null,
    onmessageerror: null,
    onmessage: null,
  };
  const channel = channelModule.createSimulationChannel();
  const published = [];
  channel.subscribe((state) => published.push(state));
  const seam = wasmSession.createWasmSeam({ channel, workerFactory: () => worker });
  const session = await seam.init({ useWorker: true, signal: new AbortController().signal, onWorkerFailure: () => {}, encoderMode: 'temporal' });
  assert.deepEqual(posted[0].options, { contractVersion: 8, encoderMode: 'temporal' });
  session.resume();
  await new Promise((resolve) => setTimeout(resolve, 130));
  session.dispose();
  assert.ok(published.length >= 1);
  for (const state of published) {
    assert.equal(state.topologyEdgeSources, topology.topologyEdgeSources, 'the main thread attached its one copy');
    assert.equal(state.topologyNodeIds.length, kit.neurons);
    assert.equal(state.topologyDigest, kit.digest);
  }
  // The shipped worker detaches once-sent contracts by predicate, not by one version number.
  const workerSource = readSource('../src/runtime/neuromorphic-worker.ts');
  assert.match(workerSource, /topologySentOnce\(state\.contractVersion\)/);
  assert.doesNotMatch(workerSource, /NEUROMORPHIC_CONTRACT_VERSION_V6/);
});
