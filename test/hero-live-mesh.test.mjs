// The homepage hero (GitHub #13 / Linear RM-1649): its static drawing is the
// live network, and its crate trail matches the adapter's pinned crates.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { loadTsModule, readSource } from './load-ts-module.mjs';

const layout = await loadTsModule('../src/runtime/topology-layout.ts');
const renderer = await loadTsModule('../src/runtime/topology-renderer.ts');
const adapterModule = await loadTsModule('../src/runtime/neuromorphic-adapter.ts');
const stimulus = await loadTsModule('../src/runtime/demo-stimulus.ts');
const wasmSession = await loadTsModule('../src/runtime/wasm-session.ts');
const runtimeData = await loadTsModule('../src/data/live-runtime.ts');

const wasmUrl = new URL('../public/wasm/neuromorphic-adapter/neuromorphic_adapter.js', import.meta.url);
const wasmBytes = readFileSync(new URL('../public/wasm/neuromorphic-adapter/neuromorphic_adapter_bg.wasm', import.meta.url));

async function liveAdapter() {
  // The committed homepage package through the shipped bridge and live options.
  return adapterModule.initNeuromorphicAdapter(
    async () => {
      const generated = await import(wasmUrl.href);
      return {
        default: () => generated.default({ module_or_path: wasmBytes }),
        WasmAdapter: generated.WasmAdapter,
      };
    },
    stimulus.DEMO_SEED,
    wasmSession.LIVE_ADAPTER_OPTIONS,
  );
}

test('the audited topology is exactly what the committed homepage package exports', async () => {
  const audited = adapterModule.auditedBrowserTopology();
  const adapter = await liveAdapter();
  try {
    adapter.input(1n, stimulus.scriptedTelemetry(1n));
    const state = adapter.step();
    assert.equal(state.topologyDigest, audited.digest);
    assert.deepEqual([...state.topologyNodeIds], [...audited.nodeIds]);
    assert.deepEqual([...state.topologyEdgeSources], [...audited.edgeSources]);
    assert.deepEqual([...state.topologyEdgeTargets], [...audited.edgeTargets]);
    assert.deepEqual([...state.topologyEdgeDelays], [...audited.edgeDelays]);
    assert.deepEqual([...state.topologyPolarities], [...audited.polarities]);
    assert.deepEqual([...state.topologyWeightBits], [...audited.weightBits]);
    assert.deepEqual(
      [...new Uint32Array(state.topologyEdgeWeights.slice().buffer)],
      [...audited.weightBits],
      'weights are the exact f32 values, not rounded copies',
    );
  } finally {
    adapter.dispose();
  }
});

test('the audited topology is returned as fresh copies', () => {
  const first = adapterModule.auditedBrowserTopology();
  first.edgeTargets[0] = 99;
  first.weightBits[0] = 0;
  first.edgeWeights[1] = 42;
  const second = adapterModule.auditedBrowserTopology();
  assert.notEqual(second.edgeTargets[0], 99);
  assert.notEqual(second.weightBits[0], 0);
  assert.notEqual(second.edgeWeights[1], 42);
  assert.equal(second.nodeIds.length, 64);
  assert.equal(second.edgeSources.length, 512);
});

