import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  coveredByLinks,
  EXCLUDED_REPOS,
  fetchGithubSnapshot,
  firstSentence,
  GITHUB_OWNERS,
  GITHUB_USER_AGENT,
  groupRepos,
  listableRepos,
  normalizeRepo,
  pushMonth,
  REPO_GROUPS,
  REPO_NOTES,
  reposUrl,
  withSnapshotFallback,
} from '../src/artifacts/github-source.mjs';
import { briefLinksFrom, checkLinks, workLinks, workLinksFromHtml } from '../scripts/check-repo-links.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const snapshot = JSON.parse(read('src/data/artifacts/github-snapshot.json'));
const projectsSource = read('src/data/projects.ts');

const repo = (fullName, extra = {}) =>
  normalizeRepo({ full_name: fullName, html_url: `https://github.com/${fullName}`, description: 'A repo.', language: 'Rust', pushed_at: '2026-10-26T12:00:00Z', ...extra });

test('repository records keep only what the page and the filters need', () => {
  assert.deepEqual(
    normalizeRepo({
      full_name: 'rmems/demo',
      html_url: 'https://github.com/rmems/demo',
      description: '  Two   spaces.  ',
      language: null,
      pushed_at: '2026-09-30T23:59:59Z',
      archived: false,
      private: false,
      visibility: 'public',
      fork: false,
      stargazers_count: 3,
    }),
    { fullName: 'rmems/demo', url: 'https://github.com/rmems/demo', description: 'Two spaces.', language: null, pushedAt: '2026-09-30', archived: false, private: false, fork: false },
  );
  assert.equal(normalizeRepo({ full_name: 'a/b', html_url: 'x', visibility: 'internal' }).private, true);
});

test('archived, private, forked, profile, excluded and brief-linked repositories are left out automatically', () => {
  const repos = [
    repo('rmems/kept'),
    repo('rmems/old', { archived: true }),
    repo('rmems/secret', { private: true }),
    repo('rmems/forked', { fork: true }),
    repo('rmems/.github'),
    repo('rmems/rmems.github.io'),
    repo('rmems/combine-for-AI'),
    repo('rmems/raulcardenasmontoya.me'),
    repo('rmems/engram-parser'),
    repo('Limen-Neural/nir-rs'),
  ];
  const briefs = ['https://github.com/rmems/Engram-Parser', 'https://github.com/Limen-Neural/'];
  assert.deepEqual(listableRepos(repos, briefs).map((r) => r.fullName), ['rmems/kept']);
  assert.equal(coveredByLinks(repo('rmems/engram-parser-extra'), briefs), false, 'a repository link covers only that repository');
  assert.equal(coveredByLinks(repo('rmems/x'), ['not a url', 'https://example.com/rmems']), false);
});

test('the repositories #57 holds back until they have results are never listed', () => {
  for (const name of ['rmems/combine-for-AI', 'rmems/blackwell-kernel-lab', 'rmems/silicon-bridge', 'rmems/Limen-Capital']) {
    assert.match(EXCLUDED_REPOS[name], /RM-2267/);
  }
  const listed = listableRepos(snapshot.repos, briefLinksFrom(projectsSource)).map((r) => r.fullName);
  for (const name of Object.keys(EXCLUDED_REPOS)) assert.ok(!listed.includes(name), `${name} is listed`);
});

test('descriptions are cut to their first sentence and push dates to a month', () => {
  assert.equal(firstSentence('Q8.8 fixed-point export. Then more detail.'), 'Q8.8 fixed-point export.');
  assert.equal(firstSentence('A parser. works offline.'), 'A parser.', 'a lowercase next sentence is still a break');
  assert.equal(firstSentence('No break here'), 'No break here');
  assert.equal(firstSentence(''), '');
  assert.equal(pushMonth('2026-10-01'), 'Oct 2026');
  assert.equal(pushMonth(''), '');
});

