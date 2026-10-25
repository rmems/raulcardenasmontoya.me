// Regenerates src/data/artifacts/crates-snapshot.json, the dated fallback used by
// the homepage stat row and /artifacts/ when crates.io is unreachable at build time.
//   node scripts/build-crates-snapshot.mjs
import { renameSync, writeFileSync } from 'node:fs';
import { fetchCratesSnapshot } from '../src/artifacts/crates-source.mjs';

try {
  const snapshot = await fetchCratesSnapshot();
  const target = new URL('../src/data/artifacts/crates-snapshot.json', import.meta.url);
  const temporary = new URL('../src/data/artifacts/crates-snapshot.json.tmp', import.meta.url);
  // Write beside the target and rename, so an interrupted run cannot leave partial JSON.
  writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}
`);
  renameSync(temporary, target);
  console.log(`wrote ${snapshot.crates.length} crates as of ${snapshot.asOf}`);
} catch (error) {
  console.error(`Could not refresh the crates.io snapshot (the committed one is unchanged): ${error}`);
  process.exitCode = 1;
}
