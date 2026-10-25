// Regenerates src/data/artifacts/hf-snapshot.json, the dated fallback used by the
// /artifacts/ page when the Hugging Face API is unreachable at build time.
//   node scripts/build-hf-snapshot.mjs
import { renameSync, writeFileSync } from 'node:fs';
import { fetchHfSnapshot } from '../src/artifacts/hf-source.mjs';

try {
  const snapshot = await fetchHfSnapshot();
  const target = new URL('../src/data/artifacts/hf-snapshot.json', import.meta.url);
  const temporary = new URL('../src/data/artifacts/hf-snapshot.json.tmp', import.meta.url);
  // Write beside the target and rename, so an interrupted run cannot leave partial JSON.
  writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}
`);
  renameSync(temporary, target);
  console.log(`wrote ${snapshot.datasets.length} datasets, ${snapshot.models.length} models and ${snapshot.collections.length} collections as of ${snapshot.asOf}`);
} catch (error) {
  console.error(`Could not refresh the Hugging Face snapshot (the committed one is unchanged): ${error}`);
  process.exitCode = 1;
}