test('the static drawing uses the renderer layout and camera framing', () => {
  assert.equal(renderer.layoutTopology, layout.layoutTopology, 'one layout implementation');
  const topology = adapterModule.auditedBrowserTopology();
  const mesh = layout.staticMeshGeometry(topology);
  const positions = layout.layoutTopology(64);

  assert.equal(mesh.viewBox, '-1.35 -1.35 2.7 2.7');
  assert.equal(mesh.nodeSize, layout.NODE_SIZE_WORLD, 'the node stroke is world (viewBox) units, so it scales with the stage');
  assert.equal(mesh.edgeOpacity, 0.4);
  assert.equal(mesh.nodes.length, 64);
  assert.equal(mesh.edges.length, 512);
  mesh.nodes.forEach((node, index) => {
    assert.equal(node.id, index);
    assert.ok(Math.abs(node.x - positions[index].x) < 1e-4);
    assert.ok(Math.abs(node.y + positions[index].y) < 1e-4, 'SVG y points down, world y points up');
  });
  mesh.edges.forEach((edge, index) => {
    const source = positions[topology.edgeSources[index]];
    const target = positions[topology.edgeTargets[index]];
    assert.ok(Math.abs(edge.x1 - source.x) < 1e-4 && Math.abs(edge.y1 + source.y) < 1e-4);
    assert.ok(Math.abs(edge.x2 - target.x) < 1e-4 && Math.abs(edge.y2 + target.y) < 1e-4);
    // Every node sits inside the frame, so nothing is clipped at any aspect.
    for (const value of [edge.x1, edge.y1, edge.x2, edge.y2]) {
      assert.ok(Math.abs(value) < layout.CAMERA_EXTENT);
    }
  });
});

test('the two-ring layout gives every synapse visible length and keeps nodes apart (RM-2355)', () => {
  // The goal of RM-2355: more neurons the eye can follow, on a layout where
  // pulses have visible length instead of skirting the rim. A single ring at
  // 64 nodes puts lattice neighbours 5.6° apart (0.11 world units, one and a
  // half marker diameters) and tangles (5,500 crossings); alternating rings
  // turn them into spokes.
  const topology = adapterModule.auditedBrowserTopology();
  const nodeCount = topology.nodeIds.length;
  const positions = layout.layoutTopology(nodeCount);
  const diameter = layout.NODE_SIZE_WORLD;
  assert.equal(nodeCount, 64);
  assert.ok(nodeCount >= 32, 'the hero shows at least 32 neurons');
  assert.ok(layout.LAYOUT_INNER_RADIUS < layout.LAYOUT_OUTER_RADIUS);

  // Two rings, nodes alternating, every node inside the camera frame with its marker.
  const radii = positions.map(({ x, y }) => Math.hypot(x, y));
  radii.forEach((radius, node) => {
    const ring = node % 2 === 0 ? layout.LAYOUT_INNER_RADIUS : layout.LAYOUT_OUTER_RADIUS;
    assert.ok(radius >= ring && radius <= ring + layout.LAYOUT_RADIUS_JITTER, `node ${node} sits on its ring`);
    assert.ok(radius + diameter / 2 < layout.CAMERA_EXTENT, `node ${node} stays inside the frame`);
  });
  // Nodes keep their index order around the rings, so the drawing reads as one circle of NeuronIds.
  positions.forEach(({ x, y }, node) => {
    const expected = (2 * Math.PI * node) / nodeCount - Math.PI / 2;
    assert.ok(Math.abs(Math.atan2(y, x) - expected) < 1e-9 || Math.abs(Math.abs(Math.atan2(y, x) - expected) - 2 * Math.PI) < 1e-9, `node ${node} angle`);
  });

  // Minimum node separation: at least 1.5 marker diameters.
  const separation = (a, b) => Math.hypot(positions[a].x - positions[b].x, positions[a].y - positions[b].y);
  let minimumSeparation = Infinity;
  for (let a = 0; a < nodeCount; a += 1) {
    for (let b = a + 1; b < nodeCount; b += 1) minimumSeparation = Math.min(minimumSeparation, separation(a, b));
  }
  assert.ok(minimumSeparation >= 1.5 * diameter, `nodes are ${minimumSeparation.toFixed(3)} apart at the closest (need ${(1.5 * diameter).toFixed(3)})`);

  // Edge lengths: the median synapse is at least 0.45 world units, no more
  // than 10% of synapses are shorter than two marker diameters, and none is
  // hidden under its own markers.
  const lengths = [...topology.edgeSources].map((source, edge) => separation(source, topology.edgeTargets[edge])).sort((left, right) => left - right);
  const median = lengths[Math.floor(lengths.length / 2)];
  assert.ok(median >= 0.45, `median edge length ${median.toFixed(3)}`);
  const short = lengths.filter((length) => length < 2 * diameter).length;
  assert.ok(short * 10 <= lengths.length, `${short} of ${lengths.length} synapses are shorter than two marker diameters`);
  assert.ok(lengths[0] > diameter, `the shortest synapse (${lengths[0].toFixed(3)}) clears its markers`);

  // Tangle: edge crossings stay under the single ring's count (about 5,500
  // at 64 nodes) rather than the 35,000 an angular stride produced.
  const orientation = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const crosses = (a, b, c, d) => orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
  let crossings = 0;
  for (let i = 0; i < topology.edgeSources.length; i += 1) {
    for (let j = i + 1; j < topology.edgeSources.length; j += 1) {
      const ends = [topology.edgeSources[i], topology.edgeTargets[i], topology.edgeSources[j], topology.edgeTargets[j]];
      if (new Set(ends).size < 4) continue;
      if (crosses(positions[ends[0]], positions[ends[1]], positions[ends[2]], positions[ends[3]])) crossings += 1;
    }
  }
  assert.ok(crossings < 5000, `${crossings} edge crossings`);

  // The layout is still a pure function of the count.
  assert.equal(layout.layoutTopology(16).length, 16);
  assert.deepEqual(layout.layoutTopology(0), []);
  // The copy says what is drawn.
  const island = readSource('../src/components/NeuromorphicDemo.astro');
  assert.match(island, /neurons on two rings/);
  assert.doesNotMatch(island, /neurons on a ring/);
});

