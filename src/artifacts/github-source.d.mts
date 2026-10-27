export const GITHUB_OWNERS: readonly string[];
export const GITHUB_API: string;
export const GITHUB_USER_AGENT: string;
export function reposUrl(owner: string): string;
export interface RepoGroupConfig { key: string; title: string; repos: readonly string[] }
export const REPO_GROUPS: readonly RepoGroupConfig[];
export const EXCLUDED_REPOS: Readonly<Record<string, string>>;
export const REPO_NOTES: Readonly<Record<string, string>>;
export interface RepoRecord {
  fullName: string;
  url: string;
  description: string;
  language: string | null;
  pushedAt: string;
  archived: boolean;
  private: boolean;
  fork: boolean;
}
export interface GithubSnapshot { asOf: string; source: string; owners: string[]; repos: RepoRecord[] }
export interface RepoGroup { key: string; title: string; repos: RepoRecord[] }
export function normalizeRepo(repo: Record<string, unknown>): RepoRecord;
export function firstSentence(description: string): string;
export function coveredByLinks(repo: RepoRecord, hrefs: string[]): boolean;
export function listableRepos(repos: RepoRecord[], briefLinks?: string[]): RepoRecord[];
export function fetchGithubSnapshot(options?: { fetchImpl?: typeof fetch; now?: Date; token?: string }): Promise<GithubSnapshot>;
export function withSnapshotFallback(options: {
  skip: boolean;
  fetchLive: () => Promise<GithubSnapshot>;
  snapshot: GithubSnapshot;
  warn?: (message: string) => void;
}): Promise<{ data: GithubSnapshot; source: 'live' | 'snapshot'; fallbackReason: 'skipped' | 'unreachable' | undefined }>;
export function groupRepos(repos: RepoRecord[]): RepoGroup[];
export function pushMonth(date: string): string;
