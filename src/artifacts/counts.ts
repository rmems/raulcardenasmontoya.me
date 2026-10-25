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
  datasets: number;
  datasetsAsOf: string;
  /** Datasets in the "Synthetic data factory" collections; 0 when no collection carries that title. */
  factoryDatasets: number;
  factoryCollections: number;
  mergedPrs: number;
  mergedPrsVerifiedAt: string;
}

const FACTORY_COLLECTION = /^Synthetic data factory\b/i;

export async function loadSiteCounts(): Promise<SiteCounts> {
  const [crates, hf] = await Promise.all([loadCrates(), loadHfArtifacts()]);
  const factory = hf.collections.filter((collection) => FACTORY_COLLECTION.test(collection.title));
  return {
    crates: crates.crates.length,
    cratesAsOf: crates.asOf,
    datasets: hf.datasets.length,
    datasetsAsOf: hf.asOf,
    factoryDatasets: factory.reduce((sum, collection) => sum + collection.datasets.length, 0),
    factoryCollections: factory.length,
    mergedPrs: upstreamPrs.length,
    mergedPrsVerifiedAt: upstreamVerifiedAt,
  };
}

const number = new Intl.NumberFormat('en-US');

/** Fill `{{name}}` tokens in copy from the counts; unknown tokens are left as written. */
export function fillCounts(text: string, counts: SiteCounts): string {
  return text.replace(/\{\{(\w+)\}\}/g, (token, key: string) => {
    if (!(key in counts)) return token;
    const value = counts[key as keyof SiteCounts];
    return typeof value === 'number' ? number.format(value) : value;
  });
}
