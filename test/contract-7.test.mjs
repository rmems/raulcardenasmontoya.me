// Contract 7 (RM-2355): the 48-neuron, 288-synapse audited topology behind a
// contract bump. Everything contract 6 does (the projection once, detached
// snapshots across the worker) now runs on the larger network, and the bridge
// audits it against the projection generated from the crate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTsModule, readSource } from './load-ts-module.mjs';

const bridge = await loadTsModule('../src/runtime/neuromorphic-adapter.ts');
const generated = await loadTsModule('../src/runtime/audited-topology-v7.ts');
const wasmSession = await loadTsModule('../src/runtime/wasm-session.ts');
const stimulus = await loadTsModule('../src/runtime/demo-stimulus.ts');

const NEURONS = 48;
const FAN_OUT = 6;
const EDGES = NEURONS * FAN_OUT;
const DIGEST = generated.AUDITED_TOPOLOGY_V7.digest;
const LEGACY_DIGEST = 'synaptic-wiring.topology.digest.v1:sha256:26875faf05121b9afda27a533760369da67ba9110599fb61533f08961ff6e971';

const wasmUrl = new URL('../public/wasm/neuromorphic-adapter/neuromorphic_adapter.js', import.meta.url);
const wasmBytes = readFileSync(new URL('../public/wasm/neuromorphic-adapter/neuromorphic_adapter_bg.wasm', import.meta.url));

const offsets = () => new Uint32Array([...Array(NEURONS + 1).keys()].map((index) => index * FAN_OUT));

