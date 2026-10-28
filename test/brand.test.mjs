import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MARK_DARK, MARK_LIGHT, markShapes, renderFavicon } from '../src/brand/mark-source.mjs';
import { BRAND_RASTERS, ICO_SIZES, renderIco, renderRaster } from '../src/brand/render.mjs';

// Normalise line endings so a CRLF checkout on Windows compares equal to the LF render.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const readBytes = (path) => readFileSync(new URL(`../${path}`, import.meta.url));

test('favicon.svg is the committed render of the brand source', () => {
  assert.equal(read('public/favicon.svg'), renderFavicon(), 'regenerate with: npm run build:brand');
});

test('every committed raster export is the render of the brand source at its size', async () => {
  for (const raster of BRAND_RASTERS) {
    const committed = readBytes(`public/${raster.file}`);
    assert.equal(committed.readUInt32BE(16), raster.size, `${raster.file} width`);
    assert.equal(committed.readUInt32BE(20), raster.size, `${raster.file} height`);
    const fresh = await renderRaster(raster);
    assert.ok(committed.equals(fresh), `${raster.file} drifted from the source; regenerate with: npm run build:brand`);
  }
});

test('Google Search gets a favicon whose side is a multiple of 48px, and /favicon.ico ships', async () => {
  assert.ok(BRAND_RASTERS.some(({ size }) => size > 0 && size % 48 === 0), 'no 48px-multiple raster');
  const ico = readBytes('public/favicon.ico');
  assert.equal(ico.readUInt16LE(2), 1, 'ico type');
  assert.equal(ico.readUInt16LE(4), ICO_SIZES.length, 'ico image count');
  assert.ok(ico.equals(await renderIco()), 'favicon.ico drifted from the source; regenerate with: npm run build:brand');
  assert.match(read('src/layouts/BaseLayout.astro'), /rel="icon" href="\/favicon\.ico"/);
});

test('the mark palettes match the site tokens', () => {
  const css = read('src/styles/global.css');
  for (const [name, value] of [
    ['--ink', MARK_LIGHT.tile],
    ['--paper', MARK_LIGHT.trace],
    ['--spike', MARK_LIGHT.spike],
    ['--ink', MARK_DARK.tile],
    ['--paper', MARK_DARK.trace],
    ['--spike', MARK_DARK.spike],
  ]) {
    assert.match(css, new RegExp(`${name}: ${value};`), `${name} ${value} is not a token in global.css`);
  }
});

test('the header, icon links, JSON-LD image and social card all come from the one source', () => {
  assert.match(read('src/components/Monogram.astro'), /from '\.\.\/brand\/mark-source\.mjs'/);
  assert.doesNotMatch(read('src/styles/global.css'), /\.monogram::after/);
  assert.match(read('scripts/build-social-card.mjs'), /mark-source\.mjs/);
  const layout = read('src/layouts/BaseLayout.astro');
  assert.match(layout, /rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
  assert.match(layout, /rel="icon" href="\/favicon-32\.png" type="image\/png" sizes="32x32"/);
  assert.match(layout, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.match(layout, /image: new URL\('\/assets\/raul-cardenas-montoya-512\.jpg', Astro\.site\)\.href/);
  for (const raster of BRAND_RASTERS) {
    assert.match(layout, new RegExp(`href="/${raster.file.replace('.', '\\.')}"`), `${raster.file} is not linked from the layout`);
  }
});

test('the line version draws no tile and the spike is the only accent stroke', () => {
  const line = markShapes({ tile: null, trace: '#000', spike: '#f00' });
  assert.doesNotMatch(line, /<rect/);
  assert.equal((line.match(/#f00/g) ?? []).length, 1);
  assert.equal((line.match(/<path/g) ?? []).length, 3);
});
