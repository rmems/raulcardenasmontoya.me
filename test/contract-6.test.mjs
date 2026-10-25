// Contract 6 (#95): the topology projection crosses the WASM boundary and the
// worker boundary once; every snapshot shares it; consumers see the same state.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule } from './load-ts-module.mjs';

const bridge = await loadTsModule('../src/runtime/neuromorphic-adapter.ts');
const channelModule = await loadTsModule('../src/runtime/simulation-channel.ts');
const wasmSession = await loadTsModule('../src/runtime/wasm-session.ts');

const DIGEST = 'synaptic-wiring.topology.digest.v1:sha256:26875faf05121b9afda27a533760369da67ba9110599fb61533f08961ff6e971';

/** The audited topology as the raw `topology()` handle would expose it. */
function rawTopology(overrides = {}) {
  const audited = bridge.auditedBrowserTopology();
  const routed = routedArrays(audited);
  return {
    topology_rows: new Uint32Array([...Array(17).keys()].map((index) => index * 4)),
    topology_targets: routed.targets,
    topology_weights: routed.weights,
    topology_delays: routed.delays,
    topology_node_ids: audited.nodeIds,
    topology_edge_sources: audited.edgeSources,
    topology_edge_targets: audited.edgeTargets,
    topology_edge_weights: audited.edgeWeights,
    topology_edge_delays: audited.edgeDelays,
    topology_polarities: audited.polarities,
    topology_weight_bits: audited.weightBits,
    topology_outgoing_edge_offsets: new Uint32Array([...Array(17).keys()].map((index) => index * 4)),
    topology_digest: DIGEST,
    ...overrides,
  };
}

/** The canonical projection is already grouped by source with four edges each, so the routed CSR view is the same multiset in the same order. */
function routedArrays(audited) {
  return { targets: audited.edgeTargets.slice(), weights: audited.edgeWeights.slice(), delays: audited.edgeDelays.slice() };
}

function emptyTopologyArrays() {
  return {
    topology_rows: new Uint32Array(0),
    topology_targets: new Uint32Array(0),
    topology_weights: new Float32Array(0),
    topology_delays: new Uint16Array(0),
    topology_node_ids: new Uint32Array(0),
    topology_edge_sources: new Uint32Array(0),
    topology_edge_targets: new Uint32Array(0),
    topology_edge_weights: new Float32Array(0),
    topology_edge_delays: new Uint16Array(0),
    topology_polarities: new Uint8Array(0),
    topology_weight_bits: new Uint32Array(0),
    topology_outgoing_edge_offsets: new Uint32Array(0),
  };
}

function rawStateV6(overrides = {}) {
  return {
    contract_version: 6,
    seed: 9n,
    completed_step: 3n,
    last_sequence: 3n,
    membrane_potentials: new Float32Array(16).fill(0.125),
    spike_neurons: new Uint32Array([2, 7]),
    ...emptyTopologyArrays(),
    topology_digest: DIGEST,
    protocol_wire_version: 1,
    error_status: 'ok',
    encoder_mode: 1,
    encoder_name: 'temporal',
    encoded_spike_count: 3,
    encoded_spike_channels: 3,
    encoded_spike_total: 9n,
    encoder_features: new Float32Array(16).fill(0.5),
    ...overrides,
  };
}

function fakeModule({ topology = rawTopology(), state = rawStateV6(), withTopology = true, onFree = () => {} } = {}) {
  const calls = { init: [], topology: 0, free: 0 };
  return {
    calls,
    module: async () => ({
      async default() {},
      WasmAdapter: {
        init(seed, config) {
          calls.init.push([seed, [...config]]);
          const adapter = {
            input() {},
            step: () => state,
            state: () => state,
            dispose() {},
          };
          if (withTopology) {
            adapter.topology = () => {
              calls.topology += 1;
              return { ...topology, free() { calls.free += 1; onFree(); } };
            };
          }
          return adapter;
        },
      },
    }),
  };
}

test('contract 6 reads the topology once, validates it, and attaches the same arrays to every snapshot', async () => {
  const fake = fakeModule();
  const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: 6, encoderMode: 'temporal' });
  assert.deepEqual(fake.calls.init, [[9n, [6, 1]]]);
  assert.equal(fake.calls.topology, 1, 'the projection is read at init');
  assert.equal(fake.calls.free, 1, 'the handle is released after the read');

  const first = adapter.step();
  const second = adapter.step();
  assert.equal(first.contractVersion, 6);
  assert.equal(first.topologyEdgeSources.length, 64);
  assert.equal(first.topologyNodeIds.length, 16);
  assert.equal(first.topologyDigest, DIGEST);
  assert.equal(first.topologyEdgeSources, second.topologyEdgeSources, 'snapshots share one projection');
  assert.notEqual(first.membranePotentials, second.membranePotentials, 'per-step arrays are fresh copies');
  assert.deepEqual([...first.encoderFeatures], Array(16).fill(0.5));
  assert.equal(fake.calls.topology, 1, 'no further topology reads per step');

  const topology = adapter.topology();
  assert.equal(topology.topologyEdgeSources, first.topologyEdgeSources);
  assert.equal(topology.topologyDigest, DIGEST);
  for (const field of bridge.TOPOLOGY_ARRAY_FIELDS) {
    assert.ok(ArrayBuffer.isView(topology[field]), field);
  }
  adapter.dispose();
  assert.throws(() => adapter.topology(), /disposed/);
});

