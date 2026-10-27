// GitHub source for the "Also on GitHub" index on /work/. Shared by the build-time
// loader (src/artifacts/github.ts), `scripts/build-github-snapshot.mjs` and
// `scripts/check-repo-links.mjs`, so the live fetch and the committed snapshot go
// through the same normalisation and filtering.

/** Accounts whose public repositories the index draws from. */
export const GITHUB_OWNERS = Object.freeze(['rmems', 'Limen-Neural']);
export const GITHUB_API = 'https://api.github.com';
export const GITHUB_USER_AGENT = 'raulcardenasmontoya.me site build (+https://github.com/rmems/raulcardenasmontoya.me)';
export const reposUrl = (owner) => `${GITHUB_API}/users/${owner}/repos?type=owner&per_page=100&sort=full_name`;

/**
 * Display groups, in page order. A listable repository in no group is shown
 * under "Other" so a new public repository never disappears from the page.
 */
export const REPO_GROUPS = Object.freeze([
  Object.freeze({
    key: 'spikenaut',
    title: 'Spikenaut program',
    repos: Object.freeze([
      'rmems/Spikenaut-SNN',
      'rmems/LiquidCortex.jl',
      'rmems/SynapticDistill.jl',
      'rmems/NeuroPulse.jl',
      'rmems/TemporalFocus.jl',
      'rmems/SpikeStream.jl',
      'rmems/kinetic-signals',
      'rmems/spike-viz',
      'rmems/Surrogate_Viz.jl',
    ]),
  }),
  Object.freeze({
    key: 'quantization',
    title: 'Quantization and hybrid models',
    repos: Object.freeze([
      'rmems/corinth-canal',
      'rmems/magere-brug',
      'rmems/hybrid-fusion',
      'rmems/cortex-tensor',
      'rmems/grok-ozempic',
      'rmems/xai-dissect',
      'rmems/XAIDissect_Viz.jl',
    ]),
  }),
  Object.freeze({
    key: 'training',
    title: 'Training, data and agents',
    repos: Object.freeze(['rmems/operation-prometheus', 'rmems/writ', 'rmems/Dioscuri-Cloud']),
  }),
  Object.freeze({
    key: 'telemetry',
    title: 'Telemetry',
    repos: Object.freeze(['rmems/vahtisiru', 'rmems/Theseus-Quarry', 'rmems/gaming-telemetry', 'rmems/spikenaut-telemetry-etl']),
  }),
  Object.freeze({ key: 'hardware', title: 'FPGA and hardware', repos: Object.freeze(['rmems/silicon-hdl']) }),
  Object.freeze({ key: 'trading', title: 'Trading experiments', repos: Object.freeze(['rmems/DendriteTrader.jl', 'rmems/metabolic-ledger']) }),
]);

/**
 * Public repositories that are never listed, with the reason. The held-back
 * ones follow the feature rules in RM-2267 (#57): not featured until they have
 * real results.
 */
export const EXCLUDED_REPOS = Object.freeze({
  'rmems/raulcardenasmontoya.me': 'This site.',
  'rmems/combine-for-AI': 'Held back until it has results (RM-2267).',
  'rmems/blackwell-kernel-lab': 'Held back until it has results (RM-2267).',
  'rmems/silicon-bridge': 'Held back until it has results (RM-2267).',
  'rmems/Limen-Capital': 'Held back until it has results (RM-2267).',
});

/** Short caveats shown beside a repository where its description alone would overstate it. */
export const REPO_NOTES = Object.freeze({
  'rmems/SynapticDistill.jl': 'No distillation yet.',
  'rmems/silicon-hdl': 'An HDL learning field.',
});

const key = (fullName) => fullName.toLowerCase();
const excluded = new Set(Object.keys(EXCLUDED_REPOS).map(key));