test('the fetch reads both accounts, identifies the site, refuses a paginated list, and rejects on HTTP errors', async () => {
  const seen = [];
  const ok = (body, headers = {}) => ({ ok: true, status: 200, headers: new globalThis.Headers(headers), json: async () => body });
  const result = await fetchGithubSnapshot({
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      const owner = url.split('/users/')[1].split('/')[0];
      return ok([{ full_name: `${owner}/z`, html_url: `https://github.com/${owner}/z` }, { full_name: `${owner}/a`, html_url: `https://github.com/${owner}/a` }]);
    },
    now: new Date('2026-10-28T03:00:00Z'),
    token: 'secret',
  });
  assert.deepEqual(seen.map((s) => s.url), GITHUB_OWNERS.map(reposUrl));
  assert.equal(seen[0].init.headers['user-agent'], GITHUB_USER_AGENT);
  assert.equal(seen[0].init.headers.authorization, 'Bearer secret');
  assert.equal(result.asOf, '2026-10-27', 'dated in Central time');
  assert.deepEqual(result.repos.map((r) => r.fullName), ['Limen-Neural/a', 'Limen-Neural/z', 'rmems/a', 'rmems/z']);
  const unauthenticated = [];
  await fetchGithubSnapshot({ fetchImpl: async (url, init) => (unauthenticated.push(init.headers), ok([])), token: '' });
  assert.ok(unauthenticated.every((headers) => !('authorization' in headers)));
  await assert.rejects(fetchGithubSnapshot({ fetchImpl: async () => ok([], { link: '<https://api.github.com/next>; rel="next"' }) }), /paginated/);
  await assert.rejects(fetchGithubSnapshot({ fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});

test('groups follow the configured order and keep any unlisted repository visible', () => {
  const groups = groupRepos([repo('rmems/writ'), repo('rmems/brand-new'), repo('rmems/LiquidCortex.jl')]);
  assert.deepEqual(groups.map((g) => g.title), ['Spikenaut program', 'Training, data and agents', 'Other']);
  assert.deepEqual(groups.at(-1).repos.map((r) => r.fullName), ['rmems/brand-new']);
  const configured = REPO_GROUPS.flatMap((g) => g.repos.map((name) => name.toLowerCase()));
  assert.equal(new Set(configured).size, configured.length, 'a repository is listed in one group only');
  assert.deepEqual(REPO_GROUPS.map((g) => g.key), ['spikenaut', 'quantization', 'training', 'telemetry', 'hardware', 'trading']);
});

test('the committed snapshot is dated, covers both accounts, and every listed repository is grouped', () => {
  assert.match(snapshot.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(snapshot.owners, [...GITHUB_OWNERS]);
  const listed = listableRepos(snapshot.repos, briefLinksFrom(projectsSource));
  assert.ok(listed.length > 0);
  const configured = new Set(REPO_GROUPS.flatMap((g) => g.repos));
  for (const r of listed) {
    assert.match(r.url, /^https:\/\/github\.com\/(?:rmems|Limen-Neural)\/[\w.-]+$/);
    assert.match(r.pushedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(configured.has(r.fullName), `${r.fullName} is not in a display group`);
  }
  for (const name of Object.keys(REPO_NOTES)) assert.ok(listed.some((r) => r.fullName === name), `note for unlisted ${name}`);
});

test('the link check covers every brief link and index line and fails on anything but a plain 200', async () => {
  const briefs = briefLinksFrom(projectsSource);
  assert.ok(briefs.includes('https://github.com/rmems/engram-parser'));
  assert.deepEqual(
    briefLinksFrom("links: [{ label: 'Demo', href: 'https://demo.example.org/run' }, { label: 'Repo', href: 'https://github.com/rmems/x' }]"),
    ['https://demo.example.org/run', 'https://github.com/rmems/x'],
    'non-GitHub brief links are checked too',
  );
  const html = [
    '<header><a href="https://www.linkedin.com/in/someone">LinkedIn</a></header>',
    '<a class="project-external-link" href="https://demo.example.org/run?a=1&amp;b=2" target="_blank">Demo</a>',
    '<section class="section work-github" id="also-on-github"><ul><li><a href="https://github.com/rmems/live-only" target="_blank">live-only</a></li></ul></section>',
    '<footer><a href="https://github.com/rmems">GitHub</a></footer>',
  ].join('');
  assert.deepEqual(workLinksFromHtml(html), ['https://demo.example.org/run?a=1&b=2', 'https://github.com/rmems/live-only'], 'the built page is checked, without site chrome');
  const urls = workLinks(snapshot, projectsSource);
  for (const r of listableRepos(snapshot.repos, briefs)) assert.ok(urls.includes(r.url));
  const statuses = { 'https://github.com/a': 200, 'https://github.com/b': 301, 'https://github.com/c': 404 };
  const failures = await checkLinks([...Object.keys(statuses), 'https://github.com/d'], {
    fetchImpl: async (url, init) => {
      assert.equal(init.redirect, 'manual');
      if (!(url in statuses)) throw new Error('offline');
      return { status: statuses[url] };
    },
  });
  assert.deepEqual(failures.map((f) => [f.url, f.status]), [
    ['https://github.com/b', '301'],
    ['https://github.com/c', '404'],
    ['https://github.com/d', 'Error: offline'],
  ]);
});

test('the loader uses live data, or the snapshot with the reason when skipped or unreachable', async () => {
  const live = { ...snapshot, asOf: '2099-01-01' };
  const warnings = [];
  const warn = (message) => warnings.push(message);
  assert.deepEqual(await withSnapshotFallback({ skip: false, fetchLive: async () => live, snapshot, warn }), { data: live, source: 'live', fallbackReason: undefined });
  let fetched = false;
  const skipped = await withSnapshotFallback({ skip: true, fetchLive: async () => ((fetched = true), live), snapshot, warn });
  assert.deepEqual(skipped, { data: snapshot, source: 'snapshot', fallbackReason: 'skipped' });
  assert.equal(fetched, false, 'SKIP_GH_FETCH never touches the network');
  const failed = await withSnapshotFallback({ skip: false, fetchLive: async () => { throw new Error('HTTP 403'); }, snapshot, warn });
  assert.deepEqual(failed, { data: snapshot, source: 'snapshot', fallbackReason: 'unreachable' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], new RegExp(`${snapshot.asOf} snapshot: Error: HTTP 403`));
  const page = read('src/pages/work.astro');
  assert.match(page, /the live fetch was skipped for this build/);
  assert.match(page, /the GitHub API was unreachable at build time/);
});

test('the loader falls back to the snapshot and /work/ shows the dated index below the briefs', () => {
  const loader = read('src/artifacts/github.ts');
  assert.match(loader, /skip: Boolean\(process\.env\.SKIP_GH_FETCH\)/);
  assert.match(loader, /withSnapshotFallback\(/);
  assert.match(loader, /github-snapshot\.json/);
  const page = read('src/pages/work.astro');
  assert.match(page, /loadGithubIndex\(\)/);
  assert.match(page, /id="also-on-github"/);
  assert.match(page, /GitHub · as of \{github\.asOf\}/);
  assert.match(page, /\{github\.repos\.length\} more public repositories/);
  assert.ok(page.indexOf('case-study-list') < page.indexOf('also-on-github'), 'the index sits below the briefs');
  assert.match(read('package.json'), /"check:links": "node scripts\/check-repo-links\.mjs"/);
  assert.match(read('CONTENT.md'), /build-github-snapshot\.mjs/);
});
