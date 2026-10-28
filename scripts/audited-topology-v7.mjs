// Reads the generated contract-7 projection (`src/runtime/audited-topology-v7.ts`,
// written by `crates/neuromorphic-adapter/tests/audited_topology.rs`) as plain
// data, for scripts that cannot import TypeScript: the Node and browser WASM
// smoke tests and the browser performance harness. The module is a literal of
// scalars and number lists, so a small parser is enough; anything else fails.
import { readFile } from 'node:fs/promises';

const SCALAR = /^\s*(\w+): '?([^',\n]+?)'?,$/gm;
const LIST = /^\s*(\w+): \[\n([\s\S]*?)\n\s*\],$/gm;

/** Parse the generated module's source into `{ digest, neurons, fanOut, maxDelay, edgeTargets, edgeDelays, polarities, weightBits }`. */
export function parseAuditedTopologyV7(source) {
  const scalars = Object.fromEntries([...source.matchAll(SCALAR)].map(([, key, value]) => [key, value]));
  const lists = Object.fromEntries(
    [...source.matchAll(LIST)].map(([, key, body]) => [
      key,
      body
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((value) => {
          const number = Number(value);
          if (!Number.isInteger(number) || number < 0) throw new Error(`audited-topology-v7.ts: ${key} holds a non-integer "${value}"`);
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
    throw new Error('audited-topology-v7.ts has no digest');
  }
  for (const key of ['neurons', 'fanOut', 'maxDelay']) {
    if (!Number.isInteger(topology[key]) || topology[key] < 1) throw new Error(`audited-topology-v7.ts has no ${key}`);
  }
  const edges = topology.neurons * topology.fanOut;
  for (const key of ['edgeTargets', 'edgeDelays', 'polarities', 'weightBits']) {
    if (!Array.isArray(topology[key]) || topology[key].length !== edges) {
      throw new Error(`audited-topology-v7.ts: ${key} does not hold ${edges} entries`);
    }
  }
  if (topology.edgeTargets.some((target) => target >= topology.neurons)) throw new Error('audited-topology-v7.ts has a target outside the network');
  if (topology.edgeDelays.some((delay) => delay < 1 || delay > topology.maxDelay)) throw new Error('audited-topology-v7.ts has a delay outside 1..maxDelay');
  if (topology.polarities.some((polarity) => polarity > 1)) throw new Error('audited-topology-v7.ts has a polarity other than 0 or 1');
  return topology;
}

/** Read and parse the committed module. `path` defaults to the repository copy. */
export async function readAuditedTopologyV7(path = new URL('../src/runtime/audited-topology-v7.ts', import.meta.url)) {
  return parseAuditedTopologyV7(await readFile(path, 'utf8'));
}
