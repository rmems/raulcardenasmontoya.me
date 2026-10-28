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
  // Google Search only shows favicons whose side is a multiple of 48px, so the
  // 32px file alone leaves search result cards with the generic globe.
  Object.freeze({ file: 'favicon-48.png', size: 48 }),
  Object.freeze({ file: 'favicon-192.png', size: 192 }),
  Object.freeze({ file: 'apple-touch-icon.png', size: 180 }),
]);

/** Rasters packed into public/favicon.ico (browsers and crawlers request /favicon.ico unprompted). */
export const ICO_SIZES = Object.freeze([32, 48]);

/** Pack PNG-encoded rasters into one .ico container (PNG payloads are valid since Windows Vista). */
export async function renderIco() {
  const images = await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await renderRaster({ size }) })));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry); // width
    header.writeUInt8(size, entry + 1); // height
    header.writeUInt8(0, entry + 2); // palette colours
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

/** Render one raster export as PNG bytes. */
export async function renderRaster({ size }) {
  return sharp(Buffer.from(renderRasterSource(size)), { density: 288 })
    .resize(size, size)
    // No palette quantisation: it is platform-dependent and would break the byte comparison.
    .png({ compressionLevel: 9 })
    .toBuffer();
}
