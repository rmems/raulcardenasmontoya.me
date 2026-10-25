// Raster rendering of the brand mark, shared by scripts/build-brand.mjs and
// test/brand.test.mjs so the committed PNGs are byte-compared with a fresh
// render of the same source. sharp is installed transitively by astro; a
// pinned sharp version keeps the PNG encoding deterministic.
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { renderRasterSource } from './mark-source.mjs';

export { renderFavicon } from './mark-source.mjs';

const require = createRequire(new URL('../../node_modules/astro/package.json', import.meta.url));
const sharp = require('sharp');

/** The committed raster exports under public/, each rendered from the mark source. */
export const BRAND_RASTERS = Object.freeze([
  Object.freeze({ file: 'favicon-32.png', size: 32 }),
  Object.freeze({ file: 'apple-touch-icon.png', size: 180 }),
]);

/** Render one raster export as PNG bytes. */
export async function renderRaster({ size }) {
  return sharp(Buffer.from(renderRasterSource(size)), { density: 288 })
    .resize(size, size)
    // No palette quantisation: it is platform-dependent and would break the byte comparison.
    .png({ compressionLevel: 9 })
    .toBuffer();
}
