import {
  createAdaptiveQuality,
  telemetryCadenceHz,
  telemetryCadenceMs,
  type AdaptiveQualityController,
  type AdaptiveQualityStats,
  type QualitySettings,
} from './adaptive-quality';
import { provideDemoSeams, type DemoSeams } from './demo-runtime';
import { createPointerTelemetry, createScriptedTelemetry } from './kinetic-telemetry';
import { createPerfProbe, perfProbeRequested, timed, type PerfProbe, type PerfSummary } from './perf-probe';
import { createSimulationChannel } from './simulation-channel';
import {
  LIVE_SPIKE_EVENT_PROVENANCE,
  createSpikeEventBuffer,
  type SpikeEventBuffer,
  type SpikePropagationEvent,
} from './spike-events';
import {
  createInputSourceHistory,
  registerLiveTelemetrySources,
  registerTelemetryCadenceCap,
} from './telemetry-entry';
import { createTopologyRendererSeam, type TopologyRendererSeam } from './topology-renderer';
import { createWasmSeam, type TelemetryFrame } from './wasm-session';
import type { NeuromorphicState } from './neuromorphic-adapter';

const rasterLevelClasses = [
  'spike-level-0',
  'spike-level-1',
  'spike-level-2',
  'spike-level-3',
  'spike-level-4',
  'spike-level-5',
  'spike-level-6',
  'spike-level-7',
  'spike-level-8',
  'spike-level-9',
  'spike-level-10',
] as const;

export function setHeroRasterLevel(cell: HTMLElement, count: number): void {
  const level = Math.min(Math.max(Math.floor(count), 0), rasterLevelClasses.length - 1);
  for (let index = 0; index < rasterLevelClasses.length; index += 1) {
    cell.classList.toggle(rasterLevelClasses[index], index === level);
  }
}

/** Snapshot-only homepage readout: it never invents counts or advances on its own. */
export function createHeroEncoderReadout(island: HTMLElement) {
  const query = <T extends Element>(selector: string): T | null =>
    typeof island.querySelector === 'function' ? island.querySelector<T>(selector) : null;
  const encoder = query<HTMLElement>('[data-readout-encoder]');
  const step = query<HTMLElement>('[data-readout-step]');
  const windowEl = query<HTMLElement>('[data-readout-window]');
  const total = query<HTMLElement>('[data-readout-total]');
  const restart = query<HTMLElement>('[data-readout-restart]');
  const cells = typeof island.querySelectorAll === 'function'
    ? Array.from(island.querySelectorAll<HTMLElement>('[data-raster-cell]'))
    : [];
  let encoderName = island.dataset.encoderMode ?? 'temporal';
  let lastStep = -1n;
  let windowCounts: number[] = [];
  let rasterCounts: number[] = [];
  let totalSpikes = 0;
  let hasSnapshot = false;

  const renderRaster = (counts: number[]) => {
    for (let index = 0; index < cells.length; index += 1) {
      setHeroRasterLevel(cells[index], counts[index] ?? 0);
    }
    const raster = query<HTMLElement>('[data-readout-raster]');
    if (raster) {
      const spikes = counts.reduce((sum, count) => sum + count, 0);
      const tickLabel = counts.length === 1 ? 'tick' : 'ticks';
      raster.setAttribute(
        'aria-label',
        `Recent network spike activity: ${counts.length === 0 ? 'no ticks recorded' : `${counts.length} recorded ${tickLabel}`}, ${spikes} spikes across the 20-tick raster`,
      );
    }
  };

  const reset = (name: string) => {
    encoderName = name;
    lastStep = -1n;
    hasSnapshot = false;
    windowCounts = [];
    rasterCounts = [];
    totalSpikes = 0;
    if (encoder) encoder.textContent = name;
    if (step) step.textContent = '0';
    if (windowEl) windowEl.textContent = '0';
    if (total) total.textContent = '0';
    if (restart) restart.textContent = 'restarted';
    island.dataset.encoderRestart = 'restarted';
    renderRaster([]);
  };

  const update = (state: NeuromorphicState) => {
    const newRun = hasSnapshot && (state.completedStep < lastStep || state.encoderName !== encoderName);
    if (newRun) reset(state.encoderName);
    hasSnapshot = true;
    lastStep = state.completedStep;

    const spikes = state.spikeNeurons.length;
    windowCounts = [...windowCounts, spikes].slice(-100);
    rasterCounts = [...rasterCounts, spikes].slice(-20);
    totalSpikes += spikes;

    if (encoder) encoder.textContent = state.encoderName;
    if (step) step.textContent = state.completedStep.toString();
    if (windowEl) windowEl.textContent = String(windowCounts.reduce((sum, count) => sum + count, 0));
    if (total) total.textContent = String(totalSpikes);
    renderRaster(rasterCounts);
  };

  return { update, reset };
}