test('afterglow fades exponentially to a floor: 0.8 s spike flash, 0.3 s landing glow', () => {
  assert.equal(layout.SPIKE_FLASH_SECONDS, 0.8);
  assert.equal(layout.LANDING_GLOW_SECONDS, 0.3);
  assert.equal(layout.AFTERGLOW_FLOOR, 0.02);
  assert.ok(layout.LANDING_GLOW_MIX > 0 && layout.LANDING_GLOW_MIX < 1, 'a landing glow never reads as a full spike flash');

  const flash = layout.SPIKE_FLASH_SECONDS;
  assert.equal(layout.afterglowDecay(1, 0, flash), 1);
  const half = layout.afterglowDecay(1, flash / 2, flash);
  assert.ok(Math.abs(half - Math.sqrt(layout.AFTERGLOW_FLOOR)) < 1e-9, 'exponential: half the time is the square root of the floor');
  assert.ok(layout.afterglowDecay(1, flash * 0.99, flash) > 0, 'still glowing just before the stated duration');
  // At exactly `flash` the curve sits on the floor (to rounding); just past it, it is gone.
  assert.ok(Math.abs(layout.afterglowDecay(1, flash, flash)) <= layout.AFTERGLOW_FLOOR + 1e-12);
  assert.equal(layout.afterglowDecay(1, flash * 1.001, flash), 0, 'gone past the stated duration');
  assert.equal(layout.afterglowDecay(layout.afterglowDecay(1, 0.3, flash), 0.51, flash), 0, 'frame by frame reaches the same end');
  // Chaining frames matches one long step (a property of the exponential).
  const chained = layout.afterglowDecay(layout.afterglowDecay(1, 0.1, flash), 0.2, flash);
  assert.ok(Math.abs(chained - layout.afterglowDecay(1, 0.3, flash)) < 1e-12);
  assert.equal(layout.afterglowDecay(0, 0.1, flash), 0);
  assert.equal(layout.afterglowDecay(1, -1, flash), 1, 'time never runs backwards into a brighter glow');
  assert.equal(layout.afterglowDecay(1, 0.1, 0), 0);
  assert.equal(layout.afterglowDecay(Number.NaN, 0.1, flash), 0);

  assert.equal(layout.landingGlow(-0.01), 0, 'nothing before the pulse lands');
  assert.equal(layout.landingGlow(0), 1, 'brightest at arrival');
  assert.ok(layout.landingGlow(0.1) > layout.landingGlow(0.2));
  assert.ok(layout.landingGlow(layout.LANDING_GLOW_SECONDS) <= layout.AFTERGLOW_FLOOR + 1e-12);
  assert.equal(layout.landingGlow(layout.LANDING_GLOW_SECONDS * 1.001), 0);
  assert.equal(layout.landingGlow(Number.NaN), 0);
});

