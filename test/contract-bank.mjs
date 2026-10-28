// The shared kit for the audited-contract tests (`contract-7.test.mjs`,
// `contract-8.test.mjs`). Every pinned contract proves the same five things
// about its projection — the generated shape and digest, the projection read
// once and attached to every snapshot, snapshots that fail closed, init that
// fails closed on any other network, and the committed homepage package
// exporting exactly the audited topology — so the scaffolding lives here once
// and the per-contract files supply the numbers and anything specific to them.
// `live` marks the contract the demo runs: the bridge's zero-argument
// `auditedBrowserTopology()` then names it, and a demoted contract keeps its
// explicit lookup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTsModule, readSource } from './load-ts-module.mjs';

export const bridge = await loadTsModule('../src/runtime/neuromorphic-adapter.ts');
export const channelModule = await loadTsModule('../src/runtime/simulation-channel.ts');
export const wasmSession = await loadTsModule('../src/runtime/wasm-session.ts');
export const stimulus = await loadTsModule('../src/runtime/demo-stimulus.ts');
export const LEGACY_DIGEST = 'synaptic-wiring.topology.digest.v1:sha256:26875faf05121b9afda27a533760369da67ba9110599fb61533f08961ff6e971';

const wasmUrl = new URL('../public/wasm/neuromorphic-adapter/neuromorphic_adapter.js', import.meta.url);
const wasmBytes = readFileSync(new URL('../public/wasm/neuromorphic-adapter/neuromorphic_adapter_bg.wasm', import.meta.url));

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

/** The fake WASM module every fail-closed test injects: a `WasmAdapter` whose
 *  adapter serves the given topology and state handles, counting calls. */
