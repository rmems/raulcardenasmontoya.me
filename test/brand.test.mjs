import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MARK_DARK, MARK_LIGHT, markShapes, renderFavicon } from '../src/brand/mark-source.mjs';

// Normalise line endings so a CRLF checkout on Windows compares equal to the LF render.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('favicon.svg is the committed render of the brand source', () => {
  assert.equal(read('public/favicon.svg'), renderFavicon(), 'regenerate with: node scripts/build-brand.mjs');
});

test('apple-touch-icon.png is 180x180', () => {
  const png = readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
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

test('the header, favicon link and social card all come from the one source', () => {
  assert.match(read('src/components/Monogram.astro'), /from '\.\.\/brand\/mark-source\.mjs'/);
  assert.doesNotMatch(read('src/styles/global.css'), /\.monogram::after/);
  assert.match(read('scripts/build-social-card.mjs'), /mark-source\.mjs/);
  const layout = read('src/layouts/BaseLayout.astro');
  assert.match(layout, /rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
  assert.match(layout, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
});

test('the line version draws no tile and the spike is the only accent stroke', () => {
  const line = markShapes({ tile: null, trace: '#000', spike: '#f00' });
  assert.doesNotMatch(line, /<rect/);
  assert.equal((line.match(/#f00/g) ?? []).length, 1);
  assert.equal((line.match(/<path/g) ?? []).length, 3);
});