test('static edge colours match three.js colour mixing in the live renderer', () => {
  const topology = adapterModule.auditedBrowserTopology();
  const mesh = layout.staticMeshGeometry(topology);
  const palette = layout.SITE_TOPOLOGY_PALETTE;
  const excitatory = new THREE.Color(palette.accent);
  const inhibitory = new THREE.Color(palette.secondary);
  const muted = new THREE.Color(palette.muted);
  const line = new THREE.Color(palette.line);
  const extent = layout.edgeWeightExtent(topology.edgeWeights);

  mesh.edges.forEach((edge, index) => {
    const base = topology.polarities[index] === 0 ? excitatory : inhibitory;
    const strength = layout.edgeStrength(topology.edgeWeights[index], extent);
    const expected = `#${base.clone().lerp(line, 1 - strength).getHexString()}`;
    assert.equal(edge.stroke, expected, `edge ${index}`);
  });
  assert.equal(mesh.nodeFill, `#${muted.getHexString()}`);
  assert.ok(mesh.edges.some((edge) => edge.stroke === palette.accent), 'the strongest excitatory edge is full --accent');
});

test('static drawing helpers reject inconsistent topologies and bad colours', () => {
  const topology = adapterModule.auditedBrowserTopology();
  assert.throws(
    () => layout.staticMeshGeometry({ ...topology, edgeTargets: topology.edgeTargets.slice(1) }),
    RangeError,
  );
  assert.throws(
    () => layout.staticMeshGeometry({ ...topology, edgeTargets: topology.edgeTargets.map(() => 99) }),
    /outside the topology/,
  );
  assert.throws(() => layout.staticMeshGeometry(topology, { ...layout.SITE_TOPOLOGY_PALETTE, line: 'black' }), RangeError);
  assert.equal(layout.edgeWeightExtent([]), 1);
  assert.equal(layout.edgeWeightExtent([0, -0.5, 0.25]), 0.5);
  assert.equal(layout.edgeStrength(0, 1), 0.15);
  assert.equal(layout.edgeStrength(-2, 1), 1);
});

test('markers and pulses scale with the stage instead of staying fixed pixels (RM-2354)', () => {
  const frame = layout.CAMERA_EXTENT * 2;
  const mesh = layout.staticMeshGeometry(adapterModule.auditedBrowserTopology());
  assert.equal(mesh.nodeSize, layout.NODE_SIZE_WORLD, 'the static node stroke is world (viewBox) units');

  // On a canvas whose shorter side is `px` wide, both the static SVG (viewBox
  // scaling) and the live renderer (worldPerPixel) draw a marker
  // NODE_SIZE_WORLD * px / frame CSS pixels across: the 402 px plate this
  // replaced keeps its ≈10 px dot, the ≥480 px one draws ≈13 px, and a phone
  // stage shrinks proportionally.
  const markerAt = (shorterSidePx) => (layout.NODE_SIZE_WORLD / frame) * shorterSidePx;
  const pulseAt = (shorterSidePx) => (renderer.PULSE_WIDTH_WORLD / frame) * shorterSidePx;
  assert.ok(markerAt(347.6) > 9 && markerAt(347.6) < 10, 'the old 402 px plate keeps its ~10 px dot');
  assert.ok(markerAt(347.6) < markerAt(453.4), 'a wider stage draws wider nodes');
  assert.ok(pulseAt(347.6) < pulseAt(453.4), 'and wider pulses');
  assert.ok(Math.abs(markerAt(453.4) / 453.4 - markerAt(159.2) / 159.2) < 1e-12, 'nodes scale on mobile too');
  assert.ok(Math.abs(pulseAt(453.4) / 453.4 - pulseAt(159.2) / 159.2) < 1e-12, 'pulses scale on mobile too');

  // The live renderer derives both from the canvas, never from fixed pixels:
  // nodes through worldPerPixel (PointsMaterial.size is CSS px under the
  // orthographic camera), pulses straight in world space.
  const rendererSource = readSource('../src/runtime/topology-renderer.ts');
  assert.match(rendererSource, /nodeMaterial\.size = \(NODE_SIZE_WORLD \/ worldPerPixel\) \* 1\.6/);
  assert.match(rendererSource, /const halfWidth = PULSE_WIDTH_WORLD \/ 2/);
  assert.doesNotMatch(rendererSource, /PULSE_WIDTH_PX/);
  assert.doesNotMatch(readSource('../src/runtime/topology-layout.ts'), /NODE_SIZE_PX/);

  // The static stroke keeps viewBox units (no non-scaling pin), so the first
  // live frame still lands on the drawing at every stage size.
  const heroStyles = readSource('../src/styles/hero.css');
  assert.match(heroStyles, /\.hero-mesh-edges line \{ vector-effect: non-scaling-stroke; \}/);
  assert.doesNotMatch(heroStyles, /\.hero-mesh-nodes[^}]*vector-effect/);
  assert.match(readSource('../src/components/NeuromorphicDemo.astro'), /stroke-width=\{mesh\.nodeSize\}/);
});

