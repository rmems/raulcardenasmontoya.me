import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CRATE_GROUPS,
  CRATE_STATUS_NOTES,
  CRATES_API_URL,
  CRATES_USER_AGENT,
  cratesIoUrl,
  docsUrl,
  fetchCratesSnapshot,
  groupCrates,
  normalizeCrate,
  totalDownloads,
} from '../src/artifacts/crates-source.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const snapshot = JSON.parse(read('src/data/artifacts/crates-snapshot.json'));

test('crate records keep only what the page shows and prefer the stable version', () => {
  const record = normalizeCrate({
    name: 'demo',
    max_version: '0.3.0-rc.1',
    max_stable_version: '0.2.0',
    description: '  A crate.  ',
    downloads: 12,
    recent_downloads: 3,
    updated_at: '2026-10-01T12:00:00.000000Z',
    repository: 'https://github.com/rmems/demo',
    documentation: null,
    homepage: '',
  });
  assert.deepEqual(record, {
    name: 'demo',
    version: '0.2.0',
    description: 'A crate.',
    downloads: 12,
    recentDownloads: 3,
    updatedAt: '2026-10-01',
    repository: 'https://github.com/rmems/demo',
    documentation: null,
    homepage: null,
  });
  assert.equal(docsUrl(record), 'https://docs.rs/demo');
  assert.equal(cratesIoUrl(record), 'https://crates.io/crates/demo');
});

test('closed silicon-bridge issue has no stale crate status note', () => {
  assert.equal(CRATE_STATUS_NOTES['silicon-bridge'], undefined);
});

test('the fetch identifies the site, refuses a paginated list, and rejects on HTTP errors', async () => {
  let seen;
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const result = await fetchCratesSnapshot({
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return ok({ crates: [{ name: 'b', max_stable_version: '1.0.0', downloads: 1 }, { name: 'a', max_stable_version: '2.0.0', downloads: 2 }], meta: { total: 2, next_page: null } });
    },
    now: new Date('2026-10-25T10:00:00Z'),
  });
  assert.equal(seen.url, CRATES_API_URL);
  assert.equal(seen.init.headers['user-agent'], CRATES_USER_AGENT);
  assert.match(CRATES_USER_AGENT, /github\.com\/rmems\/raulcardenasmontoya\.me/);
  assert.deepEqual(result.crates.map((crate) => crate.name), ['a', 'b']);
  assert.equal(result.asOf, '2026-10-25');
  await assert.rejects(fetchCratesSnapshot({ fetchImpl: async () => ok({ crates: [], meta: { next_page: '?page=2' } }) }), /paginated/);
  await assert.rejects(fetchCratesSnapshot({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});

test('groups follow the configured order and keep any unlisted crate visible', () => {
  const crates = ['neuromod', 'engram-parser', 'brand-new-crate', 'nir-rs'].map((name) => normalizeCrate({ name, max_version: '0.1.0', downloads: 1 }));
  const groups = groupCrates(crates);
  assert.deepEqual(groups.map((group) => group.title), ['Model tooling', 'Interchange', 'SNN core', 'Other']);
  assert.deepEqual(groups.at(-1).crates.map((crate) => crate.name), ['brand-new-crate']);
  assert.equal(totalDownloads(crates), 4);
  const configured = CRATE_GROUPS.flatMap((group) => group.crates);
  assert.equal(new Set(configured).size, configured.length, 'a crate is listed in one group only');
});

test('the committed snapshot is dated, complete, and every crate is grouped', () => {
  assert.match(snapshot.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(snapshot.userId, 390342);
  assert.ok(snapshot.crates.length >= 11);
  const configured = new Set(CRATE_GROUPS.flatMap((group) => group.crates));
  for (const crate of snapshot.crates) {
    assert.match(crate.version, /^\d+\.\d+\.\d+/, `${crate.name} has no version`);
    assert.ok(crate.description.length > 0, `${crate.name} has no description`);
    assert.ok(Number.isInteger(crate.downloads) && crate.downloads >= 0);
    assert.ok(configured.has(crate.name), `${crate.name} is not in a display group`);
  }
});

test('the loader falls back to the snapshot and the page shows dated counts with the download caveat', () => {
  const loader = read('src/artifacts/crates.ts');
  assert.match(loader, /SKIP_CRATES_FETCH/);
  assert.match(loader, /crates-snapshot\.json/);
  const page = read('src/pages/artifacts.astro');
  assert.match(page, /as of \{crates\.asOf\}/);
  assert.match(page, /include CI and mirror traffic/);
  assert.match(page, /id="crates"/);
  assert.match(page, /docsUrl\(crate\)/);
  assert.match(page, /cratesIoUrl\(crate\)/);
  assert.match(read('CONTENT.md'), /build-crates-snapshot\.mjs/);
});
