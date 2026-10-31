/**
 * Provenance for the homepage's live Rust/WASM simulation: the upstream
 * crates the adapter composes, in pipeline order, pinned exactly as in
 * `crates/neuromorphic-adapter/Cargo.toml` and `Cargo.lock`.
 * `test/hero-live-mesh.test.mjs` fails when a pin here drifts from the
 * manifest or the lockfile.
 */
import { PORTFOLIO_DEFAULT_REF, PORTFOLIO_REPOSITORY_URL } from '../native-evidence/view';

export interface LiveCrateLayer {
  name: 'kinetic-signals' | 'axon-encoder' | 'neuromod' | 'synaptic-wiring';
  /** What the crate does in this demo, in a few words. */
  role: string;
  /** Resolved version from `Cargo.lock`. */
  version: string;
  /** Git dependencies are pinned by revision; registry ones by exact version. */
  source: { kind: 'git'; repository: string; revision: string } | { kind: 'crates.io' };
}

export const liveCrateLayers: readonly LiveCrateLayer[] = [
  { name: 'kinetic-signals', role: 'pointer features', version: '0.5.0', source: { kind: 'crates.io' } },
  { name: 'axon-encoder', role: 'spike encoding', version: '0.6.0', source: { kind: 'crates.io' } },
  { name: 'neuromod', role: 'LIF neurons', version: '0.7.0', source: { kind: 'crates.io' } },
  { name: 'synaptic-wiring', role: 'synapses and delays', version: '0.3.0', source: { kind: 'crates.io' } },
];

/** Static link for a crate layer: its pinned source tree or its crates.io release. */
export function crateLayerHref(layer: LiveCrateLayer): string {
  return layer.source.kind === 'git'
    ? `${layer.source.repository}/tree/${layer.source.revision}`
    : `https://crates.io/crates/${layer.name}/${layer.version}`;
}

/**
 * Short pin shown next to the crate name. Git layers name the pinned commit
 * the WASM build uses, so an unpublished or older version string is never
 * read as a crates.io release.
 */
export function crateLayerPin(layer: LiveCrateLayer): string {
  return layer.source.kind === 'git' ? `pinned commit ${layer.source.revision.slice(0, 7)} (${layer.version})` : layer.version;
}

/** The site's adapter crate that composes the layers and owns the WASM boundary. */
export const ADAPTER_SOURCE_URL = `${PORTFOLIO_REPOSITORY_URL}/tree/${PORTFOLIO_DEFAULT_REF}/crates/neuromorphic-adapter`;