test('the build-time palettes match the stylesheet tokens in both colour schemes', () => {
  const styles = readSource('../src/styles/global.css');
  const light = styles.match(/^:root \{([\s\S]*?)\}/m);
  assert.ok(light, 'light token block');
  for (const [name, value] of Object.entries(layout.SITE_TOPOLOGY_PALETTE)) {
    assert.match(light[1], new RegExp(`--${name}:\\s*${value};`), `--${name}`);
  }
  const dark = styles.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\}/);
  assert.ok(dark, 'dark token block');
  for (const [name, value] of Object.entries(layout.SITE_TOPOLOGY_PALETTE_DARK)) {
    assert.match(dark[1], new RegExp(`--${name}:\\s*${value};`), `dark --${name}`);
  }
  // The dark drawing is the same geometry with the dark colours.
  const topology = adapterModule.auditedBrowserTopology();
  const lightMesh = layout.staticMeshGeometry(topology);
  const darkMesh = layout.staticMeshGeometry(topology, layout.SITE_TOPOLOGY_PALETTE_DARK);
  assert.deepEqual(darkMesh.nodes, lightMesh.nodes);
  assert.deepEqual(darkMesh.edges.map((edge) => [edge.x1, edge.y1, edge.x2, edge.y2]), lightMesh.edges.map((edge) => [edge.x1, edge.y1, edge.x2, edge.y2]));
  assert.ok(darkMesh.edges.some((edge) => edge.stroke === layout.SITE_TOPOLOGY_PALETTE_DARK.accent), 'the strongest excitatory edge is the dark --accent');
  assert.notEqual(darkMesh.nodeFill, lightMesh.nodeFill);
});

