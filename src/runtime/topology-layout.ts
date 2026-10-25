/**
 * Pure layout and colour rules for drawing the live `synaptic-wiring`
 * topology. The three.js renderer (`topology-renderer.ts`) and the static
 * drawing that the homepage hero paints before WebGL starts (or instead of it)
 * both read them here, so the static network and the first live frame line up:
 * same node positions, same camera framing, same edge colours.
 *
 * Nothing here depends on timing, device state, or the DOM.
 */

export interface NodeLayout {
  x: number;
  y: number;
}

/** Half the shorter side of the orthographic view, in world units. */
export const CAMERA_EXTENT = 1.35;
/** Neuron marker size in CSS pixels (`PointsMaterial.size`, no attenuation). */
export const NODE_SIZE_PX = 10;
/** Opacity of the edge lines. */
export const EDGE_OPACITY = 0.4;
/** A spike flash decays to zero in about this many seconds. */
export const SPIKE_FLASH_SECONDS = 0.3;
/** How far a firing neuron pulls its outgoing edges toward `--spike`. */
export const EDGE_FIRE_MIX = 0.85;

/**
 * Deterministic topology layout: nodes on a ring with a small index-keyed
 * radial jitter. Pure function of the node count, never of timing or device
 * state.
 */
export function layoutTopology(nodeCount: number): NodeLayout[] {
  const positions: NodeLayout[] = [];
  for (let node = 0; node < nodeCount; node += 1) {
    const angle = (2 * Math.PI * node) / nodeCount - Math.PI / 2;
    const jitter = ((node * 2654435761) % 97) / 97;
    const radius = 0.92 + jitter * 0.14;
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
  nodeSizePx: number;
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
 * The live renderer's first frame as plain SVG geometry: the same ring layout,
 * the same camera framing (`viewBox` with the default `xMidYMid meet` behaves
 * like the orthographic camera at any aspect ratio), and the same edge colours
 * (polarity colour mixed toward `--line` by weight). SVG's y axis points
 * down, so world y is negated. Node markers keep their resting `--muted`
 * colour, which is what the renderer shows before any membrane potential
 * arrives.
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
    nodeSizePx: NODE_SIZE_PX,
    edgeOpacity: EDGE_OPACITY,
  };
}