test('contract 6 snapshots must carry empty topology arrays and the session digest', async () => {
  for (const [name, overrides] of [
    ['a repeated projection', { topology_edge_sources: new Uint32Array([0]) }],
    ['a wrong array type', { topology_rows: new Uint16Array(0) }],
    ['another digest', { topology_digest: 'synaptic-wiring.topology.digest.v1:sha256:0000' }],
    ['a contract-5 state from a contract-6 adapter', { contract_version: 5 }],
    ['a neuron count that does not match the projection', { membrane_potentials: new Float32Array(15) }],
    ['a spike outside the projection', { spike_neurons: new Uint32Array([16]) }],
  ]) {
    const fake = fakeModule({ state: rawStateV6(overrides) });
    const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: 6 });
    assert.throws(() => adapter.step(), bridge.AdapterUnavailableError, name);
    adapter.dispose();
  }
});

test('contract 6 init fails closed on a missing or invalid projection and disposes the runtime', async () => {
  await assert.rejects(
    bridge.initNeuromorphicAdapter(fakeModule({ withTopology: false }).module, 9n, { contractVersion: 6 }),
    /does not export its topology/,
  );
  const polarities = bridge.auditedBrowserTopology().polarities;
  polarities[0] = 0;
  await assert.rejects(
    bridge.initNeuromorphicAdapter(fakeModule({ topology: rawTopology({ topology_polarities: polarities }) }).module, 9n, { contractVersion: 6 }),
    /invalid topology/,
  );
  await assert.rejects(
    bridge.initNeuromorphicAdapter(fakeModule({ topology: rawTopology({ topology_digest: 'other' }) }).module, 9n, { contractVersion: 6 }),
    /invalid topology/,
  );
});

test('a contract-5 adapter still carries the projection in every snapshot and reports it through topology()', async () => {
  const audited = bridge.auditedBrowserTopology();
  const stateV5 = rawStateV6({ contract_version: 5, ...rawTopology() });
  const fake = fakeModule({ state: stateV5, withTopology: false });
  const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: 5 });
  const snapshot = adapter.step();
  assert.deepEqual([...snapshot.topologyEdgeTargets], [...audited.edgeTargets]);
  const topology = adapter.topology();
  assert.deepEqual([...topology.topologyEdgeTargets], [...audited.edgeTargets]);
  assert.equal(topology.topologyDigest, DIGEST);
  adapter.dispose();
});

test('detach and attach round-trip a snapshot across a worker boundary and refuse a foreign digest', async () => {
  const fake = fakeModule();
  const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: 6 });
  const snapshot = adapter.step();
  const topology = adapter.topology();
  const detached = bridge.detachTopology(snapshot);
  for (const field of bridge.TOPOLOGY_ARRAY_FIELDS) {
    assert.equal(detached[field].length, 0, field);
    assert.equal(detached[field].constructor, snapshot[field].constructor, `${field} keeps its type`);
  }
  assert.equal(detached.topologyDigest, DIGEST);
  assert.equal(detached.membranePotentials, snapshot.membranePotentials);

  const copy = bridge.cloneTopology(topology);
  assert.notEqual(copy.topologyEdgeSources, topology.topologyEdgeSources);
  assert.deepEqual([...copy.topologyEdgeSources], [...topology.topologyEdgeSources]);

  const attached = bridge.attachTopology(detached, copy);
  assert.equal(attached.topologyEdgeSources, copy.topologyEdgeSources);
  assert.equal(attached.completedStep, snapshot.completedStep);
  assert.throws(() => bridge.attachTopology({ ...detached, topologyDigest: 'other' }, copy), /does not belong/);
  adapter.dispose();
});

test('the live options select contract 6 and a worker session re-attaches the topology sent with ready', async () => {
  assert.equal(wasmSession.LIVE_ADAPTER_OPTIONS.contractVersion, 6);
  assert.deepEqual(wasmSession.liveAdapterConfig('rate'), [6, 2]);

  const fake = fakeModule();
  const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: 6 });
  const topology = bridge.cloneTopology(adapter.topology());
  const detached = bridge.detachTopology(adapter.step());
  adapter.dispose();

  // A fake worker that answers like the shipped one: ready carries the
  // topology once, every step reply is detached.
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
  assert.deepEqual(posted[0].options, { contractVersion: 6, encoderMode: 'temporal' });
  session.resume();
  await new Promise((resolve) => setTimeout(resolve, 130));
  session.dispose();
  assert.ok(published.length >= 1, 'at least one snapshot was published');
  for (const state of published) {
    assert.equal(state.topologyEdgeSources, topology.topologyEdgeSources, 'the main thread attached its one copy');
    assert.equal(state.topologyNodeIds.length, 16);
    assert.equal(state.topologyDigest, DIGEST);
  }
});
