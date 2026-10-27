// Link check for the /work/ page: every brief link and every "Also on GitHub"
// line must answer 200 without a redirect (a renamed or deleted repository fails).
// Needs the network, so it is not part of `npm test`.
//   node scripts/check-repo-links.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GITHUB_USER_AGENT, listableRepos } from '../src/artifacts/github-source.mjs';

/** GitHub links in the briefs, read from the source so the check needs no TypeScript loader. */
export function briefLinksFrom(projectsSource) {
  return [...new Set(projectsSource.match(/https:\/\/github\.com\/[^'"\s)]+/g) ?? [])];
}

/** The URLs /work/ links to when it is built from the committed snapshot. */
export function workLinks(snapshot, projectsSource) {
  const briefs = briefLinksFrom(projectsSource);
  return [...new Set([...briefs, ...listableRepos(snapshot.repos, briefs).map((repo) => repo.url)])];
}

/** Request each URL; resolve to the ones that did not answer 200, with what they answered instead. */
export async function checkLinks(urls, { fetchImpl = globalThis.fetch, batch = 6 } = {}) {
  const failures = [];
  for (let index = 0; index < urls.length; index += batch) {
    await Promise.all(
      urls.slice(index, index + batch).map(async (url) => {
        try {
          const response = await fetchImpl(url, {
            method: 'GET',
            redirect: 'manual',
            headers: { 'user-agent': GITHUB_USER_AGENT },
            signal: globalThis.AbortSignal.timeout(20_000),
          });
          if (response.status !== 200) failures.push({ url, status: String(response.status) });
        } catch (error) {
          failures.push({ url, status: String(error) });
        }
      }),
    );
  }
  return failures.sort((a, b) => a.url.localeCompare(b.url));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const urls = workLinks(JSON.parse(read('src/data/artifacts/github-snapshot.json')), read('src/data/projects.ts'));
  const failures = await checkLinks(urls);
  for (const failure of failures) console.error(`${failure.url} -> ${failure.status}`);
  if (failures.length > 0) {
    console.error(`${failures.length} of ${urls.length} /work/ links did not return 200.`);
    process.exitCode = 1;
  } else {
    console.log(`All ${urls.length} /work/ links returned 200.`);
  }
}
