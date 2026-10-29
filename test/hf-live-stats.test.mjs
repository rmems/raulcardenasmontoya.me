import assert from 'node:assert/strict';
import test from 'node:test';

import { h } from './fake-dom.mjs';
import { loadTsModule } from './load-ts-module.mjs';

const { refreshHfStats, HF_API_BASE } = await loadTsModule('../src/runtime/hf-live-stats.ts');

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** A rendered stats block, as `/artifacts/` renders it from the snapshot. */
function statsBlock({ kind = 'datasets', repo, figures = '1 download', asOf = '2026-10-01' }) {
  return h(
    'span',
    { class: 'artifact-status artifact-stats', 'data-hf-stats': '', 'data-hf-kind': kind, 'data-hf-repo': repo, 'data-hf-stats-source': 'snapshot' },
    h('span', { 'data-hf-figures': '' }, figures),
    h('span', { 'data-hf-freshness': '' }, `as of ${asOf}`),
  );
}

function page(...blocks) {
  const section = h('section', { id: 'datasets', 'data-hf-source': 'snapshot', 'data-hf-as-of': '2026-10-01' }, ...blocks);
  return { root: h('div', {}, section), section };
}

const figures = (block) => block.querySelector('[data-hf-figures]').textContent;
const freshness = (block) => block.querySelector('[data-hf-freshness]').textContent;

test('live figures replace the snapshot in place and are labelled with the fetch time', async () => {
  const dataset = statsBlock({ repo: 'rmems/agentic-coding-trajectories', figures: '16 downloads' });
  const model = statsBlock({ kind: 'models', repo: 'rmems/Spikenaut-SNN', figures: '1 like' });
  const { root, section } = page(dataset, model);
  const requested = [];
  const result = await refreshHfStats({
    root,
    now: () => new Date('2026-10-29T20:30:00.000Z'),
    fetchImpl: async (url) => {
      requested.push(url);
      if (url.startsWith(`${HF_API_BASE}/api/models/`)) return response({ downloads: 46, likes: 2, lastModified: '2026-09-29T11:00:00.000Z' });
      return response({ downloads: 1234, likes: 3, lastModified: '2026-09-18T07:24:07.000Z' });
    },
  });

  assert.deepEqual(requested.sort(), [
    `${HF_API_BASE}/api/datasets/rmems/agentic-coding-trajectories`,
    `${HF_API_BASE}/api/models/rmems/Spikenaut-SNN`,
  ]);
  assert.equal(figures(dataset), '1,234 downloads · 3 likes · updated 2026-09-18');
  assert.equal(freshness(dataset), 'live, fetched 20:30 UTC');
  assert.equal(dataset.getAttribute('data-hf-stats-source'), 'live');
  assert.equal(figures(model), '46 downloads · 2 likes · updated 2026-09-29');
  assert.equal(model.getAttribute('data-hf-stats-source'), 'live');
  assert.equal(section.getAttribute('data-hf-live'), 'ok');
  assert.deepEqual({ total: result.total, refreshed: result.refreshed, kept: result.kept }, { total: 2, refreshed: 2, kept: 0 });
});

test('a repository the API does not answer for keeps its snapshot figure and its date', async () => {
  const live = statsBlock({ repo: 'rmems/live' });
  const failed = statsBlock({ repo: 'rmems/failed', figures: '358 downloads' });
  const { root, section } = page(live, failed);
  const result = await refreshHfStats({
    root,
    now: () => new Date('2026-10-29T20:30:00.000Z'),
    fetchImpl: async (url) => (url.endsWith('/failed') ? response({ error: 'boom' }, 503) : response({ downloads: 9, likes: 0 })),
  });

  assert.equal(figures(failed), '358 downloads');
  assert.equal(freshness(failed), 'as of 2026-10-01', 'the snapshot date stays, so the figure is never undated');
  assert.equal(failed.getAttribute('data-hf-stats-source'), 'snapshot');
  assert.equal(live.getAttribute('data-hf-stats-source'), 'live');
  assert.equal(section.getAttribute('data-hf-live'), 'partial');
  assert.deepEqual({ total: result.total, refreshed: result.refreshed, kept: result.kept }, { total: 2, refreshed: 1, kept: 1 });
});

test('a payload with no usable figure never becomes a blank or an invented zero', async () => {
  const block = statsBlock({ repo: 'rmems/no-stats', figures: '2 downloads' });
  const { root, section } = page(block);
  await refreshHfStats({ root, fetchImpl: async () => response({ downloads: -1, likes: null, lastModified: 'unknown' }) });

  assert.equal(figures(block), '2 downloads');
  assert.equal(freshness(block), 'as of 2026-10-01');
  assert.equal(section.getAttribute('data-hf-live'), 'unavailable');
});

test('a slow API is abandoned per request and the page keeps the snapshot', async () => {
  const block = statsBlock({ repo: 'rmems/slow', figures: '5 downloads' });
  const { root, section } = page(block);
  const started = Date.now();
  const result = await refreshHfStats({ root, timeoutMs: 20, fetchImpl: () => new Promise(() => {}) });

  assert.ok(Date.now() - started < 2_000, 'the refresh settles instead of waiting on the request');
  assert.equal(figures(block), '5 downloads');
  assert.equal(freshness(block), 'as of 2026-10-01');
  assert.equal(section.getAttribute('data-hf-live'), 'unavailable');
  assert.equal(result.kept, 1);
});

test('a rate-limited API stops the refresh instead of asking for every remaining repo', async () => {
  const blocks = Array.from({ length: 5 }, (_unused, index) => statsBlock({ repo: `rmems/queued${index}`, figures: '1 download' }));
  const { root, section } = page(...blocks);
  let calls = 0;
  const result = await refreshHfStats({
    root,
    concurrency: 1,
    fetchImpl: async () => {
      calls += 1;
      return response({ error: 'too many requests' }, 429);
    },
  });

  assert.equal(calls, 1, 'the Hub is asked once, not once per repo, after it says 429');
  assert.ok(blocks.every((block) => block.getAttribute('data-hf-stats-source') === 'snapshot'));
  assert.equal(section.getAttribute('data-hf-live'), 'unavailable');
  assert.equal(result.kept, 5);
});

test('a page with no rendered stats fetches nothing and does not throw', async () => {
  const { root, section } = page();
  let calls = 0;
  const result = await refreshHfStats({ root, fetchImpl: async () => { calls += 1; return response({}); } });

  assert.equal(calls, 0);
  assert.equal(result.total, 0);
  assert.equal(section.getAttribute('data-hf-live'), null, 'nothing to refresh means no live state to claim');
});

test('requests are capped by the concurrency option', async () => {
  const blocks = Array.from({ length: 7 }, (_unused, index) => statsBlock({ repo: `rmems/r${index}` }));
  const { root } = page(...blocks);
  let inFlight = 0;
  let peak = 0;
  const result = await refreshHfStats({
    root,
    concurrency: 3,
    fetchImpl: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return response({ downloads: 1 });
    },
  });

  assert.equal(peak, 3, 'never more than the configured number of requests at once');
  assert.equal(result.refreshed, 7);
});
