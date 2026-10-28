export { renderFavicon } from './mark-source.mjs';
export interface BrandRaster { file: string; size: number }
export const BRAND_RASTERS: readonly BrandRaster[];
export const ICO_SIZES: readonly number[];
export function renderRaster(raster: BrandRaster): Promise<Buffer>;
export function renderIco(): Promise<Buffer>;