function buildFakeModule({ topology, state, withTopology }) {
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

/** Build the scaffolding for one audited contract:
 * `contract` pins the version, `neurons` and `fanOut` size its network, `live`
 * marks the contract the demo runs, `badStates` adds snapshot states that must
 * fail closed between the shared digest and spike cases, `foreignContracts`
 * lists other contracts whose audited networks init must reject, and
 * `otherDigests` lists digests the projection must differ from beyond the
 * legacy one. `registerSharedTests()` then adds the five tests every pinned
 * contract shares; the per-contract file adds what is specific to it. */
export async function contractBank({ contract, neurons, fanOut, live = false, badStates = [], foreignContracts = [], otherDigests = [] }) {
  const generated = await loadTsModule(`../src/runtime/audited-topology-v${contract}.ts`);
  const module = generated[`AUDITED_TOPOLOGY_V${contract}`];
  const edges = neurons * fanOut;
  const offsets = () => Uint32Array.from({ length: neurons + 1 }, (_, index) => index * fanOut);
  const auditedOf = () => (live ? bridge.auditedBrowserTopology() : bridge.auditedBrowserTopology(contract));

  /** The audited topology of this contract as the raw `topology()` handle would expose it. */
  function rawTopology(overrides = {}) {
    const audited = bridge.auditedBrowserTopology(contract);
    // The canonical projection is grouped by source with `fanOut` edges each,
    // and the routed check is a per-source multiset, so the canonical arrays
    // serve as the routed CSR view too.
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
      topology_digest: module.digest,
      ...overrides,
    };
  }

  /** Another contract's audited topology under this contract's digest. */
  function foreignTopology(otherContract) {
    const foreign = bridge.auditedBrowserTopology(otherContract);
    // The bridge's projection does not carry the fan-out, so derive it from
    // the audited edges: the CSR offsets must stay valid for the foreign
    // network, or init would reject the case for its offsets, not for its
    // topology.
    const foreignFanOut = foreign.edgeSources.length / foreign.nodeIds.length;
    const foreignOffsets = Uint32Array.from({ length: foreign.nodeIds.length + 1 }, (_, index) => index * foreignFanOut);
    return {
      topology: rawTopology({
        topology_rows: foreignOffsets,
        topology_targets: foreign.edgeTargets.slice(),
        topology_weights: foreign.edgeWeights.slice(),
        topology_delays: foreign.edgeDelays.slice(),
        topology_node_ids: foreign.nodeIds,
        topology_edge_sources: foreign.edgeSources,
        topology_edge_targets: foreign.edgeTargets,
        topology_edge_weights: foreign.edgeWeights,
        topology_edge_delays: foreign.edgeDelays,
        topology_polarities: foreign.polarities,
        topology_weight_bits: foreign.weightBits,
        topology_outgoing_edge_offsets: foreignOffsets,
      }),
      digest: foreign.digest,
      nodeCount: foreign.nodeIds.length,
      edgeCount: foreign.edgeSources.length,
    };
  }

  function rawState(overrides = {}) {
    return {
      contract_version: contract,
      seed: 9n,
      completed_step: 3n,
      last_sequence: 3n,
      membrane_potentials: new Float32Array(neurons).fill(0.125),
      spike_neurons: new Uint32Array([2, 7, 40]),
      ...emptyTopologyArrays(),
      topology_digest: module.digest,
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

  function fakeModule({ topology = rawTopology(), state = rawState(), withTopology = true } = {}) {
    return buildFakeModule({ topology, state, withTopology });
  }

  /** A session against the committed homepage package, pinned to this contract. */
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
      // The committed package still accepts [contract, mode]; pinning the
      // version keeps a demoted contract testable against it.
      { ...wasmSession.LIVE_ADAPTER_OPTIONS, contractVersion: contract, encoderMode },
    );
  }

  function registerSharedTests() {
    test(`the generated contract-${contract} projection is ${neurons} neurons with ${fanOut} synapses each and is what the bridge audits`, () => {
      assert.equal(module.contract, contract);
      assert.equal(module.neurons, neurons);
      assert.equal(module.fanOut, fanOut);
      assert.equal(module.maxDelay, 4);
      assert.match(module.digest, /^synaptic-wiring\.topology\.digest\.v1:sha256:[0-9a-f]{64}$/);
      assert.notEqual(module.digest, LEGACY_DIGEST);
      for (const { digest, message } of otherDigests) {
        assert.notEqual(module.digest, digest, message);
      }
      for (const key of ['edgeTargets', 'edgeDelays', 'polarities', 'weightBits']) {
        assert.equal(module[key].length, edges, key);
      }
      assert.ok(module.edgeTargets.every((target) => Number.isInteger(target) && target >= 0 && target < neurons));
      assert.ok(module.edgeDelays.every((delay) => delay >= 1 && delay <= module.maxDelay));
      assert.ok(module.polarities.every((polarity) => polarity === 0 || polarity === 1));
      assert.equal(module.polarities.filter((polarity) => polarity === 1).length, edges / 4, 'a quarter of the synapses are inhibitory');
      assert.match(readSource(`../src/runtime/audited-topology-v${contract}.ts`), new RegExp(`^// Generated by \`cargo test --locked --test audited_topology regenerate_audited_topology_v${contract}`));

      const audited = auditedOf();
      assert.equal(bridge.NEUROMORPHIC_LIVE_CONTRACT_VERSION, 8, 'the live contract is 8');
      assert.equal(audited.contractVersion, contract);
      assert.equal(audited.digest, module.digest);
      assert.deepEqual([...audited.nodeIds], Array.from({ length: neurons }, (_, index) => index));
      assert.deepEqual([...audited.edgeSources], Array.from({ length: neurons * fanOut }, (_, index) => Math.floor(index / fanOut)));
      assert.deepEqual([...audited.edgeTargets], [...module.edgeTargets]);
      assert.deepEqual([...audited.edgeDelays], [...module.edgeDelays]);
      assert.deepEqual([...audited.polarities], [...module.polarities]);
      assert.deepEqual([...audited.weightBits], [...module.weightBits]);
      assert.deepEqual([...new Uint32Array(audited.edgeWeights.buffer)], [...module.weightBits]);
      assert.deepEqual(bridge.auditedBrowserTopology(contract), audited);
      assert.throws(() => bridge.auditedBrowserTopology(9), RangeError);
      // Contracts 3 to 6 keep the legacy 16 / 64 network.
      for (const legacyContract of [3, 4, 5, 6]) {
        const legacy = bridge.auditedBrowserTopology(legacyContract);
        assert.equal(legacy.digest, LEGACY_DIGEST, `contract ${legacyContract}`);
        assert.equal(legacy.nodeIds.length, 16);
        assert.equal(legacy.edgeSources.length, 64);
      }
    });

    test(`contract ${contract} reads the topology once, validates it against the generated projection, and attaches it to every snapshot`, async () => {
      const fake = fakeModule();
      const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: contract, encoderMode: 'temporal' });
      assert.deepEqual(fake.calls.init, [[9n, [contract, 1]]]);
      assert.equal(fake.calls.topology, 1);
      assert.equal(fake.calls.free, 1);

      const first = adapter.step();
      const second = adapter.step();
      assert.equal(first.contractVersion, contract);
      assert.equal(first.topologyEdgeSources.length, edges);
      assert.equal(first.topologyNodeIds.length, neurons);
      assert.equal(first.topologyOutgoingEdgeOffsets[neurons], edges);
      assert.equal(first.topologyDigest, module.digest);
      assert.equal(first.topologyEdgeSources, second.topologyEdgeSources, 'snapshots share one projection');
      assert.equal(first.membranePotentials.length, neurons);
      assert.deepEqual([...first.spikeNeurons], [2, 7, 40]);
      assert.deepEqual([...first.encoderFeatures], Array.from({ length: 16 }, () => 0.5), 'the encoder contract stays 16 features');
      assert.equal(adapter.topology().topologyEdgeSources, first.topologyEdgeSources);
      adapter.dispose();
    });

    test(`contract ${contract} snapshots must carry empty topology arrays, the session digest, and ${neurons}-neuron state`, async () => {
      const cases = [
        ['a repeated projection', { topology_edge_sources: new Uint32Array([0]) }],
        ['another digest', { topology_digest: LEGACY_DIGEST }],
        ...badStates,
        [`a spike outside the ${neurons} neurons`, { spike_neurons: new Uint32Array([neurons]) }],
      ];
      await Promise.all(cases.map(async ([name, overrides]) => {
        const fake = fakeModule({ state: rawState(overrides) });
        const adapter = await bridge.initNeuromorphicAdapter(fake.module, 9n, { contractVersion: contract });
        assert.throws(() => adapter.step(), bridge.AdapterUnavailableError, name);
        adapter.dispose();
      }));
    });

    test(`contract ${contract} init fails closed on a projection that is not the audited ${neurons} / ${edges} one`, async () => {
      await assert.rejects(
        bridge.initNeuromorphicAdapter(fakeModule({ withTopology: false }).module, 9n, { contractVersion: contract }),
        /does not export its topology/,
      );
      const cases = foreignContracts.flatMap((foreignContract) => {
        const { topology, digest, nodeCount, edgeCount } = foreignTopology(foreignContract);
        return [
          [`the ${nodeCount} / ${edgeCount} network under the contract-${contract} digest`, topology],
          [`the ${nodeCount} / ${edgeCount} network with its own digest`, { ...topology, topology_digest: digest }],
        ];
      });
      cases.push(
        ['a flipped polarity', rawTopology({ topology_polarities: bridge.auditedBrowserTopology(contract).polarities.map((polarity, edge) => (edge === 0 ? 1 - polarity : polarity)) })],
        ['a target outside the network', rawTopology({ topology_edge_targets: bridge.auditedBrowserTopology(contract).edgeTargets.map((target, edge) => (edge === 5 ? neurons : target)) })],
        ['a foreign digest', rawTopology({ topology_digest: 'synaptic-wiring.topology.digest.v1:sha256:0000' })],
      );
      await Promise.all(cases.map(async ([name, topology]) => {
        await assert.rejects(
          bridge.initNeuromorphicAdapter(fakeModule({ topology }).module, 9n, { contractVersion: contract }),
          /invalid topology/,
          name,
        );
      }));
    });

    test(`the committed homepage package exports exactly the audited contract-${contract} topology and runs ${neurons} neurons`, async () => {
      const audited = auditedOf();
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
          assert.equal(state.contractVersion, contract);
          assert.equal(state.membranePotentials.length, neurons);
          assert.ok(state.spikeNeurons.every((neuron) => neuron < neurons));
          assert.ok(state.spikeNeurons.length < neurons / 2, 'never half the population in one step');
          assert.equal(state.topologyEdgeSources, topology.topologyEdgeSources, 'the one shared projection');
          spiked += state.spikeNeurons.length;
        }
        assert.ok(spiked >= 200 * neurons * 0.05 && spiked <= 200 * neurons * 0.2, `sparse: ${spiked} spikes in 200 steps`);
      } finally {
        adapter.dispose();
      }
    });
  }

  return { module, digest: module.digest, neurons, fanOut, edges, rawTopology, rawState, fakeModule, liveAdapter, registerSharedTests };
}
