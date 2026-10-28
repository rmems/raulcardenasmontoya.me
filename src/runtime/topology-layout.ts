/**
 * Pure layout and colour rules for drawing the live `synaptic-wiring`
 * topology. The three.js renderer (`topology-renderer.ts`) and the static
 * drawing that the homepage hero paints before WebGL starts (or instead of it)
 * both read them here, so the static network and the first live frame line up:
 * same node positions, same camera framing, same edge colours.
 *
 * Nothing here depends on the clock, device state, or the DOM: the afterglow
 * helpers are pure functions of the seconds the caller passes in.
 */

export interface NodeLayout {
  x: number;
  y: number;
}

/** Half the shorter side of the orthographic view, in world units. */
export const CAMERA_EXTENT = 1.35;
/**
 * Neuron marker diameter in world units (viewBox units in the static SVG):
 * one 36th of the 2 × {@link CAMERA_EXTENT} frame, so markers scale with the
 * stage instead of staying a fixed pixel size. The static SVG draws it as the
 * node path's stroke width (so it grows with the rendered box) and the live
 * renderer converts it through `worldPerPixel` (`PointsMaterial.size` with
 * `sizeAttenuation: false` is CSS pixels), so both land on the same on-screen
 * size: ≈10 px on the 402 px plate this replaced, ≈13 px on the ≥480 px one,
 * and proportionally less on a phone. The exact literal keeps the serialized
 * stroke width clean.
 */
export const NODE_SIZE_WORLD = 0.075;
/** Opacity of the edge lines. */
export const EDGE_OPACITY = 0.4;
/**
 * Afterglow fades exponentially; a glow counts as gone once it falls below
 * this fraction of its peak, which is what the `…_SECONDS` durations mean.
 */
export const AFTERGLOW_FLOOR = 0.02;
/** A neuron's spike flash fades from full to {@link AFTERGLOW_FLOOR} over this long. */
export const SPIKE_FLASH_SECONDS = 0.8;
/** The glow a target neuron shows when a pulse lands fades over this long. */
export const LANDING_GLOW_SECONDS = 0.3;
/** How far a landing glow pulls the target toward `--spike` at its peak. */
export const LANDING_GLOW_MIX = 0.6;
/** How far a firing neuron pulls its outgoing edges toward `--spike`. */
export const EDGE_FIRE_MIX = 0.85;

/**
 * Exponential afterglow: `level` after `deltaSeconds` more have passed, on a
 * curve that reaches {@link AFTERGLOW_FLOOR} `fadeSeconds` after a peak of 1.
 * Returns 0 once the glow is below the floor so callers can drop it.
 */
export function afterglowDecay(level: number, deltaSeconds: number, fadeSeconds: number): number {
  if (!(level > 0) || !(fadeSeconds > 0)) {
    return 0;
  }
  const next = level * Math.exp((-Math.max(0, deltaSeconds) * Math.log(1 / AFTERGLOW_FLOOR)) / fadeSeconds);
  return next < AFTERGLOW_FLOOR ? 0 : next;
}

/**
 * A landing glow's level `sinceArrivalSeconds` after a pulse reached its
 * target: 1 at arrival, {@link AFTERGLOW_FLOOR} at {@link LANDING_GLOW_SECONDS},
 * 0 beyond that and 0 before arrival.
 */
export function landingGlow(sinceArrivalSeconds: number): number {
  if (!(sinceArrivalSeconds >= 0)) {
    return 0;
  }
  return afterglowDecay(1, sinceArrivalSeconds, LANDING_GLOW_SECONDS);
}

/**
 * Radius of the inner ring (even-numbered nodes) and of the outer ring (odd
 * ones), before the index-keyed jitter of up to {@link LAYOUT_RADIUS_JITTER}.
 * With the live 48-node topology the outer ring plus jitter and marker stays
 * inside {@link CAMERA_EXTENT}, and the closest two markers are 2.2 marker
 * diameters apart.
 */
export const LAYOUT_INNER_RADIUS = 0.62;
export const LAYOUT_OUTER_RADIUS = 1.12;
export const LAYOUT_RADIUS_JITTER = 0.06;