/** Keep only what the page and the filters need, so the snapshot stays small and reviewable. */
export function normalizeRepo(repo) {
  const text = (value) => (typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ') : null);
  return {
    fullName: String(repo.full_name),
    url: String(repo.html_url),
    description: text(repo.description) ?? '',
    language: text(repo.language),
    pushedAt: String(repo.pushed_at ?? '').slice(0, 10),
    archived: repo.archived === true,
    private: repo.private === true || (repo.visibility !== undefined && repo.visibility !== 'public'),
    fork: repo.fork === true,
  };
}

/** The first sentence of a description; the whole text when it has no sentence break. */
export function firstSentence(description) {
  const match = /^(.+?[.!?])\s+(?=[A-Z0-9"'(])/.exec(description);
  return match ? match[1] : description;
}

/** `owner/owner.github.io` and `owner/.github` hold profile and site plumbing, not work. */
const isProfileRepo = (fullName) => {
  const [owner, name] = fullName.split('/');
  return name === '.github' || key(name) === `${key(owner)}.github.io`;
};

/**
 * Whether a brief already links the repository: a link to the repository
 * itself, or to its whole account (an organisation brief covers its repositories).
 */
export function coveredByLinks(repo, hrefs) {
  const [owner] = repo.fullName.split('/');
  return hrefs.some((href) => {
    let url;
    try {
      url = new URL(href);
    } catch {
      return false;
    }
    if (url.hostname !== 'github.com') return false;
    const path = url.pathname.split('/').filter(Boolean);
    if (path.length === 1) return key(path[0]) === key(owner);
    return path.length >= 2 && key(`${path[0]}/${path[1]}`) === key(repo.fullName);
  });
}

/** Public, unarchived, non-fork work repositories that no brief already links and that are not excluded. */
export function listableRepos(repos, briefLinks = []) {
  return repos.filter(
    (repo) =>
      !repo.archived &&
      !repo.private &&
      !repo.fork &&
      !isProfileRepo(repo.fullName) &&
      !excluded.has(key(repo.fullName)) &&
      !coveredByLinks(repo, briefLinks),
  );
}

async function getRepos(owner, fetchImpl, token) {
  const url = reposUrl(owner);
  const headers = { accept: 'application/vnd.github+json', 'user-agent': GITHUB_USER_AGENT, 'x-github-api-version': '2022-11-28' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, { headers, signal: globalThis.AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  // Refuse a truncated list rather than silently drop repositories.
  if (/rel="next"/.test(response.headers?.get?.('link') ?? '')) throw new Error(`${url} is paginated beyond the requested page size`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`${url} returned no repository list`);
  return data;
}

/**
 * Fetch every repository each owner has. Throws on any failure so callers fall
 * back to the dated snapshot as a whole instead of mixing live and stale rows.
 * Filtering happens on display, so the snapshot records what GitHub returned.
 */
export async function fetchGithubSnapshot({ fetchImpl = globalThis.fetch, now = new Date(), token = globalThis.process?.env?.GITHUB_TOKEN } = {}) {
  const lists = await Promise.all(GITHUB_OWNERS.map((owner) => getRepos(owner, fetchImpl, token)));
  return {
    asOf: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now),
    source: `${GITHUB_API}/users/{owner}/repos`,
    owners: [...GITHUB_OWNERS],
    repos: lists
      .flat()
      .map(normalizeRepo)
      .sort((a, b) => key(a.fullName).localeCompare(key(b.fullName))),
  };
}

/** Group repositories for display: configured groups in order, then any repository in no group. */
export function groupRepos(repos) {
  const byName = new Map(repos.map((repo) => [key(repo.fullName), repo]));
  const placed = new Set();
  const groups = [];
  for (const group of REPO_GROUPS) {
    const members = group.repos.map(key).filter((name) => byName.has(name)).map((name) => byName.get(name));
    for (const member of members) placed.add(key(member.fullName));
    if (members.length > 0) groups.push({ key: group.key, title: group.title, repos: members });
  }
  const other = repos.filter((repo) => !placed.has(key(repo.fullName)));
  if (other.length > 0) groups.push({ key: 'other', title: 'Other', repos: other });
  return groups;
}

const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** `2026-10-26` → `Oct 2026`; empty when GitHub gave no push date. */
export function pushMonth(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? monthFormat.format(new Date(`${date}T00:00:00Z`)) : '';
}
