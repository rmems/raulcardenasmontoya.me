/** Browser-safe bridge for the generated `neuromorphic-adapter` WASM package. */
import { AUDITED_TOPOLOGY_V7 } from './audited-topology-v7';

export const NEUROMORPHIC_CONTRACT_VERSION = 3;
export const NEUROMORPHIC_CONTRACT_VERSION_V4 = 4;
/**
 * Contract 5 routes `[x, y, pressure]` telemetry packets through
 * `kinetic-signals` feature extraction before `axon-encoder`, and adds the
 * clamped encoder-input features to every snapshot.
 */
export const NEUROMORPHIC_CONTRACT_VERSION_V5 = 5;
/**
 * Contract 6 is contract 5 with the topology projection sent once: the
 * adapter's `topology()` returns it at init, every per-step snapshot leaves
 * the twelve topology arrays empty (the digest stays), and this bridge
 * validates the projection once and attaches it to every snapshot it hands
 * out, so consumers see the same `NeuromorphicState` as before.
 */
export const NEUROMORPHIC_CONTRACT_VERSION_V6 = 6;
/**
 * Contract 7 is contract 6 on a larger audited topology (RM-2355): 48
 * neurons with six canonical outgoing synapses each (288) instead of 16 / 64.
 * Contracts 3 to 6 keep the 16 / 64 projection; the bridge audits each
 * contract's snapshots against its own projection. Encoder channel `c` is
 * the mesh source for every neuron `n` with `n % 16 == c`.
 */
export const NEUROMORPHIC_CONTRACT_VERSION_V7 = 7;
/**
 * The contract the live demo runs (`LIVE_ADAPTER_OPTIONS` in
 * `wasm-session.ts`) and the topology {@link auditedBrowserTopology} returns
 * by default.
 */
export const NEUROMORPHIC_LIVE_CONTRACT_VERSION = NEUROMORPHIC_CONTRACT_VERSION_V7;
export const TELEMETRY_PACKET_LENGTH = 3;
export const ENCODER_FEATURE_COUNT = 16;
export const CORPUS_IPC_WIRE_VERSION = 1;
/**
 * Selectable v1 encoder modes. The discriminants match the Rust `EncoderMode`
 * enum so the browser can request them through the WASM `init` config.
 */
export const ENCODER_MODES = {
  delta: 0,
  temporal: 1,
  rate: 2,
} as const;
export type EncoderModeName = keyof typeof ENCODER_MODES;
export const ENCODER_MODE_NAMES = Object.keys(ENCODER_MODES) as EncoderModeName[];
export const DEFAULT_ENCODER_MODE: EncoderModeName = 'temporal';
/**
 * One contract's audited canonical projection: the `synaptic-wiring`
 * identity the bridge requires of every snapshot (contracts 3 to 5) or of the
 * topology sent once (6 and 7). The bridge recomputes this identity from
 * exported contents instead of trusting the digest string reported by the
 * generated Rust/WASM package. Node ids, edge sources and the outgoing
 * offsets follow from the counts: every neuron has exactly `fanOut`
 * canonical edges.
 */
interface AuditedProjection {
  contractVersions: readonly number[];
  digest: string;
  neurons: number;
  fanOut: number;
  nodeIds: Uint32Array;
  outgoingEdgeOffsets: Uint32Array;
  edgeSources: Uint32Array;
  edgeTargets: Uint32Array;
  edgeDelays: Uint16Array;
  polarities: Uint8Array;
  weightBits: Uint32Array;
}

/** The hand-typed or generated inputs of an {@link AuditedProjection}: the per-edge arrays in canonical order. */
interface AuditedProjectionSource {
  contractVersions: readonly number[];
  digest: string;
  neurons: number;
  fanOut: number;
  edgeTargets: readonly number[];
  edgeDelays: readonly number[];
  polarities: readonly number[];
  weightBits: readonly number[];
}

/** `0, 1, …, count − 1` as a `Uint32Array`. */
function nodeRange(count: number): Uint32Array {
  return Uint32Array.from({ length: count }, (_, index) => index);
}

function auditedProjectionOf(source: AuditedProjectionSource): AuditedProjection {
  const { contractVersions, digest, neurons, fanOut } = source;
  const edgeCount = neurons * fanOut;
  if (
    source.edgeTargets.length !== edgeCount ||
    source.edgeDelays.length !== edgeCount ||
    source.polarities.length !== edgeCount ||
    source.weightBits.length !== edgeCount
  ) {
    throw new RangeError(`audited projection for contract ${contractVersions.join('/')} is inconsistent`);
  }
  return {
    contractVersions,
    digest,
    neurons,
    fanOut,
    nodeIds: nodeRange(neurons),
    outgoingEdgeOffsets: Uint32Array.from({ length: neurons + 1 }, (_, index) => index * fanOut),
    edgeSources: Uint32Array.from({ length: edgeCount }, (_, edge) => Math.floor(edge / fanOut)),
    edgeTargets: Uint32Array.from(source.edgeTargets),
    edgeDelays: Uint16Array.from(source.edgeDelays),
    polarities: Uint8Array.from(source.polarities),
    weightBits: Uint32Array.from(source.weightBits),
  };
}