/**
 * Deterministic topology layout: two concentric rings, nodes alternating
 * between them in index order, with a small index-keyed radial jitter. Pure
 * function of the node count, never of timing or device state.
 *
 * A single ring at 48 nodes (RM-2355) put lattice neighbours 7.5° apart: a
 * `synaptic-wiring` small-world graph joins `i` to `i ± 1..3`, so most
 * synapses were 0.13 world units long, under two marker diameters, and
 * pulses only skirted the rim. Alternating rings turn the `i ± 1` and
 * `i ± 3` synapses into spokes between the rings (about 0.5 units) and leave
 * the `i ± 2` ones as short chords along a ring; the rewired fifth of the
 * synapses still cross the stage. An angular stride (node `i` at slot
 * `i × g mod n`) was tried first: it lengthens every synapse but multiplies
 * edge crossings five to ten times (8,000 to 15,000 against 1,300 here), and
 * the drawing read as a tangle. The numbers are in `test/hero-live-mesh.test.mjs`.
 */
export function layoutTopology(nodeCount: number): NodeLayout[] {
  const positions: NodeLayout[] = [];
  for (let node = 0; node < nodeCount; node += 1) {
    const angle = (2 * Math.PI * node) / nodeCount - Math.PI / 2;
    const jitter = ((node * 2654435761) % 97) / 97;
    const ring = node % 2 === 0 ? LAYOUT_INNER_RADIUS : LAYOUT_OUTER_RADIUS;
    const radius = ring + jitter * LAYOUT_RADIUS_JITTER;
    positions.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return positions;
}

/** The largest `|weight|`, or 1 for an empty or all-zero topology. */
export function edgeWeightExtent(weights: ArrayLike<number>): number {
  let extent = 0;
  for (let edge = 0; edge < weights.length; edge += 1) {
    extent = Math.max(extent, Math.abs(weights[edge]));
  }
  return extent || 1;
}

/**
 * How much of its polarity colour an edge keeps (the rest fades to `--line`):
 * 0.15 for a zero weight, 1 for the strongest edge, so weak synapses recede
 * and the strong ones carry the picture.
 */
export function edgeStrength(weight: number, weightExtent: number): number {
  return Math.min(1, 0.15 + 0.85 * (Math.abs(weight) / weightExtent));
}

/** The palette tokens the renderer reads from `src/styles/global.css`. */
export interface TopologyPalette {
  /** Excitatory synapses. */
  accent: string;
  /** Inhibitory synapses. */
  secondary: string;
  /** Firing neurons and the edges they fire along. */
  spike: string;
  /** Resting neurons. */
  muted: string;
  /** What weak edges fade toward. */
  line: string;
}

/**
 * `src/styles/global.css` token values, for drawing at build time where no
 * computed style exists. `test/hero-live-mesh.test.mjs` keeps them in sync.
 */
export const SITE_TOPOLOGY_PALETTE: TopologyPalette = Object.freeze({
  accent: '#4f46e5',
  secondary: '#0ea5a4',
  spike: '#f43f5e',
  muted: '#5b6474',
  line: '#e3e7ed',
});

/**
 * The same tokens inside `@media (prefers-color-scheme: dark)` in
 * `src/styles/global.css`. The hero draws one edge set per scheme and CSS
 * shows the matching one, so the first live frame, whose renderer reads the
 * computed tokens, lands on the drawing in either scheme.
 */
export const SITE_TOPOLOGY_PALETTE_DARK: TopologyPalette = Object.freeze({
  accent: '#8b85ff',
  secondary: '#2dd4bf',
  spike: '#fb7185',
  muted: '#9aa3b2',
  line: '#2a3140',
});

/** Canonical topology fields the drawing needs (a contract-5 snapshot subset). */
export interface TopologyDrawingInput {
  nodeIds: ArrayLike<number>;
  edgeSources: ArrayLike<number>;
  edgeTargets: ArrayLike<number>;
  edgeWeights: ArrayLike<number>;
  polarities: ArrayLike<number>;
}

export interface StaticMeshEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
}

