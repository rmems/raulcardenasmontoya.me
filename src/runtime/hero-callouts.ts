/**
 * The journal hero's "spike event" callout (mockup r5): its leader points at
 * a neuron that really just fired, taken from the renderer's `demo-spikes`
 * events (the same spikes that flash the nodes). It only shows while the
 * simulation is live and has spiked; it re-targets at most every
 * {@link HOLD_MS} (slower under reduced motion) so the leader stays readable.
 */

const HOLD_MS = 1600;
const HOLD_REDUCED_MS = 5000;

export function bindHeroCallouts(root: HTMLElement): (() => void) | null {
  const svg = root.querySelector<SVGSVGElement>('[data-callouts]');
  const group = svg?.querySelector<SVGGElement>('[data-callout-spike]');
  const leader = svg?.querySelector<SVGLineElement>('[data-callout-spike-leader]');
  const sub = svg?.querySelector<SVGTextElement>('[data-callout-spike-sub]');
  if (!svg || !group || !leader || !sub) return null;
  let nodes: [number, number][] = [];
  try {
    nodes = JSON.parse(svg.dataset.calloutNodes ?? '[]');
  } catch {
    return null;
  }
  const labelX = Number(leader.getAttribute('x1'));
  const labelY = Number(leader.getAttribute('y1'));
  // `matchMedia` is a browser-only global; this island only runs hydrated.
  const reduced = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  let lastMove = Number.NEGATIVE_INFINITY;

  // Nearest firing neuron to the label, or null when no reported index
  // resolves to a node. Neurons arrive as indices into `nodes`.
  const nearest = (neurons: readonly number[]): { neuron: number; node: [number, number] } | null => {
    let best: { neuron: number; node: [number, number]; distance: number } | null = null;
    for (const neuron of neurons) {
      if (!Number.isInteger(neuron) || neuron < 0) continue;
      const node = nodes.at(neuron);
      if (!node) continue;
      const distance = (node[0] - labelX) ** 2 + (node[1] - labelY) ** 2;
      if (!best || distance < best.distance) best = { neuron, node, distance };
    }
    return best;
  };

  // The callout clears itself after its hold interval, so "just fired" never
  // outlives the spike it names when the run stays live without new spikes.
  let clearTimer: ReturnType<typeof setTimeout> | null = null;
  const clearCallout = () => {
    if (clearTimer !== null) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    delete group.dataset.active;
  };
  const pokeCallout = () => {
    if (clearTimer !== null) clearTimeout(clearTimer);
    clearTimer = setTimeout(clearCallout, reduced.matches ? HOLD_REDUCED_MS : HOLD_MS);
  };

  const onSpikes = (event: Event) => {
    // Listeners also receive plain Events, whose `detail` is undefined.
    const neurons = (event as CustomEvent<{ neurons?: number[] } | undefined>).detail?.neurons ?? [];
    if (neurons.length === 0) return;
    // Any spike activity keeps a visible callout alive: clearing only on the
    // re-target gate would blink it off every hold interval during a live run
    // with steady spikes (devin BUG on #187). It hides once spikes stop, the
    // mode changes, or the island tears down.
    pokeCallout();
    const now = performance.now();
    if (now - lastMove < (reduced.matches ? HOLD_REDUCED_MS : HOLD_MS)) return;
    // The firing neuron nearest the label keeps the leader short.
    const hit = nearest(neurons);
    if (!hit) return;
    lastMove = now;
    const [x, y] = hit.node;
    // Stop just short of the marker so the arrowhead sits on its ring.
    const dx = x - labelX;
    const dy = y - labelY;
    const length = Math.hypot(dx, dy) || 1;
    const back = 0.06 / length;
    leader.setAttribute('x2', String(x - dx * back));
    leader.setAttribute('y2', String(y - dy * back));
    sub.textContent = `n${hit.neuron}, just fired`;
    group.dataset.active = 'true';
  };

  // Hide again whenever the run stops being live (paused, fallback).
  const observer = new MutationObserver(() => {
    if (root.dataset.mode !== 'live') clearCallout();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-mode'] });
  root.addEventListener('demo-spikes', onSpikes);
  return () => {
    clearCallout();
    observer.disconnect();
    root.removeEventListener('demo-spikes', onSpikes);
  };
}