/** Development-only inspector installed on `globalThis` by `astro dev`. */
export interface TelemetryInspector {
  latest: () => {
    sequence: string;
    source: TelemetryFrame['source'];
    encoderName: string;
    encodedSpikeCount: number;
    features: number[];
  } | null;
  trace: () => ReturnType<TelemetryFrame['trace']>;
}

function inspectorFor(frame: () => TelemetryFrame | null): TelemetryInspector {
  return {
    latest() {
      const current = frame();
      return current
        ? {
            sequence: current.sequence.toString(),
            source: current.source,
            encoderName: current.state.encoderName,
            encodedSpikeCount: current.state.encodedSpikeCount,
            features: Array.from(current.state.encoderFeatures),
          }
        : null;
    },
    trace: () => frame()?.trace() ?? null,
  };
}

/** Development-only spike-event inspector installed on `globalThis` by `astro dev`. */
export interface SpikeEventInspector {
  /** Buffer counters; `u64` steps are decimal strings. */
  stats: () => Record<string, string | number | null>;
  /** The newest buffered events (default 16), oldest first. */
  recent: (limit?: number) => Array<Record<string, string | number>>;
  /** The renderer's most recent frame, or `null` without a live session. */
  renderer: () => ReturnType<TopologyRendererSeam['inspect']>;
}

function serializeEvent(event: SpikePropagationEvent): Record<string, string | number> {
  return {
    provenance: event.provenance,
    emittedStep: event.emittedStep.toString(),
    arrivalStep: event.arrivalStep.toString(),
    sourceNeuron: event.sourceNeuron,
    targetNeuron: event.targetNeuron,
    edgeIndex: event.edgeIndex,
    delaySteps: event.delaySteps,
    polarity: event.polarity,
  };
}

/**
 * Performance inspector installed on `globalThis.__neuromorphicPerf` under
 * `astro dev` or with `?neuromorphic-perf` (see `perf-probe.ts`).
 */
export interface PerfInspector {
  summary: () => PerfSummary;
  reset: () => void;
  quality: () => AdaptiveQualityStats;
  /** Pin a quality level for measurement; `null` resumes adapting. */
  forceQuality: (level: number | null) => void;
  renderer: () => ReturnType<TopologyRendererSeam['inspect']>;
  /** Spike-event buffer counters; the `u64` step is a decimal string. */
  spikeEvents: () => Record<string, string | number | null>;
}

/** Mirror the presentation quality onto the island for DOM consumers (#9, #13). */
function reflectQuality(island: HTMLElement | undefined, settings: QualitySettings): void {
  if (!island) {
    return;
  }
  island.dataset.demoQuality = settings.name;
  island.dataset.demoTelemetryCadenceMs = String(telemetryCadenceMs(settings));
}

/** Same buffer, with `ingest` timed into the probe. */
function withIngestTiming(buffer: SpikeEventBuffer, probe: PerfProbe): SpikeEventBuffer {
  return { ...buffer, ingest: (snapshot) => timed(probe, 'spike-ingest', () => buffer.ingest(snapshot)) };
}

/** Build the development spike-event inspector (exported for tests). */
export function createSpikeEventInspector(
  buffer: SpikeEventBuffer,
  renderer: Pick<TopologyRendererSeam, 'inspect'>,
): SpikeEventInspector {
  return {
    stats() {
      const stats = buffer.stats();
      return { ...stats, latestStep: stats.latestStep?.toString() ?? null };
    },
    recent(limit = 16) {
      const events = buffer.events();
      // 0, negative, and NaN return none; anything above the size returns all.
      const count = Number.isNaN(limit) ? 0 : Math.max(0, Math.min(Math.floor(limit), events.length));
      return events.slice(events.length - count).map(serializeEvent);
    },
    renderer: () => renderer.inspect(),
  };
}