export interface StaticMeshNode {
  id: number;
  x: number;
  y: number;
}

export interface StaticMesh {
  /** SVG `viewBox` matching the renderer's camera framing at rotation 0. */
  viewBox: string;
  nodes: StaticMeshNode[];
  edges: StaticMeshEdge[];
  nodeFill: string;
  /** Node marker diameter in world (viewBox) units, so it scales with the stage. */
  nodeSize: number;
  edgeOpacity: number;
}

type Rgb = [number, number, number];

// three.js colour management: CSS colours are sRGB, mixing happens in linear
// space, and the renderer encodes the result back to sRGB for display.
function srgbToLinear(channel: number): number {
  return channel < 0.04045 ? channel * 0.0773993808 : Math.pow(channel * 0.9478672986 + 0.0521327014, 2.4);
}

function linearToSrgb(channel: number): number {
  return channel < 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 0.41666) - 0.055;
}

function parseHex(color: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) {
    throw new RangeError(`expected a #rrggbb colour, got ${color}`);
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => srgbToLinear(channel / 255)) as Rgb;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((index) => from[index] + (to[index] - from[index]) * amount) as Rgb;
}

function toHex(color: Rgb): string {
  return `#${color
    .map((channel) => Math.round(Math.min(1, Math.max(0, linearToSrgb(channel))) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * The live renderer's first frame as plain SVG geometry: the same two-ring layout,
 * the same camera framing (`viewBox` with the default `xMidYMid meet` behaves
 * like the orthographic camera at any aspect ratio), and the same edge colours
 * (polarity colour mixed toward `--line` by weight). SVG's y axis points
 * down, so world y is negated. Node markers keep their resting `--muted`
 * colour, which is what the renderer shows before any membrane potential
 * arrives, and their stroke width is world units, so the markers scale with
 * the stage exactly like the renderer's do.
 */
export function staticMeshGeometry(
  topology: TopologyDrawingInput,
  palette: TopologyPalette = SITE_TOPOLOGY_PALETTE,
): StaticMesh {
  const nodeCount = topology.nodeIds.length;
  const edgeCount = topology.edgeSources.length;
  if (
    topology.edgeTargets.length !== edgeCount ||
    topology.edgeWeights.length !== edgeCount ||
    topology.polarities.length !== edgeCount
  ) {
    throw new RangeError('topology edge arrays must have the same length');
  }

  const positions = layoutTopology(nodeCount);
  const excitatory = parseHex(palette.accent);
  const inhibitory = parseHex(palette.secondary);
  const muted = parseHex(palette.muted);
  const line = parseHex(palette.line);
  const extent = edgeWeightExtent(topology.edgeWeights);
  const point = (node: number) => {
    const position = positions[node];
    if (!position) {
      throw new RangeError(`edge endpoint ${node} is outside the topology`);
    }
    return position;
  };

  const edges: StaticMeshEdge[] = [];
  for (let edge = 0; edge < edgeCount; edge += 1) {
    const source = point(topology.edgeSources[edge]);
    const target = point(topology.edgeTargets[edge]);
    const base = topology.polarities[edge] === 0 ? excitatory : inhibitory;
    const strength = edgeStrength(topology.edgeWeights[edge], extent);
    edges.push({
      x1: round(source.x),
      y1: round(-source.y),
      x2: round(target.x),
      y2: round(-target.y),
      stroke: toHex(mix(base, line, 1 - strength)),
    });
  }

  return {
    viewBox: `${-CAMERA_EXTENT} ${-CAMERA_EXTENT} ${CAMERA_EXTENT * 2} ${CAMERA_EXTENT * 2}`,
    nodes: positions.map((position, index) => ({
      id: Number(topology.nodeIds[index]),
      x: round(position.x),
      y: round(-position.y),
    })),
    edges,
    nodeFill: toHex(muted),
    nodeSize: NODE_SIZE_WORLD,
    edgeOpacity: EDGE_OPACITY,
  };
}