/** The fixed 16-neuron, 64-synapse topology of contracts 3 to 6. */
const LEGACY_PROJECTION = auditedProjectionOf({
  contractVersions: [
    NEUROMORPHIC_CONTRACT_VERSION,
    NEUROMORPHIC_CONTRACT_VERSION_V4,
    NEUROMORPHIC_CONTRACT_VERSION_V5,
    NEUROMORPHIC_CONTRACT_VERSION_V6,
  ],
  digest: 'synaptic-wiring.topology.digest.v1:sha256:26875faf05121b9afda27a533760369da67ba9110599fb61533f08961ff6e971',
  neurons: 16,
  fanOut: 4,
  edgeTargets: [
    1, 2, 12, 14, 3, 8, 12, 15, 0, 1, 3, 4, 2, 4, 5, 8,
    2, 3, 7, 14, 3, 4, 6, 7, 0, 5, 7, 8, 5, 6, 11, 15,
    6, 7, 9, 10, 8, 10, 11, 14, 4, 8, 9, 13, 9, 12, 13, 15,
    10, 11, 13, 14, 11, 12, 14, 15, 0, 9, 12, 15, 0, 5, 13, 14,
  ],
  edgeDelays: [
    3, 1, 1, 4, 1, 4, 1, 1, 1, 2, 1, 2, 3, 1, 3, 3,
    2, 4, 1, 2, 3, 1, 3, 1, 3, 1, 4, 1, 1, 2, 1, 2,
    2, 3, 2, 3, 4, 2, 4, 4, 2, 3, 1, 2, 1, 1, 1, 4,
    1, 2, 1, 2, 2, 3, 2, 3, 3, 3, 3, 2, 2, 1, 3, 1,
  ],
  // The first 16 canonical edges (neurons 0 to 3) are inhibitory.
  polarities: Array.from({ length: 64 }, (_, edge) => (edge < 16 ? 1 : 0)),
  weightBits: [
    3210213374, 3209821784, 3205905881, 3205122701, 3209004865, 3207046914, 3205480553, 3204163308,
    3209754308, 3209362717, 3208579536, 3208187946, 3208545798, 3207762618, 3207371028, 3206196257,
    1060636822, 1060245232, 1058678871, 1054910871, 1059819904, 1059428314, 1058645133, 1058253543,
    1060569346, 1058611395, 1057828214, 1057436624, 1058186066, 1057794476, 1054708442, 1062658772,
    1057369148, 1056977558, 1055424146, 1054640966, 1055356670, 1053790309, 1063374476, 1062199706,
    1057301672, 1054506013, 1053722833, 1062165968, 1063307000, 1062132230, 1061740639, 1060957458,
    1062490082, 1062098491, 1061315310, 1060923720, 1061673163, 1061281572, 1060498392, 1060106802,
    1057166719, 1062031015, 1060856244, 1059681474, 1056518174, 1063172048, 1060039326, 1059647736,
  ],
});

/**
 * The 48-neuron, 288-synapse topology of contract 7, generated from the crate
 * (`audited-topology-v7.ts`; `tests/audited_topology.rs` fails on drift).
 */
const V7_PROJECTION = auditedProjectionOf({
  contractVersions: [NEUROMORPHIC_CONTRACT_VERSION_V7],
  digest: AUDITED_TOPOLOGY_V7.digest,
  neurons: AUDITED_TOPOLOGY_V7.neurons,
  fanOut: AUDITED_TOPOLOGY_V7.fanOut,
  edgeTargets: AUDITED_TOPOLOGY_V7.edgeTargets,
  edgeDelays: AUDITED_TOPOLOGY_V7.edgeDelays,
  polarities: AUDITED_TOPOLOGY_V7.polarities,
  weightBits: AUDITED_TOPOLOGY_V7.weightBits,
});

const AUDITED_PROJECTIONS = [LEGACY_PROJECTION, V7_PROJECTION];

/** The projection a contract's snapshots must carry, or `null` for an unknown contract. */
function auditedProjectionFor(contract: number): AuditedProjection | null {
  return AUDITED_PROJECTIONS.find((projection) => projection.contractVersions.includes(contract)) ?? null;
}

/** The canonical `synaptic-wiring` projection every live snapshot must match. */
export interface AuditedBrowserTopology {
  /** The contract whose snapshots carry this projection (the lowest, for contracts 3 to 6). */
  contractVersion: number;
  digest: string;
  nodeIds: Uint32Array;
  edgeSources: Uint32Array;
  edgeTargets: Uint32Array;
  edgeDelays: Uint16Array;
  polarities: Uint8Array;
  edgeWeights: Float32Array;
  weightBits: Uint32Array;
}

/**
 * Fresh copies of the audited browser topology of `contract` (the live
 * contract by default). The bridge rejects any snapshot of that contract
 * whose projection differs from it, so this is the only network the live
 * demo can draw. The homepage hero renders it at build time as the static
 * drawing that WebGL later replaces; no WASM runs for that.
 */
export function auditedBrowserTopology(
  contract: number = NEUROMORPHIC_LIVE_CONTRACT_VERSION,
): AuditedBrowserTopology {
  const projection = auditedProjectionFor(contract);
  if (!projection) {
    throw new RangeError(`no audited topology for contract ${contract}`);
  }
  const weightBits = projection.weightBits.slice();
  return {
    contractVersion: projection.contractVersions[0],
    digest: projection.digest,
    nodeIds: projection.nodeIds.slice(),
    edgeSources: projection.edgeSources.slice(),
    edgeTargets: projection.edgeTargets.slice(),
    edgeDelays: projection.edgeDelays.slice(),
    polarities: projection.polarities.slice(),
    edgeWeights: new Float32Array(weightBits.slice().buffer),
    weightBits,
  };
}
const MAX_U64 = (1n << 64n) - 1n;
const RUNTIME_ERROR_STATUSES = new Set([
  'ok',
  'input-sequence-not-increasing',
  'input-non-finite-samples',
  'input-telemetry-shape',
  'step-propagation-failed',
  'step-neuromod-failed',
  'step-spike-index-out-of-range',
]);

export interface NeuromorphicState {
  contractVersion: number;
  seed: bigint;
  completedStep: bigint;
  lastSequence: bigint;
  membranePotentials: Float32Array;
  spikeNeurons: Uint32Array;
  topologyRows: Uint32Array;
  topologyTargets: Uint32Array;
  topologyWeights: Float32Array;
  topologyDelays: Uint16Array;
  topologyNodeIds: Uint32Array;
  topologyEdgeSources: Uint32Array;
  topologyEdgeTargets: Uint32Array;
  topologyEdgeWeights: Float32Array;
  topologyEdgeDelays: Uint16Array;
  topologyPolarities: Uint8Array;
  topologyWeightBits: Uint32Array;
  topologyOutgoingEdgeOffsets: Uint32Array;
  topologyDigest: string;
  protocolWireVersion: number;
  errorStatus: string;
  encoderMode: number;
  encoderName: string;
  encodedSpikeCount: number;
  encodedSpikeChannels: number;
  encodedSpikeTotal: bigint;
  /**
   * Contract 5: the clamped `[0, 1]` `kinetic-signals` features handed to
   * `axon-encoder` by the latest input. Empty on contracts 3 and 4.
   */
  encoderFeatures: Float32Array;
}

