export const MARK_VIEWBOX: string;
export const MARK_TILE_RADIUS: number;
export interface MarkPalette { tile: string | null; trace: string; spike: string }
export const MARK_LIGHT: Readonly<MarkPalette>;
export const MARK_DARK: Readonly<MarkPalette>;
export function markShapes(options: MarkPalette & { threshold?: boolean }): string;
export function markSvg(palette: MarkPalette, options?: { attrs?: string; threshold?: boolean; head?: string }): string;
export function renderFavicon(): string;
export function renderRasterSource(size: number, palette?: MarkPalette): string;
