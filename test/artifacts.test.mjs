import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyCardStatus,
  collectionUrl,
  countDataFiles,
  EXCLUDED_DATASETS,
  fetchHfSnapshot,
  groupByCollection,
  listableRepos,
} from '../src/artifacts/hf-source.mjs';

const json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const snapshot = json('src/data/artifacts/hf-snapshot.json');
const upstream = json('src/data/artifacts/upstream-prs.json');

test('card status flags come from the card text', () => {
  const legacy = '> **Rights:** legacy **research corpus**. Not\n> training data.\n> **Release status:** The raw, uncurated payload is published.';
  assert.deepEqual(classifyCardStatus(legacy), ['research-only', 'raw-uncurated', 'not-training-data']);
  assert.deepEqual(classifyCardStatus('release_stage: raw_uncurated_public, training_ready: false'), ['raw-uncurated', 'not-training-data']);
  assert.deepEqual(classifyCardStatus('Deterministic records, replay-gated.'), []);
});

test('personal-research wording on the Grok-1 cards gets its own label, not research-only', () => {
  assert.deepEqual(classifyCardStatus('# Grok-1 structural parse artifacts (personal research) **Personal research tooling output** — not a product release'),['personal-research']);
});

test('a missing card is an empty status, and a paginated listing is refused', async () => {
  const json = (body, headers = {}) => ({ ok: true, status: 200, headers: new globalThis.Headers(headers), json: async () => body });
  const fetchImpl = async (url) => {
    if (url.includes('/api/datasets?')) return json([{ id: 'rmems/nocard' }]);
    if (url.includes('/api/models?')) return json([]);
    if (url.includes('/api/collections?')) return json([{ slug: 'rmems/demo-1234', items: [] }]);
    if (url.includes('/api/collections/')) return json({ slug: 'rmems/demo-1234', title: 'Demo', lastUpdated: '2026-10-01T00:00:00.000Z', items: [{ type: 'dataset', id: 'rmems/nocard' }] });
    if (url.includes('/api/datasets/')) return json({ siblings: [{ rfilename: 'data.jsonl' }] });
    return { ok: false, status: 404, headers: new globalThis.Headers() };
  };
  const result = await fetchHfSnapshot({ fetchImpl });
  assert.deepEqual(result.datasets, [{ id: 'rmems/nocard', dataFiles: 1, status: [] }]);
  // The listing truncates items, so every collection is read in full.
  assert.deepEqual(result.collections, [{ slug: 'rmems/demo-1234', title: 'Demo', lastUpdated: '2026-10-01', items: [{ type: 'dataset', id: 'rmems/nocard' }] }]);
  await assert.rejects(fetchHfSnapshot({ fetchImpl: async () => json([], { link: '<https://huggingface.co/next>; rel="next"' }) }), /paginated/);
});

test('card-only and excluded repos are never listed', () => {
  assert.equal(countDataFiles(['README.md', '.gitattributes']), 0);
  assert.equal(countDataFiles(['README.md', 'data/train.jsonl']), 1);
  const listed = listableRepos([
    { id: 'rmems/real', dataFiles: 3 },
    { id: 'rmems/card-only', dataFiles: 0 },
    { id: 'rmems/agent-honest-stop-episodes', dataFiles: 9 },
  ]);
  assert.deepEqual(listed.map((repo) => repo.id), ['rmems/real']);
  assert.ok('rmems/agent-honest-stop-episodes' in EXCLUDED_DATASETS);
});

test('the committed snapshot is dated and lists no card-only or excluded dataset', () => {
  assert.match(snapshot.asOf, /^\d{4}-\d{2}-\d{2}$/);
  const listed = listableRepos(snapshot.datasets);
  assert.ok(listed.length > 0);
  for (const repo of listed) {
    assert.ok(repo.dataFiles > 0, `${repo.id} holds no data`);
    assert.notEqual(repo.id, 'rmems/agent-honest-stop-episodes');
  }
});

test('datasets are grouped once each, newest collection first, with the rest ungrouped', () => {
  const datasets = [{ id: 'rmems/a' }, { id: 'rmems/b' }, { id: 'rmems/c' }];
  const collections = [
    { slug: 'rmems/new-1', title: 'New', lastUpdated: '2026-10-20', items: [{ type: 'dataset', id: 'rmems/a' }, { type: 'model', id: 'rmems/M' }, { type: 'dataset', id: 'rmems/excluded' }, { type: 'dataset', id: 'rmems/a' }] },
    { slug: 'rmems/old-2', title: 'Old', lastUpdated: '2026-09-01', items: [{ type: 'dataset', id: 'rmems/a' }, { type: 'dataset', id: 'rmems/b' }] },
    { slug: 'rmems/empty-3', title: 'Empty', lastUpdated: '2026-08-01', items: [] },
  ];
  const grouped = groupByCollection(datasets, collections);
  assert.deepEqual(
    grouped.collections.map((collection) => [collection.title, collection.datasets.map((d) => d.id)]),
    [['New', ['rmems/a']], ['Old', ['rmems/b']]],
    'a dataset repeated inside a collection is listed once, never as an undefined member',
  );
  assert.deepEqual(grouped.ungrouped.map((d) => d.id), ['rmems/c']);
  assert.equal(collectionUrl(collections[0]), 'https://huggingface.co/collections/rmems/new-1');
  assert.deepEqual(groupByCollection(datasets).ungrouped.length, 3, 'an old snapshot without collections lists everything ungrouped');
});

test('the committed snapshot carries the owner\'s collections and the page groups by them', () => {
  assert.ok(Array.isArray(snapshot.collections) && snapshot.collections.length > 0);
  for (const collection of snapshot.collections) {
    assert.match(collection.slug, /^rmems\//);
    assert.match(collection.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
    for (const item of collection.items) assert.ok(item.type && item.id);
  }
  const page = read('src/pages/artifacts.astro');
  assert.match(page, /hf\.collections\.map/);
  assert.match(page, /hf\.ungrouped/);
  assert.match(page, /id="upstream"/);
});

test('a failing Hugging Face API rejects so the loader falls back to the snapshot', async () => {
  await assert.rejects(fetchHfSnapshot({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});

test('every upstream PR is recorded as merged with a diff size and links to its pull request', () => {
  assert.match(upstream.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(upstream.pullRequests.length > 0);
  for (const pr of upstream.pullRequests) {
    assert.match(pr.mergedAt, /^\d{4}-\d{2}-\d{2}$/, `${pr.repo}#${pr.number} is not merged`);
    assert.ok(Number.isInteger(pr.additions) && Number.isInteger(pr.deletions) && pr.additions >= 0 && pr.deletions >= 0 && pr.changedFiles >= 0);
    assert.doesNotMatch(pr.repo, /JuliaRegistries/i);
  }
  const page = read('src/pages/artifacts.astro');
  assert.match(read('src/artifacts/upstream.ts'), /https:\/\/github\.com\/\$\{pr\.repo\}\/pull\/\$\{pr\.number\}/);
  assert.match(page, /as of \{hf\.asOf\}/i);
  assert.match(page, /verified \{upstreamVerifiedAt\}/);
});

test('Artifacts is in the primary navigation and the page exists', () => {
  assert.match(read('src/data/site.ts'), /href: '\/artifacts\/', label: 'Artifacts'/);
});