/** The twelve typed-array fields of a topology, for detaching and re-attaching across a worker. */
export const TOPOLOGY_ARRAY_FIELDS = [
  'topologyRows',
  'topologyTargets',
  'topologyWeights',
  'topologyDelays',
  'topologyNodeIds',
  'topologyEdgeSources',
  'topologyEdgeTargets',
  'topologyEdgeWeights',
  'topologyEdgeDelays',
  'topologyPolarities',
  'topologyWeightBits',
  'topologyOutgoingEdgeOffsets',
] as const;
export type TopologyArrayField = (typeof TOPOLOGY_ARRAY_FIELDS)[number];

/** The topology every snapshot of a session belongs to, as JS-owned copies. Contract 6 sends it once. */
export type NeuromorphicTopology = Pick<NeuromorphicState, TopologyArrayField | 'topologyDigest'>;

interface RawTopologyFields {
  topology_rows: Uint32Array;
  topology_targets: Uint32Array;
  topology_weights: Float32Array;
  topology_delays: Uint16Array;
  topology_node_ids: Uint32Array;
  topology_edge_sources: Uint32Array;
  topology_edge_targets: Uint32Array;
  topology_edge_weights: Float32Array;
  topology_edge_delays: Uint16Array;
  topology_polarities: Uint8Array;
  topology_weight_bits: Uint32Array;
  topology_outgoing_edge_offsets: Uint32Array;
  topology_digest: string;
}

interface RawWasmTopology extends RawTopologyFields {
  /** wasm-bindgen handle release; absent on plain test doubles. */
  free?: () => void;
}

interface RawWasmState {
  contract_version: number;
  seed: bigint;
  completed_step: bigint;
  last_sequence: bigint;
  membrane_potentials: Float32Array;
  spike_neurons: Uint32Array;
  topology_rows: Uint32Array;
  topology_targets: Uint32Array;
  topology_weights: Float32Array;
  topology_delays: Uint16Array;
  topology_node_ids: Uint32Array;
  topology_edge_sources: Uint32Array;
  topology_edge_targets: Uint32Array;
  topology_edge_weights: Float32Array;
  topology_edge_delays: Uint16Array;
  topology_polarities: Uint8Array;
  topology_weight_bits: Uint32Array;
  topology_outgoing_edge_offsets: Uint32Array;
  topology_digest: string;
  protocol_wire_version: number;
  error_status: string;
  encoder_mode: number;
  encoder_name: string;
  encoded_spike_count: number;
  encoded_spike_channels: number;
  encoded_spike_total: bigint;
  encoder_features?: Float32Array;
  /** wasm-bindgen handle release; absent on plain test doubles. */
  free?: () => void;
}

export type NeuromorphicContractVersion =
  | typeof NEUROMORPHIC_CONTRACT_VERSION
  | typeof NEUROMORPHIC_CONTRACT_VERSION_V4
  | typeof NEUROMORPHIC_CONTRACT_VERSION_V5
  | typeof NEUROMORPHIC_CONTRACT_VERSION_V6
  | typeof NEUROMORPHIC_CONTRACT_VERSION_V7;

export interface NeuromorphicAdapterOptions {
  contractVersion?: NeuromorphicContractVersion;
  encoderMode?: EncoderModeName;
}

interface RawWasmAdapter {
  input(sequence: bigint, samples: Float32Array): void;
  step(): RawWasmState;
  state(): RawWasmState;
  /** Contracts 6 and 7: the projection, read once at init. */
  topology?(): RawWasmTopology;
  dispose(): void;
}

export interface NeuromorphicWasmModule {
  default(): Promise<unknown>;
  WasmAdapter: {
    init(seed: bigint, config: Uint8Array): RawWasmAdapter;
  };
}

export interface NeuromorphicAdapter {
  input(sequence: bigint, samples: Float32Array): void;
  step(): NeuromorphicState;
  state(): NeuromorphicState;
  /**
   * The topology every snapshot of this adapter belongs to. On contracts 6
   * and 7 it is the projection validated once at init, the same arrays every
   * snapshot carries; on earlier contracts it is read from a fresh snapshot.
   */
  topology(): NeuromorphicTopology;
  dispose(): void;
}

export class AdapterUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterUnavailableError';
  }
}

const ENCODER_MODE_VALUES = new Set<number>(Object.values(ENCODER_MODES));
const ENCODER_DIAGNOSTIC_CONTRACTS = new Set<number>([
  NEUROMORPHIC_CONTRACT_VERSION_V4,
  NEUROMORPHIC_CONTRACT_VERSION_V5,
  NEUROMORPHIC_CONTRACT_VERSION_V6,
  NEUROMORPHIC_CONTRACT_VERSION_V7,
]);
/** Contracts whose snapshots carry the clamped `kinetic-signals` feature vector. */
const FEATURE_CONTRACTS = new Set<number>([
  NEUROMORPHIC_CONTRACT_VERSION_V5,
  NEUROMORPHIC_CONTRACT_VERSION_V6,
  NEUROMORPHIC_CONTRACT_VERSION_V7,
]);
/** Contracts whose topology crosses the boundary once (`topology()`) and whose snapshots carry it empty. */
const ONCE_SENT_CONTRACTS = new Set<number>([NEUROMORPHIC_CONTRACT_VERSION_V6, NEUROMORPHIC_CONTRACT_VERSION_V7]);

