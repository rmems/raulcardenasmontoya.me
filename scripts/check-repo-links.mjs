// Link check for the /work/ page: every brief link and every "Also on GitHub"
// line must answer 200 without a redirect (a renamed or deleted repository fails).
// Checks the built page when `dist/work/index.html` exists, so it covers what the
// build actually rendered (live or snapshot); otherwise it checks what a build
// from the committed snapshot would render. Needs the network, so it is not part
// of `npm test`.
//   npm run build && node scripts/check-repo-links.mjs
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GITHUB_USER_AGENT, listableRepos } from '../src/artifacts/github-source.mjs';

const unique = (urls) => [...new Set(urls)];

/** Every external link in the briefs' data, read from the source so the check needs no TypeScript loader. */
export function briefLinksFrom(projectsSource) {
  return unique(projectsSource.match(/https?:\/\/[^'"`\s)]+/g) ?? []);
}

/** The URLs /work/ links to when it is built from the committed snapshot. */
export function workLinks(snapshot, projectsSource) {
  const briefs = briefLinksFrom(projectsSource);
  return unique([...briefs, ...listableRepos(snapshot.repos, briefs).map((repo) => repo.url)]);
}

const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\bhref=["'](https?:\/\/[^"']+)["']/g)].map((match) => match[1].replaceAll('&amp;', '&'));

/** The brief links and index lines in a built /work/ page; site-wide header and footer links are not part of it. */
export function workLinksFromHtml(html) {
  const briefs = [...html.matchAll(/<a\b[^>]*class="project-external-link"[^>]*>/g)].flatMap((match) => hrefs(match[0]));
  // Fail loudly rather than pass on an empty index if the section's markup changes.
  const start = html.search(/\bid=["']?also-on-github\b/);
  if (start === -1) throw new Error('the built /work/ page has no #also-on-github section');
  // The section holds headings and lists only, so its first closing tag ends it.
  const end = html.indexOf('</section>', start);
  const index = hrefs(html.slice(start, end === -1 ? undefined : end));
  if (index.length === 0) throw new Error('the #also-on-github section links to no repository');
  return unique([...briefs, ...index]);
}

/** Request each URL; resolve to the ones that did not answer 200, with what they answered instead. */
export async function checkLinks(urls, { fetchImpl = globalThis.fetch, concurrency = 6 } = {}) {
  const failures = [];
  const queue = [...urls];
  const check = async (url) => {
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
  };
  // A small pool of workers, each taking the next URL until none are left.
  const worker = async () => {
    const url = queue.shift();
    if (url === undefined) return;
    await check(url);
    await worker();
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return failures.sort((a, b) => a.url.localeCompare(b.url));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = (relative) => new URL(`../${relative}`, import.meta.url);
  const read = (relative) => readFileSync(path(relative), 'utf8');
  const built = existsSync(path('dist/work/index.html'));
  const urls = built
    ? workLinksFromHtml(read('dist/work/index.html'))
    : workLinks(JSON.parse(read('src/data/artifacts/github-snapshot.json')), read('src/data/projects.ts'));
  const failures = await checkLinks(urls);
  for (const failure of failures) console.error(`${failure.url} -> ${failure.status}`);
  const from = built ? 'the built /work/ page' : 'the committed snapshot (no dist/ build found)';
  if (failures.length > 0) {
    console.error(`${failures.length} of ${urls.length} links from ${from} did not return 200.`);
    process.exitCode = 1;
  } else {
    console.log(`All ${urls.length} links from ${from} returned 200.`);
  }
}
