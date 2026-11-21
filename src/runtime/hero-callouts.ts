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
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let lastMove = Number.NEGATIVE_INFINITY;

  const onSpikes = (event: Event) => {
    const neurons = (event as CustomEvent<{ neurons?: number[] }>).detail?.neurons ?? [];
    const now = performance.now();
    if (neurons.length === 0 || now - lastMove < (reduced?.matches ? HOLD_REDUCED_MS : HOLD_MS)) return;
    // The firing neuron nearest the label keeps the leader short.
    let best = -1;
    let bestDistance = Infinity;
    for (const neuron of neurons) {
      const node = nodes[neuron];
      if (!node) continue;
      const distance = (node[0] - labelX) ** 2 + (node[1] - labelY) ** 2;
      if (distance < bestDistance) {
        best = neuron;
        bestDistance = distance;
      }
    }
    if (best < 0) return;
    lastMove = now;
    const [x, y] = nodes[best];
    // Stop just short of the marker so the arrowhead sits on its ring.
    const dx = x - labelX;
    const dy = y - labelY;
    const length = Math.hypot(dx, dy) || 1;
    const back = 0.06 / length;
    leader.setAttribute('x2', String(x - dx * back));
    leader.setAttribute('y2', String(y - dy * back));
    sub.textContent = `n${best}, just fired`;
    group.dataset.active = 'true';
  };

  // Hide again whenever the run stops being live (paused, fallback).
  const observer = new MutationObserver(() => {
    if (root.dataset.mode !== 'live') delete group.dataset.active;
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-mode'] });
  root.addEventListener('demo-spikes', onSpikes);
  return () => {
    observer.disconnect();
    root.removeEventListener('demo-spikes', onSpikes);
  };
}