/** Whether `contract` sends its topology once at init instead of in every snapshot. */
export function topologySentOnce(contract: number): boolean {
  return ONCE_SENT_CONTRACTS.has(contract);
}

function isValidEncoderFeatures(raw: RawWasmState): boolean {
  const features = raw.encoder_features;
  return (
    features instanceof Float32Array &&
    features.length === ENCODER_FEATURE_COUNT &&
    features.every((value) => value >= 0 && value <= 1)
  );
}

function isValidEncoderDiagnostics(raw: RawWasmState): boolean {
  if (
    typeof raw.encoder_mode !== 'number' ||
    !ENCODER_MODE_VALUES.has(raw.encoder_mode) ||
    typeof raw.encoder_name !== 'string' ||
    raw.encoder_name !== ENCODER_MODE_NAMES[raw.encoder_mode] ||
    typeof raw.encoded_spike_count !== 'number' ||
    !Number.isInteger(raw.encoded_spike_count) ||
    raw.encoded_spike_count < 0 ||
    raw.encoded_spike_count > 16 ||
    typeof raw.encoded_spike_channels !== 'number' ||
    !Number.isInteger(raw.encoded_spike_channels) ||
    raw.encoded_spike_channels < 0 ||
    raw.encoded_spike_channels > 16 ||
    raw.encoded_spike_channels > raw.encoded_spike_count ||
    typeof raw.encoded_spike_total !== 'bigint' ||
    !isU64(raw.encoded_spike_total) ||
    raw.encoded_spike_total < BigInt(raw.encoded_spike_count)
  ) {
    return false;
  }
  return true;
}

/**
 * Read every field of a wasm-bindgen state handle exactly once. Each getter
 * call crosses into WASM and copies its array into a fresh JS-owned typed
 * array, so validating straight off the handle (dozens of property reads)
 * repeated those copies on every step. Measured in
 * `docs/architecture/performance-budgets.md`.
 */
function readRawState(raw: RawWasmState): RawWasmState {
  return {
    contract_version: raw.contract_version,
    seed: raw.seed,
    completed_step: raw.completed_step,
    last_sequence: raw.last_sequence,
    membrane_potentials: raw.membrane_potentials,
    spike_neurons: raw.spike_neurons,
    topology_rows: raw.topology_rows,
    topology_targets: raw.topology_targets,
    topology_weights: raw.topology_weights,
    topology_delays: raw.topology_delays,
    topology_node_ids: raw.topology_node_ids,
    topology_edge_sources: raw.topology_edge_sources,
    topology_edge_targets: raw.topology_edge_targets,
    topology_edge_weights: raw.topology_edge_weights,
    topology_edge_delays: raw.topology_edge_delays,
    topology_polarities: raw.topology_polarities,
    topology_weight_bits: raw.topology_weight_bits,
    topology_outgoing_edge_offsets: raw.topology_outgoing_edge_offsets,
    topology_digest: raw.topology_digest,
    protocol_wire_version: raw.protocol_wire_version,
    error_status: raw.error_status,
    encoder_mode: raw.encoder_mode,
    encoder_name: raw.encoder_name,
    encoded_spike_count: raw.encoded_spike_count,
    encoded_spike_channels: raw.encoded_spike_channels,
    encoded_spike_total: raw.encoded_spike_total,
    encoder_features: raw.encoder_features,
  };
}

/** Read a once-sent topology handle's fields exactly once and release it. */
function readRawTopology(handle: RawWasmTopology): RawTopologyFields {
  if (!handle || typeof handle !== 'object') {
    throw new AdapterUnavailableError('The Rust/WASM runtime returned an invalid topology.');
  }
  try {
    return {
      topology_rows: handle.topology_rows,
      topology_targets: handle.topology_targets,
      topology_weights: handle.topology_weights,
      topology_delays: handle.topology_delays,
      topology_node_ids: handle.topology_node_ids,
      topology_edge_sources: handle.topology_edge_sources,
      topology_edge_targets: handle.topology_edge_targets,
      topology_edge_weights: handle.topology_edge_weights,
      topology_edge_delays: handle.topology_edge_delays,
      topology_polarities: handle.topology_polarities,
      topology_weight_bits: handle.topology_weight_bits,
      topology_outgoing_edge_offsets: handle.topology_outgoing_edge_offsets,
      topology_digest: handle.topology_digest,
    };
  } finally {
    if (typeof handle.free === 'function') {
      handle.free();
    }
  }
}

function snapshot(handle: RawWasmState, shared: NeuromorphicTopology | null): NeuromorphicState {
  if (!handle || typeof handle !== 'object') {
    throw new AdapterUnavailableError('The Rust/WASM runtime returned an invalid contract state.');
  }
  let fields: RawWasmState;
  try {
    fields = readRawState(handle);
  } finally {
    // Release the Rust-side snapshot now. Otherwise each step's state stays in
    // WASM linear memory until a GC finalizer happens to run.
    if (typeof handle.free === 'function') {
      handle.free();
    }
  }
  return materialize(fields, shared);
}

const invalidState = () => new AdapterUnavailableError('The Rust/WASM runtime returned an invalid contract state.');

/** Once-sent (contract 6 and 7) per-step states carry every topology array empty, of the right type. */
function hasEmptyTopologyArrays(raw: RawWasmState): boolean {
  return (
    raw.topology_rows instanceof Uint32Array &&
    raw.topology_targets instanceof Uint32Array &&
    raw.topology_weights instanceof Float32Array &&
    raw.topology_delays instanceof Uint16Array &&
    raw.topology_node_ids instanceof Uint32Array &&
    raw.topology_edge_sources instanceof Uint32Array &&
    raw.topology_edge_targets instanceof Uint32Array &&
    raw.topology_edge_weights instanceof Float32Array &&
    raw.topology_edge_delays instanceof Uint16Array &&
    raw.topology_polarities instanceof Uint8Array &&
    raw.topology_weight_bits instanceof Uint32Array &&
    raw.topology_outgoing_edge_offsets instanceof Uint32Array &&
    raw.topology_rows.length === 0 &&
    raw.topology_targets.length === 0 &&
    raw.topology_weights.length === 0 &&
    raw.topology_delays.length === 0 &&
    raw.topology_node_ids.length === 0 &&
    raw.topology_edge_sources.length === 0 &&
    raw.topology_edge_targets.length === 0 &&
    raw.topology_edge_weights.length === 0 &&
    raw.topology_edge_delays.length === 0 &&
    raw.topology_polarities.length === 0 &&
    raw.topology_weight_bits.length === 0 &&
    raw.topology_outgoing_edge_offsets.length === 0
  );
}

