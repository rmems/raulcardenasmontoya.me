// Regenerates the brand exports from src/brand/mark-source.mjs:
//   public/favicon.svg          the mark with both colour schemes embedded
//   public/apple-touch-icon.png the 180×180 light-scheme raster
// Run: node scripts/build-brand.mjs  (then node scripts/build-social-card.mjs)
// test/brand.test.mjs fails when a committed export drifts from the source.
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { renderFavicon, renderRasterSource } from '../src/brand/mark-source.mjs';

const require = createRequire(new URL('../node_modules/astro/package.json', import.meta.url));
const sharp = require('sharp'); // installed transitively by astro

export const APPLE_TOUCH_ICON_SIZE = 180;

const faviconPath = new URL('../public/favicon.svg', import.meta.url);
const touchIconPath = new URL('../public/apple-touch-icon.png', import.meta.url);

const favicon = renderFavicon();
await writeFile(faviconPath, favicon);
console.log(`wrote favicon.svg (${favicon.length} bytes)`);

const png = await sharp(Buffer.from(renderRasterSource(APPLE_TOUCH_ICON_SIZE)), { density: 288 })
  .resize(APPLE_TOUCH_ICON_SIZE, APPLE_TOUCH_ICON_SIZE)
  .png({ compressionLevel: 9, palette: true })
  .toBuffer();
await writeFile(touchIconPath, png);
console.log(`wrote apple-touch-icon.png ${APPLE_TOUCH_ICON_SIZE}x${APPLE_TOUCH_ICON_SIZE} (${png.length} bytes)`);
