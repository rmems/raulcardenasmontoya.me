// crates.io source for the published-crates section of /artifacts/ and the
// homepage stat row. Shared by the build-time loader (src/artifacts/crates.ts)
// and `scripts/build-crates-snapshot.mjs`, so the live fetch and the committed
// snapshot go through the same normalisation.

/** crates.io user id of https://crates.io/users/rmems (stable; the login can change). */
export const CRATES_USER_ID = 390342;
export const CRATES_OWNER = 'rmems';
export const CRATES_API_URL = `https://crates.io/api/v1/crates?user_id=${CRATES_USER_ID}&per_page=50`;
/** crates.io's crawler policy asks for a User-Agent that identifies the caller. */
export const CRATES_USER_AGENT = 'raulcardenasmontoya.me site build (+https://github.com/rmems/raulcardenasmontoya.me)';

/**
 * Display groups, in page order. A crate that is in no group is listed under
 * "Other" so a newly published crate never disappears from the page.
 */
export const CRATE_GROUPS = Object.freeze([
  Object.freeze({ key: 'model-tooling', title: 'Model tooling', crates: Object.freeze(['engram-parser']) }),
  Object.freeze({ key: 'interchange', title: 'Interchange', crates: Object.freeze(['nir-rs', 'corpus-ipc']) }),
  Object.freeze({
    key: 'snn-core',
    title: 'SNN core',
    crates: Object.freeze(['neuromod', 'axon-encoder', 'synaptic-wiring', 'limbic-critic', 'plasticity-lab', 'kinetic-signals']),
  }),
  Object.freeze({ key: 'hardware-io', title: 'Hardware and I/O', crates: Object.freeze(['silicon-bridge', 'myelin-accelerator']) }),
]);

/** Optional per-crate status notes shown under the description; keep each tied to a current public issue. */
export const CRATE_STATUS_NOTES = Object.freeze({});

/** Keep only what the page shows, so the snapshot stays small and reviewable. */
export function normalizeCrate(crate) {
  const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return {
    name: String(crate.name),
    version: text(crate.max_stable_version) ?? text(crate.max_version) ?? text(crate.newest_version) ?? '',
    description: text(crate.description) ?? '',
    downloads: Number(crate.downloads ?? 0),
    recentDownloads: Number(crate.recent_downloads ?? 0),
    updatedAt: String(crate.updated_at ?? '').slice(0, 10),
    repository: text(crate.repository),
    documentation: text(crate.documentation),
    homepage: text(crate.homepage),
  };
}

/**
 * Fetch every crate the user owns. Throws on any failure so callers fall back
 * to the dated snapshot as a whole instead of mixing live and stale rows.
 */
export async function fetchCratesSnapshot({ fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const response = await fetchImpl(CRATES_API_URL, {
    headers: { 'user-agent': CRATES_USER_AGENT, accept: 'application/json' },
    signal: globalThis.AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${CRATES_API_URL} -> HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.crates)) throw new Error(`${CRATES_API_URL} returned no crate list`);
  // Refuse a truncated list rather than silently drop crates.
  if (data.meta?.next_page) throw new Error(`${CRATES_API_URL} is paginated beyond the requested page size`);
  return {
    asOf: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now),
    source: CRATES_API_URL,
    userId: CRATES_USER_ID,
    crates: data.crates.map(normalizeCrate).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Group crates for display: configured groups in order, then any crate in no group. */
export function groupCrates(crates) {
  const byName = new Map(crates.map((crate) => [crate.name, crate]));
  const placed = new Set();
  const groups = [];
  for (const group of CRATE_GROUPS) {
    const members = group.crates.filter((name) => byName.has(name)).map((name) => byName.get(name));
    for (const member of members) placed.add(member.name);
    if (members.length > 0) groups.push({ key: group.key, title: group.title, crates: members });
  }
  const other = crates.filter((crate) => !placed.has(crate.name));
  if (other.length > 0) groups.push({ key: 'other', title: 'Other', crates: other });
  return groups;
}

export const cratesIoUrl = (crate) => `https://crates.io/crates/${crate.name}`;
/** docs.rs builds documentation for every published crate, so a missing `documentation` field still has a page. */
export const docsUrl = (crate) => crate.documentation ?? `https://docs.rs/${crate.name}`;
export const totalDownloads = (crates) => crates.reduce((sum, crate) => sum + crate.downloads, 0);