/**
 * Every structural, identity and ordering check of a topology: the routed CSR
 * arrays, the canonical projection, the audited digest and contents of
 * `expected` (the contract's own projection), and their agreement. Runs on
 * every snapshot of contracts 3 to 5 and once, at init, on contracts 6 and 7.
 */
function hasValidTopology(raw: RawTopologyFields, expected: AuditedProjection): boolean {
  return (
    raw.topology_rows instanceof Uint32Array &&
    raw.topology_targets instanceof Uint32Array &&
    raw.topology_weights instanceof Float32Array &&
    raw.topology_delays instanceof Uint16Array &&
    raw.topology_node_ids instanceof Uint32Array &&
    raw.topology_edge_sources instanceof Uint32Array &&
    raw.topology_edge_targets instanceof Uint32Array &&
    raw.topology_edge_weights instanceof Float32Array &&
    raw.topology_edge_delays instanceof Uint16Array &&
    raw.topology_polarities instanceof Uint8Array &&
    raw.topology_weight_bits instanceof Uint32Array &&
    raw.topology_outgoing_edge_offsets instanceof Uint32Array &&
    raw.topology_rows.length >= 2 &&
    raw.topology_rows[0] === 0 &&
    raw.topology_rows.at(-1) === raw.topology_targets.length &&
    raw.topology_targets.length === raw.topology_weights.length &&
    raw.topology_targets.length === raw.topology_delays.length &&
    raw.topology_edge_sources.length === raw.topology_targets.length &&
    raw.topology_edge_sources.length === raw.topology_edge_targets.length &&
    raw.topology_edge_sources.length === raw.topology_edge_weights.length &&
    raw.topology_edge_sources.length === raw.topology_edge_delays.length &&
    raw.topology_edge_sources.length === raw.topology_polarities.length &&
    raw.topology_edge_sources.length === raw.topology_weight_bits.length &&
    raw.topology_node_ids.length === raw.topology_rows.length - 1 &&
    raw.topology_outgoing_edge_offsets.length === raw.topology_node_ids.length + 1 &&
    raw.topology_outgoing_edge_offsets[0] === 0 &&
    raw.topology_outgoing_edge_offsets.at(-1) === raw.topology_edge_sources.length &&
    typeof raw.topology_digest === 'string' &&
    raw.topology_digest === expected.digest &&
    hasExpectedTopologyProjection(raw, expected) &&
    allFinite(raw.topology_weights) &&
    allFinite(raw.topology_edge_weights) &&
    isMonotonicTopologyRows(raw.topology_rows) &&
    hasValidTopologyTargets(raw.topology_targets, raw.topology_rows.length - 1) &&
    hasValidTopologyTargets(raw.topology_edge_sources, raw.topology_node_ids.length) &&
    hasValidTopologyTargets(raw.topology_edge_targets, raw.topology_node_ids.length) &&
    hasValidTopologyTargets(raw.topology_node_ids, raw.topology_node_ids.length) &&
    hasValidTopologyTargets(raw.topology_outgoing_edge_offsets, raw.topology_edge_sources.length + 1) &&
    raw.topology_polarities.every((polarity) => polarity === 0 || polarity === 1) &&
    isMonotonicTopologyRows(raw.topology_outgoing_edge_offsets) &&
    hasCanonicalOutgoingEdges(raw.topology_node_ids, raw.topology_edge_sources, raw.topology_outgoing_edge_offsets) &&
    hasCanonicalEdgeOrder(
      raw.topology_edge_sources,
      raw.topology_edge_targets,
      raw.topology_edge_delays,
      raw.topology_polarities,
      raw.topology_weight_bits,
    ) &&
    hasMatchingWeightBits(raw.topology_edge_weights, raw.topology_weight_bits) &&
    hasVerifiedRoutedTopology(
      raw.topology_rows,
      raw.topology_targets,
      raw.topology_weights,
      raw.topology_delays,
      raw.topology_edge_sources,
      raw.topology_edge_targets,
      raw.topology_edge_weights,
      raw.topology_edge_delays,
    )
  );
}

/** JS-owned copies of a validated topology. */
function copyTopology(raw: RawTopologyFields): NeuromorphicTopology {
  return {
    topologyRows: new Uint32Array(raw.topology_rows),
    topologyTargets: new Uint32Array(raw.topology_targets),
    topologyWeights: new Float32Array(raw.topology_weights),
    topologyDelays: new Uint16Array(raw.topology_delays),
    topologyNodeIds: new Uint32Array(raw.topology_node_ids),
    topologyEdgeSources: new Uint32Array(raw.topology_edge_sources),
    topologyEdgeTargets: new Uint32Array(raw.topology_edge_targets),
    topologyEdgeWeights: new Float32Array(raw.topology_edge_weights),
    topologyEdgeDelays: new Uint16Array(raw.topology_edge_delays),
    topologyPolarities: new Uint8Array(raw.topology_polarities),
    topologyWeightBits: new Uint32Array(raw.topology_weight_bits),
    topologyOutgoingEdgeOffsets: new Uint32Array(raw.topology_outgoing_edge_offsets),
    topologyDigest: raw.topology_digest,
  };
}

