export const CRATES_USER_ID: number;
export const CRATES_OWNER: string;
export const CRATES_API_URL: string;
export const CRATES_USER_AGENT: string;
export interface CrateGroupConfig { key: string; title: string; crates: readonly string[] }
export const CRATE_GROUPS: readonly CrateGroupConfig[];
export const CRATE_STATUS_NOTES: Readonly<Record<string, { text: string; href: string }>>;
export interface CrateRecord {
  name: string;
  version: string;
  description: string;
  downloads: number;
  recentDownloads: number;
  updatedAt: string;
  repository: string | null;
  documentation: string | null;
  homepage: string | null;
}
export interface CratesSnapshot { asOf: string; source: string; userId: number; crates: CrateRecord[] }
export interface CrateGroup { key: string; title: string; crates: CrateRecord[] }
export function normalizeCrate(crate: Record<string, unknown>): CrateRecord;
export function fetchCratesSnapshot(options?: { fetchImpl?: typeof fetch; now?: Date }): Promise<CratesSnapshot>;
export function groupCrates(crates: CrateRecord[]): CrateGroup[];
export function cratesIoUrl(crate: CrateRecord): string;
export function docsUrl(crate: CrateRecord): string;
export function totalDownloads(crates: CrateRecord[]): number;
