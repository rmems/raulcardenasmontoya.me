import { mkdtemp, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { readAuditedTopologyV7, readAuditedTopologyV8 } from './audited-topology-v7.mjs';
import { replayTraceFixture } from './replay-trace-fixture.mjs';

const repository = resolve(import.meta.dirname, '..');
const manifest = join(repository, 'crates/neuromorphic-adapter/Cargo.toml');
const wasm = join(
  repository,
  'crates/neuromorphic-adapter/target/wasm32-unknown-unknown/release/neuromorphic_adapter.wasm',
);
const requestedWasmBindgen = process.env.WASM_BINDGEN_BIN;
const stateContractChecks = [
  "if (!(state.membrane_potentials instanceof Float32Array)) process.exit(1);",
  "if (!(state.topology_node_ids instanceof Uint32Array) || !(state.topology_edge_sources instanceof Uint32Array)) process.exit(1);",
  "if (!(state.topology_edge_targets instanceof Uint32Array) || !(state.topology_edge_weights instanceof Float32Array) || !(state.topology_edge_delays instanceof Uint16Array)) process.exit(1);",
  "if (!(state.topology_polarities instanceof Uint8Array) || !(state.topology_weight_bits instanceof Uint32Array)) process.exit(1);",
  "if (!(state.topology_outgoing_edge_offsets instanceof Uint32Array)) process.exit(1);",
  "const edgeCount = state.topology_edge_sources.length;",
  "if (state.topology_node_ids.length !== state.membrane_potentials.length || state.topology_outgoing_edge_offsets.length !== state.topology_node_ids.length + 1) process.exit(1);",
  "if ([state.topology_edge_targets, state.topology_edge_weights, state.topology_edge_delays, state.topology_polarities, state.topology_weight_bits].some((values) => values.length !== edgeCount)) process.exit(1);",
  "if (state.topology_outgoing_edge_offsets[0] !== 0 || state.topology_outgoing_edge_offsets.at(-1) !== edgeCount) process.exit(1);",
  "const weightBits = new Uint32Array(state.topology_edge_weights.buffer, state.topology_edge_weights.byteOffset, edgeCount);",
  "for (let edge = 0; edge < edgeCount; edge += 1) { if (state.topology_edge_sources[edge] >= state.topology_node_ids.length || state.topology_edge_targets[edge] >= state.topology_node_ids.length || state.topology_polarities[edge] > 1 || weightBits[edge] !== state.topology_weight_bits[edge]) process.exit(1); if (edge > 0) { const previous = edge - 1; const before = [state.topology_edge_sources[previous], state.topology_edge_targets[previous], state.topology_edge_delays[previous], state.topology_polarities[previous], state.topology_weight_bits[previous]]; const current = [state.topology_edge_sources[edge], state.topology_edge_targets[edge], state.topology_edge_delays[edge], state.topology_polarities[edge], state.topology_weight_bits[edge]]; if (before.some((value, index) => value > current[index] && before.slice(0, index).every((prior, priorIndex) => prior === current[priorIndex]))) process.exit(1); } }",
  "for (let node = 0; node < state.topology_node_ids.length; node += 1) { const start = state.topology_outgoing_edge_offsets[node]; const end = state.topology_outgoing_edge_offsets[node + 1]; if (start > end || state.topology_node_ids[node] !== node) process.exit(1); for (let edge = start; edge < end; edge += 1) { if (state.topology_edge_sources[edge] !== node) process.exit(1); } }",
].join(' ');
const contract7Digest = JSON.stringify((await readAuditedTopologyV7()).digest);
const contract8Digest = JSON.stringify((await readAuditedTopologyV8()).digest);

// Contracts 6 to 8 send the topology once; the live contract (8) runs 64 neurons.
const onceSentChecks = [
  "const six = wasm.WasmAdapter.init(9n, new Uint8Array([6])); const topology = six.topology(); if (topology.topology_edge_sources.length !== 64 || topology.topology_node_ids.length !== 16 || topology.topology_rows.length !== 17 || typeof topology.topology_digest !== 'string') process.exit(1); six.input(1n, new Float32Array([0.5, 0.5, 0.5])); const sixState = six.step(); if (sixState.contract_version !== 6 || sixState.completed_step !== 1n || sixState.topology_edge_sources.length !== 0 || sixState.topology_rows.length !== 0 || sixState.topology_digest !== topology.topology_digest || sixState.membrane_potentials.length !== 16 || sixState.encoder_features.length !== 16) process.exit(1); six.dispose();",
  `const seven = wasm.WasmAdapter.init(9n, new Uint8Array([7])); const sevenTopology = seven.topology(); if (sevenTopology.topology_edge_sources.length !== 288 || sevenTopology.topology_node_ids.length !== 48 || sevenTopology.topology_rows.length !== 49 || sevenTopology.topology_outgoing_edge_offsets[48] !== 288 || sevenTopology.topology_digest !== ${contract7Digest} || sevenTopology.topology_digest === topology.topology_digest) process.exit(1); for (let edge = 0; edge < 288; edge += 1) { if (sevenTopology.topology_edge_sources[edge] !== Math.floor(edge / 6) || sevenTopology.topology_edge_targets[edge] >= 48) process.exit(1); } seven.input(1n, new Float32Array([0.5, 0.5, 0.5])); const sevenState = seven.step(); if (sevenState.contract_version !== 7 || sevenState.completed_step !== 1n || sevenState.topology_edge_sources.length !== 0 || sevenState.topology_digest !== sevenTopology.topology_digest || sevenState.membrane_potentials.length !== 48 || sevenState.encoder_features.length !== 16 || sevenState.spike_neurons.some((neuron) => neuron >= 48)) process.exit(1); seven.dispose();`,
  `const eight = wasm.WasmAdapter.init(9n, new Uint8Array([8])); const eightTopology = eight.topology(); if (eightTopology.topology_edge_sources.length !== 512 || eightTopology.topology_node_ids.length !== 64 || eightTopology.topology_rows.length !== 65 || eightTopology.topology_outgoing_edge_offsets[64] !== 512 || eightTopology.topology_digest !== ${contract8Digest} || eightTopology.topology_digest === topology.topology_digest || eightTopology.topology_digest === sevenTopology.topology_digest) process.exit(1); for (let edge = 0; edge < 512; edge += 1) { if (eightTopology.topology_edge_sources[edge] !== Math.floor(edge / 8) || eightTopology.topology_edge_targets[edge] >= 64) process.exit(1); } eight.input(1n, new Float32Array([0.5, 0.5, 0.5])); const eightState = eight.step(); if (eightState.contract_version !== 8 || eightState.completed_step !== 1n || eightState.topology_edge_sources.length !== 0 || eightState.topology_digest !== eightTopology.topology_digest || eightState.membrane_potentials.length !== 64 || eightState.encoder_features.length !== 16 || eightState.spike_neurons.some((neuron) => neuron >= 64)) process.exit(1); eight.dispose();`,
].join(' ');

if (!requestedWasmBindgen || !isAbsolute(requestedWasmBindgen)) {
  throw new Error('WASM_BINDGEN_BIN must be an absolute path to wasm-bindgen-cli 0.2.126.');
}

const wasmBindgen = await realpath(requestedWasmBindgen);
const wasmBindgenMetadata = await stat(wasmBindgen);
if (
  !wasmBindgenMetadata.isFile() ||
  (wasmBindgenMetadata.mode & 0o022) !== 0 ||
  (wasmBindgenMetadata.mode & 0o111) === 0
) {
  throw new Error('WASM_BINDGEN_BIN must identify a non-group-writable executable file.');
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { cwd: repository, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  }
}

function requireWasmBindgenVersion() {
  const result = spawnSync(wasmBindgen, ['--version'], { cwd: repository, encoding: 'utf8' });
  if (result.status !== 0 || result.stdout.trim() !== 'wasm-bindgen 0.2.126') {
    throw new Error(`wasm-bindgen-cli 0.2.126 is required; found: ${result.stdout?.trim() || result.stderr?.trim() || result.error?.message || 'no executable output'}`);
  }
}

let output;

const readFixture = async (name) => JSON.stringify(
  JSON.parse(
    await readFile(join(repository, 'crates/neuromorphic-adapter/tests/fixtures', name), 'utf8'),
  ),
);
const fixtureJson = await readFixture('seed9-trace.json');
const kineticFixtureJson = await readFixture('kinetic-seed9-trace.json');
const contract7FixtureJson = await readFixture('contract7-seed9-trace.json');
const contract8FixtureJson = await readFixture('contract8-seed9-trace.json');
const traceSource = replayTraceFixture.toString();

try {
  requireWasmBindgenVersion();
  output = await mkdtemp(join(tmpdir(), 'neuromorphic-adapter-smoke-'));
  const webOutput = join(output, 'web');
  run('cargo', ['+1.99.0', 'build', '--manifest-path', manifest, '--target', 'wasm32-unknown-unknown', '--release', '--locked']);
  run(wasmBindgen, ['--target', 'nodejs', '--out-dir', output, wasm]);
  run('node', ['--input-type=commonjs', '--eval', [
    "const wasm = require(process.argv[1]);",
    "const adapter = wasm.WasmAdapter.init(9n, new Uint8Array([3]));",
    "adapter.input(1n, new Float32Array([1, 0.5]));",
    "const state = adapter.step();",
    "if (typeof state.seed !== 'bigint' || state.completed_step !== 1n) process.exit(1);",
    stateContractChecks,
    "adapter.dispose();",
    onceSentChecks,
    `const fixture = ${fixtureJson};`,
    `const replayTraceFixture = ${traceSource};`,
    `const kineticFixture = ${kineticFixtureJson};`,
    `const contract7Fixture = ${contract7FixtureJson};`,
    `const contract8Fixture = ${contract8FixtureJson};`,
    "const initAdapter = (seed, config) => wasm.WasmAdapter.init(seed, new Uint8Array(config));",
    "(async () => { await replayTraceFixture(fixture, initAdapter); await replayTraceFixture(kineticFixture, initAdapter); await replayTraceFixture(contract7Fixture, initAdapter); await replayTraceFixture(contract8Fixture, initAdapter); })().catch((error) => { console.error(error); process.exit(1); });",
  ].join(' '), join(output, 'neuromorphic_adapter.js')]);
  run(wasmBindgen, ['--target', 'web', '--out-dir', webOutput, wasm]);
  const webModule = join(webOutput, 'neuromorphic_adapter.mjs');
  await rename(join(webOutput, 'neuromorphic_adapter.js'), webModule);
  run('node', ['--input-type=module', '--eval', [
    "import { readFile } from 'node:fs/promises';",
    "import { pathToFileURL } from 'node:url';",
    "const wasm = await import(pathToFileURL(process.argv[1]).href);",
    "await wasm.default(await readFile(process.argv[2]));",
    "const adapter = wasm.WasmAdapter.init(9n, new Uint8Array([3]));",
    "adapter.input(1n, new Float32Array([1, 0.5]));",
    "const state = adapter.step();",
    "if (typeof state.seed !== 'bigint' || state.completed_step !== 1n) process.exit(1);",
    stateContractChecks,
    "adapter.dispose();",
    onceSentChecks,
    `const fixture = ${fixtureJson};`,
    `const replayTraceFixture = ${traceSource};`,
    `const kineticFixture = ${kineticFixtureJson};`,
    `const contract7Fixture = ${contract7FixtureJson};`,
    `const contract8Fixture = ${contract8FixtureJson};`,
    "const initAdapter = (seed, config) => wasm.WasmAdapter.init(seed, new Uint8Array(config));",
    "(async () => { await replayTraceFixture(fixture, initAdapter); await replayTraceFixture(kineticFixture, initAdapter); await replayTraceFixture(contract7Fixture, initAdapter); await replayTraceFixture(contract8Fixture, initAdapter); })().catch((error) => { console.error(error); process.exit(1); });",
  ].join(' '), webModule, join(webOutput, 'neuromorphic_adapter_bg.wasm')]);
  process.stdout.write('Generated Rust/WASM adapter smoke test passed.\n');
} finally {
  if (output) {
    await rm(output, { recursive: true, force: true });
  }
}