/** The topology fields of a snapshot, as they are (no copy). */
export function topologyOf(state: NeuromorphicState): NeuromorphicTopology {
  return {
    topologyRows: state.topologyRows,
    topologyTargets: state.topologyTargets,
    topologyWeights: state.topologyWeights,
    topologyDelays: state.topologyDelays,
    topologyNodeIds: state.topologyNodeIds,
    topologyEdgeSources: state.topologyEdgeSources,
    topologyEdgeTargets: state.topologyEdgeTargets,
    topologyEdgeWeights: state.topologyEdgeWeights,
    topologyEdgeDelays: state.topologyEdgeDelays,
    topologyPolarities: state.topologyPolarities,
    topologyWeightBits: state.topologyWeightBits,
    topologyOutgoingEdgeOffsets: state.topologyOutgoingEdgeOffsets,
    topologyDigest: state.topologyDigest,
  };
}

/** Fresh copies of a topology, for transferring across a worker without detaching the original. */
export function cloneTopology(topology: NeuromorphicTopology): NeuromorphicTopology {
  return {
    topologyRows: topology.topologyRows.slice(),
    topologyTargets: topology.topologyTargets.slice(),
    topologyWeights: topology.topologyWeights.slice(),
    topologyDelays: topology.topologyDelays.slice(),
    topologyNodeIds: topology.topologyNodeIds.slice(),
    topologyEdgeSources: topology.topologyEdgeSources.slice(),
    topologyEdgeTargets: topology.topologyEdgeTargets.slice(),
    topologyEdgeWeights: topology.topologyEdgeWeights.slice(),
    topologyEdgeDelays: topology.topologyEdgeDelays.slice(),
    topologyPolarities: topology.topologyPolarities.slice(),
    topologyWeightBits: topology.topologyWeightBits.slice(),
    topologyOutgoingEdgeOffsets: topology.topologyOutgoingEdgeOffsets.slice(),
    topologyDigest: topology.topologyDigest,
  };
}

/**
 * A contract-6 or -7 snapshot as it crosses a worker boundary: the topology
 * went once with the worker's `ready`, so each step carries empty topology
 * arrays and keeps the digest. The receiving side re-attaches with
 * {@link attachTopology}.
 */
export function detachTopology(state: NeuromorphicState): NeuromorphicState {
  return {
    ...state,
    topologyRows: new Uint32Array(0),
    topologyTargets: new Uint32Array(0),
    topologyWeights: new Float32Array(0),
    topologyDelays: new Uint16Array(0),
    topologyNodeIds: new Uint32Array(0),
    topologyEdgeSources: new Uint32Array(0),
    topologyEdgeTargets: new Uint32Array(0),
    topologyEdgeWeights: new Float32Array(0),
    topologyEdgeDelays: new Uint16Array(0),
    topologyPolarities: new Uint8Array(0),
    topologyWeightBits: new Uint32Array(0),
    topologyOutgoingEdgeOffsets: new Uint32Array(0),
  };
}

/** Re-attach a session's topology to a detached snapshot; every snapshot then shares the same arrays. */
export function attachTopology(state: NeuromorphicState, topology: NeuromorphicTopology): NeuromorphicState {
  if (state.topologyDigest !== topology.topologyDigest) {
    throw new AdapterUnavailableError('The Rust/WASM snapshot does not belong to the session topology.');
  }
  return {
    ...state,
    topologyRows: topology.topologyRows,
    topologyTargets: topology.topologyTargets,
    topologyWeights: topology.topologyWeights,
    topologyDelays: topology.topologyDelays,
    topologyNodeIds: topology.topologyNodeIds,
    topologyEdgeSources: topology.topologyEdgeSources,
    topologyEdgeTargets: topology.topologyEdgeTargets,
    topologyEdgeWeights: topology.topologyEdgeWeights,
    topologyEdgeDelays: topology.topologyEdgeDelays,
    topologyPolarities: topology.topologyPolarities,
    topologyWeightBits: topology.topologyWeightBits,
    topologyOutgoingEdgeOffsets: topology.topologyOutgoingEdgeOffsets,
  };
}

/**
 * Validate one exported state and materialize it as JS-owned data. `shared`
 * is the once-sent (contract 6 or 7) topology validated at init; on earlier
 * contracts it is `null` and the snapshot's own topology is validated here.
 */
function materialize(raw: RawWasmState, shared: NeuromorphicTopology | null): NeuromorphicState {
  if (!raw || typeof raw !== 'object') {
    throw invalidState();
  }
  const expected = auditedProjectionFor(raw.contract_version);
  const onceSent = ONCE_SENT_CONTRACTS.has(raw.contract_version);
  if (
    expected === null ||
    (raw.contract_version !== NEUROMORPHIC_CONTRACT_VERSION &&
      !ENCODER_DIAGNOSTIC_CONTRACTS.has(raw.contract_version)) ||
    onceSent !== (shared !== null) ||
    typeof raw.seed !== 'bigint' ||
    typeof raw.completed_step !== 'bigint' ||
    typeof raw.last_sequence !== 'bigint' ||
    !isU64(raw.seed) ||
    !isU64(raw.completed_step) ||
    !isU64(raw.last_sequence) ||
    !(raw.membrane_potentials instanceof Float32Array) ||
    !(raw.spike_neurons instanceof Uint32Array) ||
    typeof raw.topology_digest !== 'string' ||
    raw.protocol_wire_version !== CORPUS_IPC_WIRE_VERSION ||
    typeof raw.error_status !== 'string' ||
    !RUNTIME_ERROR_STATUSES.has(raw.error_status) ||
    !allFinite(raw.membrane_potentials) ||
    (ENCODER_DIAGNOSTIC_CONTRACTS.has(raw.contract_version) && !isValidEncoderDiagnostics(raw)) ||
    (FEATURE_CONTRACTS.has(raw.contract_version) && !isValidEncoderFeatures(raw))
  ) {
    throw invalidState();
  }

  let topology: NeuromorphicTopology;
  if (shared !== null) {
    if (
      !hasEmptyTopologyArrays(raw) ||
      raw.topology_digest !== shared.topologyDigest ||
      shared.topologyDigest !== expected.digest
    ) {
      throw invalidState();
    }
    topology = shared;
  } else {
    if (!hasValidTopology(raw, expected)) {
      throw invalidState();
    }
    topology = copyTopology(raw);
  }

  const nodeCount = topology.topologyNodeIds.length;
  if (raw.membrane_potentials.length !== nodeCount || !hasValidSpikeNeurons(raw.spike_neurons, nodeCount)) {
    throw invalidState();
  }

  const hasDiagnostics = ENCODER_DIAGNOSTIC_CONTRACTS.has(raw.contract_version);
  return {
    contractVersion: raw.contract_version,
    seed: raw.seed,
    completedStep: raw.completed_step,
    lastSequence: raw.last_sequence,
    membranePotentials: new Float32Array(raw.membrane_potentials),
    spikeNeurons: new Uint32Array(raw.spike_neurons),
    ...topology,
    protocolWireVersion: raw.protocol_wire_version,
    errorStatus: raw.error_status,
    encoderMode: hasDiagnostics ? raw.encoder_mode : ENCODER_MODES.delta,
    encoderName: hasDiagnostics ? raw.encoder_name : 'delta',
    encodedSpikeCount: hasDiagnostics ? raw.encoded_spike_count : 0,
    encodedSpikeChannels: hasDiagnostics ? raw.encoded_spike_channels : 0,
    encodedSpikeTotal: hasDiagnostics ? raw.encoded_spike_total : 0n,
    encoderFeatures:
      FEATURE_CONTRACTS.has(raw.contract_version) && raw.encoder_features
        ? new Float32Array(raw.encoder_features)
        : new Float32Array(0),
  };
}

