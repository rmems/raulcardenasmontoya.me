// Shared WCAG contrast helpers for the CSS token contracts: relative
// luminance, contrast ratio, and the `:root` custom-property parser. One copy
// lives here so the homepage-mesh and site-contract suites do not duplicate
// the block (the SonarCloud duplication gate counts test sources too).
export const luminance = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
};

export const contrast = (a, b) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

/** Custom properties of one `:root { … }` block, as `{ name: '#rrggbb' }`. */
export const tokenScheme = (block) =>
  Object.fromEntries([...block.matchAll(/--([\w-]+): (#(?:[0-9a-f]{6}));/g)].map((match) => [match[1], match[2]]));
