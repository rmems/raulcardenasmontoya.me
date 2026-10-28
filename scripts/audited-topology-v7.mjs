// Reads the generated contract-7 and contract-8 projections
// (`src/runtime/audited-topology-v7.ts`, `src/runtime/audited-topology-v8.ts`,
// written by `crates/neuromorphic-adapter/tests/audited_topology.rs`) as plain
// data, for scripts that cannot import TypeScript: the Node and browser WASM
// smoke tests and the browser performance harness. The modules are literals of
// scalars and number lists, so a small parser is enough; anything else fails.
import { readFile } from 'node:fs/promises';

const SCALAR = /^\s*(\w+): '?([^',\n]+?)'?,$/gm;
// A list body is every line up to the closing `],`; those lines hold only
// integers, so they never contain `]`, which keeps the match linear.
const LIST = /^\s*(\w+): \[\n((?:[^\]\n]*\n)*)\s*\],$/gm;

/** Parse one generated module's source into `{ digest, neurons, fanOut, maxDelay, edgeTargets, edgeDelays, polarities, weightBits }`. */
function parseGeneratedTopology(rawSource, file) {
  // Normalize to LF first, so the parser also reads a Windows checkout,
  // where the generated modules land with CRLF line endings.
  const source = rawSource.replace(/\r\n/g, '\n');
  const scalars = Object.fromEntries([...source.matchAll(SCALAR)].map(([, key, value]) => [key, value]));
  const lists = Object.fromEntries(
    [...source.matchAll(LIST)].map(([, key, body]) => [
      key,
      body
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((value) => {
          const number = Number(value);
          if (!Number.isInteger(number) || number < 0) throw new Error(`${file}: ${key} holds a non-integer "${value}"`);
          return number;
        }),
    ]),
  );
  const topology = {
    digest: scalars.digest,
    neurons: Number(scalars.neurons),
    fanOut: Number(scalars.fanOut),
    maxDelay: Number(scalars.maxDelay),
    edgeTargets: lists.edgeTargets,
    edgeDelays: lists.edgeDelays,
    polarities: lists.polarities,
    weightBits: lists.weightBits,
  };
  if (!/^synaptic-wiring\.topology\.digest\.v1:sha256:[0-9a-f]{64}$/.test(topology.digest ?? '')) {
    throw new Error(`${file} has no digest`);
  }
  for (const key of ['neurons', 'fanOut', 'maxDelay']) {
    if (!Number.isInteger(topology[key]) || topology[key] < 1) throw new Error(`${file} has no ${key}`);
  }
  const edges = topology.neurons * topology.fanOut;
  for (const key of ['edgeTargets', 'edgeDelays', 'polarities', 'weightBits']) {
    if (!Array.isArray(topology[key]) || topology[key].length !== edges) {
      throw new Error(`${file}: ${key} does not hold ${edges} entries`);
    }
  }
  if (topology.edgeTargets.some((target) => target >= topology.neurons)) throw new Error(`${file} has a target outside the network`);
  if (topology.edgeDelays.some((delay) => delay < 1 || delay > topology.maxDelay)) throw new Error(`${file} has a delay outside 1..maxDelay`);
  if (topology.polarities.some((polarity) => polarity > 1)) throw new Error(`${file} has a polarity other than 0 or 1`);
  return topology;
}

/** Parse the generated contract-7 projection module's source. */
export function parseAuditedTopologyV7(source) {
  return parseGeneratedTopology(source, 'audited-topology-v7.ts');
}

/** Parse the generated contract-8 projection module's source. */
export function parseAuditedTopologyV8(source) {
  return parseGeneratedTopology(source, 'audited-topology-v8.ts');
}

/** Read and parse the committed contract-7 module. `path` defaults to the repository copy. */
export async function readAuditedTopologyV7(path = new URL('../src/runtime/audited-topology-v7.ts', import.meta.url)) {
  return parseAuditedTopologyV7(await readFile(path, 'utf8'));
}

/** Read and parse the committed contract-8 module. `path` defaults to the repository copy. */
export async function readAuditedTopologyV8(path = new URL('../src/runtime/audited-topology-v8.ts', import.meta.url)) {
  return parseAuditedTopologyV8(await readFile(path, 'utf8'));
}