test('the visible legend sits under the stage and passes contrast in both schemes (RM-2354)', () => {
  const island = readSource('../src/components/NeuromorphicDemo.astro');
  const heroStyles = readSource('../src/styles/hero.css');
  const styles = readSource('../src/styles/global.css');

  // The three keys, as the caption's first row: directly under the stage on
  // desktop and mobile, beside it on tablet. No mode or scheme hides them.
  // The reduced-motion note (RM-2355) sits above them, hidden unless the
  // device asks for reduced motion.
  assert.match(island, /<figcaption class="hero-mesh-caption">\s*<p class="hero-mesh-motion-note">[^<]+<\/p>\s*<ul class="hero-mesh-legend" aria-label="What the colours in the drawing mean">/);
  for (const item of ['Neuron spike', 'Excitatory synapse', 'Inhibitory synapse']) {
    assert.match(island, new RegExp(`>${item}</li>`), item);
  }
  assert.match(heroStyles, /\.hero-mesh-legend-key \{[^}]*border: 1px solid var\(--muted\);[^}]*background: var\(--spike\);/);
  assert.match(heroStyles, /\.hero-mesh-legend-excitatory \{ background: var\(--accent\); \}/);
  assert.match(heroStyles, /\.hero-mesh-legend-inhibitory \{ background: var\(--secondary\); \}/);
  assert.match(heroStyles, /\.hero-mesh-legend li \{[^}]*color: var\(--ink\);/);

  // WCAG contrast per scheme: every key needs 3:1 against the page as a
  // graphic, from its fill or its --muted ring (light --secondary is below
  // 3:1 alone), and the labels need 4.5:1 as text in --ink.
  const luminance = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    const channel = (shift) => {
      const c = ((value >> shift) & 255) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  };
  const contrast = (a, b) => {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
  };
  const scheme = (block) =>
    Object.fromEntries([...block.matchAll(/--([\w-]+): (#(?:[0-9a-f]{6}));/g)].map((match) => [match[1], match[2]]));
  const schemes = [
    scheme(styles.match(/^:root \{([\s\S]*?)\}/m)[1]),
    scheme(styles.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\}/)[1]),
  ];
  for (const tokens of schemes) {
    assert.ok(contrast(tokens.ink, tokens.paper) >= 4.5, `legend labels pass text contrast (${contrast(tokens.ink, tokens.paper).toFixed(2)}:1)`);
    for (const token of ['spike', 'accent', 'secondary']) {
      const fill = contrast(tokens[token], tokens.paper);
      const ring = contrast(tokens.muted, tokens.paper);
      assert.ok(
        fill >= 3 || ring >= 3,
        `${token} key passes non-text contrast (fill ${fill.toFixed(2)}:1, ring ${ring.toFixed(2)}:1)`,
      );
    }
  }
});

test('the crate trail pins every layer exactly as the adapter manifest and lockfile do', () => {
  const manifest = readSource('../crates/neuromorphic-adapter/Cargo.toml');
  const lockfile = readSource('../crates/neuromorphic-adapter/Cargo.lock');
  const names = runtimeData.liveCrateLayers.map((layer) => layer.name);
  assert.deepEqual(names, ['kinetic-signals', 'axon-encoder', 'neuromod', 'synaptic-wiring'], 'pipeline order');

  for (const layer of runtimeData.liveCrateLayers) {
    // `name = { … }`, or the short form `name = "=x.y.z"`.
    const dependency = manifest.match(new RegExp(`^${layer.name} = (\\{[^}]*\\}|"[^"]*")$`, 'm'));
    assert.ok(dependency, `${layer.name} is a direct dependency`);
    const locked = lockfile.match(new RegExp(`\\[\\[package\\]\\]\\r?\\nname = "${layer.name}"\\r?\\nversion = "([^"]+)"\\r?\\nsource = "([^"]+)"`));
    assert.ok(locked, `${layer.name} is in Cargo.lock`);
    assert.equal(layer.version, locked[1], `${layer.name} version`);

    if (layer.source.kind === 'git') {
      assert.match(dependency[1], new RegExp(`git = "${layer.source.repository}\\.git", rev = "${layer.source.revision}"`));
      assert.equal(locked[2], `git+${layer.source.repository}.git?rev=${layer.source.revision}#${layer.source.revision}`);
      assert.equal(runtimeData.crateLayerHref(layer), `${layer.source.repository}/tree/${layer.source.revision}`);
      assert.equal(runtimeData.crateLayerPin(layer), `pinned commit ${layer.source.revision.slice(0, 7)} (${layer.version})`);
    } else {
      const exact = `"=${layer.version}"`;
      assert.ok(
        dependency[1] === exact || dependency[1].includes(`version = ${exact}`),
        `${layer.name} is pinned to =${layer.version}`,
      );
      assert.equal(locked[2], 'registry+https://github.com/rust-lang/crates.io-index');
      assert.equal(runtimeData.crateLayerHref(layer), `https://crates.io/crates/${layer.name}/${layer.version}`);
      assert.equal(runtimeData.crateLayerPin(layer), layer.version);
    }
  }
  assert.equal(
    runtimeData.ADAPTER_SOURCE_URL,
    'https://github.com/rmems/raulcardenasmontoya.me/tree/main/crates/neuromorphic-adapter',
  );
});
