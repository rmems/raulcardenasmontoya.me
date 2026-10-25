export { renderFavicon } from './mark-source.mjs';
export interface BrandRaster { file: string; size: number }
export const BRAND_RASTERS: readonly BrandRaster[];
export function renderRaster(raster: BrandRaster): Promise<Buffer>;
