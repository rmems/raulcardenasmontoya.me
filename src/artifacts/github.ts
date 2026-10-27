import snapshot from '../data/artifacts/github-snapshot.json';
import { projects } from '../data/projects';
import { fetchGithubSnapshot, firstSentence, groupRepos, listableRepos, pushMonth, REPO_NOTES, withSnapshotFallback } from './github-source.mjs';
import type { GithubSnapshot, RepoRecord } from './github-source.mjs';

export interface IndexedRepo {
  fullName: string;
  /** The repository name without its owner. */
  name: string;
  url: string;
  language: string | null;
  /** The first sentence of the repository's own GitHub description; empty when it has none. */
  description: string;
  /** Month of the most recent push, e.g. `Oct 2026`. */
  pushed: string;
  note?: string;
}

export interface GithubIndex {
  asOf: string;
  /** `live` when the GitHub API answered at build time, else the committed snapshot. */
  source: 'live' | 'snapshot';
  /** Why the snapshot was used, when it was. */
  fallbackReason?: 'skipped' | 'unreachable';
  owners: string[];
  repos: IndexedRepo[];
  groups: { key: string; title: string; repos: IndexedRepo[] }[];
}

/** Every external link the /work/ briefs carry; repositories behind them are not repeated in the index. */
export const briefLinks = (): string[] => projects.flatMap((project) => project.links.map((link) => link.href));

const toIndexed = (repo: RepoRecord): IndexedRepo => ({
  fullName: repo.fullName,
  name: repo.fullName.split('/')[1] ?? repo.fullName,
  url: repo.url,
  language: repo.language,
  description: firstSentence(repo.description),
  pushed: pushMonth(repo.pushedAt),
  note: REPO_NOTES[repo.fullName],
});

export function toGithubIndex(data: GithubSnapshot, source: GithubIndex['source'], fallbackReason?: GithubIndex['fallbackReason']): GithubIndex {
  const listed = listableRepos(data.repos, briefLinks());
  return {
    asOf: data.asOf,
    source,
    fallbackReason,
    owners: data.owners,
    repos: listed.map(toIndexed),
    groups: groupRepos(listed).map((group) => ({ ...group, repos: group.repos.map(toIndexed) })),
  };
}

async function load(): Promise<GithubIndex> {
  const { data, source, fallbackReason } = await withSnapshotFallback({
    skip: Boolean(process.env.SKIP_GH_FETCH),
    fetchLive: () => fetchGithubSnapshot(),
    snapshot: snapshot as GithubSnapshot,
  });
  return toGithubIndex(data, source, fallbackReason);
}

let pending: Promise<GithubIndex> | undefined;

/** Live GitHub data at build time; the dated snapshot when it is unreachable or SKIP_GH_FETCH is set. Fetched once per build. */
export function loadGithubIndex(): Promise<GithubIndex> {
  pending ??= load();
  return pending;
}