function isU64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= MAX_U64;
}

function allFinite(values: Float32Array): boolean {
  return values.every(Number.isFinite);
}

function isMonotonicTopologyRows(rows: Uint32Array): boolean {
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1] > rows[index]) {
      return false;
    }
  }
  return true;
}

function hasValidTopologyTargets(targets: Uint32Array, nodeCount: number): boolean {
  return targets.every((target) => target < nodeCount);
}

function hasValidSpikeNeurons(spikes: Uint32Array, nodeCount: number): boolean {
  return spikes.every((spike) => spike < nodeCount);
}

function hasCanonicalOutgoingEdges(
  nodeIds: Uint32Array,
  sources: Uint32Array,
  offsets: Uint32Array,
): boolean {
  for (let node = 0; node < nodeIds.length; node += 1) {
    if (nodeIds[node] !== node) return false;
    for (let edge = offsets[node]; edge < offsets[node + 1]; edge += 1) {
      if (sources[edge] !== nodeIds[node]) return false;
    }
  }
  return true;
}

function hasMatchingWeightBits(weights: Float32Array, bits: Uint32Array): boolean {
  const weightBits = new Uint32Array(weights.buffer, weights.byteOffset, weights.length);
  return weightBits.every((weight, index) => weight === bits[index]);
}

function hasExpectedTopologyProjection(raw: RawTopologyFields, expected: AuditedProjection): boolean {
  return (
    hasMatchingTypedArray(raw.topology_node_ids, expected.nodeIds) &&
    hasMatchingTypedArray(raw.topology_edge_sources, expected.edgeSources) &&
    hasMatchingTypedArray(raw.topology_edge_targets, expected.edgeTargets) &&
    hasMatchingTypedArray(raw.topology_edge_delays, expected.edgeDelays) &&
    hasMatchingTypedArray(raw.topology_polarities, expected.polarities) &&
    hasMatchingTypedArray(raw.topology_weight_bits, expected.weightBits) &&
    hasMatchingTypedArray(raw.topology_outgoing_edge_offsets, expected.outgoingEdgeOffsets)
  );
}

function hasMatchingTypedArray(
  actual: Uint8Array | Uint16Array | Uint32Array,
  expected: Uint8Array | Uint16Array | Uint32Array,
): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function hasCanonicalEdgeOrder(
  sources: Uint32Array,
  targets: Uint32Array,
  delays: Uint16Array,
  polarities: Uint8Array,
  weightBits: Uint32Array,
): boolean {
  for (let edge = 1; edge < sources.length; edge += 1) {
    const previous = edge - 1;
    if (sources[previous] !== sources[edge]) {
      if (sources[previous] > sources[edge]) return false;
      continue;
    }
    if (targets[previous] !== targets[edge]) {
      if (targets[previous] > targets[edge]) return false;
      continue;
    }
    if (delays[previous] !== delays[edge]) {
      if (delays[previous] > delays[edge]) return false;
      continue;
    }
    if (polarities[previous] !== polarities[edge]) {
      if (polarities[previous] > polarities[edge]) return false;
      continue;
    }
    if (weightBits[previous] > weightBits[edge]) return false;
  }
  return true;
}

type TopologyArray = Uint16Array | Uint32Array;

/**
 * The most recent routed/canonical topology pair that passed
 * {@link hasMatchingRoutedTopology}, as private copies. The live topology is
 * identical on every step, so later snapshots are checked by plain value
 * comparison instead of rebuilding the multiset (the dominant per-step bridge
 * cost before this cache; see `docs/architecture/performance-budgets.md`).
 * Any difference falls through to the full check. One entry: bounded.
 */
let verifiedRoutedTopology: TopologyArray[] | null = null;

function bitsOf(weights: Float32Array): Uint32Array {
  return new Uint32Array(weights.buffer, weights.byteOffset, weights.length);
}

