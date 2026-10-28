// Regenerates src/data/artifacts/github-snapshot.json, the dated fallback used by
// the "Also on GitHub" index on /work/ when the GitHub API is unreachable at build time.
//   node scripts/build-github-snapshot.mjs
import { renameSync, writeFileSync } from 'node:fs';
import { fetchGithubSnapshot } from '../src/artifacts/github-source.mjs';

try {
  const snapshot = await fetchGithubSnapshot();
  const target = new URL('../src/data/artifacts/github-snapshot.json', import.meta.url);
  const temporary = new URL('../src/data/artifacts/github-snapshot.json.tmp', import.meta.url);
  // Write beside the target and rename, so an interrupted run cannot leave partial JSON.
  writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}
`);
  renameSync(temporary, target);
  console.log(`wrote ${snapshot.repos.length} repositories as of ${snapshot.asOf}`);
} catch (error) {
  console.error(`Could not refresh the GitHub snapshot (the committed one is unchanged): ${error}`);
  process.exitCode = 1;
}