/**
 * Production seams for the live neuromorphic demo. One simulation channel per
 * island couples the WASM seam's snapshots to the renderer seam, keeping
 * rendering state separate from simulation state. `three` and the generated
 * adapter module load lazily inside the seams, so static readers never pay
 * for code they cannot run.
 *
 * Pointer/touch input over the island's render surface feeds the contract-5
 * telemetry path; without interaction the deterministic scripted path runs.
 * The island's `data-demo-input-source` reflects which source is active.
 *
 * Spike propagation events come only from this channel's WASM snapshots, so
 * the island's single spike-event buffer is tagged `live-wasm`; fixture
 * events never enter the shipped path.
 *
 * Presentation quality adapts per island (`adaptive-quality.ts`). The active
 * level and the telemetry refresh cadence are mirrored onto the island as
 * `data-demo-quality` and `data-demo-telemetry-cadence-ms`, and the renderer
 * seam exposes the controller's read side as `renderer.quality`. Quality
 * never reaches the WASM seam.
 */
export function createLiveDemoSeams(
  island?: HTMLElement,
  options: { quality?: AdaptiveQualityController; probe?: PerfProbe | null } = {},
): DemoSeams & { renderer: TopologyRendererSeam } {
  const channel = createSimulationChannel();
  const surface = island?.querySelector<HTMLElement>('[data-demo-surface]') ?? island;
  const probe =
    options.probe !== undefined
      ? options.probe
      : import.meta.env?.DEV || perfProbeRequested()
        ? createPerfProbe()
        : null;
  const quality = options.quality ?? createAdaptiveQuality();
  const spikeEvents = createSpikeEventBuffer({ provenance: LIVE_SPIKE_EVENT_PROVENANCE });
  const heroReadout = island ? createHeroEncoderReadout(island) : null;
  const renderer = createTopologyRendererSeam({
    channel,
    island,
    spikeEvents: probe ? withIngestTiming(spikeEvents, probe) : spikeEvents,
    quality,
    probe,
  });
  let latestFrame: TelemetryFrame | null = null;
  const inputSources = createInputSourceHistory();
  reflectQuality(island, quality.current());
  quality.subscribe((settings) => {
    reflectQuality(island, settings);
    probe?.increment('quality-changes');
  });

  if (island) {
    // The telemetry panel (#9) reads this island's live-wasm buffer and
    // snapshots; it never feeds or steps the simulation.
    registerLiveTelemetrySources(island, {
      spikeEvents,
      channel,
      inputSource: (step) => inputSources.at(step),
    });
    // Quality may only lower the panel's refresh rate (its own cadence and
    // the reduced-motion cap still apply); the panel picks up the current
    // cap when it is first opened and follows every level change.
    registerTelemetryCadenceCap(island, {
      maxHz: () => telemetryCadenceHz(quality.current()),
      subscribe: (listener) => quality.subscribe(listener),
    });
  }

  if (import.meta.env?.DEV) {
    (globalThis as { __neuromorphicTelemetry?: TelemetryInspector }).__neuromorphicTelemetry =
      inspectorFor(() => latestFrame);
    (globalThis as { __neuromorphicSpikeEvents?: SpikeEventInspector }).__neuromorphicSpikeEvents =
      createSpikeEventInspector(spikeEvents, renderer);
  }
  if (probe) {
    (globalThis as { __neuromorphicPerf?: PerfInspector }).__neuromorphicPerf = {
      summary: () => probe.summary(),
      reset: () => probe.reset(),
      quality: () => quality.stats(),
      forceQuality: (level) => quality.force(level),
      renderer: () => renderer.inspect(),
      spikeEvents: () => {
        const stats = spikeEvents.stats();
        return { ...stats, latestStep: stats.latestStep?.toString() ?? null };
      },
    };
  }

  return {
    renderer,
    wasm: createWasmSeam({
      channel,
      telemetry: () => (surface ? createPointerTelemetry(surface) : createScriptedTelemetry()),
      probe,
      onFrame(frame) {
        latestFrame = frame;
        heroReadout?.update(frame.state);
        inputSources.record(frame.state.completedStep, frame.source);
        if (island && island.dataset.demoInputSource !== frame.source) {
          island.dataset.demoInputSource = frame.source;
        }
      },
    }),
  };
}

export function provideLiveDemoSeams(): void {
  provideDemoSeams((island?: HTMLElement) => createLiveDemoSeams(island));
}