function sameValues(left: TopologyArray, right: TopologyArray): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function hasVerifiedRoutedTopology(
  rows: Uint32Array,
  targets: Uint32Array,
  weights: Float32Array,
  delays: Uint16Array,
  canonicalSources: Uint32Array,
  canonicalTargets: Uint32Array,
  canonicalWeights: Float32Array,
  canonicalDelays: Uint16Array,
): boolean {
  const key: TopologyArray[] = [
    rows,
    targets,
    bitsOf(weights),
    delays,
    canonicalSources,
    canonicalTargets,
    bitsOf(canonicalWeights),
    canonicalDelays,
  ];
  const verified = verifiedRoutedTopology;
  if (verified && key.every((array, index) => sameValues(array, verified[index]))) {
    return true;
  }
  if (
    !hasMatchingRoutedTopology(
      rows,
      targets,
      weights,
      delays,
      canonicalSources,
      canonicalTargets,
      canonicalWeights,
      canonicalDelays,
    )
  ) {
    return false;
  }
  verifiedRoutedTopology = key.map((array) => array.slice());
  return true;
}

function hasMatchingRoutedTopology(
  rows: Uint32Array,
  targets: Uint32Array,
  weights: Float32Array,
  delays: Uint16Array,
  canonicalSources: Uint32Array,
  canonicalTargets: Uint32Array,
  canonicalWeights: Float32Array,
  canonicalDelays: Uint16Array,
): boolean {
  const canonicalWeightBits = new Uint32Array(
    canonicalWeights.buffer,
    canonicalWeights.byteOffset,
    canonicalWeights.length,
  );
  const routedWeightBits = new Uint32Array(weights.buffer, weights.byteOffset, weights.length);
  const canonicalTuples = new Map<string, number>();

  for (let edge = 0; edge < canonicalSources.length; edge += 1) {
    const key = topologyTupleKey(
      canonicalSources[edge],
      canonicalTargets[edge],
      canonicalDelays[edge],
      canonicalWeightBits[edge],
    );
    canonicalTuples.set(key, (canonicalTuples.get(key) ?? 0) + 1);
  }

  for (let source = 0; source < rows.length - 1; source += 1) {
    for (let edge = rows[source]; edge < rows[source + 1]; edge += 1) {
      const key = topologyTupleKey(source, targets[edge], delays[edge], routedWeightBits[edge]);
      const remaining = canonicalTuples.get(key);
      if (!remaining) return false;
      if (remaining === 1) canonicalTuples.delete(key);
      else canonicalTuples.set(key, remaining - 1);
    }
  }

  return canonicalTuples.size === 0;
}

function topologyTupleKey(source: number, target: number, delay: number, weightBits: number): string {
  return `${source}:${target}:${delay}:${weightBits}`;
}

/**
 * Defers WASM loading until the Astro island chooses progressive enhancement.
 * Neither the static document nor fallback UI imports a generated package.
 */
export async function initNeuromorphicAdapter(
  loadWasmModule: () => Promise<NeuromorphicWasmModule>,
  seed: bigint,
  options: NeuromorphicAdapterOptions = {},
): Promise<NeuromorphicAdapter> {
  if (typeof WebAssembly === 'undefined') {
    throw new AdapterUnavailableError('WebAssembly is unavailable in this browser.');
  }
  if (!isU64(seed)) {
    throw new AdapterUnavailableError('The Rust/WASM runtime seed must be a u64 value.');
  }
  // Legacy callers omit options and keep the contract-3 delta-only config.
  const contract = options.contractVersion ?? (
    options.encoderMode === undefined ? NEUROMORPHIC_CONTRACT_VERSION : NEUROMORPHIC_CONTRACT_VERSION_V4
  );
  const encoderMode = options.encoderMode ?? (
    contract === NEUROMORPHIC_CONTRACT_VERSION ? 'delta' : DEFAULT_ENCODER_MODE
  );
  if (!ENCODER_MODE_NAMES.includes(encoderMode)) {
    throw new AdapterUnavailableError('The requested encoder mode is not supported.');
  }
  if (contract !== NEUROMORPHIC_CONTRACT_VERSION && !ENCODER_DIAGNOSTIC_CONTRACTS.has(contract)) {
    throw new AdapterUnavailableError('The requested contract version is not supported.');
  }
  if (contract === NEUROMORPHIC_CONTRACT_VERSION && encoderMode !== 'delta') {
    throw new AdapterUnavailableError('Contract 3 only supports the delta encoder mode.');
  }

  const wasm = await loadWasmModule();
  await wasm.default();
  const config = contract === NEUROMORPHIC_CONTRACT_VERSION
    ? new Uint8Array([NEUROMORPHIC_CONTRACT_VERSION])
    : new Uint8Array([contract, ENCODER_MODES[encoderMode]]);
  const runtime = wasm.WasmAdapter.init(seed, config);
  let disposed = false;

  // Contracts 6 and 7: the projection crosses the boundary once, is validated
  // once against the contract's audited projection, and is attached to every
  // snapshot. Earlier contracts repeat and re-validate it per step.
  let shared: NeuromorphicTopology | null = null;
  if (ONCE_SENT_CONTRACTS.has(contract)) {
    try {
      if (typeof runtime.topology !== 'function') {
        throw new AdapterUnavailableError('The Rust/WASM runtime does not export its topology.');
      }
      const fields = readRawTopology(runtime.topology());
      const expected = auditedProjectionFor(contract);
      if (!expected || !hasValidTopology(fields, expected)) {
        throw new AdapterUnavailableError('The Rust/WASM runtime returned an invalid topology.');
      }
      shared = copyTopology(fields);
    } catch (error) {
      runtime.dispose();
      throw error;
    }
  }

  const ensureActive = (): void => {
    if (disposed) {
      throw new AdapterUnavailableError('The Rust/WASM runtime has already been disposed.');
    }
  };

  return {
    input(sequence, samples) {
      ensureActive();
      if (!isU64(sequence)) {
        throw new AdapterUnavailableError('The Rust/WASM input sequence must be a u64 value.');
      }
      runtime.input(sequence, new Float32Array(samples));
    },
    step() {
      ensureActive();
      return snapshot(runtime.step(), shared);
    },
    state() {
      ensureActive();
      return snapshot(runtime.state(), shared);
    },
    topology() {
      ensureActive();
      return shared ?? topologyOf(snapshot(runtime.state(), null));
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        runtime.dispose();
      }
    },
  };
}
