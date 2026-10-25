// Regenerates the brand exports from src/brand/mark-source.mjs:
//   public/favicon.svg          the mark with both colour schemes embedded
//   public/favicon-32.png       the 32×32 light-scheme raster (PNG favicon fallback)
//   public/apple-touch-icon.png the 180×180 light-scheme raster
// Run: node scripts/build-brand.mjs  (then node scripts/build-social-card.mjs)
// test/brand.test.mjs fails when a committed export drifts from the source.
import { writeFile } from 'node:fs/promises';
import { BRAND_RASTERS, renderFavicon, renderRaster } from '../src/brand/render.mjs';

const faviconPath = new URL('../public/favicon.svg', import.meta.url);
const favicon = renderFavicon();
await writeFile(faviconPath, favicon);
console.log(`wrote favicon.svg (${favicon.length} bytes)`);

for (const raster of BRAND_RASTERS) {
  const png = await renderRaster(raster);
  await writeFile(new URL(`../public/${raster.file}`, import.meta.url), png);
  console.log(`wrote ${raster.file} ${raster.size}x${raster.size} (${png.length} bytes)`);
}
