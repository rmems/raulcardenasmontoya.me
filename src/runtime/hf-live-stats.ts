import { formatFetchedAt, formatStats, statsFrom } from '../artifacts/hf-source.mjs';
import type { HfRepoStats } from '../artifacts/hf-source.mjs';

// The /artifacts/ page renders a dated snapshot at build time. This module is
// the progressive enhancement: it refreshes each repository's downloads, likes
// and last-modified date from the public, CORS-enabled Hugging Face API and
// labels the figure "live, fetched <time>". Any repository the API does not
// answer for keeps its snapshot figure and its "as of <date>" label, so a
// blocked or slow API never blanks a stat or shows an invented zero.

export const HF_API_BASE = 'https://huggingface.co';
export const HF_REPO_KINDS = ['datasets', 'models'] as const;
export type HfRepoKind = (typeof HF_REPO_KINDS)[number];

export interface HfStatsTarget {
  element: Element;
  kind: HfRepoKind;
  repo: string;
  figures: Element | null;
  freshness: Element | null;
}

export interface RefreshHfStatsOptions {
  root?: ParentNode;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Per-repository request budget; a request that outlives it counts as unavailable. */
  timeoutMs?: number;
  /** Parallel requests. The page has dozens of repos, so keep it small and polite. */
  concurrency?: number;
  apiBase?: string;
}

export interface RefreshHfStatsResult {
  total: number;
  refreshed: number;
  kept: number;
  fetchedAt: Date;
}

const isKind = (value: string | null): value is HfRepoKind => value === 'datasets' || value === 'models';

/** The Hub's anonymous rate limit; the refresh stops asking instead of extending the block. */
class HfRateLimitedError extends Error {}

function targetsFrom(root: ParentNode): HfStatsTarget[] {
  const targets: HfStatsTarget[] = [];
  for (const element of root.querySelectorAll('[data-hf-stats]')) {
    const kind = element.getAttribute('data-hf-kind');
    const repo = element.getAttribute('data-hf-repo');
    if (!isKind(kind) || !repo) continue;
    targets.push({
      element,
      kind,
      repo,
      figures: element.querySelector('[data-hf-figures]'),
      freshness: element.querySelector('[data-hf-freshness]'),
    });
  }
  return targets;
}

/**
 * One repository's stats. Rejects when the API does not answer in time, when it
 * answers with an error status, or when the payload carries no usable figure;
 * the caller then keeps the snapshot text.
 */
async function fetchStats(
  target: HfStatsTarget,
  { fetchImpl, apiBase, timeoutMs }: { fetchImpl: typeof fetch; apiBase: string; timeoutMs: number },
): Promise<HfRepoStats> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Hugging Face API did not answer within ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      fetchImpl(`${apiBase}/api/${target.kind}/${target.repo}`, {
        signal: controller.signal,
        credentials: 'omit',
        headers: { accept: 'application/json' },
      }),
      timeout,
    ]);
    if (response.status === 429) throw new HfRateLimitedError(`${target.repo} -> HTTP 429`);
    if (!response.ok) throw new Error(`${target.repo} -> HTTP ${response.status}`);
    const stats = statsFrom(await Promise.race([response.json(), timeout]));
    if (Object.keys(stats).length === 0) throw new Error(`${target.repo} carries no usable stat`);
    return stats;
  } finally {
    clearTimeout(timer);
  }
}

/** Write the live figures in place, keeping the same element so nothing reflows around it. */
function applyLive(target: HfStatsTarget, stats: HfRepoStats, fetchedAt: Date): boolean {
  const figures = formatStats(stats);
  if (figures === '') return false;
  if (target.figures) target.figures.textContent = figures;
  if (target.freshness) target.freshness.textContent = `live, fetched ${formatFetchedAt(fetchedAt)}`;
  target.element.setAttribute('data-hf-stats-source', 'live');
  return true;
}

async function inParallel<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Refresh every rendered Hugging Face stat. Never throws: a repository that
 * fails keeps the snapshot value it was rendered with.
 */
export async function refreshHfStats(options: RefreshHfStatsOptions = {}): Promise<RefreshHfStatsResult> {
  const {
    root = document,
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
    timeoutMs = 8_000,
    concurrency = 4,
    apiBase = HF_API_BASE,
  } = options;
  const targets = targetsFrom(root);
  const fetchedAt = now();
  let refreshed = 0;
  let throttled = false;
  if (targets.length > 0 && typeof fetchImpl === 'function') {
    await inParallel(targets, concurrency, async (target) => {
      // Once the Hub says "too many requests", stop asking; the rest keep their snapshot.
      if (throttled) {
        target.element.setAttribute('data-hf-stats-source', 'snapshot');
        return;
      }
      try {
        const stats = await fetchStats(target, { fetchImpl, apiBase, timeoutMs });
        if (applyLive(target, stats, fetchedAt)) refreshed += 1;
      } catch (error) {
        if (error instanceof HfRateLimitedError) throttled = true;
        // Keep the snapshot figure and its date; say so on the element itself.
        target.element.setAttribute('data-hf-stats-source', 'snapshot');
      }
    });
  }
  if (targets.length > 0) {
    const section = root.querySelector('[data-hf-source]');
    section?.setAttribute('data-hf-live', refreshed === 0 ? 'unavailable' : refreshed === targets.length ? 'ok' : 'partial');
  }
  return { total: targets.length, refreshed, kept: targets.length - refreshed, fetchedAt };
}
