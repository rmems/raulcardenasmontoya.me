// Hugging Face source for the /artifacts/ page. Shared by the build-time loader
// (src/artifacts/hf.ts) and `scripts/build-hf-snapshot.mjs`, so the live fetch and the
// committed snapshot go through the same classification.

export const HF_OWNER = 'rmems';

// Repos that must never be listed as datasets, with the reason.
export const EXCLUDED_DATASETS = {
  'rmems/agent-honest-stop-episodes': 'Card only, no data.',
};

const CARD_FILES = new Set(['README.md', '.gitattributes', '.gitignore']);

/** Own-card status flags, read from the card text (never inferred from anything else). */
export function classifyCardStatus(readme) {
  const text = String(readme ?? '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\s+/g, ' ');
  const flags = [];
  if (/research[- _](?:only|corpus|snapshot)/i.test(text)) flags.push('research-only');
  if (/personal[- _]research/i.test(text)) flags.push('personal-research');
  if (/raw,?\s+uncurated|raw_uncurated/i.test(text)) flags.push('raw-uncurated');
  if (/not\s+(?:\w+\s+)?training[- ]?(?:data|ready)|training_ready:\s*`?false/i.test(text)) flags.push('not-training-data');
  return flags;
}

export const STATUS_LABELS = {
  'research-only': 'Research-only',
  'personal-research': 'Personal research',
  'raw-uncurated': 'Raw / uncurated',
  'not-training-data': 'Not training data',
};

/** A repo with nothing but card/attribute files holds no data. */
export function countDataFiles(filenames) {
  return filenames.filter((name) => !CARD_FILES.has(name)).length;
}

/** Keep only repos that carry data and are not explicitly excluded. */
export function listableRepos(repos) {
  return repos.filter((repo) => repo.dataFiles > 0 && !(repo.id in EXCLUDED_DATASETS));
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: globalThis.AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  // Listings are cursor-paginated; refuse a truncated list rather than silently drop repos.
  if (/rel="next"/.test(response.headers?.get?.('link') ?? '')) throw new Error(`${url} is paginated beyond the requested limit`);
  return response.json();
}

async function getText(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: globalThis.AbortSignal.timeout(20_000) });
  // A repo with data but no card is still listable; it just has no status label.
  if (response.status === 404) return '';
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

async function inBatches(items, size, task) {
  const results = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...(await Promise.all(items.slice(index, index + size).map(task))));
  }
  return results;
}

/**
 * Fetch every public dataset, model and collection for the owner. Throws on any
 * failure so callers fall back to the dated snapshot as a whole instead of mixing
 * live and stale rows.
 */
export async function fetchHfSnapshot({ fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const base = 'https://huggingface.co';
  const [datasetList, modelList, collectionList] = await Promise.all([
    getJson(`${base}/api/datasets?author=${HF_OWNER}&limit=1000`, fetchImpl),
    getJson(`${base}/api/models?author=${HF_OWNER}&limit=1000`, fetchImpl),
    getJson(`${base}/api/collections?owner=${HF_OWNER}&limit=100`, fetchImpl),
  ]);
  const datasets = await inBatches(datasetList, 8, async ({ id }) => {
    const [info, readme] = await Promise.all([
      getJson(`${base}/api/datasets/${id}`, fetchImpl),
      getText(`${base}/datasets/${id}/raw/main/README.md`, fetchImpl),
    ]);
    return { id, dataFiles: countDataFiles((info.siblings ?? []).map((file) => file.rfilename)), status: classifyCardStatus(readme) };
  });
  const models = await inBatches(modelList, 8, async ({ id }) => {
    const info = await getJson(`${base}/api/models/${id}`, fetchImpl);
    return { id, dataFiles: countDataFiles((info.siblings ?? []).map((file) => file.rfilename)) };
  });
  // The listing truncates each collection's items, so read every collection in full.
  const collections = await inBatches(collectionList, 4, async ({ slug }) => {
    const info = await getJson(`${base}/api/collections/${slug}`, fetchImpl);
    return {
      slug: String(info.slug ?? slug),
      title: String(info.title ?? slug),
      lastUpdated: String(info.lastUpdated ?? '').slice(0, 10),
      items: (info.items ?? []).map((item) => ({ type: String(item.type), id: String(item.id) })),
    };
  });
  const byId = (a, b) => a.id.localeCompare(b.id);
  const newestFirst = (a, b) => b.lastUpdated.localeCompare(a.lastUpdated) || a.title.localeCompare(b.title);
  return {
    asOf: now.toISOString().slice(0, 10),
    source: `${base}/api/datasets?author=${HF_OWNER}`,
    datasets: datasets.sort(byId),
    models: models.sort(byId),
    collections: collections.sort(newestFirst),
  };
}

/**
 * Place each listable dataset under the first collection (newest first) that
 * holds it, so every dataset appears exactly once; the rest are "ungrouped".
 */
export function groupByCollection(datasets, collections = []) {
  const remaining = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  const grouped = [];
  for (const collection of collections) {
    const members = collection.items
      .filter((item) => item.type === 'dataset' && remaining.has(item.id))
      .map((item) => {
        const dataset = remaining.get(item.id);
        remaining.delete(item.id);
        return dataset;
      });
    if (members.length > 0) grouped.push({ slug: collection.slug, title: collection.title, lastUpdated: collection.lastUpdated, datasets: members });
  }
  return { collections: grouped, ungrouped: [...remaining.values()] };
}

export const collectionUrl = (collection) => `https://huggingface.co/collections/${collection.slug}`;