/** The audited contract-7 topology as the raw `topology()` handle would expose it. */
function rawTopology(overrides = {}) {
  const audited = bridge.auditedBrowserTopology(7);
  // The canonical projection is grouped by source with six edges each, and the
  // routed check is a per-source multiset, so the canonical arrays serve as
  // the routed CSR view too.
  return {
    topology_rows: offsets(),
    topology_targets: audited.edgeTargets.slice(),
    topology_weights: audited.edgeWeights.slice(),
    topology_delays: audited.edgeDelays.slice(),
    topology_node_ids: audited.nodeIds,
    topology_edge_sources: audited.edgeSources,
    topology_edge_targets: audited.edgeTargets,
    topology_edge_weights: audited.edgeWeights,
    topology_edge_delays: audited.edgeDelays,
    topology_polarities: audited.polarities,
    topology_weight_bits: audited.weightBits,
    topology_outgoing_edge_offsets: offsets(),
    topology_digest: DIGEST,
    ...overrides,
  };
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

function rawStateV7(overrides = {}) {
  return {
    contract_version: 7,
    seed: 9n,
    completed_step: 3n,
    last_sequence: 3n,
    membrane_potentials: new Float32Array(NEURONS).fill(0.125),
    spike_neurons: new Uint32Array([2, 7, 40]),
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

function fakeModule({ topology = rawTopology(), state = rawStateV7(), withTopology = true } = {}) {
  const calls = { init: [], topology: 0, free: 0 };
  return {
    calls,
    module: async () => ({
      async default() {},
      WasmAdapter: {
        init(seed, config) {
          calls.init.push([seed, [...config]]);
          const adapter = { input() {}, step: () => state, state: () => state, dispose() {} };
          if (withTopology) {
            adapter.topology = () => {
              calls.topology += 1;
              return { ...topology, free() { calls.free += 1; } };
            };
          }
          return adapter;
        },
      },
    }),
  };
}

async function liveAdapter(encoderMode) {
  return bridge.initNeuromorphicAdapter(
    async () => {
      const generatedPackage = await import(wasmUrl.href);
      return {
        default: () => generatedPackage.default({ module_or_path: wasmBytes }),
        WasmAdapter: generatedPackage.WasmAdapter,
      };
    },
    stimulus.DEMO_SEED,
    // Contract 7 is no longer the live contract; this file pins it against
    // the committed package, which still accepts [7, mode].
    { ...wasmSession.LIVE_ADAPTER_OPTIONS, contractVersion: 7, encoderMode },
  );
}

test('the generated contract-7 projection is 48 neurons with six synapses each and is what the bridge audits', () => {
  const module = generated.AUDITED_TOPOLOGY_V7;
  assert.equal(module.contract, 7);
  assert.equal(module.neurons, NEURONS);
  assert.equal(module.fanOut, FAN_OUT);
  assert.equal(module.maxDelay, 4);
  assert.match(module.digest, /^synaptic-wiring\.topology\.digest\.v1:sha256:[0-9a-f]{64}$/);
  assert.notEqual(module.digest, LEGACY_DIGEST);
  for (const key of ['edgeTargets', 'edgeDelays', 'polarities', 'weightBits']) {
    assert.equal(module[key].length, EDGES, key);
  }
  assert.ok(module.edgeTargets.every((target) => Number.isInteger(target) && target >= 0 && target < NEURONS));
  assert.ok(module.edgeDelays.every((delay) => delay >= 1 && delay <= module.maxDelay));
  assert.ok(module.polarities.every((polarity) => polarity === 0 || polarity === 1));
  assert.equal(module.polarities.filter((polarity) => polarity === 1).length, EDGES / 4, 'a quarter of the synapses are inhibitory');
  assert.match(readSource('../src/runtime/audited-topology-v7.ts'), /^\/\/ Generated by `cargo test --locked --test audited_topology regenerate_audited_topology_v7/);

  const audited = bridge.auditedBrowserTopology(7);
  assert.equal(bridge.NEUROMORPHIC_LIVE_CONTRACT_VERSION, 8, 'the live contract is 8');
  assert.equal(audited.contractVersion, 7);
  assert.equal(audited.digest, module.digest);
  assert.deepEqual([...audited.nodeIds], [...Array(NEURONS).keys()]);
  assert.deepEqual([...audited.edgeSources], [...Array(NEURONS).keys()].flatMap((source) => Array(FAN_OUT).fill(source)));
  assert.deepEqual([...audited.edgeTargets], [...module.edgeTargets]);
  assert.deepEqual([...audited.edgeDelays], [...module.edgeDelays]);
  assert.deepEqual([...audited.polarities], [...module.polarities]);
  assert.deepEqual([...audited.weightBits], [...module.weightBits]);
  assert.deepEqual([...new Uint32Array(audited.edgeWeights.buffer)], [...module.weightBits]);
  assert.deepEqual(bridge.auditedBrowserTopology(7), audited);
  assert.notEqual(bridge.auditedBrowserTopology(8).digest, audited.digest, 'contract 8 runs its own 64 / 512 topology');
  assert.throws(() => bridge.auditedBrowserTopology(9), RangeError);
  // The default is the live contract, and contracts 3 to 6 keep the legacy network.
  for (const contract of [3, 4, 5, 6]) {
    const legacy = bridge.auditedBrowserTopology(contract);
    assert.equal(legacy.digest, LEGACY_DIGEST, `contract ${contract}`);
    assert.equal(legacy.nodeIds.length, 16);
    assert.equal(legacy.edgeSources.length, 64);
  }
});

test('contract 7 reads the topology once, validates it against the generated projection, and attaches it to every snapshot', async () => {
  const fake = fakeModule();
  const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: 7, encoderMode: 'temporal' });
  assert.deepEqual(fake.calls.init, [[9n, [7, 1]]]);
  assert.equal(fake.calls.topology, 1);
  assert.equal(fake.calls.free, 1);

  const first = adapter.step();
  const second = adapter.step();
  assert.equal(first.contractVersion, 7);
  assert.equal(first.topologyEdgeSources.length, EDGES);
  assert.equal(first.topologyNodeIds.length, NEURONS);
  assert.equal(first.topologyOutgoingEdgeOffsets[NEURONS], EDGES);
  assert.equal(first.topologyDigest, DIGEST);
  assert.equal(first.topologyEdgeSources, second.topologyEdgeSources, 'snapshots share one projection');
  assert.equal(first.membranePotentials.length, NEURONS);
  assert.deepEqual([...first.spikeNeurons], [2, 7, 40]);
  assert.deepEqual([...first.encoderFeatures], Array(16).fill(0.5), 'the encoder contract stays 16 features');
  assert.equal(adapter.topology().topologyEdgeSources, first.topologyEdgeSources);
  adapter.dispose();
});

test('contract 7 snapshots must carry empty topology arrays, the session digest, and 48-neuron state', async () => {
  for (const [name, overrides] of [
    ['a repeated projection', { topology_edge_sources: new Uint32Array([0]) }],
    ['another digest', { topology_digest: LEGACY_DIGEST }],
    ['a contract-6 state from a contract-7 adapter', { contract_version: 6 }],
    ['a 16-neuron potential vector', { membrane_potentials: new Float32Array(16) }],
    ['a spike outside the 48 neurons', { spike_neurons: new Uint32Array([NEURONS]) }],
  ]) {
    const fake = fakeModule({ state: rawStateV7(overrides) });
    const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: 7 });
    assert.throws(() => adapter.step(), bridge.AdapterUnavailableError, name);
    adapter.dispose();
  }
});

test('contract 7 init fails closed on a projection that is not the audited 48 / 288 one', async () => {
  await assert.rejects(
    bridge.initNeuromorphicAdapter(fakeModule({ withTopology: false }).module, 9n, { contractVersion: 7 }),
    /does not export its topology/,
  );
  const legacy = bridge.auditedBrowserTopology(6);
  const legacyOffsets = new Uint32Array([...Array(17).keys()].map((index) => index * 4));
  const sixteen = rawTopology({
    topology_rows: legacyOffsets,
    topology_targets: legacy.edgeTargets.slice(),
    topology_weights: legacy.edgeWeights.slice(),
    topology_delays: legacy.edgeDelays.slice(),
    topology_node_ids: legacy.nodeIds,
    topology_edge_sources: legacy.edgeSources,
    topology_edge_targets: legacy.edgeTargets,
    topology_edge_weights: legacy.edgeWeights,
    topology_edge_delays: legacy.edgeDelays,
    topology_polarities: legacy.polarities,
    topology_weight_bits: legacy.weightBits,
    topology_outgoing_edge_offsets: legacyOffsets,
  });
  for (const [name, topology] of [
    ['the 16 / 64 network under the contract-7 digest', sixteen],
    ['the 16 / 64 network with its own digest', { ...sixteen, topology_digest: LEGACY_DIGEST }],
    ['a flipped polarity', rawTopology({ topology_polarities: bridge.auditedBrowserTopology(7).polarities.map((polarity, edge) => (edge === 0 ? 1 - polarity : polarity)) })],
    ['a target outside the network', rawTopology({ topology_edge_targets: bridge.auditedBrowserTopology(7).edgeTargets.map((target, edge) => (edge === 5 ? NEURONS : target)) })],
    ['a foreign digest', rawTopology({ topology_digest: 'synaptic-wiring.topology.digest.v1:sha256:0000' })],
  ]) {
    await assert.rejects(
      bridge.initNeuromorphicAdapter(fakeModule({ topology }).module, 9n, { contractVersion: 7 }),
      /invalid topology/,
      name,
    );
  }
});

test('the committed homepage package exports exactly the audited contract-7 topology and runs 48 neurons', async () => {
  const audited = bridge.auditedBrowserTopology(7);
  const adapter = await liveAdapter();
  try {
    const topology = adapter.topology();
    assert.equal(topology.topologyDigest, audited.digest);
    assert.deepEqual([...topology.topologyNodeIds], [...audited.nodeIds]);
    assert.deepEqual([...topology.topologyEdgeTargets], [...audited.edgeTargets]);
    assert.deepEqual([...topology.topologyWeightBits], [...audited.weightBits]);
    let spiked = 0;
    for (let sequence = 1n; sequence <= 200n; sequence += 1n) {
      adapter.input(sequence, stimulus.scriptedTelemetry(sequence));
      const state = adapter.step();
      assert.equal(state.contractVersion, 7);
      assert.equal(state.membranePotentials.length, NEURONS);
      assert.ok(state.spikeNeurons.every((neuron) => neuron < NEURONS));
      assert.ok(state.spikeNeurons.length < NEURONS / 2, 'never half the population in one step');
      assert.equal(state.topologyEdgeSources, topology.topologyEdgeSources, 'the one shared projection');
      spiked += state.spikeNeurons.length;
    }
    assert.ok(spiked >= 200 * 48 * 0.05 && spiked <= 200 * 48 * 0.2, `sparse: ${spiked} spikes in 200 steps`);
  } finally {
    adapter.dispose();
  }
});

test('contract 7 is no longer the live contract but keeps its 48 / 288 projection and worker path', async () => {
  assert.notEqual(wasmSession.LIVE_ADAPTER_OPTIONS.contractVersion, 7);
  assert.equal(bridge.topologySentOnce(7), true);
  const audited = bridge.auditedBrowserTopology(7);
  assert.equal(audited.contractVersion, 7, 'contract 7 keeps its own projection');
  assert.equal(audited.digest, DIGEST);
  assert.equal(audited.nodeIds.length, 48);
  assert.equal(audited.edgeSources.length, 288);
  // A contract-7 adapter still rejects the contract-8 projection, and vice versa.
  const eight = bridge.auditedBrowserTopology(8);
  await assert.rejects(
    bridge.initNeuromorphicAdapter(
      fakeModule({ topology: rawTopology({ topology_digest: eight.digest }) }).module,
      9n,
      { contractVersion: 7 },
    ),
    /invalid topology/,
  );
});
