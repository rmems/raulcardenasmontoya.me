// The site's mark: a leaky integrate-and-fire membrane trace. A slow leaky
// rise, a threshold crossing, one sharp spike, a reset to baseline. It is the
// neuron model the homepage demo runs (neuromod LIF), drawn as a signature.
//
// This module is the only source of the mark. The header (`Monogram.astro`),
// `public/favicon.svg`, `public/apple-touch-icon.png` and the social card are
// all rendered from it (`scripts/build-brand.mjs`, `scripts/build-social-card.mjs`);
// `test/brand.test.mjs` fails when a committed export drifts from it. Do not
// hand-edit the generated files.

export const MARK_VIEWBOX = '0 0 64 64';
export const MARK_TILE_RADIUS = 14;

/** Light-scheme palette, the same values as `src/styles/global.css`. */
export const MARK_LIGHT = Object.freeze({ tile: '#0f172a', trace: '#f7f8fa', spike: '#f43f5e' });
/** Dark-scheme palette, the same values as the dark tokens in `global.css`. */
export const MARK_DARK = Object.freeze({ tile: '#e6e9ef', trace: '#0f1218', spike: '#fb7185' });

/**
 * The shapes inside the 64×64 viewBox. `tile` paints the rounded square;
 * pass `null` for the line version (dark grounds, the social card), where the
 * trace is drawn in `trace` directly on the surface behind it.
 *
 * Geometry: baseline at y=48 (reset level), threshold at y=29, peak at y=10.
 * The rise is a single cubic so the leak reads as a curve, not a ramp; the
 * spike and reset are straight so they read as an event.
 */
export function markShapes({ tile, trace, spike, threshold = true }) {
  const parts = [];
  if (tile) {
    parts.push(`<rect x="2" y="2" width="60" height="60" rx="${MARK_TILE_RADIUS}" fill="${tile}"/>`);
  }
  const inset = tile ? 10 : 6;
  const end = 64 - inset;
  if (threshold) {
    parts.push(
      `<line x1="${inset}" y1="29" x2="${end}" y2="29" stroke="${trace}" stroke-width="1.5" stroke-dasharray="2 4" stroke-opacity="0.5"/>`,
    );
  }
  parts.push(
    `<path d="M${inset} 46 C ${inset + 8} 46 ${inset + 14} 44 29 35" fill="none" stroke="${trace}" stroke-width="4.5" stroke-linecap="round"/>`,
    `<path d="M29 35 L 33 10 L 37 48" fill="none" stroke="${spike}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="M37 48 L ${end} 48" fill="none" stroke="${trace}" stroke-width="4.5" stroke-linecap="round"/>`,
  );
  return parts.join('');
}

/** A complete `<svg>` element. `attrs` is appended verbatim after the viewBox. */
export function markSvg(palette, { attrs = '', threshold = true, head = '' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}"${attrs ? ` ${attrs}` : ''}>${head}${markShapes({ ...palette, threshold })}</svg>`;
}

/**
 * `public/favicon.svg`: the tile version with both palettes embedded, so the
 * tab icon follows the viewer's colour scheme in browsers that honour
 * `prefers-color-scheme` inside SVG favicons (Chromium, Firefox).
 */
export function renderFavicon() {
  const head =
    `<style>:root{--tile:${MARK_LIGHT.tile};--trace:${MARK_LIGHT.trace};--spike:${MARK_LIGHT.spike}}` +
    `@media (prefers-color-scheme:dark){:root{--tile:${MARK_DARK.tile};--trace:${MARK_DARK.trace};--spike:${MARK_DARK.spike}}}</style>`;
  return markSvg({ tile: 'var(--tile)', trace: 'var(--trace)', spike: 'var(--spike)' }, { head, threshold: false }) + '\n';
}

/** A raster-ready SVG at `size` px in one palette (PNG exports cannot follow the scheme). */
export function renderRasterSource(size, palette = MARK_LIGHT) {
  return markSvg(palette, { attrs: `width="${size}" height="${size}"`, threshold: size >= 96 });
}
