import snapshot from '../data/artifacts/crates-snapshot.json';
import { fetchCratesSnapshot, groupCrates, totalDownloads } from './crates-source.mjs';
import type { CrateGroup, CrateRecord, CratesSnapshot } from './crates-source.mjs';

export interface CratesArtifacts {
  asOf: string;
  /** `live` when crates.io answered at build time, else the committed snapshot. */
  source: 'live' | 'snapshot';
  /** Why the snapshot was used, when it was. */
  fallbackReason?: 'skipped' | 'unreachable';
  crates: CrateRecord[];
  groups: CrateGroup[];
  totalDownloads: number;
}

export function toCratesArtifacts(data: CratesSnapshot, source: CratesArtifacts['source'], fallbackReason?: CratesArtifacts['fallbackReason']): CratesArtifacts {
  return { asOf: data.asOf, source, fallbackReason, crates: data.crates, groups: groupCrates(data.crates), totalDownloads: totalDownloads(data.crates) };
}

async function load(): Promise<CratesArtifacts> {
  let fallbackReason: CratesArtifacts['fallbackReason'] = 'skipped';
  if (!process.env.SKIP_CRATES_FETCH) {
    fallbackReason = 'unreachable';
    try {
      return toCratesArtifacts(await fetchCratesSnapshot(), 'live');
    } catch (error) {
      console.warn(`[artifacts] crates.io unavailable, using the ${snapshot.asOf} snapshot: ${String(error)}`);
    }
  }
  return toCratesArtifacts(snapshot as CratesSnapshot, 'snapshot', fallbackReason);
}

let pending: Promise<CratesArtifacts> | undefined;

/** Live crates.io data at build time; the dated snapshot when it is unreachable or SKIP_CRATES_FETCH is set. Fetched once per build. */
export function loadCrates(): Promise<CratesArtifacts> {
  pending ??= load();
  return pending;
}

export const crateByName = (crates: CrateRecord[], name: string): CrateRecord | undefined => crates.find((crate) => crate.name === name);
