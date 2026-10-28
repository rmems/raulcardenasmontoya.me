import { loadCrates } from './crates';
import { loadHfArtifacts } from './hf';
import { upstreamPrs, upstreamVerifiedAt } from './upstream';

/**
 * Every count the site prints, with the date it was checked. Pages read these
 * instead of typing numbers into copy, so the hero, About, the briefs and
 * /artifacts/ can never disagree (`test/site-contract.test.mjs`).
 */
export interface SiteCounts {
  crates: number;
  cratesAsOf: string;
  /** Sum of `downloads` across the crates snapshot; CI and mirror traffic included. */
  cratesTotalDownloads: number;
  datasets: number;
  datasetsAsOf: string;
  /** Datasets in the "Synthetic data factory" collections; 0 when no collection carries that title. */
  factoryDatasets: number;
  factoryCollections: number;
  /** Datasets in the Grok-1 dissection collection; 0 when the collection is absent. */
  grokDatasets: number;
  grokCollections: number;
  /** Version and downloads for the engram-parser crate, from the crates snapshot. */
  engramParserVersion: string;
  engramParserDownloads: number;
  /** Version and downloads for the nir-rs crate, from the crates snapshot. */
  nirVersion: string;
  nirDownloads: number;
  mergedPrs: number;
  mergedPrsVerifiedAt: string;
}

const FACTORY_COLLECTION = /^Synthetic data factory\b/i;
const GROK_COLLECTION = /grok-1 dissection/i;

const crateByName = (crates: { name: string }[], name: string) =>
  (crates as { name: string; version: string; downloads: number }[]).find((crate) => crate.name === name);

export async function loadSiteCounts(): Promise<SiteCounts> {
  const [crates, hf] = await Promise.all([loadCrates(), loadHfArtifacts()]);
  const factory = hf.collections.filter((collection) => FACTORY_COLLECTION.test(collection.title));
  const grok = hf.collections.filter((collection) => GROK_COLLECTION.test(collection.title));
  const engram = crateByName(crates.crates, 'engram-parser');
  const nir = crateByName(crates.crates, 'nir-rs');
  return {
    crates: crates.crates.length,
    cratesAsOf: crates.asOf,
    cratesTotalDownloads: crates.totalDownloads,
    datasets: hf.datasets.length,
    datasetsAsOf: hf.asOf,
    factoryDatasets: factory.reduce((sum, collection) => sum + collection.datasets.length, 0),
    factoryCollections: factory.length,
    grokDatasets: grok.reduce((sum, collection) => sum + collection.datasets.length, 0),
    grokCollections: grok.length,
    engramParserVersion: engram?.version ?? 'unknown',
    engramParserDownloads: engram?.downloads ?? 0,
    nirVersion: nir?.version ?? 'unknown',
    nirDownloads: nir?.downloads ?? 0,
    mergedPrs: upstreamPrs.length,
    mergedPrsVerifiedAt: upstreamVerifiedAt,
  };
}

const number = new Intl.NumberFormat('en-US');

/** Fill `{{name}}` tokens in copy from the counts; unknown tokens are left as written. */
export function fillCounts(text: string, counts: SiteCounts): string {
  return text.replace(/\{\{(\w+)\}\}/g, (token, key: string) => {
    if (!Object.hasOwn(counts, key)) return token;
    const value = counts[key as keyof SiteCounts];
    return typeof value === 'number' ? number.format(value) : value;
  });
}
